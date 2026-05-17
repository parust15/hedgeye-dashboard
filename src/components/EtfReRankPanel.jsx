import { useMemo, useState } from 'react'
import { useEtfReRank } from '../lib/useEtfReRank'
import { useEtfProPlus } from '../lib/useEtfProPlus'
import { shortenAssetClass } from '../lib/assetClass'
import { StatusChip } from './StatusChip'
import { EtfInfoModal } from './EtfInfoModal'

const MOVERS_LIMIT = 5
const SKELETON_ROWS = 20

// Parses an ISO YYYY-MM-DD into the two display values the row needs:
// the formatted date ("Mar 6, 2025") and the integer day count since
// then. Returns nulls when input is missing/malformed so the cells can
// render the muted "—" placeholder.
function parseAdded(isoDate) {
  if (!isoDate) return { dateLabel: null, days: null }
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return { dateLabel: null, days: null }
  const then = new Date(y, m - 1, d)
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / dayMs))
  const dateLabel = then.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return { dateLabel, days }
}

// Single delta chip used by both the main list and the movers strip.
// Variants:
//   pos  — positive (moved up)         green tint, ▲
//   neg  — negative (moved down)       red tint,   ▼
//   zero — exactly zero                muted,      —
//   null — no data (no prior snapshot) very muted, ·
function DeltaChip({ delta, ariaPrefix = 'Delta' }) {
  if (delta == null) {
    return (
      <span
        className="rerank-delta rerank-delta-null"
        aria-label={`${ariaPrefix}: no data`}
      >
        ·
      </span>
    )
  }
  const n = Number(delta)
  if (!Number.isFinite(n)) {
    return (
      <span className="rerank-delta rerank-delta-null" aria-label={`${ariaPrefix}: no data`}>
        ·
      </span>
    )
  }
  if (n === 0) {
    return (
      <span className="rerank-delta rerank-delta-zero" aria-label={`${ariaPrefix}: unchanged`}>
        —
      </span>
    )
  }
  if (n > 0) {
    return (
      <span className="rerank-delta rerank-delta-pos" aria-label={`${ariaPrefix}: up ${n}`}>
        ▲ +{n}
      </span>
    )
  }
  return (
    <span className="rerank-delta rerank-delta-neg" aria-label={`${ariaPrefix}: down ${Math.abs(n)}`}>
      ▼ {n}
    </span>
  )
}

