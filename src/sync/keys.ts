import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '../db/db'
import { getMeta, setMeta } from '../db/settings'
import {
  fromB64, newKeys, passkeyLock, passwordLock, random, toB64, unlock, WrongKeyError, type KeyRow, type Lock, type NewKeys,
  type PasskeyLock,
} from './crypto'

/**
 * Where each person's keys live (plan §7.2). On the server, `user_keys`: the data key, only locked. On the
 * phone, the same row (so it can be unlocked offline, and kept while waiting for access, spec AC-4) and,
 * once unlocked, the data key itself, which the browser won't let be read back out. Face ID is asked at
 * set-up and on a new phone or after signing out, never in daily use (spec PR-3).
 */

const rowKey = (userId: string) => `keys:${userId}`
const dataKeyKey = (userId: string) => `dataKey:${userId}`

interface DataKey {
  keyId: string
  key: CryptoKey
}

/** What still stands between this account and syncing: making its keys, or unlocking them. */
export type LockState = 'setup' | 'unlock'

export const localRow = (userId: string) => getMeta<KeyRow | null>(rowKey(userId), null)
const localKey = (userId: string) => getMeta<DataKey | null>(dataKeyKey(userId), null)

/** Signing out locks the phone again; the locked row stays, so a waiting account can unlock it later. */
export async function forgetKey(userId: string) {
  await db.meta.delete(dataKeyKey(userId))
}

export async function forgetAll(userId: string) {
  await db.meta.bulkDelete([dataKeyKey(userId), rowKey(userId)])
}

/** Both entries, to put back after the phone is emptied for "Erase all data". */
export async function keepKeys(userId: string): Promise<() => Promise<void>> {
  const rows = await db.meta.bulkGet([dataKeyKey(userId), rowKey(userId)])
  return async () => {
    await db.meta.bulkPut(rows.filter((r) => r != null))
  }
}

async function keep(userId: string, row: KeyRow, key: CryptoKey) {
  await setMeta(rowKey(userId), row)
  await setMeta(dataKeyKey(userId), { keyId: row.keyId, key } satisfies DataKey)
}

/** Without asking the server (waiting for access, spec AC-4): whether this phone has its keys ready. */
export async function localLockState(userId: string): Promise<LockState | null> {
  const local = await localKey(userId)
  const row = await localRow(userId)
  if (local && row?.keyId === local.keyId) return null
  return row ? 'unlock' : 'setup'
}

// ——— the server's copy ———

interface ServerRow {
  key_id: string
  public_key: string
  private_key: KeyRow['privateKey']
  locks: Lock[]
}
const fromServer = (r: ServerRow): KeyRow => ({ keyId: r.key_id, publicKey: r.public_key, privateKey: r.private_key, locks: r.locks })

/**
 * For a member: the data key to sync with, once this phone holds the one on the server, uploading this
 * phone's if the server has none yet (made while waiting). Otherwise what's missing, or 'offline' when the
 * server couldn't be asked and the phone can't tell.
 */
export async function readyKey(client: SupabaseClient, userId: string): Promise<CryptoKey | LockState | 'offline'> {
  const local = await localKey(userId)
  const row = await localRow(userId)
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await client.from('user_keys').select('key_id, public_key, private_key, locks').eq('user_id', userId).maybeSingle()
    if (error) return local && row?.keyId === local.keyId ? 'offline' : row ? 'unlock' : 'offline'
    if (data) {
      const server = fromServer(data as ServerRow)
      if (local?.keyId === server.keyId) {
        if (JSON.stringify(row) !== JSON.stringify(server)) await setMeta(rowKey(userId), server)
        return local.key
      }
      // Another phone's keys got there first (or this one's never did): the server's are the ones.
      await db.meta.delete(dataKeyKey(userId))
      await setMeta(rowKey(userId), server)
      return 'unlock'
    }
    if (!row) return 'setup'
    if (!local || local.keyId !== row.keyId) return 'unlock'
    const { error: insertError } = await client.from('user_keys').insert({
      user_id: userId, key_id: row.keyId, public_key: row.publicKey, private_key: row.privateKey, locks: row.locks,
    })
    if (!insertError) return local.key
    // Made at the same moment on another phone: read theirs and go again.
    if (insertError.code !== '23505') return 'offline'
  }
  return 'offline'
}

