// Test-only builders. Keep fixtures terse so the worked examples read like the spec.
import type { Snapshot } from './today'
import type { Commitment, DateStr, Entry, Goal, Occurrence, Prep, Project, Task, Value } from './types'

let seq = 0
const id = (p: string) => `${p}${++seq}`
const T = '2026-01-01T00:00:00.000Z'
const base = (p: string) => ({ id: id(p), createdAt: T, updatedAt: T })

export function value(name = 'Health'): Value {
  return { ...base('v'), name, description: '' }
}

export function goal(over: Partial<Goal> = {}): Goal {
  return {
    ...base('g'), title: 'Goal', whyValueId: 'v0', whyText: 'because', state: 'active',
    tolerancePct: 80, startDate: '2026-09-07', targetDate: null, priority: 0, ...over,
  }
}

export function commitment(g: Goal, over: Partial<Commitment> = {}): Commitment {
  return {
    ...base('c'), goalId: g.id, startDate: g.startDate, shape: 'rhythm', label: 'thing',
    measurementDefinition: 'Did at least 45 minutes of exercise', checkinType: 'binary',
    cadence: { period: 'week', times: 3 }, targetValue: null, comparator: null, unit: null, ...over,
  }
}

export function prep(c: Commitment, over: Partial<Prep> = {}): Prep {
  return { ...base('p'), commitmentId: c.id, title: 'Prep', fireWeekdays: [3, 5], fireTime: '21:00', ...over }
}

export function project(over: Partial<Project> = {}): Project {
  return { ...base('pr'), title: 'Project', targetDate: '2026-12-01', goalId: null, state: 'active', ...over }
}

export function task(over: Partial<Task> = {}): Task {
  return { ...base('t'), title: 'Task', date: null, goalId: null, projectId: null, order: null, ...over }
}

export function hit(subject: { id: string }, date: DateStr, over: Partial<Entry> = {}): Entry {
  return {
    ...base('e'), subjectType: 'commitment', subjectId: subject.id, date,
    recordedAt: `${date}T12:00:00.000Z`, outcome: 'hit', ...over,
  }
}

export function miss(subject: { id: string }, date: DateStr, over: Partial<Entry> = {}): Entry {
  return hit(subject, date, { outcome: 'miss', ...over })
}

export function occurrence(c: Commitment, date: DateStr, time = '09:00'): Occurrence {
  return { ...base('o'), commitmentId: c.id, scheduledAt: `${date}T${time}`, date, source: 'manual' }
}

/** Hits on the given days-of-week across consecutive weeks starting at `monday`. */
export function weeklyHits(c: Commitment, monday: DateStr, perWeek: number[], addDays: (s: DateStr, n: number) => DateStr): Entry[] {
  return perWeek.flatMap((n, w) =>
    Array.from({ length: n }, (_, i) => hit(c, addDays(monday, w * 7 + i))),
  )
}

export function snapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    values: [], goals: [], commitments: [], preps: [], projects: [], tasks: [], entries: [], occurrences: [], ...over,
  }
}
