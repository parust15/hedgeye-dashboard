import { motion } from 'framer-motion'
import { useVixBucket } from '../../lib/useVixBucket'
import { useMorningChecklist } from '../../lib/useMorningChecklist'
import { RangeStateBadge } from '../RangeStateBadge'
import './dailyBrief.checklist.css'

// =====================================================================
// PRE-MARKET CHECKLIST — the screen the trader opens first.
// A synthesized MORNING READ banner (5-vote stance + narrative), then
// eight checks ordered by the Hedgeye 5-level confluence: L1 Regime
// (Quad) → L2 Signal (Risk Range) → L3/L4 execution context. Each
// check answers ONE question and carries a computed verdict chip.
// Data: useMorningChecklist (13 read-only sources, joined client-side).
// =====================================================================

// PostgREST hands numerics back as strings — parse once at the edge.
// Guard null BEFORE parse to dodge the Number(null)===0 trap.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Position-in-range as a true percentage. Accepts either an already-%
// value (daily_intelligence signals.pct_range) or computes from prices.
// Can exceed 100 when price sits above the TRR — render as-is.
function rangePctFrom(price, lrr, trr) {
  if (price == null || lrr == null || trr == null) return null
  if (trr <= lrr) return null
  return ((price - lrr) / (trr - lrr)) * 100
}

// VIX bucket per the playbook: Investable <20, Chop 20–29, F-bucket 30+.
function vixBucketOf(v) {
  if (v == null) return null
  if (v < 20) return { label: 'INVESTABLE', tone: 'bull', vote: 1 }
  if (v < 30) return { label: 'CHOP', tone: 'amber', vote: 0 }
  return { label: 'F-BUCKET', tone: 'bear', vote: -1 }
}

// Quad doctrine (hardcoded Hedgeye GIP reference, Master the Market p.27)
// condensed to the one-line favor/avoid read the checklist needs.
const QUAD_INFO = {
  1: { name: 'Goldilocks', growth: 'up', inflation: 'down', tone: 'bull', favor: 'Equities · Credit · Tech · High Beta', avoid: 'USD · Fixed Income · Utilities' },
  2: { name: 'Reflation', growth: 'up', inflation: 'up', tone: 'bull', favor: 'Commodities · Equities · Industrials · Small Caps', avoid: 'USD · Long Bonds · Utilities · Staples' },
  3: { name: 'Stagflation', growth: 'down', inflation: 'up', tone: 'bear', favor: 'Gold · Commodities · Utilities · Energy', avoid: 'Credit · Financials · Small Caps' },
  4: { name: 'Deflation', growth: 'down', inflation: 'down', tone: 'bear', favor: 'Bonds · Gold · USD · Staples · Low Beta', avoid: 'Commodities · Equities · Energy · High Beta' },
}

function quadInt(v) {
  const n = parseInt(v, 10)
  return n >= 1 && n <= 4 ? n : null
}

// Fallback action grammar — used ONLY when a signal has no AI verdict
// row. The verdict table (TRR slope / momentum / vol aware) is primary.
function fallbackAction(s, pct) {
  const zone = (s.zone || '').toLowerCase()
  if (zone === 'buy_zone') return { action: 'BUY', zone: 'at_lrr' }
  if (zone === 'trim_zone') return { action: 'TRIM', zone: 'at_trr' }
  if (pct == null) return null
  const t = (s.trend || '').toUpperCase()
  if (t === 'BEARISH' && pct >= 80) return { action: 'SHORT', zone: 'at_trr' }
  if (t === 'BEARISH' && pct <= 20) return { action: 'COVER', zone: 'at_lrr' }
  return null
}

// AI verdict action → display tone.
const ACTION_TONE = {
  BUY: 'bull',
  LET_RUN: 'bull',
  ADD: 'bull',
  HOLD: 'neu',
  WATCH: 'neu',
  TRIM: 'amber',
  REDUCE: 'amber',
  COVER: 'amber',
  SELL: 'bear',
  SHORT: 'bear',
  EXIT: 'bear',
  AVOID: 'bear',
}

function actionTone(a) {
  return ACTION_TONE[(a || '').toUpperCase()] ?? 'neu'
}

function trendTone(t) {
  const u = (t || '').toUpperCase()
  if (u === 'BULLISH' || u === 'LONG') return 'bull'
  if (u === 'BEARISH' || u === 'SHORT') return 'bear'
  return 'neu'
}

