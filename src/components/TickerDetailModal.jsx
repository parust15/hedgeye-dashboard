import { useEffect } from 'react'
import { useTickerDetail } from '../lib/useTickerDetail'

const MAX_CONVICTION = 75

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
