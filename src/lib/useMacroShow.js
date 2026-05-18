import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const DAYS_WINDOW = 6

/**
 * Loads the Hedgeye Macro Show data for the panel:
 *   - the latest period synthesis (weekly LLM rollup) from
 *     `hedgeye_macro_show_period_summary`
 *   - the latest N daily rows from `hedgeye_macro_show_daily_v`
 *     (N=DAYS_WINDOW), ordered newest first
 *
 * Returns:
 *   synthesis — single row { end_date, window_days, synthesis_bullets,
 *               ticker_callouts, model, generated_at } or null when no
 *               row exists (rare — table is small but valid empty state).
 *   days      — array of day rows, newest first.
 *   status    — 'loading' | 'ready' | 'empty' | 'error'.
 *               'empty' means days came back empty — the workflow
 *               hasn't ingested any show notes yet.
 *   error     — truthy on 'error', null otherwise.
 *
 * Two parallel queries in a single round-trip. No re-fetch loop;
 * source data updates daily and the user can reload the page.
 */
export function useMacroShow() {
  const [synthesis, setSynthesis] = useState(null)
  const [days, setDays] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      const [daysRes, synthRes] = await Promise.all([
        supabase
          .from('hedgeye_macro_show_daily_v')
          .select(
            'signal_date, intro_headline, bullish_tickers, bearish_tickers, main_summary_text, immediate_ranges, llm_tldr_bullets, llm_tldr_generated_at, top3'
          )
          .order('signal_date', { ascending: false })
          .limit(DAYS_WINDOW),
        supabase
          .from('hedgeye_macro_show_period_summary')
          .select('end_date, window_days, synthesis_bullets, ticker_callouts, model, generated_at')
          .order('generated_at', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return

      if (daysRes.error) {
        console.error('useMacroShow: daily fetch failed:', daysRes.error)
        setError(true)
        setStatus('error')
        return
      }
      // Synthesis is non-fatal — a working dashboard with daily data but
      // missing synthesis still renders cleanly. Just log + null it.
      if (synthRes.error) {
        console.warn('useMacroShow: synthesis fetch failed:', synthRes.error)
      }

      const daysData = daysRes.data ?? []
      const synthData = (synthRes.data && synthRes.data[0]) ?? null

      setDays(daysData)
      setSynthesis(synthData)
      setStatus(daysData.length === 0 ? 'empty' : 'ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useMacroShow: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { synthesis, days, status, error }
}
