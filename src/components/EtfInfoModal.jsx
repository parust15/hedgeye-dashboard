import { useEffect, useRef } from 'react'
import { useEtfInfo } from '../lib/useEtfInfo'
import { readJsonbStringArray } from '../lib/jsonbArray'

// Map raw category strings → CSS modifier class. Unknown / new
// categories fall through to .etf-info-cat-unknown so the chip still
// renders cleanly.
function categoryClass(category) {
  switch (category) {
    case 'Equity':        return 'etf-info-cat-equity'
    case 'Fixed Income':  return 'etf-info-cat-fixed-income'
    case 'Commodity':     return 'etf-info-cat-commodity'
    case 'Currency':      return 'etf-info-cat-currency'
    case 'Multi-Asset':   return 'etf-info-cat-multi-asset'
    case 'Real Estate':   return 'etf-info-cat-real-estate'
    case 'Money Market':  return 'etf-info-cat-money-market'
    default:              return 'etf-info-cat-unknown'
  }
}

// "May 17, 2026" formatter for the attribution line. Uses the user's
// local zone since the timestamptz is informational only.
function formatGeneratedAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function EtfInfoModal({ ticker, onClose }) {
  const { row, status } = useEtfInfo(ticker)
  const closeBtnRef = useRef(null)

  // Close on Escape — same pattern TickerDetailModal uses so the
  // shortcut works consistently across both modals.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // a11y: focus the close button on mount, restore previous focus on
  // unmount, and lock body scroll so background panels don't move
  // behind the modal. Runs once per modal open since ticker is the
  // identity key on the parent (modal unmounts/remounts per ticker).
  useEffect(() => {
    const prevFocus = document.activeElement
    closeBtnRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      if (prevFocus instanceof HTMLElement) prevFocus.focus()
    }
  }, [])

  if (!ticker) return null

  return (
    <div
      className="modal-backdrop etf-info-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-panel etf-info-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="etf-info-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        {/* Header row: ticker is always visible (even in missing/loading
            states) so the user knows what they clicked. */}
        <header className="etf-info-head">
          <h2 id="etf-info-modal-title" className="etf-info-ticker">{ticker}</h2>
        </header>

        {status === 'loading' && (
          <div className="etf-info-loading" aria-busy="true">
            <div className="etf-info-skel etf-info-skel-line" style={{ width: '70%' }} />
            <div className="etf-info-skel etf-info-skel-chips">
              <span className="etf-info-skel etf-info-skel-chip" />
              <span className="etf-info-skel etf-info-skel-chip" />
            </div>
            <div className="etf-info-skel etf-info-skel-line" />
            <div className="etf-info-skel etf-info-skel-line" />
            <div className="etf-info-skel etf-info-skel-line" style={{ width: '85%' }} />
            <div className="etf-info-skel etf-info-skel-line" style={{ width: '60%' }} />
          </div>
        )}

        {status === 'error' && (
          <div className="modal-empty">Could not load info for {ticker}.</div>
        )}

        {status === 'missing' && (
          <div className="etf-info-missing">
            <p className="etf-info-missing-title">No info available yet.</p>
            <p className="etf-info-missing-sub">
              ETF info for <strong>{ticker}</strong> hasn't been generated yet —
              check back after the next backfill run.
            </p>
          </div>
        )}

        {status === 'ready' && row && (
          <div className="etf-info-body">
            {row.name && <p className="etf-info-name">{row.name}</p>}

            <div className="etf-info-chip-row">
              {row.category && (
                <span className={`etf-info-chip ${categoryClass(row.category)}`}>
                  {row.category}
                </span>
              )}
              {row.geography && (
                <span className="etf-info-chip etf-info-geo">{row.geography}</span>
              )}
            </div>

            {(() => {
              const bullets = readJsonbStringArray(row.summary_bullets)
              if (bullets.length === 0) return null
              return (
                <ul className="etf-info-bullets">
                  {bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )
            })()}

            {row.typical_use && (
              <p className="etf-info-typical-use">
                <span className="etf-info-typical-label">Typical use:</span>{' '}
                {row.typical_use}
              </p>
            )}

            {(row.model || row.generated_at) && (
              <p className="etf-info-attribution">
                {row.model && <>Generated by {row.model}</>}
                {row.model && row.generated_at && ' · '}
                {row.generated_at && formatGeneratedAt(row.generated_at)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
