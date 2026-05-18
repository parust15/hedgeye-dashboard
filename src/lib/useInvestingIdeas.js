import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the latest Hedgeye Investing Ideas newsletter from
 * `hedgeye_ideas_latest_v`. One row per ticker; the view denormalizes
 * the newsletter-level metadata (newsletter_date, event_at,
 * long/short ticker lists, feed_item_url) onto every row.
 *
 * Returns:
 *   longs        — array of `side='long'` rows, position ASC
 *   shorts       — array of `side='short'` rows, position ASC
 *   meta         — { newsletterDate, eventAt, feedItemUrl } from row[0]
 *   status       — 'loading' | 'ready' | 'empty' | 'error'
 *   error        — truthy on 'error', null otherwise
 *
 * Single fetch on mount, no polling — newsletters are weekly.
 */
export function useInvestingIdeas() {
  const [longs, setLongs] = useState([])
  const [shorts, setShorts] = useState([])
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      const res = await supabase
        .from('hedgeye_ideas_latest_v')
        .select(
          'newsletter_date, event_at, long_tickers, short_tickers, feed_item_url, ticker, side, position, prev_close, low_end, top_end, sector, sector_head, thesis_summary, weekend_update, bullets'
        )
        .order('side', { ascending: false })  // 'long' before 'short' alpha-wise
        .order('position', { ascending: true })

      if (cancelled) return
      if (res.error) {
        console.error('useInvestingIdeas: query failed:', res.error)
        setError(true)
        setStatus('error')
        return
      }

      const data = res.data ?? []
      if (data.length === 0) {
        setLongs([])
        setShorts([])
        setMeta(null)
        setStatus('empty')
        return
      }

      const longRows = data.filter((r) => r.side === 'long')
      const shortRows = data.filter((r) => r.side === 'short')
      const head = data[0]
      setLongs(longRows)
      setShorts(shortRows)
      setMeta({
        newsletterDate: head.newsletter_date,
        eventAt: head.event_at,
        feedItemUrl: head.feed_item_url,
      })
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useInvestingIdeas: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { longs, shorts, meta, status, error }
}
