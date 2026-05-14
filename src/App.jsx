import { useEffect, useMemo, useState } from 'react'
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
import { supabase } from './lib/supabase'
import { useMarketState, formatNextChange } from './lib/marketState'
import { useLivePrices } from './lib/livePrices'
import { getPriceDisplay } from './lib/priceDisplay'
import './App.css'

const NEAR_BUY = 0.20
const NEAR_SELL = 0.80
const LIVE_NEAR_BUY = 0.05
const LIVE_NEAR_SELL = 0.95
const LONG_SETUP_PCT = 0.20
const SHORT_SETUP_PCT = 0.80

const CATEGORY_LABELS = {
  us_sectors: 'Sectors',
  fx: 'FX',
  vol: 'Vol',
}
function labelFor(category) {
  if (!category) return 'Uncategorized'
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]
  return category.charAt(0).toUpperCase() + category.slice(1)
}

const RANGE_FILL = {
  'HH/HL': 'rgba(34, 197, 94, 0.28)',
  'LH/LL': 'rgba(239, 68, 68, 0.28)',
  'LH/HL': 'url(#pattern-lhhl)',
  'HH/LL': 'url(#pattern-hhll)',
  unchanged: 'rgba(156, 163, 175, 0.12)',
}
function rangeFill(state) {
  if (state in RANGE_FILL) return RANGE_FILL[state]
  return RANGE_FILL.unchanged
}

function trendClass(trend) {
  if (trend === 'BULLISH') return 'trend bullish'
  if (trend === 'BEARISH') return 'trend bearish'
  return 'trend neutral'
}

function fmt(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatPrice(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function rangePct(row) {
  const buy = Number(row.buy_trade)
  const sell = Number(row.sell_trade)
  const close = Number(row.prev_close)
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || !Number.isFinite(close)) return null
  const span = sell - buy
  if (span === 0) return null
  return (close - buy) / span
}

// Resolve the pct used by setup logic: live if available, else prev-close.
function effectivePct(row, display) {
  if (display && display.livePct !== null && display.livePct !== undefined) return display.livePct
  return rangePct(row)
}

function getSetup(row, display) {
  const pct = effectivePct(row, display)
  if (pct === null) return null
  if (row.trend === 'BULLISH' && pct < LONG_SETUP_PCT) return 'LONG'
  if (row.trend === 'BEARISH' && pct > SHORT_SETUP_PCT) return 'SHORT'
  return null
}

function PositionBar({ markerPct, ghostPct, zone }) {
  if (markerPct === null || markerPct === undefined) {
    return <div className="posbar disabled" aria-hidden="true" />
  }
  const clamped = Math.max(0, Math.min(1, markerPct))
  const ghost =
    ghostPct !== null && ghostPct !== undefined
      ? Math.max(0, Math.min(1, ghostPct))
      : null
  return (
    <div className={`posbar ${zone ?? 'mid'}`}>
      <div className="posbar-track" />
      {ghost !== null && (
        <div
          className="posbar-ghost"
          style={{ left: `${ghost * 100}%` }}
          aria-hidden="true"
        />
      )}
      <div
        className="posbar-marker"
        style={{ left: `${clamped * 100}%` }}
        aria-label={`Position ${(clamped * 100).toFixed(0)}% of range`}
      />
    </div>
  )
}

function TrendChangeBadge({ change }) {
  if (!change) return null
  const to = change.to_trend
  if (to === 'BULLISH') return <span className="flip flip-bull">↑ FLIPPED BULLISH</span>
  if (to === 'BEARISH') return <span className="flip flip-bear">↓ FLIPPED BEARISH</span>
  if (to === 'NEUTRAL') return <span className="flip flip-neutral">◆ WENT NEUTRAL</span>
  return <span className="flip flip-neutral">◆ {to}</span>
}

function SetupBadge({ setup }) {
  if (setup === 'LONG') return <span className="setup setup-long">⚡ LONG SETUP</span>
  if (setup === 'SHORT') return <span className="setup setup-short">🔻 SHORT SETUP</span>
  return null
}

function LivePriceBlock({ display }) {
  if (!display || display.state === 'none') return null
  const cls = `price-block price-${display.state}`
  return (
    <div className={cls} aria-label={`Price ${display.timeLabel}`}>
      {display.state === 'live' && <span className="pulse-dot" aria-hidden="true" />}
      <span className="price-value">{formatPrice(display.price)}</span>
      <span className="price-sep">·</span>
      <span className="price-time">{display.timeLabel}</span>
    </div>
  )
}

function MarketStatePill({ market }) {
  const open = market.isOpen
  const title = formatNextChange(market)
  return (
    <span
      className={`market-pill ${open ? 'market-open' : 'market-closed'}`}
      title={title}
      aria-label={open ? 'Market open' : 'Market closed'}
    >
      <span className="market-dot" aria-hidden="true" />
      {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
    </span>
  )
}

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

function ExpandedChart({ ticker, display }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
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
        setError(error.message)
        return
      }
      const ordered = [...(data ?? [])].reverse().map((r) => ({
        date: r.signal_date,
        buy: Number(r.buy_trade),
        sell: Number(r.sell_trade),
        close: Number(r.prev_close),
        state: r.range_state,
      }))
      setData(ordered)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [ticker])

  if (error) return <div className="chart-state error">Chart error: {error}</div>
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
      return <circle key={key} cx={cx} cy={cy} r={2} fill="#f3f5fa" />
    }
    if (liveState === 'live') {
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={8}
          fill="#22c55e"
          className="pulse-dot-svg"
        />
      )
    }
    if (liveState === 'closed') {
      return <circle key={key} cx={cx} cy={cy} r={6} fill="#ffffff" />
    }
    return <circle key={key} cx={cx} cy={cy} r={2} fill="#f3f5fa" />
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
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#8b93a6', fontSize: 11 }}
            tickFormatter={(d) => d.slice(5)}
            stroke="#262b38"
          />
          <YAxis
            domain={['dataMin', 'dataMax']}
            tick={{ fill: '#8b93a6', fontSize: 11 }}
            stroke="#262b38"
            width={48}
            tickFormatter={(n) => fmt(n)}
          />
          <Tooltip
            contentStyle={{
              background: '#14171f',
              border: '1px solid #364056',
              borderRadius: 8,
              color: '#f3f5fa',
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const label = name === 'buy' ? 'LRR (buy)' : name === 'sell' ? 'TRR (sell)' : 'Prev close'
              return [fmt(value), label]
            }}
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
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="buy"
            name="buy"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="close"
            name="close"
            stroke="#f3f5fa"
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

