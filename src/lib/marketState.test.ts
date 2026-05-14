import { describe, it, expect } from 'vitest'
import { getMarketState, formatNextChange } from './marketState'

// Note: all dates below are interpreted in the ET wall-clock by the implementation.
// We pass UTC instants and rely on the function's internal Intl.DateTimeFormat
// conversion to find the right ET hours.

describe('getMarketState', () => {
  it('is open on a weekday at 10:00 AM ET', () => {
    // 2026-05-13 is a Wednesday. 10:00 AM EDT = 14:00 UTC.
    const result = getMarketState(new Date('2026-05-13T14:00:00Z'))
    expect(result.isOpen).toBe(true)
    expect(result.label).toBe('open')
  })

  it('is closed on a weekday at 8:00 AM ET (premarket)', () => {
    // 2026-05-13 08:00 EDT = 12:00 UTC.
    const result = getMarketState(new Date('2026-05-13T12:00:00Z'))
    expect(result.isOpen).toBe(false)
  })

  it('is closed on a weekday at 5:00 PM ET (after hours)', () => {
    // 2026-05-13 17:00 EDT = 21:00 UTC.
    const result = getMarketState(new Date('2026-05-13T21:00:00Z'))
    expect(result.isOpen).toBe(false)
  })

  it('is closed on a Saturday', () => {
    // 2026-05-16 is a Saturday. 11:00 EDT = 15:00 UTC.
    const result = getMarketState(new Date('2026-05-16T15:00:00Z'))
    expect(result.isOpen).toBe(false)
  })

  it('is closed on a holiday (Memorial Day 2026 = May 25)', () => {
    // 2026-05-25 11:00 EDT = 15:00 UTC.
    const result = getMarketState(new Date('2026-05-25T15:00:00Z'))
    expect(result.isOpen).toBe(false)
  })

  it('nextChange points to today 4:00 PM ET when open', () => {
    const result = getMarketState(new Date('2026-05-13T14:00:00Z'))
    expect(result.isOpen).toBe(true)
    // 4:00 PM EDT = 20:00 UTC
    expect(result.nextChange.toISOString()).toBe('2026-05-13T20:00:00.000Z')
  })

  it('nextChange points to next trading-day 9:30 AM ET when closed', () => {
    // Friday after close → Monday open.
    const result = getMarketState(new Date('2026-05-15T22:00:00Z'))
    expect(result.isOpen).toBe(false)
    // Monday 2026-05-18 09:30 EDT = 13:30 UTC.
    expect(result.nextChange.toISOString()).toBe('2026-05-18T13:30:00.000Z')
  })

  it('skips holidays when computing next open', () => {
    // Memorial Day weekend: Friday 2026-05-22 after close → Tuesday 2026-05-26 open.
    const result = getMarketState(new Date('2026-05-22T22:00:00Z'))
    expect(result.isOpen).toBe(false)
    // Tuesday 2026-05-26 09:30 EDT = 13:30 UTC.
    expect(result.nextChange.toISOString()).toBe('2026-05-26T13:30:00.000Z')
  })
})

describe('formatNextChange', () => {
  it('describes a close when open', () => {
    const now = new Date('2026-05-13T14:00:00Z')
    const state = getMarketState(now)
    expect(formatNextChange(state, now)).toBe('Closes 4:00 PM ET')
  })

  it('describes a same-day open when closed earlier in the day', () => {
    const now = new Date('2026-05-13T12:00:00Z') // 8 AM ET
    const state = getMarketState(now)
    expect(formatNextChange(state, now)).toBe('Opens 9:30 AM ET')
  })

  it('describes a future-day open when closed after market hours', () => {
    const now = new Date('2026-05-13T22:00:00Z') // 6 PM ET Wed
    const state = getMarketState(now)
    expect(formatNextChange(state, now)).toMatch(/Opens 9:30 AM ET Thu/)
  })
})
