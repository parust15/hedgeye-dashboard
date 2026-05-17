import { useMemo } from 'react'
import {
  canonicalSector,
  normalizeSectorKey,
  buildCallTickerGroups,
  OTHER_SECTOR,
} from '../lib/sectors'
import { TickerFilter } from './TickerFilter'

// "May 14" from YYYY-MM-DD.
function formatLastSeen(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// Approximate "trading days" between two YYYY-MM-DD dates by counting
// weekdays. Good enough for the header counter — doesn't account for
// market holidays, which is fine at this resolution.
function weekdaysBetween(startIso, endIso) {
  if (!startIso || !endIso) return 0
  const [sy, sm, sd] = startIso.split('-').map(Number)
  const [ey, em, ed] = endIso.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const dayMs = 24 * 60 * 60 * 1000
  let count = 0
  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    const dow = new Date(t).getDay()
    if (dow !== 0 && dow !== 6) count += 1
  }
  return count
}

function PositionTypePill({ type }) {
  const t = (type ?? 'NEUTRAL').toLowerCase()
  return <span className={`position-pill position-${t}`}>{type ?? 'NEUTRAL'}</span>
}

function AllTimeCard({ row, maxAppearances, onOpen }) {
  const type = (row.last_position_type ?? 'NEUTRAL').toLowerCase()
  const total = Number(row.total_appearances) || 0
  const pct = maxAppearances > 0 ? Math.min(1, total / maxAppearances) * 100 : 0
  return (
    <article
      className={`all-time-card border-${type}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(row)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen?.(row)
        }
      }}
    >
      {/* Unified ticker-card head: same .cc-head-id / .cc-ticker /
          .cc-name classes RR and Call ticker boxes use. The .atc-*
          family was a third name for the same concept. */}
      <div className={`cc-head-id direction-${type}`}>
        <span className="cc-ticker">{row.ticker}</span>
        <span className="cc-name">{row.company_name ?? ''}</span>
      </div>
      <div className="atc-row-pill">
        <PositionTypePill type={row.last_position_type} />
        <span className="atc-last-seen">Last seen {formatLastSeen(row.last_seen_date)}</span>
        {row.in_today_positions && (
          <span className="atc-active">● Active today</span>
        )}
      </div>
      <div className="atc-row-counts">
        <span>{total} appearances</span>
        {row.top5_appearances > 0 && (
          <span className="atc-top5">Top5 ×{row.top5_appearances}</span>
        )}
      </div>
      <div className="atc-bar" aria-label={`${total} of ${maxAppearances} appearances`}>
        <div className="atc-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </article>
  )
}

/**
 * All Time view: flat grid of every ticker that has appeared in Hedgeye's
 * call. Cards are no longer grouped under sticky sector headers — sector
 * is now a chip filter (RR-style) sitting alongside the position chips
 * and search bar.
 *
 * Filter state (position / sector / search / selectedCallTickers) is
 * owned by TheCallPanel and passed in as props, so it persists across
 * the TODAY ↔ ALL TIME toggle.
 */
export function CallAllTimeView({
  allTickers,
  onOpen,
  search,
  setSearch,
  positionFilter,
  setPositionFilter,
  sectorFilter,
  setSectorFilter,
  selectedCallTickers,
  setSelectedCallTickers,
}) {
  const POSITION_FILTERS = [
    { id: 'ALL', label: 'ALL' },
    { id: 'LONG', label: 'LONG' },
    { id: 'SHORT', label: 'SHORT' },
    { id: 'NEUTRAL', label: 'NEUTRAL' },
  ]

  // Header counts. Trading-day approximation spans first_seen min →
  // last_seen max across the universe.
  const stats = useMemo(() => {
    if (allTickers.length === 0) return { tickers: 0, tradingDays: 0 }
    let minFirst = null
    let maxLast = null
    for (const r of allTickers) {
      if (r.first_seen_date && (!minFirst || r.first_seen_date < minFirst)) {
        minFirst = r.first_seen_date
      }
      if (r.last_seen_date && (!maxLast || r.last_seen_date > maxLast)) {
        maxLast = r.last_seen_date
      }
    }
    return {
      tickers: allTickers.length,
      tradingDays: weekdaysBetween(minFirst, maxLast),
    }
  }, [allTickers])

  // Highest total_appearances drives the relative-frequency bar width.
  const maxAppearances = useMemo(
    () => allTickers.reduce((m, r) => Math.max(m, Number(r.total_appearances) || 0), 0),
    [allTickers]
  )

  // Counts for the position chip badges. RETURNING is a Today-only signal
  // (depends on change_status which All Time doesn't carry) — treated as
  // ALL when triggered from this view's chip set, so it doesn't appear here.
  const positionCounts = useMemo(() => {
    const c = { ALL: allTickers.length, LONG: 0, SHORT: 0, NEUTRAL: 0 }
    for (const r of allTickers) {
      const p = r.last_position_type
      if (p in c) c[p] += 1
    }
    return c
  }, [allTickers])

  // Stage 1: rows after position + search + ticker filter (before sector
  // filter). Drives sector chip counts.
  const chipBaseRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTickers.filter((r) => {
      if (positionFilter !== 'ALL' && r.last_position_type !== positionFilter) {
        return false
      }
      if (q) {
        const ticker = (r.ticker ?? '').toLowerCase()
        const company = (r.company_name ?? '').toLowerCase()
        if (!ticker.includes(q) && !company.includes(q)) return false
      }
      if (selectedCallTickers !== null && !selectedCallTickers.has(r.ticker)) {
        return false
      }
      return true
    })
  }, [allTickers, positionFilter, search, selectedCallTickers])

  // Stage 2: chipBaseRows after sector filter, sorted by total_appearances
  // DESC. Flat — no sector grouping in the rendered grid. Sector filter
  // is a Set<normalizedKey> with OR semantics across active chips.
  const visibleCards = useMemo(() => {
    let list = chipBaseRows
    if (sectorFilter.size > 0) {
      list = list.filter((r) => sectorFilter.has(normalizeSectorKey(r.sector)))
    }
    return [...list].sort(
      (a, b) => (Number(b.total_appearances) || 0) - (Number(a.total_appearances) || 0)
    )
  }, [chipBaseRows, sectorFilter])

  // Sector chip data: dedup by lowercase-trimmed key so "Restaurants" and
  // "restaurants " collapse to one chip. First-seen canonical casing
  // becomes the chip label.
  const sectorChipData = useMemo(() => {
    const counts = new Map()
    const displayBy = new Map()
    for (const r of chipBaseRows) {
      const canon = canonicalSector(r.sector)
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
  }, [chipBaseRows])

  function toggleSectorChip(key) {
    setSectorFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="all-time-view">
      <div className="all-time-stats">
        {stats.tickers} tickers · {stats.tradingDays} trading days
      </div>

      {/* Filter row 1: position chips left, search center, TickerFilter
          dropdown right. Identical layout to Today + RR. */}
      <div className="call-filter-row">
        <nav className="call-filters" aria-label="Position type filter">
          {POSITION_FILTERS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={positionFilter === p.id}
              className={`filter-chip filter-chip-${p.id.toLowerCase()}${positionFilter === p.id ? ' active' : ''}`}
              onClick={() => setPositionFilter(p.id)}
            >
              {p.label}
              <span className="filter-chip-count">{positionCounts[p.id] ?? 0}</span>
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
          allTickers={allTickers}
          selectedTickers={selectedCallTickers}
          setSelectedTickers={setSelectedCallTickers}
          buildGroups={buildCallTickerGroups}
        />
      </div>

      {/* Filter row 2: sector chip row, RR-style. Multi-select with OR
          semantics — clicking a sector toggles it in/out of the active
          set; ALL clears. Full sector labels (no abbreviation), wraps. */}
      <nav className="chips call-sector-chips" aria-label="Sector filter">
        <button
          type="button"
          aria-pressed={sectorFilter.size === 0}
          className={`chip${sectorFilter.size === 0 ? ' active' : ''}`}
          onClick={() => setSectorFilter(new Set())}
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

      {visibleCards.length === 0 ? (
        <div className="state">No tickers match these filters.</div>
      ) : (
        <div className="all-time-grid">
          {visibleCards.map((r) => (
            <AllTimeCard
              key={r.ticker}
              row={r}
              maxAppearances={maxAppearances}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
}
