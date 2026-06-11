import { PreMarketChecklist } from './dailyBrief/PreMarketChecklist'

// The Daily Summary tab (id stays `daily-brief` — localStorage-coupled).
// Renders the Pre-Market Checklist: seven ordered checks the trader
// walks before the open, structured by the Hedgeye 5-level confluence.
export function DailyBrief() {
  return <PreMarketChecklist />
}
