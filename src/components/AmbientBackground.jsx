import { useEffect, useMemo, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { CosmosShader } from './CosmosShader'
import { useIsMobile } from '../lib/useIsMobile'
// STATE_TINTS comes from the canonical rangeState module so this
// component, RangeStateBadge, and chartTheme all read the same RGB
// values for the 5 range_state buckets. Local table previously here
// was the source of the color drift the sync spec calls out.
import { STATE_TINTS } from '../lib/rangeState'

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

// Seeded PRNG so the star field is identical across reloads — Hubble
// images don't change between viewings; neither should our cosmos.
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Build a comma-separated box-shadow string with N stars distributed
// across the stellar classification spectrum (O/B blue-white through
// M-type red), with a power-curve brightness distribution and 3-tier
// size variety so the field reads as natural sky instead of uniform
// white pixels.
function generateStarShadows(count, seed) {
  const rng = mulberry32(seed)
  const shadows = []
  for (let i = 0; i < count; i++) {
    const x = (rng() * 100).toFixed(2)
    const y = (rng() * 100).toFixed(2)

    // Brightness — power curve biases toward dim, rare brights stand out
    const brightRoll = rng()
    const alpha = (0.20 + Math.pow(brightRoll, 2.5) * 0.78).toFixed(2)

    // Size — six tiers from 0.5px tiny dots up to rare 2.5px giants,
    // distributed so the field reads as "most pinpricks, a noticeable
    // minority larger, the very largest stars are striking standouts".
    const sizeRoll = rng()
    const size =
      sizeRoll < 0.003 ? '2.5px' :
      sizeRoll < 0.015 ? '2px' :
      sizeRoll < 0.045 ? '1.5px' :
      sizeRoll < 0.120 ? '1px' :
      sizeRoll < 0.280 ? '0.75px' :
      '0.5px'

    // Stellar color — main-sequence classification distribution
    const colorRoll = rng()
    let r = 255, g = 255, b = 255
    if (colorRoll < 0.18) {
      r = 200; g = 220; b = 255       // O/B-type blue-white (hot)
    } else if (colorRoll < 0.36) {
      r = 255; g = 245; b = 220       // F/G-type yellow-white (sun-like)
    } else if (colorRoll < 0.46) {
      r = 255; g = 210; b = 170       // K-type orange
    } else if (colorRoll < 0.52) {
      r = 255; g = 170; b = 130       // M-type red giant
    }
    // Remaining ~48% stay pure white

    shadows.push(`${x}vw ${y}vh 0 ${size} rgba(${r},${g},${b},${alpha})`)
  }
  return shadows.join(', ')
}

// Bright stars with diffraction spikes — placed at fixed positions,
// alternating warm/cool tints. Eight chosen positions avoid the center
// of the viewport where the dashboard data sits.
const BRIGHT_STARS = [
  { x: 12, y: 18, hue: 'warm' },
  { x: 82, y: 22, hue: 'cool' },
  { x: 24, y: 78, hue: 'cool' },
  { x: 67, y: 65, hue: 'warm' },
  { x: 45, y: 11, hue: 'cool' },
  { x: 91, y: 50, hue: 'warm' },
  { x: 8,  y: 88, hue: 'cool' },
  { x: 55, y: 92, hue: 'warm' },
]

function tickerHash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function tickerPos(ticker) {
  const h = tickerHash(ticker)
  return {
    x: 4 + (h % 9200) / 100,
    y: 10 + ((h >>> 12) % 8000) / 100,
  }
}

function constellationEdges(tickers) {
  if (!tickers || tickers.length === 0) return []
  const points = tickers.slice(0, 200).map(t => ({
    ticker: t.ticker,
    state: t.range_state || 'unchanged',
    pos: tickerPos(t.ticker),
  }))
  const edges = []
  const MAX_DIST_SQ = 18 * 18
  const MAX_EDGES = 60
  for (let i = 0; i < points.length && edges.length < MAX_EDGES; i++) {
    for (let j = i + 1; j < points.length && edges.length < MAX_EDGES; j++) {
      if (points[i].state !== points[j].state) continue
      const dx = points[i].pos.x - points[j].pos.x
      const dy = points[i].pos.y - points[j].pos.y
      if (dx * dx + dy * dy < MAX_DIST_SQ) edges.push([points[i], points[j]])
    }
  }
  return edges
}

function Starfield({ tickers }) {
  const edges = useMemo(() => constellationEdges(tickers), [tickers])
  if (!tickers || tickers.length === 0) return null
  return (
    <>
      <svg
        className="ambient-constellation"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {edges.map(([a, b], i) => {
          const tint = STATE_TINTS[a.state] || NEUTRAL
          return (
            <line
              key={i}
              x1={a.pos.x} y1={a.pos.y}
              x2={b.pos.x} y2={b.pos.y}
              stroke={`rgba(${tint.r},${tint.g},${tint.b},0.28)`}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
      <div className="ambient-starfield">
        {tickers.slice(0, 200).map((t) => {
          const pos = tickerPos(t.ticker)
          const tint = STATE_TINTS[t.range_state] || NEUTRAL
          const hash = tickerHash(t.ticker)
          return (
            <span
              key={t.ticker}
              className="ambient-ticker-star"
              style={{
                left: `${pos.x}vw`,
                top: `${pos.y}vh`,
                background: `rgba(${tint.r},${tint.g},${tint.b},0.65)`,
                boxShadow: `0 0 8px rgba(${tint.r},${tint.g},${tint.b},0.55)`,
                animationDelay: `${hash % 4000}ms`,
              }}
            />
          )
        })}
      </div>
    </>
  )
}

function AlertPulse({ tickers }) {
  const [pulse, setPulse] = useState({ x: 50, y: 50, key: 0, tint: NEUTRAL })
  useEffect(() => {
    if (!tickers || tickers.length === 0) return
    const id = setInterval(() => {
      const t = tickers[Math.floor(Math.random() * tickers.length)]
      const pos = tickerPos(t.ticker)
      const tint = STATE_TINTS[t.range_state] || NEUTRAL
      setPulse(p => ({ x: pos.x, y: pos.y, key: p.key + 1, tint }))
    }, 4500)
    return () => clearInterval(id)
  }, [tickers])
  if (!tickers || tickers.length === 0) return null
  return (
    <span
      key={pulse.key}
      className="ambient-alert-pulse"
      style={{
        left: `${pulse.x}vw`,
        top: `${pulse.y}vh`,
        background: `radial-gradient(circle, rgba(${pulse.tint.r},${pulse.tint.g},${pulse.tint.b},0.85) 0%, transparent 70%)`,
      }}
    />
  )
}

function CosmicMeteors() {
  const [meteors, setMeteors] = useState([])

  useEffect(() => {
    const spawn = () => {
      const lane = 1 + Math.floor(Math.random() * 8)
      const duration = 2.5 + Math.random() * 4
      const sizeRoll = Math.random()
      const size = sizeRoll < 0.15 ? 'large' : sizeRoll < 0.4 ? 'medium' : 'small'
      const tintRoll = Math.random()
      const tint = tintRoll < 0.7 ? 'cyan' : tintRoll < 0.9 ? 'blue' : 'warm'
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const meteor = { key, lane, duration, size, tint }
      setMeteors(m => [...m, meteor])
      setTimeout(() => {
        setMeteors(m => m.filter(x => x.key !== key))
      }, (duration + 0.3) * 1000)
    }

    const initialDelay = setTimeout(spawn, 800)
    const interval = setInterval(() => {
      spawn()
      // Occasional burst — two meteors in quick succession
      if (Math.random() < 0.15) {
        setTimeout(spawn, 200 + Math.random() * 400)
      }
    }, 1600)

    return () => {
      clearTimeout(initialDelay)
      clearInterval(interval)
    }
  }, [])

  return (
    <>
      {meteors.map(m => (
        <span
          key={m.key}
          className={`cosmic-meteor lane-${m.lane} size-${m.size} tint-${m.tint}`}
          style={{ animationDuration: `${m.duration}s` }}
        />
      ))}
    </>
  )
}

// Supernova — periodic bright flash at a random position. Reads as a
// catastrophic stellar event, not as an ambient drift. 25-second cycle
// is short enough to be witnessable; long enough to feel rare.
function Supernova() {
  const [event, setEvent] = useState({ x: 35, y: 30, key: 0 })
  useEffect(() => {
    const id = setInterval(() => {
      setEvent(e => ({
        x: 12 + Math.random() * 76,
        y: 8 + Math.random() * 55,
        key: e.key + 1,
      }))
    }, 25000)
    return () => clearInterval(id)
  }, [])
  return (
    <span
      key={event.key}
      className="ambient-supernova"
      style={{ left: `${event.x}vw`, top: `${event.y}vh` }}
    />
  )
}

// Mobile gets a stripped-down ambient: no WebGL shader, no framer-motion
// parallax / pointermove listener, no meteor spawner, no ticker stars,
// no alert pulse interval, no second star layer, fewer stars in the
// remaining layer.
//
// To keep the "wow" factor without burning the GPU we DO render:
//   - .ambient-mobile-aurora: a single tint-reactive radial gradient
//     that slowly drifts (one element, one animation, GPU-composited).
//   - 2 .mobile-comet streaks on staggered CSS keyframes (15s + 22s).
//     Pure CSS, no JS spawner, no setInterval.
//   - A static 12-edge constellation rendered once from current
//     tickers (SVG, no animation).
//   - 4 bright stars with their original twinkle/diffraction-spike
//     chrome (1 keyframe × 4 elements).
function MobileAmbient({ cssVars, tickers }) {
  // Smaller seed-stable star set — 200 vs 600 — to keep box-shadow paint
  // cost cheap on mobile.
  const farStars = useMemo(() => generateStarShadows(200, 7), [])
  // Cap constellation at 12 edges on mobile — desktop runs 60. Reuse the
  // existing edge generator so the lines follow the same intra-state
  // grouping logic (lines only connect tickers of the same range_state).
  const constellation = useMemo(() => constellationEdges(tickers).slice(0, 12), [tickers])

  return (
    <div className="ambient ambient-mobile" aria-hidden="true" style={cssVars}>
      {/* Aurora wash — single element, CSS-only background-position drift.
          Tint is driven by --ambient-dominant (set on the parent), so the
          market mood paints the sky without any JS per-frame work. */}
      <div className="ambient-mobile-aurora" />

      <div
        className="ambient-stars-far"
        style={{ boxShadow: farStars }}
      />

      {/* Sparse constellation — purely decorative, no animation. */}
      {constellation.length > 0 && (
        <svg
          className="ambient-constellation"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {constellation.map(([a, b], i) => {
            const t = STATE_TINTS[a.state] || NEUTRAL
            return (
              <line
                key={i}
                x1={a.pos.x} y1={a.pos.y}
                x2={b.pos.x} y2={b.pos.y}
                stroke={`rgba(${t.r},${t.g},${t.b},0.32)`}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </svg>
      )}

      {BRIGHT_STARS.slice(0, 4).map((s, i) => (
        <span
          key={i}
          className={`ambient-bright-star bright-${s.hue}`}
          style={{ left: `${s.x}vw`, top: `${s.y}vh`, animationDelay: `${i * 0.7}s` }}
        />
      ))}

      {/* Two slow CSS-only comets crossing the sky on long staggered
          cycles. Each is one element with a single transform keyframe
          — vastly cheaper than the desktop spawner (which can have
          12+ live meteors at once driven by setInterval + setState). */}
      <span className="mobile-comet mobile-comet-1" />
      <span className="mobile-comet mobile-comet-2" />

      <div className="ambient-vignette" />
    </div>
  )
}

export function AmbientBackground({ tickers }) {
  const isMobile = useIsMobile()
  const { tint, dominance } = useMemo(() => dominantState(tickers), [tickers])

  const cssVars = {
    '--ambient-dominant': `${tint.r}, ${tint.g}, ${tint.b}`,
    '--ambient-dominance': dominance.toFixed(2),
  }

  // Mobile gets a vastly cheaper ambient (no shader, no parallax, no
  // meteors). The breakpoint hook re-renders when crossing the boundary
  // so rotating to landscape on a tablet swaps in the full version.
  if (isMobile) {
    return <MobileAmbient cssVars={cssVars} tickers={tickers} />
  }

  return <DesktopAmbient tint={tint} dominance={dominance} cssVars={cssVars} tickers={tickers} />
}

function DesktopAmbient({ tint, dominance, cssVars, tickers }) {
  // Star fields are deterministic — generated once, never re-rendered.
  const farStars = useMemo(() => generateStarShadows(600, 7), [])
  const midStars = useMemo(() => generateStarShadows(180, 23), [])

  // Mouse parallax — far stars drift less than mid (depth cue).
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 20 })
  const sy = useSpring(my, { stiffness: 40, damping: 20 })
  const farX = useTransform(sx, [-1, 1], [4, -4])
  const farY = useTransform(sy, [-1, 1], [4, -4])
  const midX = useTransform(sx, [-1, 1], [14, -14])
  const midY = useTransform(sy, [-1, 1], [14, -14])

  useEffect(() => {
    const onMove = (e) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1)
      my.set((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [mx, my])

  return (
    <div className="ambient" aria-hidden="true" style={cssVars}>
      <CosmosShader tint={tint} dominance={dominance} />

      <motion.div
        className="ambient-stars-far"
        style={{ x: farX, y: farY, boxShadow: farStars }}
      />
      <motion.div
        className="ambient-stars-mid"
        style={{ x: midX, y: midY, boxShadow: midStars }}
      />

      {BRIGHT_STARS.map((s, i) => (
        <span
          key={i}
          className={`ambient-bright-star bright-${s.hue}`}
          style={{ left: `${s.x}vw`, top: `${s.y}vh`, animationDelay: `${i * 0.7}s` }}
        />
      ))}

      <Supernova />

      <Starfield tickers={tickers} />
      <AlertPulse tickers={tickers} />

      <CosmicMeteors />

      <div className="ambient-sweep" />
      <div className="ambient-noise" />
      <div className="ambient-vignette" />
    </div>
  )
}
