import { motion, AnimatePresence } from 'framer-motion'
import { useLayoutEffect, useRef, useState } from 'react'

// Top-level tab bar with constellation aesthetic (preview variant #3
// grafted in). Collapsed-on-rest: only the active tab is visible at
// natural width, others are width-0 / opacity-0. Hovering the bar
// expands all five.
//
// Active-tab indicator is a glowing "star" rendered as a Framer
// motion.span inside the active button. layoutId="top-star" tells
// Framer to interpolate the star's position between tabs whenever
// the active class moves — so clicking a new tab while expanded
// animates the star across the bar with the spring physics below.
//
// While the bar is expanded (hover), an SVG overlay paints a faint
// dotted line connecting the five tab centers, with tiny dim node
// dots at each center. The constellation fades out cleanly when the
// bar collapses (controlled by .top-tabs:hover CSS selectors).

const TABS = [
  { id: 'risk-ranges', label: 'RISK RANGES', accent: 'green' },
  { id: 'the-call', label: 'THE CALL', accent: 'amber' },
  { id: 'etf-pro-plus', label: 'ETF PRO PLUS', accent: 'blue' },
  { id: 'etf-re-rank', label: 'ETF RE-RANK', accent: 'purple' },
  { id: 'macro-show', label: 'MACRO SHOW', accent: 'teal' },
]
const N = TABS.length
// Fallback equal-spacing for first render before refs measure (and
// for static SSR). Once measurements come in, the dynamic `centers`
// state below replaces these. Equal-spacing is a sane fallback —
// off by a few px until the first measurement lands.
const FALLBACK_CENTERS = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * 100)

const STAR_SPRING = { type: 'spring', stiffness: 320, damping: 26 }
// Same spring as the constellation star travel — keeps the bar's
// height growth in lockstep with the click-driven transit motion.
const BAR_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }

// Bar dimensions for the two states. Vertical-only animation —
// height + padding-y interpolate via Framer; width stays at 100%.
// Delta is large enough to be unambiguously visible (32px) — the
// previous 14px change was too subtle to read as intentional motion.
const BAR_REST = { height: 56, paddingTop: 0, paddingBottom: 0 }
const BAR_EXPANDED = { height: 88, paddingTop: 12, paddingBottom: 12 }

