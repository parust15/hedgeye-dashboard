import { useEffect, useState } from 'react'

// Mobile breakpoint matches the existing 640px CSS media-query cutoff
// used throughout App.css. matchMedia is cheap and event-driven — no
// resize listener churn.
const MOBILE_QUERY = '(max-width: 640px)'

function read() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(MOBILE_QUERY).matches
}

/**
 * Returns true when the viewport is at-or-below the mobile breakpoint.
 * Used to gate expensive visual work — WebGL shader, framer-motion
 * parallax, count-up tweens, backdrop-filter blurs — that mobile GPUs
 * can't sustain at 60fps.
 *
 * Listens for breakpoint crossings (e.g. landscape rotation) so the gates
 * flip without a reload.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(read)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

// Synchronous read for hooks/effects that need the current value without
// subscribing to changes. Used by useCountUp where re-rendering on
// breakpoint change isn't necessary — the next price tick will pick up
// the new state naturally.
export function isMobileNow() {
  return read()
}
