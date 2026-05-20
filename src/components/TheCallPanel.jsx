import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LABEL } from '../lib/labels'
import { supabase } from '../lib/supabase'
import { useCallPositions } from '../lib/useCallPositions'
import { useCallExtras } from '../lib/useCallExtras'
import { useWeeklyTop5 } from '../lib/useWeeklyTop5'
import { useLivePrices } from '../lib/livePrices'
import { useMarketState } from '../lib/marketState'
import { formatPrice, formatNumber } from '../lib/format'
import { parseMacroBullets } from '../lib/macroBullets'
import { PerformanceSection } from './PerformanceSection'
import { CallAllTimeView } from './CallAllTimeView'
import { TickerFilter } from './TickerFilter'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { useCountUp } from '../lib/useCountUp'
import { isMobileNow } from '../lib/useIsMobile'
import {
  canonicalSector,
  normalizeSectorKey,
  buildCallTickerGroups,
  OTHER_SECTOR,
} from '../lib/sectors'

const MACRO_BULLETS_VISIBLE = 6
const CALL_VIEW_KEY = 'dashboard.callView'
const CALL_SECTOR_KEY = 'dashboard.callSector'
const CALL_TICKERS_KEY = 'dashboard.selectedCallTickers'
const CALL_SORT_FIELD_KEY = 'dashboard.callSortField'
const CALL_SORT_DIR_KEY = 'dashboard.callSortDir'
const VALID_CALL_VIEWS = ['today', 'all_time']

// Sort fields for the Call panel dropdown. Same shape contract as RR: the
// arrow button flips dir; picking a new field resets dir to its default.
// Trimmed to 5 best per user direction. "Current price" dropped — it
// doesn't earn its spot when traders are already filtering by ticker
// for any specific price interest. Range-proximity sorts (LRR/TRR)
// can't apply here without joining Risk Ranges data, which the Call
// positions view doesn't currently carry.
const CALL_SORT_FIELDS = [
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'position', label: 'Position type', defaultDir: 'desc' },
  { value: 'sector', label: 'Sector', defaultDir: 'asc' },
  // "Day's setup" on the Call panel surfaces FLIPPED / RETURNING / ADDED
  // cards (the ones Hedgeye acted on today) via the existing changeTier
  // helper. RR's LONG SETUP/SHORT SETUP doesn't apply here.
  { value: 'setup', label: "Day's setup", defaultDir: 'desc' },
  // Days held = consecutive_days (held_since isn't on the row).
  { value: 'days_held', label: 'Days held', defaultDir: 'desc' },
]
const CALL_SORT_VALUES = new Set(CALL_SORT_FIELDS.map((f) => f.value))

// LONG > NEUTRAL > SHORT. Desc surfaces longs first.
const POSITION_RANK = { LONG: 2, NEUTRAL: 1, SHORT: 0 }

function loadInitialCallSortField() {
  try {
    const raw = localStorage.getItem(CALL_SORT_FIELD_KEY)
    if (raw && CALL_SORT_VALUES.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read callSortField from localStorage:', err)
  }
  return 'ticker'
}

function loadInitialCallSortDir() {
  try {
    const raw = localStorage.getItem(CALL_SORT_DIR_KEY)
    if (raw === 'asc' || raw === 'desc') return raw
  } catch (err) {
    console.warn('Failed to read callSortDir from localStorage:', err)
  }
  return 'asc'
}

// Numeric compare with nulls-last (regardless of direction).
function numCmpNullsLast(a, b, dir) {
  const aNull = a == null || !Number.isFinite(a)
  const bNull = b == null || !Number.isFinite(b)
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  return dir === 'asc' ? a - b : b - a
}

function loadInitialCallView() {
  try {
    const raw = localStorage.getItem(CALL_VIEW_KEY)
    if (raw && VALID_CALL_VIEWS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read callView from localStorage:', err)
  }
  return 'today'
}

// Sector filter is a Set<normalizedKey>. Empty set = "show all sectors"
// (ALL chip active). Stored as a JSON array. Migration from the old
// single-string format ('ALL' or a sector name) is handled at load time
// so existing users don't see their preference wiped on first deploy.
function loadInitialCallSector() {
  try {
    const raw = localStorage.getItem(CALL_SECTOR_KEY)
    if (!raw) return new Set()
    // New format: JSON array of normalized sector keys.
    if (raw.startsWith('[')) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return new Set(
          parsed.filter((s) => typeof s === 'string').map((s) => s.toLowerCase())
        )
      }
    }
    // Legacy single-string format.
    if (raw === 'ALL') return new Set()
    return new Set([raw.toLowerCase()])
  } catch (err) {
    console.warn('Failed to read callSector from localStorage:', err)
  }
  return new Set()
}

