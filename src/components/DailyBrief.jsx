import { MacroRegimeSection } from './dailyBrief/MacroRegimeSection'
import { TapeSection } from './dailyBrief/TapeSection'
import { BattersBoxSection } from './dailyBrief/BattersBoxSection'

// The master morning page — a fixed, ordered stack of decision-layer
// sections. Each section owns its own data fetch. Adding a future tier
// is: build one section component, drop one line in the stack below.
export function DailyBrief() {
  return (
    <div className="panel daily-brief">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Daily Brief</h1>
          <p className="sub">Your morning run sheet — read top to bottom.</p>
        </div>
      </header>

      <div className="db-stack">
        <MacroRegimeSection />
        <TapeSection />
        <BattersBoxSection />
      </div>
    </div>
  )
}
