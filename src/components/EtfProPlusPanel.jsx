import { useEffect, useMemo, useState } from 'react'
import { useEtfProPlus } from '../lib/useEtfProPlus'
import { SignalCard } from './SignalCard'
import { SortControl } from './SortControl'
import { CategoryFilter } from './CategoryFilter'
import { StatusChip } from './StatusChip'

// --- localStorage keys (per CLAUDE.md: dashboard.<feature>) ----------------
const SEARCH_KEY = 'dashboard.etfSearch'
const DIRECTION_FILTER_KEY = 'dashboard.etfDirectionFilter'
const ASSET_CLASS_KEY = 'dashboard.etfAssetClasses'
const SORT_FIELD_KEY = 'dashboard.etfSortField'
const SORT_DIR_KEY = 'dashboard.etfSortDir'

const VALID_DIRECTIONS = ['ALL', 'BULLISH', 'BEARISH']

const DIRECTION_FILTERS = [
  { id: 'ALL', label: 'ALL DIRECTIONS' },
  { id: 'BULLISH', label: 'BULLISH' },
  { id: 'BEARISH', label: 'BEARISH' },
]

// --- Sort fields (mirrors RR's SortControl contract) ----------------------
const ETF_SORT_FIELDS = [
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'direction', label: 'Direction', defaultDir: 'desc' },
  { value: 'asset_class', label: 'Asset class', defaultDir: 'asc' },
  { value: 'price', label: 'Recent price', defaultDir: 'asc' },
  { value: 'range_width', label: 'Range width %', defaultDir: 'desc' },
  { value: 'dist_low', label: 'Distance to LRR', defaultDir: 'asc' },
  { value: 'dist_high', label: 'Distance to TRR', defaultDir: 'asc' },
  { value: 'date_added', label: 'Date added', defaultDir: 'desc' },
]
const ETF_SORT_VALUES = new Set(ETF_SORT_FIELDS.map((f) => f.value))

// BULLISH > BEARISH for the direction sort ranking.
const DIRECTION_RANK = { BULLISH: 1, BEARISH: 0 }

// --- localStorage loaders --------------------------------------------------

function loadInitialDirectionFilter() {
  try {
    const raw = localStorage.getItem(DIRECTION_FILTER_KEY)
    if (raw && VALID_DIRECTIONS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read etfDirectionFilter from localStorage:', err)
  }
  return 'ALL'
}

function loadInitialAssetClasses() {
  try {
    const raw = localStorage.getItem(ASSET_CLASS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((s) => typeof s === 'string'))
    }
  } catch (err) {
    console.warn('Failed to read etfAssetClasses from localStorage:', err)
  }
  return new Set()
}

function loadInitialSearch() {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? ''
  } catch {
    return ''
  }
}

