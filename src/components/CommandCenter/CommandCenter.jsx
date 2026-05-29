import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { fetchPTSearch } from '../../api/intelligence'
import './CommandCenter.css'

// The production-floor status board. Four zones, top to bottom:
//   1. Regime strip   — tower light (Quad / VIX / KM posture / tally)
//   2. Morning brief   — shift-supervisor summary (collapsible)
//   3. Action queue    — work queue: BUY / TRIM / AVOID + no-edge
//   4. What changed + key signals — change log & quality alerts
// All data arrives pre-aggregated in `intel` (daily_intelligence_v);
// `insights` is the block_key → verdict map from macro_insights.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Context-aware PT framework query built from today's regime + posture.
function buildFrameworkQuery(intel) {
  const km = intel?.km_posture
  const postureQuery =
    km === 'net_short'
      ? 'sell trim reduce risk take profits caution'
      : km === 'net_long'
        ? 'buy add position sizing growth momentum'
        : 'market regime position sizing'
  return `Quad ${intel?.quad || '2'} ${(intel?.vix_state?.bucket || '').toLowerCase()} ${postureQuery}`
}

function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

function fmtNum(x) {
  const n = num(x)
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return `${MONTHS[m - 1]} ${d}`
}

// 'YYYY-MM-DD' → 'M/D' for the compact flip log.
function fmtShortDate(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).split('-').map(Number)
  if (!m || !d) return String(iso)
  return `${m}/${d}`
}

function clampPct(x) {
  const n = num(x)
  if (n == null) return 0
  return Math.max(0, Math.min(100, n))
}

function vixDotTone(price) {
  const n = num(price)
  if (n == null) return 'neu'
  if (n < 20) return 'pos'
  if (n < 29) return 'cau'
  return 'neg'
}

function kmTone(posture) {
  const p = (posture || '').toLowerCase()
  if (p === 'net_short') return 'neg'
  if (p === 'net_long') return 'pos'
  return 'neu'
}

function trendTone(trend) {
  switch ((trend || '').toUpperCase()) {
    case 'BULLISH':
      return 'pos'
    case 'BEARISH':
      return 'neg'
    default:
      return 'neu'
  }
}

// ★★★☆☆ conviction (0–3).
function Stars({ score }) {
  const s = Math.max(0, Math.min(3, score || 0))
  return (
    <span className="cc-stars" aria-label={`conviction ${s} of 3`}>
      {'★'.repeat(s)}
      <span className="cc-stars-empty">{'☆'.repeat(3 - s)}</span>
    </span>
  )
}

function MiniBar({ pct }) {
  const v = clampPct(pct)
  return (
    <span className="cc-minibar" aria-hidden="true">
      <span className="cc-minibar-fill" style={{ width: `${v}%` }} />
      <span className="cc-minibar-dot" style={{ left: `${v}%` }} />
    </span>
  )
}

function TickerChip({ ticker, onTickerClick, title }) {
  return (
    <button
      type="button"
      className="cc-chip cc-chip-ticker"
      title={title || ticker}
      onClick={() => onTickerClick?.(ticker)}
    >
      {ticker}
    </button>
  )
}

// One BUY / TRIM action-queue row.
function ActionRow({ sig, score, verdict, onTickerClick, index }) {
  return (
    <motion.div
      className="cc-row"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.18, ease: 'easeOut' }}
    >
      <TickerChip ticker={sig.ticker} onTickerClick={onTickerClick} title={sig.name} />
      <span className="cc-price">{fmtNum(sig.price)}</span>
      <MiniBar pct={sig.pct_range} />
      <Stars score={score} />
      <span className="cc-verdict" title={verdict || ''}>
        {verdict || ''}
      </span>
    </motion.div>
  )
}

