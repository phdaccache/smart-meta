// Every frame is a pure function of time: window.renderAt(t) sets the whole stage for second t.
const DUR = 22
// Landscape 1920×1080 by default; ?format=vertical lays the same timeline out at 1080×1920 for Reels.
const V = new URLSearchParams(location.search).get('format') === 'vertical'
if (V) document.documentElement.classList.add('v')
const L = V ? {
  headY: 1110, bigC: { x: 540, y: 840 }, capCY: 520, exit: 1150, taDy: 210,
  rest: { cx: 540, cy: 1215, s: 1.05 }, fx: 540, fy: 1170,
  scatter: [{ x: 90, y: 390, r: -7 }, { x: 590, y: 310, r: 5 }, { x: 330, y: 600, r: -3 }, { x: 610, y: 780, r: 8 }, { x: 70, y: 900, r: 4 }],
  head: [['Stop', 'dropping'], ['goals', 'you', 'never'], ['really', 'defined.']],
} : {
  headY: 640, bigC: { x: 960, y: 520 }, capCY: 540, exit: 760, taDy: 0,
  rest: { cx: 1350, cy: 540, s: 1.12 }, fx: 1340, fy: 530,
  scatter: [{ x: 210, y: 150, r: -7 }, { x: 1260, y: 110, r: 5 }, { x: 700, y: 330, r: -3 }, { x: 1370, y: 400, r: 8 }, { x: 160, y: 440, r: 4 }],
  head: [['Stop', 'dropping', 'goals'], ['you', 'never', 'really', 'defined.']],
}
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, k) => a + (b - a) * k
const seg = (t, a, b) => clamp((t - a) / (b - a))
const outCubic = (k) => 1 - Math.pow(1 - k, 3)
const outExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k))
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)
const backOut = (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2) }
// The app's own snap curve: cubic-bezier(0.45, 0, 0.2, 1)
function bezier(x1, y1, x2, y2) {
  return (x) => {
    let lo = 0, hi = 1, u = x
    for (let i = 0; i < 30; i++) {
      u = (lo + hi) / 2
      const bx = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
      if (bx < x) lo = u; else hi = u
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
  }
}
const snapEase = bezier(0.45, 0, 0.2, 1)
const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg>'
const CHECK14 = CHECK.replace(/width="12" height="12"/, 'width="14" height="14"')

// ——— phone screens ———
const STATUS = `<div class="statusbar"><span>9:41</span><span class="icons">
<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>
<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0L8 11.5Z M3.4 6.8a6.5 6.5 0 0 1 9.2 0l-1.4 1.4a4.5 4.5 0 0 0-6.4 0Z M1.2 4.6a9.6 9.6 0 0 1 13.6 0l-1.4 1.4a7.6 7.6 0 0 0-10.8 0Z" fill="currentColor"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity="0.4"/></svg>
</span></div><div class="island"></div><div class="homebar"></div>`

const box = $('#screenBox')
const S = {}
for (const name of ['welcome', 's', 'm', 'a', 'r', 't', 'today', 'review']) {
  const el = document.createElement('div')
  el.className = 'pscreen'
  el.innerHTML = `<div class="scroller">${SCREENS[name]}</div>${STATUS}`
  const sc = $('.scroller', el)
  // Fixed bars belong to the screen, not the scrolling content.
  for (const f of $$('.tabbar, .fab', sc)) el.appendChild(f)
  box.appendChild(el)
  S[name] = { el, sc }
}
const tap = document.createElement('div'); tap.className = 'tap'; box.appendChild(tap)
const ring = document.createElement('div'); ring.className = 'ring'; box.appendChild(ring)

function local(el, sc) {
  let x = 0, y = 0, n = el
  while (n && n !== sc) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}
const byText = (root, sel, text) => $$(sel, root).find((e) => e.textContent.trim().startsWith(text))

// Welcome: its list is drawn by the overlay until the hand-off.
const phoneMess = $('.mess', S.welcome.el)
// Relevant: the reason types itself in.
const reason = 'So my back stops hurting and I have energy after work.'
const textarea = $('textarea', S.r.el)
textarea.textContent = ''
// Today: highlight the same reason on the exercise group; find reading's prompt.
const why = byText(S.today.sc, '.group-why', 'So my back')
why.innerHTML = `<span class="hl">${why.textContent}</span>`
const hl = $('.hl', why)
const readGroup = byText(S.today.sc, '.group', 'Growth')
  || $$('.group', S.today.sc).find((g) => g.textContent.includes('Read 10 books'))
const forgot = $$('.chip', readGroup).find((c) => c.textContent.trim() === 'Forgot')
const readSave = $$('.btn.primary', readGroup)[0]
// Review: the reading card with its suggestion.
const sugQ = byText(S.review.sc, '.suggestion-q', 'Add a prep?')
const sugCard = sugQ.closest('.card')
const addPrep = $$('.btn.primary', sugQ.closest('.suggestion'))[0]

// ——— hook pills ———
const WORDS = ['Read more', 'Go to the gym', 'Save money', 'Learn English', 'Sleep better']
const SCATTER = L.scatter
const BIG = 2.4
const pillWrap = $('#pills')
const pills = WORDS.map((w, i) => {
  const d = document.createElement('div')
  d.className = 'hpill abs'
  d.innerHTML = `<span class="mess-float"><span class="mess-check"></span>${w}</span>`
  pillWrap.appendChild(d)
  return { el: d, fl: $('.mess-float', d), ck: $('.mess-check', d) }
})
const messCard = $('#messCard')

// Headline, word by word.
const HEAD = L.head
const headline = $('#headline')
headline.innerHTML = HEAD.map((l) => `<div>${l.map((w) => `<span class="w${w === 'defined.' ? ' accent' : ''}">${w} </span>`).join('')}</div>`).join('')
const headWords = $$('.w', headline)

// SMART letters on the left, in the app's own letter style.
const LET = [['S', 'Specific'], ['M', 'Measurable'], ['A', 'Achievable'], ['R', 'Relevant'], ['T', 'Time-bound']]
const lettersEl = $('#letters'), lwordEl = $('#lword')
lettersEl.innerHTML = LET.map(([l]) => `<span class="smart-l">${l}</span>`).join('')
lwordEl.innerHTML = LET.map(([, w]) => `<span>${w}</span>`).join('')
const letterEls = $$('.smart-l', lettersEl), lwordEls = $$('span', lwordEl)

// ——— timeline ———
const REST = L.rest
const SMART_AT = [8.15, 8.7, 9.25, 9.8, 10.35]
// Screen changes: [time, from, to, back?]
const NAV = [
  [8.15, 'welcome', 's'], [8.7, 's', 'm'], [9.25, 'm', 'a'], [9.8, 'a', 'r'], [10.35, 'r', 't'],
  [11.0, 't', 'r', true], [12.65, 'r', 'today'], [16.35, 'today', 'review'],
]
const NAV_DUR = 0.42

// Camera: phone centre and scale, or a screen point held at a frame point.
let MESS_LOCAL, TA, WHY, FORGOT, SUG
function measure() {
  MESS_LOCAL = local(phoneMess, S.welcome.sc)
  TA = local(textarea, S.r.sc)
  WHY = local(why, S.today.sc)
  FORGOT = local(forgot, S.today.sc)
  SUG = local(sugCard, S.review.sc)
}
const focus = (p, fx, fy, s) => ({ cx: fx - s * (p.x - 195), cy: fy - s * (p.y - 422), s })
function camKeys() {
  const todayScroll = Math.max(0, local(readGroup, S.today.sc).y - 58)
  const reviewScroll = Math.max(0, SUG.y - 60)
  return {
    todayScroll, reviewScroll,
    keys: [
      [0, REST], [11.05, REST],
      [11.65, focus({ x: TA.x + TA.w / 2, y: TA.y + TA.h / 2 }, L.fx, L.fy - 10 + L.taDy, 1.7)],
      [12.6, focus({ x: TA.x + TA.w / 2, y: TA.y + TA.h / 2 }, L.fx, L.fy - 10 + L.taDy, 1.7)],
      [13.25, focus({ x: WHY.x + WHY.w / 2, y: WHY.y + WHY.h / 2 }, L.fx, L.fy + -10, 1.62)],
      [14.6, focus({ x: WHY.x + WHY.w / 2, y: WHY.y + WHY.h / 2 }, L.fx, L.fy + -10, 1.62)],
      [15.25, focus({ x: 195, y: FORGOT.y - todayScroll }, L.fx, L.fy + 30, 1.5)],
      [16.35, focus({ x: 195, y: FORGOT.y - todayScroll }, L.fx, L.fy + 30, 1.5)],
      [16.95, focus({ x: 195, y: SUG.y - reviewScroll + SUG.h / 2 }, L.fx, L.fy + 10, 1.42)],
      [18.4, focus({ x: 195, y: SUG.y - reviewScroll + SUG.h / 2 }, L.fx, L.fy + 10, 1.42)],
    ],
  }
}
let CAM
function camAt(t) {
  const k = CAM.keys
  for (let i = 0; i < k.length - 1; i++) {
    const [ta, a] = k[i], [tb, b] = k[i + 1]
    if (t <= tb) { const e = inOut(seg(t, ta, tb)); return { cx: lerp(a.cx, b.cx, e), cy: lerp(a.cy, b.cy, e), s: lerp(a.s, b.s, e) } }
  }
  return k[k.length - 1][1]
}
const phoneToFrame = (cam, p) => ({ x: cam.cx + cam.s * (p.x - 195), y: cam.cy + cam.s * (p.y - 422) })

function setT(el, x, y, s = 1, r = 0, o = 1) {
  el.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`
  el.style.opacity = o
}

function capAt(el, t, tin, tout) {
  const lines = $$('.line, .brand, .eyebrow2, .letters, .lword, .sub2', el)
  const vis = t >= tin - 0.01 && t < tout + 0.35
  el.style.visibility = vis ? 'visible' : 'hidden'
  if (!vis) return
  const out = outCubic(seg(t, tout, tout + 0.32))
  el.style.opacity = 1 - out
  el.style.transform = `translate(0, ${-24 * out}px)`
  lines.forEach((l, i) => {
    const k = outExpo(seg(t, tin + i * 0.08, tin + i * 0.08 + 0.6))
    l.style.opacity = k
    l.style.transform = `translateY(${(1 - k) * 46}px)`
  })
}

window.renderAt = function renderAt(t) {
  // ——— hook headline ———
  const hOut = outCubic(seg(t, 2.95, 3.3))
  headline.style.opacity = 1 - hOut
  headline.style.transform = `translate(0, ${L.headY - 30 * hOut}px)`
  headWords.forEach((w, i) => {
    const k = outExpo(seg(t, 0.3 + i * 0.075, 0.3 + i * 0.075 + 0.6))
    w.style.opacity = k
    w.style.transform = `translateY(${(1 - k) * 60}px)`
  })

  // ——— mess: big list in the middle, then into the phone ———
  const cam = camAt(t)
  const rest = REST
  const restMess = phoneToFrame(rest, MESS_LOCAL)
  const bigM = { x: L.bigC.x - 179 * BIG, y: L.bigC.y - 111 * BIG }
  const mv = inOut(seg(t, 5.3, 6.15))
  const M = { x: lerp(bigM.x, restMess.x, mv), y: lerp(bigM.y, restMess.y, mv) }
  const K = lerp(BIG, rest.s, mv)
  const handoff = t >= 8.12
  const listed = seg(t, 4.25, 4.9)
  messCard.style.visibility = handoff ? 'hidden' : 'visible'
  setT(messCard, M.x, M.y, K, 0, listed)
  pillWrap.style.visibility = handoff ? 'hidden' : 'visible'
  pills.forEach((p, i) => {
    const sc = SCATTER[i]
    const pop = seg(t, 0.05 + i * 0.09, 0.05 + i * 0.09 + 0.5)
    const popS = lerp(0.6, 1, backOut(pop))
    const e = snapEase(seg(t, 3.05 + i * 0.12, 3.05 + i * 0.12 + 1.3))
    const fx = (1 - e) * 7 * Math.sin((t / 3.2) * Math.PI * 2 + i * 1.7)
    const fy = (1 - e) * 9 * Math.sin((t / 2.6) * Math.PI * 2 + i * 1.1)
    const lx = M.x + K * 16, ly = M.y + K * (16 + 40 * i)
    const x = lerp(sc.x, lx, e) + fx, y = lerp(sc.y, ly, e) + fy
    const w = p.el.offsetWidth * K, h = p.el.offsetHeight * K
    const s = K * popS
    setT(p.el, x + (w - w * popS) / 2, y + (h - h * popS) / 2, s, lerp(sc.r, 0, e), clamp(pop * 2.5))
    // Pills until they're in place, then a list.
    p.fl.style.background = `rgb(239 236 229 / ${1 - listed})`
    p.fl.style.borderColor = `rgb(207 201 188 / ${1 - listed})`
    const tk = 4.45 + i * 0.16
    const on = t >= tk
    if (on !== p.ck.classList.contains('on')) { p.ck.classList.toggle('on', on); p.ck.innerHTML = on ? CHECK : '' }
    const bump = seg(t, tk, tk + 0.35)
    p.ck.style.transform = `scale(${on ? 1 + 0.3 * Math.sin(Math.PI * bump) : 1})`
  })
  phoneMess.style.visibility = handoff ? 'visible' : 'hidden'

  // ——— phone ———
  const pin = outCubic(seg(t, 5.35, 6.15))
  const pout = inOut(seg(t, 18.35, 19.05))
  const pw = $('#phoneWrap')
  const ps = cam.s * lerp(1.12, 1, pin) / 1 * (1 - 0.06 * pout)
  const pcx = cam.cx, pcy = cam.cy + L.exit * pout
  setT(pw, pcx - 209, pcy - 436, 1, 0, seg(t, 5.8, 6.2) * (1 - pout))
  $('#phone').style.transform = `scale(${ps * (pin < 1 ? 1 : 1)})`
  pw.style.visibility = t < 5.3 || t > 19.1 ? 'hidden' : 'visible'

  // Screens: which is showing, and pushes between them.
  let current = 'welcome', trans = null
  for (const n of NAV) {
    if (t >= n[0] + NAV_DUR) current = n[2]
    else if (t >= n[0]) { trans = n; break }
    else break
  }
  for (const [name, o] of Object.entries(S)) { o.el.style.visibility = 'hidden'; o.el.style.zIndex = 1; o.el.style.filter = '' }
  if (trans) {
    const [t0, from, to, back] = trans
    const k = outCubic(seg(t, t0, t0 + NAV_DUR))
    const A = S[from].el, B = S[to].el
    A.style.visibility = B.style.visibility = 'visible'
    if (!back) {
      A.style.transform = `translateX(${-110 * k}px)`; A.style.filter = `brightness(${1 - 0.08 * k})`
      B.style.transform = `translateX(${390 * (1 - k)}px)`; B.style.zIndex = 2
      B.style.boxShadow = '-8px 0 24px rgb(40 30 10 / 0.12)'
    } else {
      B.style.transform = `translateX(${-110 * (1 - k)}px)`; B.style.filter = `brightness(${1 - 0.08 * (1 - k)})`
      A.style.transform = `translateX(${390 * k}px)`; A.style.zIndex = 2
      A.style.boxShadow = '-8px 0 24px rgb(40 30 10 / 0.12)'
    }
  } else {
    S[current].el.style.visibility = 'visible'
    S[current].el.style.transform = 'none'
  }

  // Relevant: typing.
  const n = Math.round(reason.length * seg(t, 11.5, 12.45))
  if (textarea.textContent.length !== n) textarea.textContent = reason.slice(0, n)
  // Today: highlight the reason; scroll down to reading; tap Forgot.
  hl.style.backgroundSize = `${100 * outCubic(seg(t, 13.25, 13.9))}% 100%`
  S.today.sc.style.transform = `translateY(${-CAM.todayScroll * inOut(seg(t, 14.6, 15.25))}px)`
  const fOn = t >= 15.75
  if (fOn !== forgot.classList.contains('on')) {
    forgot.classList.toggle('on', fOn)
    forgot.innerHTML = fOn ? CHECK14 + 'Forgot' : 'Forgot'
    if (fOn) readSave.removeAttribute('disabled'); else readSave.setAttribute('disabled', '')
  }
  S.review.sc.style.transform = `translateY(${-CAM.reviewScroll}px)`

  // Taps: Forgot on Today, Add prep on Review.
  tap.style.opacity = 0; ring.style.opacity = 0
  const taps = [
    { at: 15.75, screen: 'today', el: forgot, scroll: CAM.todayScroll },
    { at: 17.75, screen: 'review', el: addPrep, scroll: CAM.reviewScroll },
  ]
  for (const tp of taps) {
    const k = seg(t, tp.at - 0.25, tp.at + 0.4)
    if (k <= 0 || k >= 1 || current !== tp.screen || trans) continue
    const r = local(tp.el, S[tp.screen].sc)
    const x = r.x + r.w / 2, y = r.y + r.h / 2 - tp.scroll
    const down = seg(t, tp.at - 0.25, tp.at)
    const up = seg(t, tp.at, tp.at + 0.4)
    tap.style.left = x + 'px'; tap.style.top = y + 'px'
    tap.style.opacity = Math.min(outCubic(down), 1 - up)
    tap.style.transform = `scale(${lerp(1.35, 0.9, outCubic(down)) + 0.1 * up})`
    ring.style.left = x + 'px'; ring.style.top = y + 'px'
    ring.style.opacity = t >= tp.at ? 1 - up : 0
    ring.style.transform = `scale(${1 + 1.4 * outCubic(up)})`
  }
  addPrep.style.filter = t >= 17.75 && t < 18.0 ? 'brightness(0.9)' : ''

  // ——— left captions ———
  capAt($('#cap2'), t, 5.6, 7.95)
  capAt($('#cap3'), t, 8.15, 10.85)
  capAt($('#cap4'), t, 11.1, 14.45)
  capAt($('#cap5'), t, 14.65, 18.2)
  for (const id of ['#cap2', '#cap3', '#cap4', '#cap5']) $(id).style.top = `${L.capCY - $(id).offsetHeight / 2}px`
  letterEls.forEach((l, i) => {
    const on = t >= SMART_AT[i] && (i === 4 || t < SMART_AT[i + 1])
    const done = i < 4 && t >= SMART_AT[i + 1]
    l.className = `smart-l${on ? ' on' : done ? ' done' : ''}`
    const b = seg(t, SMART_AT[i], SMART_AT[i] + 0.3)
    l.style.scale = on ? `${1 + 0.12 * Math.sin(Math.PI * b)}` : '1'
  })
  lwordEls.forEach((w, i) => {
    const a = seg(t, SMART_AT[i], SMART_AT[i] + 0.25)
    const z = i < 4 ? seg(t, SMART_AT[i + 1], SMART_AT[i + 1] + 0.15) : 0
    w.style.opacity = outCubic(a) * (1 - z)
    w.style.transform = `translateY(${(1 - outCubic(a)) * 14 - z * 10}px)`
  })

  // ——— outro ———
  const outro = $('#outro')
  outro.style.visibility = t >= 18.5 ? 'visible' : 'hidden'
  $$('#outro > *').forEach((el, i) => {
    const a = 18.55 + [0, 0.15, 0.32, 0.5][i]
    const k = seg(t, a, a + 0.7)
    const e = i === 0 ? backOut(k) : outExpo(k)
    el.style.opacity = clamp(k * 2)
    el.style.transform = i === 0 ? `scale(${lerp(0.5, 1, e)})` : `translateY(${(1 - e) * 50}px)`
  })
}

window.ready = (async () => {
  await document.fonts.ready
  await Promise.all($$('img').map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r }))))
  measure()
  CAM = camKeys()
  renderAt(0)
  return { duration: DUR }
})()
window.DUR = DUR
