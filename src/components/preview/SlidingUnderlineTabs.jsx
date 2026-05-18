import { useState } from 'react'
import { motion } from 'framer-motion'

const TABS = ['RISK RANGES', 'THE CALL', 'ETF PRO PLUS', 'ETF RE-RANK', 'MACRO SHOW']

// Implementation #1 — sliding glow underline.
//
// A single 2px green bar with a soft halo glow lives at the bottom of
// the active tab and tweens between tabs via Framer Motion's
// `layoutId="underline"`. Framer auto-handles the FLIP transition; we
// just hang the same layoutId on whichever tab is active.
//
// The asymmetric stretch-during-travel is achieved by animating the
// underline's scaleX between key states: scale to 1.15 right when the
// active index changes, then settle back to 1.0 via the spring config.
// We piggyback on Framer's layout animation by also driving scaleX
// imperatively via the `animate` prop keyed off the active index.

const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }

export function SlidingUnderlineTabs() {
  const [active, setActive] = useState(0)

  return (
    <nav className="su-tabs" role="tablist" aria-label="Tab preview — sliding underline">
      {TABS.map((label, i) => {
        const isActive = i === active
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`su-tab${isActive ? ' active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span className="su-label">{label}</span>
            {isActive && (
              <motion.span
                layoutId="underline"
                className="su-underline"
                transition={SPRING}
                /* The brief asymmetric stretch — scaleX jumps to 1.15
                   when active changes, springs back to 1.0. Framer
                   layoutId already handles the x/width tween; this
                   is the secondary motion for personality. */
                initial={{ scaleX: 1.15 }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 1.15 }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
