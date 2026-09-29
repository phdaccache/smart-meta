/**
 * Version of the stored record shapes. Every record that leaves the device
 * (sync, export) carries it; anything older is upgraded on the way back in.
 *
 * To change a record shape: bump DATA_VERSION, add a step here, and add a
 * matching Dexie version in db/db.ts that runs the same step over local rows.
 */
export const DATA_VERSION = 1

type Step = (collection: string, data: Record<string, unknown>) => Record<string, unknown>

/** MIGRATIONS[n] upgrades a record from version n − 1 to n. */
const MIGRATIONS: Record<number, Step> = {
  // 2: (collection, data) => (collection === 'goals' ? { ...data, newField: null } : data),
}

export function migrateRecord<T>(collection: string, data: Record<string, unknown>, fromVersion: number): T {
  if (fromVersion > DATA_VERSION) {
    throw new Error(`Data is from a newer version of the app (v${fromVersion}). Update the app first.`)
  }
  let out = data
  for (let v = fromVersion + 1; v <= DATA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (step) out = step(collection, out)
  }
  return out as T
}
