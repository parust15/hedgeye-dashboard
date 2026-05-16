// Decorative full-viewport background layer. Three stacked layers:
//   - .ambient::before / .ambient::after — two slow radial-gradient
//     drifts (defined in App.css), 60s/52s cycles.
//   - .ambient-noise — inline SVG fractal-noise tile, mix-blend-mode
//     overlay, ~6% opacity. Adds grainy depth so the gradients don't
//     read as a flat tint.
// The .ambient parent runs a 4s breathing filter (brightness ±2%) so
// the whole layer feels alive even when nothing changes. All animation
// freezes under prefers-reduced-motion via the @media guard in App.css.
export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-noise" />
    </div>
  )
}
