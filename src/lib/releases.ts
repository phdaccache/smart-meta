import type { Key } from '../i18n'
import { diffDays } from './dates'
import type { DateStr } from './types'

/**
 * Release notes, shown once when the app opens on a new version. Add a release
 * at the top when shipping something people should know about (its text goes
 * in en.ts and pt-BR.ts under `news.`); never reuse an id. Fixes and small
 * tweaks don't need one. Notes wait until the intro is over, and stop
 * showing FRESH_DAYS after their date (set it to the day it ships).
 */

export type ReleaseIcon = 'flag-br' | 'template'

export interface ReleaseItem {
  icon?: ReleaseIcon
  title: Key
  text: Key
  /** A button that takes you to the feature. */
  action?: { label: Key; to: string }
}

export interface Release {
  id: string
  /** The day it ships: it pops up for 10 days, then never again, seen or not. */
  date: DateStr
  items: ReleaseItem[]
}

/** How many days a release note keeps popping up for those who haven't seen it. */
export const FRESH_DAYS = 10

/** Newest first. */
export const RELEASES: Release[] = [
  {
    id: '2026-10-templates',
    date: '2026-10-02',
    items: [
      { icon: 'template', title: 'news.tplTitle', text: 'news.tplText', action: { label: 'news.tplAction', to: '/goals/new' } },
    ],
  },
  {
    id: '2026-10-portuguese',
    date: '2026-10-01',
    items: [{ icon: 'flag-br', title: 'news.ptTitle', text: 'news.ptText', action: { label: 'news.ptAction', to: '/settings' } }],
  },
]

/**
 * The releases someone who last saw `seen` hasn't seen, oldest first so they
 * read in the order they shipped. Never seen any (or one since removed): all.
 * Older than FRESH_DAYS: dropped, seen or not.
 */
export function unseen(seen: string | null, today: DateStr, releases: Release[] = RELEASES): Release[] {
  const i = seen ? releases.findIndex((r) => r.id === seen) : -1
  return (i < 0 ? releases : releases.slice(0, i))
    .filter((r) => diffDays(r.date, today) < FRESH_DAYS)
    .slice()
    .reverse()
}
