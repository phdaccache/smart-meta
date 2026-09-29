import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
window.addEventListener('popstate', notify)

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const state = { inApp: true }
  if (opts.replace) history.replaceState(state, '', to)
  else history.pushState(state, '', to)
  notify()
  window.scrollTo(0, 0)
}

/** Back within the app when there is history, otherwise to a sensible parent. */
export function goBack(fallback: string) {
  if ((history.state as { inApp?: boolean } | null)?.inApp) history.back()
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
