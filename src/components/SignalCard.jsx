import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  positionBarFor,
  rangePct,
  hasLivePrice,
  LONG_SETUP_PCT,
  SHORT_SETUP_PCT,
} from '../lib/range'
import { formatNumber, formatPrice } from '../lib/format'
import { VixBucketBadge } from './VixBucketPill'

// Code-split the recharts-heavy chart so it isn't part of the initial
// bundle — only loaded the first time a user expands a card. ExpandedChart
// is a named export, so we adapt it to the default export shape lazy()
// expects.
const ExpandedChart = lazy(() =>
  import('./ExpandedChart').then((m) => ({ default: m.ExpandedChart }))
)

function trendClass(trend) {
  if (trend === 'BULLISH') return 'trend bullish'
  if (trend === 'BEARISH') return 'trend bearish'
  return 'trend neutral'
}

// Minimum visible width for the prev_close→live_price connector. Below
// 0.05% of bar width, the segment is shorter than the marker itself and
// just looks like noise — skip it.
const MIN_CONNECTOR_FRAC = 0.0005

function PositionBar({ row, display, markerPct, ghostPct, zone }) {
  if (markerPct == null) {
    return <div className="posbar disabled" aria-hidden="true" />
  }
  const clamped = Math.max(0, Math.min(1, markerPct))
  const ghost = ghostPct != null ? Math.max(0, Math.min(1, ghostPct)) : null
  const state = display?.state ?? 'none'
  const livePct = display?.livePct ?? null
  const useLive = hasLivePrice(display)

  // Connector from prev_close → live_price. Skip when essentially flat.
  let connector = null
  if ((useLive || state === 'stale') && livePct != null) {
    const prevPct = rangePct(row)
    if (prevPct != null) {
      const lo = Math.max(0, Math.min(prevPct, livePct))
      const hi = Math.min(1, Math.max(prevPct, livePct))
      if (hi - lo >= MIN_CONNECTOR_FRAC) {
        const color =
          livePct > prevPct
            ? 'rgba(34, 197, 94, 0.85)'  // up move
            : 'rgba(239, 68, 68, 0.85)'  // down move
        connector = {
          left: lo * 100,
          width: (hi - lo) * 100,
          color,
          stale: state === 'stale',
        }
      }
    }
  }

  // Smart-color dot based on livePct's setup-zone position (0.20 / 0.80).
  // Note: distinct from the `zone` class (which uses 0.05 / 0.95 for the
  // NEAR BUY / NEAR SELL tags above the bar).
  const markerClasses = ['posbar-marker']
  if (livePct != null) {
    if (livePct < LONG_SETUP_PCT) markerClasses.push('marker-long')
    else if (livePct > SHORT_SETUP_PCT) markerClasses.push('marker-short')
  }
  if (state === 'live') markerClasses.push('live-pulse')

  return (
    <div className={`posbar ${zone ?? 'mid'}`}>
      <div className="posbar-track" />
      {connector && (
        <div
          className={`posbar-connector${connector.stale ? ' stale' : ''}`}
          style={{
            left: `${connector.left}%`,
            width: `${connector.width}%`,
            background: connector.color,
          }}
          aria-hidden="true"
        />
      )}
      {ghost !== null && (
        <div
          className="posbar-ghost"
          style={{ left: `${ghost * 100}%` }}
          aria-hidden="true"
        />
      )}
      <div
        className={markerClasses.join(' ')}
        style={{ left: `${clamped * 100}%` }}
        aria-label={`Position ${(clamped * 100).toFixed(0)}% of range`}
      />
    </div>
  )
}

// Tooltip content for the position-in-range bar. Mirrors the chart tooltip
// styling and content — same dark surface, same per-row label/value grid.
function RangeBarTooltip({ row, display, x, y }) {
  const state = display?.state ?? 'none'
  const liveRowLabel =
    state === 'live' ? 'Live'
    : state === 'closed' ? 'Close'
    : state === 'stale' ? 'Last'
    : null

  const prevPct = rangePct(row)
  const livePct = display?.livePct ?? null
  const useLive = hasLivePrice(display)
  const effectivePct = useLive ? livePct : prevPct
  const positionText =
    effectivePct != null
      ? `${Math.round(Math.max(0, Math.min(1, effectivePct)) * 100)}% of range`
      : '—'

  // Pull the "HH:mm ET" suffix out of timeLabel for live/stale rows. closed
  // doesn't carry quoted_at — the spec example shows time only for live/stale.
  let liveValue = formatPrice(display?.price)
  if ((state === 'live' || state === 'stale') && display?.timeLabel) {
    const m = display.timeLabel.match(/(\d{1,2}:\d{2}\s*ET)/)
    if (m) liveValue = `${liveValue} · ${m[1]}`
  }

  // Anchor bottom-center of the tooltip to (x, y - 8px above bar).
  const style = {
    left: `${x}px`,
    top: `${y - 8}px`,
    transform: 'translate(-50%, -100%)',
  }

  return (
    <div className="range-tooltip" style={style} role="tooltip">
      <div className="range-tooltip-head">
        {row.ticker}
        {row.signal_date ? ` · ${row.signal_date}` : ''}
      </div>
      <div className="range-tooltip-row buy">
        <span>LRR (buy)</span>
        <span>{formatNumber(row.buy_trade)}</span>
      </div>
      {liveRowLabel && (
        <div className={`range-tooltip-row${state === 'stale' ? ' stale' : ''}`}>
          <span>{liveRowLabel}</span>
          <span>{liveValue}</span>
        </div>
      )}
      <div className="range-tooltip-row">
        <span>Prev close</span>
        <span>{formatNumber(row.prev_close)}</span>
      </div>
      <div className="range-tooltip-row sell">
        <span>TRR (sell)</span>
        <span>{formatNumber(row.sell_trade)}</span>
      </div>
      <div className="range-tooltip-row">
        <span>Position</span>
        <span>{positionText}</span>
      </div>
    </div>
  )
}

// Wraps PositionBar with cursor-tracking hover behavior. Tooltip x follows
// the cursor; y is anchored to the top of the bar wrap so the tooltip sits
// just above the bar regardless of where in the wrap the cursor is.
function PositionBarWithTooltip({ row, display, markerPct, ghostPct, zone }) {
  const wrapRef = useRef(null)
  const [tooltipPos, setTooltipPos] = useState(null)

  function updatePos(e) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltipPos({ x: e.clientX, y: rect.top })
  }

  return (
    <div
      ref={wrapRef}
      className="posbar-wrap"
      onMouseEnter={updatePos}
      onMouseMove={updatePos}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <PositionBar
        row={row}
        display={display}
        markerPct={markerPct}
        ghostPct={ghostPct}
        zone={zone}
      />
      {tooltipPos && (
        <RangeBarTooltip
          row={row}
          display={display}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}
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
  const cls = `price-block price-${display.state}`
  return (
    <div className={cls} aria-label={`Price ${display.timeLabel}`}>
      {display.state === 'live' && <span className="pulse-dot" aria-hidden="true" />}
      <span className={`price-value ${flash}`}>{formatPrice(priceVal)}</span>
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
        <div className="card-head-badges">
          <span className={trendClass(row.trend)}>{row.trend ?? '—'}</span>
          {vixBucket && <VixBucketBadge data={vixBucket} />}
        </div>
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
        <PositionBarWithTooltip
          row={row}
          display={display}
          markerPct={markerPct}
          ghostPct={ghostPct}
          zone={zone}
        />
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
