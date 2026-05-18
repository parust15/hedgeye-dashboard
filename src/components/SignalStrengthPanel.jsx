import { useMemo } from 'react'
import { useSignalStrength } from '../lib/useSignalStrength'

// "May 18, 2026" — used on every ticker box.
function formatDateAdded(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// "4 hours ago" / "3 minutes ago" / "yesterday" — used once in the
// metadata header. Conservative: only emits relative phrasing for
// the last 7 days, then falls back to absolute date so a stale view
// doesn't render misleading "37 days ago" copy that reads like an
// active timer.
function formatRelativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date()
  const diffMs = now.getTime() - then.getTime()
  const min = Math.floor(diffMs / 60000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return then.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Compact ticker box used by all three sections. Reuses the dashboard's
// .card-bg chrome (translucent dark surface + backdrop blur) so the look
// matches RR / Call / ETF cards without coupling to SignalCard's heavier
// row shape. NEW badge fires when the ticker appeared in the most recent
// Hedgeye email's "Added:" list.
function TickerBox({ row }) {
  const tintClass = row.added_in_latest_email ? 'ss-box-new' : 'ss-box-default'
  return (
    <article className={`ss-box ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <header className="ss-box-head">
        <span className="ss-box-ticker">{row.ticker}</span>
        {row.added_in_latest_email && (
          <span className="ss-box-new-badge">NEW</span>
        )}
      </header>
      <div className="ss-box-date">{formatDateAdded(row.date_added_to_list)}</div>
    </article>
  )
}

function TickerBoxSkeleton() {
  return <article className="ss-box ss-box-skeleton" aria-hidden="true" />
}

export function SignalStrengthPanel() {
  const { rows, snapshotAt, status, error } = useSignalStrength()

  // Newest 5 = last 5 of the oldest-first ordered list, reversed
  // so the freshest ticker reads first within the section.
  const { newest, oldest } = useMemo(() => {
    if (rows.length === 0) return { newest: [], oldest: [] }
    const newestSlice = rows.slice(-5).reverse()
    const oldestSlice = rows.slice(0, 5)
    return { newest: newestSlice, oldest: oldestSlice }
  }, [rows])

  return (
    <div className="panel ss-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Signal Strength</h1>
          <div className="status-row ss-status-row">
            {status === 'ready' && (
              <span className="ss-status-line">
                <strong>{rows.length}</strong> stock{rows.length === 1 ? '' : 's'}
                {snapshotAt && <> · updated {formatRelativeTime(snapshotAt)}</>}
              </span>
            )}
            {status === 'loading' && <span className="ss-status-line">Loading…</span>}
            {status === 'empty' && (
              <span className="ss-status-line">No data yet</span>
            )}
            {status === 'error' && (
              <span className="ss-status-line ss-status-error">
                Could not load signal strength data.{error ? '' : ''}
              </span>
            )}
          </div>
        </div>
      </header>

      {status === 'loading' && (
        <>
          <section className="ss-split">
            <div className="ss-section">
              <h2 className="ss-section-title">5 NEWEST</h2>
              <div className="ss-section-grid">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TickerBoxSkeleton key={i} />
                ))}
              </div>
            </div>
            <div className="ss-section">
              <h2 className="ss-section-title">5 OLDEST</h2>
              <div className="ss-section-grid">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TickerBoxSkeleton key={i} />
                ))}
              </div>
            </div>
          </section>
          <div className="ss-divider" />
          <section className="ss-full-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <TickerBoxSkeleton key={i} />
            ))}
          </section>
        </>
      )}

      {status === 'empty' && (
        <div className="ss-empty">
          <p className="ss-empty-title">No Signal Strength data yet.</p>
          <p className="ss-empty-sub">
            The ingestion workflow hasn't run yet. The first snapshot will
            appear here once the latest Signal Strength email has been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          {/* Top: two side-by-side sections (5 newest / 5 oldest). */}
          <section className="ss-split">
            <div className="ss-section ss-section-newest">
              <h2 className="ss-section-title">5 NEWEST</h2>
              <div className="ss-section-grid">
                {newest.map((row) => (
                  <TickerBox key={`new-${row.ticker}`} row={row} />
                ))}
              </div>
            </div>
            <div className="ss-section ss-section-oldest">
              <h2 className="ss-section-title">5 OLDEST</h2>
              <div className="ss-section-grid">
                {oldest.map((row) => (
                  <TickerBox key={`old-${row.ticker}`} row={row} />
                ))}
              </div>
            </div>
          </section>

          <div className="ss-divider" />

          {/* Bottom: full list, oldest first, responsive grid. */}
          <section className="ss-full-grid">
            {rows.map((row) => (
              <TickerBox key={row.ticker} row={row} />
            ))}
          </section>
        </>
      )}
    </div>
  )
}
