import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/**
 * Shows the new screen. Going deeper it slides in from the right over the old one, and Back slides it
 * away to the right again, as on the iPhone; switching tabs, replacing a screen, or with less motion
 * asked for, it just changes.
 */
function show(dir: 'forward' | 'back' | null) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // A sheet going away plays its own exit; the page under it changes at once.
  if (!dir || still || document.querySelector('.sheet-layer')) return notify()
  if (dir === 'back') return slideBack()
  slideIn()
}

/**
 * Deeper: the new screen slides in over the old one, which drifts a little left under a light shade.
 * The new screen scrolls at the first touch, wherever it lands: its layer covers the whole screen from the
 * start, see-through, and only its content slides. (A touch that reached nothing that scrolls, as during a
 * view transition's picture or beside a layer still sliding in, held the screen stuck until let go.)
 */
function slideIn() {
  flushSync(notify)
  const screens = [...document.querySelectorAll<HTMLElement>('.screen-layer')]
  const [under, top] = screens.slice(-2)
  const page = top?.firstElementChild as HTMLElement | null
  if (!under || !top || !page) return
  const shade = document.createElement('div')
  shade.className = 'nav-shade'
  // Over the old screen, under the new one and the tab bar.
  shade.style.zIndex = '19'
  top.style.zIndex = '20'
  top.style.background = 'transparent'
  Object.assign(page.style, { background: 'var(--bg)', boxShadow: '-6px 0 24px rgb(0 0 0 / 0.12)' })
  document.body.append(shade)
  const timing = { duration: 400, easing: EASE }
  const runs = [
    page.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], timing),
    under.animate([{ transform: 'none' }, { transform: 'translateX(-30%)' }], timing),
    shade.animate([{ opacity: 0 }, { opacity: 1 }], timing),
  ]
  const done = () => {
    shade.remove()
    Object.assign(top.style, { zIndex: '', background: '' })
    Object.assign(page.style, { background: '', boxShadow: '' })
  }
  // Animations wait while the app is in the background; the shade must not outlive its moment.
  setTimeout(done, 1000)
  Promise.all(runs.map((a) => a.finished)).catch(() => {}).finally(done)
}

/** Tab screens. Reaching one resets the history stack, so back can't go behind it. */
export const ROOTS = ['/', '/goals', '/review', '/insights']
const isRoot = (to: string) => ROOTS.includes(to.split('?')[0])

interface NavState {
  /** How many in-app screens sit below this one. 0 on a tab screen. */
  depth: number
  /** How many sheets are open over the screen: each one has its own entry, so Back closes it. */
  layer?: number
  /** The screens this one was opened from, bottom first. */
  under?: string[]
}

const depth = () => (history.state as NavState | null)?.depth ?? 0
/**
 * The screens under the one shown, bottom first. They stay drawn, each in its own layer and scrolled
 * where it was (see App), so Back has nothing to rebuild or scroll: rebuilding a screen and scrolling the
 * page back down to where it had been showed it black for a moment on a phone, which draws a far-off
 * part of a page only once it gets there.
 */
export const screensUnder = (): string[] => (depth() > 0 && (history.state as NavState | null)?.under) || []
/** The layer of the screen shown: each screen scrolls in its own. */
const topScreen = () => [...document.querySelectorAll<HTMLElement>('.screen-layer')].pop()
/** Takes the screen shown back to its top. */
export const scrollScreenToTop = () => topScreen()?.scrollTo(0, 0)
const layer = () => (history.state as NavState | null)?.layer ?? 0

/** The open sheets, innermost last. `pushed` once its history entry exists. */
interface Layer { close: () => void; pushed: boolean }
const layers: Layer[] = []
const pushedLayers = () => layers.filter((l) => l.pushed).length
/** History moves we made ourselves (dropping sheets' entries), whose popstate is not a Back. */
let ownMoves = 0
/** What was asked for while one of our moves was on its way: it runs, in order, once the browser gets there. */
let later: (() => void)[] = []

// A reload with a sheet open leaves its entry behind, with no sheet: drop it.
if (layer() > 0) {
  ownMoves++
  history.go(-layer())
}
// Entries made before this app ran (or by a reload) count as the bottom of the stack.
else if (!depth()) history.replaceState({ depth: 0 }, '')

// Screens keep their own scroll (see screensUnder); the page itself doesn't scroll.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

/**
 * Back: the screen underneath is drawn as usual, in place and scrolled where it was, and a copy of the
 * screen being left slides off to the right over it. Sliding the live screen in instead made a phone
 * draw its parts that weren't on screen yet mid-slide, and they showed black until it caught up.
 */
