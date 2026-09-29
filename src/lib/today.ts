import { inSpan, isoWeekday, periodOf, relativeDay } from './dates'
import { activeEntries, evaluateThreshold, meetsTarget, missPrompt, thresholdAggregate, type MissPrompt, type PeriodEval, type ScoreContext } from './scoring'
import type {
  Commitment, DateStr, Entry, Goal, ID, Occurrence, Prep, Project, SubjectType, Task, Value,
} from './types'

export interface Snapshot {
  values: Value[]
  goals: Goal[]
  commitments: Commitment[]
  preps: Prep[]
  projects: Project[]
  tasks: Task[]
  entries: Entry[]
  occurrences: Occurrence[]
}

export type ItemKind = 'commitment' | 'prep' | 'step' | 'task'

export type ItemTarget = { kind: 'goal'; id: ID } | { kind: 'project'; id: ID } | { kind: 'task'; id: ID }

export interface TodayItem {
  key: string
  kind: ItemKind
  title: string
  detail?: string
  done: boolean
  subjectType: SubjectType
  subjectId: ID
  /** The entry to void when unchecking. */
  entryId?: ID
  /** Valued thresholds: every entry making up the logged value on this date. */
  entryIds?: ID[]
  /** Set for quantity/timestamp thresholds, which take a value rather than a tap. */
  commitment?: Commitment
  /** Logged on this date (quantity or time). */
  value?: number | null
  valueState?: PeriodEval
  step?: { index: number; total: number }
  target: ItemTarget
}

export interface TodayGroup {
  key: string
  kind: 'goal' | 'project' | 'errands'
  eyebrow: string
  title: string
  why?: string
  goalId?: ID
  projectId?: ID
  items: TodayItem[]
  prompts: MissPrompt[]
  done: boolean
}

export interface DayView {
  date: DateStr
  isToday: boolean
  groups: TodayGroup[]
  total: number
  open: number
}

/** Shown goals: those still generating daily work. */
export const isLiveGoal = (g: Goal) => !g.deletedAt && (g.state === 'active' || g.state === 'maintenance')

