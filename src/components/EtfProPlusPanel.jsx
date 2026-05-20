import { useCallback, useEffect, useMemo, useState } from 'react'
import { LABEL } from '../lib/labels'
import { useEtfProPlus } from '../lib/useEtfProPlus'
import { EtfProRow, EtfProRowHead } from './EtfProRow'
import { SortControl } from './SortControl'
import { CategoryFilter } from './CategoryFilter'
import { StatusChip } from './StatusChip'
import { EtfInfoModal } from './EtfInfoModal'
import { shortenAssetClass } from '../lib/assetClass'
import { getSetup } from '../lib/range'

// --- localStorage keys (per CLAUDE.md: dashboard.<feature>) ----------------
const SEARCH_KEY = 'dashboard.etfSearch'
const DIRECTION_FILTER_KEY = 'dashboard.etfDirectionFilter'
const ASSET_CLASS_KEY = 'dashboard.etfAssetClasses'
const SORT_FIELD_KEY = 'dashboard.etfSortField'
const SORT_DIR_KEY = 'dashboard.etfSortDir'
const VIEW_KEY = 'dashboard.etfView'

const VALID_VIEWS = ['all', 'setups']

const VALID_DIRECTIONS = ['ALL', 'BULLISH', 'BEARISH']

const DIRECTION_FILTERS = [
  { id: 'ALL', label: `${LABEL.filter.all} DIRECTIONS` },
  { id: 'BULLISH', label: LABEL.filter.bullish },
  { id: 'BEARISH', label: LABEL.filter.bearish },
  // NEUTRAL omitted intentionally — hedgeye_etf_pro_current_v has only
  // BULLISH (29 rows) and BEARISH (11 rows) per UNVERIFIED #2 query
  // on 2026-05-19. Add a NEUTRAL chip here if/when the view starts
  // emitting NEUTRAL direction values.
]

// --- Sort fields (mirrors RR's SortControl contract) ----------------------
// Trimmed to 5 best per user direction. Dropped: "Recent price"
// (rarely the deciding axis), "Range width %" (the LRR/TRR proximity
// sorts already surface the actionable extreme), "Date added" (Re-Rank
// carries that signal better).
const ETF_SORT_FIELDS = [
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'direction', label: 'Direction', defaultDir: 'desc' },
  { value: 'asset_class', label: 'Asset class', defaultDir: 'asc' },
  { value: 'dist_low', label: 'Closest to LRR', defaultDir: 'asc' },
  { value: 'dist_high', label: 'Closest to TRR', defaultDir: 'asc' },
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

function loadInitialView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw && VALID_VIEWS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read etfView from localStorage:', err)
  }
  return 'all'
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
    // Shorten at the boundary so the filter chips, category lookup,
    // and sort comparator all see the same label the user sees.
    // "Emerging Market Equities" → "Emerging Markets",
    // "International Equities" → "International".
    category: etf.asset_class ? shortenAssetClass(etf.asset_class) : null,
    signal_date: etf.snapshot_date,
    _etf: etf,
  }
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
  // View toggle: 'all' = every ETF in the snapshot, 'setups' = only
  // tickers where getSetup returns LONG/SHORT (BULLISH near LRR or
  // BEARISH near TRR — the actionable edge of the trend range).
  const [view, setView] = useState(loadInitialView)
  // ETF cards open a detail modal instead of expanding inline — ETF
  // tickers don't share the hedgeye_signals_v shape ExpandedChart was
  // built for. selectedTicker drives the EtfInfoModal mounted below.
  const [selectedTicker, setSelectedTicker] = useState(null)

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

  // Debounce search persistence — otherwise every keystroke triggers a
  // synchronous localStorage write while the user is typing.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(SEARCH_KEY, search)
      } catch (err) {
        console.warn('Failed to persist etfSearch:', err)
      }
    }, 200)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_FIELD_KEY, sortField)
      localStorage.setItem(SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist etfSort:', err)
    }
  }, [sortField, sortDir])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch (err) {
      console.warn('Failed to persist etfView:', err)
    }
  }, [view])

  // SignalCard's onToggle fires on card click. For ETF cards we route
  // it to the EtfInfoModal instead of toggling an inline ExpandedChart.
  // useCallback so SignalCard children can be memoized in future.
  const openInfoModal = useCallback((ticker) => setSelectedTicker(ticker), [])
  const closeInfoModal = useCallback(() => setSelectedTicker(null), [])

  const handleSortChange = useCallback((nextField, nextDir) => {
    setSortField(nextField)
    setSortDir(nextDir)
  }, [])

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

  // Active-setup count — runs over the FULL transformed set (independent
  // of chip/direction/search filters) so the tab badge reflects the
  // total actionable count, matching RR's setupCount behavior.
  const setupCount = useMemo(
    () => transformedRows.reduce((n, r) => (getSetup(r, null) ? n + 1 : n), 0),
    [transformedRows]
  )

  const filteredRows = useMemo(() => {
    let list = transformedRows
    // Setups view comes first in the pipeline — narrows to actionable
    // tickers before the user's chip/direction/search filters refine
    // further. getSetup uses buy_trade/sell_trade/prev_close which are
    // populated correctly by toSignalRow.
    if (view === 'setups') {
      list = list.filter((r) => getSetup(r, null) !== null)
    }
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
  }, [transformedRows, view, activeAssetClasses, directionFilter, search])

  // --- Sort on top of the filtered set ------------------------------------
  const sortedRows = useMemo(() => {
    const list = filteredRows.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)

    list.sort((a, b) => {
      let cmp
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
        default:
          return tieBreak(a, b)
      }
    })
    return list
  }, [filteredRows, sortField, sortDir])

  return (
    <div className="panel etfpp-panel etf-pro-plus-panel">
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
          {/* View tabs mirror RR: "All ETFs" + "⚡ Active Setups" with
              total + setup counts as badges. Setup tab narrows the
              card grid to BULLISH ETFs near LRR / BEARISH near TRR. */}
          <nav className="view-tabs" role="tablist" aria-label="ETF view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'all'}
              className={`view-tab${view === 'all' ? ' active' : ''}`}
              onClick={() => setView('all')}
            >
              All ETFs
              <span className="view-tab-count">{transformedRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'setups'}
              className={`view-tab${view === 'setups' ? ' active' : ''}`}
              onClick={() => setView('setups')}
            >
              ⚡ Active Setups
              <span className="view-tab-count">{setupCount}</span>
            </button>
          </nav>

          {/* Category + search row. Hidden in setups view to keep the
              focus on the actionable list — same as RR. */}
          {view === 'all' && (
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
          )}

          {/* Direction filter row — same chrome as RR's trend filter
              (.filter-chip family). BULLISH→long color, BEARISH→short.
              Hidden in setups view since the LONG/SHORT split is the
              whole point of that view. */}
          {view === 'all' && (
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
          )}

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
        ) : view === 'setups' ? (
          <div className="state state-center">No active setups right now</div>
        ) : (
          <div className="state">No ETFs match these filters.</div>
        )
      )}

      {status === 'ready' && sortedRows.length > 0 && (
        <>
          <EtfProRowHead />
          <ol className="rerank-list">
            {sortedRows.map((r) => (
              <EtfProRow key={r.ticker} row={r} onOpenInfo={openInfoModal} />
            ))}
          </ol>
        </>
      )}

      {selectedTicker && (
        <EtfInfoModal ticker={selectedTicker} onClose={closeInfoModal} />
      )}
    </div>
  )
}
