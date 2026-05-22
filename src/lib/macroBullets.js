/**
 * Parses Hedgeye's macro commentary string into a list of bullets.
 *
 * The source field stores bullets in a single string, separated by " * ".
 * The first bullet usually starts with "* " (no leading space) because it's
 * at the start of the string. Some older entries terminate each bullet
 * with a semicolon. We tolerate both.
 *
 * Returns [] for null / undefined / empty input.
 */
export function parseMacroBullets(commentary) {
  if (!commentary || typeof commentary !== 'string') return []
  return commentary
    .split(' * ')
    .map((s) =>
      s
        // First bullet often retains its leading "* " — strip.
        .replace(/^\*\s+/, '')
        // Some entries end each bullet with ; and a trailing space.
        .replace(/[;\s]+$/, '')
        .trim()
    )
    .filter((s) => s.length > 0)
}

// Defense-in-depth: backend parser already strips Hedgeye email
// footers, but old rows / future ingestion bugs could let one slip
// through. The render layer truncates at the first occurrence of
// any sentinel below — keeps a stray "Please visit https://app.
// hedgeye.com" or "© 2026 Hedgeye Risk Management" line from
// trailing the actual show notes.
//
// Year-tolerant on the © line; case-sensitive otherwise (the
// sentinels are quoted verbatim from Hedgeye's outgoing template).
const SENTINEL_PATTERNS = [
  /Please visit https:\/\/app\.hedgeye\.com/,
  /©\s*\d{4}\s*Hedgeye Risk Management/,
  /If you believe this has been sent to you in error/,
  /\[http:\/\/url/,
]

export function truncateAtSentinel(text) {
  if (!text || typeof text !== 'string') return text
  let cutAt = text.length
  for (const re of SENTINEL_PATTERNS) {
    const m = re.exec(text)
    if (m && m.index < cutAt) cutAt = m.index
  }
  return cutAt < text.length ? text.slice(0, cutAt).trimEnd() : text
}
