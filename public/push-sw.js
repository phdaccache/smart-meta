// Smart Meta: showing pushes and opening them (stage S5 of docs/notifications, plan §5).
// Loaded into the generated service worker by `workbox.importScripts` (vite.config.ts). The payload is
// a PushMessage (supabase/functions/_shared/webpush.ts), already decrypted by the browser.

/** A path inside the app, never another site (plan §5: deep links are relative paths only). */
function appPath(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

let tracing = Promise.resolve()
/**
 * What the worker saw, for the app to copy into the diagnostics log (src/main.tsx): kinds only, no text or ids.
 * The S6 test had the app coming to the front after a tap with no sign of the tap: did it ever reach the worker?
 */
function trace(text) {
  const line = `${new Date().toISOString().slice(11, 23)} ${text}`
  // One at a time: two at once would each write the list without the other's line.
  tracing = tracing.then(() => caches.open('smart-meta-tap'))
    .then((c) => c.match('/__trace')
      .then((r) => (r ? r.json() : []))
      .then((list) => c.put('/__trace', new Response(JSON.stringify([...list, line].slice(-20)), { headers: { 'Content-Type': 'application/json' } }))))
    .catch(() => {})
  return tracing
}
const kindOf = (s) => (typeof s === 'string' ? s.split(/[:/?=]/).filter(Boolean)[0] || 'today' : 'none')

/**
 * Notes a push for the app, which works out from it a tap that never came here (see findLostTap in src/main.tsx).
 * In a database, since an open app on the iPhone doesn't see what this worker writes to the cache (S6 test).
 */
function noteRecent(tag, path) {
  if (!tag) return Promise.resolve()
  return new Promise((done, fail) => {
    const open = indexedDB.open('smart-meta-push', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('recent', { keyPath: 'tag' })
    open.onerror = () => fail(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('recent', 'readwrite')
      tx.objectStore('recent').put({ tag, path, at: Date.now() })
      tx.oncomplete = () => {
        open.result.close()
        done()
      }
      tx.onabort = () => fail(tx.error)
    }
  }).catch((e) => trace(`note failed ${e && e.name}`))
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
      noteRecent(m && typeof m.tag === 'string' ? m.tag : null, appPath(m && m.url)),
      trace(`push ${kindOf(m && m.tag)}`),
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
    void trace(`click sees ${windows.length} windows ${windows.map((w) => w.visibilityState).join(' ')}`)
    const open = windows.find((w) => 'focus' in w)
    if (!open) {
      // The iPhone is already opening the app by itself: the page starts 40 ms after this event, and reads the tap
      // from the cache. A window asked for here left the white page behind, with its browser bar and no way
      // back, one back swipe later (S6 test, twice in two tries).
      if (/iP(hone|ad|od)/.test(self.navigator.userAgent)) return trace('click leaves it to the phone')
      return self.clients.openWindow(path)
    }
    return open.focus().catch((e) => {
      void trace(`focus failed ${e && e.name}`)
      return open
    }).then((w) => {
      ;(w || open).postMessage({ type: 'open', path, at })
      return trace('click message sent')
    })
  })
  const keep = caches.open(TAP_CACHE)
    .then((c) => c.put(TAP_KEY, new Response(JSON.stringify({ path, at }), { headers: { 'Content-Type': 'application/json' } })))
    .catch(() => {})
  event.waitUntil(Promise.all([
    go.catch((e) => trace(`open failed ${e && e.name}`)),
    keep,
    trace(`click ${kindOf(path)}`),
  ]))
})
