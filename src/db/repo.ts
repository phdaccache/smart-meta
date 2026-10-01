import { addDays, formatTime, parseTime } from '../lib/dates'
import { commitmentRevision } from '../lib/revisions'
import type { CommitmentDraft, GoalDraft, PrepDraft } from '../lib/draft'
import { meetsTarget, type MissPrompt } from '../lib/scoring'
import type {
  Base, Commitment, DateStr, Entry, Goal, GoalReview, GoalState, ID, MissReason, Occurrence, Prep, Project,
  Task, Value, WeekReview,
} from '../lib/types'
import { db, type Collection, type CollectionTypes } from './db'
import { getMeta, getSettings, setMeta } from './settings'

export const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

/** Notified after every local write, so sync can drain the outbox. */
export const writeListeners = new Set<() => void>()
const notify = () => writeListeners.forEach((fn) => fn())

type Fields<T> = Omit<T, keyof Base>

/**
 * Every write goes through here: stamp it, store it, and queue it for sync in
 * the same transaction, so a record can never be saved without being queued.
 */
async function putAll(records: { c: Collection; r: Base }[]): Promise<void> {
  const tables = [...new Set(records.map((x) => x.c))].map((c) => db.coll(c))
  const stamp = now()
  await db.transaction('rw', [...tables, db.outbox], async () => {
    for (const { c, r } of records) {
      r.updatedAt = stamp
      await db.coll(c).put(r as never)
      await db.outbox.add({ collection: c, id: r.id, queuedAt: stamp })
    }
  })
  notify()
}

function make<C extends Collection>(fields: Fields<CollectionTypes[C]>): CollectionTypes[C] {
  const t = now()
  return { ...fields, id: newId(), createdAt: t, updatedAt: t } as CollectionTypes[C]
}

async function put<C extends Collection>(c: C, r: CollectionTypes[C]): Promise<CollectionTypes[C]> {
  await putAll([{ c, r }])
  return r
}

async function patch<C extends Collection>(c: C, id: ID, changes: Partial<CollectionTypes[C]>) {
  const cur = await db.coll(c).get(id)
  if (!cur) throw new Error(`${c}/${id} not found`)
  return put(c, { ...cur, ...changes })
}

async function tombstone(c: Collection, ids: ID[]) {
  const t = now()
  const rows = (await db.coll(c).bulkGet(ids)).filter((r): r is NonNullable<typeof r> => !!r)
  await putAll(rows.map((r) => ({ c, r: { ...r, deletedAt: t } })))
}

// ——— values ———

export async function saveValues(list: { id?: ID; name: string; description: string }[]) {
  const existing = await db.values.toArray()
  const writes: { c: Collection; r: Base }[] = []
  const base = Date.now()
  for (const [i, v] of list.entries()) {
    const cur = v.id ? existing.find((x) => x.id === v.id) : undefined
    if (cur) {
      if (cur.name !== v.name || cur.description !== v.description) {
        writes.push({ c: 'values', r: { ...cur, name: v.name, description: v.description } as Value })
      }
    } else {
      // Staggered so the order they were written in is the order they're shown in.
      const created = new Date(base + i).toISOString()
      writes.push({ c: 'values', r: { ...make<'values'>({ name: v.name, description: v.description }), createdAt: created } })
    }
  }
  if (writes.length) await putAll(writes)
}

/** The id of the value with this name, adding it if there's none yet. */
export async function ensureValue(name: string): Promise<ID> {
  const n = name.trim()
  const found = (await db.values.toArray()).find((v) => !v.deletedAt && v.name.trim().toLowerCase() === n.toLowerCase())
  if (found) return found.id
  return (await put('values', make<'values'>({ name: n, description: '' }))).id
}

export async function deleteValue(v: Value) {
  await tombstone('values', [v.id])
}

// ——— goals ———

