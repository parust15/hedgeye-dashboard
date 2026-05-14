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
