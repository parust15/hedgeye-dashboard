import { describe, it, expect } from 'vitest'
import { parseMacroBullets, truncateAtSentinel } from './macroBullets'

describe('parseMacroBullets', () => {
  it('returns [] for null/undefined/empty', () => {
    expect(parseMacroBullets(null)).toEqual([])
    expect(parseMacroBullets(undefined)).toEqual([])
    expect(parseMacroBullets('')).toEqual([])
    expect(parseMacroBullets(123)).toEqual([])
  })

  it('parses a single-bullet paragraph (no internal separators)', () => {
    expect(parseMacroBullets('* Quad 2 economic setup continues to be validated')).toEqual([
      'Quad 2 economic setup continues to be validated',
    ])
  })

  it('parses multiple bullets separated by " * "', () => {
    const input = '* First bullet here * Second bullet * Third bullet'
    expect(parseMacroBullets(input)).toEqual([
      'First bullet here',
      'Second bullet',
      'Third bullet',
    ])
  })

  it('strips trailing semicolons from each bullet', () => {
    const input = '* First; * Second; * Third'
    expect(parseMacroBullets(input)).toEqual(['First', 'Second', 'Third'])
  })

  it('preserves internal semicolons inside a bullet', () => {
    const input = '* GDP up 3%; CPI up 2%; * Next bullet'
    expect(parseMacroBullets(input)).toEqual(['GDP up 3%; CPI up 2%', 'Next bullet'])
  })

  it('drops empty fragments that arise from leading separators', () => {
    expect(parseMacroBullets(' *  *  * Real bullet')).toEqual(['Real bullet'])
  })
})

describe('truncateAtSentinel', () => {
  it('returns input unchanged for null / undefined / non-string', () => {
    expect(truncateAtSentinel(null)).toBe(null)
    expect(truncateAtSentinel(undefined)).toBe(undefined)
    expect(truncateAtSentinel(42)).toBe(42)
    expect(truncateAtSentinel('')).toBe('')
  })

  it('returns input unchanged when no sentinel is present', () => {
    const text = 'Quad 2 setup intact. Bonds bid, Dollar bid, Gold ripping.'
    expect(truncateAtSentinel(text)).toBe(text)
  })

  it('truncates at "Please visit https://app.hedgeye.com"', () => {
    const text =
      'Real show notes here.\n\nPlease visit https://app.hedgeye.com for more.'
    expect(truncateAtSentinel(text)).toBe('Real show notes here.')
  })

  it('truncates at the © copyright line and tolerates the year', () => {
    const text2026 = 'Body content.\n© 2026 Hedgeye Risk Management, LLC.'
    const text2099 = 'Body content.\n© 2099 Hedgeye Risk Management, LLC.'
    expect(truncateAtSentinel(text2026)).toBe('Body content.')
    expect(truncateAtSentinel(text2099)).toBe('Body content.')
  })

  it('truncates at the "If you believe this has been sent to you in error" line', () => {
    const text =
      'Show notes body.\n\nIf you believe this has been sent to you in error, contact us.'
    expect(truncateAtSentinel(text)).toBe('Show notes body.')
  })

  it('truncates at "[http://url" bracketed-link footers', () => {
    const text = 'Bullet text [http://url.example.com/track/123]'
    expect(truncateAtSentinel(text)).toBe('Bullet text')
  })

  it('cuts at the FIRST sentinel when multiple appear', () => {
    const text =
      'Keep me.\n\nPlease visit https://app.hedgeye.com to unsubscribe.\n© 2026 Hedgeye Risk Management'
    expect(truncateAtSentinel(text)).toBe('Keep me.')
  })

  it('trims trailing whitespace at the cut point', () => {
    const text = 'Body.   \n\n\nPlease visit https://app.hedgeye.com'
    expect(truncateAtSentinel(text)).toBe('Body.')
  })
})