export function commitmentFields(d: CommitmentDraft): Omit<Fields<Commitment>, 'goalId' | 'startDate'> {
  const threshold = d.shape === 'threshold'
  let targetValue: number | null = null
  if (threshold && d.checkinType === 'quantity') targetValue = Number(d.targetValue.replace(',', '.'))
  if (threshold && d.checkinType === 'timestamp') targetValue = parseTime(d.targetTime)
  return {
    shape: d.shape,
    label: d.label.trim(),
    measurementDefinition: d.measurementDefinition.trim(),
    checkinType: d.checkinType,
    cadence: { period: d.shape === 'standard' ? 'day' : d.period, times: d.shape === 'rhythm' ? d.times : 1 },
    targetValue,
    comparator: threshold && d.checkinType !== 'binary' ? d.comparator : null,
    unit: threshold && d.checkinType === 'quantity' ? d.unit.trim() || null : null,
  }
}

export function draftFromCommitment(c: Commitment): CommitmentDraft {
  return {
    shape: c.shape, label: c.label, measurementDefinition: c.measurementDefinition, checkinType: c.checkinType,
    period: c.cadence.period, times: c.cadence.times,
    targetValue: c.checkinType === 'quantity' && c.targetValue != null ? String(c.targetValue) : '',
    targetTime: c.checkinType === 'timestamp' && c.targetValue != null ? formatTime(c.targetValue) : '',
    comparator: c.comparator ?? 'gte', unit: c.unit ?? '',
  }
}

const prepFields = (p: PrepDraft, commitmentId: ID): Fields<Prep> => ({
  commitmentId, title: p.title.trim(), fireWeekdays: [...p.fireWeekdays].sort(), fireTime: p.fireTime.trim(),
})

export async function activeGoalCount(): Promise<number> {
  return (await db.goals.where('state').equals('active').toArray()).filter((g) => !g.deletedAt).length
}

/**
 * New goals wait in the backlog until started, so starting one is a decision.
 * `start` (first run) makes it active straight away if there's room.
 */
export async function createGoal(d: GoalDraft, opts: { start?: boolean } = {}): Promise<Goal> {
  const { goalCap } = await getSettings()
  const goals = (await db.goals.toArray()).filter((g) => !g.deletedAt)
  const active = goals.filter((g) => g.state === 'active').length
  const outcome = d.goalKind === 'outcome'
  const goal = make<'goals'>({
    kind: d.goalKind, title: d.title.trim(), whyValueId: d.whyValueId, whyText: d.whyText.trim(),
    doneWhen: outcome ? d.doneWhen.trim() : null, graceDays: outcome ? d.graceDays : null,
    state: opts.start && active < goalCap ? 'active' : 'backlog', tolerancePct: d.tolerancePct,
    startDate: d.startDate, targetDate: d.targetDate || null,
    priority: Math.max(0, ...goals.map((g) => g.priority + 1)),
  })
  const writes: { c: Collection; r: Base }[] = [{ c: 'goals', r: goal }]
  // A finish line needs no commitment; supporting habits are added later, each with its own start.
  if (!outcome) {
    const c = make<'commitments'>({ ...commitmentFields(d), goalId: goal.id, startDate: d.startDate })
    writes.push({ c: 'commitments', r: c }, ...d.preps.map((p) => ({ c: 'preps' as const, r: make<'preps'>(prepFields(p, c.id)) })))
  }
  await putAll(writes)
  return goal
}

const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** Edits keep the goal and its history, and write a Revision per changed field. */
export async function updateGoal(goal: Goal, changes: Partial<Fields<Goal>>) {
  const t = now()
  const revisions = Object.entries(changes)
    .filter(([k, v]) => show((goal as unknown as Record<string, unknown>)[k]) !== show(v))
    .map(([field, v]) =>
      make<'revisions'>({
        goalId: goal.id, field, timestamp: t,
        oldValue: show((goal as unknown as Record<string, unknown>)[field]), newValue: show(v),
      }),
    )
  if (!revisions.length) return
  await putAll([{ c: 'goals', r: { ...goal, ...changes } }, ...revisions.map((r) => ({ c: 'revisions' as const, r }))])
}

