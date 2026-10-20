import { t } from '../i18n'

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

/**
 * A yes/no threshold is the same as a rhythm once per period (one tick in the
 * period is a hit), so it's stored as one. Older versions still write them;
 * they're converted wherever records come in. Scores don't change.
 */
export function asRhythm<T extends Record<string, unknown>>(collection: string, data: T): T {
  if (collection !== 'commitments' || data.shape !== 'threshold' || data.checkinType !== 'binary') return data
  const cadence = data.cadence as { period: string; times: number } | undefined
  return { ...data, shape: 'rhythm', cadence: { period: cadence?.period ?? 'day', times: 1 }, targetValue: null, comparator: null }
}

export function migrateRecord<T>(collection: string, data: Record<string, unknown>, fromVersion: number): T {
  if (fromVersion > DATA_VERSION) {
    throw new Error(t('err.newerVersion', { n: fromVersion }))
  }
  let out = data
  for (let v = fromVersion + 1; v <= DATA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (step) out = step(collection, out)
  }
  return asRhythm(collection, out) as T
}
