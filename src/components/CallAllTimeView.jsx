import { useMemo, useState } from 'react'
import { canonicalSector, abbreviateSector, OTHER_SECTOR } from '../lib/sectors'

const POSITION_FILTERS = [
  { id: 'ALL', label: 'ALL' },
  { id: 'LONG', label: 'LONG' },
  { id: 'SHORT', label: 'SHORT' },
  { id: 'NEUTRAL', label: 'NEUTRAL' },
]

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
 * All Time view: 469-row sector-grouped grid of every ticker that has
 * appeared in Hedgeye's call. Filters: position chips + sector chips +
 * search. Header shows total ticker + trading-day counts.
 */
export function CallAllTimeView({ allTickers, onOpen }) {
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [sectorFilter, setSectorFilter] = useState('ALL')
  const [search, setSearch] = useState('')

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

  // Distinct sectors in canonical form, sorted alphabetically with the
  // Other catch-all pinned at the end.
  const sectorChips = useMemo(() => {
    const set = new Set()
    for (const r of allTickers) set.add(canonicalSector(r.sector))
    const list = [...set].sort((a, b) => {
      if (a === OTHER_SECTOR) return 1
      if (b === OTHER_SECTOR) return -1
      return a.localeCompare(b)
    })
    return list
  }, [allTickers])

  // Highest total_appearances drives the relative-frequency bar width.
  const maxAppearances = useMemo(
    () => allTickers.reduce((m, r) => Math.max(m, Number(r.total_appearances) || 0), 0),
    [allTickers]
  )

  // Apply filters → group by sector → sort within each group by
  // total_appearances DESC.
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = allTickers.filter((r) => {
      if (positionFilter !== 'ALL' && r.last_position_type !== positionFilter) return false
      const sector = canonicalSector(r.sector)
      if (sectorFilter !== 'ALL' && sector !== sectorFilter) return false
      if (q) {
        const ticker = (r.ticker ?? '').toLowerCase()
        const company = (r.company_name ?? '').toLowerCase()
        if (!ticker.includes(q) && !company.includes(q)) return false
      }
      return true
    })

    const byCat = new Map()
    for (const r of filtered) {
      const sector = canonicalSector(r.sector)
      if (!byCat.has(sector)) byCat.set(sector, [])
      byCat.get(sector).push(r)
    }
    for (const arr of byCat.values()) {
      arr.sort((a, b) => (Number(b.total_appearances) || 0) - (Number(a.total_appearances) || 0))
    }

    const sectors = [...byCat.keys()].sort((a, b) => {
      if (a === OTHER_SECTOR) return 1
      if (b === OTHER_SECTOR) return -1
      return a.localeCompare(b)
    })
    return sectors.map((s) => ({ sector: s, rows: byCat.get(s) }))
  }, [allTickers, positionFilter, sectorFilter, search])

  const totalVisible = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.rows.length, 0),
    [visibleGroups]
  )

  return (
    <div className="all-time-view">
      <div className="all-time-stats">
        {stats.tickers} tickers · {stats.tradingDays} trading days
      </div>

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
          </button>
        ))}
      </nav>

      <nav className="sector-chips" aria-label="Sector filter">
        <button
          type="button"
          aria-pressed={sectorFilter === 'ALL'}
          className={`sector-chip${sectorFilter === 'ALL' ? ' active' : ''}`}
          onClick={() => setSectorFilter('ALL')}
        >
          ALL SECTORS
        </button>
        {sectorChips.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sectorFilter === s}
            className={`sector-chip${sectorFilter === s ? ' active' : ''}`}
            onClick={() => setSectorFilter(s)}
            title={s}
          >
            {abbreviateSector(s)}
          </button>
        ))}
      </nav>

      <div className="all-time-search">
        <input
          type="search"
          className="search-input"
          placeholder="Search ticker or name..."
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
      </div>

      {totalVisible === 0 ? (
        <div className="state">No tickers match these filters.</div>
      ) : (
        visibleGroups.map((g) => (
          <section key={g.sector} className="all-time-sector-group">
            <div className="sector-group-header">{g.sector}</div>
            <div className="all-time-grid">
              {g.rows.map((r) => (
                <AllTimeCard
                  key={r.ticker}
                  row={r}
                  maxAppearances={maxAppearances}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
