import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTickerFocus } from '../lib/TickerContext'

// "May 14" from YYYY-MM-DD. Matches the dashboard's date display
// convention (no year, no time — the scan list is about recency).
function formatLastSeen(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * All Time view — stripped scan list per the redesign spec.
 *
 * Three columns: ticker · company name · last seen.
 *
 * No directional indicators (no bullish/bearish chips, no LONG/SHORT
 * pills, no position color, no conviction bar, no Top 5 / Active /
 * Flipped badges). Single line per ticker, sorted by most recent
 * last_note_date.
 *
 * Data: lives in `hedgeye_call_ticker_summaries` (ticker, company_name,
 * last_note_date). The view exposes more columns but the scan list
 * only needs those three. Fetched inline here so the broader data
 * wiring in src/lib + App.jsx stays untouched per the spec scope.
 *
 * Ignored props (kept in the signature so TheCallPanel's existing
 * call site stays untouched): allTickers, allTickersByTicker, onOpen,
 * positionFilter, setPositionFilter, sectorFilter, setSectorFilter,
 * signalDate, counts, selectedCallTickers, setSelectedCallTickers.
 * They were the old card grid's filter state — All Time no longer
 * surfaces those filters.
 */
// eslint-disable-next-line no-unused-vars
export function CallAllTimeView({ search, setSearch, ...ignored }) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('loading')
  const { focusTicker } = useTickerFocus()

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    supabase
      .from('hedgeye_call_ticker_summaries')
      .select('ticker, company_name, last_note_date')
      .order('last_note_date', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('CallAllTimeView: fetch failed:', error)
          setStatus('error')
          return
        }
        setRows(data ?? [])
        setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Apply search filter (ticker OR company name). The ordering done
  // server-side already gives most-recent first, so we just preserve
  // it through the filter.
  const visibleRows = useMemo(() => {
    const q = search?.trim().toLowerCase() ?? ''
    if (!q) return rows
    return rows.filter((r) => {
      const ticker = (r.ticker ?? '').toLowerCase()
      const company = (r.company_name ?? '').toLowerCase()
      return ticker.includes(q) || company.includes(q)
    })
  }, [rows, search])

  function openPeek(ticker) {
    // No payload — the All Time row doesn't carry the call-info data
    // the legacy modal body needs; opening as a cross-tab peek instead
    // gives the user the multi-panel view of this ticker.
    focusTicker(ticker, { source: 'the-call' })
  }

  return (
    <div className="all-time-view">
      <div className="all-time-stats">
        {status === 'ready' && `${visibleRows.length} ticker${visibleRows.length === 1 ? '' : 's'}`}
        {status === 'loading' && 'Loading…'}
        {status === 'error' && 'Could not load ticker summaries.'}
      </div>

      {/* Search is the only filter the scan list keeps — non-directional,
          aids scanning a 400+ row list. All the position / sector / etc.
          filter chrome from the prior card grid is gone. */}
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

      {status === 'ready' && visibleRows.length === 0 ? (
        <div className="state">No tickers match these filters.</div>
      ) : status === 'ready' ? (
        <div className="all-time-list" role="table" aria-label="All-time ticker summaries">
          <div className="all-time-list-head" role="row" aria-hidden="true">
            <span role="columnheader">Ticker</span>
            <span role="columnheader">Company Name</span>
            <span role="columnheader">Last Seen</span>
          </div>
          {visibleRows.map((r) => (
            <button
              key={r.ticker}
              type="button"
              role="row"
              className="all-time-row"
              onClick={() => openPeek(r.ticker)}
            >
              <span role="cell" className="all-time-ticker">{r.ticker}</span>
              <span role="cell" className="all-time-company">{r.company_name ?? '—'}</span>
              <span role="cell" className="all-time-date">{formatLastSeen(r.last_note_date)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
