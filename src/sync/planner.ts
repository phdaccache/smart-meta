import { db } from '../db/db'
import { getMeta, getSettings, setMeta } from '../db/settings'
import { planPushes, type PlannedPush, type Prefs } from '../lib/planner'
import { phoneTimeZone } from '../lib/zoned'
import { loadPrefs, loadSnapshot } from '../ui/hooks'
import { encodeMessage, encryptPush, toB64u, type PushKeys } from '../../supabase/functions/_shared/webpush'
import { log } from './log'
import { supabase } from './supabase'

/**
 * Plans the account's pushes on this phone and sends the server what changed (plan §4.1). Runs after each
 * sync, so it plans from the newest data of every device: any of the account's phones can plan, since each
 * can read the subscription's public keys, and every phone plans the same pushes from the same synced data
 * and Settings → Notifications. Each push is encrypted here for that subscription (plan §7.4).
 */

/** Where the account stands with pushes, as the server last said (src/sync/push.ts). */
export const pushStatusKey = (userId: string) => `pushStatus:${userId}`

/** The last plan this phone saw on the server: nothing changed, nothing to ask the server again. */
const planKey = (userId: string) => `plan:${userId}`

async function sha(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return toB64u(bytes).slice(0, 43)
}

/** What makes a row different: anything in it but the encryption, which is new each time. */
const rowTag = (p: PlannedPush, subKey: string) => sha(JSON.stringify([p.id, p.fireAt, p.kind, p.message, subKey]))

/** Upserts and deletes go in groups, so one request stays small. */
const CHUNK = 50

let running: Promise<void> | null = null
let again = false

/** Plans now, or right after the run under way (whose data may be older). */
export function planSoon(userId: string): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await plan(userId)
      } while (again)
    } catch (e) {
      log('plan failed', e)
    } finally {
      running = null
    }
  })()
  return running
}

async function plan(userId: string) {
  if (!supabase) return
  const { data: sub, error } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').maybeSingle()
  if (error) throw new Error(error.message)
  // No phone takes the account's pushes: the server dropped what was planned with the subscription.
  if (!sub) return setMeta(planKey(userId), null)

  const [snap, weekReviews, prefs, settings] = await Promise.all([loadSnapshot(), db.weekReviews.toArray(), loadPrefs(), getSettings()])
  await tellRequestQuiet(userId, prefs)
  const pushes = planPushes({
    snap, weekReviews: weekReviews.filter((w) => !w.deletedAt), prefs, now: Date.now(), timeZone: phoneTimeZone(),
    rolloverHour: settings.rolloverHour,
  })
  const tags = await Promise.all(pushes.map((p) => rowTag(p, sub.p256dh)))
  const whole = await sha(JSON.stringify([sub.endpoint, tags]))
  if ((await getMeta<string | null>(planKey(userId), null)) === whole) return

  const { data: rows, error: readError } = await supabase.from('scheduled_notifications').select('id, tag').eq('status', 'pending')
  if (readError) throw new Error(readError.message)
  const onServer = new Map((rows ?? []).map((r) => [r.id as string, r.tag as string | null]))
  const wanted = new Set(pushes.map((p) => p.id))

  // Gone first, so the server's cap (N-5) counts only what stays. The test push isn't the planner's.
  const gone = [...onServer.keys()].filter((id) => !wanted.has(id) && !id.startsWith('test:'))
  for (let i = 0; i < gone.length; i += CHUNK) {
    const { error: e } = await supabase.from('scheduled_notifications').delete().in('id', gone.slice(i, i + CHUNK))
    if (e) throw new Error(e.message)
  }

  const keys: PushKeys = { p256dh: sub.p256dh, auth: sub.auth }
  const changed = pushes.map((p, i) => ({ p, tag: tags[i] })).filter(({ p, tag }) => onServer.get(p.id) !== tag)
  for (let i = 0; i < changed.length; i += CHUNK) {
    const batch = await Promise.all(changed.slice(i, i + CHUNK).map(async ({ p, tag }) => ({
      id: p.id, fire_at: new Date(p.fireAt).toISOString(), kind: p.kind, tag, sub_key: sub.p256dh,
      payload: toB64u(await encryptPush(encodeMessage(p.message), keys)),
    })))
    const { error: e } = await supabase.from('scheduled_notifications').upsert(batch, { onConflict: 'user_id,id' })
    if (e) throw new Error(e.message)
  }
  await setMeta(planKey(userId), whole)
  log('push', 'planned', pushes.length, 'changed', changed.length, 'removed', gone.length)
}

/**
 * The owner's "New request" push is the one the server starts by itself, so it needs the owner's quiet hours
 * (0011, spec NO-22). Only the owner's account sends them. A failure doesn't stop the plan; the next one tries again.
 */
async function tellRequestQuiet(userId: string, prefs: Prefs) {
  if (!supabase || !(await getMeta<{ owner?: boolean } | null>(pushStatusKey(userId), null))?.owner) return
  const hours = prefs.quiet ? [prefs.quietFrom, prefs.quietTo] : [null, null]
  const key = `requestQuiet:${userId}`
  if (JSON.stringify(await getMeta<unknown>(key, null)) === JSON.stringify(hours)) return
  const { error } = await supabase.rpc('set_request_quiet', { quiet_from: hours[0], quiet_to: hours[1] })
  if (error) return log('push', 'request quiet failed', error.message)
  await setMeta(key, hours)
}

/** After signing out or a new subscription, the next plan asks the server afresh. */
export const forgetPlan = (userId: string) => setMeta(planKey(userId), null)
