// Generic system-state chrome — outline pill with status dot, label,
// and value. Mirrors the construction of the VIX header pill and the
// MarketStatePill so every metadata surface on the dashboard speaks
// the same visual language.
//
// Usage:
//   <StatusChip label="Signal date" value="2026-05-15" />
//   <StatusChip label="Updated" value="9:39 AM" tone="live" />
//   <StatusChip label="Call data as of" value="9:39 AM ET" tone="stale" />
//
// `tone` keys the dot color: idle (grey) | live (green) | stale (amber)
// | closed (dim). `dot={false}` suppresses the dot entirely.
export function StatusChip({
  label,
  value,
  tone = 'idle',
  dot = true,
  title,
  className = '',
}) {
  if (value == null && !label) return null
  return (
    <span
      className={`status-chip status-chip-${tone}${className ? ` ${className}` : ''}`}
      title={title}
    >
      {dot && <span className="status-chip-dot" aria-hidden="true" />}
      {label && <span className="status-chip-label">{label}</span>}
      {value != null && <span className="status-chip-value">{value}</span>}
    </span>
  )
}
