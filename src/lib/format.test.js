import { describe, it, expect } from 'vitest'
import { formatNumber, formatPrice, formatTime } from './format'

describe('formatNumber', () => {
  it('formats with at most 2 decimals + thousands separator', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57')
    expect(formatNumber(0.1)).toBe('0.1')
    expect(formatNumber(100)).toBe('100')
  })

  it('returns "—" for null, undefined, or NaN', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(NaN)).toBe('—')
    expect(formatNumber('not a number')).toBe('—')
  })

  it('coerces numeric strings', () => {
    expect(formatNumber('42.5')).toBe('42.5')
  })
})

describe('formatPrice', () => {
  it('always shows 2 decimals + $ prefix', () => {
    expect(formatPrice(1234.5)).toBe('$1,234.50')
    expect(formatPrice(0.7)).toBe('$0.70')
    expect(formatPrice(100)).toBe('$100.00')
  })

  it('returns "—" for invalid values', () => {
    expect(formatPrice(null)).toBe('—')
    expect(formatPrice(NaN)).toBe('—')
  })
})

describe('formatTime', () => {
  it('returns null for null/undefined/empty', () => {
    expect(formatTime(null)).toBeNull()
    expect(formatTime(undefined)).toBeNull()
    expect(formatTime('')).toBeNull()
  })

  it('returns null for unparseable timestamps', () => {
    expect(formatTime('not a date')).toBeNull()
  })

  it('returns a formatted time string for valid ISO', () => {
    const result = formatTime('2026-05-14T14:30:00Z')
    expect(result).toMatch(/\d{1,2}:\d{2}\s(AM|PM)/)
  })
})
