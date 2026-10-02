// node render.mjs stills 0.5 2 4 ...   → work/stills/t-<s>.png
// node render.mjs video                → work/frames/f-00000.jpg (then ffmpeg)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const [mode, ...rest] = process.argv.slice(2)
const FPS = 30
const VERT = process.env.FORMAT === 'vertical'
const FR = VERT ? 'frames-v' : 'frames'
const ST = VERT ? 'stills-v' : 'stills'
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--allow-file-access-from-files', '--font-render-hinting=none'],
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()))
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await page.setViewport(VERT ? { width: 1080, height: 1920, deviceScaleFactor: 1 } : { width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(here + 'comp/index.html').href + (VERT ? '?format=vertical' : ''), { waitUntil: 'networkidle0' })
const { duration } = await page.evaluate(() => window.ready)

if (mode === 'stills') {
  mkdirSync(here + ST, { recursive: true })
  for (const s of rest) {
    await page.evaluate((t) => renderAt(t), Number(s))
    await page.screenshot({ path: `${here}${ST}/t-${s}.png` })
  }
} else {
  mkdirSync(here + FR, { recursive: true })
  const n = Math.round(duration * FPS)
  const [a = 0, b = n] = rest.map(Number)
  for (let f = a; f < Math.min(b, n); f++) {
    await page.evaluate((t) => renderAt(t), f / FPS)
    await page.screenshot({ path: `${here}${FR}/f-${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 })
    if (f % 60 === 0) console.log('frame', f, '/', n)
  }
}
await browser.close()
