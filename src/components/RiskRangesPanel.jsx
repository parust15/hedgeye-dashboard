import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarketState } from '../lib/marketState'
import { useLivePrices } from '../lib/livePrices'
import { getPriceDisplay } from '../lib/priceDisplay'
import { useDashboardData } from '../lib/useDashboardData'
import { labelFor } from '../lib/categories'
import { formatTime } from '../lib/format'
import {
  NEAR_BUY,
  NEAR_SELL,
  LIVE_NEAR_BUY,
  LIVE_NEAR_SELL,
  effectivePct,
  hasLivePrice,
  getSetup,
} from '../lib/range'
import { SignalCard } from './SignalCard'
import { TickerFilter } from './TickerFilter'
import { MarketStatePill } from './MarketStatePill'

const TICKER_STORAGE_KEY = 'dashboard.selectedTickers'
const TREND_FILTER_KEY = 'dashboard.trendFilter'
const VALID_TRENDS = ['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL']

function loadInitialTrendFilter() {
  try {
    const raw = localStorage.getItem(TREND_FILTER_KEY)
    if (raw && VALID_TRENDS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read trendFilter from localStorage:', err)
  }
  return 'ALL'
}

const TREND_FILTERS = [
  { id: 'ALL', label: 'ALL TRENDS' },
  { id: 'BULLISH', label: 'BULLISH' },
  { id: 'BEARISH', label: 'BEARISH' },
  { id: 'NEUTRAL', label: 'NEUTRAL' },
]

export function RiskRangesPanel({ allTickersByTicker, onViewCall }) {
  // `error` from useDashboardData is intentionally not destructured — the UI
  // surfaces a generic message and the hook console.errors the raw detail.
  const { rows, changes, signalDate, updatedAt, status } = useDashboardData()
  const [view, setView] = useState('all') // 'all' | 'setups'
  // Multi-select chip state: a Set of category labels. Empty set == "All" active.
  const [activeCategories, setActiveCategories] = useState(() => new Set())
  // Per-ticker visibility (Set<string>). null until first reconcile against
  // loaded rows. While null, treat as "all selected" so initial render is
  // unfiltered instead of empty.
  const [selectedTickers, setSelectedTickers] = useState(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [trendFilter, setTrendFilter] = useState(loadInitialTrendFilter)

  useEffect(() => {
    try {
      localStorage.setItem(TREND_FILTER_KEY, trendFilter)
    } catch (err) {
      console.warn('Failed to persist trendFilter to localStorage:', err)
    }
  }, [trendFilter])

  const market = useMarketState()
  const livePrices = useLivePrices(market.isOpen)

  // Tracks the Set identity we last wrote to localStorage. Lets the persist
  // effect detect when `rows` changed but `selectedTickers` didn't, and skip
  // the redundant write.
  const lastPersistedRef = useRef(null)

  // Reconcile selectedTickers with the current rows when data arrives or
  // changes. Stored shape: { selected: string[], known: string[] }. We use
  // `known` (universe at last save) to distinguish "user deselected this"
  // from "this ticker is new" — new tickers default to selected per spec.
  useEffect(() => {
    if (rows.length === 0) return
    const universe = rows.map((r) => r.ticker)
    let stored = null
    try {
      const raw = localStorage.getItem(TICKER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.selected) && Array.isArray(parsed.known)) {
          // Defend against tampered entries by dropping non-strings.
          const onlyStrings = (arr) => arr.filter((t) => typeof t === 'string')
          stored = {
            selected: new Set(onlyStrings(parsed.selected)),
            known: new Set(onlyStrings(parsed.known)),
          }
        }
      }
    } catch (err) {
      console.warn('Failed to read selectedTickers from localStorage:', err)
    }

    let next
    if (stored) {
      next = new Set()
      for (const t of universe) {
        if (stored.known.has(t)) {
          // Known ticker: respect persisted selection state.
          if (stored.selected.has(t)) next.add(t)
        } else {
          // New ticker: default to selected.
          next.add(t)
        }
      }
    } else {
      // No prior state — everything selected.
      next = new Set(universe)
    }
    setSelectedTickers(next)
  }, [rows])

  // Persist on selection change. Identity check vs the last write avoids the
  // redundant cycle where `rows` changes but the resulting selection didn't.
  useEffect(() => {
    if (selectedTickers === null || rows.length === 0) return
    if (lastPersistedRef.current === selectedTickers) return
    try {
      const payload = {
        selected: Array.from(selectedTickers),
        known: rows.map((r) => r.ticker),
      }
      localStorage.setItem(TICKER_STORAGE_KEY, JSON.stringify(payload))
      lastPersistedRef.current = selectedTickers
    } catch (err) {
      console.warn('Failed to persist selectedTickers to localStorage:', err)
    }
  }, [selectedTickers, rows])

  // Map: ticker → priceDisplay. Recomputed when rows, live prices, or market
  // state change. Cards read their slice via .get(ticker).
  const displays = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      m.set(r.ticker, getPriceDisplay(r, livePrices.get(r.ticker), market.isOpen))
    }
    return m
  }, [rows, livePrices, market.isOpen])

  const filters = useMemo(() => {
    const cats = new Set()
    for (const r of rows) if (r.category) cats.add(r.category)
    const dynamic = Array.from(cats)
      .sort()
      .map((c) => ({ label: labelFor(c), value: c }))
    const hasUncat = rows.some((r) => !r.category)
    return [
      { label: 'All', value: null },
      ...dynamic,
      ...(hasUncat ? [{ label: 'Uncategorized', value: '__uncat__' }] : []),
    ]
  }, [rows])

  const counts = useMemo(() => {
    const c = {}
    for (const f of filters) {
      if (f.value === null) c[f.label] = rows.length
      else if (f.value === '__uncat__') c[f.label] = rows.filter((r) => !r.category).length
      else c[f.label] = rows.filter((r) => r.category === f.value).length
    }
    return c
  }, [filters, rows])

  const visibleFilters = useMemo(
    () => filters.filter((f) => f.value === null || (counts[f.label] ?? 0) > 0),
    [filters, counts]
  )

  // Drop any active category whose chip has disappeared (e.g., data shift).
  useEffect(() => {
    setActiveCategories((prev) => {
      const validLabels = new Set(visibleFilters.map((f) => f.label))
      let changed = false
      const next = new Set()
      for (const label of prev) {
        if (validLabels.has(label)) next.add(label)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [visibleFilters])

  const isAllActive = activeCategories.size === 0

  function toggleChip(filter) {
    if (filter.label === 'All') {
      setActiveCategories(new Set())
      return
    }
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(filter.label)) next.delete(filter.label)
      else next.add(filter.label)
      return next
    })
  }

  // Tickers excluded via the dropdown are filtered out of the setup count
  // too, since they're hidden everywhere on the dashboard.
  const setupCount = useMemo(
    () =>
      rows.reduce((n, r) => {
        if (selectedTickers && !selectedTickers.has(r.ticker)) return n
        return getSetup(r, displays.get(r.ticker)) ? n + 1 : n
      }, 0),
    [rows, displays, selectedTickers]
  )

  // Step 1: tickers hidden via the dropdown drop out before any other
  // logic. Trend filter (BULLISH/BEARISH/NEUTRAL) is applied alongside —
  // both filters AND together.
  const visibleRows = useMemo(() => {
    let list = selectedTickers ? rows.filter((r) => selectedTickers.has(r.ticker)) : rows
    if (trendFilter !== 'ALL') {
      list = list.filter((r) => r.trend === trendFilter)
    }
    return list
  }, [rows, selectedTickers, trendFilter])

  const trendCounts = useMemo(() => {
    const c = { ALL: rows.length, BULLISH: 0, BEARISH: 0, NEUTRAL: 0 }
    for (const r of rows) {
      if (r.trend in c) c[r.trend] += 1
    }
    return c
  }, [rows])

  // Step 2a: Active Setups view — sorted longs/shorts, closest-to-threshold first.
  const orderedSetups = useMemo(() => {
    const setups = visibleRows
      .map((r) => {
        const d = displays.get(r.ticker)
        return { row: r, setup: getSetup(r, d), pct: effectivePct(r, d) }
      })
      .filter((x) => x.setup !== null)
    setups.sort((a, b) => {
      if (a.setup === b.setup) {
        if (a.setup === 'LONG') return (a.pct ?? 0) - (b.pct ?? 0)
        return (b.pct ?? 0) - (a.pct ?? 0)
      }
      return a.setup === 'LONG' ? -1 : 1
    })
    return setups.map((x) => x.row)
  }, [visibleRows, displays])

  // Step 2b: All Signals view — chip filter + tier sort (flipped → near-buy → near-sell → alpha).
  // Tier uses effective pct (live when available) so sort order matches the
  // visible "Near buy" / "Near sell" zone tags driven by positionBarFor.
  const orderedAll = useMemo(() => {
    const list = isAllActive
      ? visibleRows
      : visibleRows.filter((r) => {
          if (!r.category) return activeCategories.has('Uncategorized')
          return activeCategories.has(labelFor(r.category))
        })

    function tier(r) {
      if (changes[r.ticker]) return 0
      const d = displays.get(r.ticker)
      const pct = effectivePct(r, d)
      const useLive = hasLivePrice(d)
      const lo = useLive ? LIVE_NEAR_BUY : NEAR_BUY
      const hi = useLive ? LIVE_NEAR_SELL : NEAR_SELL
      if (pct != null && pct < lo) return 1
      if (pct != null && pct > hi) return 2
      return 3
    }
    return [...list].sort((a, b) => {
      const ta = tier(a)
      const tb = tier(b)
      if (ta !== tb) return ta - tb
      return a.ticker.localeCompare(b.ticker)
    })
  }, [visibleRows, isAllActive, activeCategories, changes, displays])

  // Step 3: apply the free-text search on top of whichever view is active.
  const visibleCards = useMemo(() => {
    const base = view === 'setups' ? orderedSetups : orderedAll
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter((r) => {
      const ticker = (r.ticker ?? '').toLowerCase()
      const display = (r.display_name ?? '').toLowerCase()
      return ticker.includes(q) || display.includes(q)
    })
  }, [view, orderedSetups, orderedAll, search])

  function toggleExpand(ticker) {
    setExpanded((cur) => (cur === ticker ? null : ticker))
  }

  // Only render the "Updated h:mm" suffix if the timestamp parses cleanly —
  // formatTime returns null on bad input and we don't want "Updated null".
  const updatedLabel = status === 'ready' ? formatTime(updatedAt) : null

  return (
    <div className="panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Risk Ranges</h1>
          <p className="sub">
            {signalDate ? `Signal date: ${signalDate}` : 'Latest signals'} ·{' '}
            {status === 'ready' ? `${rows.length} tickers` : status}
            {status === 'ready' && Object.keys(changes).length > 0 ? ` · ${Object.keys(changes).length} flipped` : ''}
            {updatedLabel ? ` · Updated ${updatedLabel}` : ''}
          </p>
        </div>
        <MarketStatePill market={market} />
      </header>

      <nav className="view-tabs" role="tablist" aria-label="Dashboard view">
        <button
          role="tab"
          aria-selected={view === 'all'}
          className={`view-tab${view === 'all' ? ' active' : ''}`}
          onClick={() => setView('all')}
        >
          All Signals
          <span className="view-tab-count">{rows.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === 'setups'}
          className={`view-tab${view === 'setups' ? ' active' : ''}`}
          onClick={() => setView('setups')}
        >
          ⚡ Active Setups
          <span className="view-tab-count">{setupCount}</span>
        </button>
      </nav>

      <div className="filter-row">
        {view === 'all' ? (
          <nav className="chips" aria-label="Category filters">
            {visibleFilters.map((f) => {
              const isActive =
                f.label === 'All' ? isAllActive : activeCategories.has(f.label)
              return (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={isActive}
                  className={`chip${isActive ? ' active' : ''}`}
                  onClick={() => toggleChip(f)}
                >
                  {f.label}
                  <span className="chip-count">{counts[f.label] ?? 0}</span>
                </button>
              )
            })}
          </nav>
        ) : (
          <div />
        )}
        <div className="search-wrap">
          <input
            type="search"
            className="search-input"
            placeholder="Search ticker..."
            aria-label="Search ticker or name"
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
        <TickerFilter
          allTickers={rows}
          selectedTickers={selectedTickers}
          setSelectedTickers={setSelectedTickers}
        />
      </div>

      {/* Trend filter row sits just below the category-chips row. The two
          filter rows AND together — a card must match both to render. */}
      {view === 'all' && (
        <nav className="trend-filters" aria-label="Trend filter">
          {TREND_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={trendFilter === t.id}
              className={`trend-chip trend-chip-${t.id.toLowerCase()}${trendFilter === t.id ? ' active' : ''}`}
              onClick={() => setTrendFilter(t.id)}
            >
              {t.label}
              <span className="chip-count">{trendCounts[t.id] ?? 0}</span>
            </button>
          ))}
        </nav>
      )}

      {status === 'loading' && <div className="state">Loading…</div>}
      {status === 'error' && <div className="state error">Could not load dashboard data.</div>}
      {status === 'ready' && visibleCards.length === 0 && (
        search.trim() ? (
          <div className="state">No tickers match “{search.trim()}”.</div>
        ) : view === 'setups' ? (
          <div className="state state-center">No setups currently active</div>
        ) : (
          <div className="state">No signals in this category for {signalDate}.</div>
        )
      )}

      {status === 'ready' && visibleCards.length > 0 && (
        <section className="cards">
          {visibleCards.map((r) => {
            // VIEW CALL button shows only when the ticker has a call
            // history record. The handler opens the modal IN PLACE — the
            // user stays on the RR tab. `source: 'risk-ranges'` tells
            // TickerDetailModal to render the amber "CALL INFO — TICKER"
            // overlay header so the user knows this is call data on top
            // of their RR view.
            const callRow = allTickersByTicker?.get(r.ticker)
            const handleViewCall = callRow
              ? () =>
                  onViewCall?.({
                    ticker: r.ticker,
                    company_name: callRow.company_name,
                    position_type: callRow.last_position_type,
                    conviction_score: 0,
                    signal_date: callRow.last_seen_date,
                    top5_appearances_90d: callRow.top5_appearances,
                    source: 'risk-ranges',
                  })
              : null
            return (
              <SignalCard
                key={r.ticker}
                row={r}
                change={changes[r.ticker]}
                setup={getSetup(r, displays.get(r.ticker))}
                display={displays.get(r.ticker)}
                expanded={expanded === r.ticker}
                onToggle={toggleExpand}
                onViewCall={handleViewCall}
              />
            )
          })}
        </section>
      )}
    </div>
  )
}
