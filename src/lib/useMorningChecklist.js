import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Data spine for the Pre-Market Checklist. One hook, one parallel fetch
// burst, thirteen read-only sources — the component stays presentation-only.
//
// Sources:
//   daily_intelligence_v        — today's digest row (signals, posture,
//                                 flips, top3, sectors, spx, vix_state…)
//   macro_insights              — morning_summary narrative (today's read)
//   hedgeye_macro_assertions    — US monthly/quarterly + regional Quads
//   hedgeye_macro_regime        — risk-asset vs defensive market read
//   hedgeye_rr_verdict          — per-signal AI verdict (action/conviction)
//   hedgeye_signals_v           — latest-date range_state + width deltas
//   ticker_signal_state_v       — RR-first cross-source state (gate check)
//   hedgeye_range_breaks        — intraday risk-range break events
//   hedgeye_call_exits_today    — names exited from The Call today
//   hedgeye_call_active_positions — the book: sides, NEW adds, Top-5 ranks
//   sector_rotation_v           — analyst net-long by sector, weekly
//   earnings_calendar           — report dates, joined to the book
//   hedgeye_ideas_latest_v + hedgeye_momo_tracker_stock_state — universe

const EARNINGS_LOOKAHEAD_DAYS = 8

function isoDaysFromToday(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function useMorningChecklist() {
  const [state, setState] = useState({
    status: 'loading',
    di: null,
    morning: null,
    quads: { monthly: null, quarterly: null, monthlyShift: null, regional: [] },
    regime: null,
    verdicts: { byTicker: {}, date: null },
    rangeStates: { counts: {}, movers: [], date: null },
    conflicts: [],
    breaks: [],
    exits: [],
    book: [],
    rotation: { latest: [], prev: [], latestWeek: null, prevWeek: null },
    earnings: [],
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = isoDaysFromToday(0)
      const horizon = isoDaysFromToday(EARNINGS_LOOKAHEAD_DAYS)

      const [diS, morningS, quadS, regimeS, verdictS, sigS, gateS, breakS, exitS, bookS, ideasS, momoS, rotS] =
        await Promise.allSettled([
          supabase
            .from('daily_intelligence_v')
            .select(
              'signal_date, emerging_quad, vix_state, signals, signal_posture, top3_today, sector_performance, spx_impact, signal_flips_recent, on_deck_top5, investing_ideas_active'
            )
            .order('signal_date', { ascending: false })
            .limit(1),
          supabase
            .from('macro_insights')
            .select('insight_date, headline, detail')
            .eq('block_key', 'morning_summary')
            .order('insight_date', { ascending: false })
            .limit(1),
          supabase
            .from('hedgeye_macro_assertions')
            .select('assertion_type, value, region, stance, stated_on, evidence_snippet')
            .in('assertion_type', ['monthly_quad', 'quarterly_quad', 'regional_quad'])
            .order('stated_on', { ascending: false }),
          supabase
            .from('hedgeye_macro_regime')
            .select('signal_date, risk_asset_score, defensive_score, dxy_signal, regime_label')
            .order('signal_date', { ascending: false })
            .limit(1),
          supabase
            .from('hedgeye_rr_verdict')
            .select('signal_date, ticker, action, conviction, range_zone, verdict_oneliner')
            .order('signal_date', { ascending: false })
            .limit(80),
          supabase
            .from('hedgeye_signals_v')
            .select('signal_date, ticker, range_state, width_delta')
            .order('signal_date', { ascending: false })
            .limit(80),
          supabase
            .from('ticker_signal_state_v')
            .select('ticker, call_position, call_position_at, rr_trend, rr_at, call_conviction')
            .in('call_position', ['LONG', 'SHORT'])
            .not('rr_trend', 'is', null),
          supabase
            .from('hedgeye_range_breaks')
            .select('ticker, direction, break_type, current_price, buy_range, sell_range, break_date, break_time')
            .order('break_time', { ascending: false })
            .limit(120),
          supabase.from('hedgeye_call_exits_today').select('ticker, exited_from'),
          supabase
            .from('hedgeye_call_active_positions')
            .select('ticker, position_type, is_new, top5_rank_today'),
          supabase.from('hedgeye_ideas_latest_v').select('ticker, side'),
          supabase.from('hedgeye_momo_tracker_stock_state').select('ticker'),
          supabase
            .from('sector_rotation_v')
            .select('week_start, sector, long_count, short_count, net_long')
            .order('week_start', { ascending: false })
            .limit(40),
        ])

      if (cancelled) return

      const ok = (s) => s.status === 'fulfilled' && !s.value.error
      const rows = (s) => (ok(s) ? s.value.data ?? [] : [])
      const fail = (s, label) => {
        if (!ok(s))
          console.error(
            `MorningChecklist: ${label} fetch failed:`,
            s.status === 'rejected' ? s.reason : s.value.error
          )
      }
      fail(diS, 'daily_intelligence')
      fail(morningS, 'morning_summary')
      fail(quadS, 'macro_assertions')
      fail(regimeS, 'macro_regime')
      fail(verdictS, 'rr_verdict')
      fail(sigS, 'signals_v')
      fail(gateS, 'signal_state')
      fail(breakS, 'range_breaks')
      fail(exitS, 'call_exits')
      fail(bookS, 'active_positions')
      fail(rotS, 'sector_rotation')

      // --- quads (incl. upcoming-shift detection, per the macro emails) --
      const quadRows = rows(quadS)
      const SHIFT_RE = /shift|into|emerging/i
      const isUs = (r, type) => r.assertion_type === type && r.region === 'US'
      const monthly = quadRows.find((r) => isUs(r, 'monthly_quad')) ?? null
      const quarterly = quadRows.find((r) => isUs(r, 'quarterly_quad')) ?? null
      const monthlyShift =
        quadRows.find((r) => isUs(r, 'monthly_quad') && SHIFT_RE.test(r.evidence_snippet || '')) ?? null
      const seenRegion = new Set()
      const regional = []
      for (const r of quadRows) {
        if (r.assertion_type !== 'regional_quad' || !r.region || r.region === 'US') continue
        if (seenRegion.has(r.region)) continue
        seenRegion.add(r.region)
        regional.push(r)
      }
      regional.sort((a, b) => a.region.localeCompare(b.region))

      // --- per-signal AI verdicts: latest date only, keyed by ticker -----
      const verdictRows = rows(verdictS)
      const verdictDate = verdictRows[0]?.signal_date ?? null
      const byTicker = {}
      for (const v of verdictRows) {
        if (v.signal_date !== verdictDate) continue
        if (!byTicker[v.ticker]) byTicker[v.ticker] = v
      }

      // --- range-state structure: latest date counts + width movers ------
      const sigRows = rows(sigS)
      const sigDate = sigRows[0]?.signal_date ?? null
      const counts = {}
      const movers = []
      for (const r of sigRows) {
        if (r.signal_date !== sigDate) continue
        const st = r.range_state || 'unchanged'
        counts[st] = (counts[st] ?? 0) + 1
        if (r.width_delta != null) movers.push(r)
      }
      movers.sort((a, b) => Math.abs(b.width_delta) - Math.abs(a.width_delta))

      // --- RR-gate conflicts --------------------------------------------
      const conflicts = rows(gateS).filter(
        (r) =>
          (r.call_position === 'LONG' && r.rr_trend === 'BEARISH') ||
          (r.call_position === 'SHORT' && r.rr_trend === 'BULLISH')
      )
      conflicts.sort(
        (a, b) =>
          (a.call_conviction === 'best_idea' ? 0 : 1) - (b.call_conviction === 'best_idea' ? 0 : 1) ||
          a.ticker.localeCompare(b.ticker)
      )

      // --- range breaks: latest break date, one row per ticker + count ---
      const breakRows = rows(breakS)
      const latestBreakDate = breakRows.reduce(
        (acc, r) => (acc == null || r.break_date > acc ? r.break_date : acc),
        null
      )
      const breakByTicker = new Map()
      for (const r of breakRows) {
        if (r.break_date !== latestBreakDate) continue
        const prev = breakByTicker.get(r.ticker)
        if (prev) prev.event_count += 1
        else breakByTicker.set(r.ticker, { ...r, event_count: 1 })
      }
      const breaks = [...breakByTicker.values()]

      // --- sector rotation: latest week vs the one before ----------------
      const rotRows = rows(rotS)
      const weeks = [...new Set(rotRows.map((r) => r.week_start))].sort().reverse()
      const latestWeek = weeks[0] ?? null
      const prevWeek = weeks[1] ?? null
      const rotation = {
        latest: rotRows.filter((r) => r.week_start === latestWeek),
        prev: rotRows.filter((r) => r.week_start === prevWeek),
        latestWeek,
        prevWeek,
      }

      // --- earnings watch (second round-trip: needs the universe) --------
      const book = rows(bookS)
      const ideas = rows(ideasS)
      let earnings = []
      const universe = [
        ...new Set(
          [...book, ...ideas, ...rows(momoS)].map((r) => r.ticker).filter(Boolean)
        ),
      ]
      if (universe.length > 0) {
        const { data, error } = await supabase
          .from('earnings_calendar')
          .select('symbol, earnings_date, call_time, eps_estimated')
          .gte('earnings_date', today)
          .lte('earnings_date', horizon)
          .in('symbol', universe)
          .order('earnings_date', { ascending: true })
        if (cancelled) return
        if (error) console.error('MorningChecklist: earnings fetch failed:', error)
        else {
          const seenEarn = new Set()
          earnings = (data ?? []).filter((e) => {
            const k = `${e.symbol}|${e.earnings_date}`
            if (seenEarn.has(k)) return false
            seenEarn.add(k)
            return true
          })
        }
      }
      // Side-of-book per ticker (Call position first, II side as fallback)
      // is attached here so the component never re-joins.
      const sideOf = new Map()
      for (const i of ideas) if (i.ticker && i.side) sideOf.set(i.ticker, i.side.toUpperCase())
      for (const b of book) if (b.ticker && b.position_type) sideOf.set(b.ticker, b.position_type)
      earnings = earnings.map((e) => ({ ...e, book_side: sideOf.get(e.symbol) ?? null }))

      setState({
        status: ok(diS) ? 'ready' : 'error',
        di: rows(diS)[0] ?? null,
        morning: rows(morningS)[0] ?? null,
        quads: { monthly, quarterly, monthlyShift, regional },
        regime: rows(regimeS)[0] ?? null,
        verdicts: { byTicker, date: verdictDate },
        rangeStates: { counts, movers: movers.slice(0, 5), date: sigDate },
        conflicts,
        breaks,
        exits: rows(exitS),
        book,
        rotation,
        earnings,
      })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
