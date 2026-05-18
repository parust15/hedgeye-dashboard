import { useState } from 'react'

// "Friday, May 15" formatter for the card header. ISO date string in,
// localized string out. Uses local zone — signal_date is date-only so
// there's no timezone math worth doing.
function formatDayLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// Tiny attribution timestamp — "May 15, 2026 · 7:30 AM" — used in the
// card footer when llm_tldr_generated_at is set.
function formatAttributionTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// jsonb/json fields arrive parsed when supabase-js handles them, but
// defensively handle the string case too in case the column type or
// driver behavior shifts. Returns [] for anything we can't parse.
function readArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function TickerChipRow({ label, tickers, kind }) {
  if (!tickers || tickers.length === 0) return null
  const chipClass = kind === 'bull' ? 'macro-tick-bull' : 'macro-tick-bear'
  return (
    <div className="macro-tick-row">
      <span className="macro-tick-label">{label}</span>
      <div className="macro-tick-chips">
        {tickers.map((t) => (
          <span key={t} className={`macro-tick-chip ${chipClass}`}>{t}</span>
        ))}
      </div>
    </div>
  )
}

export function MacroDayCard({ day, defaultExpanded = false }) {
  const [open, setOpen] = useState(defaultExpanded)

  const top3 = readArray(day.top3)
  const tldr = readArray(day.llm_tldr_bullets).filter(
    (b) => typeof b === 'string' && b.trim().length > 0
  )
  const bullish = Array.isArray(day.bullish_tickers) ? day.bullish_tickers : []
  const bearish = Array.isArray(day.bearish_tickers) ? day.bearish_tickers : []
  const hasPositions = bullish.length > 0 || bearish.length > 0
  const summary = day.main_summary_text || null
  const intro = day.intro_headline || null
  const ranges = day.immediate_ranges || null

  // Themes shown in the collapsed header — small inline pill list.
  // Pulled from top3.theme so the user can scan what each day covers
  // without expanding. Falls back to empty if top3 is missing.
  const themes = top3.map((t) => t?.theme).filter(Boolean)

  return (
    <article className={`macro-day-card${open ? ' open' : ''}`}>
      <div className="card-bg" aria-hidden="true" />
      <button
        type="button"
        className="macro-day-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="macro-day-head-left">
          <span className="macro-day-date">{formatDayLabel(day.signal_date)}</span>
          {themes.length > 0 && (
            <span className="macro-day-themes">
              {themes.map((t, i) => (
                <span key={`${t}-${i}`} className="macro-day-theme-pill">{t}</span>
              ))}
            </span>
          )}
        </div>
        <span className={`macro-day-caret${open ? ' open' : ''}`} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="macro-day-body">
          {intro && (
            <p className="macro-day-intro">{intro}</p>
          )}

          {ranges && (
            <div className="macro-day-ranges">
              <span className="macro-day-section-label">IMMEDIATE RANGES</span>
              <p className="macro-day-ranges-text">{ranges}</p>
            </div>
          )}

          {tldr.length > 0 && (
            <section className="macro-day-section">
              <h3 className="macro-day-section-head">TL;DR</h3>
              <ul className="macro-day-bullets">
                {tldr.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {top3.length > 0 && (
            <section className="macro-day-section">
              <h3 className="macro-day-section-head">TOP 3 THINGS</h3>
              <ol className="macro-day-top3">
                {top3.map((entry, i) => (
                  <li key={i} className="macro-day-top3-item">
                    <h4 className="macro-day-top3-head">
                      <span className="macro-day-top3-dot" aria-hidden="true" />
                      <span className="macro-day-top3-rank">{entry?.rank ?? i + 1})</span>
                      <span className="macro-day-top3-theme">{entry?.theme ?? ''}</span>
                    </h4>
                    {entry?.body && (
                      <p className="macro-day-top3-body">{entry.body}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {hasPositions && (
            <section className="macro-day-section">
              <h3 className="macro-day-section-head">POSITIONS MENTIONED</h3>
              <TickerChipRow label="BULLISH" tickers={bullish} kind="bull" />
              <TickerChipRow label="BEARISH" tickers={bearish} kind="bear" />
            </section>
          )}

          {summary && (
            <section className="macro-day-section">
              <h3 className="macro-day-section-head">FULL SUMMARY</h3>
              {/* white-space: pre-wrap on the container preserves the
                  show notes' line breaks without us splitting on \n. */}
              <div className="macro-day-summary">{summary}</div>
            </section>
          )}

          {day.llm_tldr_generated_at && (
            <p className="macro-day-attribution">
              TL;DR generated · {formatAttributionTime(day.llm_tldr_generated_at)}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
