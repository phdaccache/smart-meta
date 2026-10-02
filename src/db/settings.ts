import { db } from './db'

export interface Settings {
  /** Hour (0–12) at which a new logical day starts. */
  rolloverHour: number
  /** Active goals allowed at once; the rest wait in the backlog. */
  goalCap: number
  creationMode: 'wizard' | 'compact'
  /** First run finished or skipped. */
  onboarded: boolean
  /** The Getting started card on Today, shown after first run until done or closed. */
  gettingStarted: boolean
  lastExportAt: string | null
  /** Testing only: the app behaves as if this is today. */
  devToday: string | null
  /** Areas picked in the intro (health, work…): which templates come first. */
  areas: string[]
  /** Last day the intro was finished or skipped: a note about a new intro isn't news to them. */
  introAt: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  rolloverHour: 4,
  goalCap: 4,
  creationMode: 'wizard',
  onboarded: false,
  gettingStarted: false,
  lastExportAt: null,
  devToday: null,
  areas: [],
  introAt: null,
}

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await db.meta.put({ key: 'settings', value: next })
  return next
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