function slideBack() {
  const top = topScreen()
  const main = top?.querySelector('main.app')
  if (!top || !main) return notify()
  const leaving = document.createElement('div')
  leaving.className = 'nav-leaving'
  leaving.setAttribute('aria-hidden', 'true')
  leaving.inert = true
  const copy = main.cloneNode(true) as HTMLElement
  const fields = main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  copy.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el, i) => { el.value = fields[i]?.value ?? '' })
  copy.style.transform = `translateY(${-top.scrollTop}px)`
  leaving.appendChild(copy)
  const shade = document.createElement('div')
  shade.className = 'nav-shade'
  document.body.append(shade, leaving)
  flushSync(notify)
  const done = () => { leaving.remove(); shade.remove() }
  // Animations wait while the app is in the background; the copy must not outlive its moment.
  setTimeout(done, 1000)
  // The copy holds still for two frames, so the phone has drawn the screen underneath by the time it shows.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const runs = [
      leaving.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: 400, easing: EASE, fill: 'forwards' }),
      shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: EASE, fill: 'forwards' }),
    ]
    Promise.all(runs.map((a) => a.finished)).catch(() => {}).finally(done)
  }))
}

/** Set while unwinding the stack to a tab: where to land once the browser gets there. */
let pendingRoot: string | null = null

window.addEventListener('popstate', (e: PopStateEvent & { hasUAVisualTransition?: boolean }) => {
  if (ownMoves > 0) {
    if (--ownMoves === 0) later.splice(0).forEach((run) => run())
    return
  }
  if (layers.length > layer()) {
    // Back with a sheet open (Android's back button): close the sheet, leave the screen alone.
    while (layers.length > layer()) layers.pop()!.close()
    return
  }
  if (pendingRoot != null) {
    history.replaceState({ depth: 0 }, '', pendingRoot)
    pendingRoot = null
    show(null)
    return
  }
  // Safari's own swipe back already slid the page; sliding it again would play it twice.
  show(e.hasUAVisualTransition ? null : 'back')
})

/** Takes `n` of our own entries off the history. */
function dropEntries(n: number) {
  if (n === 0) return
  ownMoves++
  history.go(-n)
}

/**
 * Drops the entries of every open sheet before going somewhere else, so the new screen doesn't land
 * above them. Returns true when `then` will run once that's done.
 */
function afterOwnMoves(then: () => void): boolean {
  const n = pushedLayers()
  layers.length = 0 // the sheets close as their screen goes; their own release finds nothing to do
  dropEntries(n)
  if (ownMoves === 0) return false
  later.push(then)
  return true
}

/**
 * Gives an open sheet a history entry, so Back closes it instead of leaving the screen. Returns the
 * release to call when the sheet closes some other way (its ✕, saving, the backdrop).
 */
export function pushLayer(close: () => void): () => void {
  const entry: Layer = { close, pushed: false }
  layers.push(entry)
  const push = () => {
    const i = layers.indexOf(entry)
    if (i < 0) return // released before its turn came
    history.pushState({ ...(history.state as NavState), layer: i + 1 }, '')
    entry.pushed = true
  }
  // A sheet that opens as another closes waits for the browser to drop the old entry first.
  if (ownMoves > 0) later.push(push)
  else push()
  return () => {
    const i = layers.indexOf(entry)
    if (i < 0) return // already gone: closed by Back, or dropped by a navigation
    dropEntries(layers.splice(i).filter((l) => l.pushed).length)
  }
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (afterOwnMoves(() => navigate(to, opts))) return
  const from = getPath()
  let dir: 'forward' | null = null
  if (isRoot(to)) {
    const d = depth()
    if (d > 0) {
      // Pop every in-app screen first; the popstate handler then lands on `to`.
      pendingRoot = to
      history.go(-d)
      return
    }
    history.replaceState({ depth: 0 }, '', to)
  } else if (opts.replace) {
    history.replaceState({ depth: depth(), under: screensUnder() }, '', to)
  } else {
    history.pushState({ depth: depth() + 1, under: [...screensUnder(), getPath()] }, '', to)
    dir = 'forward'
  }
  // The same screen again (its tab tapped once more): back to its top.
  if (to === from) scrollScreenToTop()
  show(dir)
}

/** Back within the app when there is somewhere to go, otherwise to a sensible parent. */
export function goBack(fallback: string) {
  if (afterOwnMoves(() => goBack(fallback))) return
  if (depth() > 0) history.back()
  else navigate(fallback, { replace: true })
}

const getPath = () => window.location.pathname + window.location.search

export function useLocation(): { path: string; query: URLSearchParams } {
  const full = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, getPath)
  const [path, search = ''] = full.split('?')
  return { path, query: new URLSearchParams(search) }
}

/** match('/goals/:id', '/goals/abc') → { id: 'abc' } */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}
