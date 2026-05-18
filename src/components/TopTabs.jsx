import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Top-level tab bar with constellation aesthetic.
//
// Behavior:
//   - Collapsed at rest: only the active tab is visible at natural
//     width; the other four are width-0 / opacity-0 (collapsed via
//     the React-driven .expanded class, not CSS :hover).
//   - Hovering the bar OR clicking a new active tab sets isExpanded
//     = true, which (a) grows the bar height + vertical padding via
//     Framer Motion, (b) un-collapses the other tabs via CSS, and
//     (c) fades in the constellation backdrop.
//
// Structure:
//   - SVG layer carries only the dotted connector line + the brief
//     "ignition" stroke during transit. Lines are 1D so they
//     tolerate non-uniform SVG scaling (vector-effect keeps the
//     stroke width consistent).
//   - HTML layer carries the per-tab node dots, the comet trail
//     dots, and the active star. HTML elements use CSS for fixed
//     circular sizing so they stay circular as the bar height
//     animates 56 → 88px (the SVG viewBox would have stretched
//     <circle> elements into ellipses).
//
// Tab-center math:
//   Tabs are flex: 0 0 auto (natural label widths) so equal
//   10/30/50/70/90% positions don't line up with real centers.
//   useLayoutEffect + ResizeObserver measures each tab's center as
//   a % of bar width and feeds those into both the SVG line
//   endpoints and the HTML dots' `left:` styles.

const TABS = [
  { id: 'risk-ranges', label: 'RISK RANGES' },
  { id: 'the-call', label: 'THE CALL' },
  { id: 'etf-pro-plus', label: 'ETF PRO PLUS' },
  { id: 'etf-re-rank', label: 'ETF RE-RANK' },
  { id: 'macro-show', label: 'MACRO SHOW' },
  { id: 'signal-strength', label: 'SIGNAL STRENGTH' },
  { id: 'investing-ideas', label: 'INVESTING IDEAS' },
]
const N = TABS.length

// Pre-measurement fallback — prevents NaN positions in SVG attrs
// on the first render before useLayoutEffect's measure() runs.
const FALLBACK_CENTERS = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * 100)

const STAR_SPRING = { type: 'spring', stiffness: 320, damping: 26 }
// Same spring as the constellation star travel — keeps the bar's
// height growth in lockstep with the click-driven transit motion.
const BAR_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }

const BAR_REST = { height: 56, paddingTop: 0, paddingBottom: 0 }
const BAR_EXPANDED = { height: 88, paddingTop: 12, paddingBottom: 12 }

// How long the "travelling" state holds after an active change.
// Exceeds the ignition fade (600ms) and trail spring settle (~500ms).
const TRANSIT_MS = 700

