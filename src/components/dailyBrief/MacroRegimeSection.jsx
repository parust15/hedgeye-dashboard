import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useVixBucket } from '../../lib/useVixBucket'
import { SectionShell } from './SectionShell'
import './dailyBrief.macro.css'

// Block B — macro driver lamps, grouped by asset class. Tickers absent
// from today's signal set are simply skipped.
const DRIVER_GROUPS = [
  { group: 'Equities', tickers: ['SPX', 'COMPQ', 'RUT'] },
  { group: 'Rates', tickers: ['UST10Y', 'UST2Y', 'UST30Y'] },
  { group: 'FX / Dollar', tickers: ['USD', 'EUR/USD', 'USD/YEN'] },
  { group: 'Commodities', tickers: ['WTIC', 'GOLD', 'COPPER'] },
  { group: 'Crypto', tickers: ['BITCOIN'] },
]

// Block C — correlation lookback windows, in display order.
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

// Signed correlation to 3 decimals.
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

function rangeLabel(pct) {
  if (pct == null) return null
  if (pct <= 25) return 'near LRR'
  if (pct >= 75) return 'near TRR'
  return 'mid-range'
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

function trendTone(trend) {
  switch ((trend || '').toUpperCase()) {
    case 'BULLISH':
      return 'bull'
    case 'BEARISH':
      return 'bear'
    default:
      return 'neutral'
  }
}

const TREND_COLOR = {
  bull: 'var(--bull)',
  bear: 'var(--bear)',
  neutral: 'var(--neutral)',
}

// --- hedgeye_rr_verdict mechanical reads → badge tone/label ---------
// gate is the trend gate (BULLISH/BEARISH/NEUTRAL).
function rrGateTone(gate) {
  switch ((gate || '').toUpperCase()) {
    case 'BULLISH':
      return 'bull'
    case 'BEARISH':
      return 'bear'
    default:
      return 'neutral'
  }
}

// range_zone: at_lrr = buy zone (bull), at_trr = trim zone (amber/cau),
// mid = no edge (neutral).
function rrZoneInfo(zone) {
  if (zone === 'at_lrr') return { tone: 'bull', label: 'buy zone' }
  if (zone === 'at_trr') return { tone: 'cau', label: 'trim zone' }
  return { tone: 'neutral', label: 'mid-range' }
}

// Secondary mechanical read (trr_slope / momentum / vol_state). These are
// descriptive context, not buy/sell signals, so they stay neutral —
// EXCEPT 'insufficient', which renders muted as "insufficient history".
function RrStateBadge({ label, value }) {
  const insufficient = value === 'insufficient'
  return (
    <span
      className={`dbm-badge ${insufficient ? 'rrv-badge-insufficient' : 'dbm-badge-neutral'}`}
    >
      <span className="rrv-k">{label}</span>
      {insufficient ? 'insufficient history' : value || '—'}
    </span>
  )
}

// Correlation regime → number color.
function corrColor(regime) {
  const r = (regime || '').toLowerCase()
  if (r === 'inverse' || r === 'mild_inverse') return 'var(--bear)'
  if (r === 'aligned' || r === 'mild_aligned') return 'var(--bull)'
  return 'var(--text-dim)' // decoupled
}

// Correlation regime → chip type. Only strong inverse/aligned color the
// chip; mild + decoupled stay neutral (per spec).
function regimeChipType(regime) {
  const r = (regime || '').toLowerCase()
  if (r === 'inverse') return 'neg'
  if (r === 'aligned') return 'pos'
  return 'neu'
}

function regimeText(regime) {
  if (!regime) return '—'
  return regime.replace(/_/g, ' ')
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
  // VIX shows the live spot (priceOverride, from vix_current_v) so it
  // matches the persistent header pill; everything else uses prev_close.
  const price = priceOverride != null ? priceOverride : num(row.prev_close)
  const lrr = num(row.buy_trade)
  const trr = num(row.sell_trade)
  const pct = rangePct(lrr, trr, price)
  const rLabel = rangeLabel(pct)
  const zc = zoneColor(pct)
  const signal = macroImplication(row.ticker, row.trend, pct)
  // Prefer the DB-authored insight verdict for the chip; the chip color
  // still comes from the local rule type. Fall back to the hardcoded label
  // when absent. (Distinct from the `verdict` prop = RR inspection stamp.)
  const insightVerdict = insight?.short_verdict?.trim()
  const chipLabel = insightVerdict || signal.label
  // macro_insights slices the SAME source text into headline (≤500 chars)
  // and detail (≤2000), so the bubble used to render a truncated copy AND the
  // full copy. When one string is a prefix of the other (same source), show
  // only the complete one; if they're genuinely distinct, show both.
  const insHead = insight?.headline?.trim() || ''
  const insDetail = insight?.detail?.trim() || ''
  const insSameSource =
    !!insHead &&
    !!insDetail &&
    (insDetail.startsWith(insHead) || insHead.startsWith(insDetail))
  const insFull = insDetail.length >= insHead.length ? insDetail : insHead
  const tone = trendTone(row.trend)
  // VIX is inverse: a BEARISH (falling) VIX trend is risk-on and supportive
  // for markets, while a BULLISH (rising) trend is the warning sign. Flip the
  // accent color for VIX so the TREND badge + bubble border never contradict
  // the "investable" reading (the badge still shows the raw Hedgeye trend).
  const accentTone =
    isVix && tone === 'bull' ? 'bear' : isVix && tone === 'bear' ? 'bull' : tone
  const bucket = isVix ? vixBucket(price) : null
  // Match the header pill's 1-decimal VIX formatting exactly.
  const priceText = isVix ? (price != null ? price.toFixed(1) : '—') : fmtBand(price)
  // hedgeye_rr_verdict — this ticker's Risk Range inspection stamp (latest
  // signal_date). Additive: absent → nothing renders.
  const vGateTone = rrGateTone(verdict?.gate)
  const vZone = verdict ? rrZoneInfo(verdict.range_zone) : null

  return (
    <div className="dbm-row">
      <button
        type="button"
        className="dbm-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="dbm-row-left">
          <span className="dbm-row-ticker">{row.ticker}</span>
          <span
            className={`dbm-row-price${isVix ? ' dbm-row-price-vix' : ''}`}
            style={isVix ? { color: TYPE_COLOR[bucket.type] } : undefined}
          >
            {priceText}
          </span>
        </div>

        <div className="dbm-row-mid">
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
            <span className="dbm-rb-label">
              {rLabel ?? '—'} · {(row.trend || '—').toUpperCase()} trend
            </span>
            {trr != null && (
              <span className="dbm-rb-rr dbm-rb-rr-trr">TRR {fmtBand(trr)}</span>
            )}
          </div>
        </div>

        <div className="dbm-row-right">
          <span className={`dbm-chip dbm-chip-${signal.type}`}>{chipLabel}</span>
          <span className={`dbm-chev${open ? ' dbm-chev-open' : ''}`} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      {/* RR verdict — collapsed "stamp" line under the row head; toggles the
          same bubble as the head. Gate-colored left accent = read at a glance. */}
      {verdict?.verdict_oneliner && (
        <button
          type="button"
          className={`rrv-oneliner rrv-oneliner-${vGateTone}`}
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="rrv-stamp" aria-hidden="true">
            RR
          </span>
          <span className="rrv-oneliner-text">{verdict.verdict_oneliner}</span>
        </button>
      )}

      <Expand open={open}>
        <div
          className="dbm-bubble"
          style={{
            borderLeftColor: TREND_COLOR[verdict ? vGateTone : accentTone],
          }}
        >
          {verdict ? (
            /* RR verdict is this ticker's single read — gate/zone/slope/mom/
               vol + detail (the collapsed oneliner sits above). */
            <>
              <div className="rrv-badges">
                <span className={`dbm-badge dbm-badge-${vGateTone}`}>
                  <span className="rrv-k">gate</span>
                  {verdict.gate || '—'}
                </span>
                {vZone && (
                  <span className={`dbm-badge dbm-badge-${vZone.tone}`}>
                    <span className="rrv-k">zone</span>
                    {vZone.label}
                  </span>
                )}
                <RrStateBadge label="TRR" value={verdict.trr_slope} />
                <RrStateBadge label="mom" value={verdict.momentum} />
                <RrStateBadge label="vol" value={verdict.vol_state} />
              </div>
              {verdict.verdict_detail && (
                <p className="rrv-detail">{verdict.verdict_detail}</p>
              )}
            </>
          ) : (
            /* No RR verdict for this ticker — fall back to the macro-insight
               read + trend/range badges so the bubble is never empty. */
            <>
              <div className="dbm-badges">
                <span className={`dbm-badge dbm-badge-${accentTone}`}>
                  {(row.trend || '—').toUpperCase()}
                </span>
                {rLabel && <span className="dbm-badge dbm-badge-range">{rLabel}</span>}
                {isVix && (
                  <span className={`dbm-badge dbm-badge-${bucket.type}`}>{bucket.label}</span>
                )}
              </div>
              {insSameSource ? (
                <p className="dbm-bubble-headline">{insFull}</p>
              ) : (
                <>
                  {insHead && <p className="dbm-bubble-headline">{insHead}</p>}
                  {insDetail && <p className="dbm-bubble-detail">{insDetail}</p>}
                </>
              )}
            </>
          )}
        </div>
      </Expand>
    </div>
  )
}

// USD-correlation row — same 3-column skeleton. Middle is the 30D
// correlation headline; expands to the full 5-window table.
function CorrRow({ asset, open, onToggle }) {
  const c30 = asset.cells[30]
  const regime30 = c30?.regime
  return (
    <div className="dbm-row">
      <button
        type="button"
        className="dbm-row-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="dbm-row-left">
          <span className="dbm-corr-asset-label">{asset.label}</span>
          <span className="dbm-corr-asset-ticker">{asset.ticker}</span>
        </div>

        <div className="dbm-row-mid dbm-corr-mid">
          <span className="dbm-corr-num" style={{ color: corrColor(regime30) }}>
            {fmtCorr3(c30?.correlation)}
          </span>
          <span className="dbm-corr-num-tag">30D</span>
        </div>

        <div className="dbm-row-right">
          <span className={`dbm-chip dbm-chip-${regimeChipType(regime30)}`}>
            {regimeText(regime30)}
          </span>
          <span className={`dbm-chev${open ? ' dbm-chev-open' : ''}`} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      <Expand open={open}>
        <div className="dbm-bubble" style={{ borderLeftColor: corrColor(regime30) }}>
          <div className="dbm-corr-wins">
            {WINDOWS.map((w) => {
              const cell = asset.cells[w]
              return (
                <div className="dbm-corr-winrow" key={w}>
                  <span className="dbm-corr-winlabel">{w}D</span>
                  <span
                    className="dbm-corr-winval"
                    style={{ color: corrColor(cell?.regime) }}
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
  const [corr, setCorr] = useState({ status: 'loading', assets: [] })
  const [insights, setInsights] = useState({ status: 'loading', map: {} })
  // hedgeye_rr_verdict — latest signal_date, keyed by ticker.
  const [verdicts, setVerdicts] = useState({ status: 'loading', map: {} })
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
        .select('sort_order, asset_ticker, asset_label, window_days, correlation, n_obs, regime')
        .order('sort_order', { ascending: true })
        .order('window_days', { ascending: true }),
      supabase
        .from('macro_insights')
        .select('insight_date, block_key, headline, detail, short_verdict, market_posture')
        .order('insight_date', { ascending: false })
        .limit(200),
      supabase
        .from('hedgeye_macro_assertions')
        .select('assertion_type, value, region, stance, confidence, stated_on, source_email_type, evidence_snippet')
        .in('assertion_type', ['monthly_quad', 'quarterly_quad', 'regional_quad'])
        .order('stated_on', { ascending: false }),
      supabase
        .from('hedgeye_rr_verdict')
        .select('ticker, verdict_oneliner, verdict_detail, gate, range_zone, price_in_range, trr_slope, momentum, vol_state, signal_date')
        .order('signal_date', { ascending: false })
        .limit(300),
    ]).then(([sigSettled, corrSettled, insSettled, quadSettled, vSettled]) => {
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

      // --- usd_correlations_v → asset-pivoted matrix ----------------
      if (corrSettled.status === 'fulfilled' && !corrSettled.value.error) {
        const rows = corrSettled.value.data ?? []
        const byAsset = new Map()
        for (const r of rows) {
          if (!byAsset.has(r.asset_ticker)) {
            byAsset.set(r.asset_ticker, {
              ticker: r.asset_ticker,
              label: r.asset_label,
              sort_order: r.sort_order,
              cells: {},
            })
          }
          byAsset.get(r.asset_ticker).cells[r.window_days] = {
            correlation: r.correlation,
            regime: r.regime,
            n_obs: r.n_obs,
          }
        }
        const assets = Array.from(byAsset.values()).sort(
          (a, b) => a.sort_order - b.sort_order
        )
        setCorr({ status: assets.length ? 'ready' : 'empty', assets })
      } else {
        if (corrSettled.status === 'rejected')
          console.error('MacroRegime: correlations fetch rejected:', corrSettled.reason)
        else console.error('MacroRegime: correlations fetch error:', corrSettled.value.error)
        setCorr({ status: 'error', assets: [] })
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

      // --- hedgeye_rr_verdict → latest-date ticker map --------------
      // Rows arrive newest-first; pickLatest keeps only the max
      // signal_date and keys by ticker. Verdicts are additive — fail
      // soft to an empty map so the rows still render without them.
      if (vSettled.status === 'fulfilled' && !vSettled.value.error) {
        const { map } = pickLatest(vSettled.value.data ?? [])
        setVerdicts({ status: 'ready', map })
      } else {
        if (vSettled.status === 'rejected')
          console.error('MacroRegime: rr_verdict fetch rejected:', vSettled.reason)
        else console.error('MacroRegime: rr_verdict fetch error:', vSettled.value.error)
        setVerdicts({ status: 'ready', map: {} })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const insightMap = insights.map
  const vixRow = signals.map.VIX
  // Prefer the live spot; fall back to the signal's prev_close if the
  // live view hasn't loaded.
  const vixDisplayPrice =
    vixLive?.vix_value != null ? vixLive.vix_value : num(vixRow?.prev_close)
  const corrInsight = insightMap.correlations
  const corrOpen = open.has('correlations')
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
              insight={insightMap.vix}
              verdict={verdicts.map.VIX}
              open={open.has('vix')}
              onToggle={() => toggle('vix')}
              isVix
              priceOverride={vixDisplayPrice}
            />
          )}
        </div>

        {/* === Block B — Macro Drivers ============================= */}
        <div className="dbm-block">
          <span className="dbm-block-title">Macro Drivers</span>
          <p className="dbm-note">Hedgeye TREND (3-month) only — no TRADE or TAIL signal.</p>
          {signals.status === 'loading' && <p className="db-state">Loading drivers…</p>}
          {signals.status === 'error' && (
            <p className="db-state db-state-error">Driver signals unavailable.</p>
          )}
          {(signals.status === 'ready' || signals.status === 'empty') &&
            DRIVER_GROUPS.map((grp) => {
              const present = grp.tickers.filter((t) => signals.map[t])
              if (present.length === 0) return null
              return (
                <div className="dbm-group" key={grp.group}>
                  <span className="dbm-group-head">{grp.group}</span>
                  {present.map((t) => (
                    <DriverRow
                      key={t}
                      row={signals.map[t]}
                      insight={insightMap[`driver:${t}`]}
                      verdict={verdicts.map[t]}
                      open={open.has(`driver:${t}`)}
                      onToggle={() => toggle(`driver:${t}`)}
                    />
                  ))}
                </div>
              )
            })}
        </div>

        {/* === Block C — USD Correlations ========================== */}
        <div className="dbm-block">
          <div className="dbm-corr-header">
            <span className="dbm-block-title dbm-corr-title">
              Key $USD Correlations{' '}
              <span className="dbm-corr-sub">(UUP proxy · Pearson · trading days)</span>
            </span>
          </div>

          {corrInsight?.headline && (
            <div className="dbm-corr-insight">
              <button
                type="button"
                className="dbm-corr-insight-toggle"
                onClick={corrInsight.detail ? () => toggle('correlations') : undefined}
                aria-expanded={corrInsight.detail ? corrOpen : undefined}
              >
                <span className="dbm-insight-spark" aria-hidden="true">
                  ✦
                </span>
                <span className="dbm-corr-insight-head">{corrInsight.headline}</span>
                {corrInsight.detail && (
                  <span
                    className={`dbm-chev${corrOpen ? ' dbm-chev-open' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                )}
              </button>
              {corrInsight.detail && (
                <Expand open={corrOpen}>
                  <p className="dbm-bubble-detail dbm-corr-insight-detail">
                    {corrInsight.detail}
                  </p>
                </Expand>
              )}
            </div>
          )}

          {corr.status === 'loading' && <p className="db-state">Loading correlations…</p>}
          {corr.status === 'error' && (
            <p className="db-state db-state-error">USD correlations unavailable.</p>
          )}
          {corr.status === 'empty' && <p className="db-state">No correlation data.</p>}
          {corr.status === 'ready' &&
            corr.assets.map((asset) => (
              <CorrRow
                key={asset.ticker}
                asset={asset}
                open={open.has(`corr:${asset.ticker}`)}
                onToggle={() => toggle(`corr:${asset.ticker}`)}
              />
            ))}
        </div>
      </div>
    </SectionShell>
  )
}