// 'YYYY-MM-DD' → 'M/D'
function fmtMD(iso) {
  if (!iso) return ''
  const [, m, d] = String(iso).split('-').map(Number)
  if (!m || !d) return ''
  return `${m}/${d}`
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Whole days between two YYYY-MM-DD strings (b - a).
function daysBetween(a, b) {
  if (!a || !b) return null
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  if (!ay || !by) return null
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// --- Shared chrome ----------------------------------------------------

function Verdict({ tone, children }) {
  return <span className={`pmc-verdict pmc-verdict-${tone}`}>{children}</span>
}

function TrendChip({ trend }) {
  const tone = trendTone(trend)
  return (
    <span className={`pmc-chip pmc-chip-${tone}`}>{(trend || '—').toUpperCase()}</span>
  )
}

function StaleChip({ days, what }) {
  if (days == null || days <= 0) return null
  return (
    <span className="pmc-chip pmc-chip-amber">
      {what} {days} {days === 1 ? 'DAY' : 'DAYS'} OLD
    </span>
  )
}

// One checklist section: number + question + verdict, body below.
function Check({ index, title, verdict, children }) {
  return (
    <motion.section
      className="db-section db-scrim pmc-check"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.045, ease: 'easeOut' }}
    >
      <div className="card-bg" aria-hidden="true" />
      <header className="pmc-check-head">
        <span className="pmc-check-num">{index}</span>
        <h2 className="pmc-check-title">{title}</h2>
        {verdict}
      </header>
      <div className="pmc-check-body">{children}</div>
    </motion.section>
  )
}

// --- Main -------------------------------------------------------------