export async function addCommitment(goal: Goal, d: CommitmentDraft, startDate: DateStr) {
  const c = make<'commitments'>({ ...commitmentFields(d), goalId: goal.id, startDate })
  const rev = make<'revisions'>({
    goalId: goal.id, field: 'commitment', timestamp: now(), oldValue: '—', newValue: c.measurementDefinition,
  })
  await putAll([{ c: 'commitments', r: c }, { c: 'revisions', r: rev }])
  return c
}

export async function updateCommitment(c: Commitment, d: CommitmentDraft) {
  const next = { ...c, ...commitmentFields(d) }
  const t = now()
  const fields = ['label', 'measurementDefinition', 'checkinType', 'cadence', 'targetValue', 'comparator', 'unit'] as const
  // Compared as stored, so the language the app is in never makes a change.
  // Keys sorted: a cadence that went through sync may come back in another key order.
  const same = (v: unknown) => JSON.stringify(v ?? null, v && typeof v === 'object' ? Object.keys(v).sort() : undefined)
  const changed = (f: (typeof fields)[number]) => same(c[f]) !== same(next[f])
  const revisions = fields
    .filter(changed)
    .map((f) => make<'revisions'>({ goalId: c.goalId, timestamp: t, ...commitmentRevision(c, next, f) }))
  if (!revisions.length) return
  await putAll([{ c: 'commitments', r: next }, ...revisions.map((r) => ({ c: 'revisions' as const, r }))])
}

export async function removeCommitment(c: Commitment) {
  const preps = await db.preps.where('commitmentId').equals(c.id).primaryKeys()
  const rev = make<'revisions'>({
    goalId: c.goalId, field: 'commitment', timestamp: now(), oldValue: c.measurementDefinition, newValue: 'removed',
  })
  await putAll([{ c: 'revisions', r: rev }])
  await tombstone('preps', preps)
  await tombstone('commitments', [c.id])
}

export async function setGoalState(goal: Goal, state: GoalState, reason?: string) {
  const changes: Partial<Goal> = { state }
  if (state === 'abandoned') changes.abandonReason = reason?.trim() || null
  if (state === 'maintenance') changes.targetDate = null
  await updateGoal(goal, changes)
}

/** Genuinely removes a goal and everything it generated. For mistakes only. */
export async function deleteGoal(goal: Goal) {
  const commitments = await db.commitments.where('goalId').equals(goal.id).toArray()
  const cIds = commitments.map((c) => c.id)
  const prepIds = (await db.preps.toArray()).filter((p) => cIds.includes(p.commitmentId)).map((p) => p.id)
  const subjects = new Set([...cIds, ...prepIds])
  const entryIds = (await db.entries.toArray()).filter((e) => subjects.has(e.subjectId)).map((e) => e.id)
  await tombstone('entries', entryIds)
  await tombstone('preps', prepIds)
  await tombstone('commitments', cIds)
  await tombstone('goals', [goal.id])
}

export async function reorderGoals(ordered: Goal[]) {
  await putAll(ordered.map((g, i) => ({ c: 'goals' as const, r: { ...g, priority: i } })))
}

export async function saveGoalReview(
  goal: Goal,
  answers: { hit: boolean; whatHappened: string; journalNote: string },
  outcome: GoalReview['outcome'],
  renewTargetDate?: DateStr | null,
) {
  const review = make<'goalReviews'>({ goalId: goal.id, timestamp: now(), outcome, ...answers })
  await putAll([{ c: 'goalReviews', r: review }])
  if (outcome === 'renewed') await updateGoal(goal, { targetDate: renewTargetDate ?? null })
  if (outcome === 'maintenance') await setGoalState(goal, 'maintenance')
  if (outcome === 'completed') await setGoalState(goal, 'completed')
}

// ——— preps ———

export async function addPrep(commitmentId: ID, p: PrepDraft) {
  return put('preps', make<'preps'>(prepFields(p, commitmentId)))
}

export async function updatePrep(prep: Prep, p: PrepDraft) {
  return put('preps', { ...prep, ...prepFields(p, prep.commitmentId) })
}

export async function removePrep(prep: Prep) {
  await tombstone('preps', [prep.id])
}

// ——— entries ———

type Subject = { subjectType: Entry['subjectType']; subjectId: ID }

