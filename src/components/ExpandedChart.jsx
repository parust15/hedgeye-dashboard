import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { CHART_COLORS, rangeFill } from '../lib/chartTheme'
import { formatNumber } from '../lib/format'
import { RangeStateBadge } from './RangeStateBadge'
import { RANGE_STATE_TOKEN, RANGE_STATES } from '../lib/rangeState'

// Module-level cache of fetched 10-day histories, keyed by ticker. The cache
// is intentionally process-lifetime — collapsing and re-expanding the same
// card shouldn't trigger a fresh round-trip. Cleared on page reload, which
// is sufficient since signal_date data is daily and stable.
const chartHistoryCache = new Map()

// Chart legend — uses RangeStateBadge so the badge color, label text,
// and ordering all derive from RANGE_STATE_TOKEN. Replaces the prior
// hand-built SolidSwatch + HatchSwatch + legend-label set which had
// two visible drifts: LH/HL compression was painted green (should be
// blue) and HH/LL expansion was painted red (should be amber).
function ChartLegend() {
  return (
    <div className="chart-legend">
      {RANGE_STATES.map((state) => (
        <span key={state} className="legend-item">
          <RangeStateBadge state={state} size="sm" />
          <span className="legend-label">{RANGE_STATE_TOKEN[state].label}</span>
        </span>
      ))}
    </div>
  )
}

// Pull the "HH:mm ET" suffix out of priceDisplay.timeLabel for annotation
// alongside live/stale values. Returns '' if no time portion is present.
function extractEtTime(timeLabel) {
  if (!timeLabel) return ''
  const m = timeLabel.match(/(\d{1,2}:\d{2}\s*ET)/)
  return m ? m[1] : ''
}

// Custom recharts tooltip content. Mirrors the range-bar tooltip styling
// from SignalCard's RangeBarTooltip — same dark card, same row layout.
// Adds Prev close + Position rows that the range-bar tooltip has but the
// previous chart tooltip didn't.
//
// "Close" row label varies by point + live state per spec:
//   - Terminal point + state=live  → "Live price", value = live price
//   - Terminal point + state=closed → "Close", value = current price
//   - Terminal point + state=stale → "Last", value = current price (dim row)
//   - Terminal point + no live data → "Prev close", value = prev close
//   - Historical points → "Close", value = the day's plotted close
function ChartTooltipContent({ active, payload, label, ticker, lastDate, display }) {
  if (!active || !payload?.length) return null
  const isToday = label === lastDate

  const buyEntry = payload.find((p) => p.dataKey === 'buy')
  const sellEntry = payload.find((p) => p.dataKey === 'sell')
  const closeEntry = payload.find((p) => p.dataKey === 'close')
  const buy = buyEntry?.value ?? null
  const sell = sellEntry?.value ?? null
  // The chart's `close` series is mapped from DB prev_close at fetch time
  // — so the value plotted IS the row's prev_close. For terminal point the
  // useLiveEndpoint swap (in ExpandedChart) has already replaced this with
  // the live price when we have one. We re-derive the "true prev close"
  // by reading the DB-mapped value directly via the payload's payload row.
  const chartClose = closeEntry?.value ?? null
  // Original DB prev_close — preserved in the data row even when the
  // terminal `close` was swapped to live for the chart line.
  const dbPrevClose = closeEntry?.payload?.prev_close ?? chartClose

  // Decide the close-row label + value per spec.
  let closeLabel = 'Close'
  let closeValue = chartClose
  let staleClass = ''
  if (isToday) {
    const state = display?.state
    if (state === 'live') {
      closeLabel = 'Live price'
      closeValue = Number.isFinite(display?.price) ? display.price : chartClose
    } else if (state === 'closed') {
      closeLabel = 'Close'
      closeValue = Number.isFinite(display?.price) ? display.price : chartClose
    } else if (state === 'stale') {
      closeLabel = 'Last'
      closeValue = Number.isFinite(display?.price) ? display.price : chartClose
      staleClass = ' stale'
    } else {
      closeLabel = 'Prev close'
      closeValue = chartClose
    }
  }

  // Append HH:mm ET suffix to live/stale terminal values, matching the
  // bar tooltip's behaviour.
  let closeValueText = formatNumber(closeValue)
  if (isToday && (display?.state === 'live' || display?.state === 'stale')) {
    const time = extractEtTime(display?.timeLabel)
    if (time) closeValueText = `${closeValueText} · ${time}`
  }

  // Position % = (close - buy) / (sell - buy), clamped to [0, 1], rounded.
  let positionText = '—'
  if (
    Number.isFinite(buy) &&
    Number.isFinite(sell) &&
    Number.isFinite(closeValue) &&
    sell !== buy
  ) {
    const raw = (closeValue - buy) / (sell - buy)
    const pct = Math.round(Math.max(0, Math.min(1, raw)) * 100)
    positionText = `${pct}% of range`
  }

  return (
    <div className="chart-tooltip-card">
      <div className="range-tooltip-head">
        {ticker}
        {label ? ` · ${label}` : ''}
      </div>
      <div className="range-tooltip-row buy">
        <span>LRR (buy)</span>
        <span>{formatNumber(buy)}</span>
      </div>
      <div className={`range-tooltip-row${staleClass}`}>
        <span>{closeLabel}</span>
        <span>{closeValueText}</span>
      </div>
      <div className="range-tooltip-row">
        <span>Prev close</span>
        <span>{formatNumber(dbPrevClose)}</span>
      </div>
      <div className="range-tooltip-row sell">
        <span>TRR (sell)</span>
        <span>{formatNumber(sell)}</span>
      </div>
      <div className="range-tooltip-row">
        <span>Position</span>
        <span>{positionText}</span>
      </div>
    </div>
  )
}

