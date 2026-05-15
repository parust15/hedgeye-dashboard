// Sector display helpers shared between The Call's Today (grouped) view
// and All Time view. The underlying view has some inconsistent naming
// ("Restaurants" vs "Restaurants & Cannabis"; "Telecom-Media Policy" vs
// "Telecom & Media Policy") which is preserved as-is — these are
// separate sectors in the source data, not duplicates we should silently
// collapse.

export const OTHER_SECTOR = 'Other'

// Per-spec abbreviations for long sector names that don't fit a chip.
const SECTOR_ABBREV = {
  'Macro, Housing, Digital Assets & Financials': 'Macro & Fin.',
  'Communications & Software': 'Comms & Tech',
  'Global Technology': 'Technology',
  'Healthcare Policy': 'HC Policy',
  'Telecom-Media Policy': 'Telecom',
  'Restaurants & Cannabis': 'Restaurants',
  'Industrials & Materials': 'Industrials',
}

// Return the canonical display name for a sector. Treats null / empty /
// "Unknown" as the Other catch-all so the UI shows one bucket instead of
// two (null group + "Unknown" group).
export function canonicalSector(raw) {
  if (raw == null) return OTHER_SECTOR
  const trimmed = String(raw).trim()
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return OTHER_SECTOR
  return trimmed
}

// Compact name for a sector chip. Maps the known long ones via the
// abbreviation table, otherwise truncates at 18 chars with ellipsis.
export function abbreviateSector(raw) {
  const canon = canonicalSector(raw)
  if (SECTOR_ABBREV[canon]) return SECTOR_ABBREV[canon]
  if (canon.length <= 18) return canon
  return canon.slice(0, 17) + '…'
}

// Group call tickers by sector for the TickerFilter dropdown. Mirrors
// the shape of buildTickerGroups (from lib/categories.js) so it slots in
// as a drop-in override on the same TickerFilter component.
//
// Each item gets `display_name` mapped from `company_name` so TickerRow
// can render it the same way it renders RR's display_name.
//
// Sectors are sorted alphabetically; the Other catch-all is pinned last.
// Items within each sector sort by ticker.
export function buildCallTickerGroups(allTickers, searchQuery) {
  const bySector = new Map()
  for (const r of allTickers) {
    const sector = canonicalSector(r.sector)
    if (!bySector.has(sector)) bySector.set(sector, [])
    bySector.get(sector).push({
      ticker: r.ticker,
      // Truncate long company names so they fit the popover row.
      display_name: r.company_name ?? '',
    })
  }
  for (const arr of bySector.values()) {
    arr.sort((a, b) => (a.ticker ?? '').localeCompare(b.ticker ?? ''))
  }

  const q = (searchQuery ?? '').trim().toLowerCase()
  function matches(r) {
    if (!q) return true
    return (
      (r.ticker ?? '').toLowerCase().includes(q) ||
      (r.display_name ?? '').toLowerCase().includes(q)
    )
  }

  const sectors = [...bySector.keys()].sort((a, b) => {
    if (a === OTHER_SECTOR) return 1
    if (b === OTHER_SECTOR) return -1
    return a.localeCompare(b)
  })

  const out = []
  for (const sector of sectors) {
    const items = bySector.get(sector).filter(matches)
    if (items.length === 0) continue
    out.push({ key: sector, label: sector, items })
  }
  return out
}
