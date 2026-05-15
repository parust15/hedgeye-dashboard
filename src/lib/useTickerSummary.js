import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the AI-generated thesis summary for a single ticker from
 * `hedgeye_call_ticker_summaries`. Returns { summary, status } where
 * `summary` is the row object or null if no row exists for this ticker
 * (the table is still populating, so absence is normal).
 *
 * `status` is one of: 'idle' (no ticker), 'loading', 'ready', 'error'.
 */
export function useTickerSummary(ticker) {
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState(ticker ? 'loading' : 'idle')

  useEffect(() => {
    if (!ticker) {
      setSummary(null)
      setStatus('idle')
      return undefined
    }
    let cancelled = false
    setStatus('loading')
    supabase
      .from('hedgeye_call_ticker_summaries')
      .select('*')
      .eq('ticker', ticker)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('useTickerSummary: fetch failed:', error)
          setSummary(null)
          setStatus('error')
          return
        }
        setSummary((data && data[0]) || null)
        setStatus('ready')
      })
    return () => {
      cancelled = true
    }
  }, [ticker])

  return { summary, status }
}
