import { useEffect, useMemo, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

const STATE_TINTS = {
  'HH/HL':     { r: 34,  g: 197, b: 94  },
  'LH/LL':     { r: 239, g: 68,  b: 68  },
  'HH/LL':     { r: 245, g: 158, b: 11  },
  'LH/HL':     { r: 96,  g: 165, b: 250 },
  'unchanged': { r: 156, g: 163, b: 175 },
}
const NEUTRAL = STATE_TINTS.unchanged

function dominantState(tickers) {
  if (!tickers || tickers.length === 0) return { tint: NEUTRAL, dominance: 0 }
  const counts = {}
  for (const t of tickers) {
    const key = t.range_state in STATE_TINTS ? t.range_state : 'unchanged'
    counts[key] = (counts[key] || 0) + 1
  }
  let topKey = 'unchanged', topCount = 0
  for (const k of Object.keys(counts)) {
    if (counts[k] > topCount) { topKey = k; topCount = counts[k] }
  }
  return { tint: STATE_TINTS[topKey], dominance: topCount / tickers.length }
}

// Empirical motion proof. URL param ?motion-debug=1 turns it on.
// Polls computed transform on every animation frame; if the numbers
// change, motion is alive. If they freeze, motion is broken.
function useDebugMotionEnabled() {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).has('motion-debug')
  })
  return enabled
}

function extractTx(transformStr) {
  if (!transformStr || transformStr === 'none') return '0px'
  const m = /matrix\(\s*[^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),/.exec(transformStr)
  if (m) return parseFloat(m[1]).toFixed(0) + 'px'
  const m3d = /matrix3d\([^)]*\)/.exec(transformStr)
  if (m3d) {
    const parts = transformStr.match(/-?\d+\.?\d*/g) || []
    if (parts.length >= 13) return parseFloat(parts[12]).toFixed(0) + 'px'
  }
  return '–'
}

function MotionDebug() {
  const [vals, setVals] = useState({ light1: '–', sweep: '–', frame: 0 })
  useEffect(() => {
    let raf, frame = 0
    const tick = () => {
      frame++
      const l1 = document.querySelector('.light-1')
      const sw = document.querySelector('.ambient-sweep')
      setVals({
        light1: l1 ? extractTx(getComputedStyle(l1).transform) : '–',
        sweep:  sw ? extractTx(getComputedStyle(sw).transform) : '–',
        frame,
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 8, right: 8,
      background: 'rgba(0,0,0,0.78)', color: '#3fff7f',
      padding: '6px 10px', borderRadius: 4,
      fontFamily: 'ui-monospace, "Geist Mono", monospace', fontSize: 11,
      zIndex: 9999, pointerEvents: 'none', lineHeight: 1.55,
      border: '1px solid rgba(63, 255, 127, 0.3)',
    }}>
      <div>light-1 tx: {vals.light1}</div>
      <div>sweep   tx: {vals.sweep}</div>
      <div>frame:      {vals.frame}</div>
    </div>
  )
}

export function AmbientBackground({ tickers }) {
  const { tint, dominance } = useMemo(() => dominantState(tickers), [tickers])
  const debugOn = useDebugMotionEnabled()

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 20 })
  const sy = useSpring(my, { stiffness: 40, damping: 20 })
  const tx = useTransform(sx, [-1, 1], [12, -12])
  const ty = useTransform(sy, [-1, 1], [12, -12])

  useEffect(() => {
    const onMove = (e) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1)
      my.set((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [mx, my])

  const cssVars = {
    '--ambient-dominant': `${tint.r}, ${tint.g}, ${tint.b}`,
    '--ambient-dominance': dominance.toFixed(2),
  }

  return (
    <div className="ambient" aria-hidden="true" style={cssVars}>
      <div className="ambient-dominant-pool" />
      <motion.div className="ambient-lights" style={{ x: tx, y: ty }}>
        <span className="ambient-light light-1" />
        <span className="ambient-light light-2" />
        <span className="ambient-light light-3" />
        <span className="ambient-light light-4" />
        <span className="ambient-light light-5" />
      </motion.div>
      <div className="ambient-ribbon ribbon-1" />
      <div className="ambient-ribbon ribbon-2" />
      <div className="ambient-sweep" />
      <div className="ambient-noise" />
      <div className="ambient-vignette" />
      {debugOn && <MotionDebug />}
    </div>
  )
}
