import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useInvestingIdeas } from '../lib/useInvestingIdeas'
import { StatusChip } from './StatusChip'
import { formatPrice } from '../lib/format'

const SKELETON_ROWS = 12

// "May 18, 2026" — used in the header chip + section labels.
function formatLong(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Range marker fraction (0..1) of prev_close inside [low_end, top_end].
// Null whenever any input is missing or the span is zero. The bar UI
// clamps to [0, 1] separately — this just returns the raw fraction.
function markerPct(prevClose, lowEnd, topEnd) {
  if (prevClose == null || lowEnd == null || topEnd == null) return null
  const px = Number(prevClose)
  const lo = Number(lowEnd)
  const hi = Number(topEnd)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  return (px - lo) / span
}

// Inline ~120px range bar shared by all three new panels. Reuses the
// `.posbar` / `.posbar-track` / `.posbar-marker` primitives Risk Ranges
// already styles so the marker dot + zone gradient + tick rhythm are
// pixel-identical with the RR cards. Wrapped in `.tt-range` so we can
// constrain width without leaking into the RR styles.
export function MiniRangeBar({ prevClose, lowEnd, topEnd, ariaLabel }) {
  const pct = markerPct(prevClose, lowEnd, topEnd)
  if (pct == null) {
    return (
      <div className="tt-range" aria-label={ariaLabel}>
        <div className="posbar disabled">
          <div className="posbar-track" />
        </div>
      </div>
    )
  }
  const clamped = Math.max(0, Math.min(1, pct))
  return (
    <div className="tt-range" aria-label={ariaLabel}>
      <div className="posbar mid">
        <div className="posbar-track" />
        <div
          className="posbar-marker"
          style={{ left: `${clamped * 100}%` }}
          aria-label={`Position ${(clamped * 100).toFixed(0)}% of range`}
        />
      </div>
    </div>
  )
}

// === Dual top boxes ===================================================
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
          {rows.map((r) => (
            <li key={r.ticker} className="rerank-movers-row tt-ii-mover-row">
              <span className="rerank-movers-ticker">{r.ticker}</span>
              <span className="rerank-movers-asset" title={r.sector ?? ''}>
                {r.sector ?? '—'}
              </span>
              <span className="tt-price">{formatPrice(r.prev_close)}</span>
              <span className="tt-range-chip">
                {formatPrice(r.low_end)} – {formatPrice(r.top_end)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// === Side pill ========================================================
function SidePill({ side }) {
  const isLong = side === 'long'
  return (
    <span className={`tt-side ${isLong ? 'tt-side-long' : 'tt-side-short'}`}>
      {isLong ? 'L' : 'S'}
    </span>
  )
}

// === Single full-table row + expansion ================================
function IdeaRow({ row, isOpen, onToggle }) {
  const isLong = row.side === 'long'
  const tintClass = isLong ? 'rerank-row-up' : 'rerank-row-down'
  // The bullets array can be empty/null for tickers whose writeup uses
  // Keith's Real-Time Signal format (AMZN, DGX in the May 18 newsletter);
  // skip the bullets list entirely so the expansion stays clean.
  const bullets = Array.isArray(row.bullets) ? row.bullets : []
  const expId = `idea-expand-${row.side}-${row.position}`

  return (
    <>
      <li
        className={`rerank-row tt-ii-row ${tintClass} ${isOpen ? 'tt-ii-row-open' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={expId}
        onClick={() => onToggle(row.ticker)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle(row.ticker)
          }
        }}
      >
        <div className="card-bg" aria-hidden="true" />
        <SidePill side={row.side} />
        <span className="rerank-rank tt-ii-pos">{row.position}</span>
        <span className="rerank-ticker">{row.ticker}</span>
        <span className="rerank-asset" title={row.sector ?? ''}>
          {row.sector ?? <span className="tt-cell-dim">—</span>}
        </span>
        <span className="tt-price">{formatPrice(row.prev_close)}</span>
        <span className="tt-price tt-price-dim">{formatPrice(row.low_end)}</span>
        <span className="tt-price tt-price-dim">{formatPrice(row.top_end)}</span>
        <MiniRangeBar
          prevClose={row.prev_close}
          lowEnd={row.low_end}
          topEnd={row.top_end}
          ariaLabel={`${row.ticker} range`}
        />
      </li>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.li
            key={expId}
            id={expId}
            className="tt-ii-expand-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="tt-ii-expand-body">
              {row.thesis_summary && (
                <section className="tt-ii-section">
                  <h3 className="tt-ii-section-head">THESIS SUMMARY</h3>
                  <p className="tt-ii-section-body">{row.thesis_summary}</p>
                </section>
              )}
              {row.weekend_update && (
                <section className="tt-ii-section">
                  <h3 className="tt-ii-section-head">WEEKEND UPDATE</h3>
                  <p className="tt-ii-section-body">{row.weekend_update}</p>
                </section>
              )}
              {bullets.length > 0 && (
                <section className="tt-ii-section">
                  <ul className="tt-ii-bullets">
                    {bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </section>
              )}
              {!row.thesis_summary && !row.weekend_update && bullets.length === 0 && (
                <p className="tt-ii-empty">No detail available for this idea.</p>
              )}
            </div>
          </motion.li>
        )}
      </AnimatePresence>
    </>
  )
}

function IdeasSkeleton() {
  return (
    <ol className="rerank-list rerank-list-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="rerank-row tt-ii-row rerank-row-skeleton" />
      ))}
    </ol>
  )
}

export function InvestingIdeasPanel() {
  const { longs, shorts, meta, status } = useInvestingIdeas()
  const [openTicker, setOpenTicker] = useState(null)

  // Top-box rows: first 5 of each side. Shorts list may be shorter than
  // 5 in real data (May 18 has 7, but the spec calls for graceful empty
  // bottom rows so we just truncate).
  const { topLongs, topShorts } = useMemo(
    () => ({
      topLongs: longs.slice(0, 5),
      topShorts: shorts.slice(0, 5),
    }),
    [longs, shorts]
  )

  // Full list: longs first, then shorts. Both arrays are already
  // position-ASC sorted by the hook.
  const allRows = useMemo(() => [...longs, ...shorts], [longs, shorts])

  function toggleOpen(ticker) {
    setOpenTicker((curr) => (curr === ticker ? null : ticker))
  }

  return (
    <div className="panel rerank-panel investing-ideas-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Investing Ideas — Weekly Long/Short Book</h1>
          <div className="status-row">
            {status === 'ready' && meta?.newsletterDate && (
              <StatusChip label="Week of" value={formatLong(meta.newsletterDate)} />
            )}
            {status === 'ready' && (
              <StatusChip
                value={`${longs.length} LONG · ${shorts.length} SHORT`}
                dot={false}
              />
            )}
            {status === 'empty' && (
              <StatusChip label="Week of" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
        {status === 'ready' && meta?.feedItemUrl && (
          <a
            href={meta.feedItemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tt-feed-link"
          >
            view on Hedgeye →
          </a>
        )}
      </header>

      {status === 'loading' && <IdeasSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load Investing Ideas data.</div>
      )}

      {status === 'empty' && (
        <div className="rerank-empty">
          <p className="rerank-empty-title">No data yet.</p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <section className="rerank-movers" aria-label="Top long and short ideas">
            <TopBox title="5 LONGS" tone="top" rows={topLongs} />
            <TopBox title="5 SHORTS" tone="bottom" rows={topShorts} />
          </section>

          <div className="rerank-list-head tt-ii-row" aria-hidden="true">
            <span className="tt-side-head">SIDE</span>
            <span className="rerank-rank tt-ii-pos">POS</span>
            <span className="rerank-ticker">TICKER</span>
            <span className="rerank-asset">SECTOR</span>
            <span className="tt-price">PREV CLOSE</span>
            <span className="tt-price">LRR</span>
            <span className="tt-price">TRR</span>
            <span className="tt-range-head">RANGE</span>
          </div>

          <ol className="rerank-list">
            {allRows.map((r) => (
              <IdeaRow
                key={`${r.side}-${r.position}-${r.ticker}`}
                row={r}
                isOpen={openTicker === r.ticker}
                onToggle={toggleOpen}
              />
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
