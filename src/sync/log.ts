/**
 * A short diagnostics log for sign-in, keys and sync, readable on the phone itself (Settings → Developer),
 * where there's no console. Kept in localStorage, apart from the app's database, so it still works when
 * that is what's failing. Ids are shortened and no content, key or password is ever written here.
 */

const KEY = 'syncLog'
const MAX = 300

const text = (p: unknown): string => {
  if (typeof p === 'string') return p
  if (p instanceof Error) return `${p.name}: ${p.message}`
  try {
    return JSON.stringify(p)
  } catch {
    return String(p)
  }
}

export function log(...parts: unknown[]) {
  const line = `${new Date().toISOString().slice(5, 23).replace('T', ' ')} ${parts.map(text).join(' ')}`
  console.info('[smart-meta]', line)
  try {
    const lines = readLog()
    lines.push(line)
    localStorage.setItem(KEY, JSON.stringify(lines.slice(-MAX)))
  } catch {
    // Private mode or full: the console still has it.
  }
}

export function readLog(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function clearLog() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** A user id, shortened: enough to tell accounts apart in the log. */
export const short = (id: string | null | undefined) => (id ? id.slice(0, 8) : 'none')

/** Errors nothing caught, with where they came from. */
export function logUncaught() {
  window.addEventListener('error', (e) => log('error', e.message, `${e.filename?.split('/').pop()}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => log('unhandled', e.reason))
}
