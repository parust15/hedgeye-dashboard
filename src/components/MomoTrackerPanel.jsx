import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMomoTracker } from '../lib/useMomoTracker'
import { StatusChip } from './StatusChip'
import { MiniRangeBar } from './InvestingIdeasPanel'
import { formatPrice } from '../lib/format'

const SKELETON_ROWS = 9
const MAX_CHARTS = 8

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

function BiasChip({ bias }) {
  if (!bias) return null
  const b = bias.toUpperCase()
  const cls = b === 'BULLISH' ? 'tt-bias tt-bias-pos'
    : b === 'BEARISH' ? 'tt-bias tt-bias-neg'
    : 'tt-bias tt-bias-neutral'
  return <span className={cls}>{b}</span>
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

function MoverChip({ mover }) {
  const bias = (mover.bias || '').toUpperCase()
  const cls = bias === 'BULLISH' ? 'tt-mover tt-mover-pos'
    : bias === 'BEARISH' ? 'tt-mover tt-mover-neg'
    : 'tt-mover tt-mover-neutral'
  const pctTxt = formatPct(mover.pct)
  return (
    <span className={cls}>
      <strong>{mover.ticker}</strong>
      {pctTxt && <span className="tt-mover-pct">{pctTxt}</span>}
      {bias && <span className="tt-mover-bias">{bias}</span>}
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
        <ul className="rerank-movers-list">
          {rows.map((r) => (
            <li key={r.ticker} className="rerank-movers-row tt-momo-mover-row">
              <span className="rerank-movers-ticker">{r.ticker}</span>
              <span className="rerank-movers-asset tt-mover-bias-cell">
                <BiasChip bias={r.bias} />
              </span>
              <span className="tt-price">{formatPrice(r.prev_close)}</span>
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
            </li>
          ))}
        </ul>
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

function MomoRow({ row }) {
  const tintClass = rowTint(row.pct_change_1w)
  return (
    <li className={`rerank-row tt-momo-row ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-ticker">{row.ticker}</span>
      <span className="rerank-asset" aria-hidden="true" />
      <span className="tt-price">{formatPrice(row.prev_close)}</span>
      <span className="tt-price tt-price-dim">{formatPrice(row.low_end)}</span>
      <span className="tt-price tt-price-dim">{formatPrice(row.top_end)}</span>
      <MiniRangeBar
        prevClose={row.prev_close}
        lowEnd={row.low_end}
        topEnd={row.top_end}
        ariaLabel={`${row.ticker} range`}
      />
      <span className="tt-bias-cell"><BiasChip bias={row.bias} /></span>
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

  const chartEntries = useMemo(
    () => (meta ? orderedCharts(meta.chartImageUrls) : []),
    [meta]
  )

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
            <span className="rerank-asset" />
            <span className="tt-price">PREV CLOSE</span>
            <span className="tt-price">LRR</span>
            <span className="tt-price">TRR</span>
            <span className="tt-range-head">RANGE</span>
            <span className="tt-bias-head">BIAS</span>
            <span className="tt-earn-head">EARNINGS</span>
            <span className="tt-pct-head">1W Δ</span>
          </div>

          <ol className="rerank-list">
            {stocks.map((r) => (
              <MomoRow key={r.ticker} row={r} />
            ))}
          </ol>

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
