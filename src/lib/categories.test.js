import { describe, it, expect } from 'vitest'
import { labelFor, buildTickerGroups, CATEGORY_ORDER } from './categories'

describe('labelFor', () => {
  it('uses display label for us_sectors/fx/vol', () => {
    expect(labelFor('us_sectors')).toBe('Sectors')
    expect(labelFor('fx')).toBe('FX')
    expect(labelFor('vol')).toBe('Vol')
  })

  it('title-cases unrecognized categories', () => {
    expect(labelFor('stocks')).toBe('Stocks')
    expect(labelFor('international')).toBe('International')
  })

  it('returns Uncategorized for null/empty', () => {
    expect(labelFor(null)).toBe('Uncategorized')
    expect(labelFor('')).toBe('Uncategorized')
    expect(labelFor(undefined)).toBe('Uncategorized')
  })
})

describe('buildTickerGroups', () => {
  const tickers = [
    { ticker: 'AAPL', display_name: 'Apple', category: 'stocks' },
    { ticker: 'MSFT', display_name: 'Microsoft', category: 'stocks' },
    { ticker: 'XLI', display_name: 'Industrials', category: 'us_sectors' },
    { ticker: 'BITCOIN', display_name: 'Bitcoin', category: 'crypto' },
    { ticker: 'WEIRD', display_name: 'Unknown thing', category: null },
  ]

  it('groups by category and orders per CATEGORY_ORDER', () => {
    const groups = buildTickerGroups(tickers, '')
    const keys = groups.map((g) => g.key)
    // CATEGORY_ORDER puts stocks before us_sectors before crypto
    expect(keys).toEqual(['stocks', 'us_sectors', 'crypto', '__uncat__'])
  })

  it('sorts within each group alphabetically by ticker', () => {
    const groups = buildTickerGroups(tickers, '')
    const stocks = groups.find((g) => g.key === 'stocks')
    expect(stocks.items.map((r) => r.ticker)).toEqual(['AAPL', 'MSFT'])
  })

  it('filters by search across ticker and display_name (case-insensitive)', () => {
    const groups = buildTickerGroups(tickers, 'apple')
    expect(groups.flatMap((g) => g.items.map((r) => r.ticker))).toEqual(['AAPL'])

    const groupsByTicker = buildTickerGroups(tickers, 'msft')
    expect(groupsByTicker.flatMap((g) => g.items.map((r) => r.ticker))).toEqual(['MSFT'])
  })

  it('drops groups with no matches after search', () => {
    const groups = buildTickerGroups(tickers, 'industrials')
    expect(groups.map((g) => g.key)).toEqual(['us_sectors'])
  })

  it('returns empty array when nothing matches', () => {
    expect(buildTickerGroups(tickers, 'zzzz')).toEqual([])
  })

  it('puts uncategorized rows in a trailing __uncat__ group', () => {
    const groups = buildTickerGroups(tickers, '')
    const uncat = groups.find((g) => g.key === '__uncat__')
    expect(uncat).toBeDefined()
    expect(uncat.label).toBe('Uncategorized')
    expect(uncat.items.map((r) => r.ticker)).toEqual(['WEIRD'])
  })

  it('preserves all expected categories in the order constant', () => {
    expect(CATEGORY_ORDER).toContain('stocks')
    expect(CATEGORY_ORDER).toContain('us_sectors')
    expect(CATEGORY_ORDER.indexOf('stocks')).toBeLessThan(CATEGORY_ORDER.indexOf('vol'))
  })
})
