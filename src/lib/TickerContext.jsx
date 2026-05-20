import { createContext, useCallback, useContext, useState } from 'react'

// App-wide ticker focus state. Replaces the modal-state prop drilling
// from App.jsx → RR/Call/etc. that grew brittle as more panels needed
// drill-in. Any panel can call focusTicker(ticker, { source }) to open
// the TickerDetailModal anchored to a known tab — the modal uses
// `source` to render a cross-tab peek that omits the originating tab.
//
// Shape: focus = { ticker, source, payload? } | null
//   - source: a tab id from VALID_TABS (e.g. 'risk-ranges'). The peek
//     hides this slot since "you're already here."
//   - payload: optional caller-supplied data (e.g. RR rows already in
//     hand). The legacy `position` prop on TickerDetailModal continues
//     to work in parallel — see TASK 4 for the additive prop story.

const TickerContext = createContext(null)

export function TickerProvider({ children }) {
  const [focus, setFocus] = useState(null)
  const focusTicker = useCallback((ticker, opts = {}) => {
    if (!ticker) return
    setFocus({
      ticker,
      source: opts.source ?? 'unknown',
      payload: opts.payload ?? null,
    })
  }, [])
  const unfocus = useCallback(() => setFocus(null), [])
  return (
    <TickerContext.Provider value={{ focus, focusTicker, unfocus }}>
      {children}
    </TickerContext.Provider>
  )
}

// Co-located with the Provider so the context object stays private to
// this module. react-refresh prefers components and hooks live in
// separate files for HMR; that gain is negligible for a singleton
// context hook consumed near the app root, so we opt out here.
// eslint-disable-next-line react-refresh/only-export-components
export function useTickerFocus() {
  const ctx = useContext(TickerContext)
  if (!ctx) throw new Error('useTickerFocus must be used inside <TickerProvider>')
  return ctx
}
