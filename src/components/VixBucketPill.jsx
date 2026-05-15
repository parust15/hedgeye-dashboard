// Hedgeye VIX-regime label + tone. Keyed off the raw bucket value from
// vix_current_v — anything unrecognized falls through to grey/UNKNOWN.
const BUCKET_PRESENTATION = {
  investable: { label: 'INVESTABLE', tone: 'green' },
  chop: { label: 'CHOP', tone: 'amber' },
  fuck: { label: 'F*CK', tone: 'red' },
}

const REGIME_TOOLTIP =
  'Hedgeye volatility regime: VIX <20 = investable, 20–29 = chop, 30+ = f*ck'

function formatDayChange(change, pct) {
  if (change == null && pct == null) return null
  const parts = []
  if (Number.isFinite(change)) {
    parts.push(`${change >= 0 ? '+' : ''}${change.toFixed(2)}`)
  }
  if (Number.isFinite(pct)) {
    parts.push(`(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`)
  }
  if (parts.length === 0) return null
  return parts.join(' ')
}

function dayChangeTone(change) {
  if (!Number.isFinite(change)) return ''
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return ''
}

function bucketPresentation(bucket) {
  if (!bucket) return { label: 'UNKNOWN', tone: 'grey' }
  return BUCKET_PRESENTATION[bucket.toLowerCase()] ?? { label: bucket.toUpperCase(), tone: 'grey' }
}

/**
 * Inline badge for the VIX SignalCard. Sits next to the trend pill —
 * renders just the regime label + a day-change subtitle underneath.
 * The tooltip explains the regime cutoffs.
 */
export function VixBucketBadge({ data }) {
  if (!data) return null
  const { label, tone } = bucketPresentation(data.bucket)
  const dayLine = formatDayChange(data.day_change, data.day_change_pct)
  return (
    <div className="vix-bucket-badge" title={REGIME_TOOLTIP}>
      <span className={`vix-bucket-pill vix-bucket-${tone}`}>{label}</span>
      {dayLine && (
        <span className={`vix-bucket-change ${dayChangeTone(data.day_change)}`}>
          {dayLine}
        </span>
      )}
    </div>
  )
}

/**
 * Persistent header pill — "VIX 18.0 · INVESTABLE" + small day-change
 * subtitle. Sits top-right of the app, always visible regardless of tab.
 */
export function VixHeaderPill({ data }) {
  if (!data) return null
  const { label, tone } = bucketPresentation(data.bucket)
  const dayLine = formatDayChange(data.day_change, data.day_change_pct)
  const vixText = Number.isFinite(data.vix_value) ? data.vix_value.toFixed(1) : '—'
  return (
    <div className={`vix-header-pill vix-bucket-${tone}`} title={REGIME_TOOLTIP}>
      <div className="vix-header-pill-main">
        <span className="vix-header-pill-value">VIX {vixText}</span>
        <span className="vix-header-pill-sep">·</span>
        <span className="vix-header-pill-label">{label}</span>
      </div>
      {dayLine && (
        <div className={`vix-header-pill-change ${dayChangeTone(data.day_change)}`}>
          {dayLine}
        </div>
      )}
    </div>
  )
}
