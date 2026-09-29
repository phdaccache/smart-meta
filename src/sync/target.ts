import type { Collection } from '../db/db'
import type { Base } from '../lib/types'

/** One record as it exists off-device. */
export interface RemoteRecord {
  collection: Collection
  id: string
  data: Base
  updatedAt: string
  deleted: boolean
  dataVersion: number
}

export interface PullResult {
  records: RemoteRecord[]
  /** Opaque; pass back to fetch only what changed since. */
  cursor: string | null
  /** More pages are waiting. */
  more: boolean
}

/**
 * The only thing sync knows about the server. Supabase implements it today;
 * moving to Neon, Railway or a self-hosted Postgres means one new implementation
 * of these two methods.
 */
export interface SyncTarget {
  push(records: RemoteRecord[]): Promise<void>
  pull(cursor: string | null): Promise<PullResult>
}
