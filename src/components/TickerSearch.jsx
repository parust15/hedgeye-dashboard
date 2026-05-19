import { useCallback } from 'react'

// Lightweight inline text input for filtering a tabular panel by
// ticker (and optionally any other text field the consumer wants
// to match against). Lives next to the SortControl on panels with
// modest row counts (9–72) where the multi-select TickerFilter
// popover would be overkill.
//
// Controlled component — caller owns the search string and decides
// what to filter against.
export function TickerSearch({ value, onChange, placeholder = 'Search ticker…', ariaLabel }) {
  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Escape' && value) {
        e.preventDefault()
        onChange('')
      }
    },
    [value, onChange]
  )

  return (
    <div className="ticker-search" role="search">
      <input
        type="search"
        className="ticker-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        aria-label={ariaLabel ?? 'Search ticker'}
        spellCheck={false}
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="ticker-search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear"
        >
          ×
        </button>
      )}
    </div>
  )
}
