import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LABEL } from '../lib/labels'
import { useInvestingIdeas } from '../lib/useInvestingIdeas'
import { useTickerFocus } from '../lib/TickerContext'
import { BiasTimeframePill } from './BiasTimeframePill'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { TickerSearch } from './TickerSearch'
import { formatPrice } from '../lib/format'

const SKELETON_ROWS = 12

const SORT_FIELD_KEY = 'dashboard.iiSortField'
const SORT_DIR_KEY = 'dashboard.iiSortDir'
const SEARCH_KEY = 'dashboard.iiSearch'

// 5 best per user direction. "side_pos" is the natural longs-then-shorts
// order (long L=0 / short L=1, then position ASC within each side) —
// the publishing convention from Hedgeye.
const II_SORT_FIELDS = [
  { value: 'side_pos', label: 'Side & position', defaultDir: 'asc' },
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'sector', label: 'Sector', defaultDir: 'asc' },
  { value: 'dist_low', label: 'Closest to LRR', defaultDir: 'asc' },
  { value: 'dist_high', label: 'Closest to TRR', defaultDir: 'asc' },
]
const II_SORT_VALUES = new Set(II_SORT_FIELDS.map((f) => f.value))

function loadInitialSortField() {
  try {
    const raw = localStorage.getItem(SORT_FIELD_KEY)
    if (raw && II_SORT_VALUES.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read iiSortField from localStorage:', err)
  }
  return 'side_pos'
}

function loadInitialSortDir() {
  try {
    const raw = localStorage.getItem(SORT_DIR_KEY)
    if (raw === 'asc' || raw === 'desc') return raw
  } catch (err) {
    console.warn('Failed to read iiSortDir from localStorage:', err)
  }
  return 'asc'
}

function loadInitialSearch() {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? ''
  } catch (err) {
    console.warn('Failed to read iiSearch from localStorage:', err)
    return ''
  }
}

// Position-in-range pct (0 = at low_end, 1 = at top_end). Null when
// any input is missing or the span is zero. Guards Number(null)===0.
function priceInRangePct(row) {
  if (row.prev_close == null || row.low_end == null || row.top_end == null) return null
  const px = Number(row.prev_close)
  const lo = Number(row.low_end)
  const hi = Number(row.top_end)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  return (px - lo) / span
}