export function ExpandedChart({ ticker, display }) {
  const [data, setData] = useState(() => chartHistoryCache.get(ticker) ?? null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const cached = chartHistoryCache.get(ticker)
    if (cached) {
      setData(cached)
      return
    }
    let cancelled = false
    async function load() {
      // Raw `hedgeye_signals` is still RLS-blocked from the anon role, so we
      // explicitly use the view filtered by ticker. Same columns.
      const { data, error } = await supabase
        .from('hedgeye_signals_v')
        .select('signal_date,buy_trade,sell_trade,prev_close,range_state')
        .eq('ticker', ticker)
        .order('signal_date', { ascending: false })
        .limit(10)
      if (cancelled) return
      if (error) {
        console.error('ExpandedChart load failed:', error)
        setError(true)
        return
      }
      const ordered = [...(data ?? [])].reverse().map((r) => ({
        date: r.signal_date,
        buy: Number(r.buy_trade),
        sell: Number(r.sell_trade),
        close: Number(r.prev_close),
        // Snapshot of the DB prev_close so the chart tooltip's "Prev close"
        // row reads the real prior-day settle even after the terminal
        // `close` gets swapped with the live price.
        prev_close: Number(r.prev_close),
        state: r.range_state,
      }))
      chartHistoryCache.set(ticker, ordered)
      setData(ordered)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [ticker])

  if (error) return <div className="chart-state error">Could not load chart history.</div>
  if (data === null) return <div className="chart-state">Loading chart…</div>
  if (data.length === 0) return <div className="chart-state">No history for {ticker}.</div>

  // For the close-path line: if live/closed and we have a price, swap the
  // terminal point's close value so the dotted line ends at the live price.
  const liveState = display?.state
  const livePrice = display?.price
  const useLiveEndpoint =
    (liveState === 'live' || liveState === 'closed') && Number.isFinite(livePrice)

  const lastIdx = data.length - 1
  const closeData = useLiveEndpoint
    ? data.map((d, i) => (i === lastIdx ? { ...d, close: livePrice } : d))
    : data

  const renderCloseDot = (props) => {
    const { cx, cy, index, key } = props
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return <g key={key} />
    if (index !== lastIdx) {
      return <circle key={key} cx={cx} cy={cy} r={2} fill={CHART_COLORS.textStrong} />
    }
    if (liveState === 'live') {
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={8}
          fill={CHART_COLORS.buy}
          className="pulse-dot-svg"
        />
      )
    }
    if (liveState === 'closed') {
      return <circle key={key} cx={cx} cy={cy} r={6} fill="#ffffff" />
    }
    return <circle key={key} cx={cx} cy={cy} r={2} fill={CHART_COLORS.textStrong} />
  }

  return (
    <div className="chart-wrap">
      <div className="chart-meta">Last {data.length} sessions · per-day range state</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={closeData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <defs>
            {/* Pattern strokes use the canonical token colors:
                LH/HL (compression) → BLUE rgba(96,165,250)
                HH/LL (expansion)   → AMBER rgba(245,158,11)
                Previously these were inverted (compression used bull
                green; expansion used bear red), which the chartTheme
                rangeFill() rewrite also addresses by switching the
                ReferenceArea fills to solid token-derived rgba. The
                pattern defs are kept here so any future caller that
                wants the striped look uses the correct base color. */}
            <pattern id="pattern-lhhl" patternUnits="userSpaceOnUse" width="8" height="8">
              <path
                d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2"
                stroke="rgba(96,165,250,0.55)"
                strokeWidth="1.5"
              />
            </pattern>
            <pattern id="pattern-hhll" patternUnits="userSpaceOnUse" width="8" height="8">
              <path
                d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2"
                stroke="rgba(245,158,11,0.55)"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: CHART_COLORS.axisTick, fontSize: 11 }}
            tickFormatter={(d) => d.slice(5)}
            stroke={CHART_COLORS.axis}
          />
          <YAxis
            domain={['dataMin', 'dataMax']}
            tick={{ fill: CHART_COLORS.axisTick, fontSize: 11 }}
            stroke={CHART_COLORS.axis}
            width={48}
            tickFormatter={(n) => formatNumber(n)}
          />
          <Tooltip
            content={
              <ChartTooltipContent
                ticker={ticker}
                lastDate={data[data.length - 1]?.date}
                display={display}
              />
            }
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ outline: 'none', zIndex: 5 }}
          />
          {data.slice(0, -1).map((d, i) => (
            <ReferenceArea
              key={`band-${d.date}`}
              x1={d.date}
              x2={data[i + 1].date}
              fill={rangeFill(data[i + 1].state)}
              fillOpacity={1}
              stroke="none"
            />
          ))}
          <Line
            type="monotone"
            dataKey="sell"
            name="sell"
            stroke={CHART_COLORS.sell}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="buy"
            name="buy"
            stroke={CHART_COLORS.buy}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="close"
            name="close"
            stroke={CHART_COLORS.textStrong}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={renderCloseDot}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend />
    </div>
  )
}
