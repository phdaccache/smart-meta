// Drives the real app (Vite dev server) at an iPhone viewport: screenshots and DOM of each screen.
import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const OUT = new URL('./shots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--lang=en-US', '--force-color-profile=srgb', '--hide-scrollbars'],
})
const page = await browser.newPage()
await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en' })
await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'language', { get: () => 'en-US' }); Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] }) })
page.on('dialog', (d) => d.accept())
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }])
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const go = async (path) => {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await wait(700)
}
const snap = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` })
  const html = await page.evaluate(() => {
    document.querySelectorAll('input').forEach((i) => { if (i.type === 'checkbox' || i.type === 'radio') { if (i.checked) i.setAttribute('checked', '') } else i.setAttribute('value', i.value) })
    document.querySelectorAll('textarea').forEach((i) => { i.textContent = i.value })
    return document.getElementById('root').innerHTML
  })
  writeFileSync(`${OUT}${name}.html`, html)
  console.log('shot', name)
}
const clickText = async (text, sel = 'button') => {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text)
    if (el) el.click()
    return !!el
  }, text, sel)
  if (!ok) console.log('no element', text)
  await wait(500)
}

await page.goto(BASE, { waitUntil: 'networkidle0' })
await wait(1500)
await snap('welcome')
await go('/welcome/areas')
for (const a of ['Health', 'Learning', 'Career']) await clickText(a)
await snap('areas')
await go('/welcome/goal/smart')
await wait(3000)
await snap('smart')
await go('/welcome/goal/s')
await snap('s-empty')
const chips = await page.evaluate(() => [...document.querySelectorAll('.intro-examples .chip, .intro-examples button')].map((b) => b.textContent.trim()))
console.log('examples', chips)
if (chips.length) await clickText(chips[0])
await snap('s')
for (const st of ['m', 'a', 'r', 't', 'prep']) {
  await go(`/welcome/goal/${st}`)
  if (st === 'r') { await page.type('textarea', 'So my back stops hurting and I have energy after work.'); await wait(300) }
  if (st === 't') await clickText('3 months')
  if (st === 'prep') { await clickText('Too tired'); await wait(400) }
  await snap(st)
}

// Sample data, then the main screens.
await page.evaluate(async () => {
  const { loadSampleData } = await import('/src/dev/sample.ts')
  const { toDateStr } = await import('/src/lib/dates.ts')
  await loadSampleData(toDateStr(new Date()))
})
await page.evaluate(() => localStorage.setItem('seen-release', '2026-10-tutorial'))
await page.reload({ waitUntil: 'networkidle0' })
await wait(1500)
for (const [name, path] of [['today', '/'], ['plan', '/goals'], ['review', '/review'], ['insights', '/insights']]) {
  await go(path)
  await wait(800)
  await snap(name)
  await page.setViewport({ width: 390, height: 2400, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await wait(400)
  await page.screenshot({ path: `${OUT}${name}-full.png` })
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
}
await browser.close()
