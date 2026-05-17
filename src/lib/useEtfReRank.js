import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the current Hedgeye ETF Re-Rank list from
 * `hedgeye_etf_rerank_latest_v`. One row per ticker — the latest weekly
 * snapshot — ordered by rank ASC (1 is best).
 *
 * Returns:
 *   rows         — array of { snapshot_date, ticker, rank, delta_1w, delta_1m }
 *   snapshotDate — rows[0]?.snapshot_date, null on empty/error.
 *   status       — 'loading' | 'ready' | 'empty' | 'error'.
 *                  'empty' is a successful fetch returning zero rows —
 *                  the workflow hasn't run yet, not a failure.
 *   error        — truthy on 'error'.
 *
 * Delta convention (per the view's COALESCE definition):
 *   delta = prev.rank - s.rank
 * Positive means moved UP the rankings (better), negative means moved
 * DOWN, null when no prior snapshot exists and no explicit callout
 * was parsed.
 *
 * One-shot fetch on mount. Source data updates weekly via n8n — a
 * re-fetch loop has no business value.
 */
export function useEtfReRank() {
  const [rows, setRows] = useState([])
  const [snapshotDate, setSnapshotDate] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      // The view already orders by rank ASC, but we ask explicitly so
      // the contract holds even if the view definition is rewritten
      // server-side later.
      const res = await supabase
        .from('hedgeye_etf_rerank_latest_v')
        .select('snapshot_date, ticker, rank, delta_1w, delta_1m')
        .order('rank', { ascending: true })

      if (cancelled) return
      if (res.error) {
        console.error('useEtfReRank: query failed:', res.error)
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

      setRows(data)
      setSnapshotDate(data[0]?.snapshot_date ?? null)
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useEtfReRank: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { rows, snapshotDate, status, error }
}
