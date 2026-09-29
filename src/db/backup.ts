import { DATA_VERSION, migrateRecord } from '../lib/migrations'
import type { Base } from '../lib/types'
import { COLLECTIONS, db, type AppDB, type Collection } from './db'

export interface Backup {
  app: 'smart-meta'
  dataVersion: number
  exportedAt: string
  data: Partial<Record<Collection, Base[]>>
}

export async function exportData(database: AppDB = db): Promise<Backup> {
  const data: Backup['data'] = {}
  for (const c of COLLECTIONS) data[c] = await database.coll(c).toArray()
  return { app: 'smart-meta', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), data }
}

export function parseBackup(text: string): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  const b = parsed as Partial<Backup>
  if (b?.app !== 'smart-meta' || typeof b.dataVersion !== 'number' || typeof b.data !== 'object' || !b.data) {
    throw new Error('That file isn’t a Smart Meta export.')
  }
  return b as Backup
}

/**
 * Merges a backup into local data. Newer records win (last-write-wins), so
 * importing an old export never undoes later work. Imported records are queued
 * for sync like any other write.
 */
export async function importData(b: Backup, database: AppDB = db): Promise<number> {
  let changed = 0
  const tables = COLLECTIONS.map((c) => database.coll(c))
  await database.transaction('rw', [...tables, database.outbox], async () => {
    for (const c of COLLECTIONS) {
      for (const raw of b.data[c] ?? []) {
        if (!raw || typeof raw.id !== 'string' || typeof raw.updatedAt !== 'string') continue
        const rec = migrateRecord<Base>(c, raw as unknown as Record<string, unknown>, b.dataVersion)
        const cur = await database.coll(c).get(rec.id)
        if (cur && cur.updatedAt >= rec.updatedAt) continue
        await database.coll(c).put(rec as never)
        await database.outbox.add({ collection: c, id: rec.id, queuedAt: new Date().toISOString() })
        changed++
      }
    }
  })
  return changed
}

/** Empties every table on this device, including settings and the sync queue. */
export async function wipeLocal(database: AppDB = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()))
  })
}

export function backupFilename(date = new Date()): string {
  const d = date.toISOString().slice(0, 10)
  return `smart-meta-${d}.json`
}

/** Share sheet on iOS (Save to Files → iCloud Drive), download elsewhere. */
export async function shareOrDownload(b: Backup): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(b, null, 2)
  const name = backupFilename()
  const file = new File([json], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      // Files only: a title or text here is saved by iOS as an extra .txt file next to the JSON.
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