// "Best Idea LONG" / "Best Idea SHORT" phrasing in the rationale flags
// Hedgeye's highest-conviction calls. Case-insensitive match per spec.
const isBestIdea = (rationale) =>
  !!(rationale && /best idea (long|short)/i.test(rationale))

// A "returning" position is one that re-entered Hedgeye's call today
// (status ADDED) but has appeared in the top-5 enough recently that it's
// not genuinely new to viewers — render a calmer purple badge and skip
// the new-position green glow.
const isReturning = (row) =>
  row.change_status === 'ADDED' && (row.top5_appearances_90d ?? 0) >= 2

const POSITION_FILTERS = [
  { id: 'ALL', label: LABEL.filter.all },
  { id: 'LONG', label: LABEL.filter.long },
  { id: 'SHORT', label: LABEL.filter.short },
  { id: 'NEUTRAL', label: LABEL.filter.neutral },
]

// Tier sort: FLIPPED first → RETURNING → ADDED (new, not returning) →
// UNCHANGED. Within tier, callers add a secondary conviction sort.
// The visual RETURNING badge was removed in May 2026, but tier sort is
// kept so returning positions still bubble up above unchanged ones — and
// the ↩ RETURNING filter chip still works.
function changeTier(row) {
  if (row.change_status === 'FLIPPED') return 0
  if (isReturning(row)) return 1
  if (row.change_status === 'ADDED') return 2
  return 3
}

// --- formatters ---

