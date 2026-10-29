// S1 spike (throwaway): shows test pushes and keeps a small log the page can read.
const LOG = 's1-log'

async function addLog(entry) {
  const cache = await caches.open(LOG)
  const res = await cache.match('/s1/__log')
  const list = res ? await res.json() : []
  list.push({ ...entry, at: Date.now() })
  await cache.put('/s1/__log', new Response(JSON.stringify(list.slice(-20))))
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Test push', body: event.data && event.data.text() } }
  event.waitUntil((async () => {
    await addLog({ type: 'push', sentAt: data.sentAt || null })
    await self.registration.showNotification(data.title || 'Smart Meta test', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/s1/index.html?from=push' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/s1/index.html'
  event.waitUntil((async () => {
    await addLog({ type: 'click' })
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) { await w.navigate(url).catch(() => {}); return w.focus() }
    }
    return self.clients.openWindow(url)
  })())
})
