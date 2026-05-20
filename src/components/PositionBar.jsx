import { useRef, useState } from 'react'
import {
  rangePct,
  hasLivePrice,
  LONG_SETUP_PCT,
  SHORT_SETUP_PCT,
} from '../lib/range'
import { formatNumber, formatPrice } from '../lib/format'

// Position-in-range bar + cursor-tracking tooltip. Extracted from
// SignalCard.jsx without behavior changes so II / MOMO / EtfProRow
// can render the same visual primitive. SignalCard.jsx re-exports
// `PositionBarWithTooltip` from this file to keep its public surface
// unchanged.

// Minimum visible width for the prev_close→live_price connector. Below
// 0.05% of bar width, the segment is shorter than the marker itself and
// just looks like noise — skip it.
const MIN_CONNECTOR_FRAC = 0.0005

export function PositionBar({ row, display, markerPct, ghostPct, zone }) {
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
export function RangeBarTooltip({ row, display, x, y }) {
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
// above without flickering on vertical mouse jitter.
export function PositionBarWithTooltip({ row, display, markerPct, ghostPct, zone }) {
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
