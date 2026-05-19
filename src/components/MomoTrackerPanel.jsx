import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMomoTracker } from '../lib/useMomoTracker'
import { formatPrice } from '../lib/format'

// "May 18, 2026 · 8:15 am" header timestamp.
function formatHeaderDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${date} · ${time}`
}

// Title-case map for known chart keys → display label.
const CHART_LABELS = {
  performance: 'Performance',
  risk_ranges: 'Risk Ranges',
  relative_performance: 'Relative Performance',
  valuation: 'Valuation',
  rolling_correlation: 'Rolling Correlation',
  return_correlations: 'Return Correlations',
}

// Priority order for chart thumbnails. After the named slots, any
// remaining `quad_*` then `pair_*` keys are appended in alpha order.
const CHART_PRIORITY = [
  'performance',
  'risk_ranges',
  'relative_performance',
  'valuation',
  'rolling_correlation',
  'return_correlations',
]

const MAX_CHARTS = 8

function orderedChartEntries(chartImageUrls) {
  if (!chartImageUrls) return []
  const seen = new Set()
  const out = []
  for (const key of CHART_PRIORITY) {
    if (chartImageUrls[key]) {
      out.push({ key, url: chartImageUrls[key] })
      seen.add(key)
    }
  }
  // Then any quad_*, then pair_*, alpha within each group.
  const quads = Object.keys(chartImageUrls)
    .filter((k) => k.startsWith('quad_') && !seen.has(k))
    .sort()
  const pairs = Object.keys(chartImageUrls)
    .filter((k) => k.startsWith('pair_') && !seen.has(k))
    .sort()
  for (const k of [...quads, ...pairs]) {
    if (out.length >= MAX_CHARTS) break
    out.push({ key: k, url: chartImageUrls[k] })
    seen.add(k)
  }
  return out.slice(0, MAX_CHARTS)
}

function chartLabel(key) {
  if (CHART_LABELS[key]) return CHART_LABELS[key]
  if (key.startsWith('quad_')) {
    return `Quad: ${key.slice(5).toUpperCase()}`
  }
  if (key.startsWith('pair_')) {
    return `Pair: ${key
      .slice(5)
      .split('_')
      .map((p) => p.toUpperCase())
      .join(' / ')}`
  }
  return key
}

// Format +2.7% / -5.1%. Returns null when input isn't a finite number.
function formatPct(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

// Range bar position pct, clamped to [0, 1] for the visual marker.
// Returns { pct, broken, direction } where broken=true if the raw
// value was outside [0, 1] — caller renders an edge arrow.
function rangeMarker(prevClose, lowEnd, topEnd) {
  if (prevClose == null || lowEnd == null || topEnd == null) return null
  const px = Number(prevClose)
  const lo = Number(lowEnd)
  const hi = Number(topEnd)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  const raw = (px - lo) / span
  const clamped = Math.max(0, Math.min(1, raw))
  return {
    pct: clamped,
    broken: raw < 0 || raw > 1,
    direction: raw < 0 ? 'below' : raw > 1 ? 'above' : 'in',
  }
}

// --- Headline ribbon pieces -----------------------------------------

function Mag7Chip({ pct }) {
  if (pct == null) return null
  const n = Number(pct)
  if (!Number.isFinite(n)) return null
  const sign = n > 0 ? '+' : ''
  const cls = n > 0 ? 'momo-chip-mag7 momo-pos' : 'momo-chip-mag7 momo-neg'
  return (
    <span className={cls}>
      Mag7 <strong>{sign}{n.toFixed(1)}%</strong>
    </span>
  )
}

function MoverChip({ mover }) {
  const bias = (mover.bias || '').toUpperCase()
  const isBull = bias === 'BULLISH'
  const isBear = bias === 'BEARISH'
  const cls = isBull ? 'momo-chip-mover momo-pos'
    : isBear ? 'momo-chip-mover momo-neg'
    : 'momo-chip-mover momo-neutral'
  const pctTxt = formatPct(mover.pct)
  return (
    <span className={cls}>
      <strong>{mover.ticker}</strong>
      {pctTxt && <span className="momo-chip-pct">{pctTxt}</span>}
      {bias && <span className="momo-chip-bias">{bias}</span>}
    </span>
  )
}

function EarningsRibbon({ catalysts }) {
  if (!catalysts || catalysts.length === 0) return null
  return (
    <span className="momo-earnings-ribbon">
      <span className="momo-earnings-bolt" aria-hidden="true">⚡</span>
      <span className="momo-earnings-label">EARNINGS:</span>
      {catalysts.map((c, i) => (
        <span key={`${c.ticker}-${i}`} className="momo-earnings-item">
          <strong>{c.ticker}</strong>
          {c.when && <span> {c.when}</span>}
        </span>
      ))}
    </span>
  )
}

function HeadlineRibbon({ meta }) {
  const hasMag7 = meta.mag7Pct != null
  const hasMovers = meta.headlineMovers && meta.headlineMovers.length > 0
  const hasEarnings = meta.earningsCatalysts && meta.earningsCatalysts.length > 0
  if (!hasMag7 && !hasMovers && !hasEarnings) return null
  return (
    <div className="momo-ribbon">
      <Mag7Chip pct={meta.mag7Pct} />
      {hasMovers && (
        <div className="momo-movers">
          {meta.headlineMovers.map((m, i) => (
            <MoverChip key={`${m.ticker}-${i}`} mover={m} />
          ))}
        </div>
      )}
      <EarningsRibbon catalysts={meta.earningsCatalysts} />
    </div>
  )
}

// --- Stock card -----------------------------------------------------

function RangeBar({ marker, lowEnd, topEnd }) {
  if (!marker) {
    // Fallback for null low/top — dashed line with no endpoints.
    return (
      <div className="momo-range">
        <div className="momo-range-track momo-range-track-dashed" />
      </div>
    )
  }
  const arrowSide = marker.direction === 'below' ? 'left' : marker.direction === 'above' ? 'right' : null
  return (
    <div className="momo-range">
      <div className="momo-range-track">
        <div
          className={`momo-range-marker${marker.broken ? ' momo-range-marker-broken' : ''}`}
          style={{ left: `${marker.pct * 100}%` }}
          aria-hidden="true"
        />
        {arrowSide && (
          <span className={`momo-range-arrow momo-range-arrow-${arrowSide}`} aria-hidden="true">
            {arrowSide === 'left' ? '◂' : '▸'}
          </span>
        )}
      </div>
      <div className="momo-range-labels">
        <span className="momo-range-end">{formatPrice(lowEnd)}</span>
        <span className="momo-range-end">{formatPrice(topEnd)}</span>
      </div>
    </div>
  )
}

function BiasChip({ bias }) {
  if (!bias) return null
  const b = bias.toUpperCase()
  const cls = b === 'BULLISH' ? 'momo-bias momo-pos'
    : b === 'BEARISH' ? 'momo-bias momo-neg'
    : 'momo-bias momo-neutral'
  return <span className={cls}>{b}</span>
}

function EarningsChip({ row }) {
  if (!row.earnings_this_week) return null
  return (
    <span className="momo-earnings-chip">
      <span aria-hidden="true">⚡</span> {row.earnings_day || 'this wk'}
    </span>
  )
}

function StockCard({ row, extremeClass, index }) {
  const marker = rangeMarker(row.prev_close, row.low_end, row.top_end)
  const pctStr = formatPct(row.pct_change_1w)
  const pctNum = Number(row.pct_change_1w)
  const pctCls = Number.isFinite(pctNum)
    ? pctNum > 0
      ? 'momo-pct momo-pos'
      : pctNum < 0
        ? 'momo-pct momo-neg'
        : 'momo-pct momo-neutral'
    : 'momo-pct momo-neutral'
  return (
    <motion.article
      className={`momo-card ${extremeClass}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.02, ease: 'easeOut' }}
    >
      <div className="card-bg" aria-hidden="true" />
      <header className="momo-card-head">
        <span className="momo-card-ticker">{row.ticker}</span>
        <span className={pctCls}>{pctStr ?? '—'}</span>
      </header>
      <div className="momo-card-price-row">
        <span className="momo-card-price-label">PREV CLOSE</span>
        <span className="momo-card-price">{formatPrice(row.prev_close)}</span>
      </div>
      <RangeBar marker={marker} lowEnd={row.low_end} topEnd={row.top_end} />
      <footer className="momo-card-foot">
        <BiasChip bias={row.bias} />
        <EarningsChip row={row} />
      </footer>
    </motion.article>
  )
}

