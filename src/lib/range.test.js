import { describe, it, expect } from 'vitest'
import {
  rangePct,
  effectivePct,
  hasLivePrice,
  getSetup,
  positionBarFor,
} from './range'

describe('rangePct', () => {
  it('returns 0.5 when prev_close is the midpoint', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 110, prev_close: 105 })).toBeCloseTo(0.5)
  })

  it('returns 0 when prev_close equals buy_trade', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 110, prev_close: 100 })).toBe(0)
  })

  it('returns 1 when prev_close equals sell_trade', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 110, prev_close: 110 })).toBe(1)
  })

  it('returns null when buy_trade === sell_trade (zero span)', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 100, prev_close: 100 })).toBeNull()
  })

  it('returns null when any field is missing', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 110 })).toBeNull()
    expect(rangePct({ buy_trade: null, sell_trade: 110, prev_close: 105 })).toBeNull()
  })

  it('allows out-of-range values (un-clamped)', () => {
    expect(rangePct({ buy_trade: 100, sell_trade: 110, prev_close: 90 })).toBe(-1)
    expect(rangePct({ buy_trade: 100, sell_trade: 110, prev_close: 120 })).toBe(2)
  })
})

describe('effectivePct', () => {
  const row = { buy_trade: 100, sell_trade: 110, prev_close: 105 }

  it('returns live pct when display has a valid livePct', () => {
    expect(effectivePct(row, { livePct: 0.3 })).toBe(0.3)
  })

  it('returns live pct even when livePct is 0 (not falsy)', () => {
    expect(effectivePct(row, { livePct: 0 })).toBe(0)
  })

  it('falls back to rangePct when display is null', () => {
    expect(effectivePct(row, null)).toBeCloseTo(0.5)
  })

  it('falls back to rangePct when livePct is undefined', () => {
    expect(effectivePct(row, { state: 'none' })).toBeCloseTo(0.5)
  })
})

describe('hasLivePrice', () => {
  it('true for live state with livePct', () => {
    expect(hasLivePrice({ state: 'live', livePct: 0.5 })).toBe(true)
  })
  it('true for closed state with livePct', () => {
    expect(hasLivePrice({ state: 'closed', livePct: 0.5 })).toBe(true)
  })
  it('false for stale state even with livePct', () => {
    expect(hasLivePrice({ state: 'stale', livePct: 0.5 })).toBe(false)
  })
  it('false for none state', () => {
    expect(hasLivePrice({ state: 'none', livePct: null })).toBe(false)
  })
  it('false when display is null', () => {
    expect(hasLivePrice(null)).toBe(false)
  })
})

describe('getSetup', () => {
  it('returns LONG for BULLISH trend with pct < 0.20', () => {
    const row = { trend: 'BULLISH', buy_trade: 100, sell_trade: 110, prev_close: 101 }
    expect(getSetup(row, null)).toBe('LONG')
  })

  it('returns null for BULLISH trend at pct = 0.20 (not strictly less)', () => {
    const row = { trend: 'BULLISH', buy_trade: 100, sell_trade: 110, prev_close: 102 }
    expect(getSetup(row, null)).toBeNull()
  })

  it('returns SHORT for BEARISH trend with pct > 0.80', () => {
    const row = { trend: 'BEARISH', buy_trade: 100, sell_trade: 110, prev_close: 109 }
    expect(getSetup(row, null)).toBe('SHORT')
  })

  it('returns null for NEUTRAL trend regardless of pct', () => {
    const row = { trend: 'NEUTRAL', buy_trade: 100, sell_trade: 110, prev_close: 101 }
    expect(getSetup(row, null)).toBeNull()
  })

  it('uses live pct over prev_close pct when available', () => {
    // prev_close pct would be 0.5 (no setup); live pct 0.05 triggers LONG.
    const row = { trend: 'BULLISH', buy_trade: 100, sell_trade: 110, prev_close: 105 }
    expect(getSetup(row, { state: 'live', livePct: 0.05 })).toBe('LONG')
  })

  it('returns null when pct is uncomputable', () => {
    const row = { trend: 'BULLISH', buy_trade: 100, sell_trade: 100, prev_close: 100 }
    expect(getSetup(row, null)).toBeNull()
  })
})

describe('positionBarFor', () => {
  const row = { buy_trade: 100, sell_trade: 110, prev_close: 105 }

  it('uses prev pct and wide thresholds when no live price', () => {
    const result = positionBarFor(row, null)
    expect(result.markerPct).toBeCloseTo(0.5)
    expect(result.ghostPct).toBeNull()
    expect(result.zone).toBe('mid')
    expect(result.zoneLabel).toBeNull()
  })

  it('classifies near-buy with fallback threshold (0.20)', () => {
    const lowRow = { buy_trade: 100, sell_trade: 110, prev_close: 101 }
    const result = positionBarFor(lowRow, null)
    expect(result.zone).toBe('near-buy')
    expect(result.zoneLabel).toBe('Near buy')
  })

  it('classifies near-sell with fallback threshold (0.80)', () => {
    const highRow = { buy_trade: 100, sell_trade: 110, prev_close: 109 }
    const result = positionBarFor(highRow, null)
    expect(result.zone).toBe('near-sell')
    expect(result.zoneLabel).toBe('Near sell')
  })

  it('uses live pct as marker and prev pct as ghost when live', () => {
    const display = { state: 'live', livePct: 0.1 }
    const result = positionBarFor(row, display)
    expect(result.markerPct).toBe(0.1)
    expect(result.ghostPct).toBeCloseTo(0.5)
  })

  it('uses tight live threshold (0.05) for near-buy classification', () => {
    // pct 0.10 would be "near buy" under fallback (<0.20) but mid under live (<0.05)
    const result = positionBarFor(row, { state: 'live', livePct: 0.10 })
    expect(result.zone).toBe('mid')
  })

  it('returns null marker when row data is missing', () => {
    const result = positionBarFor({ buy_trade: null, sell_trade: 110, prev_close: 105 }, null)
    expect(result.markerPct).toBeNull()
    expect(result.zone).toBe('mid')
  })
})
