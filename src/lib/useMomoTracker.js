import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Loads the latest Hedgeye MOMO Tracker newsletter from
 * `hedgeye_momo_tracker_latest_v`. The view returns one row per
 * stock (9 rows), with newsletter-level metadata (publish_at,
 * mag7_pct, headline_movers, etc.) repeated across every row.
 * We collapse the metadata client-side and keep the per-stock array
 * separate.
 *
 * Returns:
 *   meta   — { publishAt, subject, mag7Pct, headlineMovers,
 *              earningsCatalysts, themeNote, authors, chartImageUrls,
 *              feedItemUrl, ocrStatus }
 *   stocks — array of 9 rows (or however many exist), pct_change_1w
 *            DESC NULLS LAST per the view's natural order
 *   status — 'loading' | 'ready' | 'empty' | 'error'
 *   error  — truthy on 'error'
 *
 * Single fetch on mount, no polling — MOMO is published daily so
 * a refresh-on-tab-focus pattern would be nicer but is out of scope.
 */
export function useMomoTracker() {
  const [meta, setMeta] = useState(null)
  const [stocks, setStocks] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)

      const res = await supabase
        .from('hedgeye_momo_tracker_latest_v')
        .select(
          'message_id, publish_at, subject, mag7_pct, headline_movers, ' +
            'earnings_catalysts, theme_note, authors, chart_image_urls, ' +
            'feed_item_url, ocr_status, ticker, pct_change_1w, bias, ' +
            'prev_close, low_end, top_end, earnings_this_week, earnings_day'
        )
        .order('pct_change_1w', { ascending: false, nullsFirst: false })

      if (cancelled) return
      if (res.error) {
        console.error('useMomoTracker: query failed:', res.error)
        setError(true)
        setStatus('error')
        return
      }

      const data = res.data ?? []
      if (data.length === 0) {
        setMeta(null)
        setStocks([])
        setStatus('empty')
        return
      }

      const head = data[0]
      setMeta({
        messageId: head.message_id,
        publishAt: head.publish_at,
        subject: head.subject,
        mag7Pct: head.mag7_pct,
        headlineMovers: Array.isArray(head.headline_movers) ? head.headline_movers : [],
        earningsCatalysts: Array.isArray(head.earnings_catalysts) ? head.earnings_catalysts : [],
        themeNote: head.theme_note,
        authors: Array.isArray(head.authors) ? head.authors : [],
        chartImageUrls:
          head.chart_image_urls && typeof head.chart_image_urls === 'object'
            ? head.chart_image_urls
            : {},
        feedItemUrl: head.feed_item_url,
        ocrStatus: head.ocr_status,
      })
      setStocks(
        data.map((r) => ({
          ticker: r.ticker,
          pct_change_1w: r.pct_change_1w,
          bias: r.bias,
          prev_close: r.prev_close,
          low_end: r.low_end,
          top_end: r.top_end,
          earnings_this_week: r.earnings_this_week,
          earnings_day: r.earnings_day,
        }))
      )
      setStatus('ready')
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useMomoTracker: unexpected error:', err)
      setError(true)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { meta, stocks, status, error }
}
