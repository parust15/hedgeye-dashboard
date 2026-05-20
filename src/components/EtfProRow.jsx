import { formatPrice } from '../lib/format'
import { LABEL } from '../lib/labels'
import { BiasTimeframePill } from './BiasTimeframePill'
import { PositionBarWithTooltip } from './PositionBar'

// Row component for ETF Pro Plus. Mirrors the SS / II / MOMO row
// pattern (single .rerank-row li with grid layout) so the panel reads
// as a list, not a tile grid.
//
// EtfProPlusPanel transforms its source rows via toSignalRow() before
// sorting / rendering — we consume that SignalCard-shaped row here so
// the existing sort + filter logic stays untouched:
//
//   row.trend       ← original direction (BULLISH | BEARISH)
//   row.category    ← original asset_class (already shortened by the
//                     panel via shortenAssetClass)
//   row.prev_close  ← recent_price (snapshot price)
//   row.buy_trade   ← trend_range_low (LRR)
//   row.sell_trade  ← trend_range_high (TRR)
//   row.range_state ← null (no source column; see UNVERIFIED #6)
//
// PositionBar's tooltip already expects buy_trade / sell_trade /
// prev_close, so we pass row through directly — no shim needed.

function markerPct(row) {
  if (row.prev_close == null || row.buy_trade == null || row.sell_trade == null) {
    return null
  }
  const px = Number(row.prev_close)
  const lo = Number(row.buy_trade)
  const hi = Number(row.sell_trade)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  return (px - lo) / span
}

function rowTint(trend) {
  if (trend === 'BULLISH') return 'rerank-row-up'
  if (trend === 'BEARISH') return 'rerank-row-down'
  return 'rerank-row-neutral'
}

export function EtfProRow({ row, onOpenInfo }) {
  const tintClass = rowTint(row.trend)
  const pct = markerPct(row)

  return (
    <li
      className={`rerank-row tt-etfpp-row ${tintClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpenInfo?.(row.ticker)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenInfo?.(row.ticker)
        }
      }}
    >
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-ticker">{row.ticker}</span>
      <span className="tt-trend-cell">
        <BiasTimeframePill timeframe="trend" bias={row.trend} size="sm" />
      </span>
      <span className="rerank-asset" title={row.category ?? ''}>
        {row.category ?? '—'}
      </span>
      {/* PositionBar — visual anchor. LRR / TRR pulled from
          buy_trade / sell_trade; range_state badge intentionally
          absent (no source column). */}
      <span className="tt-etfpp-range">
        <PositionBarWithTooltip
          row={row}
          display={null}
          markerPct={pct}
          ghostPct={null}
          zone={null}
        />
      </span>
      <span className="tt-price">{formatPrice(row.buy_trade)}</span>
      <span className="tt-price">{formatPrice(row.sell_trade)}</span>
      <span className="tt-price">{formatPrice(row.prev_close)}</span>
    </li>
  )
}

// Header row component for use inside the panel's <header> stack.
// Same grid template as EtfProRow via .tt-etfpp-row.
export function EtfProRowHead() {
  return (
    <div className="rerank-list-head tt-etfpp-row" aria-hidden="true">
      <span className="rerank-ticker">{LABEL.column.ticker}</span>
      <span className="tt-trend-head">{LABEL.column.trend}</span>
      <span className="rerank-asset">{LABEL.column.assetClass}</span>
      {/* Three-span spatial header: LRR over bar's left endpoint,
          RANGE centered, TRR over right endpoint. Matches II + MOMO. */}
      <span className="tt-range-head">
        <span>{LABEL.column.lrr}</span>
        <span>{LABEL.column.range}</span>
        <span>{LABEL.column.trr}</span>
      </span>
      <span className="tt-price">{LABEL.column.lrr}</span>
      <span className="tt-price">{LABEL.column.trr}</span>
      <span className="tt-price">{LABEL.column.prevClose}</span>
    </div>
  )
}
