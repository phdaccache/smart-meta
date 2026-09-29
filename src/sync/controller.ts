import { useSyncExternalStore } from 'react'
import { wipeLocal } from '../db/backup'
import { db } from '../db/db'
import { writeListeners } from '../db/repo'
import { SyncEngine } from './engine'
import { SupabaseTarget, supabase } from './supabase'

export interface SyncStatus {
  configured: boolean
  email: string | null
  phase: 'signed-out' | 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  pending: number
  error: string | null
}

let status: SyncStatus = {
  configured: !!supabase, email: null, phase: 'signed-out', lastSyncedAt: null, pending: 0, error: null,
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

let started = false

export function startSync() {
  if (started) return
  started = true
  writeListeners.add(() => {
    if (engine) schedule(1500)
  })
  if (!supabase) return

  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user
    if (!user) {
      engine = null
      set({ phase: 'signed-out', email: null })
      return
    }
    // Keep sync state per user, so signing in as someone else re-pulls from scratch.
    engine = new SyncEngine(db, new SupabaseTarget(supabase!, user.id), `sync:${user.id}`)
    set({ email: user.email ?? null, phase: 'idle' })
    engine.lastSyncedAt().then((lastSyncedAt) => set({ lastSyncedAt }))
    schedule(0)
  })

  window.addEventListener('online', () => schedule(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500)
  })
  setInterval(() => schedule(0), 5 * 60_000)
}

export async function sendLoginEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Sync is not configured for this build.')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw new Error(error.message)
}

/**
 * The emailed code, for iOS: a magic link opens in Safari, which does not share
 * storage with the Home Screen app. Typing the code signs in the app itself.
 */
export async function verifyLoginCode(email: string, code: string): Promise<void> {
  if (!supabase) throw new Error('Sync is not configured for this build.')
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
  if (error) throw new Error(error.message)
}

/**
 * Erases everything: the synced copy first (so it can't flow back), then this
 * device. Refuses while offline if signed in, rather than leave a copy behind.
 */
export async function eraseAllData(): Promise<void> {
  if (engine) {
    if (!navigator.onLine) throw new Error('You’re offline. Connect first so the synced copy is erased too.')
    await engine.clearRemote()
  }
  clearTimeout(timer)
  await wipeLocal(db)
}

/** Local data stays: the device is the source of truth. */
export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}
