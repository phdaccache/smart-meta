/**
 * Web Push, with nothing but WebCrypto, so the phone and the server share one copy (plan §5, §7.4).
 * The phone encrypts each push itself for its own subscription (RFC 8291, `aes128gcm` from RFC 8188):
 * the server only adds the VAPID signature (RFC 8292) and forwards the bytes it can't read. The push
 * to the owner on a new access request is the one the server encrypts itself.
 * No imports: the app (Vite) and the Edge Functions (Deno) both load this file as it is.
 */

// ——— base64url ———

export function toB64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const utf8 = (s: string) => new TextEncoder().encode(s)

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

// ——— what a push says ———

/** What the service worker shows (public/push-sw.js). `url` is a path in the app, never another site. */
export interface PushMessage {
  title: string
  body: string
  url: string
  /** Same tag, same notification: a newer one replaces it instead of stacking. */
  tag?: string
  /** The number for the app's icon, 0 to clear it; left out, the icon stays as it is. */
  badge?: number
}

/**
 * Push services must take 4,096 bytes (RFC 8030 §7.2); the encryption adds 103 (86 of header, 1 of
 * padding delimiter, 16 of tag). Texts are cut to fit before this is ever reached.
 */
export const PUSH_BYTES_MAX = 4096
export const MESSAGE_BYTES_MAX = PUSH_BYTES_MAX - 103

/** The subscription's keys, as `PushSubscription.getKey()` gives them, in base64url. */
export interface PushKeys {
  p256dh: string
  auth: string
}

/** Where pushes may go: the browsers' own push services (Apple, Google, Mozilla, Microsoft). The server checks the same list. */
export const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//

// ——— RFC 8291: encryption ———

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8)
  return new Uint8Array(bits)
}

/**
 * One push body, `aes128gcm`, for the subscription with these keys. `fixed` is for tests only (RFC 8291
 * Appendix A): a real push gets a new key pair and salt every time.
 */
export async function encryptPush(
  message: Uint8Array,
  to: PushKeys,
  fixed?: { keys: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  if (message.length > MESSAGE_BYTES_MAX) throw new Error(`push over ${PUSH_BYTES_MAX} bytes`)
  const uaPublic = fromB64u(to.p256dh)
  const authSecret = fromB64u(to.auth)
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('not a push subscription key')
  const keys = fixed?.keys ?? (await crypto.subtle.generateKey(P256, true, ['deriveBits']))
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, P256, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  // One record, so it ends with the last-record delimiter (2) and no padding.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aes, concat(message, Uint8Array.of(2)) as BufferSource))
  // Header: salt, record size (4096), key id length, then the key id: our public key.
  const header = concat(salt, Uint8Array.of(0, 0, 0x10, 0), Uint8Array.of(asPublic.length), asPublic)
  return concat(header, sealed)
}

export const encodeMessage = (m: PushMessage): Uint8Array => utf8(JSON.stringify(m))

// ——— RFC 8292: VAPID ———

export interface VapidKeys {
  /** The uncompressed P-256 point, base64url (the app's applicationServerKey). */
  publicKey: string
  /** The private scalar `d`, base64url. Only ever in Supabase's Edge Function secrets. */
  privateKey: string
}

/** Accepted by Apple in S1 (plan §5). */
export const VAPID_SUBJECT = 'https://smart-meta-h2ur.vercel.app'

async function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = fromB64u(keys.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key is not an uncompressed P-256 point')
  const jwk = { kty: 'EC', crv: 'P-256', x: toB64u(pub.slice(1, 33)), y: toB64u(pub.slice(33)), d: keys.privateKey, ext: false }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** The Authorization header for one push service (one per origin), good for 12 hours. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const head = toB64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = toB64u(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: VAPID_SUBJECT })))
  // WebCrypto signs ECDSA as r‖s, which is what a JWT wants.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys), utf8(`${head}.${claims}`) as BufferSource)
  return `vapid t=${head}.${claims}.${toB64u(new Uint8Array(signature))}, k=${keys.publicKey}`
}

/** What became of one push: the push service's answer, sorted. */
export type PushResult = 'sent' | 'gone' | 'failed'

export const pushResult = (status: number): PushResult =>
  status >= 200 && status < 300 ? 'sent' : status === 404 || status === 410 ? 'gone' : 'failed'

/**
 * POSTs one encrypted body. `ttl` matches the stale window (N-9): a push the phone can't get in time
 * isn't worth delivering later. `Urgency: high` keeps Android from holding it in battery saving.
 */
export function postPush(endpoint: string, body: Uint8Array, authorization: string, ttlSeconds: number): Promise<Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body: body as BodyInit,
    signal: AbortSignal.timeout(10_000),
  })
}