function entry(s: Subject, date: DateStr, fields: Partial<Fields<Entry>> = {}): Entry {
  return make<'entries'>({ ...s, date, recordedAt: now(), outcome: 'hit', ...fields })
}

export async function check(s: Subject, date: DateStr) {
  return put('entries', entry(s, date))
}

/** Undo never deletes: it appends a void that supersedes the entry. */
export async function uncheck(entryId: ID) {
  const e = await db.entries.get(entryId)
  if (!e) return
  await put('entries', entry(e, e.date, { outcome: 'void', supersedes: e.id }))
}

/**
 * Logs a quantity or time. `replacing` lists the day's earlier values: the new
 * one corrects them (the old entries stay in history, superseded). Without it,
 * the value adds to the period, as for weekly or monthly sums.
 */
export async function logValue(c: Commitment, date: DateStr, value: number, replacing: ID[] = []) {
  const { rolloverHour } = await getSettings()
  const outcome = meetsTarget(c, value, rolloverHour) ? 'hit' : 'miss'
  const subject = { subjectType: 'commitment' as const, subjectId: c.id }
  const [last, ...rest] = [...replacing].reverse()
  await putAll([
    ...rest.map((id) => ({ c: 'entries' as const, r: entry(subject, date, { outcome: 'void', supersedes: id }) })),
    { c: 'entries', r: entry(subject, date, { value, outcome, supersedes: last ?? null }) },
  ])
}

/** A binary threshold day that was not kept. */
export async function markMissed(c: Commitment, date: DateStr) {
  return put('entries', entry({ subjectType: 'commitment', subjectId: c.id }, date, { outcome: 'miss' }))
}

export interface MissAnswer {
  reason: MissReason
  displacementId?: ID | null
  note?: string
}

/** One miss entry per missed slot, all carrying the reason. */
export async function explainMiss(prompt: MissPrompt, a: MissAnswer) {
  const records = prompt.slots.flatMap((slot) =>
    Array.from({ length: slot.count }, () => ({
      c: 'entries' as const,
      r: entry({ subjectType: 'commitment', subjectId: prompt.commitmentId }, slot.date, {
        outcome: 'miss', missReason: a.reason, displacementId: a.displacementId ?? null, note: a.note?.trim() || null,
      }),
    })),
  )
  await putAll(records)
}

export async function snoozePrompt(commitmentId: ID, today: DateStr) {
  const s = await getMeta<Record<ID, DateStr>>('snoozes', {})
  // Keep only today's snoozes; older ones have expired.
  const next = Object.fromEntries(Object.entries(s).filter(([, d]) => d === today))
  next[commitmentId] = today
  await setMeta('snoozes', next)
}

export async function addDisplacement(label: string) {
  const clean = label.trim()
  const existing = (await db.displacements.toArray()).find(
    (d) => !d.deletedAt && d.label.toLowerCase() === clean.toLowerCase(),
  )
  return existing ?? put('displacements', make<'displacements'>({ label: clean }))
}

// ——— standard commitments: occurrences ———

export interface OccurrenceLog {
  date: DateStr
  /** Agreed time, 'HH:MM'. */
  scheduledTime: string
  /** Timestamp check-in: actual arrival, 'HH:MM'. Binary: undefined. */
  actualTime?: string
  /** Binary check-in. */
  kept?: boolean
  miss?: MissAnswer
}

export async function logOccurrence(c: Commitment, log: OccurrenceLog) {
  const occ = make<'occurrences'>({
    commitmentId: c.id, scheduledAt: `${log.date}T${log.scheduledTime}`, date: log.date, source: 'manual',
  })
  let value: number | null = null
  let hit: boolean
  if (c.checkinType === 'timestamp') {
    value = parseTime(log.actualTime ?? '')
    hit = value != null && value <= (parseTime(log.scheduledTime) ?? 0)
  } else {
    hit = !!log.kept
  }
  const e = entry({ subjectType: 'commitment', subjectId: c.id }, log.date, {
    value, outcome: hit ? 'hit' : 'miss', occurrenceId: occ.id,
    missReason: hit ? null : log.miss?.reason ?? null,
    displacementId: hit ? null : log.miss?.displacementId ?? null,
    note: log.miss?.note?.trim() || null,
  })
  occ.entryId = e.id
  await putAll([{ c: 'occurrences', r: occ }, { c: 'entries', r: e }])
  return { occurrence: occ, entry: e, hit }
}