// ——— passkeys ———

/** False when this browser can't do passkeys with PRF at all: the data password then. Null when it can't tell. */
export async function passkeysWork(): Promise<boolean | null> {
  if (!window.PublicKeyCredential || !navigator.credentials) return false
  try {
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false
  } catch {
    return null
  }
  try {
    const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.()
    if (caps && caps['extension:prf'] === false) return false
  } catch {
    // Older browsers don't say; trying tells.
  }
  return null
}

/** The passkey made, but it gives no secret (no PRF): this browser can't lock data with it. */
export class NoPrfError extends Error {
  constructor() {
    super('no PRF')
    this.name = 'NoPrfError'
  }
}

interface PrfResults {
  enabled?: boolean
  results?: { first?: BufferSource }
}
const prfOf = (c: PublicKeyCredential) => (c.getClientExtensionResults() as { prf?: PrfResults }).prf

/**
 * Makes a passkey (one Face ID) and the keys it locks. Call it straight from the tap, with nothing awaited
 * before: Safari only allows a passkey right after one. Its user id is random, so a second set-up never
 * replaces a passkey that already locks something. Throws NoPrfError, or the browser's error when the person
 * cancels (NotAllowedError).
 */
export async function setUpWithPasskey(userId: string, email: string): Promise<void> {
  const salt = random(32)
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Smart Meta' },
      user: { id: random(16), name: email, displayName: email },
      challenge: random(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      timeout: 120_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new NoPrfError()
  const prf = prfOf(cred)
  const credentialId = toB64(cred.rawId)
  // iPhone and Android give the secret right away (S1); some browsers only on the first use.
  let secret = prf?.results?.first
  if (!secret) {
    if (!prf?.enabled) throw new NoPrfError()
    secret = (await passkeySecret([{ credentialId, salt: toB64(salt) }])).secret
  }
  const k = await newKeys()
  await keep(userId, rowOf(k, [await passkeyLock(k.raw, k.keyId, credentialId, salt, secret)]), k.key)
}

/** One Face ID: the PRF secret of whichever of these passkeys the person uses. */
async function passkeySecret(locks: { credentialId: string; salt: string }[]): Promise<{ credentialId: string; secret: BufferSource }> {
  const evalByCredential = Object.fromEntries(locks.map((l) => [l.credentialId, { first: fromB64(l.salt) }]))
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: 'required',
      timeout: 120_000,
      allowCredentials: locks.map((l) => ({ type: 'public-key' as const, id: fromB64(l.credentialId) })),
      extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  const secret = cred && prfOf(cred)?.results?.first
  if (!cred || !secret) throw new NoPrfError()
  return { credentialId: toB64(cred.rawId), secret }
}

/**
 * A new phone, or after signing out: Face ID opens the data key kept on the server. `row` is read before
 * the tap: Safari only lets a passkey be used right after one, with nothing slow in between.
 */
export async function unlockWithPasskey(userId: string, row: KeyRow): Promise<void> {
  const locks = row.locks.filter((l): l is PasskeyLock => l.kind === 'passkey')
  if (!locks.length) throw new WrongKeyError()
  const { credentialId, secret } = await passkeySecret(locks)
  const lock = locks.find((l) => l.credentialId === credentialId)
  if (!lock) throw new WrongKeyError()
  await keep(userId, row, await unlock(lock, row.keyId, secret))
}

// ——— the data password ———

export async function setUpWithPassword(userId: string, password: string): Promise<void> {
  const k = await newKeys()
  await keep(userId, rowOf(k, [await passwordLock(k.raw, k.keyId, password)]), k.key)
}

/** Throws WrongKeyError when it isn't the password that locked it. */
export async function unlockWithPassword(userId: string, password: string): Promise<void> {
  const row = await localRow(userId)
  const locks = (row?.locks ?? []).filter((l) => l.kind === 'password')
  if (!row || !locks.length) throw new WrongKeyError()
  for (const lock of locks) {
    try {
      return await keep(userId, row, await unlock(lock, row.keyId, password))
    } catch (e) {
      if (!(e instanceof WrongKeyError)) throw e
    }
  }
  throw new WrongKeyError()
}

const rowOf = (k: NewKeys, locks: Lock[]): KeyRow => ({ keyId: k.keyId, publicKey: k.publicKey, privateKey: k.privateKey, locks })
