import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RangeStateBadge } from './RangeStateBadge'
import { RANGE_STATES, RANGE_STATE_TOKEN } from '../lib/rangeState'

// Badge contract: text is the state string, color (via --state-rgb)
// comes from the canonical token table. Single source of truth.

describe('RangeStateBadge', () => {
  it('renders an em-dash when state is missing', () => {
    render(<RangeStateBadge state={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('—')).toHaveClass('state-empty')
  })

  it('renders the unknown state as the empty variant', () => {
    render(<RangeStateBadge state="GARBAGE" />)
    const el = screen.getByText('GARBAGE')
    expect(el).toHaveClass('state-empty')
  })

  it.each(RANGE_STATES)('renders %s with token-derived --state-rgb', (state) => {
    render(<RangeStateBadge state={state} />)
    const el = screen.getByText(state)
    const token = RANGE_STATE_TOKEN[state]
    // Inline style carries the CSS custom property.
    expect(el.style.getPropertyValue('--state-rgb')).toBe(token.rgb)
    // The token's label is the tooltip — single source of truth for
    // both color AND the human-readable label means they can't drift.
    expect(el).toHaveAttribute('title', token.label)
  })

  it('emits the slug-normalized state class for per-state opt-in tweaks', () => {
    render(<RangeStateBadge state="HH/HL" />)
    expect(screen.getByText('HH/HL')).toHaveClass('state-hh-hl')
  })

  it.each(['sm', 'md'])('applies the %s size class', (size) => {
    render(<RangeStateBadge state="HH/HL" size={size} />)
    expect(screen.getByText('HH/HL')).toHaveClass(`size-${size}`)
  })
})
