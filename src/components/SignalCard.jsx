import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { positionBarFor } from '../lib/range'
import { formatNumber, formatPrice } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import { VixBucketBadge } from './VixBucketPill'
// PositionBar + RangeBarTooltip + PositionBarWithTooltip moved to
// ./PositionBar so II / MOMO / EtfProRow can render the same primitive.
// Re-exported below so any external import of `PositionBarWithTooltip`
// from this file keeps working.
import { PositionBarWithTooltip } from './PositionBar'
export { PositionBarWithTooltip }

// Code-split the recharts-heavy chart so it isn't part of the initial
// bundle — only loaded the first time a user expands a card. ExpandedChart
// is a named export, so we adapt it to the default export shape lazy()
// expects.
const ExpandedChart = lazy(() =>
  import('./ExpandedChart').then((m) => ({ default: m.ExpandedChart }))
)

// Wraps useCountUp + a formatter so the JSX stays declarative. Null /
// non-finite values render as em-dash via formatNumber/formatPrice
// without animating.
function CountUpNumber({ value, format = formatNumber }) {
  const tweened = useCountUp(Number(value))
  return <>{format(tweened)}</>
}

// Map trend to Call's .position-pill chrome so the RR pill uses the same
// CSS rules as Call's PositionTypePill. The label text stays BULLISH/
// BEARISH/NEUTRAL (it's trend data, not portfolio direction) — only the
// chrome unifies.
function trendPillClass(trend) {
  if (trend === 'BULLISH') return 'position-pill position-long'
  if (trend === 'BEARISH') return 'position-pill position-short'
  return 'position-pill position-neutral'
}

// Direction modifier on .cc-head-id wrapper drives the ticker text tint
// via the existing .cc-head-id.direction-X .cc-ticker rule.
function trendDirection(trend) {
  if (trend === 'BULLISH') return 'long'
  if (trend === 'BEARISH') return 'short'
  return 'neutral'
}

function TrendChangeBadge({ change }) {
  if (!change) return null
  const to = change.to_trend
  // FLIPPED badges use the unified .position-pill chrome. Colors match
  // 1-for-1 with the old .flip-* family (the gradients/box-shadows were
  // byte-identical) so this is purely a rename.
  if (to === 'BULLISH') return <span className="position-pill position-long">↑ FLIPPED BULLISH</span>
  if (to === 'BEARISH') return <span className="position-pill position-short">↓ FLIPPED BEARISH</span>
  if (to === 'NEUTRAL') return <span className="position-pill position-neutral">◆ WENT NEUTRAL</span>
  return <span className="position-pill position-neutral">◆ {to}</span>
}

function SetupBadge({ setup }) {
  if (setup === 'LONG') {
    return (
      <span className="setup setup-long">
        <span className="setup-icon" aria-hidden="true">⚡</span> LONG SETUP
      </span>
    )
  }
  if (setup === 'SHORT') {
    return (
      <span className="setup setup-short">
        <span className="setup-icon" aria-hidden="true">🔻</span> SHORT SETUP
      </span>
    )
  }
  return null
}

// Tracks the previous numeric live price via a ref so we can flash the
// price-value tile green on an uptick or red on a downtick for 350ms.
// Initial render and unchanged ticks don't flash.
function useFlashOnChange(value) {
  const prevRef = useRef(null)
  const [flash, setFlash] = useState('')
  useEffect(() => {
    if (!Number.isFinite(value)) return
    const prev = prevRef.current
    prevRef.current = value
    if (prev == null || !Number.isFinite(prev) || prev === value) return
    setFlash(value > prev ? 'flash-up' : 'flash-down')
    const id = setTimeout(() => setFlash(''), 350)
    return () => clearTimeout(id)
  }, [value])
  return flash
}

