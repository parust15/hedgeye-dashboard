// Shorten Hedgeye's verbose asset-class labels for display. Applied at
// the display boundary in both the ETF Re-Rank and ETF Pro Plus panels
// so the UI shows the shortened form everywhere a user might see it.
//
// The underlying value in the database stays unchanged — we map both
// "Emerging Market Equities" and "Emerging Markets Equities" (Hedgeye
// has used both spellings) to the single "Emerging Markets" label,
// and "International Equities" to "International".
//
// Returns the input unchanged when it doesn't match a known pattern so
// new asset classes flow through automatically.
export function shortenAssetClass(raw) {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  switch (trimmed) {
    case 'Emerging Market Equities':
    case 'Emerging Markets Equities':
      return 'Emerging Markets'
    case 'International Equities':
      return 'International'
    default:
      return trimmed
  }
}
