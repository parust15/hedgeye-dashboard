import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LABEL } from '../lib/labels'
import { safeHttpUrl } from '../lib/url'
import { useInvestingIdeas } from '../lib/useInvestingIdeas'
import { useIdeasLevels } from '../lib/useIdeasLevels'
import { useTickerFocus } from '../lib/TickerContext'
import { useMarketState } from '../lib/marketState'
import { useLivePrices } from '../lib/livePrices'
import { getPriceDisplay } from '../lib/priceDisplay'
import { BiasTimeframePill } from './BiasTimeframePill'
import { PositionBarWithTooltip } from './PositionBar'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { TickerSearch } from './TickerSearch'
import { PriceCell } from './PriceCell'
import { ActiveSetupRow, ActiveSetupRowHead } from './ActiveSetupRow'
import { quoteChip } from '../lib/quoteFresh'
import { formatPrice } from '../lib/format'
import { priceInRangePct, numCmp, getSetup } from '../lib/range'

const VIEW_KEY = 'dashboard.iiView'
const VALID_VIEWS = ['all', 'setups']

function loadInitialView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw && VALID_VIEWS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read iiView from localStorage:', err)
  }
  return 'all'
}

// 15-minute open-poll cadence per spec — II is a weekly book, so a
// tick-by-tick refresh would just spend request budget for no
// information gain. The closed-market default (5min) is kept.
const II_LIVE_POLL_MS = 15 * 60 * 1000

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

// II rows use low_end / top_end / prev_close field names — pass the
// override into the canonical priceInRangePct (default expects
// buy_trade / sell_trade as on hedgeye_signals_v).
const II_RANGE_FIELDS = { lowKey: 'low_end', highKey: 'top_end' }

// PriceCell + quoteChip live in ./PriceCell so EPP can reuse the same
// helpers — see Change 5 of the May spec.

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

// MiniRangeBar + its private markerPct(prevClose, lowEnd, topEnd) helper
// were deleted in the post-sync-primitives cleanup — both lost their
// last consumer once Task 6's hybrid layout switched II + MOMO main
// tables to PositionBarWithTooltip. The file-level priceInRangePct(row)
// below is the one helper still in use (powers the dist_low / dist_high
// sort comparators).

