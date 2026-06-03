import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { LABEL } from '../lib/labels'
import { useSignalStrength } from '../lib/useSignalStrength'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { TickerSearch } from './TickerSearch'
import { formatPrice } from '../lib/format'
import { useTickerFocus } from '../lib/TickerContext'
import { TrendBubble } from './TrendBubble'

const SKELETON_ROWS = 20

const SORT_FIELD_KEY = 'dashboard.ssSortField'
const SORT_DIR_KEY = 'dashboard.ssSortDir'
const SEARCH_KEY = 'dashboard.ssSearch'

// Position (oldest add = 1) is the default tenure order; ticker, date-added,
// and "Newest adds first" (today's adds on top) are also offered.
const SS_SORT_FIELDS = [
  { value: 'position', label: 'Position (oldest first)', defaultDir: 'asc' },
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'date_added', label: 'Date added', defaultDir: 'desc' },
  { value: 'new', label: 'Newest adds first', defaultDir: 'desc' },
]
const SS_SORT_VALUES = new Set(SS_SORT_FIELDS.map((f) => f.value))

function loadInitialSortField() {
  try {
    const raw = localStorage.getItem(SORT_FIELD_KEY)
    if (raw && SS_SORT_VALUES.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read ssSortField from localStorage:', err)
  }
  return 'position'
}

function loadInitialSortDir() {
  try {
    const raw = localStorage.getItem(SORT_DIR_KEY)
    if (raw === 'asc' || raw === 'desc') return raw
  } catch (err) {
    console.warn('Failed to read ssSortDir from localStorage:', err)
  }
  return 'asc'
}

function loadInitialSearch() {
  try {
    return localStorage.getItem(SEARCH_KEY) ?? ''
  } catch (err) {
    console.warn('Failed to read ssSearch from localStorage:', err)
    return ''
  }
}

// date_added_to_list (YYYY-MM-DD) → "M/D" for the ADDED column.
function fmtAddedMD(isoDate) {
  if (!isoDate) return '—'
  const [, m, d] = String(isoDate).split('-').map(Number)
  if (!m || !d) return '—'
  return `${m}/${d}`
}

function listAsOfLabel(listAsOf) {
  if (!listAsOf) return null
  // list_as_of is timestamptz — keep just the YYYY-MM-DD prefix (UTC) to
  // avoid timezone-shift surprises for non-US clients.
  return listAsOf.slice(0, 10)
}

// === Single full-table row ============================================
const SignalRow = memo(function SignalRow({ row, onFocus }) {
  const isNew = row.added_in_latest_email === true
  // Only NEW rows carry the green left-border; everything else is neutral
  // (per spec: "no red rows"). We intentionally don't use rerank-row-down
  // anywhere here — direction has no meaning in this dataset.
  const tintClass = isNew ? 'rerank-row-up' : 'rerank-row-neutral'
  const priceTxt = row.current_price == null ? '—' : formatPrice(row.current_price)
  const entryTxt = row.entry_price == null ? '—' : formatPrice(row.entry_price)
  // Hedgeye's own "% Since Initial Signal". Guard null BEFORE Number() so a
  // missing value renders "—", not a green +0.0% (the Number(null)===0 trap).
  const sinceNum = row.pct_since_signal == null ? null : Number(row.pct_since_signal)
  const sinceOk = sinceNum != null && Number.isFinite(sinceNum)
  const sinceTxt = sinceOk ? `${sinceNum >= 0 ? '+' : ''}${sinceNum.toFixed(1)}%` : '—'
  const sinceColor = !sinceOk ? 'var(--text-dim)' : sinceNum >= 0 ? 'var(--bull)' : 'var(--bear)'
  return (
    <li className={`rerank-row tt-ss-row ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-rank">{row.position ?? '—'}</span>
      <button
        type="button"
        className="rerank-ticker tt-ticker-btn"
        onClick={() => onFocus?.(row.ticker)}
      >
        {row.ticker}
        <TrendBubble ticker={row.ticker} />
      </button>
      <span className="tt-ss-analyst">
        <span className="tt-ss-analyst-name">{row.analyst || '—'}</span>
        {row.sector && <span className="tt-ss-analyst-sector">{row.sector}</span>}
      </span>
      <span className="tt-ss-entry">{entryTxt}</span>
      <span className="tt-price">{priceTxt}</span>
      <span className="tt-ss-since" style={{ color: sinceColor }}>
        {sinceTxt}
      </span>
      <span className="tt-date">{fmtAddedMD(row.date_added_to_list)}</span>
      <span className="tt-days">{row.days_on != null ? `${row.days_on}d` : '—'}</span>
      <span className="tt-ss-rank">
        {row.best_idea_rank ? (
          <span className="tt-ss-rank-badge">{row.best_idea_rank}</span>
        ) : (
          <span className="tt-cell-dim">—</span>
        )}
      </span>
      {isNew ? (
        <span className="tt-newchip">NEW</span>
      ) : (
        <span className="tt-cell-dim">—</span>
      )}
    </li>
  )
})

function SignalSkeleton() {
  return (
    <ol className="rerank-list rerank-list-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="rerank-row tt-ss-row rerank-row-skeleton" />
      ))}
    </ol>
  )
}

export function SignalStrengthPanel() {
  const { rows, listAsOf, status } = useSignalStrength()
  const { focusTicker } = useTickerFocus()
  // Stable identity so memo(SignalRow) skips re-render when only sort/
  // search state changes elsewhere in the panel.
  const onFocus = useCallback(
    (ticker) => focusTicker(ticker, { source: 'signal-strength' }),
    [focusTicker]
  )

  const [sortField, setSortField] = useState(loadInitialSortField)
  const [sortDir, setSortDir] = useState(loadInitialSortDir)
  const [search, setSearch] = useState(loadInitialSearch)

  useEffect(() => {
    try {
      localStorage.setItem(SORT_FIELD_KEY, sortField)
      localStorage.setItem(SORT_DIR_KEY, sortDir)
    } catch (err) {
      console.warn('Failed to persist ssSort to localStorage:', err)
    }
  }, [sortField, sortDir])

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_KEY, search)
    } catch (err) {
      console.warn('Failed to persist ssSearch to localStorage:', err)
    }
  }, [search])

  function handleSortChange(field, dir) {
    setSortField(field)
    setSortDir(dir)
  }

  // Filter then sort for the main table.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.ticker?.toLowerCase().includes(q)) : rows
    const sorted = filtered.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)
    sorted.sort((a, b) => {
      let cmp
      switch (sortField) {
        case 'position':
          cmp = (a.position ?? 0) - (b.position ?? 0)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        case 'ticker':
          cmp = a.ticker.localeCompare(b.ticker)
          return sortDir === 'asc' ? cmp : -cmp
        case 'date_added': {
          const da = a.date_added_to_list ?? ''
          const db = b.date_added_to_list ?? ''
          if (!da && !db) return tieBreak(a, b)
          if (!da) return 1
          if (!db) return -1
          cmp = da < db ? -1 : da > db ? 1 : 0
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        case 'new': {
          // "Newest adds first": order the WHOLE list newest → oldest by add
          // recency. Position 1 is the oldest add, so newest-first = position
          // DESC (today's adds lead, then on down to the longest-tenured).
          cmp = (a.position ?? 0) - (b.position ?? 0)
          if (sortDir === 'desc') cmp = -cmp
          return cmp !== 0 ? cmp : tieBreak(a, b)
        }
        default:
          return tieBreak(a, b)
      }
    })
    return sorted
  }, [rows, search, sortField, sortDir])

  return (
    <div className="panel rerank-panel signal-strength-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Signal Strength — Stocks by Tenure</h1>
          <div className="status-row">
            {status === 'ready' && listAsOf && (
              <StatusChip label="List as of" value={listAsOfLabel(listAsOf)} />
            )}
            {status === 'ready' && (
              <StatusChip label="Tickers" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="List as of" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
        {status === 'ready' && (
          <div className="tt-controls">
            <TickerSearch
              value={search}
              onChange={setSearch}
              ariaLabel="Search Signal Strength tickers"
            />
            <SortControl
              fields={SS_SORT_FIELDS}
              field={sortField}
              dir={sortDir}
              onChange={handleSortChange}
              ariaLabel="Signal Strength sort"
            />
          </div>
        )}
      </header>

      {status === 'loading' && <SignalSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load Signal Strength data.</div>
      )}

      {status === 'empty' && (
        <div className="rerank-empty">
          <p className="rerank-empty-title">No data yet.</p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="rerank-list-head tt-ss-row" aria-hidden="true">
            <span className="rerank-rank">{LABEL.column.pos}</span>
            <span className="rerank-ticker">{LABEL.column.ticker}</span>
            <span className="tt-ss-analyst">Analyst</span>
            <span className="tt-ss-entry">Entry</span>
            <span className="tt-price">{LABEL.column.price}</span>
            <span className="tt-ss-since">Since</span>
            <span className="tt-date">{LABEL.column.dateAdded}</span>
            <span className="tt-days">{LABEL.column.daysOnList}</span>
            <span className="tt-ss-rank">Rank</span>
            <span className="tt-newhead">NEW</span>
          </div>

          <ol className="rerank-list">
            {visibleRows.map((r) => (
              <SignalRow key={r.ticker} row={r} onFocus={onFocus} />
            ))}
          </ol>
          {visibleRows.length === 0 && search.trim() && (
            <div className="state">
              No tickers match &quot;{search.trim()}&quot;.
            </div>
          )}
        </>
      )}
    </div>
  )
}
