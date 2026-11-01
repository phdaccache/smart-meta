import { getMeta, setMeta } from '../db/settings'
import { getLang } from '../i18n'
import {
  encodeMessage, encryptPush, fromB64u, toB64u, type PushKeys, type PushMessage,
} from '../../supabase/functions/_shared/webpush'
import { phoneTimeZone } from '../lib/zoned'
import { log } from './log'
import { forgetPlan, planSoon, pushStatusKey } from './planner'
import { supabase } from './supabase'

/**
 * This phone's push subscription (plan §5). One per account (spec NO-15): the latest phone that turns
 * notifications on gets them, and any other phone notices on its next open and stops. Each open checks
 * the subscription and quietly renews it (spec NO-27). Pushes are planned and encrypted here, for this
 * subscription only (plan §7.4); the server just sends them when they're due.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** The endpoint this phone last saved for the account: set while notifications are on here. */
const pushKey = (userId: string) => `push:${userId}`

export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined' && typeof Notification !== 'undefined'

/** Built with the server's public key (VITE_VAPID_PUBLIC_KEY), on a phone that can take pushes. */
export const pushAvailable = (): boolean => !!VAPID_PUBLIC_KEY && !!supabase && pushSupported()

export const pushOnHere = (userId: string) => getMeta<string | null>(pushKey(userId), null).then((e) => !!e)

/** Where a push goes, for the log: the push service's host only. */
const host = (endpoint: string) => new URL(endpoint).host

async function registration(): Promise<ServiceWorkerRegistration> {
  // The dev server has no service worker: `ready` would wait forever.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No service worker')), 10_000)),
  ])
}

function keysOf(sub: PushSubscription): PushKeys {
  const p256dh = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!p256dh || !auth) throw new Error('The subscription has no keys')
  return { p256dh: toB64u(new Uint8Array(p256dh)), auth: toB64u(new Uint8Array(auth)) }
}

/** The browser's subscription for our server, made if `create` and missing. One made for other keys is dropped. */
async function browserSubscription(create: boolean): Promise<PushSubscription | null> {
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  const key = sub?.options.applicationServerKey
  if (sub && key && toB64u(new Uint8Array(key)) !== VAPID_PUBLIC_KEY) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(VAPID_PUBLIC_KEY!) as BufferSource })
  }
  return sub
}

/** Makes this phone the account's one (spec NO-15). A new subscription drops what was planned for the old one. */
async function save(userId: string, sub: PushSubscription) {
  const { error } = await supabase!.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint, ...keysOf(sub),
      time_zone: phoneTimeZone(),
      lang: getLang(), checked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
  await setMeta(pushKey(userId), sub.endpoint)
  // New keys: whatever was planned went with the old ones.
  await forgetPlan(userId)
  void planSoon(userId)
}

/**
 * From a tap (the iPhone asks only then, and only in the installed app): asks permission, subscribes,
 * and saves the subscription. 'denied' when the person said no now or before (spec NO-24).
 */
export async function turnOnPush(userId: string): Promise<'on' | 'denied'> {
  if (!pushAvailable()) throw new Error('Notifications aren’t available here')
  // Asked first, before anything that waits: Safari counts the tap only until then.
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  log('push', 'permission', permission)
  if (permission !== 'granted') return 'denied'
  const sub = await browserSubscription(true)
  await save(userId, sub!)
  log('push', 'on', host(sub!.endpoint))
  return 'on'
}

/** Stops pushes to this phone: the server's copy goes first (with what was planned), then the browser's. */
export async function turnOffPush(userId: string): Promise<void> {
  const ours = await getMeta<string | null>(pushKey(userId), null)
  if (!ours) return
  // The phone's own subscription goes first, so nothing reaches it even when the server can't be told
  // (signing out offline): the push service then answers "gone", and the server deletes its copy (NO-27).
  const sub = await browserSubscription(false).catch(() => null)
  await sub?.unsubscribe().catch(() => {})
  await setMeta(pushKey(userId), null)
  await forgetPlan(userId)
  log('push', 'off')
  if (supabase) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', ours)
    if (error) throw new Error(error.message)
  }
}

/** Where the account stands with pushes (0008): the mode, whether it's in the rollout, and whether it's the owner's. */
export interface PushStatus {
  mode: 'on' | 'shadow' | 'off'
  /** In the rollout: Settings → Notifications shows (the app's beta flag). */
  live: boolean
  owner: boolean
}