function loadInitialSortField() {
  try {
    const raw = localStorage.getItem(SORT_FIELD_KEY)
    if (raw && ETF_SORT_VALUES.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read etfSortField from localStorage:', err)
  }
  return 'ticker'
}

function loadInitialSortDir() {
  try {
    const raw = localStorage.getItem(SORT_DIR_KEY)
    if (raw === 'asc' || raw === 'desc') return raw
  } catch (err) {
    console.warn('Failed to read etfSortDir from localStorage:', err)
  }
  return 'asc'
}

// --- Row transformation ---------------------------------------------------
//
// SignalCard was built for hedgeye_signals_v rows. ETF rows have a
// different but analogous shape, so we map the fields once at the panel
// boundary instead of branching SignalCard internals. The mapping:
//
//   buy_trade   ← trend_range_low   (LRR — the "buy" end of the range)
//   sell_trade  ← trend_range_high  (TRR — the "sell" end of the range)
//   prev_close  ← recent_price      (so the position bar places the
//                                    snapshot price between LRR and TRR
//                                    via rangePct's existing math)
//   display_name ← description       (e.g. "S&P 500 ETF")
//   trend        ← direction          (BULLISH | BEARISH)
//   category     ← asset_class        (chip filter dimension)
//   range_state  ← null               (no day-over-day HH/HL analog)
//
// Originals are preserved on the synthetic row via `_etf` so the sort
// derivations can read date_added / asset_class / direction without
// fishing them back out of the source.
function toSignalRow(etf) {
  return {
    ticker: etf.ticker,
    display_name: etf.description || null,
    name: etf.description || null,
    trend: etf.direction || null,
    buy_trade: etf.trend_range_low,
    sell_trade: etf.trend_range_high,
    prev_close: etf.recent_price,
    range_state: null,
    category: etf.asset_class || null,
    signal_date: etf.snapshot_date,
    _etf: etf,
  }
}

// Range width % — derived the same way as RR's `rangeWidthPct`. Guards
// against the Number(null) === 0 footgun called out in CLAUDE.md.
function rangeWidthPct(row) {
  const buy = row.buy_trade
  const sell = row.sell_trade
  const close = row.prev_close
  if (buy == null || sell == null || close == null) return null
  const b = Number(buy)
  const s = Number(sell)
  const c = Number(close)
  if (!Number.isFinite(b) || !Number.isFinite(s) || !Number.isFinite(c) || c === 0) {
    return null
  }
  return ((s - b) / c) * 100
}

// Position-in-range pct for distance-to-LRR / distance-to-TRR sorts.
function priceInRangePct(row) {
  const lrr = Number(row.buy_trade)
  const trr = Number(row.sell_trade)
  const px = Number(row.prev_close)
  if (!Number.isFinite(lrr) || !Number.isFinite(trr) || !Number.isFinite(px)) return null
  if (trr - lrr === 0) return null
  return (px - lrr) / (trr - lrr)
}

// Generic nulls-last numeric comparator (matches RR's `numCmp`).
function numCmp(a, b, dir) {
  const aNull = a == null || !Number.isFinite(a)
  const bNull = b == null || !Number.isFinite(b)
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1
  return dir === 'asc' ? a - b : b - a
}

// --- Panel ----------------------------------------------------------------

export function EtfProPlusPanel() {
  const { rows, snapshotDate, status } = useEtfProPlus()

  // --- filter / sort / expand state ---------------------------------------
  const [activeAssetClasses, setActiveAssetClasses] = useState(loadInitialAssetClasses)
  const [directionFilter, setDirectionFilter] = useState(loadInitialDirectionFilter)
  const [search, setSearch] = useState(loadInitialSearch)
  const [sortField, setSortField] = useState(loadInitialSortField)
  const [sortDir, setSortDir] = useState(loadInitialSortDir)
  const [expanded, setExpanded] = useState(null)

  // Persist each filter independently so the user's view sticks between
  // sessions, same pattern as the RR + Call panels.
  useEffect(() => {
    try {
      localStorage.setItem(DIRECTION_FILTER_KEY, directionFilter)
    } catch (err) {
      console.warn('Failed to persist etfDirectionFilter:', err)
    }
  }, [directionFilter])

  useEffect(() => {
    try {
      localStorage.setItem(ASSET_CLASS_KEY, JSON.stringify([...activeAssetClasses]))
    } catch (err) {
      console.warn('Failed to persist etfAssetClasses:', err)
    }
  }, [activeAssetClasses])

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_KEY, search)
    } catch (err) {
      console.warn('Failed to persist etfSearch:', err)
    }
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_FIELD_KEY, sortField)
      localStorage.setItem(SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist etfSort:', err)
    }
  }, [sortField, sortDir])

  // Reuse the panel-level expand pattern from RR — only one card open
  // at a time; clicking the same one again collapses.
  function toggleExpand(ticker) {
    setExpanded((cur) => (cur === ticker ? null : ticker))
  }

  const handleSortChange = (nextField, nextDir) => {
    setSortField(nextField)
    setSortDir(nextDir)
  }

  // --- Transform rows once at the panel boundary --------------------------
  const transformedRows = useMemo(() => rows.map(toSignalRow), [rows])

  // --- Asset-class chip data (mirrors RR's category chips) ----------------
  const assetClasses = useMemo(() => {
    const set = new Set()
    for (const r of transformedRows) {
      if (r.category) set.add(r.category)
    }
    return [...set].sort()
  }, [transformedRows])

  const assetClassCounts = useMemo(() => {
    const c = {}
    for (const ac of assetClasses) c[ac] = 0
    for (const r of transformedRows) {
      if (r.category && c[r.category] != null) c[r.category] += 1
    }
    return c
  }, [transformedRows, assetClasses])

  const visibleAssetClassOptions = useMemo(
    () => assetClasses.map((ac) => ({ label: ac, count: assetClassCounts[ac] ?? 0 })),
    [assetClasses, assetClassCounts]
  )

  // Drop any active asset-class label that no longer exists in the current
  // dataset — same defensive sweep RR does for category chips.
  useEffect(() => {
    setActiveAssetClasses((prev) => {
      const valid = new Set(assetClasses)
      let changed = false
      const next = new Set()
      for (const ac of prev) {
        if (valid.has(ac)) next.add(ac)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [assetClasses])

  // --- Filter pipeline (asset-class AND direction AND search) -------------
  const directionCounts = useMemo(() => {
    const c = { ALL: transformedRows.length, BULLISH: 0, BEARISH: 0 }
    for (const r of transformedRows) {
      if (r.trend in c) c[r.trend] += 1
    }
    return c
  }, [transformedRows])

  const filteredRows = useMemo(() => {
    let list = transformedRows
    if (activeAssetClasses.size > 0) {
      list = list.filter((r) => r.category && activeAssetClasses.has(r.category))
    }
    if (directionFilter !== 'ALL') {
      list = list.filter((r) => r.trend === directionFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const t = (r.ticker ?? '').toLowerCase()
        const d = (r.display_name ?? '').toLowerCase()
        return t.includes(q) || d.includes(q)
      })
    }
    return list
  }, [transformedRows, activeAssetClasses, directionFilter, search])

  // --- Sort on top of the filtered set ------------------------------------
  const sortedRows = useMemo(() => {
    const list = filteredRows.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)

    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          return sortDir === 'asc' ? cmp : -cmp
        case 'direction': {
          const ra = DIRECTION_RANK[a.trend] ?? -1
          const rb = DIRECTION_RANK[b.trend] ?? -1
          cmp = sortDir === 'asc' ? ra - rb : rb - ra
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'asset_class': {
          const sa = (a.category ?? '').toLowerCase()
          const sb = (b.category ?? '').toLowerCase()
          if (!sa && !sb) return tieBreak(a, b)
          if (!sa) return 1
          if (!sb) return -1
          cmp = sa.localeCompare(sb)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'price':
          cmp = numCmp(Number(a.prev_close), Number(b.prev_close), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'range_width':
          cmp = numCmp(rangeWidthPct(a), rangeWidthPct(b), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'dist_low': {
          // Distance to LRR = position pct (0 = at LRR). Smaller = closer.
          cmp = numCmp(priceInRangePct(a), priceInRangePct(b), sortDir)
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'dist_high': {
          // Distance to TRR = 1 - position pct. Smaller = closer to TRR.
          const pa = priceInRangePct(a)
          const pb = priceInRangePct(b)
          cmp = numCmp(
            pa == null ? null : 1 - pa,
            pb == null ? null : 1 - pb,
            sortDir
          )
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'date_added': {
          const da = a._etf?.date_added ?? null
          const db = b._etf?.date_added ?? null
          // Empty strings sink in both directions.
          if (!da && !db) return tieBreak(a, b)
          if (!da) return 1
          if (!db) return -1
          cmp = da < db ? -1 : da > db ? 1 : 0
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        default:
          return tieBreak(a, b)
      }
    })
    return list
  }, [filteredRows, sortField, sortDir])

  return (
    <div className="panel etfpp-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye ETF Pro Plus</h1>
          <div className="status-row">
            {status === 'ready' && snapshotDate && (
              <StatusChip label="Snapshot" value={snapshotDate} />
            )}
            {status === 'ready' && (
              <StatusChip label="Positions" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="Snapshot" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
      </header>

      {status === 'ready' && (
        <>
          <div className="filter-row">
            <CategoryFilter
              options={visibleAssetClassOptions}
              activeLabels={activeAssetClasses}
              onChange={setActiveAssetClasses}
            />
            <div className="search-wrap">
              <input
                type="search"
                className="search-input"
                placeholder="Search ticker or description..."
                aria-label="Search ETF ticker or description"
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
          </div>

          {/* Direction filter row — same chrome as RR's trend filter
              (.filter-chip family). BULLISH→long color, BEARISH→short. */}
          <nav className="trend-filters" aria-label="Direction filter">
            {DIRECTION_FILTERS.map((d) => {
              const suffix =
                d.id === 'BULLISH' ? 'long' :
                d.id === 'BEARISH' ? 'short' : 'all'
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={directionFilter === d.id}
                  className={`filter-chip filter-chip-${suffix}${directionFilter === d.id ? ' active' : ''}`}
                  onClick={() => setDirectionFilter(d.id)}
                >
                  {d.label}
                  <span className="filter-chip-count">{directionCounts[d.id] ?? 0}</span>
                </button>
              )
            })}
          </nav>

          <div className="sort-row">
            <SortControl
              fields={ETF_SORT_FIELDS}
              field={sortField}
              dir={sortDir}
              onChange={handleSortChange}
              ariaLabel="ETF Pro Plus sort"
            />
          </div>
        </>
      )}

      {status === 'loading' && <div className="state">Loading…</div>}
      {status === 'error' && (
        <div className="state error">Could not load ETF Pro Plus data.</div>
      )}

      {status === 'empty' && (
        <div className="etfpp-empty">
          <p className="etfpp-empty-title">No ETF Pro Plus data yet.</p>
          <p className="etfpp-empty-sub">
            The ingestion workflow has not run. The first snapshot will appear
            here once the weekly Hedgeye ETF Pro Plus email has been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && sortedRows.length === 0 && (
        search.trim() ? (
          <div className="state">No ETFs match “{search.trim()}”.</div>
        ) : (
          <div className="state">No ETFs match these filters.</div>
        )
      )}

      {status === 'ready' && sortedRows.length > 0 && (
        <section className="cards">
          {sortedRows.map((r) => (
            <SignalCard
              key={r.ticker}
              row={r}
              change={null}
              setup={null}
              display={null}
              expanded={expanded === r.ticker}
              onToggle={toggleExpand}
              onViewCall={null}
              vixBucket={null}
            />
          ))}
        </section>
      )}
    </div>
  )
}
