import { useState } from 'react'
import { motion } from 'framer-motion'

const TABS = ['RISK RANGES', 'THE CALL', 'ETF PRO PLUS', 'ETF RE-RANK', 'MACRO SHOW']

// Implementation #2 — frosted pill.
//
// A rounded translucent rectangle sits behind the active tab and
// tweens position + size via Framer Motion's layoutId. The bouncier
// spring (kept as one of the per-implementation overrides per the
// spec) gives the rubber-band-stretch-on-arrival feel.
//
// The pill is absolutely positioned so layoutId can interpolate its
// bounding box freely. Text sits above via z-index so the frosted
// glass shows the labels crisp.

const SPRING = { type: 'spring', stiffness: 260, damping: 22, mass: 1.0 }

export function FrostedPillTabs() {
  const [active, setActive] = useState(0)

  return (
    <nav className="fp-tabs" role="tablist" aria-label="Tab preview — frosted pill">
      {TABS.map((label, i) => {
        const isActive = i === active
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`fp-tab${isActive ? ' active' : ''}`}
            onClick={() => setActive(i)}
          >
            {isActive && (
              <motion.span
                layoutId="pill"
                className="fp-pill"
                transition={SPRING}
                aria-hidden="true"
              />
            )}
            <span className="fp-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
