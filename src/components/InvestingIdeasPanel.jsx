import { useState } from 'react'
import { useInvestingIdeas } from '../lib/useInvestingIdeas'
import { formatPrice } from '../lib/format'

// "May 18, 2026" — for the metadata header.
function formatNewsletterDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// "4 hours ago" / "yesterday" for ≤7 days, absolute date after. Same
// conservative phrasing as SignalStrengthPanel — keeps stale views
// from rendering misleading active-timer copy.
function formatRelativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const diffMs = Date.now() - then.getTime()
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

// Position-in-range pct for the marker. Returns null when any input
// is missing/invalid OR span is zero. Guarded with the `!= null`
// pattern called out in CLAUDE.md so Number(null) === 0 can't bite.
function rangePct(prevClose, lowEnd, topEnd) {
  if (prevClose == null || lowEnd == null || topEnd == null) return null
  const px = Number(prevClose)
  const lo = Number(lowEnd)
  const hi = Number(topEnd)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  const raw = (px - lo) / span
  return Math.max(0, Math.min(1, raw))
}

// Lightweight position bar — track + marker dot. Reuses the dashboard's
// existing `.posbar` chrome but skips the per-tick hover tooltip /
// connector that SignalCard's heavier PositionBar carries. The bar
// only renders when we can compute a valid marker position.
function PositionBar({ prevClose, lowEnd, topEnd }) {
  const pct = rangePct(prevClose, lowEnd, topEnd)
  if (pct == null) {
    return <div className="posbar disabled" aria-hidden="true" />
  }
  return (
    <div className="posbar mid">
      <div className="posbar-track" />
      <div
        className="posbar-marker"
        style={{ left: `${pct * 100}%` }}
        aria-hidden="true"
      />
    </div>
  )
}

function SectorLine({ sector, sectorHead }) {
  if (!sector && !sectorHead) return null
  return (
    <div className="ii-sector">
      {sector && <span>{sector}</span>}
      {sector && sectorHead && <span className="ii-sector-sep"> · </span>}
      {sectorHead && <span className="ii-sector-head">{sectorHead}</span>}
    </div>
  )
}

// `bullets` is a Postgres text[] — supabase-js parses to a JS array,
// but guard for null + non-array shapes defensively.
function readBullets(value) {
  if (!Array.isArray(value)) return []
  return value.filter((b) => typeof b === 'string' && b.trim().length > 0)
}

// One card. Click anywhere on the header to toggle expanded.
// Side controls the tint (--card-tint) used by the chrome + the
// price color (green for long, red for short).
function IdeaCard({ row }) {
  const [open, setOpen] = useState(false)
  const sideClass = row.side === 'long' ? 'ii-card-long' : 'ii-card-short'
  const bullets = readBullets(row.bullets)
  const hasExpansion = Boolean(row.thesis_summary || row.weekend_update || bullets.length > 0)

  return (
    <article className={`ii-card ${sideClass}${open ? ' ii-card-open' : ''}`}>
      <div className="card-bg" aria-hidden="true" />
      <button
        type="button"
        className="ii-card-head"
        onClick={() => hasExpansion && setOpen((o) => !o)}
        aria-expanded={open}
        aria-disabled={!hasExpansion}
      >
        <div className="ii-card-head-top">
          <span className="ii-ticker">{row.ticker}</span>
          <span className="ii-price">{formatPrice(row.prev_close)}</span>
          {hasExpansion && (
            <span className={`ii-caret${open ? ' open' : ''}`} aria-hidden="true">▸</span>
          )}
        </div>

        <div className="ii-posbar-section">
          <PositionBar
            prevClose={row.prev_close}
            lowEnd={row.low_end}
            topEnd={row.top_end}
          />
          <div className="ii-posbar-labels">
            <span className="posbar-end buy">{formatPrice(row.low_end)}</span>
            <span className="posbar-end sell">{formatPrice(row.top_end)}</span>
          </div>
        </div>

        <SectorLine sector={row.sector} sectorHead={row.sector_head} />
      </button>

      {open && hasExpansion && (
        <div className="ii-card-body">
          {row.thesis_summary && (
            <section className="ii-section">
              <h3 className="ii-section-title">THESIS SUMMARY</h3>
              <p className="ii-paragraph">{row.thesis_summary}</p>
            </section>
          )}
          {row.weekend_update && (
            <section className="ii-section">
              <h3 className="ii-section-title">WEEKEND UPDATE</h3>
              <p className="ii-paragraph">{row.weekend_update}</p>
            </section>
          )}
          {bullets.length > 0 && (
            <ul className="ii-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

function IdeaCardSkeleton() {
  return <article className="ii-card ii-card-skeleton" aria-hidden="true" />
}

export function InvestingIdeasPanel() {
  const { longs, shorts, meta, status } = useInvestingIdeas()

  return (
    <div className="panel ii-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Investing Ideas</h1>
          <div className="status-row ii-meta-row">
            {status === 'ready' && meta && (
              <span className="ii-meta-line">
                Week of <strong>{formatNewsletterDate(meta.newsletterDate)}</strong>
                {meta.eventAt && <> · updated {formatRelativeTime(meta.eventAt)}</>}
              </span>
            )}
            {status === 'loading' && <span className="ii-meta-line">Loading…</span>}
            {status === 'empty' && (
              <span className="ii-meta-line">No newsletter data yet</span>
            )}
            {status === 'error' && (
              <span className="ii-meta-line ii-meta-error">
                Could not load Investing Ideas data.
              </span>
            )}
          </div>
        </div>
        {status === 'ready' && meta?.feedItemUrl && (
          <a
            href={meta.feedItemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ii-feed-link"
          >
            view on Hedgeye →
          </a>
        )}
      </header>

      {status === 'loading' && (
        <section className="ii-split">
          <div className="ii-column ii-column-long">
            <h2 className="ii-column-title ii-column-title-long">LONGS</h2>
            <div className="ii-column-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <IdeaCardSkeleton key={i} />
              ))}
            </div>
          </div>
          <div className="ii-column ii-column-short">
            <h2 className="ii-column-title ii-column-title-short">SHORTS</h2>
            <div className="ii-column-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <IdeaCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </section>
      )}

      {status === 'empty' && (
        <div className="ii-empty">
          <p className="ii-empty-title">No Investing Ideas data yet.</p>
          <p className="ii-empty-sub">
            The ingestion workflow hasn't run yet. The first newsletter will
            appear here once the latest Investing Ideas email has been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <section className="ii-split">
          <div className="ii-column ii-column-long">
            <h2 className="ii-column-title ii-column-title-long">
              LONGS <span className="ii-column-count">{longs.length}</span>
            </h2>
            <div className="ii-column-grid">
              {longs.map((row) => (
                <IdeaCard key={`long-${row.ticker}`} row={row} />
              ))}
            </div>
          </div>
          <div className="ii-column ii-column-short">
            <h2 className="ii-column-title ii-column-title-short">
              SHORTS <span className="ii-column-count">{shorts.length}</span>
            </h2>
            <div className="ii-column-grid">
              {shorts.map((row) => (
                <IdeaCard key={`short-${row.ticker}`} row={row} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
