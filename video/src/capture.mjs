// Captures the app's screens (v2.1 design) for comp.src.html: Plan (the why), Today (a miss prompt), Review (a suggestion).
// Usage: node capture.mjs en|pt   (the app's dev server from origin/main on APP_URL, default http://localhost:5174)
import puppeteer from 'puppeteer-core'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'

const LANG = process.argv[2] === 'pt' ? 'pt' : 'en'
const URL0 = process.env.APP_URL || 'http://localhost:5174'
const OUT = 'assets'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The sample data is English (it's user data); for the pt-BR video it's shown as a Brazilian user would write it.
// The why of the goal in focus is rewritten without "I" or "my" in both languages.
const EN = {
  'So my back stops hurting and I have energy after work.': 'To end the back pain and have energy after work.',
  'So I stop losing mornings.': 'To stop losing mornings.',
  'Because other people’s time matters as much as mine.': 'Because other people’s time matters.',
  'To think with better ideas than my own.': 'To think with better ideas.',
}
const PT = {
  'So my back stops hurting and I have energy after work.': 'Para acabar com a dor nas costas e ter energia depois do trabalho.',
  'Health': 'Saúde', 'People': 'Pessoas', 'Growth': 'Crescimento', 'Career': 'Carreira',
  'Exercise regularly': 'Treinar regularmente', 'Sleep well': 'Dormir bem', 'Be on time': 'Ser pontual',
  '30 days without sugar': '30 dias sem açúcar', 'Work at a big tech, earning 10k+': 'Trabalhar numa big tech ganhando 10k+',
  'Read 10 books a year': 'Ler 10 livros por ano', 'Answer my friends': 'Responder os amigos', 'Call my parents every week': 'Ligar para os pais toda semana',
  'So I stop losing mornings.': 'Para não perder mais as manhãs.',
  'Because other people’s time matters as much as mine.': 'Porque o tempo dos outros também importa.',
  'To prove to myself cravings pass.': 'Para provar que a vontade passa.',
  'Work on things millions use, and never worry about money again.': 'Fazer algo que milhões usam e não se preocupar com dinheiro.',
  'To think with better ideas than my own.': 'Para pensar com ideias melhores.',
  'So friends don’t feel ignored.': 'Para os amigos não se sentirem ignorados.',
  'They won’t be around forever.': 'Eles não vão estar aqui para sempre.',
  'At least 45 minutes of exercise': 'Pelo menos 45 minutos de exercício',
  'Pack the gym bag and pick tomorrow’s routine': 'Arrumar a mochila e escolher o treino de amanhã',
  'Renew gym membership': 'Renovar a academia',
  'Slept at least 7.5 hours': 'Dormi pelo menos 7,5 horas',
  'Phone charging outside the bedroom': 'Celular carregando fora do quarto',
  'Log punctuality': 'Registrar pontualidade',
  'Check tomorrow’s first appointment and when to leave': 'Ver o primeiro compromisso de amanhã e a hora de sair',
  'No added sugar all day': 'Nada de açúcar o dia todo',
  'Solved at least 2 LeetCode problems': 'Resolvi 2 problemas no LeetCode',
  'Did a mock interview with a friend': 'Fiz uma entrevista simulada',
  'Design a news feed': 'Projetar um feed de notícias', 'Get CV reviewed by a friend': 'Revisar o CV com um amigo',
  'List 8 situations from past work': 'Listar 8 situações de trabalhos anteriores', 'Ask Ana for a referral': 'Pedir indicação para a Ana',
  'Read at least 20 pages': 'Li pelo menos 20 páginas', 'Read “Deep Work”': 'Ler “Deep Work”',
  'Replied to every friend’s message by the end of the day': 'Respondi todas as mensagens até o fim do dia',
  'Message Lucas': 'Mandar mensagem pro Lucas', 'A real call with my parents, not just texts': 'Uma ligação de verdade, não só mensagens',
}
const SUBS_PT = [
  ['System design prep', 'System design'], ['Interview stories', 'Histórias para entrevistas'], ['CV & LinkedIn', 'CV e LinkedIn'],
  ['mock interview', 'entrevista simulada'], ['no sugar', 'sem açúcar'], ['punctuality', 'pontualidade'],
  ['reading', 'leitura'], ['replies', 'respostas'], ['sleep', '7,5h de sono'], ['gym', 'academia'], ['phone', 'celular'],
]
async function rewrite(p) {
  await p.evaluate((EXACT, SUBS) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (w.nextNode()) {
      const n = w.currentNode, raw = n.textContent, s = raw.trim()
      if (!s) continue
      if (EXACT[s]) { n.textContent = raw.replace(s, EXACT[s]); continue }
      let out = raw
      for (const [a, b] of SUBS) out = out.replace(new RegExp(`\\b${a}\\b`, 'g'), b)
      if (out !== raw) n.textContent = out
    }
  }, LANG === 'pt' ? PT : EN, LANG === 'pt' ? SUBS_PT : [])
  await sleep(150)
}

