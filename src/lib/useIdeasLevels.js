import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the most recent risk-range level per ticker from
 * `hedgeye_ideas_levels`. The table accumulates levels across every
 * Investing Ideas message (~142 rows, ~40 unique tickers); the
 * current newsletter view (`hedgeye_ideas_latest_v`) only carries the
 * 17 tickers from the latest message.
 *
 * Active Setups uses the broader 40-ticker universe so setups from
 * recent-but-not-latest messages stay actionable as long as the
 * price hasn't broken through. Reduces client-side to keep the most
 * recent row per ticker (max created_at).
 *
 * Returns:
 *   rows         — array of latest-per-ticker rows
 *                  (shape: { ticker, side, position, prev_close,
 *                  low_end, top_end, message_id, created_at })
 *   byTicker     — Map<ticker, row> of the same data, keyed by ticker
 *   status       — 'loading' | 'ready' | 'empty' | 'error'
 *   error        — truthy on 'error', null otherwise
 *
 * Single fetch on mount, no polling — the source updates a few times
 * per week via the n8n Investing Ideas workflow.
 */
export function useIdeasLevels() {
  const [rows, setRows] = useState([])
  const [byTicker, setByTicker] = useState(() => new Map())
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      const res = await supabase
        .from('hedgeye_ideas_levels')
        .select('message_id, ticker, side, position, prev_close, low_end, top_end, created_at')
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (res.error) {
        console.error('useIdeasLevels: query failed:', res.error)
        setError(true)
        setStatus('error')
        return
      }

      const data = res.data ?? []
      if (data.length === 0) {
        setRows([])
        setByTicker(new Map())
        setStatus('empty')
        return
      }

      // Reduce to latest-per-ticker. The DESC sort above means the FIRST
      // row we see for any ticker is its most recent — `if (!has)` keeps
      // it and skips older rows for the same ticker.
      const latest = new Map()
      for (const r of data) {
        if (!r.ticker) continue
        if (!latest.has(r.ticker)) latest.set(r.ticker, r)
      }
      // Stable display order: side first (longs before shorts), then
      // alphabetical ticker — same ordering convention as the main II
      // newsletter list.
      const ordered = Array.from(latest.values()).sort((a, b) => {
        const sa = a.side === 'long' ? 0 : 1
        const sb = b.side === 'long' ? 0 : 1
        if (sa !== sb) return sa - sb
        return (a.ticker ?? '').localeCompare(b.ticker ?? '')
      })

      setRows(ordered)
      setByTicker(latest)
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useIdeasLevels: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { rows, byTicker, status, error }
}
