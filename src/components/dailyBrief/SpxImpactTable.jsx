import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// PostgREST hands numerics back as strings — parse once at the edge.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

function fmtPct(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmtWeight(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n.toFixed(2)}%`
}

// Impact is in basis points — signed, 1dp.
function fmtBps(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}`
}

function pctTone(x) {
  const n = num(x)
  if (n == null) return 'muted'
  if (n > 0) return 'up'
  if (n < 0) return 'down'
  return 'muted'
}

function ImpactList({ title, tone, rows }) {
  return (
    <div className="db-impact-col">
      <span className={`db-impact-title db-impact-title-${tone}`}>{title}</span>
      <div className="db-tape-table db-impact-table">
        <div className="db-tape-row db-tape-head db-impact-row">
          <span className="db-impact-sym">Sym</span>
          <span className="db-impact-sector">Sector</span>
          <span className="db-tape-cell-num">Wt</span>
          <span className="db-tape-cell-num">Δ</span>
          <span className="db-tape-cell-num">bps</span>
        </div>
        {rows.length === 0 && <p className="db-state db-impact-empty">No names.</p>}
        {rows.map((r) => (
          <div className="db-tape-row db-impact-row" key={r.symbol}>
            <span className="db-impact-sym" title={r.name || r.symbol}>
              {r.symbol}
            </span>
            <span className="db-impact-sector" title={r.sector || ''}>
              {r.sector || '—'}
            </span>
            <span className="db-tape-cell-num db-num-muted">{fmtWeight(r.weight)}</span>
            <span className={`db-tape-cell-num db-num-${pctTone(r.change_pct)}`}>
              {fmtPct(r.change_pct)}
            </span>
            <span className={`db-tape-cell-num db-num-${pctTone(r.impact_bps)}`}>
              {fmtBps(r.impact_bps)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * SPX impact board — the day's top-5 contributors and top-5 detractors
 * to the S&P, by index-point contribution. Fed by
 * `spx_constituents_impact_v` (server-sorted impact DESC). Rows without
 * a live quote (change_pct IS NULL) are skipped. The footer reconciles
 * the two tails against the SPY 1D move (from `sector_performance_v`).
 */
export function SpxImpactTable() {
  const [state, setState] = useState({
    status: 'loading',
    contributors: [],
    detractors: [],
    spy1d: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      supabase
        .from('spx_constituents_impact_v')
        .select('symbol, name, sector, weight, change_pct, impact_bps, role'),
      supabase
        .from('sector_performance_v')
        .select('ticker, pct_1d')
        .eq('ticker', 'SPY')
        .limit(1),
    ]).then(([impactSettled, spySettled]) => {
      if (cancelled) return

      if (impactSettled.status !== 'fulfilled' || impactSettled.value.error) {
        if (impactSettled.status === 'rejected')
          console.error('SpxImpactTable: impact fetch rejected:', impactSettled.reason)
        else console.error('SpxImpactTable: impact fetch error:', impactSettled.value.error)
        setState({ status: 'error', contributors: [], detractors: [], spy1d: null })
        return
      }

      const rows = (impactSettled.value.data ?? []).filter((r) => num(r.change_pct) != null)
      const contributors = rows
        .filter((r) => r.role === 'contributor')
        .sort((a, b) => num(b.impact_bps) - num(a.impact_bps))
        .slice(0, 5)
      const detractors = rows
        .filter((r) => r.role === 'detractor')
        .sort((a, b) => num(a.impact_bps) - num(b.impact_bps))
        .slice(0, 5)

      let spy1d = null
      if (spySettled.status === 'fulfilled' && !spySettled.value.error) {
        spy1d = num(spySettled.value.data?.[0]?.pct_1d)
      } else if (spySettled.status === 'rejected') {
        console.error('SpxImpactTable: SPY fetch rejected:', spySettled.reason)
      }

      setState({
        status: contributors.length || detractors.length ? 'ready' : 'empty',
        contributors,
        detractors,
        spy1d,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const contribSum = state.contributors.reduce((acc, r) => acc + (num(r.impact_bps) ?? 0), 0)
  const detractSum = state.detractors.reduce((acc, r) => acc + (num(r.impact_bps) ?? 0), 0)

  return (
    <div className="db-tape-block">
      <span className="db-subhead">S&amp;P Movers — Index Impact (bps)</span>
      {state.status === 'loading' && <p className="db-state">Loading movers…</p>}
      {state.status === 'error' && (
        <p className="db-state db-state-error">Index impact unavailable.</p>
      )}
      {state.status === 'empty' && <p className="db-state">No quoted movers today.</p>}
      {state.status === 'ready' && (
        <>
          <div className="db-impact-grid">
            <ImpactList title="Top 5 Contributors" tone="up" rows={state.contributors} />
            <ImpactList title="Top 5 Detractors" tone="down" rows={state.detractors} />
          </div>
          <p className="db-tape-footer">
            Top-5 contribution: <span className="db-num-up">{fmtBps(contribSum)} bps</span> ·
            Top-5 detraction: <span className="db-num-down">{fmtBps(detractSum)} bps</span> ·
            SPY 1D:{' '}
            <span className={`db-num-${pctTone(state.spy1d)}`}>{fmtPct(state.spy1d)}</span>
          </p>
        </>
      )}
    </div>
  )
}
