import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const OPEN_POLL_MS = 30_000
const CLOSED_POLL_MS = 5 * 60_000

/**
 * Returns a Map<ticker, livePrice> of the latest rows in `live_prices`.
 * Polls every 30s when the market is open, every 5min otherwise.
 */
export function useLivePrices(isMarketOpen) {
  const [byTicker, setByTicker] = useState(() => new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('live_prices')
        .select('ticker,current_price,change_amount,change_pct,prev_close,quoted_at,source')
      if (cancelled) return
      if (error) {
        // Soft-fail: leave the existing map untouched so cards keep their
        // current state rather than flashing to "none".
        return
      }
      const next = new Map()
      for (const r of data ?? []) {
        if (r.ticker) next.set(r.ticker, r)
      }
      setByTicker(next)
    }
    load()
    const ms = isMarketOpen ? OPEN_POLL_MS : CLOSED_POLL_MS
    const id = setInterval(load, ms)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isMarketOpen])

  return byTicker
}
