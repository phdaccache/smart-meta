import { useSyncExternalStore } from 'react'
import { en } from './en'
import { ptBR } from './pt-BR'

export type Key = keyof typeof en
export type Messages = Record<Key, string>
export type Lang = 'en' | 'pt-BR'
/** What the person picked in Settings. 'auto' follows the phone. */
export type LangSetting = 'auto' | Lang

const TABLES: Record<Lang, Messages> = { en, 'pt-BR': ptBR }

/** The `{blank}` names in an English text, so a call must fill exactly those. */
type Blanks<S extends string> = S extends `${string}{${infer B}}${infer R}` ? B | Blanks<R> : never
type Params<K extends Key> = [Blanks<(typeof en)[K]>] extends [never] ? [] : [Record<Blanks<(typeof en)[K]>, string | number>]
/** Keys that come as a .one / .other pair. */
type PluralKey = { [K in Key]: K extends `${infer B}.one` ? B : never }[Key]

let lang: Lang = 'en'
const listeners = new Set<() => void>()

/** Numbers in text: "7,5" in Portuguese. */
export function num(n: number): string {
  const s = String(Math.round(n * 100) / 100)
  return lang === 'pt-BR' ? s.replace('.', ',') : s
}

function fill(s: string, p?: Record<string, string | number>): string {
  if (!p) return s
  return s.replace(/\{(\w+)\}/g, (m, b: string) => (b in p ? (typeof p[b] === 'number' ? num(p[b]) : p[b]) : m))
}

/** The text for `key` in the current language, with its blanks filled. */
export function t<K extends Key>(key: K, ...params: Params<K>): string {
  return fill(TABLES[lang][key] ?? en[key], params[0])
}

/** Like t, for a key chosen at run time. */
export function tk(key: Key, params?: Record<string, string | number>): string {
  return fill(TABLES[lang][key] ?? en[key], params)
}

/** Singular or plural of `key`, with `{n}` filled. */
export function tn(key: PluralKey, n: number, params: Record<string, string | number> = {}): string {
  const k = `${key}.${n === 1 ? 'one' : 'other'}` as Key
  return fill(TABLES[lang][k], { ...params, n })
}

/** A space-separated list text, like the month names. */
export const tlist = (key: Key): string[] => t(key as never).split(' ')

/** "a, b and c" in the current language. */
export function joinList(items: string[], word: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('')
  const a = items.slice(0, -1).join(', ')
  const b = items[items.length - 1]
  return word === 'and' ? t('ins.list.and', { a, b }) : t('ins.list.or', { a, b })
}

export const getLang = () => lang

/** Runs `fn` with another language, for text that is stored rather than shown. */
export function inLang<T>(l: Lang, fn: () => T): T {
  const was = lang
  lang = l
  try {
    return fn()
  } finally {
    lang = was
  }
}

// ——— the setting ———

const STORE = 'lang'

export function langSetting(): LangSetting {
  try {
    const v = localStorage.getItem(STORE)
    if (v === 'en' || v === 'pt-BR') return v
  } catch {
    // Storage blocked: follow the phone.
  }
  return 'auto'
}

export function phoneLang(): Lang {
  const first = (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language)) || ''
  return first.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

function apply(l: Lang) {
  lang = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
  listeners.forEach((f) => f())
}

/** On startup: the saved choice, or the phone's language. */
export function initLang() {
  const s = langSetting()
  apply(s === 'auto' ? phoneLang() : s)
}

/** Kept on this device only; switching re-renders the app at once. */
export function setLangSetting(s: LangSetting) {
  try {
    if (s === 'auto') localStorage.removeItem(STORE)
    else localStorage.setItem(STORE, s)
  } catch {
    // Still switch for this session.
  }
  apply(s === 'auto' ? phoneLang() : s)
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** The current language; the component re-renders when it changes. */
export const useLang = () => useSyncExternalStore(subscribe, getLang)
