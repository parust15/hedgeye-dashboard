// Bias pill. Color carries direction (green=bullish, red=bearish,
// grey=neutral). Text carries timeframe (TREND, TRADE, TAIL). A single
// ticker can stack multiple pills side-by-side (e.g. TREND BULLISH +
// TRADE BEARISH = countertrend bounce) — see MomoTrackerPanel.
//
// This generalizes the bespoke BiasChip pattern that grew up inside
// MomoTrackerPanel. Promoted to a shared primitive so RR, The Call,
// EtfProPlus, Investing Ideas can render the same chip without
// duplicating the tone-mapping logic.
//
// Filter chips (the ALL / BULLISH / BEARISH filter ribbons) DO NOT
// use this component — they intentionally show the direction word
// because they describe what's being filtered. Bias chips, by
// contrast, describe a ticker's current state, where color alone
// communicates direction.

// Closed set of supported timeframes — replaces the freeform
// "anything-stringly-typed-works" fallback that earlier callers
// relied on. New timeframes need to be added here AND to the
// TIMEFRAME_LABEL map below.
const TIMEFRAME_LABEL = {
  trend: 'TREND',
  trade: 'TRADE',
  tail:  'TAIL',
}

export function BiasTimeframePill({ timeframe, bias, size = 'md' }) {
  if (!bias) return null
  const label = TIMEFRAME_LABEL[timeframe]
  if (!label) {
    // Dev-only nudge — production callers should always use a known
    // timeframe. Render nothing rather than a stringly-typed mystery
    // label so the visual is "this slot is empty, fix the call site"
    // instead of "TYPO showing as the label".
    if (import.meta.env.DEV) {
      console.warn(`BiasTimeframePill: unknown timeframe "${timeframe}"`)
    }
    return null
  }
  const b = String(bias).toUpperCase()
  // Normalize position language (LONG/SHORT) and signal language
  // (BULLISH/BEARISH) to one tone, since the chip's purpose is
  // direction-via-color, not which vocab the source view uses.
  const tone =
    b === 'BULLISH' || b === 'LONG'
      ? 'tt-bias-pos'
      : b === 'BEARISH' || b === 'SHORT'
        ? 'tt-bias-neg'
        : 'tt-bias-neutral'
  // Tooltip + aria-label restore the bias word for hover / screen
  // readers — color alone isn't accessible.
  const fullLabel = `${label}: ${b}`
  return (
    <span
      className={`tt-bias tt-bias-labeled ${tone} size-${size}`}
      title={fullLabel}
      aria-label={fullLabel}
    >
      {label}
    </span>
  )
}
