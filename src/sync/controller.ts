import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { t } from '../i18n'
import { wipeLocal } from '../db/backup'
import { db } from '../db/db'
import { writeListeners } from '../db/repo'
import { getMeta, setMeta, setSettings } from '../db/settings'
import { toast } from '../ui/components'
import { EncryptedTarget } from './encrypted'
import { queueEverything, SyncEngine } from './engine'
import { forgetAll, forgetKey, keepKeys, localLockState, readyKey, type LockState } from './keys'
import { log, short } from './log'
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
  /**
   * Sync waits for this phone to hold the account's data key (spec PR-1): 'setup' makes it (Face ID, or
   * the data password), 'unlock' opens the one already made. Null when ready, or not signed in.
   */
  lock: LockState | null
}

let status: SyncStatus = {
  configured: !!supabase, email: null, userId: null, requestedAt: null, access: null,
  phase: 'signed-out', lastSyncedAt: null, pending: 0, error: null, lock: null,
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
    log('sync failed', err)
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
  // Supabase says "signed in" again each time the app comes back to the front, and repeats what other tabs
  // of the app hear. The same account again needs nothing: the wake-ups below already check access.
  if (user && user.id === current) return
  current = user?.id ?? null
  log('session', short(user?.id))
  if (!user) {
    engine = null
    stopProfileSync()
    clearTimeout(timer)
    set({ phase: 'signed-out', email: null, userId: null, requestedAt: null, access: null, lock: null })
    return
  }
  let owner = await phoneOwner()
  // The same person with a new account (theirs was removed, or deleted elsewhere): the data is theirs.
  if (owner && owner.id !== user.id && owner.email.toLowerCase() === (user.email ?? '').toLowerCase()) {
    await db.meta.delete(OWNER_KEY)
    owner = null
  }
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

/** The check under way, if any: checks asked for meanwhile share it. */
let checking: Promise<Access | null> | null = null

/**
 * Asks the server whether this account may sync, and starts or stops sync to match. Offline, the
 * last answer stands. Waiting turns into member on the first check after the owner approves.
 */
export function refreshAccess(): Promise<Access | null> {
  checking ??= checkAccess().finally(() => {
    checking = null
  })
  return checking
}

/**
 * Stores the server's answer and gives back the one stored before, in one step: another tab or window of
 * the app checking at the same time (or waking from the background with an old answer) can't both see
 * "waiting" and show the green banner twice.
 */
const swapAccess = (userId: string, access: Access) =>
  db.transaction('rw', db.meta, async () => {
    const before = ((await db.meta.get(accessKey(userId)))?.value ?? null) as Access | null
    if (before !== access) await db.meta.put({ key: accessKey(userId), value: access })
    return before
  })

async function checkAccess(): Promise<Access | null> {
  const userId = status.userId
  if (!supabase || !userId) return null
  const { data, error } = await supabase.rpc('my_access')
  log('access', short(userId), error ? `failed: ${error.message}` : data)
  if (!error && data === 'removed') {
    await removedFromSync(userId)
    return null
  }
  let access: Access | null
  let before: Access | null = null
  if (!error && (data === 'member' || data === 'waiting' || data === 'full')) {
    const answer: Access = data
    access = answer
    before = await swapAccess(userId, answer)
  } else {
    access = await getMeta<Access | null>(accessKey(userId), null)
  }
  if (status.userId !== userId) return null
  // Access is said last, with the key's state already known: the sign-in reads both together.
  if (access === 'member') {
    if (!engine) await startEngine(userId)
    // Approved while waiting: a green banner on Today says so until it's swiped away.
    if (before === 'waiting' || before === 'full') await setSettings({ acceptedBanner: true })
  } else {
    engine = null
    stopProfileSync()
    clearTimeout(timer)
    if (access) {
      const lock = await localLockState(userId)
      log('key', short(userId), 'not a member yet:', lock ?? 'ready')
      if (status.userId === userId) set({ lock })
    }
  }
  if (status.userId === userId) set({ access })
  return access
}

/** Starts syncing once this phone holds the account's data key; until then, says what's missing. */
async function startEngine(userId: string) {
  const key = await readyKey(supabase!, userId)
  log('key', short(userId), key instanceof CryptoKey ? 'ready' : key)
  if (status.userId !== userId || engine) return
  if (!(key instanceof CryptoKey)) {
    // Offline with nothing to go on: the next wake asks again.
    if (key !== 'offline') set({ lock: key })
    return
  }
  set({ lock: null })
  // Keep sync state per user, so signing in as someone else re-pulls from scratch.
  engine = new SyncEngine(db, new EncryptedTarget(new SupabaseTarget(supabase!, userId), key, userId), syncKey(userId))
  engine.lastSyncedAt().then((lastSyncedAt) => set({ lastSyncedAt }))
  schedule(0)
  startProfileSync(supabase!, userId)
}

/** After Face ID or the data password: sync starts for a member; a waiting account is ready for later. */
export async function keysReady() {
  if (status.userId) await refreshAccess()
}

/**
 * The owner removed this account: its server data is gone, but this phone keeps everything and goes on
 * without sync, with a red banner on Today saying so. The phone stays theirs (spec AC-13): signing up again
 * with the same email takes the data back; anyone else is asked to save a copy and remove it first.
 */
async function removedFromSync(userId: string) {
  engine = null
  stopProfileSync()
  clearTimeout(timer)
  await db.meta.bulkDelete([accessKey(userId), syncKey(userId)])
  // The keys went with the account.
  await forgetAll(userId)
  // Their name and avatar go up again if they're let back in.
  await setMeta('profileDirty', true)
  await setSettings({ removedBanner: true, acceptedBanner: false })
  await supabase?.auth.signOut({ scope: 'local' }).catch(() => {})
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
    const timeout = setTimeout(() => {
      log('sign-in: still waiting for access after', ms / 1000, 's')
      done(status.userId === userId ? status.access : null)
    }, ms)
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
  // The account stays, and so do its keys: no Face ID needed to sync again.
  const restore = status.userId ? await keepKeys(status.userId) : null
  await wipeLocal(db)
  await restore?.()
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
  const userId = status.userId
  engine = null
  clearTimeout(timer)
  await supabase?.auth.signOut({ scope: 'local' })
  if (wipe) await wipeLocal(db)
  // Signed out, the phone is locked: signing in again asks for Face ID (spec PR-3).
  else if (userId) await forgetKey(userId)
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
