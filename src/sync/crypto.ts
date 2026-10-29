/**
 * End-to-end encryption (spec PR-1 to PR-6, plan §7.2). Pure browser crypto, nothing else: the phone makes
 * a random data key, encrypts every record with it, and stores the key on the server only locked, by the
 * passkey's PRF secret or by a data password. The server never holds anything it can read.
 *
 * Formats here are stored on the server and must keep reading: change them only by adding a version.
 */

const enc = new TextEncoder()
const dec = new TextDecoder()
const subtle = () => globalThis.crypto.subtle

export const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n))

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** AES-GCM output: what records and locks keep on the server. */
export interface Sealed {
  iv: string
  ct: string
}

async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>, aad: string): Promise<Sealed> {
  const iv = random(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain)
  return { iv: toB64(iv), ct: toB64(ct) }
}

/** Throws when the key is wrong or anything was changed, including the `aad` it was sealed with. */
async function open(key: CryptoKey, box: Sealed, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) }, key, fromB64(box.ct)))
}

// ——— locks: the data key, locked once per way to unlock it ———

/** A passkey's PRF secret (plan §7.2): the passkey is the person's, synced by iCloud Keychain or Google. */
export interface PasskeyLock extends Sealed {
  kind: 'passkey'
  /** Which passkey, so the phone asks for that one. */
  credentialId: string
  /** The PRF input: each lock has its own. */
  salt: string
}

/** The fallback when passkeys don't work: a strong password the password manager made and keeps. */
export interface PasswordLock extends Sealed {
  kind: 'password'
  salt: string
  iterations: number
}

export type Lock = PasskeyLock | PasswordLock

/** OWASP's figure for PBKDF2-SHA256. The password is a generated one, so this is a second line. */
export const PASSWORD_ITERATIONS = 600_000

async function keyFromSecret(secret: BufferSource): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('smart-meta data key lock v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

async function keyFromPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

/** The data key as it's sealed into locks; the lock is bound to `keyId`, so it can't open another key. */
const lockAad = (keyId: string) => `smart-meta lock v1:${keyId}`

export async function passkeyLock(raw: Uint8Array<ArrayBuffer>, keyId: string, credentialId: string, salt: Uint8Array<ArrayBuffer>, secret: BufferSource): Promise<PasskeyLock> {
  const sealed = await seal(await keyFromSecret(secret), raw, lockAad(keyId))
  return { kind: 'passkey', credentialId, salt: toB64(salt), ...sealed }
}

export async function passwordLock(raw: Uint8Array<ArrayBuffer>, keyId: string, password: string, iterations = PASSWORD_ITERATIONS): Promise<PasswordLock> {
  const salt = random(16)
  const sealed = await seal(await keyFromPassword(password, salt, iterations), raw, lockAad(keyId))
  return { kind: 'password', salt: toB64(salt), iterations, ...sealed }
}

/** Data keys on the phone can't be read back out (plan §7.2): records can be sealed and opened, nothing else. */
const importDataKey = (raw: Uint8Array<ArrayBuffer>) =>
  subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])

/**
 * Opens a lock with what unlocks it: the passkey's PRF secret, or the password. Throws WrongKeyError when
 * that isn't the right one.
 */
export async function unlock(lock: Lock, keyId: string, opener: BufferSource | string): Promise<CryptoKey> {
  if ((lock.kind === 'password') !== (typeof opener === 'string')) throw new WrongKeyError()
  const kek = lock.kind === 'passkey'
    ? await keyFromSecret(opener as BufferSource)
    : await keyFromPassword(opener as string, fromB64(lock.salt), lock.iterations)
  let raw: Uint8Array<ArrayBuffer>
  try {
    raw = await open(kek, lock, lockAad(keyId))
  } catch {
    throw new WrongKeyError()
  }
  return importDataKey(raw)
}

export class WrongKeyError extends Error {
  constructor() {
    super('wrong key')
    this.name = 'WrongKeyError'
  }
}

// ——— a new set of keys ———

/** What the server keeps in `user_keys`: nothing in it opens without the person's passkey or password. */
export interface KeyRow {
  keyId: string
  /** The sharing key pair's public half (SPKI), for social features later (spec PR-5). */
  publicKey: string
  /** Its private half (PKCS #8), sealed with the data key. */
  privateKey: Sealed
  locks: Lock[]
}

export interface NewKeys {
  keyId: string
  /** The data key's bytes, only while locks are being made; then dropped. */
  raw: Uint8Array<ArrayBuffer>
  /** The same key, as the phone keeps it. */
  key: CryptoKey
  publicKey: string
  privateKey: Sealed
}

export async function newKeys(): Promise<NewKeys> {
  const raw = random(32)
  const keyId = toB64(random(16))
  const key = await importDataKey(raw)
  // P-256 works in every browser the app supports; nothing uses the pair yet.
  const pair = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publicKey = toB64(await subtle().exportKey('spki', pair.publicKey))
  const privateKey = await seal(key, new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey)), `smart-meta private key v1:${keyId}`)
  return { keyId, raw, key, publicKey, privateKey }
}

// ——— records ———

/** A record's `data` on the server. `e` is the format's version. */
export interface Envelope extends Sealed {
  e: 1
}

export const isEnvelope = (d: unknown): d is Envelope =>
  !!d && typeof d === 'object' && (d as Envelope).e === 1 && typeof (d as Envelope).iv === 'string' && typeof (d as Envelope).ct === 'string'
  && Object.keys(d).length === 3

/** Binds the ciphertext to its row: the server can't move one record's content into another. */
const recordAad = (userId: string, collection: string, id: string) => `smart-meta record v1:${userId}:${collection}:${id}`

export async function sealRecord(key: CryptoKey, userId: string, collection: string, id: string, data: unknown): Promise<Envelope> {
  return { e: 1, ...(await seal(key, enc.encode(JSON.stringify(data)), recordAad(userId, collection, id))) }
}

/** Throws WrongKeyError when it doesn't open (another key, or changed on the server). */
export async function openRecord(key: CryptoKey, userId: string, collection: string, id: string, box: Envelope): Promise<unknown> {
  let plain: Uint8Array<ArrayBuffer>
  try {
    plain = await open(key, box, recordAad(userId, collection, id))
  } catch {
    throw new WrongKeyError()
  }
  return JSON.parse(dec.decode(plain))
}
