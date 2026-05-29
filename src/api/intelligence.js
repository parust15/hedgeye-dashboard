// Daily-intelligence data access for the Command Center.
//
// NOTE: the original spec sketched these as raw `fetch()` calls against
// SUPABASE_URL/SUPABASE_KEY, but this codebase has no such constants —
// every Supabase read goes through the shared supabase-js client in
// src/lib/supabase.js. These wrappers use that client (anon key, RLS)
// and keep the spec's function names + return shapes intact.
import { supabase } from '../lib/supabase'

// Full daily intelligence aggregation — one row, many JSONB columns
// (daily_intelligence_v). Returns the row object or null.
export async function fetchDailyIntelligence() {
  const { data, error } = await supabase
    .from('daily_intelligence_v')
    .select('*')
    .limit(1)
  if (error) {
    console.warn('fetchDailyIntelligence failed:', error)
    return null
  }
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

// All intelligence for one ticker across the five levels (RPC).
export async function fetchTickerIntelligence(ticker) {
  const { data, error } = await supabase.rpc('ticker_intelligence', {
    p_ticker: ticker,
  })
  if (error) {
    console.warn('fetchTickerIntelligence failed:', error)
    return null
  }
  return data
}

// Today's AI verdicts for the ticker chips, keyed by block_key:
// { 'driver:SPX': { short_verdict, headline, detail }, ... }.
export async function fetchDailyInsights(date) {
  if (!date) return {}
  const { data, error } = await supabase
    .from('macro_insights')
    .select('block_key, short_verdict, headline, detail, market_posture')
    .eq('insight_date', date)
    .order('block_key', { ascending: true })
  if (error) {
    console.warn('fetchDailyInsights failed:', error)
    return {}
  }
  return Object.fromEntries((data || []).map((r) => [r.block_key, r]))
}

// Peter Tarr semantic search (n8n webhook, NOT Supabase). Lazy only —
// never call on initial mount. ~2–7s latency. Fails soft to an empty
// result so PT sections silently hide on error/timeout.
export async function fetchPTSearch({ query, tickers, limit = 6, types, threshold = 0.28, dateFrom }) {
  try {
    const body = { query, limit, similarity_threshold: threshold }
    if (tickers?.length) body.tickers = tickers
    if (types?.length) body.types = types
    if (dateFrom) body.date_from = dateFrom
    const res = await fetch('https://parust15.app.n8n.cloud/webhook/pt-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { units: [], count: 0 }
    return await res.json()
  } catch {
    return { units: [], count: 0 }
  }
}