function LivePriceBlock({ display }) {
  const priceVal = display?.price
  const flash = useFlashOnChange(
    Number.isFinite(priceVal) ? priceVal : null
  )
  if (!display || display.state === 'none') return null
  // Use Call's .cc-price-row / .cc-price classes so the price element
  // on RR is styled by the same CSS rules as Call's LivePriceRow.
  const cls = `cc-price-row cc-price-${display.state}`
  return (
    <div className={cls} aria-label={`Price ${display.timeLabel}`}>
      {display.state === 'live' && <span className="pulse-dot" aria-hidden="true" />}
      <span className={`cc-price ${flash}`}>
        <CountUpNumber value={priceVal} format={formatPrice} />
      </span>
      <span className="cc-price-sep">·</span>
      <span className="cc-price-time">{display.timeLabel}</span>
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

export function SignalCard({
  row,
  change,
  setup,
  display,
  expanded,
  onToggle,
  onViewCall,
  vixBucket,
}) {
  const { markerPct, ghostPct, zone, zoneLabel } = positionBarFor(row, display)

  // Unified ticker-box class set. Risk Range cards use the same
  // .call-card wrapper as Call tab cards so chrome flows through one
  // CSS path. State direction maps to .border-long/short/neutral
  // (setup direction takes priority over raw trend); flipped status
  // maps to .glow-flipped; new-today maps to .glow-added.
  const directionRaw = (setup || row.trend || '').toLowerCase()
  const borderClass =
    directionRaw === 'long' || directionRaw === 'bullish' ? 'border-long' :
    directionRaw === 'short' || directionRaw === 'bearish' ? 'border-short' :
    'border-neutral'
  const cardClasses = [
    'call-card',
    borderClass,
    expanded ? 'expanded' : '',
    change ? 'glow-flipped' : '',
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
      {/* Background chrome layer — absolute-positioned sibling carrying
          bg, border, backdrop-filter, swirl, sheen, and its own opacity
          knob. Content sits above this via z-index. */}
      <div className="card-bg" aria-hidden="true" />
      <header className="cc-head">
        <div className={`cc-head-id direction-${trendDirection(row.trend)}`}>
          <div className="cc-ticker">{row.ticker}</div>
          {row.display_name || row.name ? (
            <div className="cc-name">{row.display_name || row.name}</div>
          ) : null}
        </div>
        {/* Pill + optional VixBucketBadge sit as direct children of
            .cc-head — matches PositionCard's shape so .cc-head's flex
            row aligns pills identically across both tabs. */}
        <span className={trendPillClass(row.trend)}>{row.trend ?? '—'}</span>
        {vixBucket && <VixBucketBadge data={vixBucket} />}
      </header>

      <LivePriceBlock display={display} />

      {(setup || change) && (
        <div className="cc-accent-row">
          <SetupBadge setup={setup} />
          <TrendChangeBadge change={change} />
        </div>
      )}

      <dl className="grid">
        <div>
          <dt>Buy</dt>
          <dd className="buy"><CountUpNumber value={row.buy_trade} /></dd>
        </div>
        <div>
          <dt>Sell</dt>
          <dd className="sell"><CountUpNumber value={row.sell_trade} /></dd>
        </div>
        <div>
          <dt>Prev Close</dt>
          <dd><CountUpNumber value={row.prev_close} /></dd>
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
        <PositionBarWithTooltip
          row={row}
          display={display}
          markerPct={markerPct}
          ghostPct={ghostPct}
          zone={zone}
        />
        <div className="posbar-labels">
          <span className="posbar-end buy"><CountUpNumber value={row.buy_trade} /></span>
          {zoneLabel ? (
            <span className={`zone-tag zone-${zone === 'near-buy' ? 'buy' : 'sell'}`}>
              {zoneLabel}
            </span>
          ) : (
            <span />
          )}
          <span className="posbar-end sell"><CountUpNumber value={row.sell_trade} /></span>
        </div>
      </div>

      {onViewCall && (
        <button
          type="button"
          className="btn-view-call"
          onClick={(e) => {
            // Cross-panel jump — don't let the card-level expand toggle fire too.
            e.stopPropagation()
            onViewCall(row.ticker)
          }}
        >
          ↗ VIEW CALL INFO
        </button>
      )}

      {expanded && (
        <div className="chart-panel" onClick={(e) => e.stopPropagation()}>
          <Suspense
            fallback={<div className="chart-loading" style={{ height: 280 }} />}
          >
            <ExpandedChart ticker={row.ticker} display={display} />
          </Suspense>
        </div>
      )}
    </article>
  )
}