const lang = LANG === 'pt' ? 'pt-BR' : 'en-US'
const b = await puppeteer.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  userDataDir: tmpdir() + '/brag-video-profile-' + LANG, args: ['--lang=' + lang] })
const p = await b.newPage()
await p.setViewport({ width: 390, height: 693, deviceScaleFactor: 1080 / 390 })
await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
await p.evaluateOnNewDocument((l) => {
  Object.defineProperty(navigator, 'languages', { get: () => [l] })
  Object.defineProperty(navigator, 'language', { get: () => l })
  // Inter stands in for SF Pro (not on this machine); the dev text tool and the + button stay out of the shots.
  const css = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=block');
    :root{--font:'Inter',system-ui,sans-serif!important;--font-display:'Inter',system-ui,sans-serif!important}
    .tt-ui,.fab{display:none!important}` + (l === 'pt-BR' ? '.prompt .chip{padding:0 11px}' : '')
  // (pt-BR: 3px less chip padding keeps "✓ Esqueci" on the first row once picked, so the tap lands where the chip stays)
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s) })
}, lang)
p.on('pageerror', (e) => console.log('PAGEERR', e.message))

async function load(path) {
  await p.goto(URL0 + path, { waitUntil: 'networkidle0' }); await sleep(1800)
  // the "What's new" sheet
  await p.evaluate(() => [...document.querySelectorAll('.sheet button, [role=dialog] button')].find((x) => /Got it|Entendi/.test(x.textContent))?.click())
  await sleep(700)
  await p.evaluate(() => document.fonts.ready)
  await rewrite(p)
}
const rect = (sel) => p.evaluate((sel) => { const b = eval(sel).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }, sel)

// The app scrolls inside its screen layer, not the window.
const scrollBy = (sel, to) => p.evaluate((sel, to) => {
  const el = eval(sel)
  let sc = el.parentElement
  while (sc && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement
  sc = sc || document.scrollingElement
  sc.scrollTop += el.getBoundingClientRect().top - to
}, sel, to)

await p.goto(URL0 + '/', { waitUntil: 'networkidle0' })
await p.evaluate(async () => { const m = await import('/src/dev/sample.ts'); const d = new Date(); await m.loadSampleData(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) })
const R = {}

// Plan: the first goal card and its why
await load('/goals')
R.planCard = await rect(`document.querySelector('.goal-card')`)
R.planWhy = await rect(`document.querySelector('.goal-card .goal-why')`)
await p.screenshot({ path: `${OUT}/plan-${LANG}.png` })

// Today: the miss prompt, near the top, then "Forgot" picked
await load('/')
await scrollBy(`document.querySelector('.prompt').closest('.card')`, 150)
await sleep(600)
R.prompt = await rect(`document.querySelector('.prompt')`)
R.promptCard = await rect(`document.querySelector('.prompt').closest('.card')`)
const FORGOT = LANG === 'pt' ? 'Esqueci' : 'Forgot'
R.forgot = await rect(`[...document.querySelector('.prompt').querySelectorAll('button')].find((c) => c.textContent.trim() === '${FORGOT}')`)
await p.screenshot({ path: `${OUT}/today-${LANG}.png` })
await p.evaluate((f) => [...document.querySelector('.prompt').querySelectorAll('button')].find((c) => c.textContent.trim() === f).click(), FORGOT)
await sleep(500)
await rewrite(p)
R.promptB = await rect(`document.querySelector('.prompt')`)
await p.screenshot({ path: `${OUT}/today-forgot-${LANG}.png` })

// Review: "Add a prep?" with its evidence
await load('/review')
const Q = LANG === 'pt' ? 'Adicionar um preparo?' : 'Add a prep?'
await p.evaluate((Q) => {
  const q = [...document.querySelectorAll('.suggestion-q')].find((e) => e.textContent === Q)
  window.__s = q.parentElement
}, Q)
await scrollBy(`window.__s.closest('.card')`, 693 * 0.3)
await sleep(700)
R.sugCard = await rect(`window.__s.closest('.card')`)
R.sug = await rect(`window.__s`)
R.forgotWord = await p.evaluate((w) => {
  const el = window.__s.querySelector('.small'), node = el.firstChild, i = node.textContent.lastIndexOf(w)
  const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i + w.length)
  const bb = rg.getBoundingClientRect(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }
}, LANG === 'pt' ? 'esqueci' : 'forgot')
await p.screenshot({ path: `${OUT}/review-${LANG}.png` })

writeFileSync(`${OUT}/rects-${LANG}.json`, JSON.stringify(R, null, 1))
console.log(JSON.stringify(R))
await b.close()
