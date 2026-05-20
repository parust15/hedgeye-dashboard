import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { LABEL } from '../lib/labels'
import { useSignalStrength } from '../lib/useSignalStrength'
import { StatusChip } from './StatusChip'
import { SortControl } from './SortControl'
import { TickerSearch } from './TickerSearch'
import { formatPrice, parseAdded } from '../lib/format'
import { useTickerFocus } from '../lib/TickerContext'

const SKELETON_ROWS = 20

const SORT_FIELD_KEY = 'dashboard.ssSortField'
const SORT_DIR_KEY = 'dashboard.ssSortDir'
const SEARCH_KEY = 'dashboard.ssSearch'

// 4 best sort options. View-natural order is position ASC (oldest
// first) which doubles as the days-on-list descending order; that's
// the default. No range data → no range-proximity sorts.
const SS_SORT_FIELDS = [
  { value: 'position', label: 'Position (oldest first)', defaultDir: 'asc' },
  { value: 'ticker', label: 'Ticker', defaultDir: 'asc' },
  { value: 'date_added', label: 'Date added', defaultDir: 'desc' },
  { value: 'new', label: 'NEW first', defaultDir: 'desc' },
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

// parseAdded imported from src/lib/format.js — the canonical helper.
// The previous local copy was byte-identical to EtfReRankPanel's.

function snapshotLabel(snapshotAt) {
  if (!snapshotAt) return null
  // snapshot_at is timestamptz — keep just the YYYY-MM-DD prefix the spec
  // calls for. Avoids timezone-shift surprises (the DB stores UTC, we
  // don't want "May 19" showing for an Asia-localized client).
  return snapshotAt.slice(0, 10)
}

// === Dual top section: 5 OLDEST / 5 NEWEST ============================
//
// Rows in the OLDEST box show TICKER · DATE · DAYS pill.
// Rows in the NEWEST box show TICKER · DATE · NEW pill if
// added_in_latest_email else DAYS pill. The middle "blank" cell is
// preserved (empty) to match Re-Rank's ASSET CLASS rhythm.
function TopBox({ title, tone, rows }) {
  const toneClass = tone === 'top' ? 'rerank-movers-top' : 'rerank-movers-bottom'
  return (
    <div className={`rerank-movers-card ${toneClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <h2 className="rerank-movers-title">{title}</h2>
      {rows.length === 0 ? (
        <div className="rerank-movers-empty">No data yet.</div>
      ) : (
        <>
          {/* Column header row — shares the same grid template as the
              data rows so each label sits dead-center over its values.
              TICKER is left-aligned to match its data cell. */}
          <div className="tt-mover-head tt-ss-mover-row" aria-hidden="true">
            <span className="tt-mover-head-cell tt-mover-head-ticker">{LABEL.column.ticker}</span>
            <span className="tt-mover-head-cell">{LABEL.column.price}</span>
            <span className="tt-mover-head-cell">{LABEL.column.dateAdded}</span>
            <span className="tt-mover-head-cell">{LABEL.column.daysOnList}</span>
          </div>
          <ul className="rerank-movers-list">
            {rows.map((r) => {
              const { dateLabel, days } = parseAdded(r.date_added_to_list)
              const isNew = tone === 'bottom' && r.added_in_latest_email === true
              // Price comes from Finnhub; ~22 of 72 tickers (foreign/OTC
              // names off the free tier) render as "—". Spec is explicit
              // about no asterisk / explanation — just the dash.
              const priceTxt = r.current_price == null ? '—' : formatPrice(r.current_price)
              return (
                <li key={r.ticker} className="rerank-movers-row tt-ss-mover-row">
                  <span className="rerank-movers-ticker">{r.ticker}</span>
                  <span className="tt-price tt-mover-cell-c">{priceTxt}</span>
                  <span className="tt-date tt-mover-cell-c">{dateLabel ?? '—'}</span>
                  <span className="tt-mover-cell-c">
                    {isNew ? (
                      <span className="tt-newchip" aria-label="Added in latest email">NEW</span>
                    ) : (
                      <span className="tt-days">{days != null ? `${days}d` : '—'}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// === Single full-table row ============================================
const SignalRow = memo(function SignalRow({ row, pos, onFocus }) {
  const { dateLabel, days } = parseAdded(row.date_added_to_list)
  const isNew = row.added_in_latest_email === true
  // Only NEW rows carry the green left-border; everything else is neutral
  // (per spec: "no red rows"). We intentionally don't use rerank-row-down
  // anywhere here — direction has no meaning in this dataset.
  const tintClass = isNew ? 'rerank-row-up' : 'rerank-row-neutral'
  const priceTxt = row.current_price == null ? '—' : formatPrice(row.current_price)
  return (
    <li className={`rerank-row tt-ss-row ${tintClass}`}>
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-rank">{pos}</span>
      <button
        type="button"
        className="rerank-ticker tt-ticker-btn"
        onClick={() => onFocus?.(row.ticker)}
      >
        {row.ticker}
      </button>
      <span className="tt-price">{priceTxt}</span>
      <span className="rerank-asset" aria-hidden="true" />
      <span className="tt-date">{dateLabel ?? '—'}</span>
      <span className="tt-days">{days != null ? `${days}d` : '—'}</span>
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
  const { rows, snapshotAt, status } = useSignalStrength()
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

  // Top/bottom highlight boxes anchor to the natural view order
  // regardless of sort/search — the spec calls for "5 OLDEST" and
  // "5 NEWEST" as a fixed reference, not "5 oldest of current filter".
  const { oldest, newest } = useMemo(() => {
    if (!rows.length) return { oldest: [], newest: [] }
    return {
      oldest: rows.slice(0, 5),
      newest: rows.slice(-5).reverse(),
    }
  }, [rows])

  // Filter then sort for the main table.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q ? rows.filter((r) => r.ticker?.toLowerCase().includes(q)) : rows
    const sorted = list.slice()
    const tieBreak = (a, b) => a.ticker.localeCompare(b.ticker)
    sorted.sort((a, b) => {
      let cmp
      switch (sortField) {
        case 'position':
          cmp = (a.position ?? 0) - (b.position ?? 0)
          if (sortDir === 'desc') cmp = -cmp
          // Date is the primary; position is the secondary tiebreaker
          // inside the view. We collapse them: equal positions almost
          // never happen across different dates, so this is mostly
          // ticker-tiebroken.
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
          const na = a.added_in_latest_email ? 1 : 0
          const nb = b.added_in_latest_email ? 1 : 0
          cmp = sortDir === 'asc' ? na - nb : nb - na
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
            {status === 'ready' && snapshotAt && (
              <StatusChip label="Snapshot" value={snapshotLabel(snapshotAt)} />
            )}
            {status === 'ready' && (
              <StatusChip label="Tickers" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="Snapshot" value="No data yet" dot={false} />
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
          <section className="rerank-movers" aria-label="Oldest and newest signal-strength tickers">
            <TopBox title="5 OLDEST" tone="top" rows={oldest} />
            <TopBox title="5 NEWEST" tone="bottom" rows={newest} />
          </section>

          <div className="rerank-list-head tt-ss-row" aria-hidden="true">
            <span className="rerank-rank">{LABEL.column.pos}</span>
            <span className="rerank-ticker">{LABEL.column.ticker}</span>
            <span className="tt-price">{LABEL.column.price}</span>
            <span className="rerank-asset" />
            <span className="tt-date">{LABEL.column.dateAdded}</span>
            <span className="tt-days">{LABEL.column.daysOnList}</span>
            <span className="tt-newhead">NEW</span>
          </div>

          <ol className="rerank-list">
            {visibleRows.map((r) => {
              // POS column should always reflect the canonical 1..N
              // index (oldest = 1), regardless of current sort. We
              // compute it from the source `rows` order, not the
              // visible order, so re-sorting doesn't renumber the
              // tickers.
              const pos = rows.indexOf(r) + 1
              return <SignalRow key={r.ticker} row={r} pos={pos} onFocus={onFocus} />
            })}
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
