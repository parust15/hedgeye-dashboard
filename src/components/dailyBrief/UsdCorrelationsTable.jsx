import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Fixed lookback windows, in display order.
const WINDOWS = [15, 30, 90, 120, 180]

// PostgREST hands numerics back as strings — parse once at the edge.
function num(x) {
  if (x == null) return null
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : null
}

// Signed correlation, 2dp. Null → em-dash.
function fmtCorr(x) {
  const n = num(x)
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`
}

// Subtle background tint by regime classification.
const REGIME_TINT = {
  aligned: 'aligned',
  inverse: 'inverse',
  mild_aligned: 'mild-aligned',
  mild_inverse: 'mild-inverse',
  decoupled: 'decoupled',
}

function regimeTint(regime) {
  return REGIME_TINT[(regime || '').toLowerCase()] ?? 'decoupled'
}

// Plain-English regime label for the footer line.
const REGIME_LABEL = {
  aligned: 'aligned with USD',
  inverse: 'inverse to USD',
  mild_aligned: 'mildly aligned',
  mild_inverse: 'mildly inverse',
  decoupled: 'decoupled',
}

function regimeLabel(regime) {
  return REGIME_LABEL[(regime || '').toLowerCase()] ?? 'decoupled'
}

/**
 * USD correlation matrix — daily-return correlation of five assets vs
 * the dollar (UUP) across five lookback windows, fed by
 * `usd_correlations_v` (25 rows = 5 assets × 5 windows). Pivoted into a
 * grid: one row per asset, one column per window. Cells are tinted by
 * regime; the footer summarizes the 30D read.
 */
export function UsdCorrelationsTable() {
  const [state, setState] = useState({ status: 'loading', assets: [] })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('usd_correlations_v')
        .select('sort_order, asset_ticker, asset_label, window_days, correlation, regime')
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error) {
        console.error('UsdCorrelationsTable: fetch error:', error)
        setState({ status: 'error', assets: [] })
        return
      }
      const rows = data ?? []
      // Pivot: group by asset, key cells by window_days.
      const byAsset = new Map()
      for (const r of rows) {
        const key = r.asset_ticker
        if (!byAsset.has(key)) {
          byAsset.set(key, {
            ticker: r.asset_ticker,
            label: r.asset_label,
            sort_order: r.sort_order,
            cells: {},
          })
        }
        byAsset.get(key).cells[r.window_days] = {
          correlation: r.correlation,
          regime: r.regime,
        }
      }
      const assets = Array.from(byAsset.values()).sort((a, b) => a.sort_order - b.sort_order)
      setState({ status: assets.length ? 'ready' : 'empty', assets })
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="db-tape-block">
      <span className="db-subhead">Correlation vs USD</span>
      <p className="db-corr-explainer">
        Daily-return correlation vs USD (UUP). Inverse = moves opposite USD; aligned = moves
        with USD.
      </p>
      {state.status === 'loading' && <p className="db-state">Loading correlations…</p>}
      {state.status === 'error' && (
        <p className="db-state db-state-error">USD correlations unavailable.</p>
      )}
      {state.status === 'empty' && <p className="db-state">No correlation data.</p>}
      {state.status === 'ready' && (
        <>
          <div className="db-tape-table db-usdcorr-table">
            <div className="db-tape-row db-tape-head db-usdcorr-row">
              <span className="db-tape-cell-label">Asset</span>
              {WINDOWS.map((w) => (
                <span className="db-tape-cell-num" key={w}>
                  {w}D
                </span>
              ))}
            </div>
            {state.assets.map((a) => (
              <div className="db-tape-row db-usdcorr-row" key={a.ticker}>
                <span className="db-tape-cell-label">
                  <span className="db-sector-name">{a.label}</span>
                  <span className="db-sector-ticker">{a.ticker}</span>
                </span>
                {WINDOWS.map((w) => {
                  const cell = a.cells[w]
                  return (
                    <span
                      className={`db-tape-cell-num db-usdcorr-cell db-corr-tint-${regimeTint(
                        cell?.regime
                      )}`}
                      key={w}
                    >
                      {fmtCorr(cell?.correlation)}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          <p className="db-tape-footer">
            30D:{' '}
            {state.assets.map((a, i) => {
              const cell = a.cells[30]
              return (
                <span key={a.ticker}>
                  {i > 0 && ' · '}
                  {a.label}{' '}
                  <span className="db-corr-regime-word">{regimeLabel(cell?.regime)}</span>
                </span>
              )
            })}
          </p>
        </>
      )}
    </div>
  )
}
