import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMomoTracker } from '../lib/useMomoTracker'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { TickerSearch } from './TickerSearch'
// MiniRangeBar import removed — Task 6 hybrid uses PositionBarWithTooltip
// as the flex-grow range visual in the main table. Top-box gainers/losers
// boxes no longer render an inline range bar either (their layout was
// already trimmed in Task 21 to TICKER · TREND · TRADE · PRICE · 1W).
import { BiasTimeframePill } from './BiasTimeframePill'
import { PositionBarWithTooltip } from './PositionBar'
import { formatPrice } from '../lib/format'
import { useTickerFocus } from '../lib/TickerContext'

const SKELETON_ROWS = 9
const MAX_CHARTS = 8

const SORT_FIELD_KEY = 'dashboard.momoSortField'
const SORT_DIR_KEY = 'dashboard.momoSortDir'
const SEARCH_KEY = 'dashboard.momoSearch'

// 5 best per user direction. 1W Δ matches the view's natural order
// (DESC NULLS LAST), so it's the default.
// "Trend" sort uses `trend_bias` (the 3-month RR signal, populated
// for all 9 MOMO stocks). `trade_bias` would be a worse sort key —
// it's null on most rows since Drake only tags a few movers per email.
const MOMO_SORT_FIELDS = [
  { value: 'pct_1w', label: '1W Δ', defaultDir: 'desc' },
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'dist_low', label: 'Closest to LRR', defaultDir: 'asc' },
  { value: 'dist_high', label: 'Closest to TRR', defaultDir: 'asc' },
  { value: 'trend', label: 'Trend', defaultDir: 'desc' },
]
const MOMO_SORT_VALUES = new Set(MOMO_SORT_FIELDS.map((f) => f.value))

// BULLISH > NEUTRAL > BEARISH so desc surfaces bullish first.
const BIAS_RANK = { BULLISH: 2, NEUTRAL: 1, BEARISH: 0 }

function loadInitialSortField() {
  try {
    const raw = localStorage.getItem(SORT_FIELD_KEY)
    if (raw && MOMO_SORT_VALUES.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read momoSortField from localStorage:', err)
  }
  return 'pct_1w'
}

function loadInitialSortDir() {
  try {
    const raw = localStorage.getItem(SORT_DIR_KEY)
    if (raw === 'asc' || raw === 'desc') return raw
  } catch (err) {
    console.warn('Failed to read momoSortDir from localStorage:', err)
  }
  return 'desc'
}

function loadInitialSearch() {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? ''
  } catch (err) {
    console.warn('Failed to read momoSearch from localStorage:', err)
    return ''
  }
}

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

