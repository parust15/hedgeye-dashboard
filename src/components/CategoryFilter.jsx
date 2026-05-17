import { useEffect, useRef, useState } from 'react'

// Popover dropdown that replaces the row of asset-class chips. Behavior
// matches TickerFilter: button → popover with checkboxes + Reset/Clear.
//
// Panel-side semantic: `activeLabels` is the set of category labels the
// user wants visible. An EMPTY set means "show all" — that's how the
// panel's existing filter logic distinguishes "no filter applied" from
// "filter applied with zero matches". We preserve that contract by
// collapsing back to an empty set whenever every category is selected.
//
// Props:
//   options: Array<{ label, count }>
//   activeLabels: Set<string>
//   onChange(nextSet)
export function CategoryFilter({ options, activeLabels, onChange }) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (buttonRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const total = options.length
  const allActive = activeLabels.size === 0
  const selectedCount = allActive ? total : activeLabels.size
  const buttonLabel = allActive
    ? 'Categories (All)'
    : `Categories (${selectedCount}/${total})`

  function toggleLabel(label) {
    // If we're in "all visible" mode (empty set), a click means
    // "uncheck this one" — derive the start set from all labels minus
    // the clicked one. Otherwise normal toggle.
    let next
    if (allActive) {
      next = new Set(options.map((o) => o.label))
      next.delete(label)
    } else {
      next = new Set(activeLabels)
      if (next.has(label)) next.delete(label)
      else next.add(label)
    }
    // Collapse back to "all visible" (empty set) when the user re-
    // selects every category. Keeps the persisted state and the button
    // label honest about whether a filter is actually applied.
    if (next.size === total) next = new Set()
    onChange(next)
  }

  function selectAll() {
    // Empty set === "All" in the panel's filter logic.
    onChange(new Set())
  }

  return (
    <div className="ticker-filter category-filter">
      <button
        ref={buttonRef}
        type="button"
        className={`ticker-filter-btn${!allActive ? ' has-filter' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {!allActive && <span className="ticker-filter-dot" aria-hidden="true" />}
        {buttonLabel}
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="ticker-popover category-popover"
          role="dialog"
          aria-label="Filter categories"
        >
          <div className="ticker-popover-head">
            <div className="ticker-popover-actions ticker-popover-actions-only">
              <button type="button" onClick={selectAll} disabled={allActive}>
                Reset (show all)
              </button>
            </div>
          </div>
          <div className="ticker-popover-body">
            <ul className="ticker-list category-list">
              {options.map((opt) => {
                const checked = allActive || activeLabels.has(opt.label)
                return (
                  <li key={opt.label} className="ticker-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLabel(opt.label)}
                      />
                      <span className="ticker-row-symbol">{opt.label}</span>
                      <span className="category-row-count">{opt.count}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
