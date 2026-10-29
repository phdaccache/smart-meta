import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../db/db'
import type { Base, Value } from '../lib/types'
import { isEnvelope, newKeys } from './crypto'
import { EncryptedTarget } from './encrypted'
import { queueEverything, SyncEngine } from './engine'
import { FakeTarget } from './testTarget'

const USER = '00000000-0000-0000-0000-00000000000a'

let n = 0
const value = (name: string, updatedAt = new Date().toISOString()): Value => ({
  id: `v${++n}`, name, description: '', createdAt: updatedAt, updatedAt,
})

async function write(db: AppDB, v: Value) {
  await db.transaction('rw', db.values, db.outbox, async () => {
    await db.values.put(v)
    await db.outbox.add({ collection: 'values', id: v.id, queuedAt: v.updatedAt })
  })
}

async function phone() {
  const db = new AppDB(`test-${Math.random()}`)
  await db.open()
  return db
}

let server: FakeTarget
let key: CryptoKey

beforeEach(async () => {
  server = new FakeTarget()
  key = (await newKeys()).key
})

describe('encrypted sync', () => {
  it('the server holds only ciphertext, and a second phone with the key gets everything back', async () => {
    const a = await phone()
    for (const name of ['Health', 'Family', 'Career']) await write(a, value(name))
    await new SyncEngine(a, new EncryptedTarget(server, key, USER)).sync()

    expect(server.rows.size).toBe(3)
    for (const r of server.rows.values()) expect(isEnvelope(r.data)).toBe(true)
    expect(JSON.stringify([...server.rows.values()])).not.toMatch(/Health|Family|Career/)

    const b = await phone()
    await new SyncEngine(b, new EncryptedTarget(server, key, USER)).sync()
    expect((await b.values.toArray()).map((v) => v.name).sort()).toEqual(['Career', 'Family', 'Health'])
  })

  it('keeps the newer side winning, as before', async () => {
    const a = await phone()
    const b = await phone()
    const v = value('old', '2026-01-01T00:00:00.000Z')
    await write(a, v)
    await new SyncEngine(a, new EncryptedTarget(server, key, USER)).sync()
    await new SyncEngine(b, new EncryptedTarget(server, key, USER)).sync()
    await write(b, { ...v, name: 'new', updatedAt: '2026-06-01T00:00:00.000Z' })
    await new SyncEngine(b, new EncryptedTarget(server, key, USER)).sync()
    await new SyncEngine(a, new EncryptedTarget(server, key, USER)).sync()
    expect((await a.values.get(v.id))!.name).toBe('new')
  })

  it('with the wrong key, nothing is taken in and the phone keeps its own copy (spec RE-3: wrong key)', async () => {
    const a = await phone()
    await write(a, value('Health'))
    await new SyncEngine(a, new EncryptedTarget(server, key, USER)).sync()

    const b = await phone()
    const mine = value('Mine')
    await b.values.put(mine)
    const wrong = new EncryptedTarget(server, (await newKeys()).key, USER)
    await new SyncEngine(b, wrong).sync()
    expect(wrong.unreadable).toBe(1)
    expect((await b.values.toArray()).map((v) => v.name)).toEqual(['Mine'])
  })

  it('skips records the server changed or moved, and anything still readable', async () => {
    const a = await phone()
    const v1 = value('One')
    const v2 = value('Two')
    await write(a, v1)
    await write(a, v2)
    await new SyncEngine(a, new EncryptedTarget(server, key, USER)).sync()
    // The server puts one record's ciphertext in the other's place, and adds a readable record.
    const r1 = server.rows.get(`values/${v1.id}`)!
    server.rows.set(`values/${v2.id}`, { ...server.rows.get(`values/${v2.id}`)!, data: r1.data, seq: ++server.seq })
    const fake = value('Planted')
    server.rows.set(`values/${fake.id}`, {
      collection: 'values', id: fake.id, data: fake, updatedAt: fake.updatedAt, deleted: false, dataVersion: 1, seq: ++server.seq,
    })

    const b = await phone()
    const t = new EncryptedTarget(server, key, USER)
    t.migrate = async () => 0 // the planted row arrives after this phone's migration ran
    await new SyncEngine(b, t).sync()
    expect((await b.values.toArray()).map((v) => v.name)).toEqual(['One'])
    expect(t.unreadable).toBe(2)
  })
})

describe('migration (spec PR-6)', () => {
  /** What an account synced before S3 looks like: readable rows. */
  async function before() {
    const a = await phone()
    for (const name of ['Health', 'Family', 'Career', 'Friends', 'Fun']) await write(a, value(name))
    await new SyncEngine(a, server).sync()
    for (const r of server.rows.values()) expect(isEnvelope(r.data)).toBe(false)
    return a
  }

  it('seals every readable row, across pages, keeping its time; then a new phone reads them all', async () => {
    await before()
    const times = new Map([...server.rows].map(([k, r]) => [k, r.updatedAt]))
    const t = new EncryptedTarget(server, key, USER)
    expect(await t.migrate()).toBe(5)
    for (const [k, r] of server.rows) {
      expect(isEnvelope(r.data)).toBe(true)
      expect(r.updatedAt).toBe(times.get(k))
    }
    expect(JSON.stringify([...server.rows.values()])).not.toMatch(/Health|Family|Career|Friends|Fun/)
    expect(await t.migrate()).toBe(0)

    const b = await phone()
    await new SyncEngine(b, new EncryptedTarget(server, key, USER)).sync()
    expect(await b.values.count()).toBe(5)
  })

  it('runs by itself on the first sync, and the old phone loses nothing', async () => {
    const a = await before()
    await write(a, value('Made since'))
    const engine = new SyncEngine(a, new EncryptedTarget(server, key, USER), 'sync-encrypted')
    await queueEverything(a)
    await engine.sync()
    expect(server.rows.size).toBe(6)
    for (const r of server.rows.values()) expect(isEnvelope(r.data)).toBe(true)
    expect(await a.values.count()).toBe(6)
    expect(await engine.pending()).toBe(0)
  })

  it('never overwrites a newer edit with the old readable copy', async () => {
    await before()
    const row = [...server.rows.values()][0]
    // A newer edit lands encrypted before the migration reaches this row.
    const newer = { ...(row.data as Base), name: 'Edited', updatedAt: new Date(Date.now() + 60_000).toISOString() } as Value
    await new EncryptedTarget(server, key, USER).push([{ ...row, data: newer, updatedAt: newer.updatedAt }])
    await new EncryptedTarget(server, key, USER).migrate()
    const b = await phone()
    await new SyncEngine(b, new EncryptedTarget(server, key, USER)).sync()
    expect((await b.values.get(row.id))!.name).toBe('Edited')
  })

  it('leaves the data where it was when offline, and finishes later', async () => {
    await before()
    server.online = false
    const t = new EncryptedTarget(server, key, USER)
    await expect(t.migrate()).rejects.toThrow('offline')
    server.online = true
    expect(await t.migrate()).toBe(5)
  })
})
