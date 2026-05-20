// Shared panel-header primitive. NOT yet wired into existing panels —
// each panel's <header className="topbar"> stays as-is until a follow-up
// pass replaces them, so the primitive landing doesn't ripple visual
// changes through 8 surfaces in one diff.
//
// kicker = small all-caps tag above the title (e.g. "DAILY QUICKREAD")
// title  = the main heading
// sub    = optional descriptor / metadata line
// right  = optional right-side content (e.g. SortControl + filter chips)
// level  = which heading tag to use (defaults h1; sub-panel headers may
//          want h2 for outline correctness)
export function PanelHeading({ level = 1, kicker, title, sub, right }) {
  const Tag = `h${level}`
  return (
    <header className="panel-heading">
      <div className="panel-heading-left">
        {kicker && <span className="panel-heading-kicker">{kicker}</span>}
        <Tag className={`panel-heading-title level-${level}`}>{title}</Tag>
        {sub && <p className="panel-heading-sub">{sub}</p>}
      </div>
      {right && <div className="panel-heading-right">{right}</div>}
    </header>
  )
}
