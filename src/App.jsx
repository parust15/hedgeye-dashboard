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
import './App.css'

const NEAR_BUY = 0.20
const NEAR_SELL = 0.80

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
  'HH/HL': 'rgba(34, 197, 94, 0.25)',
  'LH/LL': 'rgba(239, 68, 68, 0.25)',
  'HH/LL': 'rgba(251, 146, 60, 0.25)',
  'LH/HL': 'rgba(96, 165, 250, 0.25)',
  unchanged: 'rgba(156, 163, 175, 0.15)',
}
function fillFor(state) {
  return RANGE_FILL[state] ?? RANGE_FILL.unchanged
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

function rangePct(row) {
  const buy = Number(row.buy_trade)
  const sell = Number(row.sell_trade)
  const close = Number(row.prev_close)
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || !Number.isFinite(close)) return null
  const span = sell - buy
  if (span === 0) return null
  return (close - buy) / span
}

function PositionBar({ pct }) {
  if (pct === null) {
    return <div className="posbar disabled" aria-hidden="true" />
  }
  const clamped = Math.max(0, Math.min(1, pct))
  let zone = 'mid'
  if (pct < NEAR_BUY) zone = 'near-buy'
  else if (pct > NEAR_SELL) zone = 'near-sell'
  return (
    <div className={`posbar ${zone}`}>
      <div className="posbar-track" />
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

function ExpandedChart({ ticker }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Note: raw `hedgeye_signals` returns 0 rows to the anon role (RLS blocks
      // it), so we explicitly use the view filtered by ticker. Same columns,
      // works as the user said either is acceptable.
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

  return (
    <div className="chart-wrap">
      <div className="chart-meta">Last {data.length} sessions · per-day range_state fill</div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
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
              fill={fillFor(d.state)}
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
            dot={{ r: 2, fill: '#f3f5fa' }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function SignalCard({ row, change, expanded, onToggle }) {
  const pct = rangePct(row)
  let zoneLabel = null
  if (pct !== null) {
    if (pct < NEAR_BUY) zoneLabel = 'Near buy'
    else if (pct > NEAR_SELL) zoneLabel = 'Near sell'
  }

  return (
    <article
      className={`card${expanded ? ' expanded' : ''}${change ? ' flipped' : ''}`}
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
        <div>
          <div className="ticker">{row.ticker}</div>
          {row.display_name || row.name ? (
            <div className="name">{row.display_name || row.name}</div>
          ) : null}
        </div>
        <span className={trendClass(row.trend)}>{row.trend ?? '—'}</span>
      </header>

      {change && (
        <div className="flip-row">
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
          <dd className="range-state">{row.range_state ?? '—'}</dd>
        </div>
      </dl>

      <div className="posbar-section">
        <PositionBar pct={pct} />
        <div className="posbar-labels">
          <span className="posbar-end buy">{fmt(row.buy_trade)}</span>
          {zoneLabel ? <span className={`zone-tag zone-${zoneLabel === 'Near buy' ? 'buy' : 'sell'}`}>{zoneLabel}</span> : <span />}
          <span className="posbar-end sell">{fmt(row.sell_trade)}</span>
        </div>
      </div>

      {expanded && (
        <div className="chart-panel" onClick={(e) => e.stopPropagation()}>
          <ExpandedChart ticker={row.ticker} />
        </div>
      )}
    </article>
  )
}

export default function App() {
  const [rows, setRows] = useState([])
  const [changes, setChanges] = useState({})
  const [signalDate, setSignalDate] = useState(null)
  const [active, setActive] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

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

      const [signalsRes, changesRes] = await Promise.all([
        supabase
          .from('hedgeye_signals_v')
          .select(
            'ticker,name,display_name,trend,buy_trade,sell_trade,prev_close,range_state,category,signal_date'
          )
          .eq('signal_date', date),
        supabase
          .from('hedgeye_trend_changes_v')
          .select('ticker,from_trend,to_trend')
          .eq('signal_date', date),
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
      setStatus('ready')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

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

  const filtered = useMemo(() => {
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
    return [...list].sort((a, b) => {
      const ta = tier(a)
      const tb = tier(b)
      if (ta !== tb) return ta - tb
      return a.ticker.localeCompare(b.ticker)
    })
  }, [filters, rows, active, changes])

  function toggleExpand(ticker) {
    setExpanded((cur) => (cur === ticker ? null : ticker))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Hedgeye Risk Ranges</h1>
          <p className="sub">
            {signalDate ? `Signal date: ${signalDate}` : 'Latest signals'} ·{' '}
            {status === 'ready' ? `${rows.length} tickers` : status}
            {status === 'ready' && Object.keys(changes).length > 0 ? ` · ${Object.keys(changes).length} flipped` : ''}
          </p>
        </div>
      </header>

      <nav className="chips" role="tablist" aria-label="Category filters">
        {filters.map((f) => (
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

      {status === 'loading' && <div className="state">Loading…</div>}
      {status === 'error' && <div className="state error">Error: {error}</div>}
      {status === 'ready' && filtered.length === 0 && (
        <div className="state">No signals in this category for {signalDate}.</div>
      )}

      {status === 'ready' && filtered.length > 0 && (
        <section className="cards">
          {filtered.map((r) => (
            <SignalCard
              key={r.ticker}
              row={r}
              change={changes[r.ticker]}
              expanded={expanded === r.ticker}
              onToggle={toggleExpand}
            />
          ))}
        </section>
      )}
    </div>
  )
}
