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
    self.registration.showNotification(title, {
      body: m && typeof m.body === 'string' ? m.body : '',
      tag: m && typeof m.tag === 'string' ? m.tag : undefined,
      icon: '/icons/icon-192.png',
      data: { url: appPath(m && m.url) },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = appPath(event.notification.data && event.notification.data.url)
  // focus() or openWindow() first, while the tap still allows it: Android ignores them after other work.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w)
      if (!open) return self.clients.openWindow(path)
      return open.focus().then((w) => (w || open).postMessage({ type: 'open', path }))
    }),
  )
})
