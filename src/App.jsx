import { useEffect, useState } from 'react'
import { TopTabs } from './components/TopTabs'
import { RiskRangesPanel } from './components/RiskRangesPanel'
import { TheCallPanel } from './components/TheCallPanel'
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

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
    } catch (err) {
      console.warn('Failed to persist activeTab to localStorage:', err)
    }
  }, [activeTab])

  return (
    <div className="app">
      <TopTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'risk-ranges' && <RiskRangesPanel />}
      {activeTab === 'the-call' && <TheCallPanel />}
    </div>
  )
}
