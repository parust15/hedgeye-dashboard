import { useCallback, useEffect, useState } from 'react'
import { TopTabs } from './components/TopTabs'
import { DailyBrief } from './components/DailyBrief'
import { RiskRangesPanel } from './components/RiskRangesPanel'
import { TheCallPanel } from './components/TheCallPanel'
import { EtfProPlusPanel } from './components/EtfProPlusPanel'
import { EtfReRankPanel } from './components/EtfReRankPanel'
import { MacroShowPanel } from './components/MacroShowPanel'
import { SignalStrengthPanel } from './components/SignalStrengthPanel'
import { InvestingIdeasPanel } from './components/InvestingIdeasPanel'
import { MomoTrackerPanel } from './components/MomoTrackerPanel'
import { TabBarPreview } from './components/preview/TabBarPreview'
import { TickerDetailModal } from './components/TickerDetailModal'
import { AmbientBackground } from './components/AmbientBackground'
import { useAllTickers } from './lib/useAllTickers'
import { useVixBucket } from './lib/useVixBucket'
import { TickerProvider, useTickerFocus } from './lib/TickerContext'
import { TickerSignalStateProvider } from './lib/TickerSignalStateContext'
import { TAB_ID_SET } from './lib/tabs'
import { supabase } from './lib/supabase'
import './App.css'

const ACTIVE_TAB_KEY = 'dashboard.activeTab'

function loadInitialTab() {
  try {
    const raw = localStorage.getItem(ACTIVE_TAB_KEY)
    if (raw && TAB_ID_SET.has(raw)) return raw
  } catch (err) {
    console.warn('Failed to read activeTab from localStorage:', err)
  }
  return 'risk-ranges'
}

// Inner body — has to live below <TickerProvider> so useTickerFocus()
// works. App provides the provider, AppBody consumes its hooks.
function AppBody() {
  const [activeTab, setActiveTab] = useState(loadInitialTab)

  // Modal state is owned by TickerContext. RR + The Call pass a full
  // position row via focusTicker(ticker, { source, payload: position })
  // — TickerDetailModal reads focus.payload to render the legacy
  // call-info body. Other panels omit payload; the modal falls back
  // to the cross-tab peek body.
  const { focus, focusTicker, unfocus } = useTickerFocus()

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

  // Modal open adapters — one per panel that passes a full position
  // record. Each adapter tags focus.source so TickerDetailModal renders
  // the right overlay label (RR shows "CALL INFO — TICKER"; The Call
  // shows the bare ticker since the user IS on The Call). The position
  // rides along as focus.payload so the modal renders the legacy
  // call-info body (analyst notes / Top 5 history / conviction bar).
  const openFromRr = useCallback(
    (position) => {
      if (!position?.ticker) return
      focusTicker(position.ticker, {
        source: 'risk-ranges',
        payload: position,
      })
    },
    [focusTicker]
  )
  const openFromCall = useCallback(
    (position) => {
      if (!position?.ticker) return
      focusTicker(position.ticker, {
        source: 'the-call',
        payload: position,
      })
    },
    [focusTicker]
  )

  const closeModal = useCallback(() => unfocus(), [unfocus])

  // CrossLevelPeek tile click → switch active tab + close the modal.
  const handleJumpTab = useCallback((tabId) => {
    if (TAB_ID_SET.has(tabId)) setActiveTab(tabId)
  }, [])

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
      </div>
      {activeTab === 'daily-brief' && <DailyBrief />}
      {activeTab === 'risk-ranges' && (
        <RiskRangesPanel
          allTickersByTicker={allTickersByTicker}
          onViewCall={openFromRr}
          vixBucket={vixBucket}
        />
      )}
      {activeTab === 'the-call' && (
        <TheCallPanel
          allTickers={allTickers}
          allTickersByTicker={allTickersByTicker}
          onOpenModal={openFromCall}
        />
      )}
      {activeTab === 'etf-pro-plus' && <EtfProPlusPanel />}
      {activeTab === 'etf-re-rank' && <EtfReRankPanel />}
      {activeTab === 'macro-show' && <MacroShowPanel />}
      {activeTab === 'signal-strength' && <SignalStrengthPanel />}
      {activeTab === 'investing-ideas' && <InvestingIdeasPanel />}
      {activeTab === 'momo' && <MomoTrackerPanel />}
      {focus && (
        <TickerDetailModal
          focus={focus}
          onClose={closeModal}
          onJumpTab={handleJumpTab}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <TickerProvider>
      <TickerSignalStateProvider>
        <AppBody />
      </TickerSignalStateProvider>
    </TickerProvider>
  )
}
