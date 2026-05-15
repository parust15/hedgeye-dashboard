import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCallPositions } from '../lib/useCallPositions'
import { useCallExtras } from '../lib/useCallExtras'
import { useLivePrices } from '../lib/livePrices'
import { useMarketState } from '../lib/marketState'
import { formatPrice, formatNumber } from '../lib/format'
import { parseMacroBullets } from '../lib/macroBullets'
import { PerformanceSection } from './PerformanceSection'
import { CallAllTimeView } from './CallAllTimeView'
import { TickerFilter } from './TickerFilter'
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
const VALID_CALL_VIEWS = ['today', 'all_time']

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
  { id: 'ALL', label: 'ALL' },
  { id: 'LONG', label: 'LONG' },
  { id: 'SHORT', label: 'SHORT' },
  { id: 'NEUTRAL', label: 'NEUTRAL' },
]

const MAX_CONVICTION = 75

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

function RankBadge({ rank }) {
  if (rank == null) return null
  return <span className="rank-badge">#{rank} MOST ACTIONABLE</span>
}

function LivePriceRow({ live }) {
  if (!live || !Number.isFinite(Number(live.current_price))) {
    return <div className="cc-price cc-price-none">—</div>
  }
  const price = Number(live.current_price)
  const change = Number(live.change_amount)
  const pct = Number(live.change_pct)
  const cls = changeClass(change)
  return (
    <div className="cc-price-row">
      <span className="cc-price">{formatPrice(price)}</span>
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
  )
}

function ConvictionBar({ score, rrCrossover }) {
  const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0
  const pct = Math.max(0, Math.min(1, safeScore / MAX_CONVICTION)) * 100
  return (
    <div className="conviction-row">
      <div className="conviction-bar" aria-label={`Conviction ${safeScore} of ${MAX_CONVICTION}`}>
        <div className="conviction-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conviction-score">{safeScore}</span>
      {rrCrossover && <span className="badge-rr-crossover">↗ In Risk Ranges</span>}
    </div>
  )
}

// Click-to-expand rationale block. Collapsed: clamped to N lines with a
// fade overflow; expanded: full text. stopPropagation keeps clicks here
// from also triggering the card-level "open modal" handler.
function Rationale({ text, maxLines = 4 }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const cls = open ? 'cc-rationale open' : `cc-rationale clamp-${maxLines}`
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((o) => !o)
      }}
      aria-expanded={open}
    >
      <span className="cc-rationale-text">{text}</span>
    </button>
  )
}

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

