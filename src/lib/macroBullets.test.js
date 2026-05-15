import { describe, it, expect } from 'vitest'
import { parseMacroBullets } from './macroBullets'

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
