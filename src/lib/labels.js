// Canonical visible label strings. Import LABEL.* instead of hardcoding
// strings in panel JSX so we never drift again (e.g. RR's "DATE ADDED"
// vs Re-Rank's "ADDED" — same concept, two literals).
//
// Filter chips (BULLISH, BEARISH, LONG, SHORT, NEUTRAL) intentionally
// keep their full directional words — they describe what the chip
// FILTERS, not a ticker's state. Bias pills, by contrast, use color +
// timeframe label and never show the direction word.
export const LABEL = {
  filter: {
    all: 'ALL',
    long: 'LONG',
    short: 'SHORT',
    neutral: 'NEUTRAL',
    bullish: 'BULLISH',
    bearish: 'BEARISH',
  },
  column: {
    ticker: 'TICKER',
    rank: 'RANK',
    assetClass: 'ASSET CLASS',
    // Short form for narrow contexts (top-box rows where "ASSET CLASS"
    // would crowd the grid). Same underlying data — see Finding #3.
    asset: 'ASSET',
    sector: 'SECTOR',
    dateAdded: 'ADDED',
    daysOnList: 'DAYS',
    prevClose: 'PREV CLOSE',
    lrr: 'LRR',
    trr: 'TRR',
    range: 'RANGE',
    trend: 'TREND',
    trade: 'TRADE',
    tail: 'TAIL',
    price: 'PRICE',
    side: 'SIDE',
    pos: 'POS',
  },
  status: {
    snapshotChip: 'Snapshot',
    emptyDefault: 'No data yet.',
  },
}