export function PreMarketChecklist() {
  const {
    status, di: row, morning, quads, regime, verdicts, rangeStates,
    conflicts, breaks, exits, book, rotation, earnings,
  } = useMorningChecklist()
  const { data: vixLive } = useVixBucket()

  const today = todayIso()
  const asOf = row?.signal_date ?? null
  const signalsAgeDays = daysBetween(asOf, today)

  // ---- 1. REGIME ------------------------------------------------------
  const mQuad = quadInt(quads.monthly?.value)
  const qQuad = quadInt(quads.quarterly?.value)
  const mInfo = mQuad ? QUAD_INFO[mQuad] : null
  const upcomingQuad = quadInt(quads.monthlyShift?.value) ?? quadInt(row?.emerging_quad)
  const upcomingFrom = quads.monthlyShift?.stated_on ?? null
  const regimeAgeDays = daysBetween(regime?.signal_date ?? null, today)
  const riskScore = num(regime?.risk_asset_score)
  const defScore = num(regime?.defensive_score)

  // ---- 2. VOLATILITY ---------------------------------------------------
  const vixState = row?.vix_state ?? null
  const vixPrior = num(vixState?.price)
  const vixVal = vixLive?.vix_value != null ? num(vixLive.vix_value) : vixPrior
  const vixBkt = vixBucketOf(vixVal) ?? { label: 'UNKNOWN', tone: 'neu', vote: 0 }
  const priorBkt = vixBucketOf(vixPrior)
  const bucketCrossed = priorBkt && vixBkt.label !== 'UNKNOWN' && priorBkt.label !== vixBkt.label
  const vixLrr = num(vixState?.lrr)
  const vixTrr = num(vixState?.trr)
  const vixPct = num(vixState?.pct_range) ?? rangePctFrom(vixVal, vixLrr, vixTrr)
  const vixChg = vixLive?.day_change != null ? num(vixLive.day_change) : null
  const vixChgPct = vixLive?.day_change_pct != null ? num(vixLive.day_change_pct) : null

  // ---- 3. WHAT CHANGED OVERNIGHT ---------------------------------------
  const posture = row?.signal_posture ?? null
  const allFlips = Array.isArray(row?.signal_flips_recent) ? row.signal_flips_recent : []
  const flipDates = [...new Set(allFlips.map((f) => f.date))].sort().reverse()
  const latestFlipDate = flipDates[0] ?? null
  const overnightFlips = allFlips.filter((f) => f.date === latestFlipDate)
  const bulls = num(posture?.bull)
  const bears = num(posture?.bear)
  const lean =
    bulls != null && bears != null
      ? bulls > bears
        ? { label: `BULLS ${bulls}–${bears}`, tone: 'bull', vote: 1 }
        : bears > bulls
          ? { label: `BEARS ${bears}–${bulls}`, tone: 'bear', vote: -1 }
          : { label: `SPLIT ${bulls}–${bears}`, tone: 'amber', vote: 0 }
      : null
  const adds = book.filter((b) => b.is_new)
  const changeBits = []
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`
  if (overnightFlips.length > 0) changeBits.push(plural(overnightFlips.length, 'FLIP'))
  if (breaks.length > 0) changeBits.push(plural(breaks.length, 'BREAK'))
  if (adds.length > 0) changeBits.push(plural(adds.length, 'ADD'))
  if (exits.length > 0) changeBits.push(plural(exits.length, 'EXIT'))

  // Range structure — counts per state in canonical order.
  const RS_ORDER = ['HH/HL', 'LH/LL', 'HH/LL', 'LH/HL', 'unchanged']
  const rsCounts = RS_ORDER.map((s) => ({ state: s, n: rangeStates.counts[s] ?? 0 })).filter((s) => s.n > 0)
  const hhCount = rangeStates.counts['HH/HL'] ?? 0
  const llCount = rangeStates.counts['LH/LL'] ?? 0
  const structure =
    rangeStates.date != null
      ? hhCount > llCount
        ? { label: `${hhCount} HH/HL vs ${llCount} LH/LL`, tone: 'bull', vote: 1 }
        : llCount > hhCount
          ? { label: `${llCount} LH/LL vs ${hhCount} HH/HL`, tone: 'bear', vote: -1 }
          : { label: 'BALANCED', tone: 'amber', vote: 0 }
      : null

  // ---- MORNING READ banner: 5-vote stance + frictions -------------------
  const votes = []
  if (mInfo) votes.push({ name: 'QUAD', label: `Q${mQuad} ${mInfo.name}`, tone: mInfo.tone, v: mInfo.tone === 'bull' ? 1 : -1 })
  if (regime?.regime_label) {
    const rl = regime.regime_label
    votes.push({
      name: 'TAPE',
      label: rl.replace('_', ' '),
      tone: rl === 'RISK_ON' ? 'bull' : rl === 'RISK_OFF' ? 'bear' : 'amber',
      v: rl === 'RISK_ON' ? 1 : rl === 'RISK_OFF' ? -1 : 0,
    })
  }
  if (vixBkt.label !== 'UNKNOWN') votes.push({ name: 'VOL', label: vixBkt.label, tone: vixBkt.tone, v: vixBkt.vote })
  if (lean) votes.push({ name: 'TRENDS', label: lean.label, tone: lean.tone, v: lean.vote })
  if (structure) votes.push({ name: 'RANGES', label: structure.label, tone: structure.tone, v: structure.vote })
  const score = votes.reduce((a, v) => a + v.v, 0)
  const stance =
    votes.length === 0
      ? null
      : score >= 3
        ? { label: 'RISK ON', tone: 'bull' }
        : score >= 1
          ? { label: 'LEAN LONG — RESPECT VOL', tone: 'bull' }
          : score >= -1
            ? { label: 'MIXED — SIZE DOWN', tone: 'amber' }
            : { label: 'DEFENSIVE', tone: 'bear' }
  const frictions = stance
    ? votes.filter((v) => (score >= 0 ? v.v < 0 : v.v > 0))
    : []

  // ---- 4. RANGE EXTREMES (AI-verdict driven) ----------------------------
  const signals = Array.isArray(row?.signals) ? row.signals : []
  const signalByTicker = {}
  for (const s of signals) signalByTicker[s.ticker] = s
  const CONV_RANK = { high: 0, medium: 1, low: 2 }
  const verdictRows = Object.values(verdicts.byTicker)
  const hasVerdicts = verdictRows.length > 0
  let extremeRows
  if (hasVerdicts) {
    extremeRows = verdictRows
      .filter((v) => v.range_zone === 'at_lrr' || v.range_zone === 'at_trr')
      .map((v) => {
        const s = signalByTicker[v.ticker]
        const pct = s ? num(s.pct_range) ?? rangePctFrom(num(s.price), num(s.lrr), num(s.trr)) : null
        return {
          ticker: v.ticker,
          zone: v.range_zone,
          action: (v.action || '').replace(/_/g, ' '),
          tone: actionTone(v.action),
          conviction: v.conviction || null,
          oneliner: v.verdict_oneliner || null,
          trend: s?.trend ?? null,
          price: s ? num(s.price) : null,
          pct,
        }
      })
  } else {
    extremeRows = signals
      .map((s) => {
        const pct = num(s.pct_range) ?? rangePctFrom(num(s.price), num(s.lrr), num(s.trr))
        const fb = fallbackAction(s, pct)
        return fb
          ? { ticker: s.ticker, zone: fb.zone, action: fb.action, tone: actionTone(fb.action), conviction: null, oneliner: null, trend: s.trend, price: num(s.price), pct }
          : null
      })
      .filter(Boolean)
  }
  const sortExtreme = (a, b) =>
    (CONV_RANK[a.conviction] ?? 3) - (CONV_RANK[b.conviction] ?? 3) || (a.pct ?? 50) - (b.pct ?? 50)
  const atLrr = extremeRows.filter((e) => e.zone === 'at_lrr').sort(sortExtreme)
  const atTrr = extremeRows.filter((e) => e.zone === 'at_trr').sort(sortExtreme)

  // ---- 6. SECTORS + ROTATION -------------------------------------------
  const sectors = Array.isArray(row?.sector_performance) ? row.sector_performance : []
  const sectorRows = sectors.filter((s) => s.ticker !== 'SPY')
  const secBulls = sectorRows.filter((s) => trendTone(s.trend) === 'bull').length
  const secBears = sectorRows.filter((s) => trendTone(s.trend) === 'bear').length
  const prevRotBySector = {}
  for (const r of rotation.prev) prevRotBySector[r.sector] = num(r.net_long)
  const rotationMoves = rotation.latest
    .map((r) => {
      const now = num(r.net_long)
      const was = prevRotBySector[r.sector] ?? null
      return { sector: r.sector, now, was, delta: now != null && was != null ? now - was : null }
    })
    .filter((r) => r.now != null)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))

  // ---- 7. EVENT RISK ---------------------------------------------------
  const earnToday = earnings.filter((e) => e.earnings_date === today)
  const earnLater = earnings.filter((e) => e.earnings_date !== today)
  const conflictSet = new Set(conflicts.map((c) => c.ticker))
  const newAddSet = new Set(adds.map((a) => a.ticker))

  // ---- 8. FOCUS --------------------------------------------------------
  const top3 = (Array.isArray(row?.top3_today) ? row.top3_today : [])
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const spx = row?.spx_impact ?? null
  const contributors = Array.isArray(spx?.contributors) ? spx.contributors.slice(0, 3) : []
  const detractors = Array.isArray(spx?.detractors) ? spx.detractors.slice(0, 3) : []
  const onDeckRaw = Array.isArray(row?.on_deck_top5) ? row.on_deck_top5 : []
  const onDeck = []
  {
    const seen = new Set()
    for (const o of onDeckRaw) {
      if (seen.has(o.ticker)) continue
      seen.add(o.ticker)
      onDeck.push(o)
      if (onDeck.length >= 10) break
    }
  }
  const iiActive = Array.isArray(row?.investing_ideas_active) ? row.investing_ideas_active : []
  const top5Today = book
    .filter((b) => b.top5_rank_today != null)
    .sort((a, b) => a.top5_rank_today - b.top5_rank_today)

  return (
    <div className="panel daily-brief">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Pre-Market Checklist</h1>
          {asOf && (
            <p className="pmc-asof">
              Signals as of {asOf}
              {signalsAgeDays != null && signalsAgeDays > 0 && (
                <span className="pmc-chip pmc-chip-amber pmc-asof-stale">
                  {signalsAgeDays} {signalsAgeDays === 1 ? 'DAY' : 'DAYS'} OLD
                </span>
              )}
            </p>
          )}
        </div>
      </header>

      {status === 'loading' && <p className="db-state">Loading the morning board…</p>}
      {status === 'error' && (
        <p className="db-state db-state-error">Daily intelligence unavailable — checklist can’t load.</p>
      )}

      {status === 'ready' && (
        <div className="pmc-stack">
          {/* ============ MORNING READ banner ============ */}
          {stance && (
            <motion.section
              className="db-section db-scrim pmc-check pmc-banner"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div className="card-bg" aria-hidden="true" />
              <header className="pmc-check-head">
                <h2 className="pmc-check-title">Morning Read</h2>
                <Verdict tone={stance.tone}>{stance.label}</Verdict>
              </header>
              <div className="pmc-check-body">
                <div className="pmc-votes">
                  {votes.map((v) => (
                    <span className="pmc-vote" key={v.name}>
                      <span className="pmc-vote-name">{v.name}</span>
                      <span className={`pmc-chip pmc-chip-${v.tone}`}>{v.label}</span>
                    </span>
                  ))}
                </div>
                {frictions.length > 0 && (
                  <p className="pmc-friction">
                    <b>Against the grain:</b>{' '}
                    {frictions.map((f) => `${f.name} (${f.label})`).join(' · ')}
                  </p>
                )}
                {morning?.headline && (
                  <p className="pmc-banner-narrative">
                    {morning.headline}
                    {morning.insight_date && morning.insight_date !== today && (
                      <span className="pmc-chip pmc-chip-amber pmc-asof-stale">READ FROM {fmtMD(morning.insight_date)}</span>
                    )}
                  </p>
                )}
              </div>
            </motion.section>
          )}

          {/* ============ 1. REGIME ============ */}
          <Check
            index={1}
            title="What Quad are we in?"
            verdict={
              mInfo ? (
                <Verdict tone={mInfo.tone}>QUAD {mQuad} · {mInfo.name.toUpperCase()}</Verdict>
              ) : (
                <Verdict tone="neu">AWAITING DATA</Verdict>
              )
            }
          >
            {mInfo ? (
              <div className="pmc-regime">
                <div className="pmc-regime-main">
                  <span className={`pmc-regime-quad pmc-tone-${mInfo.tone}`}>QUAD {mQuad}</span>
                  <span className="pmc-regime-name">{mInfo.name}</span>
                  <span className="pmc-regime-gip">
                    Growth <b className={mInfo.growth === 'up' ? 'pmc-up' : 'pmc-down'}>{mInfo.growth === 'up' ? '↑' : '↓'}</b>
                    {' · '}
                    Inflation <b className={mInfo.inflation === 'up' ? 'pmc-up' : 'pmc-down'}>{mInfo.inflation === 'up' ? '↑' : '↓'}</b>
                  </span>
                  {quads.monthly?.stated_on && (
                    <span className="pmc-regime-date">monthly · {fmtMD(quads.monthly.stated_on)}</span>
                  )}
                </div>
                <div className="pmc-regime-play">
                  <span className="pmc-play-row"><span className="pmc-play-label pmc-up">FAVOR</span> {mInfo.favor}</span>
                  <span className="pmc-play-row"><span className="pmc-play-label pmc-down">AVOID</span> {mInfo.avoid}</span>
                </div>
                {(upcomingQuad || qQuad) && (
                  <div className="pmc-regime-next">
                    {upcomingQuad && (
                      <span>
                        Shifting toward: <b className={`pmc-tone-${QUAD_INFO[upcomingQuad]?.tone ?? 'neu'}`}>QUAD {upcomingQuad} {QUAD_INFO[upcomingQuad]?.name ?? ''}</b>
                        {upcomingFrom && <span className="pmc-regime-date"> · flagged {fmtMD(upcomingFrom)}</span>}
                      </span>
                    )}
                    {qQuad && <span>Quarterly: <b>QUAD {qQuad}</b></span>}
                  </div>
                )}
                {regime && (
                  <div className="pmc-regime-market">
                    <span className="pmc-subhead">MARKET CONFIRMS?</span>
                    <span className="pmc-regime-market-line">
                      <b className={
                        regime.regime_label === 'RISK_ON' ? 'pmc-up'
                        : regime.regime_label === 'RISK_OFF' ? 'pmc-down'
                        : 'pmc-tone-amber'
                      }>
                        {(regime.regime_label || '—').replace('_', ' ')}
                      </b>
                      {riskScore != null && defScore != null && (riskScore !== 0 || defScore !== 0) && (
                        <> · risk assets {riskScore} vs defensives {defScore}</>
                      )}
                      {regime.dxy_signal && regime.dxy_signal !== 'UNKNOWN' && (
                        <> · DXY {regime.dxy_signal}</>
                      )}
                      {regime.signal_date && <span className="pmc-regime-date"> · {fmtMD(regime.signal_date)}</span>}
                      <StaleChip days={regimeAgeDays != null && regimeAgeDays > 2 ? regimeAgeDays : null} what="READ" />
                    </span>
                  </div>
                )}
                {quads.regional.length > 0 && (
                  <div className="pmc-regime-regional">
                    {quads.regional.map((r) => {
                      const n = quadInt(r.value)
                      const tone = n === 1 || n === 2 ? 'bull' : n === 3 || n === 4 ? 'bear' : 'neu'
                      return (
                        <span className={`pmc-chip pmc-chip-${tone}`} key={r.region}>
                          {r.region} Q{n ?? '—'}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="db-state">No US quad assertion yet — check the Macro Show tab.</p>
            )}
          </Check>

          {/* ============ 2. VOLATILITY ============ */}
          <Check
            index={2}
            title="Is volatility investable?"
            verdict={<Verdict tone={vixBkt.tone}>{vixBkt.label}</Verdict>}
          >
            <div className="pmc-vix">
              <span className={`pmc-vix-num pmc-tone-${vixBkt.tone}`}>{vixVal != null ? vixVal.toFixed(1) : '—'}</span>
              <div className="pmc-vix-meta">
                <span className="pmc-vix-line">
                  VIX{' '}
                  {vixChg != null && (
                    <b className={vixChg >= 0 ? 'pmc-down' : 'pmc-up'}>
                      {vixChg >= 0 ? '+' : ''}{vixChg.toFixed(2)}
                      {vixChgPct != null ? ` (${vixChgPct >= 0 ? '+' : ''}${vixChgPct.toFixed(1)}%)` : ''}
                    </b>
                  )}
                  {bucketCrossed && (
                    <span className={`pmc-chip pmc-chip-${vixBkt.tone === 'bull' ? 'bull' : 'amber'} pmc-bucket-cross`}>
                      ⚠ {priorBkt.label} → {vixBkt.label} OVERNIGHT
                    </span>
                  )}
                </span>
                <span className="pmc-vix-line">
                  Range <b className="pmc-up">{fmtNum(vixLrr)}</b> – <b className="pmc-down">{fmtNum(vixTrr)}</b>
                  {vixPct != null && <> · <b>{Math.round(vixPct)}%</b> of range</>}
                  {asOf && <span className="pmc-regime-date"> · range from {fmtMD(asOf)}</span>}
                </span>
                <span className="pmc-vix-line pmc-vix-rule">
                  &lt;20 investable · 20–29 chop (size down) · 30+ defense
                </span>
              </div>
            </div>
          </Check>

          {/* ============ 3. WHAT CHANGED OVERNIGHT ============ */}
          <Check
            index={3}
            title="What changed overnight?"
            verdict={
              changeBits.length > 0 ? (
                <Verdict tone={lean?.tone ?? 'amber'}>{changeBits.join(' · ')}</Verdict>
              ) : (
                <Verdict tone="neu">QUIET TAPE</Verdict>
              )
            }
          >
            {posture && (
              <div className="pmc-posture">
                <span className="pmc-posture-cell"><b className="pmc-up">{bulls ?? '—'}</b> bullish</span>
                <span className="pmc-posture-cell"><b className="pmc-down">{bears ?? '—'}</b> bearish</span>
                <span className="pmc-posture-cell"><b>{num(posture.neutral) ?? '—'}</b> neutral</span>
                <span className="pmc-posture-cell pmc-posture-sub">of {num(posture.total) ?? '—'} macro signals{lean ? ` — ${lean.label.toLowerCase()}` : ''}</span>
              </div>
            )}

            {rsCounts.length > 0 && (
              <div>
                <span className="pmc-subhead">RANGE STRUCTURE — {fmtMD(rangeStates.date)}</span>
                <div className="pmc-rs-counts">
                  {rsCounts.map((s) => (
                    <span className="pmc-rs-cell" key={s.state}>
                      <b>{s.n}</b> <RangeStateBadge state={s.state} />
                    </span>
                  ))}
                  {structure && structure.vote !== (lean?.vote ?? 0) && lean && (
                    <span className="pmc-chip pmc-chip-amber">⚠ STRUCTURE DISAGREES WITH TREND BOARD</span>
                  )}
                </div>
                {rangeStates.movers.length > 0 && (
                  <div className="pmc-rs-movers">
                    {rangeStates.movers.map((m) => (
                      <span className="pmc-rs-mover" key={m.ticker}>
                        <b>{m.ticker}</b> <RangeStateBadge state={m.range_state} size="sm" />{' '}
                        <span className={num(m.width_delta) >= 0 ? 'pmc-down' : 'pmc-up'}>
                          width {num(m.width_delta) >= 0 ? '+' : ''}{fmtNum(num(m.width_delta))}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {overnightFlips.length > 0 && (
              <div>
                <span className="pmc-subhead">TREND FLIPS — {fmtMD(latestFlipDate)}</span>
                <ul className="pmc-flips">
                  {overnightFlips.map((f) => (
                    <li className="pmc-flip" key={`${f.ticker}-${f.date}`}>
                      <span className="pmc-flip-ticker">{f.ticker}</span>
                      <TrendChip trend={f.from} />
                      <span className="pmc-flip-arrow">→</span>
                      <TrendChip trend={f.to} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {breaks.length > 0 && (
              <div>
                <span className="pmc-subhead">RANGE BREAKS — {fmtMD(breaks[0]?.break_date)}</span>
                <ul className="pmc-flips">
                  {breaks.map((b) => {
                    const below = b.break_type === 'BELOW_BUY'
                    const level = below ? num(b.buy_range) : num(b.sell_range)
                    return (
                      <li className="pmc-flip" key={b.ticker}>
                        <span className="pmc-flip-ticker">{b.ticker}</span>
                        <span className={`pmc-break ${below ? 'pmc-down' : 'pmc-up'}`}>
                          {below ? '↓ broke below LRR' : '↑ broke above TRR'} {fmtNum(level)}
                          {b.event_count > 1 ? ` ×${b.event_count}` : ''}
                        </span>
                        <TrendChip trend={b.direction} />
                        <span className="pmc-flip-date">last {fmtNum(num(b.current_price))}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="pmc-footnote">A bullish name breaking below its LRR is either capitulation or a failing signal — confirm before buying the low.</p>
              </div>
            )}

            {(adds.length > 0 || exits.length > 0) && (
              <div>
                <span className="pmc-subhead">BOOK CHANGES TODAY</span>
                <div className="pmc-ondeck-rows">
                  {adds.map((a) => (
                    <span className={`pmc-chip pmc-chip-${trendTone(a.position_type)}`} key={`add-${a.ticker}`}>
                      + {a.ticker} NEW {a.position_type}
                    </span>
                  ))}
                  {exits.map((e) => (
                    <span className={`pmc-chip pmc-chip-${trendTone(e.exited_from)}`} key={`ex-${e.ticker}`}>
                      − {e.ticker} ex-{e.exited_from}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {overnightFlips.length === 0 && breaks.length === 0 && exits.length === 0 && adds.length === 0 && rsCounts.length === 0 && (
              <p className="db-state">No flips, breaks, or book changes on the latest dates.</p>
            )}
          </Check>

          {/* ============ 4. RANGE EXTREMES (AI verdicts) ============ */}
          <Check
            index={4}
            title="Who’s at the edge of the range?"
            verdict={
              <Verdict tone={atLrr.length + atTrr.length > 0 ? 'amber' : 'neu'}>
                {atLrr.length} AT LRR · {atTrr.length} AT TRR
              </Verdict>
            }
          >
            <div className="pmc-extremes">
              <div className="pmc-extreme-col">
                <span className="pmc-extreme-head pmc-up">AT THE LOW END — NEAR LRR</span>
                {atLrr.length === 0 && <p className="db-state">Nothing at the low end.</p>}
                {atLrr.map((e) => (
                  <div className="pmc-extreme-item" key={e.ticker}>
                    <div className="pmc-extreme-row">
                      <span className={`pmc-action pmc-tone-${e.tone}`}>{e.action}</span>
                      <span className="pmc-extreme-ticker">{e.ticker}</span>
                      {e.conviction && <span className={`pmc-conv pmc-conv-${e.conviction}`}>{e.conviction}</span>}
                      <span className="pmc-extreme-num">{fmtNum(e.price)}</span>
                      <span className="pmc-extreme-pct">{e.pct != null ? `${Math.round(e.pct)}%` : '—'}</span>
                    </div>
                    {e.oneliner && <p className="pmc-extreme-why">{e.oneliner}</p>}
                  </div>
                ))}
              </div>
              <div className="pmc-extreme-col">
                <span className="pmc-extreme-head pmc-down">AT THE HIGH END — NEAR TRR</span>
                {atTrr.length === 0 && <p className="db-state">Nothing at the high end.</p>}
                {atTrr.map((e) => (
                  <div className="pmc-extreme-item" key={e.ticker}>
                    <div className="pmc-extreme-row">
                      <span className={`pmc-action pmc-tone-${e.tone}`}>{e.action}</span>
                      <span className="pmc-extreme-ticker">{e.ticker}</span>
                      {e.conviction && <span className={`pmc-conv pmc-conv-${e.conviction}`}>{e.conviction}</span>}
                      <span className="pmc-extreme-num">{fmtNum(e.price)}</span>
                      <span className="pmc-extreme-pct">{e.pct != null ? `${Math.round(e.pct)}%` : '—'}</span>
                    </div>
                    {e.oneliner && <p className="pmc-extreme-why">{e.oneliner}</p>}
                  </div>
                ))}
              </div>
            </div>
            <p className="pmc-footnote">
              {hasVerdicts
                ? `Actions are per-signal AI verdicts (trend, range position, ceiling slope, momentum, vol) as of ${verdicts.date ?? '—'}. % = position in the LRR→TRR range; over 100% = above TRR.`
                : '% = position in the LRR→TRR risk range. Over 100% = above TRR.'}
            </p>
          </Check>

          {/* ============ 5. SIGNAL GATE ============ */}
          <Check
            index={5}
            title="Any positions fighting the signal?"
            verdict={
              conflicts.length === 0 ? (
                <Verdict tone="bull">CLEAR</Verdict>
              ) : (
                <Verdict tone="bear">{conflicts.length} CONFLICTS</Verdict>
              )
            }
          >
            {conflicts.length === 0 && (
              <p className="db-state">Every active Call position agrees with its risk-range signal.</p>
            )}
            {conflicts.length > 0 && (
              <>
                <ul className="pmc-gate-list">
                  {conflicts.map((c) => {
                    const rank = book.find((b) => b.ticker === c.ticker)?.top5_rank_today ?? null
                    return (
                      <li className="pmc-gate-row" key={c.ticker}>
                        <span className="pmc-extreme-ticker">{c.ticker}</span>
                        <span className={`pmc-chip pmc-chip-${trendTone(c.call_position)}`}>CALL {c.call_position}</span>
                        <span className="pmc-gate-vs">vs</span>
                        <span className={`pmc-chip pmc-chip-${trendTone(c.rr_trend)}`}>SIGNAL {c.rr_trend}</span>
                        {c.call_conviction === 'best_idea' && (
                          <span className="pmc-chip pmc-chip-amber">★ BEST IDEA</span>
                        )}
                        {rank != null && (
                          <span className="pmc-chip pmc-chip-amber">TOP-5 #{rank} TODAY</span>
                        )}
                        <span className={`pmc-gate-rule pmc-tone-${trendTone(c.rr_trend)}`}>
                          signal wins — treat as {c.rr_trend}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <p className="pmc-footnote">The quantitative signal is the gate: a bearish signal makes the name bearish regardless of the fundamental call.</p>
              </>
            )}
          </Check>

          {/* ============ 6. SECTORS + ROTATION ============ */}
          <Check
            index={6}
            title="Which sectors have the wind?"
            verdict={
              sectorRows.length > 0 ? (
                <Verdict tone={secBulls > secBears ? 'bull' : secBears > secBulls ? 'bear' : 'amber'}>
                  {secBulls} BULL / {secBears} BEAR
                </Verdict>
              ) : (
                <Verdict tone="neu">NO DATA</Verdict>
              )
            }
          >
            {sectorRows.length === 0 ? (
              <p className="db-state">No sector tape today.</p>
            ) : (
              <div className="pmc-sectors">
                {sectorRows.map((s) => {
                  const tone = trendTone(s.trend)
                  const p1 = num(s.pct_1d)
                  const mtd = num(s.pct_mtd)
                  const ytd = num(s.pct_ytd)
                  return (
                    <div className={`pmc-sector pmc-sector-${tone}`} key={s.ticker}>
                      <span className="pmc-sector-name">{s.label}</span>
                      <span className="pmc-sector-ticker">{s.ticker}</span>
                      <span className={`pmc-sector-1d ${p1 != null && p1 < 0 ? 'pmc-down' : 'pmc-up'}`}>
                        {p1 != null ? `${p1 >= 0 ? '+' : ''}${p1.toFixed(2)}%` : '—'}
                      </span>
                      <span className="pmc-sector-ytd">
                        MTD {mtd != null ? `${mtd >= 0 ? '+' : ''}${mtd.toFixed(1)}%` : '—'} · YTD {ytd != null ? `${ytd >= 0 ? '+' : ''}${ytd.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {rotationMoves.length > 0 && (
              <div className="pmc-rotation">
                <span className="pmc-subhead">
                  ANALYST ROTATION — NET LONGS, WK OF {fmtMD(rotation.latestWeek)}{rotation.prevWeek ? ` VS ${fmtMD(rotation.prevWeek)}` : ''}
                </span>
                <div className="pmc-ondeck-rows">
                  {rotationMoves.map((r) => {
                    const tone = r.delta == null ? 'neu' : r.delta > 0 ? 'bull' : r.delta < 0 ? 'bear' : 'neu'
                    return (
                      <span className={`pmc-chip pmc-chip-${tone}`} key={r.sector}>
                        {r.sector}: {r.was != null ? `${r.was} → ` : ''}{r.now}
                        {r.delta != null && r.delta !== 0 ? (r.delta > 0 ? ' ▲' : ' ▼') : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </Check>

          {/* ============ 7. EVENT RISK ============ */}
          <Check
            index={7}
            title="Who reports earnings?"
            verdict={
              earnings.length === 0 ? (
                <Verdict tone="bull">NONE ON THE BOOK</Verdict>
              ) : earnToday.length > 0 ? (
                <Verdict tone="bear">{earnToday.length} TODAY · {earnLater.length} THIS WEEK</Verdict>
              ) : (
                <Verdict tone="amber">{earnLater.length} THIS WEEK</Verdict>
              )
            }
          >
            {earnings.length === 0 ? (
              <p className="db-state">No tracked name reports in the next 8 days.</p>
            ) : (
              <>
                <ul className="pmc-flips">
                  {earnings.map((e) => (
                    <li className="pmc-flip" key={`${e.symbol}-${e.earnings_date}`}>
                      <span className="pmc-flip-ticker">{e.symbol}</span>
                      {e.earnings_date === today ? (
                        <span className="pmc-chip pmc-chip-bear">REPORTS TODAY</span>
                      ) : (
                        <span className="pmc-chip pmc-chip-neu">{fmtMD(e.earnings_date)}</span>
                      )}
                      {e.book_side && (
                        <span className={`pmc-chip pmc-chip-${trendTone(e.book_side)}`}>{e.book_side}</span>
                      )}
                      {e.call_time && <span className="pmc-earn-time">{e.call_time}</span>}
                      {newAddSet.has(e.symbol) && (
                        <span className="pmc-chip pmc-chip-amber">⚠ ADDED TODAY</span>
                      )}
                      {conflictSet.has(e.symbol) && (
                        <span className="pmc-chip pmc-chip-amber">⚠ GATE CONFLICT</span>
                      )}
                      {num(e.eps_estimated) != null && (
                        <span className="pmc-flip-date">est EPS {fmtNum(num(e.eps_estimated))}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="pmc-footnote">Universe: active Call positions, Investing Ideas, and MOMO names. Binary event risk — size accordingly.</p>
              </>
            )}
          </Check>

          {/* ============ 8. TODAY'S FOCUS ============ */}
          <Check
            index={8}
            title="What’s today’s story?"
            verdict={<Verdict tone="neu">{top3.length} THEMES · {onDeck.length} ON DECK</Verdict>}
          >
            {top3.length > 0 && (
              <div className="pmc-top3">
                {top3.map((t) => (
                  <div className="pmc-theme" key={t.rank}>
                    <span className="pmc-theme-rank">#{t.rank}</span>
                    <div className="pmc-theme-body">
                      <span className="pmc-theme-name">{t.theme}</span>
                      <p className="pmc-theme-text">{String(t.body || '').replace(/\[https?:[^\]]*\]\s*VIEW LINK/g, '').trim()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {top5Today.length > 0 && (
              <div>
                <span className="pmc-subhead">TODAY’S TOP-5 (MOST ACTIONABLE)</span>
                <div className="pmc-ondeck-rows">
                  {top5Today.map((b) => (
                    <span className={`pmc-chip pmc-chip-${trendTone(b.position_type)}`} key={b.ticker}>
                      #{b.top5_rank_today} {b.ticker} {b.position_type}
                      {conflictSet.has(b.ticker) ? ' ⚠' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(detractors.length > 0 || contributors.length > 0) && (
              <div className="pmc-spx">
                <span className="pmc-subhead">YESTERDAY’S S&amp;P DRIVERS</span>
                <div className="pmc-spx-rows">
                  {contributors.map((m) => (
                    <span className="pmc-spx-cell" key={`c-${m.symbol}`}>
                      <b className="pmc-up">{m.symbol}</b> +{Math.abs(num(m.impact_bps) ?? 0).toFixed(0)} bps
                    </span>
                  ))}
                  {detractors.map((m) => (
                    <span className="pmc-spx-cell" key={`d-${m.symbol}`}>
                      <b className="pmc-down">{m.symbol}</b> −{Math.abs(num(m.impact_bps) ?? 0).toFixed(0)} bps
                    </span>
                  ))}
                </div>
              </div>
            )}

            {onDeck.length > 0 && (
              <div className="pmc-ondeck">
                <span className="pmc-subhead">ON DECK (RECENT TOP-5 NAMES)</span>
                <div className="pmc-ondeck-rows">
                  {onDeck.map((o) => (
                    <span className={`pmc-chip pmc-chip-${trendTone(o.direction)}`} key={o.ticker}>
                      {o.ticker} {o.direction}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {iiActive.length > 0 && (
              <p className="pmc-footnote">{iiActive.length} Investing Ideas active — full list on the Investing Ideas tab.</p>
            )}
          </Check>
        </div>
      )}
    </div>
  )
}