export function buildDay(
  s: Snapshot,
  date: DateStr,
  ctx: ScoreContext,
  snoozes: Record<ID, DateStr> = {},
): DayView {
  const isToday = date === ctx.today
  const entries = activeEntries(s.entries)
  const bySubject = new Map<string, Entry[]>()
  for (const e of entries) {
    const k = `${e.subjectType}:${e.subjectId}`
    const list = bySubject.get(k)
    if (list) list.push(e)
    else bySubject.set(k, [e])
  }
  const entriesOf = (t: SubjectType, id: ID) => bySubject.get(`${t}:${id}`) ?? []
  const latest = (list: Entry[]) =>
    list.length ? [...list].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1) : undefined
  const doneEntryOn = (t: SubjectType, id: ID, d: DateStr) =>
    latest(entriesOf(t, id).filter((e) => e.outcome === 'hit' && e.date === d))

  const liveGoals = s.goals
    .filter((g) => isLiveGoal(g) && g.startDate <= date)
    .sort((a, b) => (a.state === b.state ? a.priority - b.priority : a.state === 'active' ? -1 : 1))
  const liveGoalIds = new Set(liveGoals.map((g) => g.id))

  // ——— tasks and project steps ———

  const taskItem = (t: Task, target: ItemTarget): TodayItem | null => {
    const done = latest(entriesOf('task', t.id).filter((e) => e.outcome === 'hit'))
    let visible: boolean
    if (done) visible = done.date === date
    else visible = isToday ? !t.date || t.date <= date : t.date === date
    if (!visible) return null
    let detail: string | undefined
    if (!done && t.date && t.date < date) detail = `from ${relativeDay(t.date, date)}`
    return {
      key: `task:${t.id}`, kind: 'task', title: t.title, detail, done: !!done,
      subjectType: 'task', subjectId: t.id, entryId: done?.id, target,
    }
  }

  const stepItems = (p: Project, showDue: boolean): TodayItem[] => {
    if (p.deletedAt || p.state !== 'active') return []
    const steps = s.tasks
      .filter((t) => t.projectId === p.id && !t.deletedAt)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const out: TodayItem[] = []
    let currentShown = false
    steps.forEach((t, i) => {
      const done = latest(entriesOf('task', t.id).filter((e) => e.outcome === 'hit'))
      const base = {
        kind: 'step' as const, title: t.title, subjectType: 'task' as const, subjectId: t.id,
        step: { index: i + 1, total: steps.length }, target: { kind: 'project' as const, id: p.id },
      }
      if (done && done.date === date) {
        out.push({ ...base, key: `task:${t.id}`, done: true, entryId: done.id })
      } else if (!done && !currentShown) {
        currentShown = true
        if (isToday) {
          out.push({
            ...base, key: `task:${t.id}`, done: false,
            detail: showDue ? `${p.title} · due ${relativeDay(p.targetDate, date)}` : undefined,
          })
        }
      }
    })
    return out
  }

  // ——— goal groups ———

  const groups: TodayGroup[] = []
  const projectsInGoals = new Set<ID>()

  for (const g of liveGoals) {
    const value = s.values.find((v) => v.id === g.whyValueId)
    const items: TodayItem[] = []
    const prompts: MissPrompt[] = []
    const target: ItemTarget = { kind: 'goal', id: g.id }
    const commitments = s.commitments.filter((c) => c.goalId === g.id && !c.deletedAt && c.startDate <= date)

    for (const c of commitments) {
      const mine = entriesOf('commitment', c.id)
      const period = periodOf(date, c.cadence.period)
      const inPeriod = mine.filter((e) => inSpan(e.date, period))
      const onDate = inPeriod.filter((e) => e.date === date)
      const periodWord = c.cadence.period === 'week' ? 'this week' : c.cadence.period === 'month' ? 'this month' : 'today'

      if (c.shape === 'rhythm') {
        const times = c.cadence.times
        const hits = inPeriod.filter((e) => e.outcome === 'hit')
        const hitsToday = onDate.filter((e) => e.outcome === 'hit')
        const multiPerDay = c.cadence.period === 'day' && times > 1
        const doneToday = multiPerDay ? hitsToday.length >= times : hitsToday.length > 0
        const satisfied = hits.length >= times
        let detail: string | undefined
        if (multiPerDay) detail = `${hitsToday.length} of ${times} today`
        else if (c.cadence.period !== 'day') {
          detail = satisfied && !doneToday ? `Done for ${periodWord}` : `${hits.length} of ${times} ${periodWord}`
        }
        items.push({
          key: `commitment:${c.id}`, kind: 'commitment', title: c.measurementDefinition, detail,
          done: doneToday || satisfied, subjectType: 'commitment', subjectId: c.id,
          entryId: doneToday ? latest(hitsToday)?.id : undefined, target,
        })
      } else if (c.shape === 'threshold') {
        const closed = period.end < ctx.today
        const ev = evaluateThreshold(c, inPeriod, closed, ctx.rolloverHour)
        if (c.checkinType === 'binary') {
          const hit = latest(onDate.filter((e) => e.outcome === 'hit'))
          items.push({
            key: `commitment:${c.id}`, kind: 'commitment', title: c.measurementDefinition,
            done: !!hit, subjectType: 'commitment', subjectId: c.id, entryId: hit?.id, target,
          })
        } else {
          const logged = onDate.filter((e) => e.value != null)
          const agg = logged.length ? thresholdAggregate(c, logged) : null
          // Scoring waits for the period to close; the row shows at once whether the value meets the line.
          const shown: PeriodEval = c.cadence.period === 'day' && agg != null
            ? (meetsTarget(c, agg, ctx.rolloverHour) ? 'hit' : 'miss')
            : ev
          items.push({
            key: `commitment:${c.id}`, kind: 'commitment', title: c.measurementDefinition,
            done: logged.length > 0, subjectType: 'commitment', subjectId: c.id,
            entryId: latest(logged)?.id, entryIds: logged.map((e) => e.id), commitment: c,
            value: agg,
            valueState: shown,
            detail: c.cadence.period === 'day' ? undefined : periodTotal(c, inPeriod, periodWord),
            target,
          })
        }
      }

      for (const p of s.preps.filter((p) => p.commitmentId === c.id && !p.deletedAt)) {
        if (!p.fireWeekdays.includes(isoWeekday(date))) continue
        const done = doneEntryOn('prep', p.id, date)
        items.push({
          key: `prep:${p.id}`, kind: 'prep', title: p.title, detail: `${p.fireTime} · for ${c.label}`,
          done: !!done, subjectType: 'prep', subjectId: p.id, entryId: done?.id, target,
        })
      }

      if (isToday && snoozes[c.id] !== ctx.today) {
        const prompt = missPrompt(c, s.entries, ctx)
        if (prompt) prompts.push(prompt)
      }
    }

    for (const p of s.projects.filter((p) => p.goalId === g.id && !p.deletedAt && p.state === 'active')) {
      projectsInGoals.add(p.id)
      items.push(...stepItems(p, true))
    }
    for (const t of s.tasks.filter((t) => t.goalId === g.id && !t.projectId && !t.deletedAt)) {
      const item = taskItem(t, { kind: 'task', id: t.id })
      if (item) items.push(item)
    }

    if (items.length || prompts.length) {
      groups.push({
        key: `goal:${g.id}`, kind: 'goal', goalId: g.id,
        eyebrow: value ? `${value.name} · ${g.title}` : g.title, title: g.title, why: g.whyText,
        items, prompts, done: prompts.length === 0 && items.every((i) => i.done),
      })
    }
  }

  // ——— standalone projects ———

  for (const p of s.projects) {
    if (p.deletedAt || p.state !== 'active' || projectsInGoals.has(p.id)) continue
    const items = stepItems(p, false)
    if (!items.length) continue
    const goal = p.goalId ? s.goals.find((g) => g.id === p.goalId) : undefined
    groups.push({
      key: `project:${p.id}`, kind: 'project', projectId: p.id,
      eyebrow: `Project · due ${relativeDay(p.targetDate, date)}`, title: p.title, why: goal?.whyText,
      items, prompts: [], done: items.every((i) => i.done),
    })
  }

  // ——— errands ———

  const errands: TodayItem[] = []
  for (const t of s.tasks) {
    if (t.deletedAt || t.projectId) continue
    if (t.goalId && liveGoalIds.has(t.goalId)) continue
    const item = taskItem(t, { kind: 'task', id: t.id })
    if (item) errands.push(item)
  }
  if (errands.length) {
    groups.push({
      key: 'errands', kind: 'errands', eyebrow: 'One-offs, not tied to a goal', title: 'Errands',
      items: errands, prompts: [], done: errands.every((i) => i.done),
    })
  }

  const all = groups.flatMap((g) => g.items)
  return { date, isToday, groups, total: all.length, open: all.filter((i) => !i.done).length }
}

function periodTotal(c: Commitment, inPeriod: Entry[], periodWord: string): string | undefined {
  if (c.checkinType !== 'quantity') return undefined
  const sum = thresholdAggregate(c, inPeriod) ?? 0
  const cmp = c.comparator === 'lte' ? '≤' : '≥'
  return `${round(sum)} ${c.unit ?? ''} ${periodWord} · target ${cmp} ${c.targetValue ?? ''}`.replace(/\s+/g, ' ')
}

const round = (n: number) => Math.round(n * 100) / 100
