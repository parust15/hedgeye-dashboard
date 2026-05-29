import { useEffect, useState } from 'react'
import { fetchTickerIntelligence, fetchPTSearch } from '../../api/intelligence'
import './TickerIntelligenceModal.css'

// Full per-ticker intelligence sheet, fed by the ticker_intelligence
// RPC (five levels: RR signal, cross-source state, macro assertions,
// the Call thesis/history, and PT Tarr coverage). Opened from the
// Command Center (and other panels) via a non-null `ticker` prop.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

function fmtNum(x) {
  const n = num(x)
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function clampPct(x) {
  const n = num(x)
  if (n == null) return 0
  return Math.max(0, Math.min(100, n))
}

function trunc(s, n) {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

function daysAgo(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return null
  const then = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

function relative(iso) {
  const n = daysAgo(iso)
  if (n == null) return ''
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

// 'YYYY-MM-DD' N days before today. Module-level so the impure clock
// read stays out of the component body (event-handler use only).
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
}

function trendTone(t) {
  const u = (t || '').toUpperCase()
  if (u === 'BULLISH' || u === 'LONG') return 'pos'
  if (u === 'BEARISH' || u === 'SHORT') return 'neg'
  return 'neu'
}

function zoneTone(z) {
  switch (z) {
    case 'buy_zone':
      return 'pos'
    case 'trim_zone':
      return 'cau'
    case 'avoid':
      return 'neg'
    default:
      return 'neu'
  }
}

function zoneLabel(z) {
  switch (z) {
    case 'buy_zone':
      return 'BUY ZONE'
    case 'trim_zone':
      return 'TRIM ZONE'
    case 'avoid':
      return 'AVOID'
    case 'mid_range':
      return 'MID-RANGE'
    default:
      return (z || '—').toUpperCase()
  }
}

const TABS = [
  { id: 'signal', label: 'SIGNAL' },
  { id: 'fundamental', label: 'FUNDAMENTAL' },
  { id: 'pt', label: 'PT TARR' },
  { id: 'history', label: 'HISTORY' },
]

function Badge({ tone, children }) {
  return <span className={`tim-badge tim-badge-${tone}`}>{children}</span>
}

function RangeBar({ rr }) {
  const lrr = num(rr?.lrr)
  const trr = num(rr?.trr)
  const price = num(rr?.price)
  const pct = clampPct(rr?.pct_range)
  return (
    <div className="tim-range">
      <div className="tim-range-track">
        <div className="tim-range-fill" style={{ width: `${pct}%` }} />
        <span className="tim-range-thresh tim-range-buy" style={{ left: '25%' }} />
        <span className="tim-range-thresh tim-range-trim" style={{ left: '75%' }} />
        <span className="tim-range-dot" style={{ left: `${pct}%` }} />
      </div>
      <div className="tim-range-labels">
        <span className="tim-range-lrr">LRR ${fmtNum(lrr)}</span>
        <span className="tim-range-now">
          {fmtNum(price)} ({pct.toFixed(0)}%)
        </span>
        <span className="tim-range-trr">TRR ${fmtNum(trr)}</span>
      </div>
    </div>
  )
}

// --- Tab bodies ----------------------------------------------------

function SignalTab({ data }) {
  const cs = data.cross_source || {}
  const assertions = Array.isArray(data.macro_assertions) ? data.macro_assertions : []
  const ideas = data.investing_ideas
  const hist = data.call_history || {}
  return (
    <div className="tim-section">
      <h4 className="tim-sub">Cross-Source State</h4>
      <div className="tim-kv">
        <div className="tim-kv-row">
          <span className="tim-kv-key">RR Trend</span>
          <Badge tone={trendTone(cs.rr_trend)}>{(cs.rr_trend || '—').toUpperCase()}</Badge>
        </div>
        <div className="tim-kv-row">
          <span className="tim-kv-key">Call Position</span>
          <span className="tim-kv-val">
            <Badge tone={trendTone(cs.call_position)}>
              {(cs.call_position || '—').toUpperCase()}
            </Badge>
            {cs.call_position_at && (
              <span className="tim-muted"> (since {cs.call_position_at})</span>
            )}
            {cs.call_conviction && <span className="tim-pill">{cs.call_conviction}</span>}
          </span>
        </div>
        {cs.call_trend_stale && (
          <div className="tim-warn">
            ⚠️ Call TREND signal is {cs.call_trend_age} days old — may not reflect current view
          </div>
        )}
        {cs.call_trade_stale && (
          <div className="tim-warn">
            ⚠️ Call TRADE signal is {cs.call_trade_age} days old — may not reflect current view
          </div>
        )}
        {cs.call_trend &&
          cs.rr_trend &&
          String(cs.call_trend).toLowerCase() !== String(cs.rr_trend).toLowerCase() && (
            <div className="tim-warn">
              ⚠️ Signal conflict: RR says {String(cs.rr_trend).toUpperCase()}, Call says{' '}
              {String(cs.call_trend).toUpperCase()}
              {cs.call_trend_age ? ` (${cs.call_trend_age}d ago)` : ''}
            </div>
          )}
      </div>

      <h4 className="tim-sub">Macro Assertions</h4>
      {assertions.length === 0 ? (
        <p className="tim-empty">No macro assertions for this ticker in the last 14 days</p>
      ) : (
        <ul className="tim-assertions">
          {assertions.map((a, i) => (
            <li key={i}>
              <span className="tim-assert-type">{a.type}</span> ·{' '}
              <span className={`tim-assert-stance tim-tone-${trendTone(a.stance)}`}>
                {a.stance}
              </span>{' '}
              · “{trunc(a.evidence, 120)}”
              <span className="tim-muted"> · {relative(a.date)}</span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="tim-sub">Active Investing Ideas</h4>
      {!ideas ? (
        <p className="tim-empty">Not in active Investing Ideas</p>
      ) : (
        <div className="tim-idea">
          <div className="tim-idea-head">
            <Badge tone={trendTone(ideas.side)}>{(ideas.side || '—').toUpperCase()}</Badge>
            <span className="tim-muted">
              #{ideas.position} · {ideas.sector_head}
            </span>
          </div>
          {ideas.thesis && <p className="tim-idea-thesis">{ideas.thesis}</p>}
          <div className="tim-idea-levels">
            <span className="tim-range-lrr">LRR ${fmtNum(ideas.lrr)}</span>
            <span className="tim-range-trr">TRR ${fmtNum(ideas.trr)}</span>
          </div>
        </div>
      )}

      <h4 className="tim-sub">Signal History</h4>
      <p className="tim-note">
        {hist.top5_appearances ?? 0} appearances in Top 5 · first seen{' '}
        {hist.first_seen || '—'} · last seen {hist.last_seen || '—'}
      </p>
    </div>
  )
}

function FundamentalTab({ data, showAllNotes, setShowAllNotes }) {
  const thesis = data.call_thesis
  const notes = Array.isArray(data.call_history?.notes) ? data.call_history.notes : []
  const sorted = [...notes].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const visible = showAllNotes ? sorted : sorted.slice(0, 5)
  const score = num(thesis?.consistency_score)
  return (
    <div className="tim-section">
      <h4 className="tim-sub">Thesis</h4>
      {!thesis ? (
        <p className="tim-empty">No thesis on file for this ticker</p>
      ) : (
        <div className="tim-thesis">
          <div className="tim-thesis-head">
            <Badge tone={trendTone(thesis.direction)}>
              {(thesis.direction || '—').toUpperCase()}
            </Badge>
            {score != null && (
              <div className="tim-consistency">
                <span className="tim-muted">consistency {score}</span>
                <span className="tim-progress">
                  <span className="tim-progress-fill" style={{ width: `${clampPct(score)}%` }} />
                </span>
              </div>
            )}
          </div>
          {thesis.core_thesis && <p className="tim-thesis-core">{thesis.core_thesis}</p>}
          {thesis.what_breaks && (
            <p className="tim-thesis-breaks">
              <span className="tim-label-warn">What breaks it:</span> {thesis.what_breaks}
            </p>
          )}
          {thesis.next_catalyst && (
            <p className="tim-thesis-catalyst">
              <span className="tim-label">Next catalyst:</span> {thesis.next_catalyst}
            </p>
          )}
        </div>
      )}

      <h4 className="tim-sub">Recent Analyst Notes</h4>
      {sorted.length === 0 ? (
        <p className="tim-empty">No analyst notes on file</p>
      ) : (
        <>
          <div className="tim-notes">
            {visible.map((n, i) => (
              <div className="tim-note-card" key={i}>
                <div className="tim-note-meta">
                  <span className="tim-muted">{n.date}</span>
                  {n.analyst && <span className="tim-pill">{n.analyst}</span>}
                  {n.direction && n.direction !== 'UNKNOWN' && (
                    <Badge tone={trendTone(n.direction)}>{n.direction}</Badge>
                  )}
                </div>
                <p className="tim-note-text">{trunc(n.note, 300)}</p>
              </div>
            ))}
          </div>
          {sorted.length > 5 && (
            <button
              type="button"
              className="tim-expand"
              onClick={() => setShowAllNotes((v) => !v)}
            >
              {showAllNotes ? 'Show fewer' : `Show all ${sorted.length} notes`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function PtUnitCard({ u, showSimilarity }) {
  return (
    <div className="tim-pt-card">
      <div className="tim-pt-head">
        <span className="tim-muted">{u.date}</span>
        <span className="tim-pill">
          {u.type}
          {u.subtype ? ` · ${u.subtype}` : ''}
        </span>
        <span className="tim-pt-stance">
          {u.stance && <Badge tone={trendTone(u.stance)}>{u.stance}</Badge>}
          {u.conviction && <span className="tim-muted"> ({u.conviction})</span>}
          {showSimilarity && u.similarity != null && (
            <span className="tim-pt-sim">{Math.round(u.similarity * 100)}% match</span>
          )}
        </span>
      </div>
      <p className="tim-pt-content">{trunc(u.content, 400)}</p>
    </div>
  )
}

function PtTab({ data, ptSemantic, ptSemanticLoading }) {
  const units = Array.isArray(data.pt_recent) ? data.pt_recent : []
  const exact = [...units]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8)
  const semantic = Array.isArray(ptSemantic) ? ptSemantic : []
  const nothing = exact.length === 0 && semantic.length === 0 && !ptSemanticLoading
  return (
    <div className="tim-section">
      {exact.length > 0 && (
        <>
          <h4 className="tim-sub">Recent Coverage — exact ticker match</h4>
          {exact.map((u, i) => (
            <PtUnitCard key={`e-${u.id ?? i}`} u={u} />
          ))}
        </>
      )}
      {ptSemanticLoading && <p className="tim-muted tim-pt-searching">Searching PT archive…</p>}
      {semantic.length > 0 && (
        <>
          <h4 className="tim-sub">Related Analysis — semantic match</h4>
          {semantic.map((u, i) => (
            <PtUnitCard key={`s-${u.id ?? i}`} u={u} showSimilarity />
          ))}
        </>
      )}
      {nothing && (
        <p className="tim-empty">No Peter Tarr coverage found for {data.ticker}</p>
      )}
      <p className="tim-footnote">
        PT coverage from Tarr briefings — exact ticker match + semantic search across the
        extracted-units archive.
      </p>
    </div>
  )
}

function HistoryTab({ data }) {
  const hist = data.call_history || {}
  const top5 = Array.isArray(hist.top5_entries) ? hist.top5_entries : []
  const sorted = [...top5].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <div className="tim-section">
      <h4 className="tim-sub">Top 5 Appearances</h4>
      {sorted.length === 0 ? (
        <p className="tim-empty">No Top 5 appearances on file</p>
      ) : (
        <div className="tim-table">
          <div className="tim-tr tim-th">
            <span className="tim-td-date">Date</span>
            <span className="tim-td-rank">Rank</span>
            <span className="tim-td-rat">Rationale</span>
          </div>
          {sorted.map((e, i) => (
            <div className="tim-tr" key={i}>
              <span className="tim-td-date">{e.date}</span>
              <span className="tim-td-rank">#{e.rank}</span>
              <span className="tim-td-rat">{trunc(e.rationale, 150)}</span>
            </div>
          ))}
        </div>
      )}

      <h4 className="tim-sub">Position Summary</h4>
      <div className="tim-summary">
        <div className="tim-stat">
          <span className="tim-stat-num tim-tone-pos">{hist.long_days ?? 0}</span>
          <span className="tim-stat-label">Long days</span>
        </div>
        <div className="tim-stat">
          <span className="tim-stat-num tim-tone-neg">{hist.short_days ?? 0}</span>
          <span className="tim-stat-label">Short days</span>
        </div>
        <div className="tim-stat">
          <span className="tim-stat-num">{hist.total_appearances ?? 0}</span>
          <span className="tim-stat-label">Total</span>
        </div>
      </div>
      <p className="tim-note">
        First seen {fmtDate(hist.first_seen)} · Last seen {fmtDate(hist.last_seen)}
      </p>
    </div>
  )
}

export function TickerIntelligenceModal({ ticker, onClose, fetchFn }) {
  const [data, setData] = useState(null)
  const [activeSection, setActiveSection] = useState('signal')
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [ptSemantic, setPtSemantic] = useState([])
  const [ptSemanticLoading, setPtSemanticLoading] = useState(false)

  useEffect(() => {
    if (!ticker) return undefined
    let cancelled = false
    const fn = fetchFn || fetchTickerIntelligence
    // All setState happens inside the async chain (never synchronously
    // in the effect body) — matches the codebase's fetch pattern and
    // avoids cascading-render lint. The render phase is derived from
    // whether the loaded payload matches the open ticker, so there's no
    // synchronous reset and no stale-data flash. A failed fetch stores
    // an { __error } marker (still tagged with the ticker) so the phase
    // resolves to "error" rather than spinning forever.
    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined
        setActiveSection('signal')
        setShowAllNotes(false)
        setPtSemantic([])
        setPtSemanticLoading(false)
        return fn(ticker)
      })
      .then((d) => {
        if (cancelled) return
        setData(d && typeof d === 'object' ? d : { ticker, __error: true })
      })
      .catch(() => {
        if (!cancelled) setData({ ticker, __error: true })
      })
    return () => {
      cancelled = true
    }
  }, [ticker, fetchFn])

  // Escape closes.
  useEffect(() => {
    if (!ticker) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ticker, onClose])

  // Switching tabs never refetches the core RPC. The PT tab fires a
  // one-time semantic search (lazy) the first time it's opened, then
  // dedupes against the exact-match pt_recent units by id.
  const handleTabClick = (next) => {
    setActiveSection(next)
    if (next === 'pt' && data && !data.__error && ptSemantic.length === 0 && !ptSemanticLoading) {
      setPtSemanticLoading(true)
      const ninetyDaysAgo = isoDaysAgo(90)
      const seedTicker = data.ticker || ticker
      fetchPTSearch({
        query: `${seedTicker} ${(data.call_thesis?.core_thesis || '').slice(0, 120)}`,
        tickers: [seedTicker],
        limit: 6,
        types: ['trade_call', 'sector_take', 'macro_take', 'mental_model', 'catalyst'],
        dateFrom: ninetyDaysAgo,
      })
        .then((r) => {
          const existing = new Set((data.pt_recent || []).map((u) => u.id))
          setPtSemantic((r?.units || []).filter((u) => !existing.has(u.id)))
          setPtSemanticLoading(false)
        })
        .catch(() => setPtSemanticLoading(false))
    }
  }

  // Render phase derived purely from the loaded payload vs the open
  // ticker: matched + ok → content, matched + error → error, else load.
  const matched =
    !!data && String(data.ticker || '').toUpperCase() === String(ticker || '').toUpperCase()
  const isReady = matched && !data.__error
  const isError = matched && !!data.__error
  const isLoading = !!ticker && !matched
  const rr = isReady ? data.rr_signal || {} : {}
  const company = isReady ? data.call_history?.company_name || '' : ''

  if (!ticker) return null

  return (
    <div className="tim-backdrop" onClick={onClose}>
      <div
        className="tim-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${ticker} intelligence`}
      >
            {/* Header */}
            <div className="tim-header">
              <div className="tim-header-main">
                <span className="tim-ticker">{ticker}</span>
                {company && <span className="tim-company">{company}</span>}
                {isReady && rr.trend && (
                  <Badge tone={trendTone(rr.trend)}>{rr.trend}</Badge>
                )}
                {isReady && rr.pct_range != null && (
                  <span className="tim-muted">{clampPct(rr.pct_range).toFixed(0)}% through range</span>
                )}
                {isReady && rr.zone && (
                  <span className={`tim-zone tim-zone-${zoneTone(rr.zone)}`}>
                    {zoneLabel(rr.zone)}
                  </span>
                )}
              </div>
              <button type="button" className="tim-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>

            {isLoading && (
              <div className="tim-loading">
                <span className="tim-pulse" />
                Loading {ticker}…
              </div>
            )}

            {isError && (
              <div className="tim-loading">Could not load {ticker} intelligence.</div>
            )}

            {isReady && (
              <>
                {rr.lrr != null && rr.trr != null && <RangeBar rr={rr} />}

                <div className="tim-tabs" role="tablist">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={activeSection === t.id}
                      className={`tim-tab${activeSection === t.id ? ' tim-tab-active' : ''}`}
                      onClick={() => handleTabClick(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="tim-body">
                  {activeSection === 'signal' && <SignalTab data={data} />}
                  {activeSection === 'fundamental' && (
                    <FundamentalTab
                      data={data}
                      showAllNotes={showAllNotes}
                      setShowAllNotes={setShowAllNotes}
                    />
                  )}
                  {activeSection === 'pt' && (
                    <PtTab
                      data={data}
                      ptSemantic={ptSemantic}
                      ptSemanticLoading={ptSemanticLoading}
                    />
                  )}
                  {activeSection === 'history' && <HistoryTab data={data} />}
                </div>
              </>
            )}
      </div>
    </div>
  )
}