// --- Chart strip + modal -------------------------------------------

function ChartThumb({ entry, onOpen }) {
  return (
    <button
      type="button"
      className="momo-chart-thumb"
      onClick={() => onOpen(entry)}
      title={chartLabel(entry.key)}
    >
      <img src={entry.url} alt={chartLabel(entry.key)} loading="lazy" />
      <span className="momo-chart-thumb-label">{chartLabel(entry.key)}</span>
    </button>
  )
}

function ChartModal({ entry, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
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
      className="modal-backdrop momo-chart-backdrop"
      onClick={onClose}
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="momo-chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label={chartLabel(entry.key)}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <header className="momo-chart-modal-head">
          <h2>{chartLabel(entry.key)}</h2>
        </header>
        <img src={entry.url} alt={chartLabel(entry.key)} className="momo-chart-modal-img" />
      </motion.div>
    </motion.div>
  )
}

// --- Panel ----------------------------------------------------------

function MomoSkeleton() {
  return (
    <>
      <div className="momo-skel-ribbon" />
      <div className="momo-skel-theme" />
      <div className="momo-card-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="momo-card momo-card-skeleton" />
        ))}
      </div>
      <div className="momo-chart-strip">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="momo-chart-thumb momo-chart-thumb-skeleton" />
        ))}
      </div>
    </>
  )
}

