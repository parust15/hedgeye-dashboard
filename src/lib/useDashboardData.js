import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the latest signal_date and everything keyed off it:
 *   - rows from hedgeye_signals_v (one per ticker)
 *   - trend changes (ticker -> change row)
 *   - MAX(parsed_at) for the "Updated h:mm" header
 *
 * Returns { rows, changes, signalDate, updatedAt, status, error }.
 * `status` is one of 'loading' | 'ready' | 'error'.
 */
export function useDashboardData() {
  const [rows, setRows] = useState([])
  const [changes, setChanges] = useState({})
  const [signalDate, setSignalDate] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setError(null)

      const latest = await supabase
        .from('hedgeye_signals_v')
        .select('signal_date')
        .order('signal_date', { ascending: false })
        .limit(1)

      if (latest.error) {
        console.error('useDashboardData: latest signal_date query failed:', latest.error)
        if (!cancelled) {
          setError(true)
          setStatus('error')
        }
        return
      }
      const date = latest.data?.[0]?.signal_date
      if (!date) {
        if (!cancelled) {
          setRows([])
          setStatus('ready')
        }
        return
      }

      const [signalsRes, changesRes, parsedRes] = await Promise.all([
        supabase
          .from('hedgeye_signals_v')
          .select(
            'ticker,name,display_name,trend,buy_trade,sell_trade,prev_close,range_state,category,signal_date,width_delta,prev_trr,prev_lrr'
          )
          .eq('signal_date', date),
        supabase
          .from('hedgeye_trend_changes_v')
          .select('ticker,from_trend,to_trend')
          .eq('signal_date', date),
        // MAX(parsed_at) for the current signal_date drives the "Updated h:mm"
        // header. Reads through the raw table; returns [] if anon lacks
        // SELECT and we just omit the line.
        supabase
          .from('hedgeye_signals')
          .select('parsed_at')
          .eq('signal_date', date)
          .order('parsed_at', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return
      if (signalsRes.error) {
        console.error('useDashboardData: signals query failed:', signalsRes.error)
        setError(true)
        setStatus('error')
        return
      }
      const changeMap = {}
      for (const c of changesRes.data ?? []) {
        changeMap[c.ticker] = c
      }
      setSignalDate(date)
      setRows(signalsRes.data ?? [])
      setChanges(changeMap)
      setUpdatedAt(parsedRes.data?.[0]?.parsed_at ?? null)
      setStatus('ready')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, changes, signalDate, updatedAt, status, error }
}
