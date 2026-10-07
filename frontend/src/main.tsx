import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { feedback } from './utils/feedback'
import { applyTheme, loadTheme } from './utils/theme'

// Before the first render, so the saved colours show without a flash of the default theme.
applyTheme(loadTheme(), false)

// Capture phase so this fires even for clicks inside Modal (which stops bubbling to the backdrop).
document.addEventListener(
  'click',
  (e) => {
    if ((e.target as HTMLElement).closest?.('button')) feedback.tap()
  },
  true,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
