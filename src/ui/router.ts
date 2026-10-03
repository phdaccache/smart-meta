import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Tab screens. Reaching one resets the history stack, so back can't go behind it. */
export const ROOTS = ['/', '/goals', '/review', '/insights']
const isRoot = (to: string) => ROOTS.includes(to.split('?')[0])

interface NavState {
  /** How many in-app screens sit below this one. 0 on a tab screen. */
  depth: number
  /** Where the screen was scrolled when we left it, to put it back on Back. */
  scrollY?: number
  /** How many sheets are open over the screen: each one has its own entry, so Back closes it. */
  layer?: number
}

const depth = () => (history.state as NavState | null)?.depth ?? 0
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

// The browser restores scroll before the screen has re-rendered, which on iOS can leave half
// the page unpainted. We restore it ourselves once the content is tall enough.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

const rememberScroll = () => history.replaceState({ ...(history.state as NavState), scrollY: window.scrollY }, '')

function restoreScroll(y: number) {
  let frames = 0
  const attempt = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight
    if (room >= y || ++frames > 60) window.scrollTo(0, Math.min(y, Math.max(0, room)))
    else requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

/** Set while unwinding the stack to a tab: where to land once the browser gets there. */
let pendingRoot: string | null = null

window.addEventListener('popstate', () => {
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
    notify()
    window.scrollTo(0, 0)
    return
  }
  notify()
  restoreScroll((history.state as NavState | null)?.scrollY ?? 0)
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
    history.replaceState({ depth: depth() }, '', to)
  } else {
    rememberScroll()
    history.pushState({ depth: depth() + 1 }, '', to)
  }
  notify()
  window.scrollTo(0, 0)
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
