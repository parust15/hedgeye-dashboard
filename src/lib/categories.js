// Category metadata for chips + the ticker filter dropdown. Display labels
// override the raw column values where the natural casing differs.

const CATEGORY_LABELS = {
  us_sectors: 'Sectors',
  fx: 'FX',
  vol: 'Vol',
}

// Display order for category groupings (matches both the chip row and the
// ticker dropdown). Categories not in this list still render — they just
// sort to the end via labelFor's case-pass-through.
export const CATEGORY_ORDER = [
  'stocks',
  'us_sectors',
  'indices',
  'international',
  'rates',
  'fx',
  'commodities',
  'energy',
  'crypto',
  'vol',
]

export function labelFor(category) {
  if (!category) return 'Uncategorized'
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]
  return category.charAt(0).toUpperCase() + category.slice(1)
}

// Group all tickers by category, ordered per CATEGORY_ORDER, with each list
// filtered by the popover search query. Empty groups are dropped.
// Uncategorized rows (no `category` value) get their own trailing group.
export function buildTickerGroups(allTickers, searchQuery) {
  const byCat = new Map()
  for (const r of allTickers) {
    const cat = r.category || '__uncat__'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(r)
  }
  for (const arr of byCat.values()) {
    arr.sort((a, b) => a.ticker.localeCompare(b.ticker))
  }

  const q = (searchQuery ?? '').trim().toLowerCase()
  function matches(r) {
    if (!q) return true
    return (
      (r.ticker ?? '').toLowerCase().includes(q) ||
      (r.display_name ?? '').toLowerCase().includes(q)
    )
  }

  const out = []
  for (const cat of CATEGORY_ORDER) {
    if (!byCat.has(cat)) continue
    const items = byCat.get(cat).filter(matches)
    if (items.length === 0) continue
    out.push({ key: cat, label: labelFor(cat), items })
  }
  if (byCat.has('__uncat__')) {
    const items = byCat.get('__uncat__').filter(matches)
    if (items.length > 0) {
      out.push({ key: '__uncat__', label: 'Uncategorized', items })
    }
  }
  return out
}
