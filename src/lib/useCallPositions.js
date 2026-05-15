import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Today's ET date as YYYY-MM-DD. Used to compare against the call view's
// latest signal_date so we can show "hasn't arrived yet" + dim older rows.
function etDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const m = {}
  for (const p of parts) m[p.type] = p.value
  return `${m.year}-${m.month}-${m.day}`
}

/**
 * Loads the most recent set of Hedgeye call positions from
 * `hedgeye_call_positions_v`. Returns:
 *   { rows, signalDate, isToday, status, error }
 *
 * `isToday` is false when the latest signal_date is older than today (ET) —
 * the caller renders a "hasn't arrived yet" banner and visually dims the
 * stale positions.
 */
export function useCallPositions() {
  const [rows, setRows] = useState([])
  const [signalDate, setSignalDate] = useState(null)
  const [isToday, setIsToday] = useState(true)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      setError(null)

      const latestRes = await supabase
        .from('hedgeye_call_positions_v')
        .select('signal_date')
        .order('signal_date', { ascending: false })
        .limit(1)

      if (latestRes.error) {
        console.error('useCallPositions: latest signal_date query failed:', latestRes.error)
        if (!cancelled) {
          setError(true)
          setStatus('error')
        }
        return
      }
      const date = latestRes.data?.[0]?.signal_date
      if (!date) {
        if (!cancelled) {
          setRows([])
          setSignalDate(null)
          setIsToday(false)
          setStatus('ready')
        }
        return
      }

      const rowsRes = await supabase
        .from('hedgeye_call_positions_v')
        .select(
          'signal_date,ticker,company_name,position_type,top5_rank,rationale,was_top5_yesterday,top5_appearances_90d,change_status,consecutive_days,call_received_at_et,conviction_score'
        )
        .eq('signal_date', date)

      if (cancelled) return
      if (rowsRes.error) {
        console.error('useCallPositions: positions query failed:', rowsRes.error)
        setError(true)
        setStatus('error')
        return
      }
      setSignalDate(date)
      setIsToday(date === etDateString())
      setRows(rowsRes.data ?? [])
      setStatus('ready')
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, signalDate, isToday, status, error }
}
