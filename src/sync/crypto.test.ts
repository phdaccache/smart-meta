import { describe, expect, it } from 'vitest'
import {
  fromB64, isEnvelope, newKeys, openRecord, passkeyLock, passwordLock, random, sealRecord, toB64, unlock, WrongKeyError,
} from './crypto'

const USER = '00000000-0000-0000-0000-00000000000a'
/** Fewer rounds than the app uses, so tests stay fast; the format is the same. */
const FAST = 1000

describe('base64', () => {
  it('round-trips any bytes', () => {
    for (const n of [0, 1, 2, 3, 31, 32, 33]) {
      const b = random(n)
      expect([...fromB64(toB64(b))]).toEqual([...b])
    }
  })
})

describe('records (spec RE-3: round trip)', () => {
  it('seal and open give back the same record', async () => {
    const { key } = await newKeys()
    const goal = { id: 'g1', name: 'Run a half marathon', updatedAt: '2026-10-29T10:00:00.000Z', tags: ['é', '🏃'] }
    const box = await sealRecord(key, USER, 'goals', 'g1', goal)
    expect(isEnvelope(box)).toBe(true)
    expect(JSON.stringify(box)).not.toContain('marathon')
    expect(await openRecord(key, USER, 'goals', 'g1', box)).toEqual(goal)
  })

  it('seals the same record differently every time', async () => {
    const { key } = await newKeys()
    const a = await sealRecord(key, USER, 'goals', 'g1', { id: 'g1' })
    const b = await sealRecord(key, USER, 'goals', 'g1', { id: 'g1' })
    expect(a.ct).not.toBe(b.ct)
    expect(a.iv).not.toBe(b.iv)
  })

  it('refuses another key (spec RE-3: wrong key)', async () => {
    const mine = await newKeys()
    const other = await newKeys()
    const box = await sealRecord(mine.key, USER, 'goals', 'g1', { id: 'g1' })
    await expect(openRecord(other.key, USER, 'goals', 'g1', box)).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('refuses a record moved to another row or account, or changed', async () => {
    const { key } = await newKeys()
    const box = await sealRecord(key, USER, 'goals', 'g1', { id: 'g1' })
    await expect(openRecord(key, USER, 'goals', 'g2', box)).rejects.toBeInstanceOf(WrongKeyError)
    await expect(openRecord(key, USER, 'tasks', 'g1', box)).rejects.toBeInstanceOf(WrongKeyError)
    await expect(openRecord(key, '00000000-0000-0000-0000-00000000000b', 'goals', 'g1', box)).rejects.toBeInstanceOf(WrongKeyError)
    const ct = fromB64(box.ct)
    ct[0] ^= 1
    await expect(openRecord(key, USER, 'goals', 'g1', { ...box, ct: toB64(ct) })).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('tells envelopes from plain records', () => {
    expect(isEnvelope({ e: 1, iv: 'a', ct: 'b' })).toBe(true)
    expect(isEnvelope({ id: 'g1', updatedAt: 'x' })).toBe(false)
    expect(isEnvelope({ e: 1, iv: 'a', ct: 'b', id: 'g1' })).toBe(false)
    expect(isEnvelope({ e: 2, iv: 'a', ct: 'b' })).toBe(false)
    expect(isEnvelope(null)).toBe(false)
  })
})

describe('locks', () => {
  it('a passkey secret opens the data key, and only that secret does (spec RE-3: lost key)', async () => {
    const k = await newKeys()
    const secret = random(32)
    const lock = await passkeyLock(k.raw, k.keyId, 'cred', random(32), secret)
    const opened = await unlock(lock, k.keyId, secret)
    const box = await sealRecord(k.key, USER, 'goals', 'g1', { id: 'g1' })
    expect(await openRecord(opened, USER, 'goals', 'g1', box)).toEqual({ id: 'g1' })
    await expect(unlock(lock, k.keyId, random(32))).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('a password opens the data key, and a wrong one doesn\'t', async () => {
    const k = await newKeys()
    const lock = await passwordLock(k.raw, k.keyId, 'kifzuv-7nykha-Bodpej', FAST)
    expect(lock.iterations).toBe(FAST)
    const opened = await unlock(lock, k.keyId, 'kifzuv-7nykha-Bodpej')
    const box = await sealRecord(opened, USER, 'goals', 'g1', { id: 'g1' })
    expect(await openRecord(k.key, USER, 'goals', 'g1', box)).toEqual({ id: 'g1' })
    await expect(unlock(lock, k.keyId, 'kifzuv-7nykha-Bodpeh')).rejects.toBeInstanceOf(WrongKeyError)
    await expect(unlock(lock, k.keyId, random(32))).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('a lock belongs to its key: it can\'t be passed off as another', async () => {
    const k = await newKeys()
    const secret = random(32)
    const lock = await passkeyLock(k.raw, k.keyId, 'cred', random(32), secret)
    await expect(unlock(lock, 'another-key-id', secret)).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('the unlocked data key can\'t be read back out of the phone', async () => {
    const k = await newKeys()
    expect(k.key.extractable).toBe(false)
    const secret = random(32)
    const opened = await unlock(await passkeyLock(k.raw, k.keyId, 'cred', random(32), secret), k.keyId, secret)
    expect(opened.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', opened)).rejects.toThrow()
  })
})

describe('new keys', () => {
  it('include a sharing key pair whose private half is sealed (spec PR-5)', async () => {
    const k = await newKeys()
    const pub = await crypto.subtle.importKey('spki', fromB64(k.publicKey), { name: 'ECDH', namedCurve: 'P-256' }, true, [])
    expect(pub.type).toBe('public')
    expect(k.privateKey.ct.length).toBeGreaterThan(100)
    expect(k.keyId).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})
