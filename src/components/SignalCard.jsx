import { positionBarFor } from '../lib/range'
import { formatNumber, formatPrice } from '../lib/format'
import { ExpandedChart } from './ExpandedChart'

function trendClass(trend) {
  if (trend === 'BULLISH') return 'trend bullish'
  if (trend === 'BEARISH') return 'trend bearish'
  return 'trend neutral'
}

function PositionBar({ markerPct, ghostPct, zone }) {
  if (markerPct == null) {
    return <div className="posbar disabled" aria-hidden="true" />
  }
  const clamped = Math.max(0, Math.min(1, markerPct))
  const ghost = ghostPct != null ? Math.max(0, Math.min(1, ghostPct)) : null
  return (
    <div className={`posbar ${zone ?? 'mid'}`}>
      <div className="posbar-track" />
      {ghost !== null && (
        <div
          className="posbar-ghost"
          style={{ left: `${ghost * 100}%` }}
          aria-hidden="true"
        />
      )}
      <div
        className="posbar-marker"
        style={{ left: `${clamped * 100}%` }}
        aria-label={`Position ${(clamped * 100).toFixed(0)}% of range`}
      />
    </div>
  )
}

function TrendChangeBadge({ change }) {
  if (!change) return null
  const to = change.to_trend
  if (to === 'BULLISH') return <span className="flip flip-bull">↑ FLIPPED BULLISH</span>
  if (to === 'BEARISH') return <span className="flip flip-bear">↓ FLIPPED BEARISH</span>
  if (to === 'NEUTRAL') return <span className="flip flip-neutral">◆ WENT NEUTRAL</span>
  return <span className="flip flip-neutral">◆ {to}</span>
}

function SetupBadge({ setup }) {
  if (setup === 'LONG') return <span className="setup setup-long">⚡ LONG SETUP</span>
  if (setup === 'SHORT') return <span className="setup setup-short">🔻 SHORT SETUP</span>
  return null
}

function LivePriceBlock({ display }) {
  if (!display || display.state === 'none') return null
  const cls = `price-block price-${display.state}`
  return (
    <div className={cls} aria-label={`Price ${display.timeLabel}`}>
      {display.state === 'live' && <span className="pulse-dot" aria-hidden="true" />}
      <span className="price-value">{formatPrice(display.price)}</span>
      <span className="price-sep">·</span>
      <span className="price-time">{display.timeLabel}</span>
    </div>
  )
}

function WidthDeltaPct({ row }) {
  if (row.prev_trr == null) return null
  if (row.prev_lrr == null) return null
  const wd = Number(row.width_delta)
  const prevTrr = Number(row.prev_trr)
  const prevLrr = Number(row.prev_lrr)
  if (!Number.isFinite(wd) || !Number.isFinite(prevTrr) || !Number.isFinite(prevLrr)) return null
  const prevWidth = prevTrr - prevLrr
  if (prevWidth === 0) return null
  const pct = (wd / prevWidth) * 100
  const rounded = Math.abs(pct).toFixed(1)
  if (rounded === '0.0') return null
  const sign = pct > 0 ? '+' : '−'
  const cls = pct > 0 ? 'width-pct widening' : 'width-pct narrowing'
  return <span className={cls}>{sign}{rounded}%</span>
}

export function SignalCard({ row, change, setup, display, expanded, onToggle }) {
  const { markerPct, ghostPct, zone, zoneLabel } = positionBarFor(row, display)

  const cardClasses = [
    'card',
    expanded ? 'expanded' : '',
    change ? 'flipped' : '',
    setup ? `has-setup setup-${setup.toLowerCase()}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      className={cardClasses}
      onClick={() => onToggle(row.ticker)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(row.ticker)
        }
      }}
    >
      <header className="card-head">
        <div className="card-id">
          <div className="ticker">{row.ticker}</div>
          {row.display_name || row.name ? (
            <div className="name">{row.display_name || row.name}</div>
          ) : null}
        </div>
        <span className={trendClass(row.trend)}>{row.trend ?? '—'}</span>
      </header>

      <LivePriceBlock display={display} />

      {(setup || change) && (
        <div className="badge-row">
          <SetupBadge setup={setup} />
          <TrendChangeBadge change={change} />
        </div>
      )}

      <dl className="grid">
        <div>
          <dt>Buy</dt>
          <dd className="buy">{formatNumber(row.buy_trade)}</dd>
        </div>
        <div>
          <dt>Sell</dt>
          <dd className="sell">{formatNumber(row.sell_trade)}</dd>
        </div>
        <div>
          <dt>Prev Close</dt>
          <dd>{formatNumber(row.prev_close)}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd className="range-state">
            {row.range_state ?? '—'}
            <WidthDeltaPct row={row} />
          </dd>
        </div>
      </dl>

      <div className="posbar-section">
        <PositionBar markerPct={markerPct} ghostPct={ghostPct} zone={zone} />
        <div className="posbar-labels">
          <span className="posbar-end buy">{formatNumber(row.buy_trade)}</span>
          {zoneLabel ? (
            <span className={`zone-tag zone-${zone === 'near-buy' ? 'buy' : 'sell'}`}>
              {zoneLabel}
            </span>
          ) : (
            <span />
          )}
          <span className="posbar-end sell">{formatNumber(row.sell_trade)}</span>
        </div>
      </div>

      {expanded && (
        <div className="chart-panel" onClick={(e) => e.stopPropagation()}>
          <ExpandedChart ticker={row.ticker} display={display} />
        </div>
      )}
    </article>
  )
}
