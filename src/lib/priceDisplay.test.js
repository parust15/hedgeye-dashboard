import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getPriceDisplay } from './priceDisplay'

const FRESH_QUOTED = '2026-05-14T14:30:00Z'
const STALE_QUOTED = '2026-05-14T14:00:00Z' // 30 min before NOW
const NOW = new Date('2026-05-14T14:30:00Z').getTime()

const signalRow = { buy_trade: 100, sell_trade: 110 }

describe('getPriceDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns state=none when no live price exists', () => {
    const result = getPriceDisplay(signalRow, undefined, true)
    expect(result.state).toBe('none')
    expect(result.price).toBeNull()
    expect(result.livePct).toBeNull()
    expect(result.timeLabel).toBe('')
  })

  it('returns state=live when market open + quote is fresh', () => {
    const live = { current_price: 105, quoted_at: FRESH_QUOTED }
    const result = getPriceDisplay(signalRow, live, true)
    expect(result.state).toBe('live')
    expect(result.price).toBe(105)
    expect(result.livePct).toBeCloseTo(0.5)
    expect(result.timeLabel).toMatch(/ET$/)
  })

  it('returns state=stale when market open but quote >15min old', () => {
    const live = { current_price: 105, quoted_at: '2026-05-14T13:00:00Z' } // 90 min ago
    const result = getPriceDisplay(signalRow, live, true)
    expect(result.state).toBe('stale')
    expect(result.timeLabel).toMatch(/^Last:/)
  })

  it('returns state=closed when market is not open (regardless of freshness)', () => {
    const live = { current_price: 105, quoted_at: FRESH_QUOTED }
    const result = getPriceDisplay(signalRow, live, false)
    expect(result.state).toBe('closed')
    expect(result.timeLabel).toBe('Close · 4:00 PM')
  })

  it('clamps livePct to [0, 1]', () => {
    const above = { current_price: 200, quoted_at: FRESH_QUOTED }
    expect(getPriceDisplay(signalRow, above, true).livePct).toBe(1)

    const below = { current_price: 50, quoted_at: FRESH_QUOTED }
    expect(getPriceDisplay(signalRow, below, true).livePct).toBe(0)
  })

  it('returns null livePct when buy === sell', () => {
    const row = { buy_trade: 100, sell_trade: 100 }
    const live = { current_price: 100, quoted_at: FRESH_QUOTED }
    expect(getPriceDisplay(row, live, true).livePct).toBeNull()
  })

  // Suppress reference to STALE_QUOTED warning — kept for self-documenting test data.
  void STALE_QUOTED
})
