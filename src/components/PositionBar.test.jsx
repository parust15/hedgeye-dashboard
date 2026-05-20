import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PositionBar } from './PositionBar'

// PositionBar contract: given a markerPct (already computed by the
// caller via priceInRangePct or display.livePct), it positions the
// marker dot at `left: ${pct * 100}%` and clamps out-of-range values
// to [0, 1]. Disabled when markerPct is null.

const ROW = { buy_trade: 100, sell_trade: 110, prev_close: 105 }

describe('PositionBar', () => {
  it('renders the disabled track when markerPct is null', () => {
    const { container } = render(<PositionBar row={ROW} display={null} markerPct={null} />)
    const bar = container.querySelector('.posbar')
    expect(bar).toHaveClass('disabled')
    expect(container.querySelector('.posbar-marker')).toBeNull()
  })

  it.each([
    [0, '0%'],
    [0.5, '50%'],
    [1, '100%'],
    [0.4123, '41.23%'],
  ])('positions marker at %s of range', (pct, expectedLeft) => {
    const { container } = render(<PositionBar row={ROW} display={null} markerPct={pct} />)
    const marker = container.querySelector('.posbar-marker')
    expect(marker).not.toBeNull()
    expect(marker.style.left).toBe(expectedLeft)
  })

  it.each([
    [-0.5, '0%'],   // below range clamps to 0%
    [1.7, '100%'],  // above range clamps to 100%
  ])('clamps out-of-range %s to %s', (raw, expectedLeft) => {
    const { container } = render(<PositionBar row={ROW} display={null} markerPct={raw} />)
    expect(container.querySelector('.posbar-marker').style.left).toBe(expectedLeft)
  })

  it('exposes the position pct via aria-label for screen readers', () => {
    const { container } = render(<PositionBar row={ROW} display={null} markerPct={0.83} />)
    const marker = container.querySelector('.posbar-marker')
    expect(marker).toHaveAttribute('aria-label', 'Position 83% of range')
  })

  it('renders a live-pulse marker when display.state is live', () => {
    const display = { state: 'live', livePct: 0.5, price: 105 }
    const { container } = render(
      <PositionBar row={ROW} display={display} markerPct={0.5} />
    )
    expect(container.querySelector('.posbar-marker')).toHaveClass('live-pulse')
  })
})
