import { useMemo } from 'react'
import { useEtfReRank } from '../lib/useEtfReRank'
import { StatusChip } from './StatusChip'

const MOVERS_LIMIT = 5
const SKELETON_ROWS = 20

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
function MoversStrip({ rows }) {
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
      <div className="rerank-movers-card rerank-movers-top">
        <h2 className="rerank-movers-title">TOP MOVERS (1W)</h2>
        {top.length === 0 ? (
          <div className="rerank-movers-empty">No upward movers this week.</div>
        ) : (
          <ul className="rerank-movers-list">
            {top.map((r) => (
              <li key={r.ticker} className="rerank-movers-row">
                <span className="rerank-movers-ticker">{r.ticker}</span>
                <span className="rerank-movers-rank">#{r.rank}</span>
                <DeltaChip delta={r.delta_1w} ariaPrefix={`${r.ticker} 1W`} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rerank-movers-card rerank-movers-bottom">
        <h2 className="rerank-movers-title">BOTTOM MOVERS (1W)</h2>
        {bottom.length === 0 ? (
          <div className="rerank-movers-empty">No downward movers this week.</div>
        ) : (
          <ul className="rerank-movers-list">
            {bottom.map((r) => (
              <li key={r.ticker} className="rerank-movers-row">
                <span className="rerank-movers-ticker">{r.ticker}</span>
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

// Single row in the main ranked list. CSS handles the 4-column grid;
// this just paints the cells.
function RerankRow({ row }) {
  return (
    <li className="rerank-row">
      <span className="rerank-rank">{row.rank}</span>
      <span className="rerank-ticker">{row.ticker}</span>
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
          <MoversStrip rows={rows} />

          {/* Column header — visually anchors the four-cell grid so the
              user knows what each chip means. Same grid template the
              rows use, so cells line up perfectly. */}
          <div className="rerank-list-head" aria-hidden="true">
            <span className="rerank-rank">RANK</span>
            <span className="rerank-ticker">TICKER</span>
            <span className="rerank-delta-head">1W Δ</span>
            <span className="rerank-delta-head">1M Δ</span>
          </div>

          <ol className="rerank-list">
            {rows.map((r) => (
              <RerankRow key={r.ticker} row={r} />
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