export function TopTabs({ active, onChange }) {
  const [prev, setPrev] = useState(active)
  const [hovered, setHovered] = useState(false)
  const reduceMotion = useReducedMotion()

  // --- Dynamic tab-center measurement -------------------------------
  const barRef = useRef(null)
  const tabRefs = useRef([])
  // Cache of the bar width measure() last computed against. The bar's
  // height animates (Framer spring) which fires ResizeObserver every
  // frame; tab-center % only changes when bar WIDTH changes, so we
  // short-circuit if width is unchanged. Eliminates ~24 redundant
  // getBoundingClientRect calls per height transit.
  const lastMeasuredWidth = useRef(0)
  const [centers, setCenters] = useState(FALLBACK_CENTERS)

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return undefined
    function measure() {
      const barRect = bar.getBoundingClientRect()
      if (barRect.width === 0) return
      if (barRect.width === lastMeasuredWidth.current) return
      lastMeasuredWidth.current = barRect.width
      const next = tabRefs.current.map((node) => {
        if (!node) return null
        const r = node.getBoundingClientRect()
        if (r.width === 0) return null
        const cx = r.left + r.width / 2 - barRect.left
        return (cx / barRect.width) * 100
      })
      setCenters((curr) => {
        if (curr.length !== next.length) return next
        const equal = next.every((v, i) => v === curr[i])
        return equal ? curr : next
      })
    }
    // Force a re-measure when the effect re-runs (active/hover
    // change) by clearing the cached width — otherwise the
    // short-circuit would skip the measurement we actually need.
    lastMeasuredWidth.current = 0
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [active, hovered])

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === active))
  const prevIndex = Math.max(0, TABS.findIndex((t) => t.id === prev))
  const travelling = prev !== active
  const activeX = centers[activeIndex] ?? FALLBACK_CENTERS[activeIndex]
  const prevX = centers[prevIndex] ?? FALLBACK_CENTERS[prevIndex]
  const igniteX1 = Math.min(prevX, activeX)
  const igniteX2 = Math.max(prevX, activeX)
  const visibleXs = centers.filter((c) => c != null)
  const lineStart = visibleXs.length > 0 ? visibleXs[0] : FALLBACK_CENTERS[0]
  const lineEnd =
    visibleXs.length > 0
      ? visibleXs[visibleXs.length - 1]
      : FALLBACK_CENTERS[N - 1]

  const isExpanded = hovered || travelling

  // Settle "travelling" after the transit window. Cleanup cancels
  // the prior timer on each click so rapid-fire clicks keep the
  // bar in transit until the user stops.
  useEffect(() => {
    if (!travelling) return undefined
    const id = setTimeout(() => setPrev(active), TRANSIT_MS)
    return () => clearTimeout(id)
  }, [travelling, active])

  function handleClick(id) {
    if (id === active) return
    setPrev(active)
    onChange(id)
  }

  // Reduced-motion: collapse the spring transitions to near-instant.
  // Framer accepts duration:0 to skip the spring entirely; the
  // pulse loop becomes a single value too.
  const barTransition = reduceMotion ? { duration: 0 } : BAR_SPRING
  const starTransition = reduceMotion
    ? { duration: 0 }
    : {
        left: STAR_SPRING,
        opacity: isExpanded
          ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.24, ease: 'easeOut' },
      }

  return (
    <motion.nav
      ref={barRef}
      className={`top-tabs${isExpanded ? ' expanded' : ''}`}
      role="tablist"
      aria-label="Dashboard"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={isExpanded ? BAR_EXPANDED : BAR_REST}
      transition={barTransition}
    >
      {/* SVG layer carries lines only — they're 1D and tolerate
          non-uniform stretching. Dots + star are HTML below. */}
      <svg
        className="top-tabs-constellation"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1={lineStart}
          y1="80"
          x2={lineEnd}
          y2="80"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.4"
          strokeDasharray="0.6 1.4"
          vectorEffect="non-scaling-stroke"
        />

        <AnimatePresence>
          {travelling && (
            <motion.line
              key={`ignite-${prev}-${active}`}
              x1={igniteX1}
              y1="80"
              x2={igniteX2}
              y2="80"
              stroke="rgba(180, 230, 255, 0.85)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.6, times: [0, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
      </svg>

      {/* HTML node dots — fixed pixel size via CSS, immune to
          SVG viewBox stretching. One per visible tab. */}
      {centers.map((cx, i) =>
        cx == null ? null : (
          <span
            key={`node-${i}`}
            className="top-tabs-node"
            style={{ left: `${cx}%` }}
            aria-hidden="true"
          />
        )
      )}

      {/* HTML comet trail during transit. Three trailing dots
          spring from prevX → activeX with staggered delays. */}
      <AnimatePresence>
        {travelling &&
          !reduceMotion &&
          [0.05, 0.1, 0.15].map((delay, i) => (
            <motion.span
              key={`trail-${active}-${i}`}
              className="top-tabs-trail"
              initial={{ left: `${prevX}%`, opacity: 0.7 }}
              animate={{ left: `${activeX}%`, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                left: { ...STAR_SPRING, delay },
                opacity: { duration: 0.5, delay },
              }}
              aria-hidden="true"
            />
          ))}
      </AnimatePresence>

      {/* HTML active star — fixed pixel size, CSS drop-shadow halo.
          Hidden at rest (active tab's text-shadow glow is the
          at-rest indicator). */}
      <motion.span
        className="top-tabs-star"
        animate={
          isExpanded
            ? { left: `${activeX}%`, opacity: [0.75, 1, 0.75] }
            : { left: `${activeX}%`, opacity: 0 }
        }
        transition={starTransition}
        aria-hidden="true"
      />

      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { tabRefs.current[i] = el }}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          className={`top-tab${active === t.id ? ' active' : ''}`}
          onClick={() => handleClick(t.id)}
        >
          {t.label}
        </button>
      ))}
    </motion.nav>
  )
}
