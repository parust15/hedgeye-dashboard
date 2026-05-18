import { useEffect, useRef, useState } from 'react'
import { motion, useAnimation } from 'framer-motion'

const TABS = ['RISK RANGES', 'THE CALL', 'ETF PRO PLUS', 'ETF RE-RANK', 'MACRO SHOW']

// Implementation #4 — liquid mercury blob.
//
// A rounded lozenge with a metallic linear-gradient fill sits behind
// the active tab. layoutId tweens its bounding box between tabs.
//
// Liquid behaviour comes from three layered effects:
//   (1) SVG `goo` filter applied to the blob shape — small
//       stdDeviation so edges stay smooth, not melted.
//   (2) On travel: scaleX overshoots to 1.4 and scaleY squashes to
//       0.85 mid-flight, then both spring back to 1.0 at rest. This
//       is the "stretches in the direction of travel" feel. Driven
//       via Framer's imperative controls keyed off active changes.
//   (3) Magnetic hover: when the cursor enters an INACTIVE tab, an
//       inner translateX nudges the blob ~5px toward that tab. The
//       outer layoutId stays anchored on `active`; the inner div
//       translates within it. Resets on hover-out.
//
// The spec's spring config (stiffness 220, damping 18, mass 1.2) is
// noticeably weightier than the other three implementations — the
// blob feels heavier, more reluctant to leave its current tab.

const SPRING = { type: 'spring', stiffness: 220, damping: 18, mass: 1.2 }

export function MercuryBlobTabs() {
  const [active, setActive] = useState(0)
  const [hoverIndex, setHoverIndex] = useState(null)
  const stretchControls = useAnimation()
  const firstRender = useRef(true)

  // Trigger the squash/stretch sequence on every active change EXCEPT
  // the initial mount (we want the blob to sit still on first paint).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    stretchControls.start({
      scaleX: [1.4, 1],
      scaleY: [0.85, 1],
      transition: SPRING,
    })
  }, [active, stretchControls])

  // Magnetic hover offset — small translateX toward the hovered tab.
  // Direction sign comes from hoverIndex vs active; magnitude clamps
  // at ±6px so it stays a hint, not a drag.
  const magneticX = (() => {
    if (hoverIndex == null || hoverIndex === active) return 0
    const direction = hoverIndex > active ? 1 : -1
    return direction * 5
  })()

  return (
    <nav className="mb-tabs" role="tablist" aria-label="Tab preview — mercury blob">
      {/* SVG defs for the goo filter + metallic gradient. The defs
          live inside an absolutely-zero-sized SVG so they don't take
          up layout space; the blob references them by id. */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute' }}
        aria-hidden="true"
      >
        <defs>
          <filter id="mb-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix
              in="blur"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
          <linearGradient id="mb-mercury" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8eef7" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#b8c4d6" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#8290a8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#a8c0db" stopOpacity="0.6" />
          </linearGradient>
        </defs>
      </svg>

      {TABS.map((label, i) => {
        const isActive = i === active
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mb-tab${isActive ? ' active' : ''}`}
            onClick={() => setActive(i)}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {isActive && (
              <motion.div
                layoutId="blob"
                className="mb-blob-frame"
                transition={SPRING}
                aria-hidden="true"
              >
                {/* Inner div carries the magnetic translateX +
                    squash/stretch transforms. Keeps the outer layoutId
                    motion.div free to interpolate position/size cleanly
                    without our extra transforms fighting it. */}
                <motion.div
                  className="mb-blob-inner"
                  animate={{ x: magneticX }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                  }}
                >
                  <motion.div animate={stretchControls} className="mb-blob-shape" />
                </motion.div>
              </motion.div>
            )}
            <span className="mb-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
