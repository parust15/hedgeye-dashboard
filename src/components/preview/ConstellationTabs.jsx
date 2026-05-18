import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const TABS = ['RISK RANGES', 'THE CALL', 'ETF PRO PLUS', 'ETF RE-RANK', 'MACRO SHOW']

// Tab center coordinates in a 0-100 viewBox space — five tabs evenly
// distributed (flex: 1 each in CSS). With preserveAspectRatio="none"
// the SVG scales to whatever pixel width the bar takes, so these
// positional anchors don't need to be recomputed per resize.
const N = TABS.length
const CENTERS = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * 100)

// Implementation #3 — constellation traveler.
//
// SVG anchored behind the tab buttons:
//   - faint dotted horizontal line connecting all five tab centers
//   - five tiny dim "constellation point" nodes at the centers
//   - one larger glowing "active star" that springs between centers
//     when the active tab changes, leaving a short comet tail behind
//   - the line segment between old-center and new-center briefly
//     ignites (brighter stroke) during the transit, then fades back
//
// Idle pulse: the active star opacity loops 0.7 ↔ 1.0 over 2s. The
// pulse pauses during travel (Framer's animate prop overrides the
// looped animation for the duration of the transition).

const STAR_SPRING = { type: 'spring', stiffness: 320, damping: 26 }

export function ConstellationTabs() {
  const [active, setActive] = useState(0)
  const [prev, setPrev] = useState(0)

  // Track the transit so we can render the comet tail + line ignition
  // with a key tied to the destination — AnimatePresence handles
  // mount/exit for the trail dots.
  function handleClick(i) {
    if (i === active) return
    setPrev(active)
    setActive(i)
  }

  const activeX = CENTERS[active]
  const prevX = CENTERS[prev]
  // Ignition segment endpoints — clamp to old/new so we don't draw
  // anything when no travel is in progress (prev === active).
  const igniteX1 = Math.min(prevX, activeX)
  const igniteX2 = Math.max(prevX, activeX)
  const travelling = prev !== active

  return (
    <nav className="ct-tabs" role="tablist" aria-label="Tab preview — constellation">
      {/* SVG sits behind the buttons — pointer-events: none so clicks
          go straight to the tab buttons above. */}
      <svg
        className="ct-svg"
        viewBox="0 0 100 56"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Dotted connector line — faint, runs through all 5 centers. */}
        <line
          x1={CENTERS[0]}
          y1="44"
          x2={CENTERS[N - 1]}
          y2="44"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.3"
          strokeDasharray="0.6 1.2"
          vectorEffect="non-scaling-stroke"
        />

        {/* "Ignition" segment — brighter stroke between old and new
            during transit, fades out via AnimatePresence + framer
            opacity tween. Keyed by `active` so it mounts fresh on
            every change. */}
        <AnimatePresence>
          {travelling && (
            <motion.line
              key={`ignite-${prev}-${active}`}
              x1={igniteX1}
              y1="44"
              x2={igniteX2}
              y2="44"
              stroke="rgba(180, 230, 255, 0.85)"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, times: [0, 0.3, 1] }}
              onAnimationComplete={() => {
                // Reset prev to active so the ignition segment doesn't
                // re-render on the next unrelated state change.
                setPrev(active)
              }}
            />
          )}
        </AnimatePresence>

        {/* Constellation point nodes — five tiny dim dots. */}
        {CENTERS.map((cx, i) => (
          <circle
            key={i}
            cx={cx}
            cy="44"
            r="0.6"
            fill="rgba(255,255,255,0.3)"
          />
        ))}

        {/* Comet tail — three small trailing dots that interpolate
            from prev to active with staggered delays + fades. Each
            trail dot is its own motion.circle so it can spring with
            slightly different timing. */}
        <AnimatePresence>
          {travelling && (
            <>
              {[0.05, 0.10, 0.15].map((delay, i) => (
                <motion.circle
                  key={`trail-${active}-${i}`}
                  cy="44"
                  r="1.2"
                  fill="rgba(180, 230, 255, 0.7)"
                  initial={{ cx: prevX, opacity: 0.7 }}
                  animate={{ cx: activeX, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    cx: { ...STAR_SPRING, delay },
                    opacity: { duration: 0.5, delay },
                  }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* The active star — glowing circle that springs between
            centers. Pulses opacity 0.7-1.0 on a 2s loop when idle;
            the position transition takes precedence during travel. */}
        <motion.circle
          cy="44"
          r="1.6"
          className="ct-star"
          fill="rgba(180, 230, 255, 1)"
          animate={{
            cx: activeX,
            opacity: [0.75, 1, 0.75],
          }}
          transition={{
            cx: STAR_SPRING,
            opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </svg>

      {TABS.map((label, i) => {
        const isActive = i === active
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ct-tab${isActive ? ' active' : ''}`}
            onClick={() => handleClick(i)}
          >
            {label}
          </button>
        )
      })}
    </nav>
  )
}
