// Number/price/time formatters used across the dashboard. Pure functions —
// no React, no DOM — so each is trivially testable.

export function formatNumber(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function formatPrice(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return `$${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// "h:mm AM/PM" in the user's local time zone. Returns null if iso can't
// be parsed so the caller can decide whether to render anything.
export function formatTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Parse an ISO YYYY-MM-DD into both the formatted date label
// ("Mar 6, 2025") AND the integer day count since that date — the two
// derived values every "date added" cell needs. Returns nulls when
// input is missing/malformed so callers can render the muted "—".
//
// Was duplicated verbatim in EtfReRankPanel + SignalStrengthPanel
// before consolidation.
export function parseAdded(isoDate) {
  if (!isoDate) return { dateLabel: null, days: null }
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return { dateLabel: null, days: null }
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / dayMs))
  const dateLabel = then.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return { dateLabel, days }
}
