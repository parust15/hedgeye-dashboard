// URL safety helpers for data-sourced strings. The dashboard renders
// Supabase rows directly into <img src> and <a href> attributes — if a
// row ever carried a `javascript:` or `data:` URL (whether by mistake,
// or via a future ingestion bug, or a hypothetical poisoned upstream),
// we shouldn't let it through.
//
// `safeHttpUrl(url)` returns the original URL if it's http(s) and
// otherwise returns null. Callers can use it as a guard:
//   const safe = safeHttpUrl(meta.feedItemUrl)
//   {safe && <a href={safe}>…</a>}

const SAFE_SCHEME = /^https?:\/\//i

export function safeHttpUrl(url) {
  if (typeof url !== 'string') return null
  if (!SAFE_SCHEME.test(url)) return null
  return url
}
