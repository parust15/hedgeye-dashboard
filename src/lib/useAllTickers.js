import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * One-shot fetch of `call_all_tickers_v`. The view has ~470 tickers — well
 * under PostgREST's default 1000-row cap — and the data is daily-stable,
 * so we don't poll.
 *
 * Returns { rows, byTicker, status }.
 *   - rows: full list (for All Time grid)
 *   - byTicker: Map<ticker, row> for O(1) lookup (used by Risk Ranges'
 *     "↗ VIEW CALL INFO" button + The Call's Today sector grouping)
 */
export function useAllTickers() {
  const [rows, setRows] = useState([])
  const [byTicker, setByTicker] = useState(() => new Map())
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('call_all_tickers_v')
      .select(
        'ticker, company_name, sector, analyst, last_position_type, last_seen_date, first_seen_date, today_position_type, in_today_positions, best_rank, last_top5_date, top5_appearances, total_appearances, long_days, short_days, neutral_days'
      )
      .order('total_appearances', { ascending: false })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('useAllTickers: fetch failed:', error)
          setStatus('error')
          return
        }
        const list = data ?? []
        const map = new Map()
        for (const r of list) {
          if (r.ticker) map.set(r.ticker, r)
        }
        setRows(list)
        setByTicker(map)
        setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, byTicker, status }
}
