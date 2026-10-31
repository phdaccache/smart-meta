// Smart Meta: the dispatcher (stage S5 of docs/notifications, plan §4.1).
// `pg_cron` calls it every minute with a secret from Vault (spec SE-6); it sends what's due and says how
// each push went. The choosing (late, fuse, shadow, kill switch) happens in the database, in
// private.dispatch_claim() and private.dispatch_requests() (supabase/migrations/0006_push.sql).
// Planned pushes arrive already encrypted by the phone: this only signs and forwards them. The one it
// encrypts itself is the owner's "New request" (spec AC-5).
//
// Secrets (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
// SUPABASE_DB_URL is there already. Deployed with JWT checks off: the cron job has no user.

import postgres from 'npm:postgres@3.4.5'
import {
  encodeMessage, encryptPush, fromB64u, postPush, pushResult, vapidAuthorization, type PushResult, type VapidKeys,
} from '../_shared/webpush.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 })

const vapid: VapidKeys = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
}

/** N-9 in seconds: a push the phone can't get in time isn't worth delivering later. */
const TTL_SECONDS = 15 * 60
/** At most this many pushes in one run; the rest wait a minute. */
const BATCH = 200
/** Pushes in flight at once. */
const PARALLEL = 10

const REQUEST_TITLE = { en: 'New request', 'pt-BR': 'Novo pedido' } as const

let secret: string | null = null

/** Same length, every character compared: how long it takes says nothing about the secret. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

interface Outcome {
  user_id: string
  id: string | null
  kind: string
  endpoint: string
  result: PushResult
  code: number | null
}

/** One VAPID header per push service per run. */
const authorizations = new Map<string, Promise<string>>()
const authorization = (endpoint: string) => {
  const origin = new URL(endpoint).origin
  if (!authorizations.has(origin)) authorizations.set(origin, vapidAuthorization(endpoint, vapid))
  return authorizations.get(origin)!
}

async function send(endpoint: string, body: Uint8Array): Promise<{ result: PushResult; code: number | null }> {
  try {
    const res = await postPush(endpoint, body, await authorization(endpoint), TTL_SECONDS)
    await res.body?.cancel()
    return { result: pushResult(res.status), code: res.status }
  } catch {
    return { result: 'failed', code: null }
  }
}

async function inTurns<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))
  return out
}

Deno.serve(async (req) => {
  const given = req.headers.get('x-dispatch-secret') ?? ''
  // Anything that isn't even shaped like the secret is turned away without touching the database.
  if (req.method !== 'POST' || !/^[0-9a-f]{64}$/.test(given)) return new Response('Not allowed', { status: 401 })
  secret ??= (await sql`select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_secret'`)[0]?.decrypted_secret ?? null
  if (!secret || !same(given, secret)) return new Response('Not allowed', { status: 401 })
  if (!vapid.publicKey || !vapid.privateKey) return new Response('VAPID keys are not set', { status: 500 })
  authorizations.clear()

  const due = await sql<{ user_id: string; id: string; kind: string; payload: string; endpoint: string }[]>`
    select * from private.dispatch_claim(${BATCH})`
  const requests = await sql<{ user_id: string; email: string; endpoint: string; p256dh: string; auth: string; lang: string }[]>`
    select * from private.dispatch_requests()`

  const outcomes: Outcome[] = [
    ...(await inTurns(due, async (r) => ({
      user_id: r.user_id, id: r.id, kind: r.kind, endpoint: r.endpoint, ...(await send(r.endpoint, fromB64u(r.payload))),
    }))),
    ...(await inTurns(requests, async (r) => {
      const message = encodeMessage({
        title: REQUEST_TITLE[r.lang === 'pt-BR' ? 'pt-BR' : 'en'],
        // An email is at most 254 characters: far inside a push.
        body: r.email.slice(0, 254),
        url: '/settings/requests',
        tag: 'request',
      })
      const body = await encryptPush(message, { p256dh: r.p256dh, auth: r.auth })
      return { user_id: r.user_id, id: null, kind: 'request', endpoint: r.endpoint, ...(await send(r.endpoint, body)) }
    })),
  ]
  if (outcomes.length) await sql`select private.dispatch_done(${JSON.stringify(outcomes)}::text::jsonb)`

  const count = (result: PushResult) => outcomes.filter((o) => o.result === result).length
  // Counts only: no addresses, ids or content in the function's logs.
  return Response.json({ sent: count('sent'), gone: count('gone'), failed: count('failed') })
})
