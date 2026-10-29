import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PlainSource } from './encrypted'
import type { PullResult, RemoteRecord } from './target'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null when the app is built without Supabase: it then runs fully local. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null

/** Where to restore the project if Supabase has paused it. */
export const dashboardUrl: string | null = url
  ? `https://supabase.com/dashboard/project/${new URL(url).hostname.split('.')[0]}`
  : null

const PAGE = 500

interface Row {
  collection: string
  id: string
  data: RemoteRecord['data']
  updated_at: string
  deleted: boolean
  data_version: number
  seq: number
}

/** All user data lives in one `records` table; see supabase/migrations. */
export class SupabaseTarget implements PlainSource {
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}

  async push(records: RemoteRecord[]): Promise<void> {
    const { error } = await this.client.from('records').upsert(
      records.map((r) => ({
        user_id: this.userId, collection: r.collection, id: r.id, data: r.data,
        updated_at: r.updatedAt, deleted: r.deleted, data_version: r.dataVersion,
      })),
      { onConflict: 'user_id,collection,id' },
    )
    if (error) throw new Error(error.message)
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from('records').delete().eq('user_id', this.userId)
    if (error) throw new Error(error.message)
  }

  /** Records synced before encryption, still readable (their `data` has no `e`): the app seals them. */
  async plain(limit: number): Promise<RemoteRecord[]> {
    const { data, error } = await this.client
      .from('records')
      .select('collection,id,data,updated_at,deleted,data_version,seq')
      .is('data->e', null)
      .limit(limit)
    if (error) throw new Error(error.message)
    return ((data ?? []) as Row[]).map(toRecord)
  }

  async pull(cursor: string | null): Promise<PullResult> {
    const { data, error } = await this.client
      .from('records')
      .select('collection,id,data,updated_at,deleted,data_version,seq')
      .gt('seq', cursor ? Number(cursor) : 0)
      .order('seq', { ascending: true })
      .limit(PAGE)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Row[]
    return {
      records: rows.map(toRecord),
      cursor: rows.length ? String(rows.at(-1)!.seq) : cursor,
      more: rows.length === PAGE,
    }
  }
}

const toRecord = (r: Row): RemoteRecord => ({
  collection: r.collection as RemoteRecord['collection'], id: r.id, data: r.data,
  updatedAt: r.updated_at, deleted: r.deleted, dataVersion: r.data_version,
})
