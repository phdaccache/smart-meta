import type { PullResult, RemoteRecord } from './target'
import type { PlainSource } from './encrypted'

/** For tests: an in-memory server with a switchable network. */
export class FakeTarget implements PlainSource {
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

  async clear() {
    if (!this.online) throw new Error('offline')
    this.rows.clear()
  }

  async pull(cursor: string | null): Promise<PullResult> {
    if (!this.online) throw new Error('offline')
    const after = cursor ? Number(cursor) : 0
    const all = [...this.rows.values()].filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq)
    const page = all.slice(0, this.pageSize)
    return { records: page, cursor: page.length ? String(page.at(-1)!.seq) : cursor, more: all.length > page.length }
  }

  /** Like the server's filter: rows whose data has no `e`. */
  async plain(limit: number) {
    if (!this.online) throw new Error('offline')
    return [...this.rows.values()].filter((r) => !(r.data && 'e' in r.data)).slice(0, limit)
  }
}
