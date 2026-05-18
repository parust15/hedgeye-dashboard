// Coerce a Supabase jsonb column into an array, tolerating null, plain
// arrays, JSON-encoded strings, and malformed payloads. Returns []
// for anything that can't be parsed into an array.
//
// supabase-js parses jsonb to arrays automatically, but we defensively
// handle the string case too so a future driver/schema shift doesn't
// silently break us.
export function readJsonbArray(value) {
  let arr = value
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr)
    } catch {
      return []
    }
  }
  return Array.isArray(arr) ? arr : []
}

// readJsonbArray filtered to non-empty strings — for `string[]` columns
// (Macro Show synthesis bullets, day TL;DR bullets, ETF info bullets).
export function readJsonbStringArray(value) {
  return readJsonbArray(value).filter(
    (b) => typeof b === 'string' && b.trim().length > 0
  )
}
