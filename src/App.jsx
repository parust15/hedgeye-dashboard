import { useCallback, useEffect, useState } from 'react'
import { TopTabs } from './components/TopTabs'
import { RiskRangesPanel } from './components/RiskRangesPanel'
import { TheCallPanel } from './components/TheCallPanel'
import { EtfProPlusPanel } from './components/EtfProPlusPanel'
import { EtfReRankPanel } from './components/EtfReRankPanel'
import { MacroShowPanel } from './components/MacroShowPanel'
import { SignalStrengthPanel } from './components/SignalStrengthPanel'
import { TabBarPreview } from './components/preview/TabBarPreview'
import { TickerDetailModal } from './components/TickerDetailModal'
import { VixHeaderPill } from './components/VixBucketPill'
import { AmbientBackground } from './components/AmbientBackground'
import { useAllTickers } from './lib/useAllTickers'
import { useVixBucket } from './lib/useVixBucket'
import { supabase } from './lib/supabase'
import './App.css'

const ACTIVE_TAB_KEY = 'dashboard.activeTab'
const VALID_TABS = [
  'risk-ranges',
  'the-call',
  'etf-pro-plus',
  'etf-re-rank',
  'macro-show',
  'signal-strength',
]

function loadInitialTab() {
  try {
    const raw = localStorage.getItem(ACTIVE_TAB_KEY)
    if (raw && VALID_TABS.includes(raw)) return raw
  } catch (err) {
    console.warn('Failed to read activeTab from localStorage:', err)
  }
  return 'risk-ranges'
}

export default function App() {
  const [activeTab, setActiveTab] = useState(loadInitialTab)

  // Modal state lifted to App so both panels can open the ticker detail
  // modal from anywhere. `modalPosition` is whatever object the caller had
  // available — TheCallPanel passes its full position row; RiskRangesPanel
  // builds a thin synthetic record from the all-tickers lookup.
  const [modalPosition, setModalPosition] = useState(null)

  // One-shot all-tickers fetch lives here so both panels share the same
  // Map<ticker, allTickersRow> without double-querying Supabase. RR uses
  // it to decide which cards get a "VIEW CALL" button; The Call uses it
  // for sector grouping + the All Time view.
  const { rows: allTickers, byTicker: allTickersByTicker } = useAllTickers()

  // VIX regime — polled every 30min. Rendered top-right as a persistent
  // header pill, and forwarded to RR so the VIX SignalCard can show the
  // same bucket label next to its trend pill.
  const { data: vixBucket } = useVixBucket()

  // Range-state distribution for the Aurora Field ambient. One-shot
  // fetch of (ticker, range_state) at the latest signal_date. Each row
  // shape: { ticker, range_state } — exactly what AmbientBackground's
  // dominantTint() weight-averages. Independent of RR's heavier
  // useDashboardData fetch so the ambient hydrates as fast as possible.
  const [signalTickers, setSignalTickers] = useState([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const latestRes = await supabase
          .from('hedgeye_signals_v')
          .select('signal_date')
          .order('signal_date', { ascending: false })
          .limit(1)
        if (cancelled || latestRes.error || !latestRes.data?.[0]) return
        const date = latestRes.data[0].signal_date
        const rowsRes = await supabase
          .from('hedgeye_signals_v')
          .select('ticker, range_state')
          .eq('signal_date', date)
        if (cancelled || rowsRes.error) return
        setSignalTickers(rowsRes.data ?? [])
      } catch (err) {
        // Non-fatal — the ambient just renders with neutral tint. Log
        // so a real outage shows up in console.
        if (!cancelled) console.warn('App: signalTickers fetch failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
    } catch (err) {
      console.warn('Failed to persist activeTab to localStorage:', err)
    }
  }, [activeTab])

  // Open the ticker modal IN PLACE — the active tab does not change. RR's
  // "VIEW CALL INFO" button uses this so the user can peek at call data
  // without losing their Risk Ranges context. The caller tags the
  // position object with source='risk-ranges' so the modal renders a
  // "CALL INFO — TICKER" overlay header.
  const openTickerModal = useCallback((position) => {
    setModalPosition(position)
  }, [])

  const closeModal = useCallback(() => setModalPosition(null), [])

  // ?tabsPreview=1 short-circuits the dashboard and renders the
  // side-by-side tab-bar variant preview instead. Gated to DEV builds
  // so prod users can't reach it via URL fiddling (and so the preview/*
  // chunk doesn't ship in the prod bundle once we tree-shake the
  // unreachable branch). The cosmos ambient still paints behind.
  const isTabsPreview =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tabsPreview') === '1'

  if (isTabsPreview) {
    return (
      <div className="app">
        <AmbientBackground tickers={signalTickers} />
        <TabBarPreview />
      </div>
    )
  }

  return (
    <div className="app">
      <AmbientBackground tickers={signalTickers} />
      <div className="top-bar">
        <TopTabs active={activeTab} onChange={setActiveTab} />
        <VixHeaderPill data={vixBucket} />
      </div>
      {activeTab === 'risk-ranges' && (
        <RiskRangesPanel
          allTickersByTicker={allTickersByTicker}
          onViewCall={openTickerModal}
          vixBucket={vixBucket}
        />
      )}
      {activeTab === 'the-call' && (
        <TheCallPanel
          allTickers={allTickers}
          allTickersByTicker={allTickersByTicker}
          onOpenModal={setModalPosition}
        />
      )}
      {activeTab === 'etf-pro-plus' && <EtfProPlusPanel />}
      {activeTab === 'etf-re-rank' && <EtfReRankPanel />}
      {activeTab === 'macro-show' && <MacroShowPanel />}
      {activeTab === 'signal-strength' && <SignalStrengthPanel />}
      {modalPosition && (
        <TickerDetailModal position={modalPosition} onClose={closeModal} />
      )}
    </div>
  )
}
