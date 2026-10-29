import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { t } from '../i18n'
import { wipeLocal } from '../db/backup'
import { db } from '../db/db'
import { writeListeners } from '../db/repo'
import { getMeta, setMeta } from '../db/settings'
import { toast } from '../ui/components'
import { queueEverything, SyncEngine } from './engine'
import { startProfileSync, stopProfileSync } from './profile'
import { SupabaseTarget, supabase } from './supabase'

/**
 * Where an account stands with the server: only members sync (spec AC-4). 'full' is waiting while the
 * list is at its cap (N-1).
 */
export type Access = 'member' | 'waiting' | 'full'

export interface SyncStatus {
  configured: boolean
  email: string | null
  userId: string | null
  /** When the account was made: the "Asked" line of Waiting for access. */
  requestedAt: string | null
  /** Null until known (signed out, or not asked yet). */
  access: Access | null
  phase: 'signed-out' | 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  pending: number
  error: string | null
}

let status: SyncStatus = {
  configured: !!supabase, email: null, userId: null, requestedAt: null, access: null,
  phase: 'signed-out', lastSyncedAt: null, pending: 0, error: null,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

export const syncStatus = () => status

/** Whose data this phone holds (spec AC-13): set at the first sign-in, cleared only when the phone is wiped. */
export interface PhoneOwner {
  id: string
  email: string
}
const OWNER_KEY = 'phoneOwner'
export const phoneOwner = () => getMeta<PhoneOwner | null>(OWNER_KEY, null)
const accessKey = (userId: string) => `access:${userId}`
const syncKey = (userId: string) => `sync:${userId}`

let engine: SyncEngine | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let failures = 0
const BACKOFF = [5_000, 30_000, 120_000, 600_000]

function schedule(delay: number) {
  clearTimeout(timer)
  timer = setTimeout(run, delay)
}

async function run() {
  const e = engine
  if (!e) return
  if (!navigator.onLine) {
    set({ pending: await e.pending() })
    return
  }
  set({ phase: 'syncing' })
  try {
    await e.sync()
    failures = 0
    set({ phase: 'idle', error: null, lastSyncedAt: await e.lastSyncedAt(), pending: await e.pending() })
  } catch (err) {
    // Never surfaces as a blocking error: data is safe locally and will retry.
    set({ phase: 'error', error: (err as Error).message, pending: await e.pending() })
    schedule(BACKOFF[Math.min(failures++, BACKOFF.length - 1)])
  }
}

export function syncNow() {
  schedule(0)
}

/** The user the latest session belongs to: a slower check for an older session gives way. */
let current: string | null = null

async function onSession(user: User | null) {
  current = user?.id ?? null
  if (!user) {
    engine = null
    stopProfileSync()
    clearTimeout(timer)
    set({ phase: 'signed-out', email: null, userId: null, requestedAt: null, access: null })
    return
  }
  const owner = await phoneOwner()
  if (owner && owner.id !== user.id) {
    // Someone else's data is on this phone: never upload it into this account, nor mix the two.
    // Sending the code already refuses this (see sendCode); this catches a session from elsewhere.
    await supabase!.auth.signOut({ scope: 'local' })
    toast(t('acct.otherOwner', { email: owner.email }))
    return
  }
  if (!owner) {
    await setMeta(OWNER_KEY, { id: user.id, email: user.email ?? '' } satisfies PhoneOwner)
    // What was made before signing in goes up with the first sync. A phone that already synced with
    // this account (before phones had an owner) has nothing new to send.
    if (!(await getMeta<{ lastSyncedAt?: string } | null>(syncKey(user.id), null))?.lastSyncedAt) await queueEverything(db)
  }
  if (current !== user.id) return
  set({ email: user.email ?? null, userId: user.id, requestedAt: user.created_at, phase: 'idle', error: null })
  await refreshAccess()
}

/**
 * Asks the server whether this account may sync, and starts or stops sync to match. Offline, the
 * last answer stands. Waiting turns into member on the first check after the owner approves.
 */
export async function refreshAccess(): Promise<Access | null> {
  const userId = status.userId
  if (!supabase || !userId) return null
  const before = await getMeta<Access | null>(accessKey(userId), null)
  let access = before
  const { data, error } = await supabase.rpc('my_access')
  if (!error && (data === 'member' || data === 'waiting' || data === 'full')) {
    access = data
    if (access !== before) await setMeta(accessKey(userId), access)
  }
  if (status.userId !== userId) return null
  set({ access })
  if (access === 'member') {
    if (!engine) {
      // Keep sync state per user, so signing in as someone else re-pulls from scratch.
      engine = new SyncEngine(db, new SupabaseTarget(supabase, userId), syncKey(userId))
      engine.lastSyncedAt().then((lastSyncedAt) => set({ lastSyncedAt }))
      schedule(0)
      startProfileSync(supabase, userId)
    }
    if (before === 'waiting' || before === 'full') toast(t('acct.youreIn'))
  } else {
    engine = null
    stopProfileSync()
    clearTimeout(timer)
  }
  return access
}

/** Resolves once the session for `userId` is set up and its access known (or after a while, offline). */
export function sessionReady(userId: string, ms = 15_000): Promise<Access | null> {
  return new Promise((resolve) => {
    const check = () => {
      if (status.userId !== userId || status.access == null) return false
      done(status.access)
      return true
    }
    const done = (a: Access | null) => {
      listeners.delete(onChange)
      clearTimeout(timeout)
      resolve(a)
    }
    const onChange = () => void check()
    const timeout = setTimeout(() => done(status.userId === userId ? status.access : null), ms)
    listeners.add(onChange)
    check()
  })
}

let started = false

export function startSync() {
  if (started) return
  started = true
  writeListeners.add(() => {
    if (engine) schedule(1500)
  })
  if (!supabase) return

  // Supabase asks that nothing awaiting its own calls runs inside this callback: it would wait on itself.
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => void onSession(session?.user ?? null), 0)
  })

  // Waiting for access, these look for the approval; a member syncs.
  const wake = (delay: number) => {
    if (engine) schedule(delay)
    else if (status.userId) void refreshAccess()
  }
  window.addEventListener('online', () => wake(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake(500)
  })
  setInterval(() => wake(0), 5 * 60_000)
}

