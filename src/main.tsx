import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { inject } from '@vercel/analytics'
import { App } from './App'
import { initLang } from './i18n'
import { startSync } from './sync/controller'
import './ui/install'
import './styles.css'

// Safari may evict a web app's storage after weeks of disuse; Home Screen apps get to keep it.
navigator.storage?.persist?.().catch(() => {})

initLang()

// Vercel Web Analytics: page views and visitors, no cookies. Goal and project ids are left out
// of the addresses it records, so only which screen was opened gets counted.
inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
  debug: false,
  beforeSend: (e) => ({ ...e, url: e.url.replace(/\/(goals|projects|insights\/goals)\/[0-9a-f-]{8,}/gi, '/$1/:id') }),
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
