import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BiasTimeframePill } from './BiasTimeframePill'

// Pill's contract: color carries direction, text carries timeframe.
// LONG/SHORT (position vocab) and BULLISH/BEARISH (signal vocab) both
// map to the same tone — that's the whole point of normalization, so
// callers don't have to convert vocabularies at the call site.

describe('BiasTimeframePill', () => {
  it('renders nothing when bias is null', () => {
    const { container } = render(<BiasTimeframePill timeframe="trend" bias={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when bias is undefined', () => {
    const { container } = render(<BiasTimeframePill timeframe="trend" bias={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['BULLISH', 'tt-bias-pos'],
    ['bullish', 'tt-bias-pos'],
    ['LONG', 'tt-bias-pos'],
    ['long', 'tt-bias-pos'],
  ])('normalizes %s to the positive tone', (bias, expectedTone) => {
    render(<BiasTimeframePill timeframe="trend" bias={bias} />)
    const pill = screen.getByText('TREND')
    expect(pill).toHaveClass(expectedTone)
  })

  it.each([
    ['BEARISH', 'tt-bias-neg'],
    ['bearish', 'tt-bias-neg'],
    ['SHORT', 'tt-bias-neg'],
    ['short', 'tt-bias-neg'],
  ])('normalizes %s to the negative tone', (bias, expectedTone) => {
    render(<BiasTimeframePill timeframe="trend" bias={bias} />)
    const pill = screen.getByText('TREND')
    expect(pill).toHaveClass(expectedTone)
  })

  it.each(['NEUTRAL', 'neutral', 'anything-else', 'mixed'])(
    'maps %s to the neutral tone',
    (bias) => {
      render(<BiasTimeframePill timeframe="trend" bias={bias} />)
      const pill = screen.getByText('TREND')
      expect(pill).toHaveClass('tt-bias-neutral')
    }
  )

  it('uses the timeframe arg as visible label text', () => {
    const { rerender } = render(<BiasTimeframePill timeframe="trend" bias="BULLISH" />)
    expect(screen.getByText('TREND')).toBeInTheDocument()
    rerender(<BiasTimeframePill timeframe="trade" bias="BULLISH" />)
    expect(screen.getByText('TRADE')).toBeInTheDocument()
    rerender(<BiasTimeframePill timeframe="tail" bias="BULLISH" />)
    expect(screen.getByText('TAIL')).toBeInTheDocument()
  })

  it('renders only the timeframe label, NOT the bias word', () => {
    // Color carries direction; the bias word would be redundant
    // inside a green/red pill. Critical invariant — the cleanup
    // commit dropped exactly this text to make this assertion true.
    render(<BiasTimeframePill timeframe="trend" bias="BULLISH" />)
    expect(screen.queryByText(/BULLISH/i)).not.toBeInTheDocument()
  })

  it('exposes the full label via title + aria-label for a11y', () => {
    render(<BiasTimeframePill timeframe="trade" bias="BEARISH" />)
    const pill = screen.getByText('TRADE')
    expect(pill).toHaveAttribute('title', 'TRADE: BEARISH')
    expect(pill).toHaveAttribute('aria-label', 'TRADE: BEARISH')
  })

  it.each(['sm', 'md', 'lg'])('applies the %s size class', (size) => {
    render(<BiasTimeframePill timeframe="trend" bias="BULLISH" size={size} />)
    expect(screen.getByText('TREND')).toHaveClass(`size-${size}`)
  })
})