/**
 * Erases everything: the synced copy first (so it can't flow back), then this
 * device. Refuses while offline if signed in, rather than leave a copy behind.
 */
export async function eraseAllData(): Promise<void> {
  if (engine) {
    if (!navigator.onLine) throw new Error(t('err.offlineErase'))
    await engine.clearRemote()
  }
  clearTimeout(timer)
  await wipeLocal(db)
}

/**
 * What signing out would do. A member's phone is wiped after a last sync, so only with nothing left
 * to send; a waiting account has uploaded nothing, so its data stays on the phone, still theirs.
 */
export async function canSignOut(): Promise<'ready' | 'offline' | 'unsynced' | 'keeps-data'> {
  if (!engine) return 'keeps-data'
  if (!navigator.onLine) return 'offline'
  try {
    await engine.sync()
  } catch {
    return 'unsynced'
  }
  return (await engine.pending()) ? 'unsynced' : 'ready'
}

/** Run after canSignOut said 'ready' or 'keeps-data' (spec AC-13). */
export async function signOut(): Promise<void> {
  const wipe = !!engine
  engine = null
  clearTimeout(timer)
  await supabase?.auth.signOut({ scope: 'local' })
  if (wipe) await wipeLocal(db)
}

/** Settings → Delete account: the account and its server data, then this phone (spec AC-12). */
export async function deleteAccount(): Promise<void> {
  if (!supabase) return
  if (!navigator.onLine) throw new Error(t('acct.errOffline'))
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error(error.message)
  engine = null
  clearTimeout(timer)
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  await wipeLocal(db)
}
