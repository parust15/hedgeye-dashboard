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

// Module-level cache of fetched 10-day histories, keyed by ticker. The cache
// is intentionally process-lifetime — collapsing and re-expanding the same
// card shouldn't trigger a fresh round-trip. Cleared on page reload, which
// is sufficient since signal_date data is daily and stable.
const chartHistoryCache = new Map()

function SolidSwatch({ color }) {
  return <span className="legend-swatch solid" style={{ background: color }} />
}

function HatchSwatch({ stroke }) {
  return (
    <svg className="legend-swatch" width="14" height="14" aria-hidden="true">
      <rect width="14" height="14" fill="rgba(255,255,255,0.04)" />
      <path
        d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2 M0,14 l14,-14"
        stroke={stroke}
        strokeWidth="1.5"
      />
    </svg>
  )
}

function ChartLegend() {
  return (
    <div className="chart-legend">
      <span className="legend-item">
        <SolidSwatch color="rgba(34,197,94,0.6)" />
        <span className="legend-label">HH/HL bullish</span>
      </span>
      <span className="legend-item">
        <HatchSwatch stroke="rgba(34,197,94,0.85)" />
        <span className="legend-label">LH/HL compression</span>
      </span>
      <span className="legend-item">
        <SolidSwatch color="rgba(239,68,68,0.6)" />
        <span className="legend-label">LH/LL bearish</span>
      </span>
      <span className="legend-item">
        <HatchSwatch stroke="rgba(239,68,68,0.85)" />
        <span className="legend-label">HH/LL expansion</span>
      </span>
      <span className="legend-item">
        <SolidSwatch color="rgba(156,163,175,0.45)" />
        <span className="legend-label">unchanged</span>
      </span>
    </div>
  )
}

// Resolve the close-line label for a given data point. Historical points
// are always "Close" (each day's settle). Today's terminal point reads from
// the live state: Live / Close / Last, with "Prev close" only as the
// fallback when there's no live data at all.
function closeLineLabel(isToday, liveState) {
  if (!isToday) return 'Close'
  if (liveState === 'live') return 'Live'
  if (liveState === 'closed') return 'Close'
  if (liveState === 'stale') return 'Last'
  return 'Prev close'
}

// Pull the "HH:mm ET" suffix out of priceDisplay.timeLabel for annotation
// alongside live/stale values. Returns '' if no time portion is present.
function extractEtTime(timeLabel) {
  if (!timeLabel) return ''
  const m = timeLabel.match(/(\d{1,2}:\d{2}\s*ET)/)
  return m ? m[1] : ''
}

// Custom recharts tooltip content. recharts passes { active, payload, label }
// where payload is an array of points at the hover position. We render one
// row per data series with dynamic label/value styling.
function ChartTooltipContent({ active, payload, label, lastDate, display }) {
  if (!active || !payload?.length) return null
  const isToday = label === lastDate

  return (
    <div className="chart-tooltip-custom">
      <div className="chart-tooltip-head">{label}</div>
      {payload.map((p) => {
        let name
        let value = formatNumber(p.value)
        if (p.dataKey === 'buy') {
          name = 'LRR (buy)'
        } else if (p.dataKey === 'sell') {
          name = 'TRR (sell)'
        } else {
          // dataKey === 'close' — the dynamic-label line
          name = closeLineLabel(isToday, display?.state)
          if (isToday && (display?.state === 'live' || display?.state === 'stale')) {
            const time = extractEtTime(display.timeLabel)
            if (time) value = `${value} · ${time}`
          }
        }
        return (
          <div key={p.dataKey} className="chart-tooltip-row">
            <span>{name}</span>
            <span>{value}</span>
          </div>
        )
      })}
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
            <pattern id="pattern-lhhl" patternUnits="userSpaceOnUse" width="8" height="8">
              <path
                d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2"
                stroke="rgba(34,197,94,0.55)"
                strokeWidth="1.5"
              />
            </pattern>
            <pattern id="pattern-hhll" patternUnits="userSpaceOnUse" width="8" height="8">
              <path
                d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2"
                stroke="rgba(239,68,68,0.55)"
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
                lastDate={data[data.length - 1]?.date}
                display={display}
              />
            }
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
