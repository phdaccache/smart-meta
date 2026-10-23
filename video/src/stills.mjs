// node stills.mjs <lang> <outDir> t1 t2 ...   (PNG stills of the composition at those times)
import puppeteer from 'puppeteer-core'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
const [lang, out, ...ts] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: tmpdir() + '/brag-video-comp', args: ['--allow-file-access-from-files'] })
const p = await b.newPage()
await p.setViewport({ width: 1080, height: 1920 })
p.on('pageerror', (e) => console.log('PAGEERR', e.message))
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await p.goto(pathToFileURL(process.cwd() + `/comp-${lang}.html`).href, { waitUntil: 'networkidle0' })
await p.evaluate(() => window.ready)
for (const t of ts.map(Number)) {
  await p.evaluate((t) => window.render(t), t)
  await p.screenshot({ path: `${out}/s-${lang}-${t.toFixed(2).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 75 })
}
await b.close()
