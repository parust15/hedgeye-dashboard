import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

// Empty Map sentinel so consumers always get a Map (no `?.get(x)` dance).
const EMPTY = new Map()

const TickerSignalStateContext = createContext({
  byTicker: EMPTY,
  status: 'loading',
})

/**
 * Provides a global Map<ticker, signalState> derived from
 * `ticker_signal_state_v` — the canonical source of truth for the
 * Change 3 trend bubble. The view unifies RR's `rr_trend` and the
 * Call's `call_trend` into a single `trend_state` per ticker plus a
 * `trend_source` ('rr' | 'call') flag indicating which one drove the
 * current state, plus stale flags for the call-sourced fields.
 *
 * Why a global context, not a per-panel hook: the TrendBubble appears
 * across every panel that renders a ticker. Without a single shared
 * fetch we'd be issuing the same 506-row select once per panel that
 * mounts; with the provider, every consumer reads from the same Map.
 *
 * Refresh cadence: 5-minute polling. The view's underlying data
 * shifts only when ingestion runs (a few times per day at most), so
 * faster polling buys nothing and burns request budget.
 */
const POLL_MS = 5 * 60 * 1000

export function TickerSignalStateProvider({ children }) {
  const [byTicker, setByTicker] = useState(EMPTY)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const res = await supabase
        .from('ticker_signal_state_v')
        .select(
          'ticker, trend_state, trend_source, trade_state, trade_source, ' +
            'call_trend_stale, call_trade_stale'
        )
      if (cancelled) return
      if (res.error) {
        console.warn('TickerSignalStateProvider: fetch failed:', res.error)
        // Don't tear down existing data on a transient fetch failure.
        setStatus((curr) => (curr === 'loading' ? 'error' : curr))
        return
      }
      const m = new Map()
      for (const r of res.data ?? []) {
        if (!r.ticker) continue
        m.set(r.ticker, r)
      }
      setByTicker(m)
      setStatus('ready')
    }

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const value = useMemo(() => ({ byTicker, status }), [byTicker, status])
  return (
    <TickerSignalStateContext.Provider value={value}>
      {children}
    </TickerSignalStateContext.Provider>
  )
}

// Look up the signal state for one ticker. Returns null when the
// provider hasn't loaded yet or the ticker isn't in the view (which
// is fine — the TrendBubble just renders nothing in that case).
//
// react-refresh wants only-components in a .jsx file. Provider +
// custom hook need to live together (the hook has no meaning without
// the context defined here), so we accept the disable — same pattern
// as TickerContext.jsx.
// eslint-disable-next-line react-refresh/only-export-components
export function useTickerSignalState(ticker) {
  const ctx = useContext(TickerSignalStateContext)
  return ticker ? ctx.byTicker.get(ticker) ?? null : null
}