// === Dual top boxes ===================================================
function TopBox({ title, tone, rows, displays }) {
  const toneClass = tone === 'top' ? 'rerank-movers-top' : 'rerank-movers-bottom'
  return (
    <div className={`rerank-movers-card ${toneClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <h2 className="rerank-movers-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="rerank-movers-empty">No data yet.</div>
      ) : (
        <>
          {/* Column header row matches the data grid template below.
              "Price" replaces "Prev close" because the cell now prefers
              live when available — see PriceCell. */}
          <div className="tt-mover-head tt-ii-mover-row" aria-hidden="true">
            <span className="tt-mover-head-cell tt-mover-head-ticker">{LABEL.column.ticker}</span>
            <span className="tt-mover-head-cell">{LABEL.column.sector}</span>
            <span className="tt-mover-head-cell">Price</span>
            <span className="tt-mover-head-cell">{LABEL.column.range}</span>
          </div>
          <ul className="rerank-movers-list">
            {rows.map((r) => (
              <li key={r.ticker} className="rerank-movers-row tt-ii-mover-row">
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-asset tt-mover-cell-c" title={r.sector ?? ''}>
                  {r.sector ?? '—'}
                </span>
                <span className="tt-mover-cell-c">
                  <PriceCell prevClose={r.prev_close} display={displays?.get(r.ticker)} />
                </span>
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
const IdeaRow = memo(function IdeaRow({ row, isOpen, onToggle, onFocus, display }) {
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
        {/* Range bar — visual anchor (Task 6 hybrid). PositionBarWithTooltip
            expects buy_trade/sell_trade/prev_close; we shim once with the
            II row's low_end/top_end equivalents. Numeric LRR/TRR/PREV CLOSE
            stay to the right for quick scanning. */}
        <span className="tt-ii-range">
          <PositionBarWithTooltip
            row={{
              ticker: row.ticker,
              buy_trade: row.low_end,
              sell_trade: row.top_end,
              prev_close: row.prev_close,
              signal_date: undefined,
            }}
            display={display}
            markerPct={priceInRangePct(row, II_RANGE_FIELDS)}
            ghostPct={null}
            zone={null}
          />
        </span>
        <PriceCell prevClose={row.prev_close} display={display} />
        <span className="tt-price tt-price-dim">{formatPrice(row.low_end)}</span>
        <span className="tt-price tt-price-dim">{formatPrice(row.top_end)}</span>
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
})

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
  // hedgeye_ideas_levels is the broader 40-ticker universe used by the
  // Active Setups subtab (Change 6). Single fetch on mount, separate
  // status from the newsletter hook so each loads independently.
  const { rows: levelsRows, status: levelsStatus } = useIdeasLevels()
  const [openTicker, setOpenTicker] = useState(null)
  const [view, setView] = useState(loadInitialView)
  const { focusTicker } = useTickerFocus()
  const onFocus = useCallback(
    (ticker) => focusTicker(ticker, { source: 'investing-ideas' }),
    [focusTicker]
  )

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch (err) {
      console.warn('Failed to persist iiView to localStorage:', err)
    }
  }, [view])

  // Live quotes — 15-min market-hours cadence (II is a weekly book).
  // The market state + livePrices fetch must be at the top of the
  // component so the hook order stays stable across re-renders; the
  // displays/latestQuotedAt computations that depend on `allRows` live
  // further below, after allRows is declared.
  const market = useMarketState()
  const livePrices = useLivePrices(market.isOpen, II_LIVE_POLL_MS)

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

  // Per-ticker priceDisplay. The shim swaps low_end/top_end into the
  // canonical buy_trade/sell_trade slots so getPriceDisplay's livePct
  // calc lands in the right [0, 1] zone for II's range bar.
  const displays = useMemo(() => {
    const m = new Map()
    for (const r of allRows) {
      const signalShim = {
        buy_trade: r.low_end,
        sell_trade: r.top_end,
        prev_close: r.prev_close,
      }
      m.set(r.ticker, getPriceDisplay(signalShim, livePrices.get(r.ticker), market.isOpen))
    }
    return m
  }, [allRows, livePrices, market.isOpen])

  // Max quoted_at across displayed tickers — header chip's HH:MM stamp.
  // Spec calls for `quoted_at` specifically (not `updated_at`); both
  // columns exist on live_prices but `quoted_at` is the wall-clock the
  // exchange reported, which is what the user wants surfaced.
  const latestQuotedAt = useMemo(() => {
    let max = null
    for (const r of allRows) {
      const lp = livePrices.get(r.ticker)
      if (!lp?.quoted_at) continue
      if (!max || lp.quoted_at > max) max = lp.quoted_at
    }
    return max
  }, [allRows, livePrices])
  const quotesChip = quoteChip(displays, latestQuotedAt, market.isOpen)

  // === Active Setups (Change 6) ======================================
  // Source: hedgeye_ideas_levels (40 unique tickers across all
  // historical messages). Shim each levels row into the SignalCard-ish
  // shape getSetup expects (trend, buy_trade, sell_trade, prev_close),
  // build a parallel displays Map keyed off the same shim, then filter
  // to rows where getSetup() returns non-null.
  //
  // Sort: closest-to-threshold first within each setup type — LONGs
  // sort by ascending markerPct (closer to LRR = 0), SHORTs by
  // descending markerPct (closer to TRR = 1). Same convention RR uses.
  const setupDisplays = useMemo(() => {
    const m = new Map()
    for (const r of levelsRows) {
      const trend = r.side === 'long' ? 'BULLISH' : r.side === 'short' ? 'BEARISH' : null
      if (!trend) continue
      const shim = {
        trend,
        buy_trade: r.low_end,
        sell_trade: r.top_end,
        prev_close: r.prev_close,
      }
      m.set(r.ticker, getPriceDisplay(shim, livePrices.get(r.ticker), market.isOpen))
    }
    return m
  }, [levelsRows, livePrices, market.isOpen])

  const setupRows = useMemo(() => {
    const out = []
    for (const r of levelsRows) {
      const trend = r.side === 'long' ? 'BULLISH' : r.side === 'short' ? 'BEARISH' : null
      if (!trend) continue
      const shim = {
        ticker: r.ticker,
        side: r.side,
        trend,
        buy_trade: r.low_end,
        sell_trade: r.top_end,
        prev_close: r.prev_close,
      }
      const display = setupDisplays.get(r.ticker)
      const setup = getSetup(shim, display)
      if (!setup) continue
      const markerPct = priceInRangePct(shim)
      out.push({ ...shim, setup, markerPct })
    }
    // LONGs first (ascending markerPct = closest to LRR first), then
    // SHORTs (descending markerPct = closest to TRR first). Matches RR.
    out.sort((a, b) => {
      if (a.setup !== b.setup) return a.setup === 'LONG' ? -1 : 1
      if (a.setup === 'LONG') return (a.markerPct ?? 0) - (b.markerPct ?? 0)
      return (b.markerPct ?? 0) - (a.markerPct ?? 0)
    })
    return out
  }, [levelsRows, setupDisplays])

  const setupCount = setupRows.length

  // Filter then sort.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? allRows.filter((r) => {
          if (r.ticker?.toLowerCase().includes(q)) return true
          if (r.sector?.toLowerCase().includes(q)) return true
          return false
        })
      : allRows
    const sorted = filtered.slice()
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
          cmp = numCmp(priceInRangePct(a, II_RANGE_FIELDS), priceInRangePct(b, II_RANGE_FIELDS), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'dist_high': {
          // Distance to TRR = 1 - position pct. Smaller = closer to TRR.
          const pa = priceInRangePct(a, II_RANGE_FIELDS)
          const pb = priceInRangePct(b, II_RANGE_FIELDS)
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

  // useCallback so the IdeaRow memo can skip re-renders triggered by
  // sort/search-only state churn elsewhere in the panel.
  const toggleOpen = useCallback((ticker) => {
    setOpenTicker((curr) => (curr === ticker ? null : ticker))
  }, [])

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
            {status === 'ready' && quotesChip && (
              <StatusChip
                label={quotesChip.label}
                value={quotesChip.value}
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
            {safeHttpUrl(meta?.feedItemUrl) && (
              <a
                href={safeHttpUrl(meta?.feedItemUrl)}
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
          {/* View toggle (Change 6) — mirrors EPP's "All ETFs" /
              "⚡ Active Setups" pattern. Setups source from
              hedgeye_ideas_levels (40-ticker history) not the latest
              newsletter's 17, so the count can exceed the All-view
              total. */}
          <nav className="view-tabs" role="tablist" aria-label="Investing Ideas view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'all'}
              className={`view-tab${view === 'all' ? ' active' : ''}`}
              onClick={() => setView('all')}
            >
              All ideas
              <span className="view-tab-count">{allRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'setups'}
              className={`view-tab${view === 'setups' ? ' active' : ''}`}
              onClick={() => setView('setups')}
            >
              ⚡ Active Setups
              <span className="view-tab-count">
                {levelsStatus === 'ready' ? setupCount : '…'}
              </span>
            </button>
          </nav>

          {view === 'all' && (
            <>
              <section className="rerank-movers" aria-label="Top long and short ideas">
                <TopBox title="5 LONGS" tone="top" rows={topLongs} displays={displays} />
                <TopBox title="5 SHORTS" tone="bottom" rows={topShorts} displays={displays} />
              </section>

              <div className="rerank-list-head tt-ii-row" aria-hidden="true">
                <span className="tt-side-head">{LABEL.column.side}</span>
                <span className="rerank-rank tt-ii-pos">{LABEL.column.pos}</span>
                <span className="rerank-ticker">{LABEL.column.ticker}</span>
                <span className="rerank-asset">{LABEL.column.sector}</span>
                {/* Three-span spatial header: LRR over bar's left
                    endpoint, RANGE centered, TRR over bar's right
                    endpoint. .tt-range-head's flex layout distributes
                    them via space-between. */}
                <span className="tt-range-head">
                  <span>{LABEL.column.lrr}</span>
                  <span>{LABEL.column.range}</span>
                  <span>{LABEL.column.trr}</span>
                </span>
                {/* "Price" replaces "Prev close" because the cell now
                    prefers live when available (falls back to prev_close
                    via PriceCell). */}
                <span className="tt-price">Price</span>
                <span className="tt-price">{LABEL.column.lrr}</span>
                <span className="tt-price">{LABEL.column.trr}</span>
              </div>

              <ol className="rerank-list">
                {visibleRows.map((r) => (
                  <IdeaRow
                    key={`${r.side}-${r.position}-${r.ticker}`}
                    row={r}
                    isOpen={openTicker === r.ticker}
                    onToggle={toggleOpen}
                    onFocus={onFocus}
                    display={displays.get(r.ticker)}
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

          {view === 'setups' && (
            <>
              {levelsStatus === 'loading' && (
                <div className="state">Loading setup candidates…</div>
              )}
              {levelsStatus === 'error' && (
                <div className="state error">
                  Could not load setup data from hedgeye_ideas_levels.
                </div>
              )}
              {levelsStatus === 'ready' && setupRows.length === 0 && (
                <div className="state state-center">
                  No active setups right now. Setups appear when a long
                  idea trades near its LRR or a short trades near its TRR.
                </div>
              )}
              {levelsStatus === 'ready' && setupRows.length > 0 && (
                <>
                  <ActiveSetupRowHead />
                  <ol className="rerank-list">
                    {setupRows.map((r) => (
                      <ActiveSetupRow
                        key={r.ticker}
                        row={r}
                        display={setupDisplays.get(r.ticker)}
                        onFocus={onFocus}
                      />
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
