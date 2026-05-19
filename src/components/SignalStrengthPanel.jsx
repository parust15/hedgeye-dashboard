import { useMemo } from 'react'
import { useSignalStrength } from '../lib/useSignalStrength'
import { StatusChip } from './StatusChip'

const SKELETON_ROWS = 20

// Returns the formatted date label + integer day-count since `isoDate`.
// Mirrors EtfReRankPanel.parseAdded — kept local so the SS panel doesn't
// reach into Re-Rank's internals (and so its formatting can drift later
// without breaking Re-Rank).
function parseAdded(isoDate) {
  if (!isoDate) return { dateLabel: null, days: null }
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return { dateLabel: null, days: null }
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / dayMs))
  const dateLabel = then.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return { dateLabel, days }
}

function snapshotLabel(snapshotAt) {
  if (!snapshotAt) return null
  // snapshot_at is timestamptz — keep just the YYYY-MM-DD prefix the spec
  // calls for. Avoids timezone-shift surprises (the DB stores UTC, we
  // don't want "May 19" showing for an Asia-localized client).
  return snapshotAt.slice(0, 10)
}

// === Dual top section: 5 OLDEST / 5 NEWEST ============================
//
// Rows in the OLDEST box show TICKER · DATE · DAYS pill.
// Rows in the NEWEST box show TICKER · DATE · NEW pill if
// added_in_latest_email else DAYS pill. The middle "blank" cell is
// preserved (empty) to match Re-Rank's ASSET CLASS rhythm.
function TopBox({ title, tone, rows }) {
  const toneClass = tone === 'top' ? 'rerank-movers-top' : 'rerank-movers-bottom'
  return (
    <div className={`rerank-movers-card ${toneClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <h2 className="rerank-movers-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="rerank-movers-empty">No data yet.</div>
      ) : (
        <ul className="rerank-movers-list">
          {rows.map((r) => {
            const { dateLabel, days } = parseAdded(r.date_added_to_list)
            const isNew = tone === 'bottom' && r.added_in_latest_email === true
            return (
              <li key={r.ticker} className="rerank-movers-row tt-ss-mover-row">
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-asset" />
                <span className="tt-date">{dateLabel ?? '—'}</span>
                {isNew ? (
                  <span className="tt-newchip" aria-label="Added in latest email">NEW</span>
                ) : (
                  <span className="tt-days">{days != null ? `${days}d` : '—'}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// === Single full-table row ============================================
function SignalRow({ row, pos }) {
  const { dateLabel, days } = parseAdded(row.date_added_to_list)
  const isNew = row.added_in_latest_email === true
  // Only NEW rows carry the green left-border; everything else is neutral
  // (per spec: "no red rows"). We intentionally don't use rerank-row-down
  // anywhere here — direction has no meaning in this dataset.
  const tintClass = isNew ? 'rerank-row-up' : 'rerank-row-neutral'
  return (
    <li className={`rerank-row tt-ss-row ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-rank">{pos}</span>
      <span className="rerank-ticker">{row.ticker}</span>
      <span className="rerank-asset" aria-hidden="true" />
      <span className="tt-date">{dateLabel ?? '—'}</span>
      <span className="tt-days">{days != null ? `${days}d` : '—'}</span>
      {isNew ? (
        <span className="tt-newchip">NEW</span>
      ) : (
        <span className="tt-cell-dim">—</span>
      )}
    </li>
  )
}

function SignalSkeleton() {
  return (
    <ol className="rerank-list rerank-list-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="rerank-row tt-ss-row rerank-row-skeleton" />
      ))}
    </ol>
  )
}

export function SignalStrengthPanel() {
  const { rows, snapshotAt, status } = useSignalStrength()

  // Top box: first 5 rows (view returns oldest-first).
  // Bottom box: last 5 rows reversed (so freshest sits on top).
  const { oldest, newest } = useMemo(() => {
    if (!rows.length) return { oldest: [], newest: [] }
    return {
      oldest: rows.slice(0, 5),
      newest: rows.slice(-5).reverse(),
    }
  }, [rows])

  return (
    <div className="panel rerank-panel signal-strength-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Signal Strength — Stocks by Tenure</h1>
          <div className="status-row">
            {status === 'ready' && snapshotAt && (
              <StatusChip label="Snapshot" value={snapshotLabel(snapshotAt)} />
            )}
            {status === 'ready' && (
              <StatusChip label="Tickers" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="Snapshot" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
      </header>

      {status === 'loading' && <SignalSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load Signal Strength data.</div>
      )}

      {status === 'empty' && (
        <div className="rerank-empty">
          <p className="rerank-empty-title">No data yet.</p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <section className="rerank-movers" aria-label="Oldest and newest signal-strength tickers">
            <TopBox title="5 OLDEST" tone="top" rows={oldest} />
            <TopBox title="5 NEWEST" tone="bottom" rows={newest} />
          </section>

          <div className="rerank-list-head tt-ss-row" aria-hidden="true">
            <span className="rerank-rank">POS</span>
            <span className="rerank-ticker">TICKER</span>
            <span className="rerank-asset" />
            <span className="tt-date">DATE ADDED</span>
            <span className="tt-days">DAYS ON LIST</span>
            <span className="tt-newhead">NEW</span>
          </div>

          <ol className="rerank-list">
            {rows.map((r, i) => (
              <SignalRow key={r.ticker} row={r} pos={i + 1} />
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
