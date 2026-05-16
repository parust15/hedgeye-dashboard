import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Geist Mono — variable font, wght axis only. Browsers fetch the latin
// subset via unicode-range; cyrillic / latin-ext only download if used.
import '@fontsource-variable/geist-mono/wght.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
