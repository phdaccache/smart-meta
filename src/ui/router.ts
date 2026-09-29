import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Tab screens. Reaching one resets the history stack, so back can't go behind it. */
export const ROOTS = ['/', '/goals', '/review', '/insights']
const isRoot = (to: string) => ROOTS.includes(to.split('?')[0])

interface NavState {
  /** How many in-app screens sit below this one. 0 on a tab screen. */
  depth: number
}

const depth = () => (history.state as NavState | null)?.depth ?? 0

// Entries made before this app ran (or by a reload) count as the bottom of the stack.
if (!(history.state as NavState | null)?.depth) history.replaceState({ depth: 0 }, '')

/** Set while unwinding the stack to a tab: where to land once the browser gets there. */
let pendingRoot: string | null = null

window.addEventListener('popstate', () => {
  if (pendingRoot != null) {
    history.replaceState({ depth: 0 }, '', pendingRoot)
    pendingRoot = null
  }
  notify()
})

export function navigate(to: string, opts: { replace?: boolean } = {}) {
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
    history.pushState({ depth: depth() + 1 }, '', to)
  }
  notify()
  window.scrollTo(0, 0)
}

/** Back within the app when there is somewhere to go, otherwise to a sensible parent. */
export function goBack(fallback: string) {
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
