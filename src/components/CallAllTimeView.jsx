import { useMemo } from 'react'
import {
  canonicalSector,
  abbreviateSector,
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
      <div className="atc-row-id">
        <span className="atc-ticker">{row.ticker}</span>
        <span className="atc-company">{row.company_name ?? ''}</span>
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
      if (
        positionFilter !== 'ALL' &&
        positionFilter !== 'RETURNING' &&
        r.last_position_type !== positionFilter
      ) {
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
  // DESC. Flat — no sector grouping in the rendered grid.
  const visibleCards = useMemo(() => {
    let list = chipBaseRows
    if (sectorFilter !== 'ALL') {
      list = list.filter((r) => canonicalSector(r.sector) === sectorFilter)
    }
    return [...list].sort(
      (a, b) => (Number(b.total_appearances) || 0) - (Number(a.total_appearances) || 0)
    )
  }, [chipBaseRows, sectorFilter])

  // Sector chip data: one chip per sector with ≥1 row in chipBaseRows.
  const sectorChipData = useMemo(() => {
    const counts = new Map()
    for (const r of chipBaseRows) {
      const sector = canonicalSector(r.sector)
      counts.set(sector, (counts.get(sector) ?? 0) + 1)
    }
    const sectors = [...counts.keys()].sort((a, b) => {
      if (a === OTHER_SECTOR) return 1
      if (b === OTHER_SECTOR) return -1
      return a.localeCompare(b)
    })
    return sectors.map((s) => ({ sector: s, count: counts.get(s) }))
  }, [chipBaseRows])

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
              className={`call-chip call-chip-${p.id.toLowerCase()}${positionFilter === p.id ? ' active' : ''}`}
              onClick={() => setPositionFilter(p.id)}
            >
              {p.label}
              <span className="call-chip-count">{positionCounts[p.id] ?? 0}</span>
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

      {/* Filter row 2: sector chip row, RR-style. Replaces the old
          sticky sector group headers. */}
      <nav className="chips call-sector-chips" aria-label="Sector filter">
        <button
          type="button"
          aria-pressed={sectorFilter === 'ALL'}
          className={`chip${sectorFilter === 'ALL' ? ' active' : ''}`}
          onClick={() => setSectorFilter('ALL')}
        >
          All
          <span className="chip-count">{chipBaseRows.length}</span>
        </button>
        {sectorChipData.map(({ sector, count }) => (
          <button
            key={sector}
            type="button"
            aria-pressed={sectorFilter === sector}
            className={`chip${sectorFilter === sector ? ' active' : ''}`}
            onClick={() => setSectorFilter(sectorFilter === sector ? 'ALL' : sector)}
            title={sector}
          >
            {abbreviateSector(sector)}
            <span className="chip-count">{count}</span>
          </button>
        ))}
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