export { pushStatusKey }

/** Asks the server, and keeps the answer for screens to read. Offline (or before 0008), the last answer stands. */
export async function refreshPushStatus(userId: string): Promise<PushStatus | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('push_status')
  const s = data as PushStatus | null
  if (error || !s || typeof s !== 'object') {
    if (error) log('push status failed', error.message)
    return getMeta<PushStatus | null>(pushStatusKey(userId), null)
  }
  const status: PushStatus = { mode: s.mode, live: !!s.live, owner: !!s.owner }
  await setMeta(pushStatusKey(userId), status)
  return status
}

/** Developer → Pushes (the owner only, checked by the server): 'off' is the kill switch (spec NO-16). */
export async function setPushMode(userId: string, mode: PushStatus['mode']): Promise<void> {
  const { error } = await supabase!.rpc('set_push_mode', { new_mode: mode })
  if (error) throw new Error(error.message)
  log('push', 'mode', mode)
  await refreshPushStatus(userId)
}

/** The members in the shadow beta (0010), for the owner: they get real pushes while the mode is Shadow. */
export async function pushBeta(): Promise<Set<string>> {
  const { data, error } = await supabase!.rpc('push_beta_members')
  if (error) throw new Error(error.message)
  return new Set((data as (string | { push_beta_members: string })[]).map((r) => (typeof r === 'string' ? r : r.push_beta_members)))
}

export async function setPushBeta(member: string, beta: boolean): Promise<void> {
  const { error } = await supabase!.rpc('set_push_beta', { member, beta })
  if (error) throw new Error(error.message)
  log('push', 'beta', beta)
}

/** Checked at most this often while the app stays open, besides each open. */
const CHECK_EVERY_MS = 60 * 60_000
/** The server's `checked_at` is renewed about once a day, not on every open (spec NO-23). */
const CHECKED_STALE_MS = 20 * 3600_000
let lastCheck = 0

/**
 * On each open: renews this phone's subscription if the browser or the server dropped it (spec NO-27),
 * and stops here if another phone took over (spec NO-15). Never asks for permission.
 */
export async function checkPush(userId: string): Promise<void> {
  if (!supabase || Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()
  await refreshPushStatus(userId)
  if (!pushAvailable()) return
  const ours = await getMeta<string | null>(pushKey(userId), null)
  if (!ours) return
  try {
    if (Notification.permission !== 'granted') {
      // Turned off in the phone's settings: kept as on, so it works again once allowed (spec NO-24).
      log('push', 'permission', Notification.permission)
      return
    }
    const { data, error } = await supabase!.from('push_subscriptions').select('endpoint, checked_at').maybeSingle()
    if (error) throw new Error(error.message)
    if (data && data.endpoint !== ours) {
      await setMeta(pushKey(userId), null)
      log('push', 'another phone gets them now')
      return
    }
    const sub = await browserSubscription(true)
    const stale = !data || Date.now() - Date.parse(data.checked_at) > CHECKED_STALE_MS
    if (sub && (sub.endpoint !== ours || stale)) {
      await save(userId, sub)
      log('push', data ? (sub.endpoint !== ours ? 'renewed' : 'checked') : 'saved again', host(sub.endpoint))
    }
  } catch (e) {
    lastCheck = 0
    log('push check failed', e)
  }
}

/**
 * Developer → Send a test notification (spec NO-25): encrypted here like every planned push, due now,
 * so it comes with the dispatcher's next run, within a minute.
 */
export async function sendTestPush(userId: string): Promise<void> {
  const ours = await getMeta<string | null>(pushKey(userId), null)
  const sub = await browserSubscription(false)
  if (!ours || !sub || sub.endpoint !== ours) throw new Error('Turn on notifications on this phone first.')
  const keys = keysOf(sub)
  const time = new Date().toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' })
  const message: PushMessage = { title: 'Test notification', body: `Sent at ${time}. Push works on this phone.`, url: '/settings/developer', tag: 'test' }
  const payload = toB64u(await encryptPush(encodeMessage(message), keys))
  const { error } = await supabase!.from('scheduled_notifications').insert({
    id: `test:${Date.now()}`, fire_at: new Date().toISOString(), kind: 'test', payload, sub_key: keys.p256dh,
  })
  if (error) throw new Error(error.message)
  log('push', 'test planned', host(sub.endpoint))
}