// Collapsible PT "frameworks" matched to today's regime (Key Signals).
function PTFrameworks({ units, query }) {
  const [open, setOpen] = useState(false)
  if (!units || units.length === 0) return null
  return (
    <div className="cc-pt-frameworks">
      <button
        type="button"
        className="cc-pt-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        PT FRAMEWORKS
        <span className={`cc-chev${open ? ' cc-chev-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="ptf"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            {units.map((u) => (
              <div className="cc-pt-unit" key={u.id}>
                <span className="cc-pt-unit-meta">
                  [{u.type}] {String(u.date || '').slice(0, 7)}
                </span>
                <p className="cc-pt-unit-content">“{(u.content || '').slice(0, 180)}…”</p>
              </div>
            ))}
            <div className="cc-pt-source">Tarr briefings matched to: {query}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CommandCenter({ intel, insights = {}, onTickerClick }) {
  const [briefOpen, setBriefOpen] = useState(false)
  const [ptFrameworks, setPtFrameworks] = useState([])
  const [ptPulse, setPtPulse] = useState(null)

  // PT Frameworks — fires once the daily intel is present (lazy, async;
  // setState only inside .then to avoid synchronous-effect lint).
  useEffect(() => {
    if (!intel) return undefined
    let cancelled = false
    fetchPTSearch({
      query: buildFrameworkQuery(intel),
      limit: 4,
      types: ['mental_model', 'process_lesson'],
      threshold: 0.5,
    }).then((r) => {
      if (!cancelled) setPtFrameworks(r?.units || [])
    })
    return () => {
      cancelled = true
    }
  }, [intel])

  // PT Pulse — single best match to the morning summary headline. Fires
  // once that headline (from macro_insights) is available.
  const pulseHeadline = insights.morning_summary?.headline || ''
  useEffect(() => {
    if (pulseHeadline.length <= 20) return undefined
    let cancelled = false
    fetchPTSearch({
      query: pulseHeadline.slice(0, 200),
      limit: 1,
      types: ['mental_model', 'macro_take', 'process_lesson'],
      threshold: 0.45,
    }).then((r) => {
      if (!cancelled) setPtPulse(r?.units?.[0] || null)
    })
    return () => {
      cancelled = true
    }
  }, [pulseHeadline])

  // Silently skip until the aggregation row is present.
  if (!intel) return null

  const signals = Array.isArray(intel.signals) ? intel.signals : []
  const posture = intel.signal_posture || {}
  const vix = intel.vix_state || {}
  const quad = intel.quad ?? '—'

  // --- conviction scoring ------------------------------------------
  const vixInvestable = (vix.bucket || '').toUpperCase() === 'INVESTABLE'
  const ideasTickers = new Set((intel.investing_ideas_active || []).map((i) => i.ticker))
  const onDeckTickers = new Set(
    (intel.on_deck_top5 || [])
      .filter((o) => (o.days_since_top5 ?? 99) <= 7)
      .map((o) => o.ticker)
  )
  const conviction = (sig) =>
    (ideasTickers.has(sig.ticker) ? 1 : 0) +
    (onDeckTickers.has(sig.ticker) ? 1 : 0) +
    (vixInvestable ? 1 : 0)

  const buyZone = signals
    .filter((s) => s.zone === 'buy_zone')
    .sort((a, b) => num(a.pct_range) - num(b.pct_range))
  const trimZone = signals
    .filter((s) => s.zone === 'trim_zone')
    .sort((a, b) => num(b.pct_range) - num(a.pct_range))
  const avoid = signals
    .filter((s) => s.zone === 'avoid')
    .sort((a, b) => num(a.pct_range) - num(b.pct_range))
  const midRange = signals.filter((s) => s.zone === 'mid_range')

  const verdictFor = (ticker) => insights[`driver:${ticker}`]?.short_verdict || ''

  // --- Zone 2 morning brief ----------------------------------------
  const macroHeadline = intel.macro_show_today?.headline || ''
  const summary = insights.morning_summary || null
  const summaryHeadline = summary?.headline || ''
  const themes = summary?.detail
    ? summary.detail.split('|').map((t) => t.trim()).filter(Boolean)
    : []

  // --- Zone 4 ------------------------------------------------------
  const flips = Array.isArray(intel.signal_flips_recent) ? intel.signal_flips_recent : []
  const onDeckRecent = (intel.on_deck_top5 || []).filter(
    (o) => (o.days_since_top5 ?? 99) <= 3
  )
  const highSectors = (intel.sector_stances || []).filter(
    (s) => (s.confidence || '').toLowerCase() === 'high'
  )
  // Anomaly: Brent reading aligned (positive) with USD when the dollar
  // narrative expects inverse.
  const usdAnomaly = (intel.usd_correlations || []).find(
    (c) => /brent/i.test(c.asset || '') && (c.regime || '').toLowerCase() === 'aligned'
  )
  const ptQuery = buildFrameworkQuery(intel)

  return (
    <section className="command-center" aria-label="Command Center">
      <div className="card-bg" aria-hidden="true" />

      {/* Zone 1 — Regime strip */}
      <div className="cc-regime">
        <span className={`cc-quad cc-quad-${quad}`}>Quad {quad}</span>
        <span className="cc-sep">·</span>
        <span className="cc-regime-item">
          VIX {fmtNum(vix.price)}
          <span className={`cc-dot cc-dot-${vixDotTone(vix.price)}`} aria-hidden="true" />
          <span className="cc-regime-sub">{(vix.bucket || '—').toUpperCase()}</span>
        </span>
        <span className="cc-sep">·</span>
        <span className="cc-regime-item">
          KM:{' '}
          <span className={`cc-pill cc-pill-${kmTone(intel.km_posture)}`}>
            {(intel.km_posture || '—').toUpperCase()}
          </span>
        </span>
        <span className="cc-sep">·</span>
        <span className="cc-tally">
          <span className="cc-tally-bull">BULL {posture.bull ?? 0}</span>
          {' / '}
          <span className="cc-tally-bear">BEAR {posture.bear ?? 0}</span>
          {' / '}
          <span className="cc-tally-neut">NEUT {posture.neutral ?? 0}</span>
        </span>
        <span className="cc-regime-date">{fmtDate(intel.signal_date)}</span>
      </div>

      {/* Zone 2 — Morning brief (collapsible) */}
      {(macroHeadline || summaryHeadline) && (
        <div className="cc-brief">
          <button
            type="button"
            className="cc-brief-head"
            onClick={() => setBriefOpen((o) => !o)}
            aria-expanded={briefOpen}
          >
            <div className="cc-brief-collapsed">
              {macroHeadline && <span className="cc-brief-eyebrow">{macroHeadline}</span>}
              {summaryHeadline && (
                <span className="cc-brief-line">{summaryHeadline}</span>
              )}
            </div>
            <span className={`cc-chev${briefOpen ? ' cc-chev-open' : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>
          <AnimatePresence initial={false}>
            {briefOpen && (
              <motion.div
                key="brief"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="cc-brief-detail">
                  {summaryHeadline && <p className="cc-brief-full">{summaryHeadline}</p>}
                  {themes.length > 0 && (
                    <div className="cc-brief-themes">
                      {themes.map((t, i) => (
                        <span className="cc-chip cc-chip-theme" key={i}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {ptPulse && (
                    <div className="cc-pt-pulse">
                      <span className="cc-pt-label">PT</span>
                      <span className="cc-pt-pulse-content">
                        “{(ptPulse.content || '').slice(0, 120)}…”
                      </span>
                      <span className="cc-pt-pulse-date">
                        {String(ptPulse.date || '').slice(0, 7)}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Zone 3 — Action queue */}
      <div className="cc-queue">
        <div className="cc-col">
          <div className="cc-col-head cc-col-head-buy">BUY ZONE</div>
          {buyZone.length === 0 && <p className="cc-empty">None at LRR</p>}
          {buyZone.map((s, i) => (
            <ActionRow
              key={s.ticker}
              sig={s}
              score={conviction(s)}
              verdict={verdictFor(s.ticker)}
              onTickerClick={onTickerClick}
              index={i}
            />
          ))}
        </div>

        <div className="cc-col">
          <div className="cc-col-head cc-col-head-trim">TRIM / REDUCE</div>
          {trimZone.length === 0 && <p className="cc-empty">None at TRR</p>}
          {trimZone.map((s, i) => (
            <ActionRow
              key={s.ticker}
              sig={s}
              score={conviction(s)}
              verdict={verdictFor(s.ticker)}
              onTickerClick={onTickerClick}
              index={i}
            />
          ))}
        </div>

        <div className="cc-col">
          <div className="cc-col-head cc-col-head-avoid">AVOID</div>
          {avoid.length === 0 && <p className="cc-empty">No bearish names</p>}
          {avoid.map((s, i) => (
            <motion.div
              className="cc-row cc-row-avoid"
              key={s.ticker}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.18, ease: 'easeOut' }}
            >
              <TickerChip ticker={s.ticker} onTickerClick={onTickerClick} title={s.name} />
              <span className={`cc-trend cc-trend-${trendTone(s.trend)}`}>
                {(s.trend || '—').toUpperCase()}
              </span>
              <span className="cc-verdict" title={verdictFor(s.ticker)}>
                {verdictFor(s.ticker)}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* No-edge mid-range chips */}
      {midRange.length > 0 && (
        <div className="cc-noedge">
          <span className="cc-noedge-label">NO EDGE (mid-range)</span>
          <div className="cc-noedge-chips">
            {midRange.map((s) => (
              <TickerChip
                key={s.ticker}
                ticker={s.ticker}
                onTickerClick={onTickerClick}
                title={s.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* Zone 4 — What changed + key signals */}
      <div className="cc-intel">
        <div className="cc-intel-col">
          <div className="cc-intel-head">What Changed</div>
          {flips.length === 0 && <p className="cc-empty">No trend flips</p>}
          {flips.map((f, i) => (
            <div className="cc-flip" key={`${f.ticker}-${i}`}>
              <span className="cc-flip-ticker">{f.ticker}</span>:{' '}
              <span className={`cc-flip-from cc-trend-${trendTone(f.from)}`}>{f.from}</span>
              <span className="cc-flip-arrow">→</span>
              <span className={`cc-flip-to cc-trend-${trendTone(f.to)}`}>{f.to}</span>
              <span className="cc-flip-date"> on {fmtShortDate(f.date)}</span>
            </div>
          ))}
          {onDeckRecent.length > 0 && (
            <div className="cc-ondeck">
              <span className="cc-intel-sub">On deck</span>
              <div className="cc-ondeck-chips">
                {onDeckRecent.map((o) => (
                  <TickerChip
                    key={o.ticker}
                    ticker={o.ticker}
                    onTickerClick={onTickerClick}
                    title={`${o.direction || ''} · ${o.days_since_top5}d`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="cc-intel-col">
          <div className="cc-intel-head">Key Signals</div>
          {themes.length > 0 && (
            <ul className="cc-themes-list">
              {themes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
          {highSectors.length > 0 && (
            <div className="cc-sectors">
              {highSectors.map((s, i) => (
                <span
                  className={`cc-chip cc-chip-sector cc-sector-${trendTone(
                    s.stance === 'bullish' ? 'BULLISH' : s.stance === 'bearish' ? 'BEARISH' : ''
                  )}`}
                  key={i}
                  title={s.evidence || ''}
                >
                  {s.value}: {s.stance}
                </span>
              ))}
            </div>
          )}
          {usdAnomaly && (
            <p className="cc-anomaly">
              ⚠ {usdAnomaly.asset} aligned with USD ({fmtNum(usdAnomaly.corr)},{' '}
              {usdAnomaly.window_days}d) — watch for divergence
            </p>
          )}
          <PTFrameworks units={ptFrameworks} query={ptQuery} />
        </div>
      </div>
    </section>
  )
}
