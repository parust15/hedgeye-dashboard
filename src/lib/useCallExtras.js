import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the Top 5 list and macro commentary for a specific call signal_date.
 * Empty result for top5 is a normal state ("No formal Top 5 named today");
 * empty result for summary is also fine (we just skip the section).
 *
 * Returns { top5, macroCommentary, status }.
 */
export function useCallExtras(callDate) {
  const [top5, setTop5] = useState([])
  const [macroCommentary, setMacroCommentary] = useState(null)
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!callDate) {
      setTop5([])
      setMacroCommentary(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')

    Promise.all([
      supabase
        .from('hedgeye_call_top5')
        .select('rank, ticker, company_name, rationale')
        .eq('signal_date', callDate)
        .order('rank'),
      // Don't use .single() — it errors when zero rows exist, which is a
      // valid empty state, not a failure. .maybeSingle() / array handling
      // keeps the no-summary path clean.
      supabase
        .from('hedgeye_call_summary')
        .select('macro_commentary')
        .eq('signal_date', callDate)
        .limit(1),
    ])
      .then(([top5Res, summaryRes]) => {
        if (cancelled) return
        if (top5Res.error) {
          console.warn('useCallExtras: top5 fetch failed:', top5Res.error)
        }
        if (summaryRes.error) {
          console.warn('useCallExtras: summary fetch failed:', summaryRes.error)
        }
        setTop5(top5Res.data ?? [])
        setMacroCommentary(summaryRes.data?.[0]?.macro_commentary ?? null)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('useCallExtras: unexpected error:', err)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [callDate])

  return { top5, macroCommentary, status }
}
