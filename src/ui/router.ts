import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { log } from '../sync/log'

const listeners = new Set<() => void>()
const notify = () => {
  shown = stack()
  listeners.forEach((l) => l())
}

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/**
 * Shows the new screen. Going deeper it slides in from the right over the old one, and Back slides it
 * away to the right again, as on the iPhone; switching tabs, replacing a screen, or with less motion
 * asked for, it just changes.
 */
function show(dir: 'forward' | 'back' | null) {
  // A screen Back is still sliding away goes now.
  ending?.()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // A sheet going away plays its own exit; the page under it changes at once.
  if (!dir || still || document.hidden || document.querySelector('.sheet-layer')) return notify()
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
const stack = () => [...screensUnder(), getPath()]
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

// Entries made before this page loaded count as the bottom of the stack. After a reload (the app updating
// itself on an inner screen, S5 test), the entries under it belong to the page that was: going back into
// them loads that page anew, which a Home Screen app on the iPhone showed as a blank white page. So Back
// starts here, and goes to the screen's own parent instead.
if (depth() > 0 || layer() > 0) log('nav', 'fresh page at depth', depth(), 'layer', layer())
history.replaceState({ depth: 0 }, '')

// Screens keep their own scroll (see screensUnder) and the page itself never scrolls, so the browser restoring
// the page's scroll on Back changes nothing, and it stays on: after a swipe back, the iPhone keeps its picture
// of the screen over the app, untouchable, until it has seen the scroll put back, or for a long while otherwise.
if ('scrollRestoration' in history) history.scrollRestoration = 'auto'

/** The screens last shown, bottom first. */
let shown = stack()
/** The screen Back is taking away, still drawn as it slides off (see App), with its layer's key. */
let leaving: { key: string; at: string } | null = null
/** Lets go of the screen Back is taking away, if one is still sliding. */
let ending: (() => void) | null = null

/**
 * Back: the screen underneath is there as it was, and the screen being left, itself, slides off to the right
 * over it, letting every touch through, so a quick drag scrolls the screen underneath at once. (A copy of
 * the screen slid off instead was a whole new page for the phone to draw first, and until it had, a touch
 * still went to the screen just taken away and held stuck until let go.)
 */
function slideBack() {
  const before = shown
  if (stack().length >= before.length) return notify()
  const at = before[before.length - 1]
  leaving = { key: String(before.length - 1), at }
  flushSync(notify)
  const layer = document.querySelector<HTMLElement>('.screen-layer.leaving')
  const shade = document.createElement('div')
  shade.className = 'nav-shade'
  document.body.append(shade)
  let runs: (Animation | undefined)[] = []
  const end = () => {
    if (ending !== end) return
    ending = null
    leaving = null
    shade.remove()
    // Its end stays applied until cancelled, and a screen opened right away takes this same layer: it stayed
    // off to the side, with everything under it untouchable (S6 test).
    runs.forEach((a) => a?.cancel())
  }
  ending = end
  const finish = () => {
    if (ending !== end) return
    end()
    notify()
  }
  // Animations wait while the app is in the background; the screen must not outlive its moment.
  setTimeout(finish, 1000)
  const timing = { duration: 400, easing: EASE, fill: 'forwards' } as const
  runs = [
    layer?.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], timing),
    shade.animate([{ opacity: 1 }, { opacity: 0 }], timing),
  ]
  Promise.all(runs.map((a) => a?.finished)).catch(() => {}).finally(finish)
}

/** The screen Back is taking away, while it slides off. */
export const leavingScreen = () => leaving

/** Set while unwinding the stack to a tab: where to land once the browser gets there. */
let pendingRoot: string | null = null

/**
 * A Back the browser hasn't made yet. Until it has, `history.state` still says where we were, so a quick second
 * tap counted the same screen twice and went one too far, past the bottom of the stack, onto the entries of a page
 * from before a reload (S6 test: a white page). What's asked for meanwhile waits its turn (see `later`).
 */
let backing: ReturnType<typeof setTimeout> | null = null
function backArrived() {
  if (backing == null) return
  clearTimeout(backing)
  backing = null
  if (ownMoves === 0) later.splice(0).forEach((run) => run())
}

window.addEventListener('popstate', (e: PopStateEvent & { hasUAVisualTransition?: boolean }) => {
  // After this event's own work, which is about the same move.
  if (backing != null) queueMicrotask(backArrived)
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
    // The bottom screen stays as it was when its own tab was tapped, as on the iPhone; another tab starts at its top.
    if (getPath() !== pendingRoot) document.querySelector('.screen-layer')?.scrollTo(0, 0)
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
  if (ownMoves === 0 && backing == null) return false
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
  if (ownMoves > 0 || backing != null) later.push(push)
  else push()
  return () => {
    const i = layers.indexOf(entry)
    if (i < 0) return // already gone: closed by Back, or dropped by a navigation
    dropEntries(layers.splice(i).filter((l) => l.pushed).length)
  }
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (afterOwnMoves(() => navigate(to, opts))) return
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
  // Its tab tapped once more, another tab, or a screen in place of this one: from the top. (The layer stays,
  // see App, so before it shows what's next.)
  if (!dir) scrollScreenToTop()
  show(dir)
}

/**
 * Leaves a finished flow for what it made: `to`, with only the tab `root` under it, whatever the flow was
 * opened from, so Back goes to that tab.
 */
export function openOver(root: string, to: string) {
  if (afterOwnMoves(() => openOver(root, to))) return
  const d = depth()
  if (d > 0) {
    dropEntries(d)
    later.push(() => openOver(root, to))
    return
  }
  history.replaceState({ depth: 0 }, '', root)
  history.pushState({ depth: 1, under: [root] }, '', to)
  scrollScreenToTop()
  show(null)
}

/** How many in-app screens are under the one shown: a flow notes it at its start, to leave back to it (see backTo). */
export const currentDepth = () => depth()

/** Back to the screen that was shown at `d` (from currentDepth), past every screen opened since; `fallback` if it's gone. */
export function backTo(d: number, fallback: string) {
  if (afterOwnMoves(() => backTo(d, fallback))) return
  const n = depth() - d
  if (n > 0) history.go(-n)
  else navigate(fallback, { replace: true })
}

/** Back within the app when there is somewhere to go, otherwise to a sensible parent. */
export function goBack(fallback: string) {
  if (afterOwnMoves(() => goBack(fallback))) return
  if (depth() > 0) {
    // A move that never comes mustn't hold everything else back.
    backing = setTimeout(backArrived, 1000)
    history.back()
  } else navigate(fallback, { replace: true })
}

function getPath() {
  return window.location.pathname + window.location.search
}

export function useLocation(): { path: string; query: URLSearchParams } {
  // The screen Back is taking away counts too: letting go of it draws the screens again.
  const full = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => `${getPath()}#${leaving?.key ?? ''}`)
  const [path, search = ''] = full.split('#')[0].split('?')
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