// "May 18, 2026 · 8:15 am" — header date chip format.
function formatHeader(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${date} · ${time}`
}

// "+2.7%" / "-5.1%" — null when value isn't a finite number.
function formatPct(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

// Chart-key → display label. Known keys get a hand-picked label; quad_*
// and pair_* keys are decoded from the ticker(s) embedded in the key.
const CHART_LABELS = {
  performance: 'Performance',
  risk_ranges: 'Risk Ranges',
  relative_performance: 'Relative Performance',
  valuation: 'Valuation',
  rolling_correlation: 'Rolling Correlation',
  return_correlations: 'Return Correlations',
}
const CHART_PRIORITY = [
  'performance',
  'risk_ranges',
  'relative_performance',
  'valuation',
  'rolling_correlation',
  'return_correlations',
]
function chartLabel(key) {
  if (CHART_LABELS[key]) return CHART_LABELS[key]
  if (key.startsWith('quad_')) return `Quad: ${key.slice(5).toUpperCase()}`
  if (key.startsWith('pair_')) {
    return `Pair: ${key
      .slice(5)
      .split('_')
      .map((p) => p.toUpperCase())
      .join(' / ')}`
  }
  return key
}
function orderedCharts(chartImageUrls) {
  if (!chartImageUrls) return []
  const seen = new Set()
  const out = []
  for (const key of CHART_PRIORITY) {
    if (chartImageUrls[key]) {
      out.push({ key, url: chartImageUrls[key] })
      seen.add(key)
    }
  }
  const quads = Object.keys(chartImageUrls)
    .filter((k) => k.startsWith('quad_') && !seen.has(k))
    .sort()
  const pairs = Object.keys(chartImageUrls)
    .filter((k) => k.startsWith('pair_') && !seen.has(k))
    .sort()
  for (const k of [...quads, ...pairs]) {
    if (out.length >= MAX_CHARTS) break
    out.push({ key: k, url: chartImageUrls[k] })
  }
  return out.slice(0, MAX_CHARTS)
}

// === Chips ============================================================

// Mag7 chip — spec calls for green positive / red negative, which
// StatusChip's tone palette (live=green, stale=amber, closed=dim,
// idle=grey) doesn't cleanly cover. Custom pill mirrors the
// .tt-pct-pos / .tt-pct-neg pills used elsewhere on this panel.
function Mag7Chip({ pct }) {
  if (pct == null) return null
  const n = Number(pct)
  if (!Number.isFinite(n)) return null
  const cls = n > 0 ? 'tt-mag7 tt-mag7-pos' : n < 0 ? 'tt-mag7 tt-mag7-neg' : 'tt-mag7'
  return (
    <span className={cls}>
      <span className="tt-mag7-label">MAG7</span>
      <span className="tt-mag7-value">{n > 0 ? '+' : ''}{n.toFixed(1)}%</span>
    </span>
  )
}

// TrendChip + TradeChip → BiasTimeframePill (Task 5 consolidation).
// The local BiasChip helper is gone — the shared primitive carries
// the same tone-mapping logic, the same title/aria-label a11y
// behavior, and the same visual chrome. Component-local wrappers
// kept for call-site clarity ("TrendChip" reads better than
// "BiasTimeframePill timeframe='trend'" inline).
function TrendChip({ bias }) {
  return <BiasTimeframePill timeframe="trend" bias={bias} />
}
function TradeChip({ bias }) {
  return <BiasTimeframePill timeframe="trade" bias={bias} />
}


function PctChip({ pct }) {
  if (pct == null) return <span className="tt-pct tt-pct-null">—</span>
  const n = Number(pct)
  if (!Number.isFinite(n)) return <span className="tt-pct tt-pct-null">—</span>
  const txt = `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
  const cls = n > 0 ? 'tt-pct tt-pct-pos' : n < 0 ? 'tt-pct tt-pct-neg' : 'tt-pct tt-pct-zero'
  return <span className={cls}>{txt}</span>
}

function EarningsCell({ row }) {
  if (!row.earnings_this_week) return null
  return (
    <span className="tt-earn">
      <span aria-hidden="true">⚡</span>
      <span>{row.earnings_day || 'this wk'}</span>
    </span>
  )
}

// === Headline ribbon ==================================================

// Headline mover chip — these come from `headline_movers` jsonb on the
// MOMO subject, which is the TRADE call (Christian Drake's weekly tag).
// The `TRADE` label tells the user this is a trade call (not a 3-month
// trend). The bullish/bearish value isn't repeated as text because the
// pill's green/red color already conveys it.
function MoverChip({ mover }) {
  const bias = (mover.bias || '').toUpperCase()
  const cls = bias === 'BULLISH' ? 'tt-mover tt-mover-pos'
    : bias === 'BEARISH' ? 'tt-mover tt-mover-neg'
    : 'tt-mover tt-mover-neutral'
  const pctTxt = formatPct(mover.pct)
  return (
    <span
      className={cls}
      title={bias ? `TRADE: ${bias}` : undefined}
    >
      <strong>{mover.ticker}</strong>
      {pctTxt && <span className="tt-mover-pct">{pctTxt}</span>}
      {bias && <span className="tt-mover-bias">TRADE</span>}
    </span>
  )
}

