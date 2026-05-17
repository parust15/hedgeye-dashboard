import { useMemo, useState } from 'react'
import { useCallPerformance } from '../lib/useCallPerformance'

const TABS = [
  { id: 'today', label: 'TODAY', field: 'pct_today' },
  { id: 'week', label: 'WEEK', field: 'pct_week' },
  { id: 'month', label: 'MONTH', field: 'pct_month' },
]

const ROWS_PER_SIDE = 5

// "May 14, 2026" — used in the WEEK empty-state to anchor "started tracking".
function formatStartedDate() {
  return new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function changeClass(n) {
  if (!Number.isFinite(n)) return ''
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return ''
}

function formatPct(n) {
  if (!Number.isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function PerformanceRow({ entry }) {
  const { ticker, company_name, value } = entry
  const cls = changeClass(value)
  return (
    <li className="perf-row">
      <span className="perf-ticker">{ticker}</span>
      {company_name && <span className="perf-company">{company_name}</span>}
      <span className={`perf-pct ${cls}`}>{formatPct(value)}</span>
    </li>
  )
}

/**
 * Performance section: TODAY / WEEK / MONTH tabs, side-by-side BEST and
 * WORST columns (5 each).
 *
 * @param positionRows  hedgeye_call_positions_v rows — used to enrich the
 *                      perf view with company_name for display.
 */
export function PerformanceSection({ positionRows }) {
  const { rows, hasAnyWeek, hasAnyMonth, status } = useCallPerformance()
  const [activeTab, setActiveTab] = useState('today')

  // ticker → company_name lookup from positions data.
  const companyByTicker = useMemo(() => {
    const m = new Map()
    for (const r of positionRows ?? []) {
      if (r.ticker && r.company_name) m.set(r.ticker, r.company_name)
    }
    return m
  }, [positionRows])

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  const { best, worst } = useMemo(() => {
    const field = tab.field
    const enriched = rows
      // Important: Number(null) === 0 silently passes Number.isFinite,
      // so the nullish guard has to come first or we'd render nulls as 0%.
      .filter((r) => r[field] != null && Number.isFinite(Number(r[field])))
      .map((r) => ({
        ticker: r.ticker,
        company_name: companyByTicker.get(r.ticker) ?? '',
        value: Number(r[field]),
      }))
    enriched.sort((a, b) => b.value - a.value)
    const top = enriched.slice(0, ROWS_PER_SIDE)
    // Most negative first → take last N and reverse.
    const bottom = enriched.slice(-ROWS_PER_SIDE).reverse()
    return { best: top, worst: bottom }
  }, [rows, tab.field, companyByTicker])

  // Build the empty-state node for the active tab. Each tab has its own
  // copy because the spec ties the message to the trading-day window.
  function emptyState() {
    if (status === 'loading') {
      return <div className="state">Loading performance…</div>
    }
    if (status === 'error') {
      return <div className="state error">Could not load performance data.</div>
    }
    if (tab.id === 'week' && !hasAnyWeek) {
      return (
        <div className="state state-center perf-empty">
          <div>Week performance available after 5 trading days of data</div>
          <div className="perf-empty-sub">Started tracking: {formatStartedDate()}</div>
        </div>
      )
    }
    if (tab.id === 'month' && !hasAnyMonth) {
      return (
        <div className="state state-center perf-empty">
          <div>Month performance available after 21 trading days</div>
          <div className="perf-empty-sub">Started tracking: {formatStartedDate()}</div>
        </div>
      )
    }
    if (best.length === 0 && worst.length === 0) {
      return (
        <div className="state state-center perf-empty">
          <div>Performance data not yet available for {tab.label.toLowerCase()}</div>
        </div>
      )
    }
    return null
  }

  const empty = emptyState()

  return (
    <section className="perf-section">
      <header className="perf-head">
        <h2 className="perf-title">PERFORMANCE</h2>
        <nav className="perf-tabs" role="tablist" aria-label="Performance window">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`filter-chip filter-chip-all${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {empty ? (
        empty
      ) : (
        <div className="perf-cols">
          <div className="perf-col">
            <h3 className="perf-col-head">BEST</h3>
            <ul className="perf-list">
              {best.map((e) => (
                <PerformanceRow key={`best-${e.ticker}`} entry={e} />
              ))}
            </ul>
          </div>
          <div className="perf-col">
            <h3 className="perf-col-head">WORST</h3>
            <ul className="perf-list">
              {worst.map((e) => (
                <PerformanceRow key={`worst-${e.ticker}`} entry={e} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
