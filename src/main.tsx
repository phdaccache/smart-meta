import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { inject, pageview } from '@vercel/analytics'
import { App } from './App'
import { initLang } from './i18n'
import { startSync } from './sync/controller'
import { log, logUncaught } from './sync/log'
import { CrashScreen } from './ui/CrashScreen'
import { holdOpenLock, OpenTwice } from './ui/OpenTwice'
import { installCaretAtEnd } from './ui/caret'
import { navigate, reloadFromBottom } from './ui/router'
import './ui/install'
import './styles.css'

// Developer: tint invisible layers (see Settings → Developer).
try { if (localStorage.getItem('debugPaint')) document.documentElement.classList.add('debug-paint') } catch { /* private mode */ }

// Safari may evict a web app's storage after weeks of disuse; Home Screen apps get to keep it.
navigator.storage?.persist?.().catch(() => {})

initLang()
installCaretAtEnd()

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
  onNeedReload: () => reloadFromBottom(),
  // A Home Screen app coming back from the background doesn't reload, so it never looks for a new
  // version. Look each time it comes to the front: a new one installs and reloads the app at once.
  onRegisteredSW(_url, registration) {
    if (!registration) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})
// Tapping a push: the service worker opens the app where the push points, or brings an open one to the front
// and says where to go. It also leaves the tap in a cache (public/push-sw.js), read here on start and each
// time the app comes to the front: on the iPhone, an open app came to the front but its message never came.
const launchedAt = location.pathname + location.search
const startedAt = Date.now()
/** The last tap handled, so the message and the cache don't both act on it. */
let lastTap = 0
function openTapped(path: unknown, at: number, how: string) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || at <= lastTap) return
  lastTap = at
  log('push', 'tapped', how, path.split('?')[0], path.includes('remind=') ? 'remind' : '', `${Date.now() - at} ms ago`)
  // Already there, it stays: going again would leave the same screen twice in Back's way. So does the tap that
  // opened this page at it; a later tap to the same address is a new one, wherever the app is by now.
  if (path !== location.pathname + location.search && !(how === 'kept' && path === launchedAt && at <= startedAt)) navigate(path)
}
navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.type === 'open') openTapped(e.data.path, typeof e.data.at === 'number' ? e.data.at : Date.now(), 'message')
})
/** A tap this recent is still to be followed; an older one was for a moment that's gone. */
const TAP_FRESH_MS = 60_000
async function readTap() {
  try {
    const cache = await caches.open('smart-meta-tap')
    const trace = await cache.match('/__trace')
    if (trace) {
      await cache.delete('/__trace')
      for (const line of (await trace.json()) as string[]) log('worker', line)
    }
    const res = await cache.match('/__tap')
    if (!res) return
    await cache.delete('/__tap')
    const tap = (await res.json()) as { path?: unknown; at?: unknown }
    if (typeof tap.at === 'number' && Date.now() - tap.at < TAP_FRESH_MS) openTapped(tap.path, tap.at, 'kept')
  } catch {
    // No cache (private mode, an old browser): the message is all there is.
  }
}
// The worker may still be writing it as the app shows: look again a moment later.
const lookForTap = () => [0, 600, 2000, 5000, 10_000].forEach((ms) => setTimeout(() => void readTap(), ms))
if ('caches' in window) {
  lookForTap()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    log('app', 'came to the front')
    lookForTap()
  })
}
logUncaught()
holdOpenLock()
startSync()
// Text tool, dev server only (src/dev/texts/README.md).
if (import.meta.env.DEV) void import('./dev/texts/mount')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      <App />
      {/* Outside App: it must show even when a blocked database keeps App from drawing. */}
      <OpenTwice />
    </CrashScreen>
  </StrictMode>,
)