function HeadlineRibbon({ movers, catalysts }) {
  const hasMovers = movers && movers.length > 0
  const hasEarnings = catalysts && catalysts.length > 0
  if (!hasMovers && !hasEarnings) return null
  return (
    <div className="tt-ribbon">
      {hasMovers && (
        <div className="tt-ribbon-movers">
          {movers.map((m, i) => (
            <MoverChip key={`${m.ticker}-${i}`} mover={m} />
          ))}
        </div>
      )}
      {hasEarnings && (
        <div className="tt-ribbon-earn">
          <span className="tt-earn-bolt" aria-hidden="true">⚡</span>
          <span className="tt-earn-label">EARNINGS:</span>
          {catalysts.map((c, i) => (
            <span key={`${c.ticker}-${i}`} className="tt-earn-item">
              <strong>{c.ticker}</strong>
              {c.when && <span> {c.when}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// === Dual top boxes: TOP GAINERS / TOP LOSERS =========================

function GainersLosersBox({ title, tone, rows, isLoser }) {
  const toneClass = tone === 'top' ? 'rerank-movers-top' : 'rerank-movers-bottom'
  return (
    <div className={`rerank-movers-card ${toneClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <h2 className="rerank-movers-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="rerank-movers-empty">No data yet.</div>
      ) : (
        <>
          {/* Column header row — shares the same grid template as the
              data rows below so labels sit dead-center over their values.
              TICKER is left-aligned to match its data cell. */}
          <div className="tt-mover-head tt-momo-mover-row" aria-hidden="true">
            <span className="tt-mover-head-cell tt-mover-head-ticker">TICKER</span>
            <span className="tt-mover-head-cell">TREND</span>
            <span className="tt-mover-head-cell">TRADE</span>
            <span className="tt-mover-head-cell">PRICE</span>
            <span className="tt-mover-head-cell">1W</span>
          </div>
          <ul className="rerank-movers-list">
            {rows.map((r) => {
              // PRICE = Finnhub live `current_price` (more useful than
              // yesterday's MOMO chart prev_close at this scale). All 9
              // Mag7+ stocks have live prices on the free tier, so the
              // `—` fallback rarely fires here.
              const price = r.current_price != null
                ? formatPrice(r.current_price)
                : formatPrice(r.prev_close)
              return (
                <li key={r.ticker} className="rerank-movers-row tt-momo-mover-row">
                  <span className="rerank-movers-ticker">{r.ticker}</span>
                  <span className="tt-mover-cell-c"><TrendChip bias={r.trend_bias} /></span>
                  <span className="tt-mover-cell-c"><TradeChip bias={r.trade_bias} /></span>
                  <span className="tt-price tt-mover-cell-c">{price}</span>
                  <span className="tt-mover-cell-c">
                    <span
                      className={`tt-pct ${
                        r.pct_change_1w == null
                          ? 'tt-pct-null'
                          : isLoser
                            ? 'tt-pct-neg'
                            : 'tt-pct-pos'
                      }`}
                    >
                      {formatPct(r.pct_change_1w) ?? '—'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// === Full-table row ===================================================

function rowTint(pct) {
  if (pct == null) return 'rerank-row-neutral'
  const n = Number(pct)
  if (!Number.isFinite(n) || n === 0) return 'rerank-row-neutral'
  return n > 0 ? 'rerank-row-up' : 'rerank-row-down'
}

function MomoRow({ row, onFocus }) {
  const tintClass = rowTint(row.pct_change_1w)
  // PositionBarWithTooltip expects buy_trade / sell_trade / prev_close.
  // The MOMO row uses low_end / top_end / prev_close — same concept,
  // different field names. Shim once at the boundary.
  const posbarRow = {
    ticker: row.ticker,
    buy_trade: row.low_end,
    sell_trade: row.top_end,
    prev_close: row.prev_close,
    signal_date: undefined,
  }
  const pct = (() => {
    if (row.prev_close == null || row.low_end == null || row.top_end == null) return null
    const px = Number(row.prev_close)
    const lo = Number(row.low_end)
    const hi = Number(row.top_end)
    if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
    const span = hi - lo
    if (span === 0) return null
    return (px - lo) / span
  })()
  return (
    <li className={`rerank-row tt-momo-row ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <button
        type="button"
        className="rerank-ticker tt-ticker-btn"
        onClick={() => onFocus?.(row.ticker)}
      >
        {row.ticker}
      </button>
      {/* TREND + TRADE rendered as separate cells so each can sit
          under its own header label. Either may be empty/null —
          empty cells render nothing rather than a "—" placeholder
          so the eye reads "this signal isn't tagged" not "we tried
          and got nothing." */}
      <span className="tt-trend-cell"><TrendChip bias={row.trend_bias} /></span>
      <span className="tt-trade-cell"><TradeChip bias={row.trade_bias} /></span>
      {/* Range bar — the row's visual anchor (Task 6 hybrid). Takes
          the flex-grow slot where the asset spacer used to live so
          it reads as the centerpiece. Numeric LRR/TRR/PREV CLOSE
          stay to the right for quick scanning. */}
      <span className="tt-momo-range">
        <PositionBarWithTooltip
          row={posbarRow}
          display={null}
          markerPct={pct}
          ghostPct={null}
          zone={null}
        />
      </span>
      <span className="tt-price">{formatPrice(row.prev_close)}</span>
      <span className="tt-price tt-price-dim">{formatPrice(row.low_end)}</span>
      <span className="tt-price tt-price-dim">{formatPrice(row.top_end)}</span>
      <span className="tt-earn-cell"><EarningsCell row={row} /></span>
      <PctChip pct={row.pct_change_1w} />
    </li>
  )
}

function MomoSkeleton() {
  return (
    <ol className="rerank-list rerank-list-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="rerank-row tt-momo-row rerank-row-skeleton" />
      ))}
    </ol>
  )
}

// === Chart gallery + lightbox =========================================

function ChartThumb({ entry, onOpen }) {
  return (
    <button
      type="button"
      className="tt-chart-thumb"
      onClick={() => onOpen(entry)}
      title={chartLabel(entry.key)}
    >
      <img src={entry.url} alt={chartLabel(entry.key)} loading="lazy" />
      <span className="tt-chart-thumb-label">{chartLabel(entry.key)}</span>
    </button>
  )
}

function ChartModal({ entry, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])
  return (
    <motion.div
      className="modal-backdrop tt-chart-backdrop"
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="tt-chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label={chartLabel(entry.key)}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <header className="tt-chart-modal-head">
          <h2>{chartLabel(entry.key)}</h2>
        </header>
        <img src={entry.url} alt={chartLabel(entry.key)} className="tt-chart-modal-img" />
      </motion.div>
    </motion.div>
  )
}

// === Panel ============================================================

export function MomoTrackerPanel() {
  const { meta, stocks, status } = useMomoTracker()
  const [chartOpen, setChartOpen] = useState(null)
  const { focusTicker } = useTickerFocus()
  // Ticker click → open the cross-tab peek anchored to MOMO so the
  // peek omits MOMO's own slot.
  const onFocus = (ticker) => focusTicker(ticker, { source: 'momo' })

  const [sortField, setSortField] = useState(loadInitialSortField)
  const [sortDir, setSortDir] = useState(loadInitialSortDir)
  const [search, setSearch] = useState(loadInitialSearch)

  useEffect(() => {
    try {
      localStorage.setItem(SORT_FIELD_KEY, sortField)
      localStorage.setItem(SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist momoSort to localStorage:', err)
    }
  }, [sortField, sortDir])

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_KEY, search)
    } catch (err) {
      console.warn('Failed to persist momoSearch to localStorage:', err)
    }
  }, [search])

  function handleSortChange(field, dir) {
    setSortField(field)
    setSortDir(dir)
  }

  const chartEntries = useMemo(
    () => (meta ? orderedCharts(meta.chartImageUrls) : []),
    [meta]
  )

  // Filter then sort for the main 9-row table.
  const visibleStocks = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q ? stocks.filter((r) => r.ticker?.toLowerCase().includes(q)) : stocks
    const sorted = list.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)
    sorted.sort((a, b) => {
      let cmp
      switch (sortField) {
        case 'pct_1w':
          cmp = numCmp(Number(a.pct_change_1w), Number(b.pct_change_1w), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          return sortDir === 'asc' ? cmp : -cmp
        case 'dist_low':
          cmp = numCmp(priceInRangePct(a), priceInRangePct(b), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'dist_high': {
          const pa = priceInRangePct(a)
          const pb = priceInRangePct(b)
          cmp = numCmp(
            pa == null ? null : 1 - pa,
            pb == null ? null : 1 - pb,
            sortDir
          )
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'trend': {
          const ra = BIAS_RANK[(a.trend_bias ?? '').toUpperCase()] ?? -1
          const rb = BIAS_RANK[(b.trend_bias ?? '').toUpperCase()] ?? -1
          cmp = sortDir === 'asc' ? ra - rb : rb - ra
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        default:
          return tieBreak(a, b)
      }
    })
    return sorted
  }, [stocks, search, sortField, sortDir])

  // TOP GAINERS = first 5 rows of view (DESC by pct_change_1w),
  // filtered to strictly-positive values (so a flat market doesn't list
  // negatives in the gainers box).
  // TOP LOSERS  = last 5 rows reversed, filtered to strictly-negative
  // values. Null pct_change_1w rows fall to bottom of loser list per
  // spec — but we currently drop them since 9 rows all have data.
  const { gainers, losers } = useMemo(() => {
    if (!stocks.length) return { gainers: [], losers: [] }
    const withVal = stocks.filter((r) => {
      if (r.pct_change_1w == null) return false
      const n = Number(r.pct_change_1w)
      return Number.isFinite(n)
    })
    const pos = withVal.filter((r) => Number(r.pct_change_1w) > 0)
    const neg = withVal.filter((r) => Number(r.pct_change_1w) < 0)
    // Source already sorted DESC by pct. Positives are already top→bottom
    // most-positive-first. Negatives are bottom of source — reverse so
    // most-negative is on top of the loser box.
    return {
      gainers: pos.slice(0, 5),
      losers: [...neg].reverse().slice(0, 5),
    }
  }, [stocks])

  return (
    <div className="panel rerank-panel momo-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>MOMO Tracker — Mag7+ Daily Quickread</h1>
          <div className="status-row">
            {status === 'ready' && meta?.publishAt && (
              <StatusChip value={formatHeader(meta.publishAt)} dot={false} />
            )}
            {status === 'ready' && <Mag7Chip pct={meta?.mag7Pct} />}
            {status === 'empty' && (
              <StatusChip label="Tracker" value="No data yet" dot={false} />
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
              ariaLabel="Search MOMO tickers"
            />
            <SortControl
              fields={MOMO_SORT_FIELDS}
              field={sortField}
              dir={sortDir}
              onChange={handleSortChange}
              ariaLabel="MOMO sort"
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

      {status === 'loading' && <MomoSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load MOMO Tracker data.</div>
      )}

      {status === 'empty' && (
        <div className="rerank-empty">
          <p className="rerank-empty-title">No data yet.</p>
        </div>
      )}

      {status === 'ready' && meta && (
        <>
          <HeadlineRibbon movers={meta.headlineMovers} catalysts={meta.earningsCatalysts} />

          {meta.themeNote && (
            <p className="tt-theme">{meta.themeNote}</p>
          )}

          <section className="rerank-movers" aria-label="Top gainers and losers">
            <GainersLosersBox title="TOP GAINERS (1W)" tone="top" rows={gainers} isLoser={false} />
            <GainersLosersBox title="TOP LOSERS (1W)" tone="bottom" rows={losers} isLoser={true} />
          </section>

          <div className="rerank-list-head tt-momo-row" aria-hidden="true">
            <span className="rerank-ticker">TICKER</span>
            <span className="tt-trend-head">TREND</span>
            <span className="tt-trade-head">TRADE</span>
            <span className="tt-range-head">RANGE</span>
            <span className="tt-price">PREV CLOSE</span>
            <span className="tt-price">LRR</span>
            <span className="tt-price">TRR</span>
            <span className="tt-earn-head">EARNINGS</span>
            <span className="tt-pct-head">1W Δ</span>
          </div>

          <ol className="rerank-list">
            {visibleStocks.map((r) => (
              <MomoRow key={r.ticker} row={r} onFocus={onFocus} />
            ))}
          </ol>
          {visibleStocks.length === 0 && search.trim() && (
            <div className="state">
              No tickers match &quot;{search.trim()}&quot;.
            </div>
          )}

          {chartEntries.length > 0 && (
            <section className="tt-chart-strip" aria-label="Tracker charts">
              {chartEntries.map((entry) => (
                <ChartThumb key={entry.key} entry={entry} onOpen={setChartOpen} />
              ))}
            </section>
          )}

          {meta.authors && meta.authors.length > 0 && (
            <footer className="tt-author-footer">
              {meta.authors.map((a, i) => (
                <span key={`${a.name}-${i}`} className="tt-author">
                  {i > 0 && <span className="tt-author-sep"> · </span>}
                  <span className="tt-author-name">{a.name}</span>
                  {a.handle && <span className="tt-author-handle"> {a.handle}</span>}
                </span>
              ))}
            </footer>
          )}
        </>
      )}

      {chartOpen && (
        <ChartModal entry={chartOpen} onClose={() => setChartOpen(null)} />
      )}
    </div>
  )
}
