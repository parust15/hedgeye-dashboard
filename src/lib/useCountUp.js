import { useEffect, useRef, useState } from 'react'
import { isMobileNow } from './useIsMobile'

// Eases t in [0,1] with a cubic ease-out — no bounce, settles cleanly.
// Matches the "(0.2, 0.8, 0.2, 1)" feel the brief calls for without
// pulling in a tween library.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Mobile is treated the same as reduced-motion for tween purposes —
// running an RAF per visible price every tick is the single biggest
// JS-side lag source on mobile during live polling.
function shouldSkipTween() {
  return prefersReducedMotion() || isMobileNow()
}

/**
 * Animates a number from its previous value to `target` over `duration`
 * ms whenever `target` changes. First render and reduced-motion users
 * land directly on the target (no animation).
 *
 * Returns the live display value — a fractional number during the
 * tween. Callers wrap the returned value with formatNumber / formatPrice
 * to render. Non-finite targets render through immediately (the caller
 * gets the original NaN/null and can fall back to em-dash).
 */
export function useCountUp(target, { duration = 600 } = {}) {
  const [display, setDisplay] = useState(target)
  const fromRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    // Non-numeric, reduce-motion, or mobile → instant (no RAF tween).
    if (!Number.isFinite(target) || shouldSkipTween()) {
      setDisplay(target)
      fromRef.current = target
      return undefined
    }

    const from = fromRef.current
    // First render OR identical update — skip the tween, no visual gain.
    if (!Number.isFinite(from) || from === target) {
      setDisplay(target)
      fromRef.current = target
      return undefined
    }

    const startedAt = performance.now()
    const span = target - from

    const tick = (now) => {
      const t = Math.min(1, (now - startedAt) / duration)
      const v = from + span * easeOutCubic(t)
      setDisplay(v)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
        rafRef.current = 0
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return display
}
