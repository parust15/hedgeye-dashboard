import { useCallback } from 'react'

// Small <select> + ↑/↓ button used at the top of each panel's card list.
// Switching field resets direction to that field's `defaultDir` (asc/desc);
// the arrow button flips it.
export function SortControl({ fields, field, dir, onChange, ariaLabel }) {
  const handleField = useCallback(
    (e) => {
      const nextField = e.target.value
      const def = fields.find((f) => f.value === nextField)
      onChange(nextField, def?.defaultDir ?? 'asc')
    },
    [fields, onChange]
  )

  const flipDir = useCallback(() => {
    onChange(field, dir === 'asc' ? 'desc' : 'asc')
  }, [field, dir, onChange])

  return (
    <div className="sort-control" role="group" aria-label={ariaLabel ?? 'Sort'}>
      <label className="sort-label">Sort</label>
      <select
        className="sort-select"
        value={field}
        onChange={handleField}
        aria-label={`${ariaLabel ?? 'Sort'} field`}
      >
        {fields.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="sort-dir-btn"
        onClick={flipDir}
        aria-label={`Sort direction (${dir === 'asc' ? 'ascending' : 'descending'})`}
        title={dir === 'asc' ? 'Ascending' : 'Descending'}
      >
        {dir === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  )
}
