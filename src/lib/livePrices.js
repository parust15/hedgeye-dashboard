import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const DEFAULT_OPEN_POLL_MS = 30_000
const DEFAULT_CLOSED_POLL_MS = 5 * 60_000

/**
 * Returns a Map<ticker, livePrice> of the latest rows in `live_prices`.
 *
 * Poll cadence:
 *   - Defaults: 30s open / 5min closed — used by RR + Call's
 *     LivePriceBlock surfaces (fast-changing dashboards).
 *   - openPollMs override: II + ETF Pro Plus pass 15 * 60 * 1000 because
 *     their range bars + side-by-side prev/live price tiles don't need
 *     tick-by-tick freshness, and a 15-minute cadence matches the
 *     `quoted_at` staleness threshold the priceDisplay layer uses.
 *
 * closedPollMs is intentionally left at the 5min default in every caller —
 * outside market hours, the source data doesn't move, so polling less
 * often than the stale threshold is fine and saves request volume.
 */
export function useLivePrices(
  isMarketOpen,
  openPollMs = DEFAULT_OPEN_POLL_MS,
  closedPollMs = DEFAULT_CLOSED_POLL_MS
) {
  const [byTicker, setByTicker] = useState(() => new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('live_prices')
        .select('ticker,current_price,change_amount,change_pct,prev_close,quoted_at,source')
      if (cancelled) return
      if (error) {
        // Soft-fail for UX (cards keep their current state rather than
        // flashing to "none"), but log so the failure is debuggable.
        console.warn('useLivePrices: fetch failed:', error)
        return
      }
      const next = new Map()
      for (const r of data ?? []) {
        if (r.ticker) next.set(r.ticker, r)
      }
      setByTicker(next)
    }
    load()
    const ms = isMarketOpen ? openPollMs : closedPollMs
    const id = setInterval(load, ms)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isMarketOpen, openPollMs, closedPollMs])

  return byTicker
}
