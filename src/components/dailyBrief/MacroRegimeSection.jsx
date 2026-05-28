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
function DriverRow({ row, insight, open, onToggle, isVix, priceOverride }) {
  // VIX shows the live spot (priceOverride, from vix_current_v) so it
  // matches the persistent header pill; everything else uses prev_close.
  const price = priceOverride != null ? priceOverride : num(row.prev_close)
  const lrr = num(row.buy_trade)
  const trr = num(row.sell_trade)
  const pct = rangePct(lrr, trr, price)
  const rLabel = rangeLabel(pct)
  const zc = zoneColor(pct)
  const signal = macroImplication(row.ticker, row.trend, pct)
  const tone = trendTone(row.trend)
  const bucket = isVix ? vixBucket(price) : null
  // Match the header pill's 1-decimal VIX formatting exactly.
  const priceText = isVix ? (price != null ? price.toFixed(1) : '—') : fmtBand(price)

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
          <span className={`dbm-chip dbm-chip-${signal.type}`}>{signal.label}</span>
          <span className={`dbm-chev${open ? ' dbm-chev-open' : ''}`} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      <Expand open={open}>
        <div
          className="dbm-bubble"
          style={{ borderLeftColor: TREND_COLOR[tone] }}
        >
          <div className="dbm-badges">
            <span className={`dbm-badge dbm-badge-${tone}`}>
              {(row.trend || '—').toUpperCase()}
            </span>
            {rLabel && <span className="dbm-badge dbm-badge-range">{rLabel}</span>}
            {isVix && (
              <span className={`dbm-badge dbm-badge-${bucket.type}`}>{bucket.label}</span>
            )}
          </div>
          {insight?.headline && (
            <p className="dbm-bubble-headline">{insight.headline}</p>
          )}
          {insight?.detail && <p className="dbm-bubble-detail">{insight.detail}</p>}
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

export function MacroRegimeSection() {
  const [signals, setSignals] = useState({ status: 'loading', map: {}, date: null })
  const [corr, setCorr] = useState({ status: 'loading', assets: [] })
  const [insights, setInsights] = useState({ status: 'loading', map: {} })
  const [open, setOpen] = useState(() => new Set())
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
        .select('insight_date, block_key, headline, detail')
        .order('insight_date', { ascending: false })
        .limit(200),
    ]).then(([sigSettled, corrSettled, insSettled]) => {
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

  return (
    <SectionShell index={1} title="Macro Regime">
      <div className="dbm-stack">
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
