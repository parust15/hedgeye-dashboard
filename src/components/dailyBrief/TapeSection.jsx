import { SectionShell } from './SectionShell'
import { SectorPerformanceTable } from './SectorPerformanceTable'
import { SpxImpactTable } from './SpxImpactTable'
import { UsdCorrelationsTable } from './UsdCorrelationsTable'
import './dailyBrief.tape.css'

// Section 2 — the Tape. Three stacked market-data tables read top to
// bottom: where capital moved by sector, which names drove the index,
// and how each asset class is leaning against the dollar. Each table
// self-fetches its own Supabase view.
export function TapeSection() {
  return (
    <SectionShell index={2} title="What Changed / Tape">
      <div className="db-tape-stack">
        <SectorPerformanceTable />
        <SpxImpactTable />
        <UsdCorrelationsTable />
      </div>
    </SectionShell>
  )
}
