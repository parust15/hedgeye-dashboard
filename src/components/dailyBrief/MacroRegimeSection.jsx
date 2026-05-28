import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SectionShell } from './SectionShell'

// Hedgeye backtested Quad playbook — which lines run in-spec under each
// macro condition. Reference data, not fetched.
const QUAD_PLAYBOOK = {
  '1': {
    name: 'Goldilocks',
    color: '#4ade80',
    bestSectors: ['Tech', 'Consumer Discretionary', 'Materials', 'Industrials'],
    bestFactors: ['High Beta', 'Momentum', 'Secular Growth', 'Cyclicals'],
    worstSectors: ['Utilities', 'REITs', 'Staples', 'Financials'],
  },
  '2': {
    name: 'Reflation',
    color: '#fbbf24',
    bestSectors: ['Tech', 'Consumer Discretionary', 'Industrials', 'Energy/Materials'],
    bestFactors: ['Secular Growth', 'Momentum', 'Cyclical Growth', 'Small Caps'],
    worstSectors: ['Utilities', 'REITs', 'Staples', 'Telecom'],
  },
  '3': {
    name: 'Stagflation',
    color: '#fb923c',
    bestSectors: ['Energy', 'Tech', 'Utilities', 'Gold/Commodities'],
    bestFactors: ['Secular Growth', 'Momentum', 'Mid Caps', 'Low Beta'],
    worstSectors: ['Financials', 'REITs', 'Materials', 'Consumer'],
  },
  '4': {
    name: 'Deflation',
    color: '#60a5fa',
    bestSectors: ['Staples', 'Utilities', 'REITs', 'Health Care'],
    bestFactors: ['Low Beta', 'Dividend Yield', 'Quality', 'Defensives'],
    worstSectors: ['Energy', 'Tech', 'Industrials', 'Financials'],
  },
}

const STALE_AFTER_DAYS = 5

// One row per asset class line. Hardcoded watchlist.
const WATCHLIST = [
  {
    group: 'Equity',
    items: [
      { t: 'SPX', label: 'S&P 500' },
      { t: 'COMPQ', label: 'NASDAQ' },
      { t: 'RUT', label: 'Russell 2000' },
      { t: 'XLK', label: 'Tech (XLK)' },
    ],
  },
  {
    group: 'FX',
    items: [
      { t: 'USD', label: 'USD Index' },
      { t: 'EUR/USD', label: 'EUR/USD' },
      { t: 'USD/YEN', label: 'USD/JPY' },
    ],
  },
  {
    group: 'Rates & Credit',
    items: [
      { t: 'UST2Y', label: '2Y Yield', isYield: true },
      { t: 'UST10Y', label: '10Y Yield', isYield: true },
      { t: 'HYG', label: 'High Yield (HYG)' },
    ],
  },
  {
    group: 'Energy',
    items: [
      { t: 'WTIC', label: 'WTI Crude' },
      { t: 'XOP', label: 'E&P (XOP)' },
      { t: 'NATGAS', label: 'Nat Gas' },
    ],
  },
  {
    group: 'Metals',
    items: [
      { t: 'GOLD', label: 'Gold' },
      { t: 'SILVER', label: 'Silver' },
      { t: 'COPPER', label: 'Copper' },
    ],
  },
  { group: 'Crypto', items: [{ t: 'BITCOIN', label: 'Bitcoin' }] },
]

const VIX_MEANING = {
  investable: '9–19 · buy dips, normal risk',
  chop: '20–29 · trade ranges, aggressive on longs',
  fuck: '29+ · defensive, preserve capital',
}

// PostgREST hands numerics back as strings — parse once at the edge.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

