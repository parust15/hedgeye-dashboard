import { useEffect, useRef, useState } from 'react'

// Popover dropdown that replaces the row of asset-class chips. Behavior
// matches TickerFilter: button → popover with checkboxes + Select all /
// Deselect all.
//
// Panel contract for `activeLabels`:
//   - null              → "no filter applied", panel shows all rows
//   - Set<string>       → explicit selection; panel shows only rows whose
//                         category label is in the Set. An empty Set is
//                         an EXPLICIT "show nothing" — distinct from null.
// This split is what lets "Deselect all" mean something different from
// "Select all": the old single-empty-set contract conflated the two.
//
// Buttons:
//   - Select all   → onChange(null)
//   - Deselect all → onChange(new Set())
//
// Props:
//   options: Array<{ label, count }>
//   activeLabels: null | Set<string>
//   onChange(next: null | Set<string>)
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
  // `activeLabels === null` is the "all visible" mode (no filter). The
  // size check below is only safe once we've established it's not null.
  const allMode = activeLabels === null
  const selectedCount = allMode ? total : activeLabels.size
  const buttonLabel = allMode
    ? 'Categories (All)'
    : `Categories (${selectedCount}/${total})`

  function toggleLabel(label) {
    // If we're in "all visible" mode (null), a click means "uncheck
    // this one" — derive the start set from all labels minus the
    // clicked one. Otherwise normal toggle on the existing Set.
    let next
    if (allMode) {
      next = new Set(options.map((o) => o.label))
      next.delete(label)
    } else {
      next = new Set(activeLabels)
      if (next.has(label)) next.delete(label)
      else next.add(label)
    }
    // Collapse back to "all visible" (null) when the user re-selects
    // every category. Keeps the button label and panel behavior honest
    // about whether a filter is actually applied.
    if (next.size === total) {
      onChange(null)
      return
    }
    onChange(next)
  }

  function selectAll() {
    // null === "All (no filter applied)" in the panel's filter logic.
    onChange(null)
  }

  function deselectAll() {
    // Explicit empty Set === "show nothing". Distinct from null.
    onChange(new Set())
  }

  return (
    <div className="ticker-filter category-filter">
      <button
        ref={buttonRef}
        type="button"
        className={`ticker-filter-btn${!allMode ? ' has-filter' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {!allMode && <span className="ticker-filter-dot" aria-hidden="true" />}
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
            <div className="ticker-popover-actions">
              <button type="button" onClick={selectAll} disabled={allMode}>
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                disabled={!allMode && activeLabels.size === 0}
              >
                Deselect all
              </button>
            </div>
          </div>
          <div className="ticker-popover-body">
            <ul className="ticker-list category-list">
              {options.map((opt) => {
                const checked = allMode || activeLabels.has(opt.label)
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
