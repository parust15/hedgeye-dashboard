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
