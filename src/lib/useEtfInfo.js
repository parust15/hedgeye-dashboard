import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Module-level cache so re-opening the modal for the same ticker within
// a session is instant — no loading flash. Each entry stores the resolved
// state from a prior fetch:
//   { status: 'ready', row }
//   { status: 'missing' }
//   { status: 'error' }
//
// Misses (network failures) are NOT cached so a retry on the next open
// can still succeed. The cache survives panel switches because it's
// module-scoped, not state-scoped.
const cache = new Map()

/**
 * Loads ETF info for a single ticker from `etf_info`.
 *
 * Returns { row, status, error } where status is:
 *   'idle'    — no ticker provided yet
 *   'loading' — fetch in flight
 *   'ready'   — row found and returned
 *   'missing' — query succeeded but no row exists yet (LLM backfill
 *               hasn't covered this ticker — render a friendly note,
 *               not an error)
 *   'error'   — query failed
 *
 * Module-level cache keyed by ticker keeps repeat opens instant.
 */
export function useEtfInfo(ticker) {
  // Seed initial state from cache if we've already resolved this ticker
  // — eliminates the loading flash on re-open.
  const cached = ticker ? cache.get(ticker) : null
  const [row, setRow] = useState(cached?.row ?? null)
  const [status, setStatus] = useState(() => {
    if (!ticker) return 'idle'
    if (cached) return cached.status
    return 'loading'
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ticker) {
      setRow(null)
      setStatus('idle')
      setError(null)
      return undefined
    }

    // Cache hit — short-circuit the network call.
    const hit = cache.get(ticker)
    if (hit) {
      setRow(hit.row ?? null)
      setStatus(hit.status)
      setError(null)
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    supabase
      .from('etf_info')
      .select(
        'ticker, name, category, geography, summary_bullets, typical_use, model, generated_at'
      )
      .eq('ticker', ticker)
      .limit(1)
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) {
          console.warn('useEtfInfo: fetch failed:', queryError)
          // Don't cache errors — let the next open retry.
          setRow(null)
          setStatus('error')
          setError(true)
          return
        }
        const hitRow = data && data[0]
        if (hitRow) {
          cache.set(ticker, { status: 'ready', row: hitRow })
          setRow(hitRow)
          setStatus('ready')
        } else {
          cache.set(ticker, { status: 'missing' })
          setRow(null)
          setStatus('missing')
        }
      })

    return () => {
      cancelled = true
    }
  }, [ticker])

  return { row, status, error }
}
