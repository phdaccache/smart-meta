import { describe, expect, it } from 'vitest'
import type { SyncStatus } from './controller'
import { syncState } from './state'

const member: SyncStatus = {
  configured: true, email: 'a@x.com', userId: 'u', requestedAt: null, access: 'member', phase: 'idle',
  lastSyncedAt: null, pending: 0, error: null, lock: null, online: true, recoveredAt: null,
}

describe('sync status (plan §6.9)', () => {
  it('shows nothing for a phone that does not sync', () => {
    expect(syncState({ ...member, access: 'waiting' })).toBeNull()
    expect(syncState({ ...member, lock: 'unlock' })).toBeNull()
    expect(syncState({ ...member, phase: 'signed-out', access: null })).toBeNull()
  })
  it('changes waiting offline are "not synced yet"', () => {
    expect(syncState({ ...member, online: false, pending: 2 })).toBe('offline')
  })
  it('offline with nothing waiting is simply synced', () => {
    expect(syncState({ ...member, online: false })).toBe('synced')
  })
  it('a failing server with changes waiting is "couldn\'t sync"', () => {
    expect(syncState({ ...member, phase: 'error', pending: 1 })).toBe('error')
  })
  it('a failing pull with nothing waiting stays quiet', () => {
    expect(syncState({ ...member, phase: 'error' })).toBe('synced')
  })
  it('the normal wait after a change is only "pending", which Today does not show', () => {
    expect(syncState({ ...member, pending: 1 })).toBe('pending')
  })
})
