import { formatNextChange } from '../lib/marketState'

export function MarketStatePill({ market }) {
  const open = market.isOpen
  const title = formatNextChange(market)
  return (
    <span
      className={`market-pill ${open ? 'market-open' : 'market-closed'}`}
      title={title}
      aria-label={open ? 'Market open' : 'Market closed'}
    >
      <span className="market-dot" aria-hidden="true" />
      {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
    </span>
  )
}
