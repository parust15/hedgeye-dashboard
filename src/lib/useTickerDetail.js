import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Lazy-loads ticker detail for the modal: most recent 10 analyst notes
 * and last 5 Top 5 appearances. Fires on every ticker change; returns
 * empty arrays + status='ready' when there's no data on file.
 */
export function useTickerDetail(ticker) {
  const [notes, setNotes] = useState([])
  const [top5History, setTop5History] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    if (!ticker) {
      setNotes([])
      setTop5History([])
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')

    Promise.all([
      supabase
        .from('hedgeye_call_ticker_notes')
        .select('signal_date, company_name, analyst, sector, note_text')
        .eq('ticker', ticker)
        .order('signal_date', { ascending: false })
        .limit(10),
      supabase
        .from('hedgeye_call_top5')
        .select('signal_date, rank, rationale')
        .eq('ticker', ticker)
        .order('signal_date', { ascending: false })
        .limit(5),
    ])
      .then(([notesRes, top5Res]) => {
        if (cancelled) return
        if (notesRes.error) {
          console.warn('useTickerDetail: notes fetch failed:', notesRes.error)
        }
        if (top5Res.error) {
          console.warn('useTickerDetail: top5 history fetch failed:', top5Res.error)
        }
        setNotes(notesRes.data ?? [])
        setTop5History(top5Res.data ?? [])
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('useTickerDetail: unexpected error:', err)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [ticker])

  return { notes, top5History, status }
}