export function MomoTrackerPanel() {
  const { meta, stocks, status } = useMomoTracker()
  const [chartOpen, setChartOpen] = useState(null)

  const chartEntries = useMemo(
    () => (meta ? orderedChartEntries(meta.chartImageUrls) : []),
    [meta]
  )

  // Top / bottom card emphasis — biggest gainer + biggest loser get
  // a subtle border tint. Computed from sign of pct_change_1w so we
  // don't tint when the extreme is 0% or null.
  const topTicker = stocks[0]?.ticker
  const bottomTicker = stocks[stocks.length - 1]?.ticker
  const topPct = Number(stocks[0]?.pct_change_1w)
  const bottomPct = Number(stocks[stocks.length - 1]?.pct_change_1w)

  function extremeClassFor(row) {
    if (row.ticker === topTicker && Number.isFinite(topPct) && topPct > 0) {
      return 'momo-card-top'
    }
    if (row.ticker === bottomTicker && Number.isFinite(bottomPct) && bottomPct < 0) {
      return 'momo-card-bottom'
    }
    return ''
  }

  return (
    <div className="panel momo-panel">
      <header className="topbar momo-topbar">
        <div className="topbar-left">
          <h1>
            <span className="momo-header-eyebrow">MOMO TRACKER</span>
            {meta?.publishAt && (
              <span className="momo-header-date"> · {formatHeaderDate(meta.publishAt)}</span>
            )}
          </h1>
        </div>
        {status === 'ready' && meta?.feedItemUrl && (
          <a
            href={meta.feedItemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="momo-feed-link"
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
        <div className="momo-empty">
          <p className="momo-empty-title">No MOMO Tracker data yet.</p>
          <p className="momo-empty-sub">
            The ingestion workflow hasn't run yet. The first tracker will
            appear here once the latest MOMO Tracker email has been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && meta && (
        <>
          {meta.ocrStatus && meta.ocrStatus !== 'ok' && (
            <div className="momo-ocr-banner">
              Latest tracker is being processed — showing previous snapshot if available.
            </div>
          )}

          <HeadlineRibbon meta={meta} />

          {meta.themeNote && (
            <p className="momo-theme">{meta.themeNote}</p>
          )}

          <section className="momo-card-grid">
            {stocks.map((row, i) => (
              <StockCard
                key={row.ticker}
                row={row}
                index={i}
                extremeClass={extremeClassFor(row)}
              />
            ))}
          </section>

          {chartEntries.length > 0 && (
            <section className="momo-chart-strip" aria-label="Tracker charts">
              {chartEntries.map((entry) => (
                <ChartThumb key={entry.key} entry={entry} onOpen={setChartOpen} />
              ))}
            </section>
          )}

          {meta.authors && meta.authors.length > 0 && (
            <footer className="momo-footer">
              {meta.authors.map((a, i) => (
                <span key={`${a.name}-${i}`} className="momo-author">
                  {i > 0 && <span className="momo-author-sep"> · </span>}
                  <span className="momo-author-name">{a.name}</span>
                  {a.handle && <span className="momo-author-handle"> {a.handle}</span>}
                </span>
              ))}
            </footer>
          )}
        </>
      )}

      {/* No AnimatePresence wrapper — it was failing to unmount the
          exiting child cleanly (state did flip to null, but the modal
          DOM stuck around). Direct conditional render is simpler and
          the entrance animation on motion.div still plays on mount. */}
      {chartOpen && (
        <ChartModal entry={chartOpen} onClose={() => setChartOpen(null)} />
      )}
    </div>
  )
}
