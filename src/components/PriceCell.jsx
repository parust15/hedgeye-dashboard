import { formatPrice } from '../lib/format'

// Shared per-row live-price cell for II + ETF Pro Plus (Change 5).
//   - state 'live' / 'stale' → render live price; faint freshness tone
//   - state 'closed' or 'none' / no live data → fall back to prev_close
// Title attribute holds "Live X · prev Y · HH:MM ET" for hover context.
//
// The cell tones (`tt-price-live` / `tt-price-stale`) let CSS render a
// subtle freshness affordance without claiming a whole extra column.
//
// Header-chip helpers (formatQuoteTime, quoteChip) live in
// ../lib/quoteFresh — they're non-component utilities and would trip
// Vite's react-refresh "components-only export" rule if co-located.
export function PriceCell({ prevClose, display }) {
  if (!display || display.state === 'none') {
    return <span className="tt-price">{formatPrice(prevClose)}</span>
  }
  const live = Number.isFinite(display.price) ? display.price : null
  if (live == null) {
    return <span className="tt-price">{formatPrice(prevClose)}</span>
  }
  const cls =
    display.state === 'live'
      ? 'tt-price tt-price-live'
      : display.state === 'stale'
        ? 'tt-price tt-price-stale'
        : 'tt-price'
  const tip =
    `Live ${formatPrice(live)} · prev ${formatPrice(prevClose)}` +
    (display.timeLabel ? ` · ${display.timeLabel}` : '')
  return (
    <span className={cls} title={tip}>
      {formatPrice(live)}
    </span>
  )
}
