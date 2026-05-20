import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TickerDetailModal } from './TickerDetailModal'

// Mock the Supabase-backed hooks so the modal renders synchronously
// against deterministic empty data — these tests cover the body
// SELECTION logic (payload present vs absent), not data fetching.
vi.mock('../lib/useTickerDetail', () => ({
  useTickerDetail: () => ({ notes: [], top5History: [], status: 'ready' }),
}))
vi.mock('../lib/useTickerSummary', () => ({
  useTickerSummary: () => ({ summary: null }),
}))

const onClose = vi.fn()
const onJumpTab = vi.fn()

beforeEach(() => {
  onClose.mockClear()
  onJumpTab.mockClear()
})

describe('TickerDetailModal', () => {
  it('renders nothing when focus is null', () => {
    const { container } = render(
      <TickerDetailModal focus={null} onClose={onClose} onJumpTab={onJumpTab} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  describe('peek mode (no payload)', () => {
    it('renders the cross-tab peek body when focus has no payload', () => {
      render(
        <TickerDetailModal
          focus={{ ticker: 'NVDA', source: 'momo', payload: null }}
          onClose={onClose}
          onJumpTab={onJumpTab}
        />
      )
      // Ticker as heading
      expect(screen.getByRole('heading', { name: 'NVDA' })).toBeInTheDocument()
      // CrossLevelPeek tiles render (7 of 8 — the source tab is omitted)
      const tiles = screen.getAllByRole('button').filter((b) => b.className.includes('peek-tile'))
      expect(tiles).toHaveLength(7)
      // The MOMO source tab should NOT appear since user is "already here"
      expect(screen.queryByText(/^MOMO$/)).not.toBeInTheDocument()
    })

    it('does NOT render the legacy CALL INFO overlay in peek mode', () => {
      render(
        <TickerDetailModal
          focus={{ ticker: 'NVDA', source: 'momo', payload: null }}
          onClose={onClose}
        />
      )
      expect(screen.queryByText(/CALL INFO/)).not.toBeInTheDocument()
    })
  })

  describe('legacy mode (payload present)', () => {
    const RR_FOCUS = {
      ticker: 'AAPL',
      source: 'risk-ranges',
      payload: {
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        position_type: 'LONG',
        conviction_score: 50,
        signal_date: '2026-05-19',
        consecutive_days: 12,
        top5_appearances_90d: 3,
      },
    }

    it('renders the call-info body (company name, position pill) when payload is present', () => {
      render(<TickerDetailModal focus={RR_FOCUS} onClose={onClose} />)
      expect(screen.getByRole('heading', { name: 'Apple Inc.' })).toBeInTheDocument()
      expect(screen.getByText('[AAPL]')).toBeInTheDocument()
      // Position pill with LONG content survives.
      expect(screen.getByText('LONG')).toBeInTheDocument()
    })

    it('shows the CALL INFO overlay label when source is risk-ranges', () => {
      render(<TickerDetailModal focus={RR_FOCUS} onClose={onClose} />)
      // The overlay element itself carries an aria-label so we can
      // pluck it directly without colliding with the other AAPL
      // occurrences in the body (modal-ticker `[AAPL]` etc.).
      const overlay = document.querySelector('.modal-source-label')
      expect(overlay).toBeInTheDocument()
      expect(overlay).toHaveTextContent('CALL INFO — AAPL')
    })

    it('does NOT show the CALL INFO overlay when source is the-call', () => {
      const callFocus = { ...RR_FOCUS, source: 'the-call' }
      render(<TickerDetailModal focus={callFocus} onClose={onClose} />)
      expect(screen.queryByText(/CALL INFO/)).not.toBeInTheDocument()
    })

    it('does NOT render the peek body when payload is present', () => {
      render(<TickerDetailModal focus={RR_FOCUS} onClose={onClose} />)
      expect(document.querySelector('.cross-level-peek')).toBeNull()
    })
  })
})
