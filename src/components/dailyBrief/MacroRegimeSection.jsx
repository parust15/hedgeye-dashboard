import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useVixBucket } from '../../lib/useVixBucket'
import { SectionShell } from './SectionShell'
import './dailyBrief.macro.css'

// Block C — correlation lookback windows for the expandable detail grid.
const WINDOWS = [15, 30, 90, 120, 180]

// Static Hedgeye GIP doctrine — backtested favored/avoid across four
// dimensions per Quad (Master the Market, p.27). Hardcoded, not fetched.
const QUAD_PLAYBOOK = {
  1: {
    name: 'Goldilocks',
    growth: 'up',
    inflation: 'down',
    dims: [
      { label: 'Asset Classes', best: ['Equities', 'Credit', 'Commodities', 'FX'], worst: ['Fixed Income', 'USD'] },
      { label: 'Equity Sectors', best: ['Tech', 'Consumer Discretionary', 'Materials', 'Industrials'], worst: ['Utilities', 'REITS', 'Consumer Staples', 'Financials'] },
      { label: 'Equity Style Factors', best: ['High Beta', 'Momentum', 'Cyclicals', 'Secular Growth'], worst: ['Low Beta', 'Defensives', 'Value', 'Dividend Yield'] },
      { label: 'Fixed Income Sectors', best: ['BDCs', 'Convertibles', 'HY Credit', 'EM $ Debt'], worst: ['TIPS', 'Short Duration Treasurys', 'MBS', 'Medium Duration Treasurys'] },
    ],
  },
  2: {
    name: 'Reflation',
    growth: 'up',
    inflation: 'up',
    dims: [
      { label: 'Asset Classes', best: ['Commodities', 'Equities', 'Credit', 'FX'], worst: ['Fixed Income', 'USD'] },
      { label: 'Equity Sectors', best: ['Tech', 'Consumer Discretionary', 'Industrials', 'Materials'], worst: ['Telecom', 'Utilities', 'REITS', 'Consumer Staples'] },
      { label: 'Equity Style Factors', best: ['Secular Growth', 'Momentum', 'Cyclical Growth', 'Small Caps'], worst: ['Low Beta', 'Value', 'Dividend Yield', 'Defensives'] },
      { label: 'Fixed Income Sectors', best: ['Convertibles', 'BDCs', 'Preferreds', 'Leveraged Loans'], worst: ['Long Duration Treasurys', 'Medium Duration Treasurys', 'Munis', 'IG Credit'] },
    ],
  },
  3: {
    name: 'Stagflation',
    growth: 'down',
    inflation: 'up',
    dims: [
      { label: 'Asset Classes', best: ['Gold', 'Commodities'], worst: ['Credit'] },
      { label: 'Equity Sectors', best: ['Utilities', 'Tech', 'Energy', 'Industrials'], worst: ['Financials', 'REITS', 'Materials', 'Telecom'] },
      { label: 'Equity Style Factors', best: ['Secular Growth', 'Momentum', 'Mid Caps', 'Low Beta'], worst: ['Small Caps', 'Dividend Yield', 'Value', 'Defensives'] },
      { label: 'Fixed Income Sectors', best: ['Munis', 'EM $ Debt', 'Long Duration Treasurys', 'TIPS'], worst: ['BDCs', 'Preferreds', 'Convertibles', 'Leveraged Loans'] },
    ],
  },
  4: {
    name: 'Deflation',
    growth: 'down',
    inflation: 'down',
    dims: [
      { label: 'Asset Classes', best: ['Fixed Income', 'Gold', 'USD'], worst: ['Commodities', 'Equities', 'Credit', 'FX'] },
      { label: 'Equity Sectors', best: ['Consumer Staples', 'Utilities', 'REITS', 'Health Care'], worst: ['Energy', 'Tech', 'Industrials', 'Financials'] },
      { label: 'Equity Style Factors', best: ['Low Beta', 'Dividend Yield', 'Quality', 'Defensives'], worst: ['High Beta', 'Momentum', 'Cyclicals', 'Secular Growth'] },
      { label: 'Fixed Income Sectors', best: ['Long Duration Treasurys', 'Medium Duration Treasurys', 'IG Credit', 'Munis'], worst: ['Preferreds', 'EM Local Currency', 'BDCs', 'Leveraged Loans'] },
    ],
  },
}

// Cell/chip accent: bull for Q1/Q2, bear for Q3/Q4.
function quadTone(n) {
  if (n === 1 || n === 2) return 'bull'
  if (n === 3 || n === 4) return 'bear'
  return 'neu'
}

function quadInt(v) {
  const n = parseInt(v, 10)
  return n >= 1 && n <= 4 ? n : null
}

// 'YYYY-MM-DD' → 'M/D'.
function fmtMD(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).split('-').map(Number)
  if (!m || !d) return ''
  return `${m}/${d}`
}

// PostgREST hands numerics back as strings — parse once at the edge.
// Guard null BEFORE Number.isFinite to avoid the Number(null)===0 trap.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

