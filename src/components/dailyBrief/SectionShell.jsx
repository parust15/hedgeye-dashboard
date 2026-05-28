// Reusable wrapper for every Daily Brief section. Gives each section a
// numbered header (the fixed station order), an optional "stated/updated"
// meta slot on the right, and the shared card chrome (the `.card-bg`
// sibling layer the rest of the dashboard uses for tunable transparency).
//
// Adding a future section = one new component that renders inside a
// <SectionShell> + one line in DailyBrief.jsx. No refactor.
export function SectionShell({ index, title, meta, children, className = '' }) {
  return (
    <section className={`db-section${className ? ` ${className}` : ''}`}>
      <div className="card-bg" aria-hidden="true" />
      <header className="db-section-head">
        <div className="db-section-title">
          {index != null && <span className="db-section-index">{index}</span>}
          <h2>{title}</h2>
        </div>
        {meta != null && <div className="db-section-meta">{meta}</div>}
      </header>
      <div className="db-section-body">{children}</div>
    </section>
  )
}
