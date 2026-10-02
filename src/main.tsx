import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { inject, pageview } from '@vercel/analytics'
import { App } from './App'
import { initLang } from './i18n'
import { startSync } from './sync/controller'
import './ui/install'
import './styles.css'

// Safari may evict a web app's storage after weeks of disuse; Home Screen apps get to keep it.
navigator.storage?.persist?.().catch(() => {})

initLang()

// Vercel Web Analytics: visitors and app opens, no cookies. One page view per open (and per return
// after half an hour away), not per screen: the free plan's 50,000 events a month then cover hundreds
// of people instead of dozens. Goal and project ids are left out of the address it records.
inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
  debug: false,
  disableAutoTrack: true,
  beforeSend: (e) => ({ ...e, url: e.url.replace(/\/(goals|projects|insights\/goals)\/[0-9a-f-]{8,}/gi, '/$1/:id') }),
})
pageview({ path: location.pathname })
let hiddenAt = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now()
  else if (hiddenAt && Date.now() - hiddenAt > 30 * 60_000) pageview({ path: location.pathname })
})
registerSW({
  immediate: true,
  // A Home Screen app coming back from the background doesn't reload, so it never looks for a new
  // version. Look each time it comes to the front: a new one installs and reloads the app at once.
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})
startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
