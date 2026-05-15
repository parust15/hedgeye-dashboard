import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the call_performance_v view: ticker × position_type × pct_today
 * × pct_week × pct_month × has_*_data flags. Used by the Performance
 * section's TODAY / WEEK / MONTH tabs.
 *
 * Returns { rows, hasAnyWeek, hasAnyMonth, status }.
 * `hasAnyWeek` / `hasAnyMonth` drive the "available after N trading days"
 * messages — they're true if at least one row reports the flag.
 */
export function useCallPerformance() {
  const [rows, setRows] = useState([])
  const [hasAnyWeek, setHasAnyWeek] = useState(false)
  const [hasAnyMonth, setHasAnyMonth] = useState(false)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    supabase
      .from('call_performance_v')
      .select('ticker, position_type, close_price, pct_today, pct_week, pct_month, has_week_data, has_month_data')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('useCallPerformance: fetch failed:', error)
          setStatus('error')
          return
        }
        const list = data ?? []
        setRows(list)
        setHasAnyWeek(list.some((r) => r.has_week_data === true))
        setHasAnyMonth(list.some((r) => r.has_month_data === true))
        setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, hasAnyWeek, hasAnyMonth, status }
}