// Compact level display: thousands separators, up to 3 decimals.
function fmtLevel(x) {
  const n = num(x)
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

// 'YYYY-MM-DD' → whole days since, for the staleness note.
function daysSince(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return null
  const then = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

function trim(s, n) {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

// Per task spec — the work order for one watchlist line.
function deriveAction(trend, pir, isYield) {
  const t = (trend || '').toUpperCase()
  const p = Number(pir)
  if (Number.isNaN(p)) return '—'
  if (t === 'BULLISH' && p <= 0.3)
    return isYield ? 'Yields rising · bearish bonds' : 'BUY · near low end'
  if (t === 'BULLISH' && p >= 0.75) return 'TRIM · near top end'
  if (t === 'BULLISH') return 'HOLD · mid range'
  if (t === 'BEARISH' && p <= 0.3) return 'Cover-zone · bear at low'
  if (t === 'BEARISH' && p >= 0.75) return 'SHORT setup · overbought bear'
  if (t === 'BEARISH') return 'AVOID long · bear mid'
  return 'No edge · wait'
}

function dirTone(trend) {
  switch ((trend || '').toUpperCase()) {
    case 'BULLISH':
      return 'bull'
    case 'BEARISH':
      return 'bear'
    default:
      return 'neutral'
  }
}

// Friendly names for correlation ticker slugs.
const ASSET_LABEL = {
  USD: 'USD',
  UUP: 'USD',
  DXY: 'USD',
  BTC: 'Bitcoin',
  BITCOIN: 'Bitcoin',
  GLD: 'Gold',
  GOLD: 'Gold',
  SLV: 'Silver',
  SILVER: 'Silver',
  SPY: 'S&P 500',
  QQQ: 'NASDAQ',
  TLT: 'Long Bonds',
  HYG: 'High Yield',
  COPPER: 'Copper',
}

function assetLabel(sym) {
  if (!sym) return ''
  const u = String(sym).toUpperCase()
  return ASSET_LABEL[u] ?? u.charAt(0) + u.slice(1).toLowerCase()
}

// Turn a correlation row into { pair, meaning, date }.
function correlationView(row) {
  const tickers = Array.isArray(row.tickers) ? row.tickers.filter(Boolean) : []
  const tokens = String(row.value || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
  const relation = tokens.includes('inverse')
    ? 'inverse'
    : tokens.includes('direct')
      ? 'direct'
      : null

  let pair
  let assets
  if (tickers.length >= 2) {
    assets = [assetLabel(tickers[0]), assetLabel(tickers[1])]
    pair = assets.join(' ↔ ')
  } else {
    const assetTokens = tokens.filter(
      (t) => t !== 'inverse' && t !== 'direct' && t !== 'correlation'
    )
    assets = assetTokens.map(assetLabel)
    pair = assets.join(' ↔ ') + (relation ? ` · ${relation}` : '')
  }

  const isUsd =
    tickers.some((t) => ['USD', 'UUP', 'DXY'].includes(String(t).toUpperCase())) ||
    tokens.includes('usd')

  let meaning
  if (relation === 'inverse' && isUsd) {
    const other = assets.find((a) => a !== 'USD') ?? assets[assets.length - 1] ?? 'the pair'
    meaning = `Inverse — rising $ pressures ${other} lower.`
  } else {
    meaning = trim(row.evidence_snippet, 80)
  }

  return { pair, meaning, date: row.stated_on }
}

function Evidence({ snippet }) {
  if (!snippet) return null
  return (
    <span className="db-info" title={snippet} aria-label="evidence">
      ⓘ
    </span>
  )
}

export function MacroRegimeSection() {
  // Independent per-source state so a single failed fetch leaves the
  // other panels intact (graceful partial render).
  const [quad, setQuad] = useState({ status: 'loading', row: null })
  const [correlations, setCorrelations] = useState({ status: 'loading', rows: [] })
  const [vix, setVix] = useState({ status: 'loading', row: null })
  const [check, setCheck] = useState({ status: 'loading', map: {}, date: null })

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      supabase
        .from('hedgeye_macro_assertions')
        .select('*')
        .order('stated_on', { ascending: false })
        .order('extracted_at', { ascending: false })
        .limit(80),
      supabase
        .from('hedgeye_vix_snapshots')
        .select('vix_value, bucket, day_change, day_change_pct, snapshot_at')
        .order('snapshot_at', { ascending: false })
        .limit(1),
      supabase
        .from('hedgeye_signals')
        .select('ticker, trend, buy_trade, sell_trade, prev_close, price_in_range_pct, signal_date')
        .order('signal_date', { ascending: false })
        .limit(200),
    ]).then(([macroSettled, vixSettled, sigSettled]) => {
      if (cancelled) return

      // --- macro_assertions → monthly_quad + correlations -----------
      if (macroSettled.status === 'fulfilled' && !macroSettled.value.error) {
        const rows = macroSettled.value.data ?? []
        const monthly = rows.find((r) => r.assertion_type === 'monthly_quad') ?? null
        const seen = new Set()
        const corr = []
        for (const r of rows) {
          if (r.assertion_type !== 'correlation') continue
          if (seen.has(r.value)) continue
          seen.add(r.value)
          corr.push(r)
          if (corr.length >= 5) break
        }
        setQuad({ status: monthly ? 'ready' : 'empty', row: monthly })
        setCorrelations({ status: 'ready', rows: corr })
      } else {
        if (macroSettled.status === 'rejected')
          console.error('MacroRegime: macro fetch rejected:', macroSettled.reason)
        else console.error('MacroRegime: macro fetch error:', macroSettled.value.error)
        setQuad({ status: 'error', row: null })
        setCorrelations({ status: 'error', rows: [] })
      }

      // --- vix_snapshots → latest 1 ---------------------------------
      if (vixSettled.status === 'fulfilled' && !vixSettled.value.error) {
        const row = vixSettled.value.data?.[0] ?? null
        setVix({ status: row ? 'ready' : 'empty', row })
      } else {
        if (vixSettled.status === 'rejected')
          console.error('MacroRegime: vix fetch rejected:', vixSettled.reason)
        else console.error('MacroRegime: vix fetch error:', vixSettled.value.error)
        setVix({ status: 'error', row: null })
      }

      // --- signals → latest date, ticker-keyed map ------------------
      if (sigSettled.status === 'fulfilled' && !sigSettled.value.error) {
        const rows = sigSettled.value.data ?? []
        const latestDate = rows[0]?.signal_date ?? null
        const map = {}
        for (const r of rows) {
          if (r.signal_date !== latestDate) continue
          if (!map[r.ticker]) map[r.ticker] = r
        }
        setCheck({
          status: latestDate ? 'ready' : 'empty',
          map,
          date: latestDate,
        })
      } else {
        if (sigSettled.status === 'rejected')
          console.error('MacroRegime: signals fetch rejected:', sigSettled.reason)
        else console.error('MacroRegime: signals fetch error:', sigSettled.value.error)
        setCheck({ status: 'error', map: {}, date: null })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  // --- derived view values ----------------------------------------
  const quadRow = quad.row
  const quadValue = quadRow?.value
  const playbook = quadValue ? QUAD_PLAYBOOK[quadValue] : null
  const quadAge = daysSince(quadRow?.stated_on)
  const quadStale = quadAge != null && quadAge > STALE_AFTER_DAYS

  const vixRow = vix.row
  const vixValue = num(vixRow?.vix_value)
  const vixBucket = (vixRow?.bucket || '').toLowerCase()
  const vixChange = num(vixRow?.day_change)
  const vixPct = num(vixRow?.day_change_pct)
  // VIX is risk-off: a FALLING VIX (negative change) is good for risk
  // assets → green; rising → red.
  const vixChangeTone = vixChange == null ? '' : vixChange < 0 ? 'good' : vixChange > 0 ? 'bad' : ''
  const vixChangeText =
    vixChange == null
      ? null
      : `${vixChange <= 0 ? 'Down' : 'Up'} ${Math.abs(vixChange).toFixed(2)}${
          vixPct != null ? ` (${vixPct >= 0 ? '+' : ''}${vixPct.toFixed(1)}%)` : ''
        }`

  return (
    <SectionShell index={1} title="Macro Regime">
      {/* Row A — Hero pair (Quad + VIX) */}
      <div className="db-hero-grid">
        {/* QUAD card */}
        <div className="db-hero-card">
          {quad.status === 'loading' && <p className="db-state">Loading Quad…</p>}
          {quad.status === 'error' && (
            <p className="db-state db-state-error">Quad unavailable.</p>
          )}
          {quad.status === 'empty' && (
            <p className="db-state">No current Quad assertion.</p>
          )}
          {quad.status === 'ready' && (
            <>
              <div className="db-hero-top">
                <span
                  className="db-hero-num"
                  style={playbook ? { color: playbook.color } : undefined}
                >
                  {quadValue}
                </span>
                <div className="db-hero-headings">
                  <span className="db-hero-eyebrow">MONTHLY QUAD</span>
                  <span className="db-hero-name">{playbook ? playbook.name : '—'}</span>
                </div>
              </div>
              {playbook && (
                <>
                  <p className="db-hero-line">
                    <span className="db-hero-label db-hero-label-good">Favored:</span>{' '}
                    {[...playbook.bestSectors, ...playbook.bestFactors].join(', ')}
                  </p>
                  <p className="db-hero-line">
                    <span className="db-hero-label db-hero-label-bad">Avoid:</span>{' '}
                    {playbook.worstSectors.join(', ')}
                  </p>
                </>
              )}
              <div className="db-hero-meta">
                {quadRow?.stated_on && <span>stated {quadRow.stated_on}</span>}
                <Evidence snippet={quadRow?.evidence_snippet} />
                {quadStale && (
                  <span className="db-stale-note">stale · {quadAge}d</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* VIX card */}
        <div className="db-hero-card">
          {vix.status === 'loading' && <p className="db-state">Loading VIX…</p>}
          {vix.status === 'error' && (
            <p className="db-state db-state-error">VIX unavailable.</p>
          )}
          {vix.status === 'empty' && <p className="db-state">No VIX snapshot yet.</p>}
          {vix.status === 'ready' && (
            <>
              <div className="db-hero-top">
                <span className="db-hero-num">
                  {vixValue != null ? vixValue.toFixed(2) : '—'}
                </span>
                <div className="db-hero-headings">
                  <span className="db-hero-eyebrow">VIX REGIME</span>
                  <span className={`db-vix-pill db-vix-${vixBucket || 'unknown'}`}>
                    {(vixRow?.bucket || 'unknown').toUpperCase()}
                  </span>
                </div>
              </div>
              {VIX_MEANING[vixBucket] && (
                <p className="db-vix-meaning">{VIX_MEANING[vixBucket]}</p>
              )}
              {vixChangeText && (
                <p className={`db-vix-change db-change-${vixChangeTone}`}>{vixChangeText}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Row B — Correlations */}
      <div className="db-corr">
        <span className="db-subhead">Correlations</span>
        {correlations.status === 'loading' && <p className="db-state">Loading…</p>}
        {correlations.status === 'error' && (
          <p className="db-state db-state-error">Correlations unavailable.</p>
        )}
        {correlations.status === 'ready' && correlations.rows.length === 0 && (
          <p className="db-state">No correlation calls.</p>
        )}
        {correlations.status === 'ready' && correlations.rows.length > 0 && (
          <div className="db-corr-table">
            <div className="db-corr-row db-corr-head">
              <span>Pair</span>
              <span>Meaning</span>
              <span>Date</span>
            </div>
            {correlations.rows.map((r) => {
              const v = correlationView(r)
              return (
                <div className="db-corr-row" key={`corr-${r.id}`}>
                  <span className="db-corr-pair">{v.pair}</span>
                  <span className="db-corr-meaning">{v.meaning}</span>
                  <span className="db-corr-date">{v.date}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Row C — Asset-Class Checklist */}
      <div className="db-check">
        <span className="db-subhead">Asset-Class Checklist</span>
        {check.status === 'loading' && <p className="db-state">Loading signals…</p>}
        {check.status === 'error' && (
          <p className="db-state db-state-error">Signals unavailable.</p>
        )}
        {(check.status === 'ready' || check.status === 'empty') &&
          WATCHLIST.map((grp) => (
            <div className="db-check-group" key={grp.group}>
              <span className="db-check-group-head">{grp.group}</span>
              {grp.items.map((item) => {
                const row = check.map[item.t]
                if (!row) {
                  return (
                    <div className="db-check-row db-check-row-muted" key={item.t}>
                      <span className="db-check-label">{item.label}</span>
                      <span className="db-check-dash">—</span>
                    </div>
                  )
                }
                const pir = num(row.price_in_range_pct)
                const clamped = pir == null ? null : Math.max(0, Math.min(1, pir))
                return (
                  <div className="db-check-row" key={item.t}>
                    <span className="db-check-label">{item.label}</span>
                    <span className={`db-dir db-dir-${dirTone(row.trend)}`}>
                      {(row.trend || '—').toUpperCase()}
                    </span>
                    <span className="db-check-range">
                      {fmtLevel(row.buy_trade)} – {fmtLevel(row.sell_trade)}
                    </span>
                    <span className="db-bar" aria-hidden="true">
                      {clamped != null && (
                        <span
                          className="db-bar-marker"
                          style={{ left: `${clamped * 100}%` }}
                        />
                      )}
                    </span>
                    <span className="db-action">
                      {deriveAction(row.trend, pir, item.isYield)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
      </div>
    </SectionShell>
  )
}
