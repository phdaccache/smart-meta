import type { Base } from '../lib/types'
import { isEnvelope, openRecord, sealRecord } from './crypto'
import type { PullResult, RemoteRecord, SyncTarget } from './target'

/** A target that can also list records still stored readable, from before encryption. */
export interface PlainSource extends SyncTarget {
  plain(limit: number): Promise<RemoteRecord[]>
}

const MIGRATE_PAGE = 200

/**
 * Encryption sits only here, around the server target (plan §7.2): records are sealed on the way out and
 * opened on the way in. The phone's own tables stay plain, and nothing else in the app knows.
 *
 * The server sees each record's collection, id, times and deleted flag (accepted metadata, spec PR-7),
 * never its content.
 */
export class EncryptedTarget implements SyncTarget {
  private migrated = false
  /** Records that didn't open or didn't look right, skipped: the phone's copy is kept. */
  unreadable = 0

  constructor(
    private inner: PlainSource,
    private key: CryptoKey,
    private userId: string,
  ) {}

  async push(records: RemoteRecord[]): Promise<void> {
    await this.inner.push(await Promise.all(records.map(async (r) => ({
      ...r, data: (await sealRecord(this.key, this.userId, r.collection, r.id, r.data)) as unknown as Base,
    }))))
  }

  async pull(cursor: string | null): Promise<PullResult> {
    if (!this.migrated) await this.migrate()
    const page = await this.inner.pull(cursor)
    const records: RemoteRecord[] = []
    for (const r of page.records) {
      const data = await this.open(r)
      if (data) records.push({ ...r, data })
    }
    return { ...page, records }
  }

  clear(): Promise<void> {
    return this.inner.clear()
  }

  /**
   * Seals whatever is still readable on the server (spec PR-6): records synced before encryption. Each goes
   * back with its own time, so it never wins over a newer edit. Runs once per start; cheap when done.
   */
  async migrate(): Promise<number> {
    let sealed = 0
    for (;;) {
      const rows = (await this.inner.plain(MIGRATE_PAGE)).filter((r) => !isEnvelope(r.data))
      if (!rows.length) break
      await this.push(rows)
      sealed += rows.length
      if (rows.length < MIGRATE_PAGE) break
    }
    this.migrated = true
    return sealed
  }

  /**
   * Opens one record and checks it's what it says it is. Anything that doesn't open with this key, or is still
   * readable after the migration, is skipped rather than trusted: the server could have put it there.
   */
  private async open(r: RemoteRecord): Promise<Base | null> {
    if (!isEnvelope(r.data)) return this.skip(r, 'not encrypted')
    let data: unknown
    try {
      data = await openRecord(this.key, this.userId, r.collection, r.id, r.data)
    } catch {
      return this.skip(r, "doesn't open")
    }
    const d = data as Partial<Base> | null
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.id !== r.id || typeof d.updatedAt !== 'string') {
      return this.skip(r, 'wrong shape')
    }
    return d as Base
  }

  private skip(r: RemoteRecord, why: string): null {
    this.unreadable++
    console.warn(`sync: skipped ${r.collection}/${r.id}: ${why}`)
    return null
  }
}