// "Wed May 14" from YYYY-MM-DD.
function formatSignalDate(iso) {
  if (!iso) return ''
  // Parse as local date — no timezone math on a plain date string.
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

// "h:mm A ET" from a timestamptz that may or may not include the offset.
function formatCallReceivedEt(iso) {
  if (!iso) return null
  // call_received_at_et arrives without a `Z`/offset — treat as ET wall time.
  // We render it back as h:mm A and tag "ET" rather than letting the user's
  // local zone convert it.
  const [datePart, timePart] = iso.split('T')
  if (!datePart || !timePart) return null
  const [hh, mm] = timePart.split(':').map(Number)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const hour12 = ((hh + 11) % 12) + 1
  return `${hour12}:${String(mm).padStart(2, '0')} ${ampm} ET`
}

function changeClass(change) {
  if (change == null) return ''
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return ''
}

// --- subcomponents ---

function PositionTypePill({ type }) {
  const cls = `position-pill position-${(type ?? 'neutral').toLowerCase()}`
  return <span className={cls}>{type ?? 'NEUTRAL'}</span>
}

function ChangeStatusBadge({ row }) {
  if (row.change_status === 'ADDED') {
    return <span className="status-badge status-added">● NEW TODAY</span>
  }
  if (row.change_status === 'FLIPPED') {
    return <span className="status-badge status-flipped">⟳ FLIPPED</span>
  }
  return null
}

function BestIdeaBadge({ rationale }) {
  if (!isBestIdea(rationale)) return null
  return <span className="badge-best-idea">★ BEST IDEA</span>
}

// Same chrome as ChangeStatusBadge's NEW TODAY / FLIPPED pills — uses
// .status-badge for shape/padding/font/border, with .status-rank as the
// per-state tint variant. Text is the only thing that differs visually.
function RankBadge({ rank }) {
  if (rank == null) return null
  return <span className="status-badge status-rank">#{rank} MOST ACTIONABLE</span>
}

// Tween the live price between updates so the value visibly settles
// instead of snap-changing. Empties out to em-dash when target is not
// finite — useCountUp handles that internally.
function CallPriceCountUp({ value }) {
  const tweened = useCountUp(Number(value))
  return <>{formatPrice(tweened)}</>
}

// Inline transient flash class on .cc-price when the displayed live
// price changes. Tracks the previous numeric value via a ref so we can
// distinguish initial render (no flash) from a real tick (flash up/down).
// Mobile skips the flash entirely — the per-card setTimeout + class
// toggle on every live tick was a measurable scroll-jank source.
function useFlashOnChange(value) {
  const prevRef = useRef(null)
  const [flash, setFlash] = useState('')
  useEffect(() => {
    if (!Number.isFinite(value)) return
    const prev = prevRef.current
    prevRef.current = value
    if (prev == null || !Number.isFinite(prev) || prev === value) return
    if (isMobileNow()) return
    setFlash(value > prev ? 'flash-up' : 'flash-down')
    const id = setTimeout(() => setFlash(''), 350)
    return () => clearTimeout(id)
  }, [value])
  return flash
}

function LivePriceRow({ live }) {
  const priceVal = Number(live?.current_price)
  const flash = useFlashOnChange(Number.isFinite(priceVal) ? priceVal : null)
  if (!live || !Number.isFinite(priceVal)) {
    return (
      <div className="cc-price-row">
        <div className="cc-price-cell">
          <div className="label">Price</div>
          <span className="cc-price cc-price-none">—</span>
        </div>
      </div>
    )
  }
  const change = Number(live.change_amount)
  const pct = Number(live.change_pct)
  const cls = changeClass(change)
  const hasChange = Number.isFinite(change) || Number.isFinite(pct)
  return (
    <div className="cc-price-row">
      <div className="cc-price-cell">
        <div className="label">Price</div>
        <span className={`cc-price ${flash}`}>
          <CallPriceCountUp value={priceVal} />
        </span>
      </div>
      {hasChange && (
        <div className="cc-change-cell">
          <div className="label">Change</div>
          <div className="cc-change-stack">
            {Number.isFinite(change) && (
              <span className={`cc-change ${cls}`}>
                {change >= 0 ? '+' : ''}
                {formatNumber(change)}
              </span>
            )}
            {Number.isFinite(pct) && (
              <span className={`cc-change-pct ${cls}`}>
                {pct >= 0 ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Card footer is now just the crossover breadcrumb. The conviction bar
// + numeric score were removed — viewers don't differentiate cards by
// the 0-75 score in the visible card chrome, and the bar's running
// gradient sweep was a per-card paint cost. The full conviction bar
// still lives in TickerDetailModal for the click-into view.
function RrCrossoverBadge({ show }) {
  if (!show) return null
  return (
    <div className="conviction-row">
      <span className="badge-rr-crossover">↗ In Risk Ranges</span>
    </div>
  )
}

// Click-to-expand rationale block. Collapsed: clamped to N lines with a
// --- cards ---

// Reusable card-click handler factory. Both card variants forward to
// onOpen(row), with Enter/Space activation for keyboard parity.
function cardActivationProps(row, onOpen) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpen?.(row),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen?.(row)
      }
    },
  }
}

// Single Call card component. Renders every Call row identically — Top5
// ranks and ADDED/FLIPPED status share the same accent-row slot, the
// same footer, the same chrome. There is no longer a Top5Card variant;
// rank is just one more piece of badge content rendered through the
// shared status-badge pill.
function PositionCard({ row, live, rrCrossover, onOpen, highlight = false, extraAccent = null }) {
  const cls = [
    'call-card',
    highlight ? 'call-card-highlight' : '',
    `border-${(row.position_type ?? 'neutral').toLowerCase()}`,
    row.change_status === 'ADDED' ? 'glow-added' : '',
    row.change_status === 'FLIPPED' ? 'glow-flipped' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const directionClass = `direction-${(row.position_type ?? 'neutral').toLowerCase()}`
  const hasChangeStatus = row.change_status === 'ADDED' || row.change_status === 'FLIPPED'
  const hasRank = row.top5_rank != null
  const isBest = isBestIdea(row.rationale)
  // `extraAccent` is an optional badge slot used by the weekly Top 5
  // section to surface "×N THIS WEEK" without coupling that concept into
  // the row shape. When non-null it forces the accent row to render.
  const hasAccent = hasChangeStatus || hasRank || isBest || extraAccent != null

  return (
    <article className={cls} {...cardActivationProps(row, onOpen)}>
      {/* Background chrome layer — see SignalCard for shape. */}
      <div className="card-bg" aria-hidden="true" />
      <header className="cc-head">
        <div className={`cc-head-id ${directionClass}`}>
          <div className="cc-ticker">{row.ticker}</div>
          {row.company_name && <div className="cc-name">{row.company_name}</div>}
        </div>
        <PositionTypePill type={row.position_type} />
      </header>
      {hasAccent && (
        <div className="cc-accent-row">
          <ChangeStatusBadge row={row} />
          <RankBadge rank={row.top5_rank} />
          <BestIdeaBadge rationale={row.rationale} />
          {extraAccent}
        </div>
      )}
      <LivePriceRow live={live} />
      <div className="cc-footer">
        <RrCrossoverBadge show={rrCrossover} />
      </div>
    </article>
  )
}

// --- Top 5 highlight section (horizontal scroll above the main grid) ---

// Thin shim: assembles a row from the hedgeye_call_top5 entry +
// today's position data, then renders PositionCard exactly like the
// main grid. `highlight={true}` adds the .call-card-highlight class
// for the fixed-width + scroll-snap sizing the strip needs — every
// other piece of chrome (header, badges, price block, conviction
// bar) is identical to the in-grid card.
function Top5HighlightCard({ entry, positionByTicker, live, rrCrossover, onOpen }) {
  const position = positionByTicker.get(entry.ticker)
  const row = position
    ? { ...position, top5_rank: entry.rank }
    : {
        ticker: entry.ticker,
        company_name: entry.company_name,
        position_type: 'NEUTRAL',
        rationale: entry.rationale,
        top5_rank: entry.rank,
        conviction_score: 0,
      }
  return (
    <PositionCard
      row={row}
      live={live}
      rrCrossover={rrCrossover}
      onOpen={onOpen}
      highlight={true}
    />
  )
}

// Collapsible TOP 5 MOST ACTIONABLE section. Empty top5 → quiet message
// (instead of an empty section). Open by default.
function Top5Section({ top5, positionByTicker, livePrices, rrTickers, onOpen }) {
  const [open, setOpen] = useState(true)
  const isEmpty = top5.length === 0

  return (
    <section className="call-section call-section-top5">
      <button
        type="button"
        className="call-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`caret${open ? ' open' : ''}`} aria-hidden="true">▸</span>
        <span className="call-section-title">TOP 5 MOST ACTIONABLE</span>
      </button>
      {open && (
        isEmpty ? (
          <div className="call-section-empty">No formal Top 5 named today</div>
        ) : (
          <div className="top5-scroll" role="list">
            {top5.map((entry) => (
              <Top5HighlightCard
                key={`${entry.rank}-${entry.ticker}`}
                entry={entry}
                positionByTicker={positionByTicker}
                live={livePrices?.get(entry.ticker)}
                rrCrossover={rrTickers?.has(entry.ticker)}
                onOpen={onOpen}
              />
            ))}
          </div>
        )
      )}
    </section>
  )
}

// === Weekly Top 5 rollup =================================================
//
// A second strip rendered directly under the daily Top 5. Surfaces every
// unique ticker that appeared in any day's Top 5 over the trailing 5
// trading days (see useWeeklyTop5). Tickers picked on multiple days bubble
// to the front with a "×N THIS WEEK" badge; single-day picks follow in
// most-recent-first order.

function WeeklyAppearanceBadge({ appearances }) {
  if (appearances < 2) return null
  return <span className="status-badge status-weekly">×{appearances} THIS WEEK</span>
}

function WeeklyTop5HighlightCard({ entry, positionByTicker, live, rrCrossover, onOpen }) {
  // Reuse the live position record when available (same trick the daily
  // Top5HighlightCard uses) so direction pill + change_status badges
  // reflect today's state. Fall back to a synthetic row when the ticker
  // isn't in today's positions.
  const position = positionByTicker.get(entry.ticker)
  const row = position
    ? { ...position }
    : {
        ticker: entry.ticker,
        company_name: entry.company_name,
        position_type: 'NEUTRAL',
        rationale: entry.mostRecentRationale,
        conviction_score: 0,
      }
  return (
    <PositionCard
      row={row}
      live={live}
      rrCrossover={rrCrossover}
      onOpen={onOpen}
      highlight={true}
      extraAccent={<WeeklyAppearanceBadge appearances={entry.appearances} />}
    />
  )
}

// Collapsible TOP 5 — THIS WEEK section. Same chrome as the daily strip,
// open by default. Empty state lands when no Top 5 has been named in the
// trailing 5 trading days (rare — usually only on fresh deploys).
function WeeklyTop5Section({ entries, positionByTicker, livePrices, rrTickers, onOpen }) {
  const [open, setOpen] = useState(true)
  const isEmpty = entries.length === 0

  return (
    <section className="call-section call-section-top5 call-section-weekly-top5">
      <button
        type="button"
        className="call-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`caret${open ? ' open' : ''}`} aria-hidden="true">▸</span>
        <span className="call-section-title">TOP 5 MOST ACTIONABLE — THIS WEEK</span>
        {entries.length > 0 && (
          <span className="call-section-count">{entries.length}</span>
        )}
      </button>
      {open && (
        isEmpty ? (
          <div className="call-section-empty">No Top 5 picks named yet this week</div>
        ) : (
          <div className="top5-scroll" role="list">
            {entries.map((entry) => (
              <WeeklyTop5HighlightCard
                key={entry.ticker}
                entry={entry}
                positionByTicker={positionByTicker}
                live={livePrices?.get(entry.ticker)}
                rrCrossover={rrTickers?.has(entry.ticker)}
                onOpen={onOpen}
              />
            ))}
          </div>
        )
      )}
    </section>
  )
}

// Collapsible MACRO COMMENTARY section. Collapsed by default per spec.
// Bullets >6 are hidden behind "Show more". Empty commentary → render nothing.
function MacroCommentarySection({ commentary }) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const bullets = useMemo(() => parseMacroBullets(commentary), [commentary])

  if (bullets.length === 0) return null

  const visible = showAll ? bullets : bullets.slice(0, MACRO_BULLETS_VISIBLE)
  const hidden = bullets.length - visible.length

  return (
    <section className="call-section">
      <button
        type="button"
        className="call-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`caret${open ? ' open' : ''}`} aria-hidden="true">▸</span>
        <span className="call-section-title">MACRO COMMENTARY</span>
      </button>
      {open && (
        <div className="macro-body">
          <ul className="macro-list">
            {visible.map((b, i) => (
              <li key={i} className="macro-bullet">{b}</li>
            ))}
          </ul>
          {hidden > 0 && (
            <button
              type="button"
              className="macro-more"
              onClick={() => setShowAll(true)}
            >
              Show more ({hidden} more)
            </button>
          )}
        </div>
      )}
    </section>
  )
}

// --- panel ---

export function TheCallPanel({ allTickers, allTickersByTicker, onOpenModal }) {
  const { rows, signalDate, isToday, status } = useCallPositions()
  const { top5, macroCommentary } = useCallExtras(signalDate)
  const { weeklyTop5 } = useWeeklyTop5()
  const market = useMarketState()
  const livePrices = useLivePrices(market.isOpen)
  const [filter, setFilter] = useState('ALL')
  const [sectorFilter, setSectorFilter] = useState(loadInitialCallSector)
  const [search, setSearch] = useState('')
  const [callView, setCallView] = useState(loadInitialCallView)
  const [sortField, setSortField] = useState(loadInitialCallSortField)
  const [sortDir, setSortDir] = useState(loadInitialCallSortDir)

  const handleSortChange = (nextField, nextDir) => {
    setSortField(nextField)
    setSortDir(nextDir)
  }

  // Per-ticker visibility for the Call panel — Set<string> mirroring the
  // RR ticker filter shape. null while waiting for the first reconcile
  // against the all-tickers universe so the initial render is unfiltered
  // rather than empty.
  const [selectedCallTickers, setSelectedCallTickers] = useState(null)
  const callTickersPersistedRef = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(CALL_VIEW_KEY, callView)
    } catch (err) {
      console.warn('Failed to persist callView to localStorage:', err)
    }
  }, [callView])

  useEffect(() => {
    try {
      localStorage.setItem(CALL_SECTOR_KEY, JSON.stringify(Array.from(sectorFilter)))
    } catch (err) {
      console.warn('Failed to persist callSector to localStorage:', err)
    }
  }, [sectorFilter])

  useEffect(() => {
    try {
      localStorage.setItem(CALL_SORT_FIELD_KEY, sortField)
      localStorage.setItem(CALL_SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist callSort to localStorage:', err)
    }
  }, [sortField, sortDir])

  // Reconcile selectedCallTickers against the all-tickers universe. The
  // universe IS the All Time set (~470 tickers); the Today subset is just
  // a view-time filter applied below. Storing the canonical universe in
  // `known` keeps the reconcile stable across TODAY ↔ ALL TIME toggles.
  useEffect(() => {
    if (allTickers.length === 0) return
    const universe = allTickers.map((r) => r.ticker)
    let stored = null
    try {
      const raw = localStorage.getItem(CALL_TICKERS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.selected) && Array.isArray(parsed.known)) {
          const onlyStrings = (arr) => arr.filter((t) => typeof t === 'string')
          stored = {
            selected: new Set(onlyStrings(parsed.selected)),
            known: new Set(onlyStrings(parsed.known)),
          }
        }
      }
    } catch (err) {
      console.warn('Failed to read selectedCallTickers from localStorage:', err)
    }

    let next
    if (stored) {
      next = new Set()
      for (const t of universe) {
        if (stored.known.has(t)) {
          if (stored.selected.has(t)) next.add(t)
        } else {
          // New ticker — default to selected.
          next.add(t)
        }
      }
    } else {
      next = new Set(universe)
    }
    setSelectedCallTickers(next)
  }, [allTickers])

  useEffect(() => {
    if (selectedCallTickers === null || allTickers.length === 0) return
    if (callTickersPersistedRef.current === selectedCallTickers) return
    try {
      const payload = {
        selected: Array.from(selectedCallTickers),
        known: allTickers.map((r) => r.ticker),
      }
      localStorage.setItem(CALL_TICKERS_KEY, JSON.stringify(payload))
      callTickersPersistedRef.current = selectedCallTickers
    } catch (err) {
      console.warn('Failed to persist selectedCallTickers to localStorage:', err)
    }
  }, [selectedCallTickers, allTickers])

  // Modal opener now provided by App — both panels share one modal at the
  // root. Keep the same function shape so the existing card callsites just
  // forward the position-like object.
  const openModal = onOpenModal

  // ticker → position row lookup, used by the Top 5 highlight cards so the
  // direction pill / modal header can read the full position record even
  // though hedgeye_call_top5 only carries rank+rationale.
  const positionByTicker = useMemo(() => {
    const m = new Map()
    for (const r of rows) m.set(r.ticker, r)
    return m
  }, [rows])

  // Tickers that appear in the Risk Ranges view — used to render the
  // "↗ In Risk Ranges" crossover breadcrumb. One-shot fetch on mount; the
  // RR universe is daily and stable enough that polling isn't worth it.
  const [rrTickers, setRrTickers] = useState(() => new Set())
  useEffect(() => {
    let cancelled = false
    supabase
      .from('hedgeye_signals_v')
      .select('ticker')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('TheCallPanel: rr-tickers fetch failed:', error)
          return
        }
        if (data) setRrTickers(new Set(data.map((r) => r.ticker)))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Pull a representative call_received_at_et off any row (all rows share
  // it for a given signal_date).
  const callReceivedEt = useMemo(() => {
    const sample = rows.find((r) => r.call_received_at_et)
    return formatCallReceivedEt(sample?.call_received_at_et)
  }, [rows])

  // Filter pipeline split in two stages.
  //
  // Stage 1 — `chipBaseRows`: rows after position + search + ticker-filter
  // but BEFORE sector filter. These drive the sector chip counts so the
  // counts reflect "what's visible if you switch to this sector".
  //
  // Stage 2 — `visibleCards`: chipBaseRows after sector filter applied,
  // sorted tier-then-conviction. Tier order: FLIPPED → RETURNING → new
  // ADDED → UNCHANGED. Conviction DESC breaks ties.
  const chipBaseRows = useMemo(() => {
    let list = rows
    if (filter !== 'ALL') {
      list = list.filter((r) => r.position_type === filter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const t = (r.ticker ?? '').toLowerCase()
        const c = (r.company_name ?? '').toLowerCase()
        return t.includes(q) || c.includes(q)
      })
    }
    if (selectedCallTickers !== null) {
      list = list.filter((r) => selectedCallTickers.has(r.ticker))
    }
    return list
  }, [rows, filter, search, selectedCallTickers])

  const visibleCards = useMemo(() => {
    let list = chipBaseRows
    if (sectorFilter.size > 0) {
      // OR semantics: row passes if its sector is in any active chip.
      list = list.filter((r) =>
        sectorFilter.has(normalizeSectorKey(allTickersByTicker?.get(r.ticker)?.sector))
      )
    }
    // Stable tier sort: FLIPPED → RETURNING → new ADDED → UNCHANGED, then
    // conviction DESC within tier.
    return [...list].sort((a, b) => {
      const ta = changeTier(a)
      const tb = changeTier(b)
      if (ta !== tb) return ta - tb
      return (Number(b.conviction_score) || 0) - (Number(a.conviction_score) || 0)
    })
  }, [chipBaseRows, sectorFilter, allTickersByTicker])

  // Sector chip data: dedup by normalized (trimmed-lowercase) key so
  // "Restaurants" and "restaurants " collapse to one chip. The first
  // canonical-cased name seen for that key becomes the chip label.
  // Sorted alphabetically by display name with Other pinned last.
  const sectorChipData = useMemo(() => {
    const counts = new Map() // normalized key → count
    const displayBy = new Map() // normalized key → first-seen canonical name
    for (const r of chipBaseRows) {
      const canon = canonicalSector(allTickersByTicker?.get(r.ticker)?.sector)
      const key = canon.toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (!displayBy.has(key)) displayBy.set(key, canon)
    }
    const keys = [...counts.keys()].sort((a, b) => {
      const da = displayBy.get(a)
      const db = displayBy.get(b)
      if (da === OTHER_SECTOR) return 1
      if (db === OTHER_SECTOR) return -1
      return da.localeCompare(db)
    })
    return keys.map((k) => ({ key: k, display: displayBy.get(k), count: counts.get(k) }))
  }, [chipBaseRows, allTickersByTicker])

  // Toggle a sector chip in/out of the active filter set. Clicking ALL
  // clears. Stable identity via useCallback so child handlers don't churn.
  const toggleSectorChip = useCallback((key) => {
    setSectorFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const clearSectorChips = useCallback(() => setSectorFilter(new Set()), [])

  // Re-sort the filtered set by the dropdown. The tier/conviction order in
  // visibleCards becomes a stable secondary order for ties (Array.sort is
  // stable). Ticker is the final tiebreaker.
  const sortedCards = useMemo(() => {
    const list = visibleCards.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)

    list.sort((a, b) => {
      let cmp
      switch (sortField) {
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          return sortDir === 'asc' ? cmp : -cmp
        case 'position': {
          const ra = POSITION_RANK[a.position_type] ?? -1
          const rb = POSITION_RANK[b.position_type] ?? -1
          cmp = sortDir === 'asc' ? ra - rb : rb - ra
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'sector': {
          const sa = (allTickersByTicker?.get(a.ticker)?.sector ?? '').toLowerCase()
          const sb = (allTickersByTicker?.get(b.ticker)?.sector ?? '').toLowerCase()
          // Empty/missing sectors sink in asc and rise in desc — treat as nulls.
          if (!sa && !sb) return tieBreak(a, b)
          if (!sa) return 1
          if (!sb) return -1
          cmp = sa.localeCompare(sb)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'setup': {
          // Lower changeTier = more notable (FLIPPED=0, RETURNING=1,
          // ADDED=2, UNCHANGED=3). Desc = "most notable first" which is
          // ascending tier; asc reverses to "unchanged first".
          const ta = changeTier(a)
          const tb = changeTier(b)
          cmp = sortDir === 'desc' ? ta - tb : tb - ta
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'days_held': {
          const da = Number(a.consecutive_days)
          const db = Number(b.consecutive_days)
          cmp = numCmpNullsLast(da, db, sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        default:
          return tieBreak(a, b)
      }
    })
    return list
  }, [visibleCards, sortField, sortDir, allTickersByTicker])

  const visibleCount = sortedCards.length

  // Counts per position type for the chip badges.
  const counts = useMemo(() => {
    const c = { ALL: rows.length, LONG: 0, SHORT: 0, NEUTRAL: 0 }
    for (const r of rows) {
      if (r.position_type in c) c[r.position_type] += 1
    }
    return c
  }, [rows])

  // Universe for the Today-view TickerFilter dropdown: today's positions
  // mapped into the {ticker, company_name, sector} shape buildCallTickerGroups
  // expects. Sector is joined from call_all_tickers_v.
  const callTickerUniverse = useMemo(
    () =>
      rows.map((r) => ({
        ticker: r.ticker,
        company_name: r.company_name,
        sector: allTickersByTicker?.get(r.ticker)?.sector ?? null,
      })),
    [rows, allTickersByTicker]
  )

  if (status === 'loading') {
    return (
      <div className="panel">
        <div className="state">Loading call data…</div>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="panel">
        <div className="state error">Could not load call data.</div>
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="panel">
        <div className="state state-center">No call data available.</div>
      </div>
    )
  }

  return (
    <div className={`panel call-panel${isToday ? '' : ' panel-dim'}`}>
      <header className="call-header">
        <div className="call-header-left">
          <h1 className="call-title">THE CALL</h1>
          <p className="call-subtitle">HEDGEYE DAILY POSITIONS</p>
        </div>
        <div className="call-header-right">
          <div className="status-row">
            {signalDate && (
              <StatusChip label="Signal date" value={formatSignalDate(signalDate)} />
            )}
            {callReceivedEt && (
              <StatusChip
                label="Call data"
                value={callReceivedEt}
                tone={isToday ? 'live' : 'stale'}
              />
            )}
          </div>
        </div>
      </header>

      <nav className="call-view-toggle" role="tablist" aria-label="Call view">
        <button
          type="button"
          role="tab"
          aria-selected={callView === 'today'}
          className={`call-view-pill${callView === 'today' ? ' active' : ''}`}
          onClick={() => setCallView('today')}
        >
          TODAY
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={callView === 'all_time'}
          className={`call-view-pill${callView === 'all_time' ? ' active' : ''}`}
          onClick={() => setCallView('all_time')}
        >
          ALL TIME
        </button>
      </nav>

      {callView === 'all_time' ? (
        <CallAllTimeView
          allTickers={allTickers}
          allTickersByTicker={allTickersByTicker}
          onOpen={openModal}
          search={search}
          setSearch={setSearch}
          positionFilter={filter}
          setPositionFilter={setFilter}
          sectorFilter={sectorFilter}
          setSectorFilter={setSectorFilter}
          signalDate={signalDate}
          counts={counts}
          selectedCallTickers={selectedCallTickers}
          setSelectedCallTickers={setSelectedCallTickers}
        />
      ) : (
      <>
      {!isToday && (
        <div className="call-stale-banner">
          Today's call hasn't arrived yet. Last call: {formatSignalDate(signalDate)}
        </div>
      )}

      {/* Filter row 1: position chips (left), search (right-of-center),
          TickerFilter dropdown (top-right). Mirrors RR's .filter-row. */}
      <div className="call-filter-row">
        <nav className="call-filters" role="tablist" aria-label="Position type filter">
          {POSITION_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`filter-chip filter-chip-${f.id.toLowerCase()}${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="filter-chip-count">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="search-wrap call-search-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Search ticker or company..."
            aria-label="Search ticker or company name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setSearch('')
                e.currentTarget.blur()
              }
            }}
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <TickerFilter
          allTickers={callTickerUniverse}
          selectedTickers={selectedCallTickers}
          setSelectedTickers={setSelectedCallTickers}
          buildGroups={buildCallTickerGroups}
        />
      </div>

      {/* Filter row 2: sector chip row, RR-style. Multi-select — clicking
          a sector toggles it in/out of the active set; positions match
          via OR (sector ∈ active set). ALL is active when the set is
          empty and clicking it clears. Labels show full sector text
          (no abbreviation); the row wraps. */}
      <nav className="chips call-sector-chips" aria-label="Sector filter">
        <button
          type="button"
          aria-pressed={sectorFilter.size === 0}
          className={`chip${sectorFilter.size === 0 ? ' active' : ''}`}
          onClick={clearSectorChips}
        >
          ALL SECTORS
          <span className="chip-count">{chipBaseRows.length}</span>
        </button>
        {sectorChipData.map(({ key, display, count }) => {
          const active = sectorFilter.has(key)
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              className={`chip${active ? ' active' : ''}`}
              onClick={() => toggleSectorChip(key)}
            >
              {display}
              <span className="chip-count">{count}</span>
            </button>
          )
        })}
      </nav>

      <Top5Section
        top5={top5}
        positionByTicker={positionByTicker}
        livePrices={livePrices}
        rrTickers={rrTickers}
        onOpen={openModal}
      />
      <WeeklyTop5Section
        entries={weeklyTop5}
        positionByTicker={positionByTicker}
        livePrices={livePrices}
        rrTickers={rrTickers}
        onOpen={openModal}
      />
      <MacroCommentarySection commentary={macroCommentary} />

      {/* Sort row sits between the chip rows and the cards grid. Right-
          aligned to match RR. */}
      <div className="sort-row">
        <SortControl
          fields={CALL_SORT_FIELDS}
          field={sortField}
          dir={sortDir}
          onChange={handleSortChange}
          ariaLabel="The Call sort"
        />
      </div>

      {visibleCount === 0 ? (
        <div className="state">
          No positions match these filters{search.trim() ? ` for "${search.trim()}"` : ''}.
        </div>
      ) : (
        <div className="call-grid">
          {sortedCards.map((row) => {
            const live = livePrices.get(row.ticker)
            const rrCrossover = rrTickers.has(row.ticker)
            return (
              <PositionCard
                key={row.ticker}
                row={row}
                live={live}
                rrCrossover={rrCrossover}
                onOpen={openModal}
              />
            )
          })}
        </div>
      )}

      <PerformanceSection positionRows={rows} />
      </>
      )}
    </div>
  )
}
