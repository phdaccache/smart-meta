import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB } from '../db/db'
import { exportData, importData } from '../db/backup'
import type { Base, Value } from '../lib/types'
import { SyncEngine } from './engine'
import type { PullResult, RemoteRecord, SyncTarget } from './target'

/** An in-memory server with a switchable network. */
class FakeTarget implements SyncTarget {
  rows = new Map<string, RemoteRecord & { seq: number }>()
  online = true
  seq = 0
  pageSize = 2

  async push(records: RemoteRecord[]) {
    if (!this.online) throw new Error('offline')
    for (const r of records) {
      const key = `${r.collection}/${r.id}`
      const cur = this.rows.get(key)
      if (cur && cur.updatedAt > r.updatedAt) continue // server-side LWW guard
      this.rows.set(key, { ...r, seq: ++this.seq })
    }
  }

  async pull(cursor: string | null): Promise<PullResult> {
    if (!this.online) throw new Error('offline')
    const after = cursor ? Number(cursor) : 0
    const all = [...this.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq)
    const page = all.slice(0, this.pageSize)
    return { records: page, cursor: page.length ? String(page.at(-1)!.seq) : cursor, more: all.length > page.length }
  }
}

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

let db: AppDB
let target: FakeTarget
let engine: SyncEngine

beforeEach(async () => {
  db = new AppDB(`test-${Math.random()}`)
  await db.open()
  target = new FakeTarget()
  engine = new SyncEngine(db, target)
})

describe('sync queue', () => {
  it('keeps every write queued while offline and loses nothing', async () => {
    target.online = false
    await write(db, value('Health'))
    await write(db, value('Family'))
    await expect(engine.sync()).rejects.toThrow('offline')
    expect(await engine.pending()).toBe(2)
    expect(await db.values.count()).toBe(2) // local data untouched
  })

  it('drains the queue when the network comes back', async () => {
    target.online = false
    await write(db, value('Health'))
    await engine.sync().catch(() => {})
    target.online = true
    await engine.sync()
    expect(await engine.pending()).toBe(0)
    expect(target.rows.size).toBe(1)
    expect(await engine.lastSyncedAt()).not.toBeNull()
  })

  it('pushes a record edited several times once, at its latest state', async () => {
    const v = value('Helth')
    await write(db, v)
    await write(db, { ...v, name: 'Health', updatedAt: new Date(Date.now() + 1000).toISOString() })
    await engine.push()
    expect(target.rows.size).toBe(1)
    expect((target.rows.get(`values/${v.id}`)!.data as Value).name).toBe('Health')
  })

  it('restores everything onto a fresh device, across pages', async () => {
    for (const name of ['A', 'B', 'C', 'D', 'E']) await write(db, value(name))
    await engine.sync()

    const phone2 = new AppDB(`test-${Math.random()}`)
    await phone2.open()
    await new SyncEngine(phone2, target).sync()
    expect((await phone2.values.toArray()).map((v) => v.name).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(await phone2.outbox.count()).toBe(0) // pulled records are not re-queued
  })

  it('lets the newer side win', async () => {
    const old = value('old', '2026-01-01T00:00:00.000Z')
    await write(db, old)
    await engine.sync()
    // Server has a newer version from elsewhere; local has an older one queued.
    target.rows.set(`values/${old.id}`, {
      collection: 'values', id: old.id, deleted: false, dataVersion: 1, seq: ++target.seq,
      updatedAt: '2026-06-01T00:00:00.000Z', data: { ...old, name: 'new', updatedAt: '2026-06-01T00:00:00.000Z' } as Base,
    })
    await engine.pull()
    expect((await db.values.get(old.id))!.name).toBe('new')
  })

  it('resumes from the cursor rather than re-reading everything', async () => {
    await write(db, value('A'))
    await engine.sync()
    await write(db, value('B'))
    await engine.push()
    let pulled = 0
    const pull = target.pull.bind(target)
    target.pull = async (c) => {
      const r = await pull(c)
      pulled += r.records.length
      return r
    }
    await engine.pull()
    expect(pulled).toBe(1)
  })
})

describe('export / import', () => {
  it('round-trips and merges newest-wins', async () => {
    const v = value('Health', '2026-01-01T00:00:00.000Z')
    await write(db, v)
    const backup = await exportData(db)

    const other = new AppDB(`test-${Math.random()}`)
    await other.open()
    expect(await importData(backup, other)).toBe(1)
    expect((await other.values.get(v.id))!.name).toBe('Health')

    // A newer local edit survives importing the old export.
    await other.values.put({ ...v, name: 'Health & energy', updatedAt: '2026-02-01T00:00:00.000Z' })
    expect(await importData(backup, other)).toBe(0)
    expect((await other.values.get(v.id))!.name).toBe('Health & energy')
  })
})
