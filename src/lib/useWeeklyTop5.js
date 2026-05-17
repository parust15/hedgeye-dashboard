import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const TRADING_DAYS_WINDOW = 5

/**
 * Loads the rolling weekly Top 5 rollup — every unique ticker that
 * appeared in any daily Top 5 over the trailing 5 trading days.
 *
 * Why "5 trading days" instead of "7 calendar days": robust against
 * weekends + market holidays. We don't care about gaps in the calendar,
 * only the last N actual signal_dates that exist in the table.
 *
 * Ordering:
 *   1. Tickers that appeared on multiple days first, by appearance
 *      count DESC (more repeats = more conviction across the week).
 *   2. Tickers with a single appearance, by most-recent date DESC
 *      (fresh picks bubble up over stale ones).
 *   3. Ticker symbol ASC as the final tiebreaker.
 *
 * Returns { weeklyTop5, status }.
 * Each entry: { ticker, company_name, appearances, mostRecentDate,
 *               mostRecentRank, mostRecentRationale }
 */
export function useWeeklyTop5() {
  const [weeklyTop5, setWeeklyTop5] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')

      // Step 1: discover the last N distinct signal_dates in the table.
      // Pulling distinct dates server-side keeps the second query tight
      // (≤ 5 × 5 = 25 rows) instead of guessing a row LIMIT that might
      // miss days when gaps exist.
      const datesRes = await supabase
        .from('hedgeye_call_top5')
        .select('signal_date')
        .order('signal_date', { ascending: false })
        // Overfetch a bit so we still get TRADING_DAYS_WINDOW distinct
        // dates even if a day has multiple rows (which it should — 5 per
        // day). Distinct happens client-side below.
        .limit(TRADING_DAYS_WINDOW * 8)

      if (cancelled) return
      if (datesRes.error) {
        console.warn('useWeeklyTop5: dates fetch failed:', datesRes.error)
        setStatus('error')
        return
      }

      const distinctDates = []
      const seen = new Set()
      for (const row of datesRes.data ?? []) {
        if (!row.signal_date || seen.has(row.signal_date)) continue
        seen.add(row.signal_date)
        distinctDates.push(row.signal_date)
        if (distinctDates.length === TRADING_DAYS_WINDOW) break
      }

      if (distinctDates.length === 0) {
        if (!cancelled) {
          setWeeklyTop5([])
          setStatus('ready')
        }
        return
      }

      // Step 2: pull all top5 rows across those dates.
      const rowsRes = await supabase
        .from('hedgeye_call_top5')
        .select('signal_date, rank, ticker, company_name, rationale')
        .in('signal_date', distinctDates)

      if (cancelled) return
      if (rowsRes.error) {
        console.warn('useWeeklyTop5: rows fetch failed:', rowsRes.error)
        setStatus('error')
        return
      }

      // Group by ticker, tracking appearance count + most-recent
      // signal_date / rank / rationale (since the most recent pick is
      // the one we'd want to show as the card's primary context).
      const byTicker = new Map()
      for (const r of rowsRes.data ?? []) {
        if (!r.ticker) continue
        const existing = byTicker.get(r.ticker)
        if (!existing) {
          byTicker.set(r.ticker, {
            ticker: r.ticker,
            company_name: r.company_name,
            appearances: 1,
            mostRecentDate: r.signal_date,
            mostRecentRank: r.rank,
            mostRecentRationale: r.rationale,
          })
          continue
        }
        existing.appearances += 1
        // Strings compare lexicographically and dates are ISO YYYY-MM-DD,
        // so > works for "more recent". No Date() parsing needed.
        if (r.signal_date > existing.mostRecentDate) {
          existing.mostRecentDate = r.signal_date
          existing.mostRecentRank = r.rank
          existing.mostRecentRationale = r.rationale
          // Prefer the most recent company_name in case it was updated.
          if (r.company_name) existing.company_name = r.company_name
        }
      }

      const ordered = [...byTicker.values()].sort((a, b) => {
        if (a.appearances !== b.appearances) return b.appearances - a.appearances
        if (a.mostRecentDate !== b.mostRecentDate) {
          return a.mostRecentDate < b.mostRecentDate ? 1 : -1
        }
        return a.ticker.localeCompare(b.ticker)
      })

      if (!cancelled) {
        setWeeklyTop5(ordered)
        setStatus('ready')
      }
    }

    load().catch((err) => {
      if (cancelled) return
      console.error('useWeeklyTop5: unexpected error:', err)
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [])

  return { weeklyTop5, status }
}
