/**
 * From words on screen back to the text keys that made them. A text with
 * {blanks} matches whatever the app filled in, and the filling is kept so the
 * screen can show an edit at once.
 */

export interface Compiled {
  key: string
  /** The blanks' names, in the order they appear. */
  names: string[]
  exact: RegExp
  /** For a text inside a longer string; only texts with enough letters, or "or" would match everywhere. */
  loose: RegExp | null
}

export interface Hit {
  key: string
  names: string[]
  /** What each blank was filled with, in `names` order. */
  captures: string[]
  /** The part of the string this text produced. */
  matched: string
  exact: boolean
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function compile(table: Record<string, string>): Compiled[] {
  const out: Compiled[] = []
  for (const [key, template] of Object.entries(table)) {
    const parts = template.split(/\{(\w+)\}/)
    const literal = parts.filter((_, i) => i % 2 === 0).join('')
    const letters = (literal.match(/\p{L}/gu) ?? []).length
    if (letters === 0) continue // "{a}, {b}" would match anything
    const body = parts.map((p, i) => (i % 2 ? '(.+?)' : escape(p))).join('')
    out.push({
      key,
      names: parts.filter((_, i) => i % 2 === 1),
      exact: new RegExp(`^\\s*${body}\\s*$`, 'su'),
      loose: letters >= 4 ? new RegExp(body, 'su') : null,
    })
  }
  return out
}

/** The texts that produced `text`: whole-string matches, or failing those, texts found inside it. */
export function findKeys(text: string, compiled: Compiled[]): Hit[] {
  const exact: Hit[] = []
  for (const c of compiled) {
    const m = c.exact.exec(text)
    if (m) exact.push({ key: c.key, names: c.names, captures: m.slice(1), matched: text.trim(), exact: true })
  }
  if (exact.length) return exact
  const loose: Hit[] = []
  for (const c of compiled) {
    const m = c.loose?.exec(text)
    if (m) loose.push({ key: c.key, names: c.names, captures: m.slice(1), matched: m[0], exact: false })
  }
  return loose
}

/**
 * How much a hit's blanks had to swallow: 0 when each holds one word or number,
 * more when a blank stretched over a phrase. Lower is likelier the real text.
 */
export function looseness(hit: Hit): number {
  return hit.captures.reduce((n, c) => n + Math.max(0, c.trim().split(/\s+/).length - 1), 0)
}

/** `template` filled the way the screen filled it before. */
export function refill(template: string, names: string[], captures: string[]): string {
  const values = Object.fromEntries(names.map((n, i) => [n, captures[i]]))
  return template.replace(/\{(\w+)\}/g, (m, b: string) => values[b] ?? m)
}

/** A plural's other form: x.one ↔ x.other. */
export function pluralPair(key: string): string | null {
  if (key.endsWith('.one')) return key.slice(0, -4) + '.other'
  if (key.endsWith('.other')) return key.slice(0, -6) + '.one'
  return null
}
