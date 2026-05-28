import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// PostgREST hands numerics back as strings — parse once at the edge.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

// Signed, 2dp, percent. Null → em-dash.
function fmtPct(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

// Green up / red down / muted flat-or-missing.
function pctTone(x) {
  const n = num(x)
  if (n == null) return 'muted'
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'muted'
}

const STANCE_TONE = {
  bullish: 'bull',
  bearish: 'bear',
  neutral: 'neutral',
}

function stanceTone(conclusion) {
  return STANCE_TONE[(conclusion || '').toLowerCase()] ?? 'neutral'
}

/**
 * Sector performance board — the 11 S&P SPDR sectors plus the SPY
 * benchmark, fed by `sector_performance_v`. One row per sector ordered
 * by sort_order; SPY (sort_order 99) lands last, set off by a divider.
 * Returns 1D / MTD / QTD / YTD percent moves (already in %) and a
 * Hedgeye stance chip.
 */
export function SectorPerformanceTable() {
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('sector_performance_v')
        .select(
          'sort_order, ticker, label, pct_1d, pct_mtd, pct_qtd, pct_ytd, conclusion'
        )
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error) {
        console.error('SectorPerformanceTable: fetch error:', error)
        setState({ status: 'error', rows: [] })
        return
      }
      const rows = data ?? []
      setState({ status: rows.length ? 'ready' : 'empty', rows })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="db-tape-block">
      <span className="db-subhead">Sector Performance</span>
      {state.status === 'loading' && <p className="db-state">Loading sectors…</p>}
      {state.status === 'error' && (
        <p className="db-state db-state-error">Sector performance unavailable.</p>
      )}
      {state.status === 'empty' && <p className="db-state">No sector data.</p>}
      {state.status === 'ready' && (
        <div className="db-tape-table db-sector-table">
          <div className="db-tape-row db-tape-head">
            <span className="db-tape-cell-label">Sector</span>
            <span className="db-tape-cell-num">1D</span>
            <span className="db-tape-cell-num">MTD</span>
            <span className="db-tape-cell-num">QTD</span>
            <span className="db-tape-cell-num">YTD</span>
            <span className="db-tape-cell-stance">Stance</span>
          </div>
          {state.rows.map((r) => {
            const isBench = r.sort_order === 99
            return (
              <div
                className={`db-tape-row${isBench ? ' db-sector-bench' : ''}`}
                key={r.ticker}
              >
                <span className="db-tape-cell-label">
                  <span className="db-sector-name">{r.label}</span>
                  <span className="db-sector-ticker">{r.ticker}</span>
                </span>
                <span className={`db-tape-cell-num db-num-${pctTone(r.pct_1d)}`}>
                  {fmtPct(r.pct_1d)}
                </span>
                <span className={`db-tape-cell-num db-num-${pctTone(r.pct_mtd)}`}>
                  {fmtPct(r.pct_mtd)}
                </span>
                <span className={`db-tape-cell-num db-num-${pctTone(r.pct_qtd)}`}>
                  {fmtPct(r.pct_qtd)}
                </span>
                <span className={`db-tape-cell-num db-num-${pctTone(r.pct_ytd)}`}>
                  {fmtPct(r.pct_ytd)}
                </span>
                <span className="db-tape-cell-stance">
                  <span className={`db-stance-chip db-stance-${stanceTone(r.conclusion)}`}>
                    {(r.conclusion || '—').toUpperCase()}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
