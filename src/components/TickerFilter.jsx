import { useEffect, useMemo, useRef, useState } from 'react'
import { buildTickerGroups } from '../lib/categories'

function TickerRow({ row, checked, onToggle }) {
  return (
    <li className="ticker-row">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(row.ticker)}
        />
        <span className="ticker-row-symbol">{row.ticker}</span>
        {row.display_name ? (
          <span className="ticker-row-name">{row.display_name}</span>
        ) : null}
      </label>
    </li>
  )
}

function TickerGroup({
  group,
  collapsed,
  selectedTickers,
  onToggleCollapse,
  onToggleGroupSelect,
  onToggleTicker,
}) {
  const selected = selectedTickers ?? new Set()
  const groupSelected = group.items.filter((r) => selected.has(r.ticker)).length
  const allInGroup = groupSelected === group.items.length

  return (
    <div className="ticker-group">
      <div className="ticker-group-head">
        <button
          type="button"
          className="ticker-group-toggle"
          aria-expanded={!collapsed}
          onClick={() => onToggleCollapse(group.key)}
        >
          <span className={`caret${collapsed ? '' : ' open'}`} aria-hidden="true">▸</span>
          <span className="ticker-group-name">{group.label}</span>
          <span className="ticker-group-count">({group.items.length})</span>
        </button>
        <button
          type="button"
          className="ticker-group-shortcut"
          onClick={() => onToggleGroupSelect(group.items)}
        >
          {allInGroup ? 'Clear' : 'All'}
        </button>
      </div>
      {!collapsed && (
        <ul className="ticker-list">
          {group.items.map((r) => (
            <TickerRow
              key={r.ticker}
              row={r}
              checked={selected.has(r.ticker)}
              onToggle={onToggleTicker}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function TickerFilter({ allTickers, selectedTickers, setSelectedTickers }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())
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

  const groups = useMemo(() => buildTickerGroups(allTickers, search), [allTickers, search])

  const total = allTickers.length
  const selectedCount = selectedTickers
    ? allTickers.reduce((n, r) => (selectedTickers.has(r.ticker) ? n + 1 : n), 0)
    : total
  const allSelected = total > 0 && selectedCount === total
  const buttonLabel = allSelected ? 'Tickers (All)' : `Tickers (${selectedCount}/${total})`

  function toggleTicker(ticker) {
    setSelectedTickers((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }
  function selectAll() {
    setSelectedTickers(new Set(allTickers.map((r) => r.ticker)))
  }
  function clearAll() {
    setSelectedTickers(new Set())
  }
  function toggleGroupCollapse(key) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleGroupSelect(items) {
    setSelectedTickers((prev) => {
      const next = new Set(prev ?? [])
      const allOn = items.every((r) => next.has(r.ticker))
      if (allOn) for (const r of items) next.delete(r.ticker)
      else for (const r of items) next.add(r.ticker)
      return next
    })
  }

  return (
    <div className="ticker-filter">
      <button
        ref={buttonRef}
        type="button"
        className={`ticker-filter-btn${!allSelected ? ' has-filter' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {!allSelected && <span className="ticker-filter-dot" aria-hidden="true" />}
        {buttonLabel}
      </button>
      {open && (
        <div ref={popoverRef} className="ticker-popover" role="dialog" aria-label="Filter tickers">
          <div className="ticker-popover-head">
            <input
              type="search"
              className="ticker-popover-search"
              placeholder="Search tickers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="ticker-popover-actions">
              <button type="button" onClick={selectAll}>Select all</button>
              <button type="button" onClick={clearAll}>Clear</button>
            </div>
          </div>
          <div className="ticker-popover-body">
            {groups.length === 0 && (
              <div className="ticker-popover-empty">No tickers match.</div>
            )}
            {groups.map((g) => (
              <TickerGroup
                key={g.key}
                group={g}
                collapsed={collapsed.has(g.key)}
                selectedTickers={selectedTickers}
                onToggleCollapse={toggleGroupCollapse}
                onToggleGroupSelect={toggleGroupSelect}
                onToggleTicker={toggleTicker}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
