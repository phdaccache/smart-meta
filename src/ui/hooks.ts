import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { DEFAULT_SETTINGS, getMeta, getSettings, type Settings } from '../db/settings'
import { logicalDate } from '../lib/dates'
import type { Snapshot } from '../lib/today'
import type { DateStr, Displacement, GoalReview, ID, Revision } from '../lib/types'

const live = <T extends { deletedAt?: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

export async function loadSnapshot(): Promise<Snapshot> {
  const [values, goals, commitments, preps, projects, tasks, entries, occurrences] = await Promise.all([
    db.values.toArray(), db.goals.toArray(), db.commitments.toArray(), db.preps.toArray(),
    db.projects.toArray(), db.tasks.toArray(), db.entries.toArray(), db.occurrences.toArray(),
  ])
  return {
    values: live(values).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), goals: live(goals), commitments: live(commitments), preps: live(preps),
    projects: live(projects), tasks: live(tasks), entries, occurrences: live(occurrences),
  }
}

export function useSnapshot(): Snapshot | undefined {
  return useLiveQuery(loadSnapshot, [])
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS
}

export function useSettingsLoaded(): Settings | undefined {
  return useLiveQuery(getSettings, [])
}

export function useSnoozes(): Record<ID, DateStr> {
  return useLiveQuery(() => getMeta<Record<ID, DateStr>>('snoozes', {}), []) ?? {}
}

export function useDisplacements(): Displacement[] {
  return useLiveQuery(async () => live(await db.displacements.toArray()).sort((a, b) => a.label.localeCompare(b.label)), []) ?? []
}

export function useRevisions(goalId: ID): Revision[] {
  return useLiveQuery(async () => live(await db.revisions.where('goalId').equals(goalId).toArray()), [goalId]) ?? []
}

export function useGoalReviews(goalId: ID): GoalReview[] {
  return useLiveQuery(async () => live(await db.goalReviews.where('goalId').equals(goalId).toArray()), [goalId]) ?? []
}

/** The logical day, refreshed every minute and whenever the app comes back to the foreground. */
export function useToday(rolloverHour: number): DateStr {
  const [today, setToday] = useState(() => logicalDate(new Date(), rolloverHour))
  useEffect(() => {
    const tick = () => setToday(logicalDate(new Date(), rolloverHour))
    tick()
    const id = setInterval(tick, 60_000)
    const onVisible = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [rolloverHour])
  return today
}
