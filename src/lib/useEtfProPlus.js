import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the current Hedgeye ETF Pro Plus book from
 * `hedgeye_etf_pro_current_v`. The view holds the latest weekly
 * snapshot ingested by the n8n workflow "Hedgeye ETF Pro Plus".
 *
 * Returns:
 *   rows         — array of row objects, BULLISH first then BEARISH,
 *                  ordered by date_added DESC within each direction.
 *   snapshotDate — rows[0]?.snapshot_date, or null on empty/error.
 *   status       — 'loading' | 'ready' | 'empty' | 'error'.
 *                  'empty' is a SUCCESSFUL fetch that returned zero rows —
 *                  the workflow simply hasn't run yet. The panel renders
 *                  a friendly placeholder for this case instead of an
 *                  error message.
 *   error        — truthy on 'error', null otherwise.
 *
 * One-shot fetch on mount. No polling — the source data updates weekly
 * via n8n, so a re-fetch loop has no business value here.
 */
export function useEtfProPlus() {
  const [rows, setRows] = useState([])
  const [snapshotDate, setSnapshotDate] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      const res = await supabase
        .from('hedgeye_etf_pro_current_v')
        .select(
          'snapshot_date, ticker, direction, description, date_added, recent_price, trend_range_low, trend_range_high, asset_class, source_email_id, created_at'
        )

      if (cancelled) return
      if (res.error) {
        console.error('useEtfProPlus: query failed:', res.error)
        setError(true)
        setStatus('error')
        return
      }

      const data = res.data ?? []
      if (data.length === 0) {
        setRows([])
        setSnapshotDate(null)
        setStatus('empty')
        return
      }

      // Sort client-side: BULLISH first, then BEARISH; within each
      // direction, newest date_added first (NULL date_added sinks).
      const sorted = [...data].sort((a, b) => {
        if (a.direction !== b.direction) {
          return a.direction === 'BULLISH' ? -1 : 1
        }
        // Most recent additions first. Nulls last in both directions.
        const da = a.date_added ?? ''
        const db = b.date_added ?? ''
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da < db ? 1 : -1
      })

      setRows(sorted)
      setSnapshotDate(sorted[0]?.snapshot_date ?? null)
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useEtfProPlus: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { rows, snapshotDate, status, error }
}
