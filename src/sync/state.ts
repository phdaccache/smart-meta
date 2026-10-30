import type { SyncStatus } from './controller'

/** Where this phone's changes stand with the server (plan §6.9, picked in S0: option A). */
export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline' | 'error'

/** Null when this phone doesn't sync (no account, not a member yet, or the data key not here). */
export function syncState(s: SyncStatus): SyncState | null {
  if (s.access !== 'member' || s.lock || s.phase === 'signed-out') return null
  if (s.pending && !s.online) return 'offline'
  if (s.pending && s.phase === 'error') return 'error'
  if (s.phase === 'syncing') return 'syncing'
  return s.pending ? 'pending' : 'synced'
}
