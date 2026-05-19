import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the current Hedgeye Signal Strength ticker list from
 * `hedgeye_signal_strength_current_v`. The view already returns rows
 * sorted oldest→newest by `date_added_to_list ASC, position ASC,
 * ticker ASC`, so the caller can trust the order without re-sorting
 * the main list.
 *
 * Returns:
 *   rows        — full array (oldest first)
 *   snapshotAt  — rows[0]?.snapshot_at — ISO timestamptz string
 *   status      — 'loading' | 'ready' | 'empty' | 'error'
 *   error       — truthy on 'error', null otherwise
 *
 * Single fetch on mount, no polling — the source data updates a few
 * times per week via the ingestion workflow.
 */
export function useSignalStrength() {
  const [rows, setRows] = useState([])
  const [snapshotAt, setSnapshotAt] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      // Explicit ORDER BY mirrors the view's natural order, so any
      // future change to row-storage order doesn't shift the UI.
      // current_price / change_pct / price_quoted_at come from Finnhub;
      // ~22 of 72 are null (foreign/OTC names off the free tier).
      const res = await supabase
        .from('hedgeye_signal_strength_current_v')
        .select(
          'ticker, date_added_to_list, position, added_in_latest_email, snapshot_at, ' +
            'current_price, change_pct, price_quoted_at'
        )
        .order('date_added_to_list', { ascending: true })
        .order('position', { ascending: true })
        .order('ticker', { ascending: true })

      if (cancelled) return
      if (res.error) {
        console.error('useSignalStrength: query failed:', res.error)
        setError(true)
        setStatus('error')
        return
      }

      const data = res.data ?? []
      if (data.length === 0) {
        setRows([])
        setSnapshotAt(null)
        setStatus('empty')
        return
      }

      setRows(data)
      setSnapshotAt(data[0]?.snapshot_at ?? null)
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useSignalStrength: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { rows, snapshotAt, status, error }
}
