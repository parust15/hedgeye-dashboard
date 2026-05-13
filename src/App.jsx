import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const FILTERS = [
  { label: 'All', match: null },
  { label: 'Indices', match: ['indices'] },
  { label: 'Sectors', match: ['us_sectors', 'sectors'] },
  { label: 'Styles', match: ['styles'] },
  { label: 'FX', match: ['fx'] },
  { label: 'Rates', match: ['rates'] },
  { label: 'Commodities', match: ['commodities'] },
  { label: 'Vol', match: ['vol'] },
  { label: 'Stocks', match: ['stocks'] },
]

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

function SignalCard({ row }) {
  return (
    <article className="card">
      <header className="card-head">
        <div className="ticker">{row.ticker}</div>
        <span className={trendClass(row.trend)}>{row.trend ?? '—'}</span>
      </header>
      {row.display_name || row.name ? (
        <div className="name">{row.display_name || row.name}</div>
      ) : null}
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
    </article>
  )
}

export default function App() {
  const [rows, setRows] = useState([])
  const [signalDate, setSignalDate] = useState(null)
  const [active, setActive] = useState('All')
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

      const { data, error } = await supabase
        .from('hedgeye_signals_v')
        .select('ticker,name,display_name,trend,buy_trade,sell_trade,prev_close,range_state,category,signal_date')
        .eq('signal_date', date)
        .order('category', { ascending: true, nullsFirst: false })
        .order('ticker', { ascending: true })

      if (cancelled) return
      if (error) {
        setError(error.message)
        setStatus('error')
        return
      }
      setSignalDate(date)
      setRows(data ?? [])
      setStatus('ready')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const c = {}
    for (const f of FILTERS) {
      c[f.label] = f.match === null
        ? rows.length
        : rows.filter((r) => f.match.includes(r.category)).length
    }
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.label === active)
    if (!f || f.match === null) return rows
    return rows.filter((r) => f.match.includes(r.category))
  }, [rows, active])

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Hedgeye Risk Ranges</h1>
          <p className="sub">
            {signalDate ? `Signal date: ${signalDate}` : 'Latest signals'} ·{' '}
            {status === 'ready' ? `${rows.length} tickers` : status}
          </p>
        </div>
      </header>

      <nav className="chips" role="tablist" aria-label="Category filters">
        {FILTERS.map((f) => (
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
            <SignalCard key={`${r.ticker}-${r.signal_date}`} row={r} />
          ))}
        </section>
      )}
    </div>
  )
}
