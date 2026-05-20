import { shortenAssetClass } from '../lib/assetClass'
import { formatPrice } from '../lib/format'
import { LABEL } from '../lib/labels'
import { BiasTimeframePill } from './BiasTimeframePill'
import { PositionBarWithTooltip } from './PositionBar'

// Row component for ETF Pro Plus. Mirrors the SS / II / MOMO row
// pattern (single .rerank-row li with grid layout) so the panel reads
// as a list, not a tile grid.
//
// Fields available on hedgeye_etf_pro_current_v (per Finding #6):
//   ticker, direction (BULLISH|BEARISH only — no NEUTRAL per Finding #2),
//   description, date_added, recent_price, trend_range_low (LRR),
//   trend_range_high (TRR), asset_class. No range_state column —
//   the PositionBar's range-state overlay is absent for ETF Pro Plus
//   rows (the view doesn't carry that signal).
//
// We build a `posbarRow` shim mapping the Pro Plus column names to
// the buy_trade / sell_trade / prev_close shape PositionBar expects.
function buildPosbarRow(row) {
  return {
    ticker: row.ticker,
    buy_trade: row.trend_range_low,
    sell_trade: row.trend_range_high,
    prev_close: row.recent_price,
    // signal_date isn't on this view — keep undefined so the tooltip
    // header omits the date suffix.
    signal_date: undefined,
  }
}

function markerPct(row) {
  if (row.recent_price == null || row.trend_range_low == null || row.trend_range_high == null) {
    return null
  }
  const px = Number(row.recent_price)
  const lo = Number(row.trend_range_low)
  const hi = Number(row.trend_range_high)
  if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null
  const span = hi - lo
  if (span === 0) return null
  return (px - lo) / span
}

function rowTint(direction) {
  if (direction === 'BULLISH') return 'rerank-row-up'
  if (direction === 'BEARISH') return 'rerank-row-down'
  return 'rerank-row-neutral'
}

export function EtfProRow({ row, onOpenInfo }) {
  const tintClass = rowTint(row.direction)
  const asset = shortenAssetClass(row.asset_class) ?? '—'
  const posbarRow = buildPosbarRow(row)
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
        <BiasTimeframePill timeframe="trend" bias={row.direction} size="sm" />
      </span>
      <span className="rerank-asset" title={asset}>{asset}</span>
      {/* PositionBar — visual anchor. LRR / TRR pulled from
          trend_range_low/high; range_state badge intentionally
          absent (no source column). */}
      <span className="tt-etfpp-range">
        <PositionBarWithTooltip
          row={posbarRow}
          display={null}
          markerPct={pct}
          ghostPct={null}
          zone={null}
        />
      </span>
      <span className="tt-price">{formatPrice(row.trend_range_low)}</span>
      <span className="tt-price">{formatPrice(row.trend_range_high)}</span>
      <span className="tt-price">{formatPrice(row.recent_price)}</span>
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
      <span className="tt-range-head">
        {LABEL.column.lrr} ←——— {LABEL.column.range} ———→ {LABEL.column.trr}
      </span>
      <span className="tt-price">{LABEL.column.lrr}</span>
      <span className="tt-price">{LABEL.column.trr}</span>
      <span className="tt-price">{LABEL.column.prevClose}</span>
    </div>
  )
}
