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
      .select(
        'ticker, position_type, current_price, pct_today, pct_week, pct_month, has_week_data, has_month_data'
      )
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Log the full error object so the column / RLS / schema cause
          // is visible in the console rather than just "fetch failed".
          console.error('useCallPerformance: fetch failed:', error)
          setStatus('error')
          return
        }
        // PostgREST returns numerics as strings (e.g. "-0.1037"). Parse
        // every numeric field once here so the rest of the app gets
        // ready-to-use numbers — keeps the consumer free of repeat
        // parseFloat + null-guard boilerplate.
        const list = (data ?? []).map((r) => ({
          ticker: r.ticker,
          position_type: r.position_type,
          current_price: r.current_price != null ? parseFloat(r.current_price) : null,
          pct_today: r.pct_today != null ? parseFloat(r.pct_today) : null,
          pct_week: r.pct_week != null ? parseFloat(r.pct_week) : null,
          pct_month: r.pct_month != null ? parseFloat(r.pct_month) : null,
          has_week_data: r.has_week_data,
          has_month_data: r.has_month_data,
        }))
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
