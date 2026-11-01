// Smart Meta: showing pushes and opening them (stage S5 of docs/notifications, plan §5).
// Loaded into the generated service worker by `workbox.importScripts` (vite.config.ts). The payload is
// a PushMessage (supabase/functions/_shared/webpush.ts), already decrypted by the browser.

/** A path inside the app, never another site (plan §5: deep links are relative paths only). */
function appPath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

self.addEventListener('push', (event) => {
  let m = null
  try {
    m = event.data ? event.data.json() : null
  } catch {
    m = null
  }
  // iPhone allows no silent push: something always shows, even for a payload this can't read.
  const title = m && typeof m.title === 'string' && m.title ? m.title : 'Smart Meta'
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: m && typeof m.body === 'string' ? m.body : '',
        tag: m && typeof m.tag === 'string' ? m.tag : undefined,
        icon: '/icons/icon-192.png',
        data: { url: appPath(m && m.url) },
      }),
      setBadge(m && m.badge),
    ]),
  )
})

/** The app's icon, when the push carries a number (spec NO-20). A phone that can't show one just doesn't. */
function setBadge(n) {
  if (!Number.isInteger(n) || n < 0 || !('setAppBadge' in self.navigator)) return Promise.resolve()
  return (n ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {})
}

/**
 * Where the last tap should take the app, for the app to read when it starts or comes to the front
 * (src/main.tsx). The iPhone brought an app already open to the front without its message ever arriving
 * (S5 test): only an app it had closed, opened at the push's address, went there.
 */
const TAP_CACHE = 'smart-meta-tap'
const TAP_KEY = '/__tap'

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = appPath(event.notification.data && event.notification.data.url)
  const at = Date.now()
  // focus() or openWindow() first, while the tap still allows it: Android ignores them after other work.
  const go = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => 'focus' in w)
    if (!open) return self.clients.openWindow(path)
    return open.focus().catch(() => open).then((w) => (w || open).postMessage({ type: 'open', path, at }))
  })
  const keep = caches.open(TAP_CACHE)
    .then((c) => c.put(TAP_KEY, new Response(JSON.stringify({ path, at }), { headers: { 'Content-Type': 'application/json' } })))
    .catch(() => {})
  event.waitUntil(Promise.all([go.catch(() => {}), keep]))
})