export async function deleteOccurrence(o: Occurrence) {
  const entries = (await db.entries.toArray()).filter((e) => e.occurrenceId === o.id).map((e) => e.id)
  await tombstone('entries', entries)
  await tombstone('occurrences', [o.id])
}

// ——— projects and tasks ———

export async function createTask(fields: { title: string; date?: DateStr | null; goalId?: ID | null; projectId?: ID | null }) {
  let order: number | null = null
  if (fields.projectId) {
    const steps = await db.tasks.where('projectId').equals(fields.projectId).toArray()
    order = Math.max(-1, ...steps.map((s) => s.order ?? 0)) + 1
  }
  return put('tasks', make<'tasks'>({
    title: fields.title.trim(), date: fields.date ?? null, goalId: fields.goalId ?? null,
    projectId: fields.projectId ?? null, order,
  }))
}

export async function updateTask(t: Task, changes: Partial<Fields<Task>>) {
  return patch('tasks', t.id, changes)
}

export async function deleteTask(t: Task) {
  await tombstone('tasks', [t.id])
}

export async function createProject(fields: { title: string; targetDate: DateStr; goalId?: ID | null; steps: string[] }) {
  const project = make<'projects'>({
    title: fields.title.trim(), targetDate: fields.targetDate, goalId: fields.goalId ?? null, state: 'active',
  })
  const steps = fields.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((title, order) => make<'tasks'>({ title, projectId: project.id, order, date: null, goalId: null }))
  await putAll([{ c: 'projects', r: project }, ...steps.map((r) => ({ c: 'tasks' as const, r }))])
  return project
}

export async function updateProject(p: Project, changes: Partial<Fields<Project>>) {
  return patch('projects', p.id, changes)
}

export async function deleteProject(p: Project) {
  const steps = await db.tasks.where('projectId').equals(p.id).primaryKeys()
  await tombstone('tasks', steps)
  await tombstone('projects', [p.id])
}

export async function reorderSteps(steps: Task[]) {
  await putAll(steps.map((t, i) => ({ c: 'tasks' as const, r: { ...t, order: i } })))
}

/** A task that turned out to need steps becomes a project, keeping its link and date. */
export async function promoteTask(t: Task, fallbackTargetDate: DateStr) {
  const project = make<'projects'>({
    title: t.title, targetDate: t.date && t.date > fallbackTargetDate ? t.date : addDays(fallbackTargetDate, 14),
    goalId: t.goalId ?? null, state: 'active',
  })
  await putAll([{ c: 'projects', r: project }, { c: 'tasks', r: { ...t, deletedAt: now() } }])
  return project
}

// ——— weekly review ———

async function weekReviewFor(week: DateStr): Promise<WeekReview> {
  const existing = (await db.weekReviews.where('week').equals(week).toArray()).find((w) => !w.deletedAt)
  return existing ?? make<'weekReviews'>({ week, doneAt: null, dismissed: [] })
}

/**
 * Records what a review set aside: a suggestion or stalled project (hidden for
 * a few weeks, see DISMISS_WEEKS) or a missed slot (never asked about again).
 */
export async function dismissInReview(week: DateStr, keys: string | string[]) {
  const w = await weekReviewFor(week)
  await put('weekReviews', { ...w, dismissed: [...new Set([...w.dismissed, ...[keys].flat()])] })
}

/** Marks the week reviewed; whatever is still open (suggestions, loose ends, stalled projects) is dismissed with it. */
export async function markWeekReviewed(week: DateStr, dismiss: string[] = []) {
  const w = await weekReviewFor(week)
  await put('weekReviews', { ...w, doneAt: now(), dismissed: [...new Set([...w.dismissed, ...dismiss])] })
}
