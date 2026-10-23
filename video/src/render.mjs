// node render.mjs <lang> <out.mp4>: renders comp-<lang>.html frame by frame (1080×1920, 30 fps, 30 s) and muxes audio.wav
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
const FF = process.env.FFMPEG || 'C:/Users/pedro/AppData/Roaming/Python/Python314/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
const [lang, out] = process.argv.slice(2)
const FPS = 30, DUR = 30, N = FPS * DUR
const ff = spawn(FF, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', 'audio.wav',
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const b = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  userDataDir: tmpdir() + '/brag-video-render-' + lang, args: ['--allow-file-access-from-files'] })
const p = await b.newPage()
await p.setViewport({ width: 1080, height: 1920 })
p.on('pageerror', (e) => console.log('PAGEERR', e.message))
await p.goto(pathToFileURL(process.cwd() + `/comp-${lang}.html`).href, { waitUntil: 'networkidle0' })
await p.evaluate(() => window.ready)
for (const t of [3, 8, 12, 16, 20, 25, 0]) await p.evaluate((t) => window.render(t), t)
await new Promise((r) => setTimeout(r, 500))
for (let i = 0; i < N; i++) {
  await p.evaluate((t) => window.render(t), i / FPS)
  const buf = await p.screenshot({ type: 'png' })
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r))
  if (i % 150 === 0) console.log(lang, 'frame', i, '/', N)
}
ff.stdin.end()
await new Promise((r) => ff.on('close', r))
await b.close()
console.log('done', out)
