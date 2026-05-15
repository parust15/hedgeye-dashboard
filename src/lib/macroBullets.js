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