function WidthDeltaPct({ row }) {
  if (row.prev_trr === null || row.prev_trr === undefined) return null
  if (row.prev_lrr === null || row.prev_lrr === undefined) return null
  const wd = Number(row.width_delta)
  const prevTrr = Number(row.prev_trr)
  const prevLrr = Number(row.prev_lrr)
  if (!Number.isFinite(wd) || !Number.isFinite(prevTrr) || !Number.isFinite(prevLrr)) return null
  const prevWidth = prevTrr - prevLrr
  if (prevWidth === 0) return null
  const pct = (wd / prevWidth) * 100
  const rounded = Math.abs(pct).toFixed(1)
  if (rounded === '0.0') return null
  const sign = pct > 0 ? '+' : '−'
  const cls = pct > 0 ? 'width-pct widening' : 'width-pct narrowing'
  return <span className={cls}>{sign}{rounded}%</span>
}

function SignalCard({ row, change, setup, display, expanded, onToggle }) {
  const prevPct = rangePct(row)
  const useLive =
    display &&
    (display.state === 'live' || display.state === 'closed') &&
    display.livePct !== null &&
    display.livePct !== undefined

  // Marker drives off live pct when live/closed; otherwise prev-close pct.
  const markerPct = useLive ? display.livePct : prevPct
  // Ghost tick only shown in live/closed states.
  const ghostPct = useLive ? prevPct : null
  // Zone label uses live thresholds (0.05/0.95) in live/closed, else fallback (0.20/0.80).
  let zoneLabel = null
  let zone = 'mid'
  if (markerPct !== null && markerPct !== undefined) {
    const lo = useLive ? LIVE_NEAR_BUY : NEAR_BUY
    const hi = useLive ? LIVE_NEAR_SELL : NEAR_SELL
    if (markerPct < lo) {
      zoneLabel = 'Near buy'
      zone = 'near-buy'
    } else if (markerPct > hi) {
      zoneLabel = 'Near sell'
      zone = 'near-sell'
    }
  }

  const cardClasses = [
    'card',
    expanded ? 'expanded' : '',
    change ? 'flipped' : '',
    setup ? `has-setup setup-${setup.toLowerCase()}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={cardClasses}
      onClick={() => onToggle(row.ticker)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(row.ticker)
        }
      }}
    >
      <header className="card-head">
        <div className="card-id">
          <div className="ticker">{row.ticker}</div>
          {row.display_name || row.name ? (
            <div className="name">{row.display_name || row.name}</div>
          ) : null}
        </div>
        <LivePriceBlock display={display} />
        <span className={trendClass(row.trend)}>{row.trend ?? '—'}</span>
      </header>

      {(setup || change) && (
        <div className="badge-row">
          <SetupBadge setup={setup} />
          <TrendChangeBadge change={change} />
        </div>
      )}

      <dl className="grid">
        <div>
          <dt>Buy</dt>
          <dd className="buy">{fmt(row.buy_trade)}</dd>
        </div>
        <div>
          <dt>Sell</dt>
          <dd className="sell">{fmt(row.sell_trade)}</dd>
        </div>
        <div>
          <dt>Prev Close</dt>
          <dd>{fmt(row.prev_close)}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd className="range-state">
            {row.range_state ?? '—'}
            <WidthDeltaPct row={row} />
          </dd>
        </div>
      </dl>

      <div className="posbar-section">
        <PositionBar markerPct={markerPct} ghostPct={ghostPct} zone={zone} />
        <div className="posbar-labels">
          <span className="posbar-end buy">{fmt(row.buy_trade)}</span>
          {zoneLabel ? (
            <span className={`zone-tag zone-${zone === 'near-buy' ? 'buy' : 'sell'}`}>
              {zoneLabel}
            </span>
          ) : (
            <span />
          )}
          <span className="posbar-end sell">{fmt(row.sell_trade)}</span>
        </div>
      </div>

      {expanded && (
        <div className="chart-panel" onClick={(e) => e.stopPropagation()}>
          <ExpandedChart ticker={row.ticker} display={display} />
        </div>
      )}
    </article>
  )
}

function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function App() {
  const [rows, setRows] = useState([])
  const [changes, setChanges] = useState({})
  const [signalDate, setSignalDate] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [view, setView] = useState('all') // 'all' | 'setups'
  const [active, setActive] = useState('All')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  const market = useMarketState()
  const livePrices = useLivePrices(market.isOpen)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setError(null)

      const latest = await supabase
        .from('hedgeye_signals_v')
        .select('signal_date')
        .order('signal_date', { ascending: false })
        .limit(1)

      if (latest.error) {
        if (!cancelled) {
          setError(latest.error.message)
          setStatus('error')
        }
        return
      }
      const date = latest.data?.[0]?.signal_date
      if (!date) {
        if (!cancelled) {
          setRows([])
          setStatus('ready')
        }
        return
      }

      const [signalsRes, changesRes, parsedRes] = await Promise.all([
        supabase
          .from('hedgeye_signals_v')
          .select(
            'ticker,name,display_name,trend,buy_trade,sell_trade,prev_close,range_state,category,signal_date,width_delta,prev_trr,prev_lrr'
          )
          .eq('signal_date', date),
        supabase
          .from('hedgeye_trend_changes_v')
          .select('ticker,from_trend,to_trend')
          .eq('signal_date', date),
        // MAX(parsed_at) — raw table is still RLS-blocked from anon, so this
        // returns []. The "Updated …" header line lights up automatically
        // once the policy opens.
        supabase
          .from('hedgeye_signals')
          .select('parsed_at')
          .eq('signal_date', date)
          .order('parsed_at', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return
      if (signalsRes.error) {
        setError(signalsRes.error.message)
        setStatus('error')
        return
      }
      const changeMap = {}
      for (const c of changesRes.data ?? []) {
        changeMap[c.ticker] = c
      }
      setSignalDate(date)
      setRows(signalsRes.data ?? [])
      setChanges(changeMap)
      setUpdatedAt(parsedRes.data?.[0]?.parsed_at ?? null)
      setStatus('ready')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Map: ticker → priceDisplay. Recomputed when rows, live prices, or market
  // state change. Cards read their slice via .get(ticker).
  const displays = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      m.set(r.ticker, getPriceDisplay(r, livePrices.get(r.ticker), market.isOpen))
    }
    return m
  }, [rows, livePrices, market.isOpen])

  const filters = useMemo(() => {
    const cats = new Set()
    for (const r of rows) if (r.category) cats.add(r.category)
    const dynamic = Array.from(cats)
      .sort()
      .map((c) => ({ label: labelFor(c), value: c }))
    const hasUncat = rows.some((r) => !r.category)
    return [
      { label: 'All', value: null },
      ...dynamic,
      ...(hasUncat ? [{ label: 'Uncategorized', value: '__uncat__' }] : []),
    ]
  }, [rows])

  const counts = useMemo(() => {
    const c = {}
    for (const f of filters) {
      if (f.value === null) c[f.label] = rows.length
      else if (f.value === '__uncat__') c[f.label] = rows.filter((r) => !r.category).length
      else c[f.label] = rows.filter((r) => r.category === f.value).length
    }
    return c
  }, [filters, rows])

  const visibleFilters = useMemo(
    () => filters.filter((f) => f.value === null || (counts[f.label] ?? 0) > 0),
    [filters, counts]
  )

  useEffect(() => {
    if (!visibleFilters.find((f) => f.label === active)) setActive('All')
  }, [visibleFilters, active])

  const setupCount = useMemo(
    () => rows.reduce((n, r) => (getSetup(r, displays.get(r.ticker)) ? n + 1 : n), 0),
    [rows, displays]
  )

  const visibleCards = useMemo(() => {
    let baseList
    if (view === 'setups') {
      const setups = rows
        .map((r) => {
          const d = displays.get(r.ticker)
          return { row: r, setup: getSetup(r, d), pct: effectivePct(r, d) }
        })
        .filter((x) => x.setup !== null)

      // Closest to threshold first: longs by pct asc, shorts by pct desc.
      setups.sort((a, b) => {
        if (a.setup === b.setup) {
          if (a.setup === 'LONG') return (a.pct ?? 0) - (b.pct ?? 0)
          return (b.pct ?? 0) - (a.pct ?? 0)
        }
        return a.setup === 'LONG' ? -1 : 1
      })
      baseList = setups.map((x) => x.row)
    } else {
      const f = filters.find((x) => x.label === active)
      let list
      if (!f || f.value === null) list = rows
      else if (f.value === '__uncat__') list = rows.filter((r) => !r.category)
      else list = rows.filter((r) => r.category === f.value)

      function tier(r) {
        if (changes[r.ticker]) return 0
        const pct = rangePct(r)
        if (pct !== null && pct < NEAR_BUY) return 1
        if (pct !== null && pct > NEAR_SELL) return 2
        return 3
      }
      baseList = [...list].sort((a, b) => {
        const ta = tier(a)
        const tb = tier(b)
        if (ta !== tb) return ta - tb
        return a.ticker.localeCompare(b.ticker)
      })
    }

    const q = search.trim().toLowerCase()
    if (!q) return baseList
    return baseList.filter((r) => {
      const ticker = (r.ticker ?? '').toLowerCase()
      const display = (r.display_name ?? '').toLowerCase()
      return ticker.includes(q) || display.includes(q)
    })
  }, [view, filters, rows, active, changes, search, displays])

  function toggleExpand(ticker) {
    setExpanded((cur) => (cur === ticker ? null : ticker))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Risk Ranges</h1>
          <p className="sub">
            {signalDate ? `Signal date: ${signalDate}` : 'Latest signals'} ·{' '}
            {status === 'ready' ? `${rows.length} tickers` : status}
            {status === 'ready' && Object.keys(changes).length > 0 ? ` · ${Object.keys(changes).length} flipped` : ''}
            {status === 'ready' && updatedAt ? ` · Updated ${fmtTime(updatedAt)}` : ''}
          </p>
        </div>
        <MarketStatePill market={market} />
      </header>

      <nav className="view-tabs" role="tablist" aria-label="Dashboard view">
        <button
          role="tab"
          aria-selected={view === 'all'}
          className={`view-tab${view === 'all' ? ' active' : ''}`}
          onClick={() => setView('all')}
        >
          All Signals
          <span className="view-tab-count">{rows.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === 'setups'}
          className={`view-tab${view === 'setups' ? ' active' : ''}`}
          onClick={() => setView('setups')}
        >
          ⚡ Active Setups
          <span className="view-tab-count">{setupCount}</span>
        </button>
      </nav>

      <div className="filter-row">
        {view === 'all' ? (
          <nav className="chips" role="tablist" aria-label="Category filters">
            {visibleFilters.map((f) => (
              <button
                key={f.label}
                role="tab"
                aria-selected={active === f.label}
                className={`chip${active === f.label ? ' active' : ''}`}
                onClick={() => setActive(f.label)}
              >
                {f.label}
                <span className="chip-count">{counts[f.label] ?? 0}</span>
              </button>
            ))}
          </nav>
        ) : (
          <div />
        )}
        <div className="search-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Search ticker..."
            aria-label="Search ticker or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setSearch('')
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      </div>

      {status === 'loading' && <div className="state">Loading…</div>}
      {status === 'error' && <div className="state error">Error: {error}</div>}
      {status === 'ready' && visibleCards.length === 0 && (
        search.trim() ? (
          <div className="state">No tickers match “{search.trim()}”.</div>
        ) : view === 'setups' ? (
          <div className="state state-center">No setups currently active</div>
        ) : (
          <div className="state">No signals in this category for {signalDate}.</div>
        )
      )}

      {status === 'ready' && visibleCards.length > 0 && (
        <section className="cards">
          {visibleCards.map((r) => (
            <SignalCard
              key={r.ticker}
              row={r}
              change={changes[r.ticker]}
              setup={getSetup(r, displays.get(r.ticker))}
              display={displays.get(r.ticker)}
              expanded={expanded === r.ticker}
              onToggle={toggleExpand}
            />
          ))}
        </section>
      )}
    </div>
  )
}
