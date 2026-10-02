import type { Key } from '../i18n'

/**
 * Release notes, shown once when the app opens on a new version. Add a release
 * at the top when shipping something people should know about (its text goes
 * in en.ts and pt-BR.ts under `news.`); never reuse an id. Fixes and small
 * tweaks don't need one.
 */

export type ReleaseIcon = 'flag-br'

export interface ReleaseItem {
  icon?: ReleaseIcon
  title: Key
  text: Key
  /** A button that takes you to the feature. */
  action?: { label: Key; to: string }
}

export interface Release {
  id: string
  items: ReleaseItem[]
}

/** Newest first. */
export const RELEASES: Release[] = [
  {
    id: '2026-10-portuguese',
    items: [{ icon: 'flag-br', title: 'news.ptTitle', text: 'news.ptText', action: { label: 'news.ptAction', to: '/settings' } }],
  },
]

/** The releases someone who last saw `seen` hasn't seen. Never seen any: just the newest one. */
export function unseen(seen: string | null, releases: Release[] = RELEASES): Release[] {
  if (releases.length === 0) return []
  const i = seen ? releases.findIndex((r) => r.id === seen) : -1
  return i < 0 ? releases.slice(0, 1) : releases.slice(0, i)
}
