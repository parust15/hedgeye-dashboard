import { useCallback, useEffect, useMemo, useState } from 'react'
import { TopTabs } from './components/TopTabs'
import { RiskRangesPanel } from './components/RiskRangesPanel'
import { TheCallPanel } from './components/TheCallPanel'
import { TickerDetailModal } from './components/TickerDetailModal'
import { useAllTickers } from './lib/useAllTickers'
import './App.css'

const ACTIVE_TAB_KEY = 'dashboard.activeTab'
const VALID_TABS = ['risk-ranges', 'the-call']

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

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
    } catch (err) {
      console.warn('Failed to persist activeTab to localStorage:', err)
    }
  }, [activeTab])

  // Open the modal AND switch tabs. RR's "VIEW CALL" button uses this so
  // a user clicking the button on a Risk Ranges card lands on The Call
  // with the modal already open.
  const openCallModal = useCallback((position) => {
    setActiveTab('the-call')
    setModalPosition(position)
  }, [])

  const closeModal = useCallback(() => setModalPosition(null), [])

  return (
    <div className="app">
      <TopTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'risk-ranges' && (
        <RiskRangesPanel
          allTickersByTicker={allTickersByTicker}
          onViewCall={openCallModal}
        />
      )}
      {activeTab === 'the-call' && (
        <TheCallPanel
          allTickers={allTickers}
          allTickersByTicker={allTickersByTicker}
          onOpenModal={setModalPosition}
        />
      )}
      {modalPosition && (
        <TickerDetailModal position={modalPosition} onClose={closeModal} />
      )}
    </div>
  )
}
