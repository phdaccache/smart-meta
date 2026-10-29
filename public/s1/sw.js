// S1 spike (throwaway): shows test pushes and keeps a small log the page can read.
const LOG = 's1-log'

async function addLog(entry) {
  const cache = await caches.open(LOG)
  const res = await cache.match('/s1/__log')
  const list = res ? await res.json() : []
  list.push({ ...entry, at: Date.now() })
  await cache.put('/s1/__log', new Response(JSON.stringify(list.slice(-20))))
}

const VERSION = 2

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(Promise.all([self.clients.claim(), addLog({ type: 'worker', v: VERSION })])))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Test push', body: event.data && event.data.text() } }
  event.waitUntil((async () => {
    await addLog({ type: 'push', sentAt: data.sentAt || null })
    await self.registration.showNotification(data.title || 'Smart Meta test', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 's1-test',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/s1/index.html?from=push' },
    })
  })())
})

// Open or focus the window first, while the tap still allows it (Android is strict about this),
// and only then write the log.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/s1/index.html', self.location.origin).href
  event.waitUntil((async () => {
    let how = 'opened'
    let error = null
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const win = wins.find((w) => new URL(w.url).pathname.startsWith('/s1/'))
      if (win) {
        how = 'focused'
        await win.focus()
        if ('navigate' in win) await win.navigate(url).catch(() => win.postMessage({ type: 'from-push' }))
      } else {
        const opened = await self.clients.openWindow(url)
        if (!opened) how = 'openWindow returned nothing'
      }
    } catch (e) {
      how = 'failed'
      error = String(e && e.message || e)
    }
    await addLog({ type: 'click', how, error, v: VERSION })
  })())
})
