// Top-level tab bar: RISK RANGES | THE CALL.
// Active tab persists across reloads via localStorage.

const TABS = [
  { id: 'risk-ranges', label: 'RISK RANGES', accent: 'green' },
  { id: 'the-call', label: 'THE CALL', accent: 'amber' },
]

export function TopTabs({ active, onChange }) {
  return (
    <nav className="top-tabs" role="tablist" aria-label="Dashboard">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={active === t.id}
          className={`top-tab top-tab-${t.accent}${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