function numCmp(a, b, dir) {
  const aNull = a == null || !Number.isFinite(a)
  const bNull = b == null || !Number.isFinite(b)
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  return dir === 'asc' ? a - b : b - a
}

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
        <>
          {/* Column header row matches the data grid template below. */}
          <div className="tt-mover-head tt-ii-mover-row" aria-hidden="true">
            <span className="tt-mover-head-cell tt-mover-head-ticker">{LABEL.column.ticker}</span>
            <span className="tt-mover-head-cell">{LABEL.column.sector}</span>
            <span className="tt-mover-head-cell">{LABEL.column.prevClose}</span>
            <span className="tt-mover-head-cell">{LABEL.column.range}</span>
          </div>
          <ul className="rerank-movers-list">
            {rows.map((r) => (
              <li key={r.ticker} className="rerank-movers-row tt-ii-mover-row">
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-asset tt-mover-cell-c" title={r.sector ?? ''}>
                  {r.sector ?? '—'}
                </span>
                <span className="tt-price tt-mover-cell-c">{formatPrice(r.prev_close)}</span>
                <span className="tt-mover-cell-c">
                  <span className="tt-range-chip">
                    {formatPrice(r.low_end)} – {formatPrice(r.top_end)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// === Side pill ========================================================
// Replaced the bespoke L/S round pill with the shared BiasTimeframePill
// so direction-via-color is consistent across the dashboard. The pill
// shows "TREND" since side IS the timeframe-trend signal for an Idea
// (long-only or short-only book per the newsletter). The original
// L/S circle pill chrome (.tt-side / .tt-side-long / .tt-side-short)
// is kept in CSS for any future caller — not used here anymore.
function SidePill({ side }) {
  // Normalize 'long' / 'short' → BiasTimeframePill's bias vocabulary,
  // which it auto-maps to the green/red tone.
  const bias = side === 'long' ? 'BULLISH' : side === 'short' ? 'BEARISH' : null
  return <BiasTimeframePill timeframe="trend" bias={bias} size="sm" />
}

// === Single full-table row + expansion ================================
function IdeaRow({ row, isOpen, onToggle, onFocus }) {
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
        <button
          type="button"
          className="rerank-ticker tt-ticker-btn"
          onClick={(e) => {
            // Don't bubble to the row's onClick (which expands/collapses).
            // The ticker-button intent is to open the cross-tab peek;
            // expansion is the rest-of-row's intent.
            e.stopPropagation()
            onFocus?.(row.ticker)
          }}
        >
          {row.ticker}
        </button>
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
  const { focusTicker } = useTickerFocus()
  const onFocus = (ticker) => focusTicker(ticker, { source: 'investing-ideas' })

  const [sortField, setSortField] = useState(loadInitialSortField)
  const [sortDir, setSortDir] = useState(loadInitialSortDir)
  const [search, setSearch] = useState(loadInitialSearch)

  useEffect(() => {
    try {
      localStorage.setItem(SORT_FIELD_KEY, sortField)
      localStorage.setItem(SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist iiSort to localStorage:', err)
    }
  }, [sortField, sortDir])

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_KEY, search)
    } catch (err) {
      console.warn('Failed to persist iiSearch to localStorage:', err)
    }
  }, [search])

  function handleSortChange(field, dir) {
    setSortField(field)
    setSortDir(dir)
  }

  // Top-box rows: first 5 of each side. Anchored to natural order
  // regardless of sort/search — these are the "5 LONGS / 5 SHORTS"
  // reference list, not "5 longs in current view".
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

  // Filter then sort.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q
      ? allRows.filter((r) => {
          if (r.ticker?.toLowerCase().includes(q)) return true
          if (r.sector?.toLowerCase().includes(q)) return true
          return false
        })
      : allRows
    const sorted = list.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)
    sorted.sort((a, b) => {
      let cmp
      switch (sortField) {
        case 'side_pos': {
          // Long (0) < Short (1) so longs render first in asc.
          const sa = a.side === 'long' ? 0 : 1
          const sb = b.side === 'long' ? 0 : 1
          if (sa !== sb) return sortDir === 'asc' ? sa - sb : sb - sa
          cmp = (a.position ?? 0) - (b.position ?? 0)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          return sortDir === 'asc' ? cmp : -cmp
        case 'sector': {
          const sa = (a.sector ?? '').toLowerCase()
          const sb = (b.sector ?? '').toLowerCase()
          if (!sa && !sb) return tieBreak(a, b)
          if (!sa) return 1
          if (!sb) return -1
          cmp = sa.localeCompare(sb)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'dist_low':
          // Distance to LRR = position pct (0 = at LRR). Smaller = closer.
          cmp = numCmp(priceInRangePct(a), priceInRangePct(b), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'dist_high': {
          // Distance to TRR = 1 - position pct. Smaller = closer to TRR.
          const pa = priceInRangePct(a)
          const pb = priceInRangePct(b)
          cmp = numCmp(
            pa == null ? null : 1 - pa,
            pb == null ? null : 1 - pb,
            sortDir
          )
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        default:
          return tieBreak(a, b)
      }
    })
    return sorted
  }, [allRows, search, sortField, sortDir])

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
        {status === 'ready' && (
          <div className="tt-controls">
            <TickerSearch
              value={search}
              onChange={setSearch}
              ariaLabel="Search Investing Ideas tickers"
            />
            <SortControl
              fields={II_SORT_FIELDS}
              field={sortField}
              dir={sortDir}
              onChange={handleSortChange}
              ariaLabel="Investing Ideas sort"
            />
            {meta?.feedItemUrl && (
              <a
                href={meta.feedItemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tt-feed-link"
              >
                view on Hedgeye →
              </a>
            )}
          </div>
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
            <span className="tt-side-head">{LABEL.column.side}</span>
            <span className="rerank-rank tt-ii-pos">{LABEL.column.pos}</span>
            <span className="rerank-ticker">{LABEL.column.ticker}</span>
            <span className="rerank-asset">{LABEL.column.sector}</span>
            <span className="tt-price">{LABEL.column.prevClose}</span>
            <span className="tt-price">{LABEL.column.lrr}</span>
            <span className="tt-price">{LABEL.column.trr}</span>
            <span className="tt-range-head">{LABEL.column.range}</span>
          </div>

          <ol className="rerank-list">
            {visibleRows.map((r) => (
              <IdeaRow
                key={`${r.side}-${r.position}-${r.ticker}`}
                row={r}
                isOpen={openTicker === r.ticker}
                onToggle={toggleOpen}
                onFocus={onFocus}
              />
            ))}
          </ol>
          {visibleRows.length === 0 && search.trim() && (
            <div className="state">
              No tickers match &quot;{search.trim()}&quot;.
            </div>
          )}
        </>
      )}
    </div>
  )
}
