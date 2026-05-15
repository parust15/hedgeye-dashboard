import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const POLL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Loads Hedgeye's volatility-regime classification from `vix_current_v`.
 * The view yields a single row with: vix_value, bucket
 * ('investable' | 'chop' | 'fuck'), day_change, day_change_pct.
 *
 * Numerics arrive from PostgREST as strings (e.g. "18.04") so we parse
 * once here. Polls every 30 minutes — the bucket only changes when the
 * VIX crosses 20 or 30, so there's no benefit to faster cadence.
 *
 * Returns { data, status }. `data` is the parsed row or null when the
 * fetch hasn't completed or the view is empty.
 */
export function useVixBucket() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: rows, error } = await supabase
        .from('vix_current_v')
        .select('vix_value, bucket, day_change, day_change_pct')
        .limit(1)
      if (cancelled) return
      if (error) {
        console.warn('useVixBucket: fetch failed:', error)
        setStatus('error')
        return
      }
      const row = rows && rows[0]
      if (row) {
        setData({
          vix_value: row.vix_value != null ? parseFloat(row.vix_value) : null,
          bucket: row.bucket ?? null,
          day_change: row.day_change != null ? parseFloat(row.day_change) : null,
          day_change_pct:
            row.day_change_pct != null ? parseFloat(row.day_change_pct) : null,
        })
      } else {
        setData(null)
      }
      setStatus('ready')
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return { data, status }
}
