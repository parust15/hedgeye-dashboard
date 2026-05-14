const STALE_MS = 15 * 60 * 1000

function fmtEtHHMM(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Decide how to render the live price block for a card.
 * @param signalRow  hedgeye_signals_v row (must have buy_trade, sell_trade)
 * @param livePrice  live_prices row for this ticker, or undefined
 * @param isMarketOpen  boolean from getMarketState
 * @returns { state, price, livePct, timeLabel }
 */
export function getPriceDisplay(signalRow, livePrice, isMarketOpen) {
  if (!livePrice) {
    return { state: 'none', price: null, livePct: null, timeLabel: '' }
  }

  const price = Number(livePrice.current_price)
  const buy = Number(signalRow?.buy_trade)
  const sell = Number(signalRow?.sell_trade)
  let livePct = null
  if (Number.isFinite(price) && Number.isFinite(buy) && Number.isFinite(sell) && sell !== buy) {
    const raw = (price - buy) / (sell - buy)
    livePct = Math.max(0, Math.min(1, raw))
  }

  const quotedMs = livePrice.quoted_at ? Date.parse(livePrice.quoted_at) : NaN
  const ageMs = Number.isFinite(quotedMs) ? Date.now() - quotedMs : Infinity

  if (isMarketOpen) {
    if (ageMs > STALE_MS) {
      return {
        state: 'stale',
        price: Number.isFinite(price) ? price : null,
        livePct,
        timeLabel: `Last: ${fmtEtHHMM(livePrice.quoted_at)} ET`,
      }
    }
    return {
      state: 'live',
      price: Number.isFinite(price) ? price : null,
      livePct,
      timeLabel: `${fmtEtHHMM(livePrice.quoted_at)} ET`,
    }
  }
  return {
    state: 'closed',
    price: Number.isFinite(price) ? price : null,
    livePct,
    timeLabel: 'Close · 4:00 PM',
  }
}
