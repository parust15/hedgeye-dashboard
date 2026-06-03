import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the reconciled Hedgeye Signal Strength ticker list from
 * `hedgeye_signal_strength_reconciled_v`. This view self-updates its
 * add/remove deltas from the latest email and carries the tenure fields
 * (date_added_to_list, days_on, position). Rows come back position ASC
 * (oldest add = 1).
 *
 * Returns:
 *   rows      — full array (ticker ASC)
 *   listAsOf  — rows[0]?.list_as_of — ISO timestamptz of the latest email
 *   status    — 'loading' | 'ready' | 'empty' | 'error'
 *   error     — truthy on 'error', null otherwise
 *
 * Single fetch on mount, no polling — the source data updates a few times
 * per week via the ingestion workflow.
 */
export function useSignalStrength() {
  const [rows, setRows] = useState([])
  const [listAsOf, setListAsOf] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      // current_price / change_pct / price_quoted_at come from Finnhub and
      // may be null (foreign/OTC names off the free tier).
      const res = await supabase
        .from('hedgeye_signal_strength_reconciled_v')
        .select(
          'list_as_of, ticker, added_in_latest_email, date_added_to_list, ' +
            'days_on, position, entry_price, current_price, pct_since_signal, ' +
            'change_since_add_amt, change_since_add_pct, sector, analyst, ' +
            'best_idea_rank, change_pct, price_quoted_at'
        )
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
        setListAsOf(null)
        setStatus('empty')
        return
      }

      setRows(data)
      setListAsOf(data[0]?.list_as_of ?? null)
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

  return { rows, listAsOf, status, error }
}
