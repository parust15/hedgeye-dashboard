import { useMemo } from 'react'
import { useMacroShow } from '../lib/useMacroShow'
import { MacroDayCard } from './MacroDayCard'
import { StatusChip } from './StatusChip'
import { readJsonbStringArray } from '../lib/jsonbArray'

const SKELETON_DAY_COUNT = 6

// "May 15, 2026" — full date for the synthesis card header.
function formatSynthDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ticker_callouts is jsonb shaped as { bullish: [...], bearish: [...] }.
// Tolerates strings + missing keys.
function readCallouts(value) {
  if (!value) return { bullish: [], bearish: [] }
  let obj = value
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return { bullish: [], bearish: [] }
    }
  }
  return {
    bullish: Array.isArray(obj?.bullish) ? obj.bullish : [],
    bearish: Array.isArray(obj?.bearish) ? obj.bearish : [],
  }
}

// Escape regex metacharacters in ticker symbols so a hypothetical
// "BRK.B" pattern doesn't get interpreted as a dot wildcard.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a reusable ticker-matcher from the callout arrays. Compiled
// once per synthesis render (via useMemo in SynthesisCard) and reused
// across every bullet, instead of recompiling the regex per bullet.
// Returns null when there are no tickers to highlight, so callers can
// skip the colorization pass entirely.
function makeTickerMatcher(bullish, bearish) {
  const bullishSet = new Set(bullish)
  const bearishSet = new Set(bearish)
  const all = [...new Set([...bullishSet, ...bearishSet])]
  if (all.length === 0) return null
  // Longest-first so multi-char tickers win over substrings of them.
  all.sort((a, b) => b.length - a.length)
  const pattern = all.map(escapeRegex).join('|')
  const regex = new RegExp(`\\b(${pattern})\\b`, 'g')
  return { regex, bullishSet, bearishSet }
}

// Walks a bullet string and wraps any callout-listed ticker symbol in
// a colored <span> — green if it's in the bullish set, red if bearish.
// Bullish wins ties (rare). Word boundaries prevent partial-word
// matches (e.g. "ALL" doesn't recolor inside "WALL"). Returns the
// original string when no matcher (or no matches).
function colorizeTickers(text, matcher) {
  if (!text || !matcher) return text
  const { regex, bullishSet } = matcher
  // Reset lastIndex — same matcher is reused across multiple bullets
  // and `g` flag persists state between calls.
  regex.lastIndex = 0
  const parts = []
  let lastIndex = 0
  let match
  let idx = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const ticker = match[0]
    const kind = bullishSet.has(ticker) ? 'bull' : 'bear'
    parts.push(
      <span
        key={`tick-${idx++}-${match.index}`}
        className={`macro-tick-inline macro-tick-inline-${kind}`}
      >
        {ticker}
      </span>
    )
    lastIndex = match.index + ticker.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function SynthesisCard({ synthesis }) {
  // Derive bullets + callouts BEFORE any early return so the hook
  // call order below is stable per Rules of Hooks. Defaults to empty
  // arrays when synthesis is missing.
  const bullets = readJsonbStringArray(synthesis?.synthesis_bullets)
  const { bullish, bearish } = readCallouts(synthesis?.ticker_callouts)

  // Compile the ticker matcher once and reuse across all bullets —
  // saves rebuilding the regex per-bullet on every render.
  const matcher = useMemo(() => makeTickerMatcher(bullish, bearish), [bullish, bearish])

  // Guards after hooks: nothing to render when synthesis is missing
  // or the LLM returned an entirely empty payload.
  if (!synthesis) return null
  if (bullets.length === 0 && bullish.length === 0 && bearish.length === 0) {
    return null
  }

  const dateLabel = formatSynthDate(synthesis.end_date)
  const windowDays = synthesis.window_days ?? 5

  return (
    <article className="macro-synthesis-card">
      <div className="card-bg" aria-hidden="true" />
      <header className="macro-synthesis-head">
        <span className="macro-synthesis-eyebrow">{windowDays}-DAY SYNTHESIS</span>
        {dateLabel && <span className="macro-synthesis-date">through {dateLabel}</span>}
      </header>

      {bullets.length > 0 && (
        <ul className="macro-synthesis-bullets">
          {bullets.map((b, i) => (
            <li key={i}>{colorizeTickers(b, matcher)}</li>
          ))}
        </ul>
      )}

      {(bullish.length > 0 || bearish.length > 0) && (
        <div className="macro-synthesis-callouts">
          {bullish.length > 0 && (
            <div className="macro-tick-row">
              <span className="macro-tick-label">BULLISH (weekly)</span>
              <div className="macro-tick-chips">
                {bullish.map((t) => (
                  <span key={t} className="macro-tick-chip macro-tick-bull">{t}</span>
                ))}
              </div>
            </div>
          )}
          {bearish.length > 0 && (
            <div className="macro-tick-row">
              <span className="macro-tick-label">BEARISH (weekly)</span>
              <div className="macro-tick-chips">
                {bearish.map((t) => (
                  <span key={t} className="macro-tick-chip macro-tick-bear">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {synthesis.model && (
        <p className="macro-synthesis-attribution">
          Synthesized by {synthesis.model}
        </p>
      )}
    </article>
  )
}

function MacroSkeleton() {
  return (
    <>
      <div className="macro-synthesis-card macro-skel-card" aria-hidden="true">
        <div className="macro-skel-line" style={{ width: '40%' }} />
        <div className="macro-skel-line" />
        <div className="macro-skel-line" />
        <div className="macro-skel-line" style={{ width: '80%' }} />
      </div>
      {Array.from({ length: SKELETON_DAY_COUNT }).map((_, i) => (
        <div key={i} className="macro-day-card macro-skel-card" aria-hidden="true">
          <div className="macro-skel-line" style={{ width: '50%' }} />
        </div>
      ))}
    </>
  )
}

export function MacroShowPanel() {
  const { synthesis, days, status } = useMacroShow()

  return (
    <div className="panel macro-panel">
      <header className="topbar">
        <div className="topbar-left">
          <h1>Hedgeye Macro Show</h1>
          <div className="status-row">
            {status === 'ready' && days.length > 0 && (
              <StatusChip label="Latest" value={days[0].signal_date} />
            )}
            {status === 'ready' && (
              <StatusChip label="Days" value={days.length} dot={false} />
            )}
            {status === 'empty' && (
              <StatusChip label="Latest" value="No data yet" dot={false} />
            )}
            {status === 'loading' && <StatusChip value="loading" dot={false} />}
            {status === 'error' && <StatusChip value="error" dot={false} />}
          </div>
        </div>
      </header>

      {status === 'loading' && <MacroSkeleton />}

      {status === 'error' && (
        <div className="state error">Could not load Macro Show data.</div>
      )}

      {status === 'empty' && (
        <div className="macro-empty">
          <p className="macro-empty-title">No Macro Show data yet.</p>
          <p className="macro-empty-sub">
            The ingestion workflow has not run. Daily show notes and the
            5-day synthesis will appear here once the first run completes.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <>
          <SynthesisCard synthesis={synthesis} />
          <div className="macro-day-stack">
            {days.map((d, i) => (
              <MacroDayCard
                key={d.signal_date}
                day={d}
                defaultExpanded={i === 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
