import { useMemo } from 'react'
import { useEtfProPlus } from '../lib/useEtfProPlus'
import { StatusChip } from './StatusChip'
import { formatPrice } from '../lib/format'

// "X days ago" / "Month Day, Year" formatter for the Added-on chip.
// Uses simple Date math because date_added is an ISO YYYY-MM-DD string
// from Supabase. >365 days renders the full date; ≤365 renders as a
// rounded "Nd ago".
function formatAddedLabel(isoDate) {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const then = new Date(y, m - 1, d)
  const now = new Date()
  // Days difference, floored to whole days. UTC-ish — close enough since
  // both points are date-only.
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(0, Math.floor((now.getTime() - then.getTime()) / dayMs))
  if (days > 365) {
    return then.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  if (days === 0) return 'Added today'
  if (days === 1) return 'Added 1d ago'
  return `Added ${days}d ago`
}

// Hedgeye uses the LRR / TRR shorthand throughout the dashboard for the
// low and high of the trend range. Same labels used on the RR card
// tooltips so the language is consistent across panels.
function RangeRow({ low, high }) {
  if (low == null && high == null) return null
  return (
    <div className="etfpp-range">
      <span className="etfpp-range-label">RANGE</span>
      <span className="etfpp-range-values">
        {low != null ? formatPrice(low) : '—'}
        <span className="etfpp-range-dash"> — </span>
        {high != null ? formatPrice(high) : '—'}
      </span>
    </div>
  )
}

function EtfCard({ row }) {
  const directionClass = `etfpp-${(row.direction ?? 'bullish').toLowerCase()}`
  const added = formatAddedLabel(row.date_added)
  return (
    <article className={`etfpp-card ${directionClass}`}>
      <header className="etfpp-card-head">
        <div className="etfpp-ticker">{row.ticker}</div>
        {row.description && (
          <div className="etfpp-description">{row.description}</div>
        )}
      </header>

      {row.recent_price != null && (
        <div className="etfpp-price-row">
          <span className="etfpp-price-label">PRICE</span>
          <span className="etfpp-price">{formatPrice(row.recent_price)}</span>
        </div>
      )}

      <RangeRow low={row.trend_range_low} high={row.trend_range_high} />

      <footer className="etfpp-card-foot">
        {row.asset_class && (
          <span className="etfpp-asset-chip">{row.asset_class}</span>
        )}
        {added && <span className="etfpp-added">{added}</span>}
      </footer>
    </article>
  )
}

// Loading skeleton — matches the card-grid layout so the page doesn't
// pop on first render. Two columns (matching the two direction
// columns), three placeholders each.
function CardGridSkeleton() {
  const placeholders = [0, 1, 2, 3, 4, 5]
  return (
    <div className="etfpp-columns">
      <section className="etfpp-column etfpp-column-bullish">
        <h2 className="etfpp-column-title">BULLISH</h2>
        <div className="etfpp-card-grid">
          {placeholders.slice(0, 3).map((i) => (
            <div key={i} className="etfpp-card etfpp-card-skeleton" />
          ))}
        </div>
      </section>
      <section className="etfpp-column etfpp-column-bearish">
        <h2 className="etfpp-column-title">BEARISH</h2>
        <div className="etfpp-card-grid">
          {placeholders.slice(3).map((i) => (
            <div key={i} className="etfpp-card etfpp-card-skeleton" />
          ))}
        </div>
      </section>
    </div>
  )
}

// Group an array of rows into [{ assetClass, items: [] }] buckets,
// sorted alphabetically. Null asset_class lands in a trailing "Other"
// bucket so it's still visible but de-prioritized.
function groupByAssetClass(rows) {
  const buckets = new Map()
  for (const r of rows) {
    const key = r.asset_class || 'Other'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(r)
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })
  return keys.map((assetClass) => ({ assetClass, items: buckets.get(assetClass) }))
}

function DirectionColumn({ direction, rows }) {
  const groups = useMemo(() => groupByAssetClass(rows), [rows])
  const isBullish = direction === 'BULLISH'
  const cls = `etfpp-column etfpp-column-${direction.toLowerCase()}`
  return (
    <section className={cls}>
      <h2 className="etfpp-column-title">
        {direction}
        <span className="etfpp-column-count">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <div className="etfpp-column-empty">
          No {isBullish ? 'long' : 'short'} positions in this snapshot.
        </div>
      ) : (
        groups.map(({ assetClass, items }) => (
          <div key={assetClass} className="etfpp-group">
            <h3 className="etfpp-group-title">
              {assetClass}
              <span className="etfpp-group-count">{items.length}</span>
            </h3>
            <div className="etfpp-card-grid">
              {items.map((row) => (
                <EtfCard key={`${row.direction}-${row.ticker}`} row={row} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}

export function EtfProPlusPanel() {
  const { rows, snapshotDate, status } = useEtfProPlus()

  const { bullish, bearish } = useMemo(() => {
    const b = []
    const s = []
    for (const r of rows) {
      if (r.direction === 'BULLISH') b.push(r)
      else if (r.direction === 'BEARISH') s.push(r)
    }
    return { bullish: b, bearish: s }
  }, [rows])

  return (
    <div className="panel etfpp-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye ETF Pro Plus</h1>
          <div className="status-row">
            {status === 'ready' && snapshotDate && (
              <StatusChip label="Snapshot" value={snapshotDate} />
            )}
            {status === 'ready' && (
              <StatusChip label="Positions" value={rows.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip
                label="Snapshot"
                value="No data yet"
                dot={false}
              />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
      </header>

      {status === 'loading' && <CardGridSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load ETF Pro Plus data.</div>
      )}

      {status === 'empty' && (
        <div className="etfpp-empty">
          <p className="etfpp-empty-title">No ETF Pro Plus data yet.</p>
          <p className="etfpp-empty-sub">
            The ingestion workflow has not run. The first snapshot will appear
            here once the weekly Hedgeye ETF Pro Plus email has been parsed.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <div className="etfpp-columns">
          <DirectionColumn direction="BULLISH" rows={bullish} />
          <DirectionColumn direction="BEARISH" rows={bearish} />
        </div>
      )}
    </div>
  )
}
