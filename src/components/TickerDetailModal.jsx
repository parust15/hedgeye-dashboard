import { useEffect } from 'react'
import { useTickerDetail } from '../lib/useTickerDetail'
import { useTickerSummary } from '../lib/useTickerSummary'
import { CrossLevelPeek } from './CrossLevelPeek'

// ModalConvictionBar + MAX_CONVICTION removed — the conviction rating
// + "X appearances 90d" badges are no longer surfaced in the modal
// header. The full company info body (AI summary, thesis, analyst
// notes, Top 5 history) is what carries the actionable detail.

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

// Single modal entry point — driven by the TickerContext `focus`
// shape: { ticker, source, payload? }.
//
// If focus.payload is present, the caller (RR / The Call) has handed
// us a full position record and we render the legacy call-info body
// (analyst notes, conviction bar, Top 5 history, AI summary).
// Otherwise we render <CrossLevelPeek> anchored to focus.source so
// the peek omits the originating tab.
//
// onJumpTab fires when a peek tile is clicked. The App sets the
// active tab; the modal closes itself separately.
export function TickerDetailModal({ focus, onClose, onJumpTab }) {
  const ticker = focus?.ticker ?? null
  // `position` is just a local alias for focus.payload — kept so the
  // legacy body below reads identically to the old `position`-prop
  // version (renaming every position.* reference would inflate the
  // diff for zero behavior gain).
  const position = focus?.payload ?? null
  const { notes, top5History, status } = useTickerDetail(ticker)
  const { summary } = useTickerSummary(ticker)

  // Close on Escape.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!focus) return null

  // === Peek mode ===
  // No payload = caller is one of the non-Call panels that doesn't
  // carry call-info data. Render the cross-tab peek body anchored to
  // focus.source so the peek omits the current tab.
  if (!position) {
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
            <div className="modal-head-row1">
              <h2 id="ticker-modal-title" className="modal-company">
                {focus.ticker}
              </h2>
            </div>
          </header>
          <CrossLevelPeek
            ticker={focus.ticker}
            currentTab={focus.source}
            onJumpTab={(tabId) => {
              onJumpTab?.(tabId)
              onClose()
            }}
          />
        </div>
      </div>
    )
  }

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
          {focus.source === 'risk-ranges' && (
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
            {position.consecutive_days > 1 && (
              <span className="modal-meta">{position.consecutive_days} days streak</span>
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
            {/* core_thesis intentionally NOT rendered — the bold
                headline was the primary chrome of the AI summary
                section but the `summary` paragraph below covers the
                same ground in plain prose. Field stays in the API
                shape (still selected by useTickerSummary) so
                downstream consumers / tests can read it. */}
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
