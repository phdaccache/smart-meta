import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { startSync } from './sync/controller'
import './styles.css'

// Safari may evict a web app's storage after weeks of disuse; Home Screen apps get to keep it.
navigator.storage?.persist?.().catch(() => {})

registerSW({ immediate: true })
startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