export function TopTabs({ active, onChange }) {
  // Track the previous active so the ignition line + comet trail can
  // render from old → new during transit.
  const [prev, setPrev] = useState(active)
  // React-tracked hover state — needed because the bar's height
  // animation runs through Framer Motion (not CSS :hover), so it can
  // sync with the click-transit state.
  const [hovered, setHovered] = useState(false)

  // --- Dynamic tab-center measurement -------------------------------
  // Tabs are now `flex: 0 0 auto` (natural label width), so equal
  // 10/30/50/70/90% positions don't line up with the actual tab
  // centers. We measure each tab's center relative to the bar via
  // refs + ResizeObserver and feed those into the SVG so the dots,
  // dotted line, and active star sit DIRECTLY under each label.
  const barRef = useRef(null)
  const tabRefs = useRef([])
  const [centers, setCenters] = useState(FALLBACK_CENTERS)

  // Re-measure whenever:
  //   - Active tab changes (non-active tabs collapse / expand)
  //   - Hover state changes (collapse ↔ expand)
  //   - The bar resizes (viewport change)
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    function measure() {
      const barRect = bar.getBoundingClientRect()
      if (barRect.width === 0) return
      const next = tabRefs.current.map((node) => {
        if (!node) return null
        const r = node.getBoundingClientRect()
        if (r.width === 0) return null   // collapsed tab — no real center
        const cx = r.left + r.width / 2 - barRect.left
        return (cx / barRect.width) * 100
      })
      // Only commit if at least one tab measured non-null. During the
      // CSS transition the widths change continuously; we snap to the
      // current frame's measurements and the effect re-runs on next
      // settled state.
      setCenters((prev) => {
        const equal = next.every((v, i) => v === prev[i])
        return equal ? prev : next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    tabRefs.current.forEach((n) => n && ro.observe(n))
    return () => ro.disconnect()
  }, [active, hovered])

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === active))
  const prevIndex = Math.max(0, TABS.findIndex((t) => t.id === prev))
  const travelling = prev !== active
  // Use the measured center if available; otherwise fall back to the
  // even-spacing default so the constellation has a sane initial
  // position before measurements land.
  const activeX = centers[activeIndex] ?? FALLBACK_CENTERS[activeIndex]
  const prevX = centers[prevIndex] ?? FALLBACK_CENTERS[prevIndex]
  const igniteX1 = Math.min(prevX, activeX)
  const igniteX2 = Math.max(prevX, activeX)
  // Endpoints of the dotted connector — first and last MEASURED
  // (non-null) centers so the line only spans the visible tabs and
  // adapts to the bar's collapse/expand width.
  const visibleXs = centers.filter((c) => c != null)
  const lineStart = visibleXs.length > 0 ? visibleXs[0] : FALLBACK_CENTERS[0]
  const lineEnd =
    visibleXs.length > 0
      ? visibleXs[visibleXs.length - 1]
      : FALLBACK_CENTERS[N - 1]

  // Bar is "expanded" when the user is hovering it OR a click-driven
  // active transition is in flight. Both states should grow the bar
  // height; they collapse it back when neither holds.
  const isExpanded = hovered || travelling

  function handleClick(id) {
    if (id === active) return
    setPrev(active)
    onChange(id)
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
      transition={BAR_SPRING}
    >
      {/* Constellation backdrop — only visible when the bar is
          hovered + expanded. preserveAspectRatio="none" lets the
          fixed 0-100 coords stretch to whatever pixel width the bar
          takes (collapsed or expanded). */}
      <svg
        className="top-tabs-constellation"
        viewBox="0 0 100 56"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Faint dotted line connecting tab centers — spans first to
            last MEASURED center so it adapts to bar shrink/expand. */}
        <line
          x1={lineStart}
          y1="44"
          x2={lineEnd}
          y2="44"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.4"
          strokeDasharray="0.6 1.4"
          vectorEffect="non-scaling-stroke"
        />

        {/* Ignition segment — brief bright stroke between old + new
            during active change, fades over 600ms. AnimatePresence
            handles mount/unmount keyed off the destination. */}
        <AnimatePresence>
          {travelling && (
            <motion.line
              key={`ignite-${prev}-${active}`}
              x1={igniteX1}
              y1="44"
              x2={igniteX2}
              y2="44"
              stroke="rgba(180, 230, 255, 0.85)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, times: [0, 0.3, 1] }}
              onAnimationComplete={() => setPrev(active)}
            />
          )}
        </AnimatePresence>

        {/* Constellation point nodes — one per VISIBLE tab. Tabs
            that collapsed to width 0 contribute null and get skipped
            so we don't leave orphan dots at stale positions. */}
        {centers.map((cx, i) =>
          cx == null ? null : (
            <circle
              key={i}
              cx={cx}
              cy="44"
              r="0.7"
              fill="rgba(255,255,255,0.34)"
            />
          )
        )}

        {/* Comet trail dots during transit — three follow the star
            with staggered springs + fades. Skip on first render
            (prev === active). */}
        <AnimatePresence>
          {travelling && (
            <>
              {[0.05, 0.10, 0.15].map((delay, i) => (
                <motion.circle
                  key={`trail-${active}-${i}`}
                  cy="44"
                  r="1.3"
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
            centers. Only rendered when expanded: at rest the bar
            shows only the active tab at the LEFT, so the grid-based
            star position (10/30/50/70/90%) doesn't match the actual
            tab text position. The active tab's text-shadow glow
            handles the at-rest indicator. Idle pulses opacity 0.75
            ↔ 1.0; position transition overrides the pulse loop
            during travel. */}
        <motion.circle
          cy="44"
          r="1.8"
          className="top-tabs-star"
          fill="rgba(200, 240, 255, 1)"
          animate={
            isExpanded
              ? { cx: activeX, opacity: [0.75, 1, 0.75] }
              : { cx: activeX, opacity: 0 }
          }
          transition={{
            cx: STAR_SPRING,
            opacity: isExpanded
              ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.24, ease: 'easeOut' },
          }}
        />
      </svg>

      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { tabRefs.current[i] = el }}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          className={`top-tab top-tab-${t.accent}${active === t.id ? ' active' : ''}`}
          onClick={() => handleClick(t.id)}
        >
          {t.label}
        </button>
      ))}
    </motion.nav>
  )
}