// Top/Bottom movers strip — two side-by-side mini-cards above the main
// list. Each lists 5 tickers with their 1W delta, sorted to surface
// the biggest moves first (positive for "top", negative for "bottom").
// proLookup is the same Map<ticker, {asset_class, date_added}> the main
// list uses; here we only need asset_class for the inline label.
function MoversStrip({ rows, proLookup, onSelect }) {
  const { top, bottom } = useMemo(() => {
    // Only rows with a finite 1W delta participate. The first iteration
    // after a fresh seed will have nulls (no prior snapshot exists yet);
    // skipping them keeps the strip honest.
    const withDelta = rows
      .filter((r) => r.delta_1w != null && Number.isFinite(Number(r.delta_1w)))
      .map((r) => ({ ticker: r.ticker, rank: r.rank, delta_1w: Number(r.delta_1w) }))

    const sortedDesc = [...withDelta].sort((a, b) => b.delta_1w - a.delta_1w)
    const sortedAsc = [...withDelta].sort((a, b) => a.delta_1w - b.delta_1w)

    return {
      top: sortedDesc.slice(0, MOVERS_LIMIT).filter((r) => r.delta_1w > 0),
      bottom: sortedAsc.slice(0, MOVERS_LIMIT).filter((r) => r.delta_1w < 0),
    }
  }, [rows])

  // Render nothing when neither half has any movers — happens on the
  // first ingest before there's a prior week to compare against.
  if (top.length === 0 && bottom.length === 0) return null

  return (
    <section className="rerank-movers" aria-label="Top and bottom movers this week">
      {/* Both cards mount a .card-bg sibling so the dark-glass chrome
          (backdrop-filter blur + 0.7 opacity + state-tinted radial
          gradient) matches the rerank rows below and the ticker cards
          on the other tabs. Content children stay at 1.0 opacity. */}
      <div className="rerank-movers-card rerank-movers-top">
        <div className="card-bg" aria-hidden="true" />
        <h2 className="rerank-movers-title">TOP MOVERS (1W)</h2>
        {top.length === 0 ? (
          <div className="rerank-movers-empty">No upward movers this week.</div>
        ) : (
          <ul className="rerank-movers-list">
            {top.map((r) => (
              <li
                key={r.ticker}
                className="rerank-movers-row"
                role="button"
                tabIndex={0}
                onClick={() => onSelect?.(r.ticker)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect?.(r.ticker)
                  }
                }}
              >
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-asset" title={shortenAssetClass(proLookup?.get(r.ticker)?.asset_class) ?? ''}>
                  {shortenAssetClass(proLookup?.get(r.ticker)?.asset_class) ?? '—'}
                </span>
                <span className="rerank-movers-rank">#{r.rank}</span>
                <DeltaChip delta={r.delta_1w} ariaPrefix={`${r.ticker} 1W`} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rerank-movers-card rerank-movers-bottom">
        <div className="card-bg" aria-hidden="true" />
        <h2 className="rerank-movers-title">BOTTOM MOVERS (1W)</h2>
        {bottom.length === 0 ? (
          <div className="rerank-movers-empty">No downward movers this week.</div>
        ) : (
          <ul className="rerank-movers-list">
            {bottom.map((r) => (
              <li
                key={r.ticker}
                className="rerank-movers-row"
                role="button"
                tabIndex={0}
                onClick={() => onSelect?.(r.ticker)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect?.(r.ticker)
                  }
                }}
              >
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-asset" title={shortenAssetClass(proLookup?.get(r.ticker)?.asset_class) ?? ''}>
                  {shortenAssetClass(proLookup?.get(r.ticker)?.asset_class) ?? '—'}
                </span>
                <span className="rerank-movers-rank">#{r.rank}</span>
                <DeltaChip delta={r.delta_1w} ariaPrefix={`${r.ticker} 1W`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// Single row in the main ranked list. Wraps content in the same
// .card-bg chrome layer the ticker cards on the other tabs use, so
// the dark-glass backdrop-filter + opacity + state-tinted border are
// visually consistent across the dashboard. The four-cell grid lives
// on .rerank-row itself; .card-bg sits behind everything at z-index 0
// (content cells get z-index: 1 via the .rerank-row > * CSS rule).
//
// Tint variant comes from 1W delta sign — the closest analog to the
// other tabs' bullish/bearish/neutral state:
//   positive 1W delta → bullish-green border
//   negative 1W delta → bearish-red border
//   zero or null       → neutral grey border
function rerankTintClass(delta) {
  if (delta == null) return 'rerank-row-neutral'
  const n = Number(delta)
  if (!Number.isFinite(n) || n === 0) return 'rerank-row-neutral'
  return n > 0 ? 'rerank-row-up' : 'rerank-row-down'
}

function RerankRow({ row, proInfo, onSelect }) {
  const tintClass = rerankTintClass(row.delta_1w)
  const assetClass = shortenAssetClass(proInfo?.asset_class) ?? null
  const { dateLabel, days } = parseAdded(proInfo?.date_added)
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(row.ticker)
    }
  }
  return (
    <li
      className={`rerank-row ${tintClass}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(row.ticker)}
      onKeyDown={handleKey}
    >
      <div className="card-bg" aria-hidden="true" />
      <span className="rerank-rank">{row.rank}</span>
      <span className="rerank-ticker">{row.ticker}</span>
      <span className="rerank-asset" title={assetClass ?? ''}>
        {assetClass ?? <span className="rerank-cell-missing">—</span>}
      </span>
      <span className="rerank-added">
        {dateLabel ?? <span className="rerank-cell-missing">—</span>}
      </span>
      <span className="rerank-days">
        {days != null ? `${days}d` : <span className="rerank-cell-missing">—</span>}
      </span>
      <DeltaChip delta={row.delta_1w} ariaPrefix={`${row.ticker} 1W`} />
      <DeltaChip delta={row.delta_1m} ariaPrefix={`${row.ticker} 1M`} />
    </li>
  )
}

function RerankSkeleton() {
  return (
    <ol className="rerank-list rerank-list-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <li key={i} className="rerank-row rerank-row-skeleton" />
      ))}
    </ol>
  )
}

export function EtfReRankPanel() {
  const { rows, snapshotDate, status } = useEtfReRank()
  // ETF Pro Plus carries asset_class + date_added; the re-rank view
  // doesn't. We join client-side on ticker so the rows can surface
  // those columns without a server-side view change. Pro Plus rows
  // that don't match a re-rank ticker are ignored; re-rank tickers
  // not in the Pro Plus book render "—" in the new cells.
  const { rows: proRows } = useEtfProPlus()
  const proLookup = useMemo(() => {
    const m = new Map()
    for (const r of proRows) {
      if (r.ticker) m.set(r.ticker, { asset_class: r.asset_class, date_added: r.date_added })
    }
    return m
  }, [proRows])

  // Click any rank row or movers row to open the EtfInfoModal.
  const [selectedTicker, setSelectedTicker] = useState(null)
  const openInfoModal = (ticker) => setSelectedTicker(ticker)
  const closeInfoModal = () => setSelectedTicker(null)

  return (
    <div className="panel rerank-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye ETF Re-Rank — Macro ETFs by Rank</h1>
          <div className="status-row">
            {status === 'ready' && snapshotDate && (
              <StatusChip label="Snapshot" value={snapshotDate} />
            )}
            {status === 'ready' && (
              <StatusChip label="Tickers" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="Snapshot" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
      </header>

      {status === 'loading' && <RerankSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load ETF Re-Rank data.</div>
      )}

      {status === 'empty' && (
        <div className="rerank-empty">
          <p className="rerank-empty-title">No ETF Re-Rank data yet.</p>
          <p className="rerank-empty-sub">
            The ingestion workflow has not run. The first snapshot will appear
            here once the weekly Hedgeye Portfolio Solutions re-rank email has
            been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <MoversStrip rows={rows} proLookup={proLookup} onSelect={openInfoModal} />

          {/* Column header — visually anchors the six-cell grid so the
              user knows what each cell means. Same grid template the
              rows use, so cells line up perfectly. The two middle
              cells (asset class + added) collapse on mobile. */}
          <div className="rerank-list-head" aria-hidden="true">
            <span className="rerank-rank">RANK</span>
            <span className="rerank-ticker">TICKER</span>
            <span className="rerank-asset">ASSET CLASS</span>
            <span className="rerank-added">ADDED</span>
            <span className="rerank-days">DAYS</span>
            <span className="rerank-delta-head">1W Δ</span>
            <span className="rerank-delta-head">1M Δ</span>
          </div>

          <ol className="rerank-list">
            {rows.map((r) => (
              <RerankRow
                key={r.ticker}
                row={r}
                proInfo={proLookup.get(r.ticker)}
                onSelect={openInfoModal}
              />
            ))}
          </ol>
        </>
      )}

      {selectedTicker && (
        <EtfInfoModal ticker={selectedTicker} onClose={closeInfoModal} />
      )}
    </div>
  )
}
