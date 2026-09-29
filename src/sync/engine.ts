import { COLLECTIONS, type AppDB, type Collection } from '../db/db'
import { DATA_VERSION, migrateRecord } from '../lib/migrations'
import type { Base } from '../lib/types'
import type { RemoteRecord, SyncTarget } from './target'

const BATCH = 200

export interface SyncState {
  phase: 'idle' | 'syncing' | 'error'
  lastSyncedAt: string | null
  lastError: string | null
}

interface SyncMeta {
  cursor: string | null
  lastSyncedAt: string | null
}

/**
 * Local-first sync. IndexedDB is the source of truth; this only copies
 * changes out (outbox → target) and newer changes in (target → tables).
 * Single user, single device: last write wins by `updatedAt`.
 *
 * Nothing here ever blocks the UI or throws at a caller: failures leave the
 * outbox intact and are retried on the next run.
 */
export class SyncEngine {
  private running: Promise<void> | null = null

  constructor(
    private db: AppDB,
    private target: SyncTarget,
    private metaKey = 'sync',
  ) {}

  private async meta(): Promise<SyncMeta> {
    const row = await this.db.meta.get(this.metaKey)
    return { cursor: null, lastSyncedAt: null, ...((row?.value as Partial<SyncMeta>) ?? {}) }
  }

  private async setMeta(patch: Partial<SyncMeta>) {
    await this.db.meta.put({ key: this.metaKey, value: { ...(await this.meta()), ...patch } })
  }

  async lastSyncedAt(): Promise<string | null> {
    return (await this.meta()).lastSyncedAt
  }

  pending(): Promise<number> {
    return this.db.outbox.count()
  }

  /** Push, then pull. Concurrent calls share one run. */
  sync(): Promise<void> {
    this.running ??= (async () => {
      try {
        await this.push()
        await this.pull()
        await this.setMeta({ lastSyncedAt: new Date().toISOString() })
      } finally {
        this.running = null
      }
    })()
    return this.running
  }

  /** Drains the outbox. Rows queued while a batch is in flight stay queued. */
  async push(): Promise<number> {
    let pushed = 0
    for (;;) {
      const batch = await this.db.outbox.orderBy('seq').limit(BATCH).toArray()
      if (batch.length === 0) return pushed
      const unique = new Map<string, { collection: Collection; id: string }>()
      for (const item of batch) unique.set(`${item.collection}/${item.id}`, item)

      const records: RemoteRecord[] = []
      for (const { collection, id } of unique.values()) {
        const data = await this.db.coll(collection).get(id)
        if (!data) continue
        records.push({
          collection, id, data, updatedAt: data.updatedAt, deleted: !!data.deletedAt, dataVersion: DATA_VERSION,
        })
      }
      if (records.length) await this.target.push(records)
      await this.db.outbox.bulkDelete(batch.map((b) => b.seq!))
      pushed += records.length
    }
  }

  /** Applies remote records newer than the local copy, without re-queueing them. */
  async pull(): Promise<number> {
    let applied = 0
    let { cursor } = await this.meta()
    for (;;) {
      const page = await this.target.pull(cursor)
      if (page.records.length) {
        const tables = [...new Set(page.records.map((r) => r.collection))]
          .filter((c) => (COLLECTIONS as readonly string[]).includes(c))
          .map((c) => this.db.coll(c))
        await this.db.transaction('rw', tables, async () => {
          for (const r of page.records) {
            if (!(COLLECTIONS as readonly string[]).includes(r.collection)) continue
            const incoming = migrateRecord<Base>(r.collection, r.data as unknown as Record<string, unknown>, r.dataVersion)
            const local = await this.db.coll(r.collection).get(r.id)
            if (local && local.updatedAt >= incoming.updatedAt) continue
            await this.db.coll(r.collection).put(incoming as never)
            applied++
          }
        })
      }
      cursor = page.cursor ?? cursor
      await this.setMeta({ cursor })
      if (!page.more) return applied
    }
  }

  /** Erases the server copy. Used by "Erase all data". */
  async clearRemote() {
    await this.target.clear()
  }

  /** Forget the pull cursor, so the next sync re-reads everything (after sign-in). */
  async resetCursor() {
    await this.setMeta({ cursor: null })
  }
}
