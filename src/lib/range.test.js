import { describe, it, expect } from 'vitest'
import {
  rangePct,
  priceInRangePct,
  numCmp,
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

describe('priceInRangePct (field-name override)', () => {
  // II + MOMO use low_end/top_end/prev_close on their rows; the override
  // contract is what lets them share the canonical helper instead of
  // copy-pasting their own. Test covers the shim MOMO/II pass to PositionBar.
  it('honors lowKey/highKey overrides', () => {
    const row = { low_end: 200, top_end: 240, prev_close: 220 }
    expect(priceInRangePct(row, { lowKey: 'low_end', highKey: 'top_end' })).toBe(0.5)
  })

  it('honors all three field overrides', () => {
    const row = { lo: 100, hi: 200, px: 175 }
    expect(
      priceInRangePct(row, { lowKey: 'lo', highKey: 'hi', priceKey: 'px' })
    ).toBe(0.75)
  })

  it('falls back to buy_trade/sell_trade/prev_close defaults', () => {
    const row = { buy_trade: 100, sell_trade: 110, prev_close: 105 }
    expect(priceInRangePct(row)).toBeCloseTo(0.5)
  })

  it('returns null when an overridden field is null (CLAUDE.md footgun guard)', () => {
    const row = { low_end: 200, top_end: 240, prev_close: null }
    expect(priceInRangePct(row, { lowKey: 'low_end', highKey: 'top_end' })).toBeNull()
  })

  it('rangePct(row) === priceInRangePct(row) for the default field set', () => {
    // Identity invariant: rangePct is now an alias for the canonical helper.
    // Identical input must produce identical output for every signal-shaped row.
    const cases = [
      { buy_trade: 100, sell_trade: 110, prev_close: 105 },
      { buy_trade: 100, sell_trade: 110, prev_close: 100 },
      { buy_trade: 100, sell_trade: 110, prev_close: 90 },
      { buy_trade: null, sell_trade: 110, prev_close: 105 },
      { buy_trade: 100, sell_trade: 100, prev_close: 100 },
    ]
    for (const row of cases) {
      expect(rangePct(row)).toEqual(priceInRangePct(row))
    }
  })
})

describe('numCmp', () => {
  // Generic nulls-last comparator used by every sort dropdown.
  // Direction applies only to the number comparison; nulls always
  // sort to the bottom regardless of asc/desc.
  it('asc orders finite numbers low → high', () => {
    expect([3, 1, 2].sort((a, b) => numCmp(a, b, 'asc'))).toEqual([1, 2, 3])
  })

  it('desc orders finite numbers high → low', () => {
    expect([3, 1, 2].sort((a, b) => numCmp(a, b, 'desc'))).toEqual([3, 2, 1])
  })

  it.each(['asc', 'desc'])('sinks null/undefined to the bottom (%s)', (dir) => {
    const out = [1, null, 2, undefined, 3].sort((a, b) => numCmp(a, b, dir))
    // Finite values rank first per direction; null/undefined trail.
    const finite = out.slice(0, 3)
    expect(finite.every((v) => v == null)).toBe(false)
    expect(out.slice(3).every((v) => v == null)).toBe(true)
  })

  it.each(['asc', 'desc'])('sinks non-finite (NaN, Infinity) (%s)', (dir) => {
    const out = [1, NaN, 2, Infinity, 3].sort((a, b) => numCmp(a, b, dir))
    expect(out.slice(0, 3).every(Number.isFinite)).toBe(true)
    expect(out.slice(3).some((v) => !Number.isFinite(v))).toBe(true)
  })

  it('returns 0 when both args are nullish', () => {
    expect(numCmp(null, undefined, 'asc')).toBe(0)
    expect(numCmp(undefined, null, 'desc')).toBe(0)
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
