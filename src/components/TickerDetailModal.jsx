import { useEffect } from 'react'
import { useTickerDetail } from '../lib/useTickerDetail'
import { useTickerSummary } from '../lib/useTickerSummary'

const MAX_CONVICTION = 75

// Color map for the AI-summary status badges. Each badge is a small
// uppercase pill rendered with one of four tones — green/grey/amber/red
// — keyed off the column value the table emits.
const SUMMARY_BADGE_COLORS = {
  // data_freshness
  ACTIVE: 'green',
  RECENT: 'grey',
  COOLING: 'amber',
  STALE: 'red',
  // consistency
  BUILDING: 'green',
  STABLE: 'grey',
  FADING: 'amber',
  REVERSED: 'red',
  // language_momentum
  ACCELERATING: 'green',
  STEADY: 'grey',
  DECELERATING: 'amber',
}

function SummaryBadge({ value, label }) {
  if (!value) return null
  const upper = String(value).toUpperCase()
  const tone = SUMMARY_BADGE_COLORS[upper] ?? 'grey'
  return (
    <span
      className={`summary-badge summary-badge-${tone}`}
      title={label ? `${label}: ${upper}` : undefined}
    >
      {upper}
    </span>
  )
}

// "Mon May 13" from YYYY-MM-DD.
function formatNoteDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function PositionTypePill({ type }) {
  const cls = `position-pill position-${(type ?? 'neutral').toLowerCase()}`
  return <span className={cls}>{type ?? 'NEUTRAL'}</span>
}

function ModalConvictionBar({ score }) {
  const safe = Number.isFinite(Number(score)) ? Number(score) : 0
  const pct = Math.max(0, Math.min(1, safe / MAX_CONVICTION)) * 100
  return (
    <div className="modal-conviction">
      <div className="conviction-bar">
        <div className="conviction-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conviction-score">{safe}</span>
    </div>
  )
}

export function TickerDetailModal({ position, onClose }) {
  const { notes, top5History, status } = useTickerDetail(position?.ticker ?? null)
  const { summary } = useTickerSummary(position?.ticker ?? null)

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!position) return null

  // Most recent note (signal_date === today's call) — promoted to its own
  // "TODAY'S ANALYST NOTE" section if present.
  const todayNote =
    notes.length > 0 && notes[0].signal_date === position.signal_date ? notes[0] : null
  // Remaining notes (everything that wasn't promoted) for the timeline.
  const historicalNotes = todayNote ? notes.slice(1) : notes
  const noData =
    status === 'ready' && notes.length === 0 && top5History.length === 0 && !position.rationale

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticker-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <header className="modal-head">
          {position.source === 'risk-ranges' && (
            <div className="modal-source-label" aria-label="Call info overlay">
              CALL INFO — {position.ticker}
            </div>
          )}
          <div className="modal-head-row1">
            <h2 id="ticker-modal-title" className="modal-company">
              {position.company_name ?? position.ticker}
            </h2>
            <span className="modal-ticker">[{position.ticker}]</span>
            <PositionTypePill type={position.position_type} />
          </div>
          <div className="modal-head-row2">
            <ModalConvictionBar score={position.conviction_score} />
            {position.consecutive_days > 1 && (
              <span className="modal-meta">{position.consecutive_days} days streak</span>
            )}
            {position.top5_appearances_90d > 0 && (
              <span className="modal-meta">
                {position.top5_appearances_90d} appearances 90d
              </span>
            )}
          </div>
        </header>

        {status === 'loading' && (
          <div className="modal-loading">
            <span className="modal-spinner" aria-hidden="true" />
            Loading…
          </div>
        )}

        {noData && (
          <div className="modal-empty">No analyst notes on file for {position.ticker}</div>
        )}

        {summary && (
          <section className="modal-section modal-summary">
            <div className="modal-summary-head">
              <PositionTypePill type={summary.position_type ?? position.position_type} />
              <SummaryBadge value={summary.data_freshness} label="Freshness" />
            </div>
            {summary.core_thesis && (
              <h3 className="modal-summary-thesis">{summary.core_thesis}</h3>
            )}
            {summary.summary && (
              <p className="modal-summary-body">{summary.summary}</p>
            )}
            {(summary.consistency || summary.language_momentum) && (
              <div className="modal-summary-badges">
                <SummaryBadge value={summary.consistency} label="Consistency" />
                <SummaryBadge value={summary.language_momentum} label="Momentum" />
              </div>
            )}
            {summary.what_breaks_thesis && (
              <p className="modal-summary-breaks">
                What breaks this: {summary.what_breaks_thesis}
              </p>
            )}
            {summary.upcoming_catalyst && (
              <p className="modal-summary-catalyst">
                Catalyst: {summary.upcoming_catalyst}
              </p>
            )}
            <hr className="modal-summary-divider" />
          </section>
        )}

        {todayNote && (
          <section className="modal-section">
            <h3 className="modal-section-head">TODAY'S ANALYST NOTE</h3>
            <div className="modal-note-meta">
              {todayNote.analyst}
              {todayNote.sector ? ` · ${todayNote.sector}` : ''}
            </div>
            <p className="modal-note-text">{todayNote.note_text}</p>
          </section>
        )}

        {top5History.length > 0 && (
          <section className="modal-section">
            <h3 className="modal-section-head">TOP 5 APPEARANCES</h3>
            <ul className="modal-top5-list">
              {top5History.map((h) => (
                <li key={`${h.signal_date}-${h.rank}`} className="modal-top5-item">
                  <div className="modal-top5-head">
                    <span className="modal-top5-date">{formatNoteDate(h.signal_date)}</span>
                    <span className="modal-top5-rank">#{h.rank} Most Actionable</span>
                  </div>
                  {h.rationale && (
                    <p className="modal-note-text">{h.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {historicalNotes.length > 0 && (
          <section className="modal-section">
            <h3 className="modal-section-head">HISTORICAL NOTES</h3>
            <ul className="modal-history-list">
              {historicalNotes.slice(0, 5).map((n) => (
                <li key={`${n.signal_date}-${n.analyst ?? ''}`} className="modal-history-item">
                  <span className="modal-history-date">{formatNoteDate(n.signal_date)}</span>
                  <div className="modal-history-body">
                    {n.analyst && (
                      <div className="modal-note-meta">
                        {n.analyst}
                        {n.sector ? ` · ${n.sector}` : ''}
                      </div>
                    )}
                    <p className="modal-note-text">{n.note_text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
