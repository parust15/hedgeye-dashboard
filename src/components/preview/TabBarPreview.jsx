import { SlidingUnderlineTabs } from './SlidingUnderlineTabs'
import { FrostedPillTabs } from './FrostedPillTabs'
import { ConstellationTabs } from './ConstellationTabs'
import { MercuryBlobTabs } from './MercuryBlobTabs'

// Side-by-side stack of four tab-bar implementations rendered against
// the live cosmos background. Each implementation is a self-contained
// interactive component — clicking tabs only mutates that component's
// internal state, never the real dashboard active-tab.
//
// Routed via ?tabsPreview=1 in App.jsx. Drop the query param to return
// to the live dashboard.

const VARIANTS = [
  {
    title: '01 · SLIDING GLOW UNDERLINE',
    note: 'Thin 2px bar with a soft green halo. Asymmetric stretch (1.15x) during transit.',
    Component: SlidingUnderlineTabs,
  },
  {
    title: '02 · FROSTED PILL',
    note: 'Rounded translucent rectangle with backdrop blur. Softer, bouncier spring.',
    Component: FrostedPillTabs,
  },
  {
    title: '03 · CONSTELLATION TRAVELER',
    note: 'SVG star springs along a dotted constellation line, leaving a comet tail.',
    Component: ConstellationTabs,
  },
  {
    title: '04 · LIQUID MERCURY',
    note: 'Metallic blob with goo filter. Stretches into travel, magnetic on hover.',
    Component: MercuryBlobTabs,
  },
]

export function TabBarPreview() {
  return (
    <div className="tabs-preview">
      <div className="tabs-preview-hint">
        tab preview · remove <code>?tabsPreview=1</code> to return
      </div>

      <div className="tabs-preview-stack">
        {VARIANTS.map(({ title, note, Component }) => (
          <section key={title} className="tabs-preview-block">
            <header className="tabs-preview-block-head">
              <h2 className="tabs-preview-block-title">{title}</h2>
              <p className="tabs-preview-block-note">{note}</p>
            </header>
            <div className="tabs-preview-bar">
              <Component />
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