function Top5Card({ row, live, rrCrossover, onOpen }) {
  const cls = [
    'call-card',
    'call-card-top5',
    `border-${(row.position_type ?? 'neutral').toLowerCase()}`,
    row.change_status === 'ADDED' ? 'glow-added' : '',
    row.change_status === 'FLIPPED' ? 'glow-flipped' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const directionClass = `direction-${(row.position_type ?? 'neutral').toLowerCase()}`

  return (
    <article className={cls} {...cardActivationProps(row, onOpen)}>
      <div className="cc-badge-row">
        <PositionTypePill type={row.position_type} />
        <BestIdeaBadge rationale={row.rationale} />
        <RankBadge rank={row.top5_rank} />
      </div>
      <div className={`cc-company-row ${directionClass}`}>
        <span className="cc-company">{row.company_name ?? row.ticker}</span>
        <span className="cc-ticker">{row.ticker}</span>
      </div>
      <LivePriceRow live={live} />
      {row.rationale ? <Rationale text={row.rationale} /> : null}
      <div className="cc-footer">
        <ConvictionBar score={row.conviction_score} rrCrossover={rrCrossover} />
        {row.consecutive_days > 1 && (
          <span className="cc-streak">{row.consecutive_days} days</span>
        )}
      </div>
    </article>
  )
}

function PositionCard({ row, live, rrCrossover, onOpen }) {
  const cls = [
    'call-card',
    `border-${(row.position_type ?? 'neutral').toLowerCase()}`,
    row.change_status === 'ADDED' ? 'glow-added' : '',
    row.change_status === 'FLIPPED' ? 'glow-flipped' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const directionClass = `direction-${(row.position_type ?? 'neutral').toLowerCase()}`

  return (
    <article className={cls} {...cardActivationProps(row, onOpen)}>
      <div className="cc-badge-row">
        <PositionTypePill type={row.position_type} />
        <BestIdeaBadge rationale={row.rationale} />
        <ChangeStatusBadge row={row} />
      </div>
      <div className={`cc-company-row ${directionClass}`}>
        <span className="cc-company">{row.company_name ?? row.ticker}</span>
        <span className="cc-ticker">{row.ticker}</span>
      </div>
      <LivePriceRow live={live} />
      <div className="cc-footer">
        <ConvictionBar score={row.conviction_score} rrCrossover={rrCrossover} />
        {row.top5_appearances_90d >= 3 && (
          <span className="cc-streak">★ {row.top5_appearances_90d} appearances 90d</span>
        )}
      </div>
    </article>
  )
}

// --- Top 5 highlight section (horizontal scroll above the main grid) ---

// One Top 5 "highlight" card. Differs from Top5Card above in that it's
// driven by the hedgeye_call_top5 table (rank + rationale only) — the
// position_type for the direction pill comes from the positions data via
// `positionByTicker` lookup.
function Top5HighlightCard({ entry, positionByTicker, onOpen }) {
  const position = positionByTicker.get(entry.ticker)
  const positionType = position?.position_type ?? 'NEUTRAL'

  function handleOpen() {
    // Prefer the full position record (richer header for the modal) but
    // fall back to a synthetic record if the ticker isn't in today's
    // positions for any reason.
    onOpen?.(position ?? {
      ticker: entry.ticker,
      company_name: entry.company_name,
      position_type: positionType,
      rationale: entry.rationale,
      signal_date: position?.signal_date ?? null,
      conviction_score: position?.conviction_score ?? 0,
    })
  }

  return (
    <article
      className={`call-card call-card-highlight border-${positionType.toLowerCase()}`}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleOpen()
        }
      }}
    >
      <div className="top5-head-row">
        <span className="top5-rank-circle">#{entry.rank}</span>
        <PositionTypePill type={positionType} />
        <BestIdeaBadge rationale={entry.rationale} />
      </div>
      <div className="cc-company-row">
        <span className="cc-company">{entry.company_name ?? entry.ticker}</span>
        <span className="cc-ticker">{entry.ticker}</span>
      </div>
      {entry.rationale ? <Rationale text={entry.rationale} maxLines={5} /> : null}
    </article>
  )
}

// Collapsible TOP 5 MOST ACTIONABLE section. Empty top5 → quiet message
// (instead of an empty section). Open by default.
function Top5Section({ top5, positionByTicker, onOpen }) {
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
  const market = useMarketState()
  const livePrices = useLivePrices(market.isOpen)
  const [filter, setFilter] = useState('ALL')
  const [sectorFilter, setSectorFilter] = useState(loadInitialCallSector)
  const [search, setSearch] = useState('')
  const [callView, setCallView] = useState(loadInitialCallView)

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

  const visibleCount = visibleCards.length

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
          {callReceivedEt && (
            <div className="call-meta">Call data as of {callReceivedEt}</div>
          )}
          <div className="call-date">{formatSignalDate(signalDate)}</div>
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
              className={`call-chip call-chip-${f.id.toLowerCase()}${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="call-chip-count">{counts[f.id] ?? 0}</span>
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

      <Top5Section top5={top5} positionByTicker={positionByTicker} onOpen={openModal} />
      <MacroCommentarySection commentary={macroCommentary} />

      {visibleCount === 0 ? (
        <div className="state">
          No positions match these filters{search.trim() ? ` for "${search.trim()}"` : ''}.
        </div>
      ) : (
        <div className="call-grid">
          {visibleCards.map((row) => {
            const live = livePrices.get(row.ticker)
            const rrCrossover = rrTickers.has(row.ticker)
            return row.top5_rank != null ? (
              <Top5Card
                key={row.ticker}
                row={row}
                live={live}
                rrCrossover={rrCrossover}
                onOpen={openModal}
              />
            ) : (
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