// Thousands separators, up to 3 decimals.
function fmtBand(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

// Signed correlation to 3 decimals — used by the expand-grid windows.
function fmtCorr3(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`
}

// Position of price within the LRR–TRR band, clamped 0–100. Null when
// any input is missing so the bar can render empty.
function rangePct(lrr, trr, price) {
  if (lrr == null || trr == null || price == null) return null
  if (trr <= lrr) return 50
  return Math.min(100, Math.max(0, ((price - lrr) / (trr - lrr)) * 100))
}

// Trend → ticker/price color (BULLISH green, BEARISH red, else default white).
// Replaces the old "near TRR · TREND" caption — direction now reads off the
// left column's color.
function trendColor(trend) {
  const t = (trend || '').toUpperCase()
  if (t === 'BULLISH') return 'var(--bull)'
  if (t === 'BEARISH') return 'var(--bear)'
  return null
}

// Range-bar fill/dot color by zone (explicit per spec).
function zoneColor(pct) {
  if (pct == null) return '#888780'
  if (pct <= 25) return '#639922' // near LRR — green
  if (pct >= 75) return '#BA7517' // near TRR — amber
  return '#888780' // mid — gray
}

// VIX bucket → big-number color + label.
function vixBucket(price) {
  if (price == null) return { label: 'unknown', type: 'neu' }
  if (price < 20) return { label: 'investable 9–19', type: 'pos' }
  if (price < 29) return { label: 'chop 20–29', type: 'cau' }
  return { label: 'defensive 29+', type: 'neg' }
}

// Per-type → token color for the VIX price number.
const TYPE_COLOR = {
  pos: 'var(--bull)',
  neg: 'var(--bear)',
  cau: 'var(--amber-light)',
  neu: 'var(--neutral)',
}

// Right-column chip — what this ticker's reading means for the broader
// MACRO BACKDROP (not the ticker's own direction). Label + color type
// come entirely from this per-ticker mapping. pct guards against the
// Number(null) coercion footgun (null <= 25 would otherwise be true).
function macroImplication(ticker, trend, pct) {
  // Only TRR (top of range) gates a verdict — the bar already conveys
  // position, so the chip never restates "near LRR/TRR". pct guards
  // against the Number(null) coercion footgun (null >= 75 → true).
  const atTRR = pct != null && pct >= 75

  switch (ticker) {
    // VIX: inverse — low/falling vol = good backdrop
    case 'VIX':
      if (trend === 'BEARISH' && pct != null && pct < 50)
        return { label: 'vol supportive', type: 'pos' }
      if (trend === 'BEARISH') return { label: 'vol elevated', type: 'cau' }
      if (trend === 'BULLISH') return { label: 'vol spiking', type: 'neg' }
      return { label: 'vol neutral', type: 'neu' }

    // Equities: is the trend gate helping or hurting stocks?
    case 'SPX':
    case 'COMPQ':
    case 'RUT':
      if (trend === 'BULLISH' && atTRR) return { label: 'equity at ceiling', type: 'cau' }
      if (trend === 'BULLISH') return { label: 'equity uptrend', type: 'pos' }
      if (trend === 'BEARISH') return { label: 'equity downtrend', type: 'neg' }
      return { label: 'no edge', type: 'neu' }

    // Rates: rising rates pressure equities + duration
    case 'UST10Y':
    case 'UST2Y':
    case 'UST30Y':
      if (trend === 'BULLISH' && atTRR) return { label: 'rate headwind', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'rate pressure', type: 'cau' }
      if (trend === 'BEARISH') return { label: 'rate tailwind', type: 'pos' }
      return { label: 'rates neutral', type: 'neu' }

    // USD: strong dollar = headwind for risk assets
    case 'USD':
      if (trend === 'BULLISH' && atTRR) return { label: 'dollar headwind', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'dollar firming', type: 'cau' }
      if (trend === 'BEARISH') return { label: 'dollar tailwind', type: 'pos' }
      return { label: 'dollar neutral', type: 'neu' }

    // FX vs USD: falling EUR/GBP = rising dollar = risk-off
    case 'EUR/USD':
    case 'GBP/USD':
      if (trend === 'BEARISH') return { label: 'dollar rising', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'dollar falling', type: 'pos' }
      return { label: 'fx neutral', type: 'neu' }

    case 'USD/YEN':
      if (trend === 'BULLISH' && atTRR) return { label: 'yen pressure', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'yen watching', type: 'cau' }
      if (trend === 'BEARISH') return { label: 'yen stable', type: 'pos' }
      return { label: 'yen neutral', type: 'neu' }

    // Copper: Dr. Copper = growth proxy
    case 'COPPER':
      if (trend === 'BULLISH') return { label: 'growth signal', type: 'pos' }
      if (trend === 'BEARISH') return { label: 'growth warning', type: 'neg' }
      return { label: 'copper neutral', type: 'neu' }

    // Oil: high = inflation risk; collapse = demand/deflation risk
    case 'WTIC':
    case 'BRENT':
      if (trend === 'BULLISH' && atTRR) return { label: 'inflation risk', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'oil firming', type: 'cau' }
      if (trend === 'BEARISH') return { label: 'deflation risk', type: 'cau' }
      return { label: 'oil neutral', type: 'neu' }

    // Gold: safe-haven bid = risk-off money moving to safety
    case 'GOLD':
      if (trend === 'BULLISH' && atTRR) return { label: 'safe haven bid', type: 'neg' }
      if (trend === 'BULLISH') return { label: 'gold bid', type: 'cau' }
      if (trend === 'BEARISH') return { label: 'no haven bid', type: 'pos' }
      return { label: 'gold neutral', type: 'neu' }

    // Bitcoin: risk-on proxy
    case 'BITCOIN':
      if (trend === 'BULLISH') return { label: 'risk-on signal', type: 'pos' }
      if (trend === 'BEARISH') return { label: 'risk-off signal', type: 'neg' }
      return { label: 'crypto neutral', type: 'neu' }

    default:
      if (trend === 'BULLISH') return { label: 'bullish', type: 'pos' }
      if (trend === 'BEARISH') return { label: 'bearish', type: 'neg' }
      return { label: 'neutral', type: 'neu' }
  }
}

// --- hedgeye_rr_verdict → action chip (the verdict surface) ----------
// action verb → { family (drives color), arrow (direction), label }.
// NOTE: arrow grouping ≠ color family — e.g. TRIM is amber (caution) but
// points ↓ (cut). Up = add/long, down = cut/short, right = watch/hold.
const ACTION_INFO = {
  BUY: { family: 'bull', arrow: '↑', label: 'BUY' },
  ADD: { family: 'bull', arrow: '↑', label: 'ADD' },
  LET_RUN: { family: 'bull', arrow: '↑', label: 'LET RUN' },
  TRIM: { family: 'amber', arrow: '↓', label: 'TRIM' },
  REDUCE: { family: 'amber', arrow: '↓', label: 'REDUCE' },
  COVER: { family: 'amber', arrow: '↓', label: 'COVER' },
  WATCH_BOUNCE: { family: 'amber', arrow: '→', label: 'WATCH BOUNCE' },
  HOLD: { family: 'neutral', arrow: '→', label: 'HOLD' },
  WAIT: { family: 'neutral', arrow: '→', label: 'WAIT' },
  SHORT: { family: 'bear', arrow: '↓', label: 'SHORT' },
  AVOID: { family: 'bear', arrow: '↓', label: 'AVOID' },
}
function actionInfo(action) {
  return ACTION_INFO[(action || '').toUpperCase()] || null
}

// conviction → fill-intensity suffix: high = solid fill + bold border,
// medium = normal, low = outline only / dimmed so weak calls recede.
function convictionIntensity(conviction) {
  const c = (conviction || '').toLowerCase()
  if (c === 'high') return 'high'
  if (c === 'low') return 'low'
  return 'med'
}

// action family → accent color (chip text + popover left border).
const FAMILY_COLOR = {
  bull: 'var(--bull)',
  bear: 'var(--bear)',
  amber: 'var(--amber-light)',
  neutral: 'var(--neutral)',
}

// range_pattern → { label, tint }. Normalizes every value to one short,
// color-coded token so EVERY chip's second line looks the same (never blank).
// Bullish structure → bull, bearish → bear, compression/expansion/mixed →
// amber, still-forming → neutral.
function patternInfo(pattern) {
  switch (pattern) {
    case 'HH/HL':
    case 'new_high_HL':
      return { label: 'HH/HL', tint: 'bull' }
    case 'LH/LL':
    case 'new_low_LH':
      return { label: 'LH/LL', tint: 'bear' }
    case 'LH/HL':
      return { label: 'LH/HL', tint: 'amber' }
    case 'HH/LL':
      return { label: 'HH/LL', tint: 'amber' }
    case 'mixed':
      return { label: 'mixed', tint: 'amber' }
    case 'forming':
      return { label: 'forming', tint: 'neutral' }
    default:
      return { label: pattern || '—', tint: 'neutral' }
  }
}

// momentum → { arrow, tone } for the chip's second line.
function momentumInfo(momentum) {
  const m = (momentum || '').toLowerCase()
  if (m === 'gaining') return { arrow: '↑', tone: 'bull' }
  if (m === 'fading') return { arrow: '↓', tone: 'bear' }
  if (m === 'flat') return { arrow: '→', tone: 'neutral' }
  return { arrow: '?', tone: 'neutral' } // insufficient / unknown
}
const MOM_COLOR = {
  bull: 'var(--bull)',
  bear: 'var(--bear)',
  neutral: 'var(--text)',
}

// Compact right-column tag — the at-a-glance action from the RR zone, using
// chip tones (pos/cau/neu). Replaces the old wordy macro short-verdict chip.
const ZONE_TAG = {
  at_lrr: { tone: 'pos', label: 'BUY ZONE' },
  at_trr: { tone: 'cau', label: 'TRIM ZONE' },
  mid: { tone: 'neu', label: 'MID-RANGE' },
}

// Latest signal_date wins; first row per ticker on that date.
function pickLatest(rows) {
  const latest = rows[0]?.signal_date ?? null
  const map = {}
  if (latest) {
    for (const r of rows) {
      if (r.signal_date !== latest) continue
      if (!map[r.ticker]) map[r.ticker] = r
    }
  }
  return { map, date: latest }
}

// --- Block C — Key $USD Correlations display helpers -----------------
// The backend stores each asset's read as a preformatted detail_bullet string
// (data unchanged); we parse it for a richer display:
//   "S&P 500: 15D -0.591 | 30D -0.649 | 90D -0.408  short ▼ loosening, med ▲ tightening"
function parseUsdCorrBullet(text) {
  const ci = text.indexOf(':')
  const asset = (ci >= 0 ? text.slice(0, ci) : text).trim()
  const body = ci >= 0 ? text.slice(ci + 1) : ''
  const winVal = (w) => {
    const m = body.match(new RegExp(`${w}\\s+([+-]?\\d*\\.?\\d+)`))
    return m ? m[1] : null
  }
  const arrowOf = (which) => {
    const m = body.match(new RegExp(`${which}\\s+(\\S)`))
    return m ? m[1] : null
  }
  return {
    asset,
    flag: text.includes('⚡'),
    v15: winVal('15D'),
    v30: winVal('30D'),
    v90: winVal('90D'),
    short: arrowOf('short'),
    med: arrowOf('med'),
  }
}

// Correlation number color — every number takes its correlation color: negative
// = red (--bear), positive = green (--bull), by sign (no strength dimming).
function corrNumColor(s) {
  const v = num(s)
  if (v == null) return 'var(--text-strong)'
  return v < 0 ? 'var(--bear)' : 'var(--bull)'
}

// Trend arrow color — up/tightening (▲) = green (--bull), down/loosening (▼) =
// red (--bear), flat (—) = white. Existing vars only.
function trendArrowColor(arrow) {
  if (arrow === '▲') return 'var(--bull)'
  if (arrow === '▼') return 'var(--bear)'
  return 'var(--text-strong)'
}

// Framer Motion height/opacity collapse, ~180ms.
function Expand({ open, children }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// The standardized gauge row — identical structure for VIX and every
// driver. Left: ticker + price. Middle: range bar + position label.
// Right: market-signal chip + chevron. Expands to badges + insight.
function DriverRow({ row, insight, verdict, open, onToggle, isVix, priceOverride }) {
  const rowRef = useRef(null)
  // Hover card (ticker / RR bar) — floating RR readout, positioned in a portal
  // so it escapes the section's overflow:hidden. null = hidden.
  const [hover, setHover] = useState(null)
  const showHover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover({
      top: Math.round(r.bottom + 8),
      left: Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 268))),
    })
  }
  const hideHover = () => setHover(null)
  // VIX shows the live spot (priceOverride, from vix_current_v) so it
  // matches the persistent header pill; everything else uses prev_close.
  const price = priceOverride != null ? priceOverride : num(row.prev_close)
  const lrr = num(row.buy_trade)
  const trr = num(row.sell_trade)
  const pct = rangePct(lrr, trr, price)
  const zc = zoneColor(pct)
  // Trend reads off the ticker/price color now (green bullish, red bearish);
  // the old "near TRR · TREND" caption is removed. VIX keeps its vol-bucket hue.
  const tColor = isVix ? null : trendColor(row.trend)
  const bucket = isVix ? vixBucket(price) : null
  // Match the header pill's 1-decimal VIX formatting exactly.
  const priceText = isVix ? (price != null ? price.toFixed(1) : '—') : fmtBand(price)

  // hedgeye_rr_verdict is the ONLY verdict surface — the right-side chip. With
  // an action it shows the DECISION (BUY / TRIM / LET RUN …), colored by family
  // and intensified by conviction; clicking it reveals one detail blurb. If
  // action is null it falls back to the raw zone tag, no conviction styling.
  const aInfo = actionInfo(verdict?.action)
  const family = aInfo?.family || 'neutral'
  const intensity = convictionIntensity(verdict?.conviction)
  // Second line = fractal pattern + momentum (what the RR bar CAN'T show);
  // position/zone is read off the bar, not repeated here.
  const pInfo = verdict?.range_pattern ? patternInfo(verdict.range_pattern) : null
  const mom = momentumInfo(verdict?.momentum)
  // Fallback chip (no action): the raw zone tag, else the local macro label.
  const zoneTag = verdict ? ZONE_TAG[verdict.range_zone] : null
  const signal = macroImplication(row.ticker, row.trend, pct)
  const chipTone = zoneTag ? zoneTag.tone : signal.type
  const chipLabel = zoneTag
    ? zoneTag.label
    : insight?.short_verdict?.trim() || signal.label
  // Expanded body prefers the driver-aware macro_insights verdict (names the
  // dominant driver, cites USD correlations + quad-shift context, ends in an
  // action + level) for the latest insight_date — it's already keyed to this
  // row via the driver:<ticker> / vix block_key. detail_bullets (a 3-5 item
  // array, last item the "Action:" takeaway) renders as a bullet list; detail
  // prose is the fallback; the isolated hedgeye_rr_verdict read is last.
  const bullets =
    Array.isArray(insight?.detail_bullets) && insight.detail_bullets.length
      ? insight.detail_bullets
      : null
  const detail = insight?.detail?.trim() || verdict?.verdict_detail?.trim()
  const hasBlurb = !!bullets || !!detail
  const chipClass = aInfo
    ? `rrv-chip rrv-chip-${family} rrv-chip-${intensity}`
    : `dbm-chip dbm-chip-${chipTone}`
  // Conviction is shown by fill/border strength (intensity class), not dots.
  const chipBody = aInfo ? (
    <>
      <span className="rrv-chip-verb">
        {aInfo.arrow} {aInfo.label}
      </span>
      <span className="rrv-chip-sub">
        {pInfo && (
          <>
            <span style={{ color: FAMILY_COLOR[pInfo.tint] }}>{pInfo.label}</span>
            {' · '}
          </>
        )}
        <span style={{ color: MOM_COLOR[mom.tone] }}>mom {mom.arrow}</span>
      </span>
    </>
  ) : (
    chipLabel
  )

  // Close the blurb on click-away; re-click is handled by the chip itself.
  useEffect(() => {
    if (!open || !hasBlurb) return undefined
    const onDown = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) onToggle()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, hasBlurb, onToggle])

  return (
    <div className="dbm-row" ref={rowRef}>
      <div className="dbm-row-head dbm-row-head-static">
        <div
          className="dbm-row-left"
          onMouseEnter={showHover}
          onMouseLeave={hideHover}
        >
          <span className="dbm-row-ticker" style={tColor ? { color: tColor } : undefined}>
            {row.ticker}
          </span>
          <span
            className={`dbm-row-price${isVix ? ' dbm-row-price-vix' : ''}`}
            style={
              isVix
                ? { color: TYPE_COLOR[bucket.type] }
                : tColor
                  ? { color: tColor }
                  : undefined
            }
          >
            {priceText}
          </span>
        </div>

        <div className="dbm-row-mid" onMouseEnter={showHover} onMouseLeave={hideHover}>
          <div className="dbm-rb-track">
            {pct != null && (
              <div
                className="dbm-rb-fill"
                style={{ width: `${pct}%`, background: zc }}
              />
            )}
            {pct != null && (
              <div
                className="dbm-rb-dot"
                style={{ left: `${pct}%`, background: zc }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="dbm-rb-meta">
            {lrr != null && (
              <span className="dbm-rb-rr dbm-rb-rr-lrr">LRR {fmtBand(lrr)}</span>
            )}
            {/* The verdict chip lives in the bar caption now — a wide
                rectangular pill centered between LRR and TRR, where the
                position/trend text used to be. VIX shows no chip. */}
            <div className="dbm-rb-chipslot">
              {!isVix &&
                (hasBlurb ? (
                  <button
                    type="button"
                    className={chipClass}
                    onClick={onToggle}
                    aria-expanded={open}
                  >
                    {chipBody}
                    <span
                      className={`rrv-chip-caret${open ? ' rrv-chip-caret-open' : ''}`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>
                ) : (
                  <span className={chipClass}>{chipBody}</span>
                ))}
            </div>
            {trr != null && (
              <span className="dbm-rb-rr dbm-rb-rr-trr">TRR {fmtBand(trr)}</span>
            )}
          </div>
        </div>
      </div>

      {/* The verdict blurb — a full-row-width band below the row in the bubble
          style, left border colored by the action family. Opens with the range
          bounds (LRR · TRR) as a quick reference, then the detail paragraph. */}
      {hasBlurb && open && (
        <div className="rrv-pop" style={{ borderLeftColor: FAMILY_COLOR[family] }}>
          {(lrr != null || trr != null) && (
            <div className="rrv-pop-bounds">
              {lrr != null && <span className="rrv-pop-lrr">LRR {fmtBand(lrr)}</span>}
              {lrr != null && trr != null && <span className="rrv-pop-sep"> · </span>}
              {trr != null && <span className="rrv-pop-trr">TRR {fmtBand(trr)}</span>}
            </div>
          )}
          {bullets ? (
            <ul className="rrv-pop-bullets">
              {bullets.map((b, i) => {
                const text = String(b)
                // The driver bullets end in the action takeaway (last item, often
                // "Action:"-prefixed) — emphasize it in the verdict family color.
                const isAction =
                  i === bullets.length - 1 || /^\s*action\s*:/i.test(text)
                return (
                  <li
                    key={i}
                    className={`rrv-pop-bullet${isAction ? ' rrv-pop-action' : ''}`}
                    style={isAction ? { color: FAMILY_COLOR[family] } : undefined}
                  >
                    {text}
                  </li>
                )
              })}
            </ul>
          ) : (
            detail
          )}
        </div>
      )}

      {/* Hover card (ticker / bar) — RR readout, portaled to <body> so the
          section's overflow:hidden can't clip it. */}
      {hover &&
        createPortal(
          <div className="rrh-card" style={{ top: hover.top, left: hover.left }}>
            <div className="rrh-name">{row.name || row.ticker}</div>
            <div className="rrh-row">
              <span className="rrh-label rrh-label-buy">LRR (buy)</span>
              <span className="rrh-val">{fmtBand(lrr)}</span>
            </div>
            <div className="rrh-row">
              <span className="rrh-label">Close</span>
              <span className="rrh-val">{fmtBand(num(row.prev_close))}</span>
            </div>
            <div className="rrh-row">
              <span className="rrh-label rrh-label-sell">TRR (sell)</span>
              <span className="rrh-val">{fmtBand(trr)}</span>
            </div>
            <div className="rrh-row">
              <span className="rrh-label">Position</span>
              <span className="rrh-val">
                {pct != null ? `${Math.round(pct)}% of range` : '—'}
              </span>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

// The full 4-dimension Hedgeye GIP playbook for a quad — FAVORED vs
// AVOID across Asset Classes, Equity Sectors, Style Factors, and Fixed
// Income. Reused by US grid cells (below the grid) and Global rows.
function QuadPlaybook({ play }) {
  return (
    <div className="dbm-quad-pb">
      {play.dims.map((d) => (
        <div className="dbm-quad-pb-dim" key={d.label}>
          <span className="dbm-quad-pb-dimlabel">{d.label}</span>
          <div className="dbm-quad-pb-cols">
            <div className="dbm-quad-pb-col">
              <span className="dbm-quad-col-head dbm-quad-col-fav">POSITIVE</span>
              <div className="dbm-quad-pills">
                {d.best.map((b) => (
                  <span className="dbm-quad-pill dbm-quad-pill-fav" key={b}>
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div className="dbm-quad-pb-col">
              <span className="dbm-quad-col-head dbm-quad-col-avoid">NEGATIVE</span>
              <div className="dbm-quad-pills">
                {d.worst.map((w) => (
                  <span className="dbm-quad-pill dbm-quad-pill-avoid" key={w}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// One cell of the US 2x2 grid. Populated → big QUAD n + name + GIP +
// footer, toggles its playbook (rendered full-width below the grid).
// Empty (no row) → muted "—/unknown", not interactive (a deliberate
// blank gauge — a thinking prompt).
// Growth/Inflation arrow — ↑ green (accelerating) / ↓ red (slowing).
function GipArrow({ dir }) {
  return (
    <span className={`dbm-quad-arrow dbm-quad-arrow-${dir}`} aria-hidden="true">
      {dir === 'up' ? '↑' : '↓'}
    </span>
  )
}

function QuadCell({ row, open, onToggle }) {
  const n = row ? quadInt(row.value) : null
  const play = n ? QUAD_PLAYBOOK[n] : null
  if (!row || !play) {
    return (
      <div className="dbm-quad-cell dbm-quad-cell-empty">
        <span className="dbm-quad-ctop">
          <span className="dbm-quad-cnum">QUAD —</span>
          <span className="dbm-quad-cunknown">unknown</span>
        </span>
      </div>
    )
  }
  const tone = quadTone(n)
  return (
    <button
      type="button"
      className={`dbm-quad-cell dbm-quad-cell-${tone}${open ? ' dbm-quad-cell-open' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <span className="dbm-quad-ctop">
        <span className={`dbm-quad-cnum dbm-quad-cnum-${tone}`}>QUAD {n}</span>
        <span className="dbm-quad-cname">{play.name}</span>
        <span
          className={`dbm-quad-cchev dbm-chev${open ? ' dbm-chev-open' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </span>
      <span className="dbm-quad-cgip">
        Growth <GipArrow dir={play.growth} /> · Inflation <GipArrow dir={play.inflation} />
      </span>
    </button>
  )
}

export function MacroRegimeSection() {
  const [signals, setSignals] = useState({ status: 'loading', map: {}, date: null })
  // usd_correlations_v pivoted by asset_label → full 5-window detail for the
  // expand-on-click drill-down beneath each summary row.
  const [corr, setCorr] = useState({ status: 'loading', byLabel: {} })
  const [insights, setInsights] = useState({ status: 'loading', map: {} })
  const [quads, setQuads] = useState({
    status: 'loading',
    monthly: null,
    quarterly: null,
    monthlyShift: null,
    quarterlyShift: null,
    regional: [],
  })
  // Section-level keys ('quad-us' / 'quad-global') start expanded; the
  // per-cell / per-driver keys default collapsed (absent from the set).
  const [open, setOpen] = useState(() => new Set(['quad-us', 'quad-global']))
  // Live VIX spot — same source as the always-on header pill — so the
  // cockpit's VIX number matches the top-right corner.
  const { data: vixLive } = useVixBucket()

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      supabase
        .from('hedgeye_signals')
        .select('ticker, name, trend, buy_trade, sell_trade, prev_close, signal_date')
        .order('signal_date', { ascending: false })
        .limit(300),
      supabase
        .from('usd_correlations_v')
        .select('asset_ticker, asset_label, window_days, correlation, n_obs')
        .order('window_days', { ascending: true }),
      supabase
        .from('macro_insights')
        .select('insight_date, block_key, headline, detail, detail_bullets, short_verdict, market_posture')
        .order('insight_date', { ascending: false })
        .limit(200),
      supabase
        .from('hedgeye_macro_assertions')
        .select('assertion_type, value, region, stance, confidence, stated_on, source_email_type, evidence_snippet')
        .in('assertion_type', ['monthly_quad', 'quarterly_quad', 'regional_quad'])
        .order('stated_on', { ascending: false }),
    ]).then(([sigSettled, corrSettled, insSettled, quadSettled]) => {
      if (cancelled) return

      let latestSignalDate = null

      // --- hedgeye_signals → latest-date ticker map -----------------
      if (sigSettled.status === 'fulfilled' && !sigSettled.value.error) {
        const rows = sigSettled.value.data ?? []
        const { map, date } = pickLatest(rows)
        latestSignalDate = date
        setSignals({ status: date ? 'ready' : 'empty', map, date })
      } else {
        if (sigSettled.status === 'rejected')
          console.error('MacroRegime: signals fetch rejected:', sigSettled.reason)
        else console.error('MacroRegime: signals fetch error:', sigSettled.value.error)
        setSignals({ status: 'error', map: {}, date: null })
      }

      // --- usd_correlations_v → byLabel map for the expand-grid detail ---
      if (corrSettled.status === 'fulfilled' && !corrSettled.value.error) {
        const rows = corrSettled.value.data ?? []
        const byLabel = {}
        for (const r of rows) {
          if (!byLabel[r.asset_label])
            byLabel[r.asset_label] = { ticker: r.asset_ticker, cells: {} }
          byLabel[r.asset_label].cells[r.window_days] = {
            correlation: r.correlation,
            n_obs: r.n_obs,
          }
        }
        setCorr({ status: 'ready', byLabel })
      } else {
        if (corrSettled.status === 'rejected')
          console.error('MacroRegime: correlations fetch rejected:', corrSettled.reason)
        else console.error('MacroRegime: correlations fetch error:', corrSettled.value.error)
        setCorr({ status: 'error', byLabel: {} })
      }

      // --- macro_insights → block_key map for the signal's date -----
      // Tie insights to the SAME date as the signals (per spec) so the
      // bubble text always corresponds to today's readings. Falls back
      // to the latest insight date if signals didn't load. Empty table
      // → empty map → bubbles render badges only (no error).
      if (insSettled.status === 'fulfilled' && !insSettled.value.error) {
        const rows = insSettled.value.data ?? []
        const targetDate = latestSignalDate ?? rows[0]?.insight_date ?? null
        const map = {}
        if (targetDate) {
          for (const r of rows) {
            if (r.insight_date !== targetDate) continue
            if (!map[r.block_key]) map[r.block_key] = r
          }
        }
        setInsights({ status: 'ready', map })
      } else {
        if (insSettled.status === 'rejected')
          console.error('MacroRegime: insights fetch rejected:', insSettled.reason)
        else console.error('MacroRegime: insights fetch error:', insSettled.value.error)
        // Insights are decorative — fail soft to an empty map.
        setInsights({ status: 'ready', map: {} })
      }

      // --- hedgeye_macro_assertions → Quad regime ------------------
      // Rows arrive newest-first, so the first match per slot wins.
      // "Shift" cells = latest US row whose evidence implies a regime
      // transition (optional; absent today → blank Upcoming cell).
      if (quadSettled.status === 'fulfilled' && !quadSettled.value.error) {
        const rows = quadSettled.value.data ?? []
        const SHIFT_RE = /shift|into|emerging/i
        const isUs = (r, type) => r.assertion_type === type && r.region === 'US'
        const monthly = rows.find((r) => isUs(r, 'monthly_quad')) ?? null
        const quarterly = rows.find((r) => isUs(r, 'quarterly_quad')) ?? null
        const monthlyShift =
          rows.find((r) => isUs(r, 'monthly_quad') && SHIFT_RE.test(r.evidence_snippet || '')) ??
          null
        const quarterlyShift =
          rows.find((r) => isUs(r, 'quarterly_quad') && SHIFT_RE.test(r.evidence_snippet || '')) ??
          null
        const seen = new Set()
        const regional = []
        for (const r of rows) {
          if (r.assertion_type !== 'regional_quad') continue
          if (!r.region || r.region === 'US') continue
          if (seen.has(r.region)) continue
          seen.add(r.region)
          regional.push(r)
        }
        regional.sort((a, b) => a.region.localeCompare(b.region))
        setQuads({
          status: 'ready',
          monthly,
          quarterly,
          monthlyShift,
          quarterlyShift,
          regional,
        })
      } else {
        if (quadSettled.status === 'rejected')
          console.error('MacroRegime: quad fetch rejected:', quadSettled.reason)
        else console.error('MacroRegime: quad fetch error:', quadSettled.value.error)
        setQuads({
          status: 'error',
          monthly: null,
          quarterly: null,
          monthlyShift: null,
          quarterlyShift: null,
          regional: [],
        })
      }

    })

    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback((key) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const insightMap = insights.map
  const vixRow = signals.map.VIX
  // Prefer the live spot; fall back to the signal's prev_close if the
  // live view hasn't loaded.
  const vixDisplayPrice =
    vixLive?.vix_value != null ? vixLive.vix_value : num(vixRow?.prev_close)
  // Block C now renders the server-side 'usd_correlations' macro_insights block
  // (headline = one-line READ conclusion, detail_bullets = one row per asset).
  // All correlation/trend math lives in the backend now.
  const usdCorr = insightMap.usd_correlations
  const usdCorrBullets = Array.isArray(usdCorr?.detail_bullets) ? usdCorr.detail_bullets : []
  const usOpen = open.has('quad-us')
  const globalOpen = open.has('quad-global')

  return (
    <SectionShell index={1} title="Macro Regime">
      <div className="dbm-stack">
        {/* === Quad Regime strip — collapsible US + Global ======== */}
        {quads.status === 'ready' && (
          <div className="dbm-quad-strip">
            <div className="dbm-quad-section">
              <button
                type="button"
                className="dbm-quad-sectitle"
                onClick={() => toggle('quad-us')}
                aria-expanded={usOpen}
              >
                <span className="dbm-quad-blocktitle">
                  <span className="dbm-quad-blocklabel">US QUADS</span>
                </span>
                <span className={`dbm-chev${usOpen ? ' dbm-chev-open' : ''}`} aria-hidden="true">
                  ▾
                </span>
              </button>
              <Expand open={usOpen}>
                <div className="dbm-quad-grid">
                  <span className="dbm-quad-ghead-corner" aria-hidden="true" />
                  <span className="dbm-quad-ghead">Current</span>
                  <span className="dbm-quad-ghead">Upcoming</span>

                  <span className="dbm-quad-rowlabel">Quarterly</span>
                  <QuadCell
                    row={quads.quarterly}
                    open={open.has('quad:q-current')}
                    onToggle={() => toggle('quad:q-current')}
                  />
                  <QuadCell
                    row={quads.quarterlyShift}
                    open={open.has('quad:q-upcoming')}
                    onToggle={() => toggle('quad:q-upcoming')}
                  />

                  <span className="dbm-quad-rowlabel">Monthly</span>
                  <QuadCell
                    row={quads.monthly}
                    open={open.has('quad:m-current')}
                    onToggle={() => toggle('quad:m-current')}
                  />
                  <QuadCell
                    row={quads.monthlyShift}
                    open={open.has('quad:m-upcoming')}
                    onToggle={() => toggle('quad:m-upcoming')}
                  />
                </div>
                {[
                  { key: 'q-current', slot: 'Quarterly · Current', row: quads.quarterly },
                  { key: 'q-upcoming', slot: 'Quarterly · Upcoming', row: quads.quarterlyShift },
                  { key: 'm-current', slot: 'Monthly · Current', row: quads.monthly },
                  { key: 'm-upcoming', slot: 'Monthly · Upcoming', row: quads.monthlyShift },
                ].map((c) => {
                  const cn = c.row ? quadInt(c.row.value) : null
                  const cplay = cn ? QUAD_PLAYBOOK[cn] : null
                  if (!cplay) return null
                  return (
                    <Expand key={c.key} open={open.has(`quad:${c.key}`)}>
                      <div className="dbm-quad-pb-wrap">
                        <div className="dbm-quad-pb-head">
                          <span className={`dbm-quad-chip dbm-quad-chip-${quadTone(cn)}`}>
                            QUAD {cn}
                          </span>
                          <span className="dbm-quad-pb-title">
                            {c.slot} — {cplay.name}
                          </span>
                          {c.row && (
                            <span className="dbm-quad-pb-proof">
                              {c.row.source_email_type ? `${c.row.source_email_type} · ` : ''}
                              {fmtMD(c.row.stated_on)}
                            </span>
                          )}
                        </div>
                        <QuadPlaybook play={cplay} />
                      </div>
                    </Expand>
                  )
                })}
              </Expand>
            </div>

            {quads.regional.length > 0 && (
              <div className="dbm-quad-section dbm-quad-global">
                <button
                  type="button"
                  className="dbm-quad-sectitle"
                  onClick={() => toggle('quad-global')}
                  aria-expanded={globalOpen}
                >
                  <span className="dbm-quad-blocktitle">
                    <span className="dbm-quad-blocklabel">GLOBAL QUADS</span>{' '}
                    <span className="dbm-quad-globalnote">(updated as Keith cites them)</span>
                  </span>
                  <span className={`dbm-chev${globalOpen ? ' dbm-chev-open' : ''}`} aria-hidden="true">
                    ▾
                  </span>
                </button>
                <Expand open={globalOpen}>
                  <div className="dbm-quad-ghead-row">
                    <span>Country</span>
                    <span>Quad</span>
                    <span>Regime</span>
                    <span>Date</span>
                    <span aria-hidden="true" />
                  </div>
                  <div className="dbm-quad-glist">
                    {quads.regional.map((r) => {
                      const n = quadInt(r.value)
                      const play = n ? QUAD_PLAYBOOK[n] : null
                      const tone = quadTone(n)
                      const stanceTone =
                        r.stance === 'bullish' ? 'bull' : r.stance === 'bearish' ? 'bear' : 'neu'
                      const key = `quad-global:${r.region}`
                      const isOpen = open.has(key)
                      return (
                        <div className="dbm-quad-grow" key={r.region}>
                          <button
                            type="button"
                            className="dbm-quad-grow-btn"
                            onClick={play ? () => toggle(key) : undefined}
                            aria-expanded={play ? isOpen : undefined}
                          >
                            <span className="dbm-quad-gregion">{r.region}</span>
                            <span className={`dbm-quad-chip dbm-quad-chip-${tone}`}>
                              Quad {n ?? '—'}
                            </span>
                            <span className={`dbm-quad-gdir dbm-quad-dir-${stanceTone}`}>
                              {r.stance || '—'}
                            </span>
                            <span className="dbm-quad-gdate">{fmtMD(r.stated_on)}</span>
                            <span
                              className={`dbm-quad-gchev dbm-chev${isOpen ? ' dbm-chev-open' : ''}`}
                              aria-hidden="true"
                            >
                              {play ? '▾' : ''}
                            </span>
                          </button>
                          {play && (
                            <Expand open={isOpen}>
                              <div className="dbm-quad-pb-wrap">
                                <QuadPlaybook play={play} />
                              </div>
                            </Expand>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Expand>
              </div>
            )}
          </div>
        )}

        {/* === Block A — VIX strip ================================= */}
        <div className="dbm-block">
          {signals.status === 'loading' && <p className="db-state">Loading VIX…</p>}
          {signals.status === 'error' && (
            <p className="db-state db-state-error">VIX unavailable.</p>
          )}
          {(signals.status === 'ready' || signals.status === 'empty') && !vixRow && (
            <p className="db-state">No VIX signal.</p>
          )}
          {vixRow && (
            <DriverRow
              row={vixRow}
              open={open.has('vix')}
              onToggle={() => toggle('vix')}
              isVix
              priceOverride={vixDisplayPrice}
            />
          )}
        </div>

        {/* === Block C — Key $USD Correlations (server-side, rule-derived) ==
            Renders the stored macro_insights 'usd_correlations' block: a
            one-line READ conclusion (headline) above one monospace,
            column-aligned row per asset (detail_bullets). All correlation +
            trend math lives in the backend now — nothing computed here. */}
        <div className="dbm-block">
          <div className="dbm-corr-header">
            <span className="dbm-block-title dbm-corr-title">Key $USD Correlations</span>
          </div>

          {insights.status === 'loading' && (
            <p className="db-state">Loading correlations…</p>
          )}
          {insights.status !== 'loading' &&
            !usdCorr?.headline &&
            usdCorrBullets.length === 0 && (
              <p className="db-state">No correlation data.</p>
            )}
          {(usdCorr?.headline || usdCorrBullets.length > 0) && (
            <div className="dbm-usdc">
              {usdCorr.headline && (
                <p className="dbm-usdc-read">{usdCorr.headline.replace(/\s*\(DBC\)/g, '')}</p>
              )}
              {usdCorrBullets.length > 0 && (
                <ul className="dbm-usdc-list">
                  <li className="dbm-usdc-head">
                    <span>Asset</span>
                    <span>Correlation vs USD</span>
                    <span className="dbm-usdc-trend">30 to 15</span>
                    <span className="dbm-usdc-trend">90 to 30</span>
                    <span aria-hidden="true" />
                  </li>
                  {usdCorrBullets.map((b, i) => {
                    const p = parseUsdCorrBullet(String(b))
                    const detail = corr.byLabel[p.asset]
                    const key = `usdcorr:${p.asset}`
                    const isOpen = open.has(key)
                    const rowClass = `dbm-usdc-row${p.flag ? ' dbm-usdc-row-flag' : ''}`
                    // Display label without the trailing "(TICKER)" — e.g.
                    // "Commodities (DBC)" → "Commodities". Lookup still uses p.asset.
                    const assetLabel = p.asset.replace(/\s*\([^)]*\)\s*$/, '')
                    const rowInner = (
                      <>
                        <span className="dbm-usdc-asset">
                          {assetLabel}
                          {p.flag && (
                            <span className="dbm-usdc-flag" aria-label="strong correlation">
                              {' '}⚡
                            </span>
                          )}
                        </span>
                        <span className="dbm-usdc-nums">
                          <span className="dbm-usdc-win">15D </span>
                          <span className="dbm-usdc-val" style={{ color: corrNumColor(p.v15) }}>{p.v15 ?? '—'}</span>
                          <span className="dbm-usdc-sep"> | </span>
                          <span className="dbm-usdc-win">30D </span>
                          <span className="dbm-usdc-val" style={{ color: corrNumColor(p.v30) }}>{p.v30 ?? '—'}</span>
                          <span className="dbm-usdc-sep"> | </span>
                          <span className="dbm-usdc-win">90D </span>
                          <span className="dbm-usdc-val" style={{ color: corrNumColor(p.v90) }}>{p.v90 ?? '—'}</span>
                        </span>
                        <span className="dbm-usdc-trend" style={{ color: trendArrowColor(p.short) }}>
                          {p.short ?? '—'}
                        </span>
                        <span className="dbm-usdc-trend" style={{ color: trendArrowColor(p.med) }}>
                          {p.med ?? '—'}
                        </span>
                        <span
                          className={`dbm-usdc-chev dbm-chev${isOpen ? ' dbm-chev-open' : ''}`}
                          aria-hidden="true"
                        >
                          {detail ? '▾' : ''}
                        </span>
                      </>
                    )
                    return (
                      <li className="dbm-usdc-item" key={i}>
                        {detail ? (
                          <button
                            type="button"
                            className={rowClass}
                            onClick={() => toggle(key)}
                            aria-expanded={isOpen}
                          >
                            {rowInner}
                          </button>
                        ) : (
                          <div className={rowClass}>{rowInner}</div>
                        )}
                        {detail && (
                          <Expand open={isOpen}>
                            <div className="dbm-usdc-detail">
                              <div className="dbm-corr-wins">
                                {WINDOWS.map((w) => {
                                  const cell = detail.cells[w]
                                  return (
                                    <div className="dbm-corr-winrow" key={w}>
                                      <span className="dbm-corr-winlabel">{w}D</span>
                                      <span
                                        className="dbm-corr-winval"
                                        style={{ color: corrNumColor(cell?.correlation) }}
                                      >
                                        {fmtCorr3(cell?.correlation)}
                                      </span>
                                      <span className="dbm-corr-winn">n={cell?.n_obs ?? '—'}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </Expand>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  )
}
