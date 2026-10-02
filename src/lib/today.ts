import { num, t, tn } from '../i18n'
import { addDays, diffDays, inSpan, isoWeekday, minDate, periodOf, relativeDay } from './dates'
import {
  activeEntries, evaluateThreshold, meetsTarget, missPrompt, thresholdAggregate, withoutDismissed, type MissPrompt, type PeriodEval,
  type ScoreContext,
} from './scoring'
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

/** 'log' is an action row for rule-type commitments, not a to-do: it never counts as open. */
export type ItemKind = 'commitment' | 'prep' | 'step' | 'task' | 'log'

const isTodo = (i: TodayItem) => i.kind !== 'log'

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
  /** Open tasks with a date: red when due today or late, yellow tomorrow, green later. */
  due?: { label: string; tone: 'red' | 'yellow' | 'green' }
  /** A project's open step: whether the project is on pace, behind or overdue (as in Insights). */
  pace?: 'on_pace' | 'behind' | 'overdue'
  target: ItemTarget
}

export type ProjectPace = 'done' | 'all_done' | 'not_started' | 'on_pace' | 'behind' | 'overdue'

/**
 * Whether a project will make its date: overdue past it; otherwise behind when
 * the steps done so far, kept at the same speed, would finish after it.
 * `doneDates` is the day each finished step was done.
 */
export function projectPace(project: Project, total: number, doneDates: DateStr[], today: DateStr): { status: ProjectPace; start: DateStr; projected: DateStr | null } {
  const done = [...doneDates].sort()
  const created = project.createdAt.slice(0, 10)
  const start = minDate(created, done[0] ?? created)
  const remaining = total - done.length
  let projected: DateStr | null = null
  if (project.state === 'done') return { status: 'done', start, projected }
  if (remaining <= 0) return { status: 'all_done', start, projected }
  if (done.length > 0) {
    const pace = done.length / Math.max(7, diffDays(start, today))
    projected = addDays(today, Math.ceil(remaining / pace))
  }
  const status: ProjectPace = project.targetDate < today ? 'overdue' : !projected ? 'not_started' : projected > project.targetDate ? 'behind' : 'on_pace'
  return { status, start, projected }
}

export function dueBadge(due: DateStr, date: DateStr): NonNullable<TodayItem['due']> {
  const d = diffDays(date, due)
  if (d < 0) return { label: t('today.overdue', { when: relativeDay(due, date) }), tone: 'red' }
  if (d === 0) return { label: t('today.due', { when: t('dates.today') }), tone: 'red' }
  if (d === 1) return { label: t('today.due', { when: t('dates.tomorrow') }), tone: 'yellow' }
  return { label: t('today.due', { when: relativeDay(due, date) }), tone: 'green' }
}

/** Dated tasks first, soonest due first; undated after. */
const byDue = (a: TodayItem & { sortDate?: string | null }, b: TodayItem & { sortDate?: string | null }) =>
  (a.sortDate ?? '9999').localeCompare(b.sortDate ?? '9999')

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
/**
 * A project waits with its goal: while the goal is in the backlog (or not at
 * its start date yet) the project stays off Today, Review and Insights.
 */
export function waitsForGoal(p: Project, goals: Goal[], date: DateStr): boolean {
  const g = p.goalId ? goals.find((x) => x.id === p.goalId && !x.deletedAt) : undefined
  return !!g && (g.state === 'backlog' || g.startDate > date)
}

export const isLiveGoal = (g: Goal) => !g.deletedAt && (g.state === 'active' || g.state === 'maintenance')

export function buildDay(
  s: Snapshot,
  date: DateStr,
  ctx: ScoreContext,
  snoozes: Record<ID, DateStr> = {},
  /** Missed slots a weekly review dismissed (see missKey): never asked about again. */
  dismissed: Set<string> = new Set(),
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

  // A task's date is when it's due, so open tasks show on Today from the day they're added.
  const taskItem = (t: Task, target: ItemTarget): (TodayItem & { sortDate?: string | null }) | null => {
    const done = latest(entriesOf('task', t.id).filter((e) => e.outcome === 'hit'))
    let visible: boolean
    if (done) visible = done.date === date
    else visible = isToday || t.date === date
    if (!visible) return null
    return {
      key: `task:${t.id}`, kind: 'task', title: t.title, done: !!done,
      due: !done && t.date && isToday ? dueBadge(t.date, date) : undefined,
      subjectType: 'task', subjectId: t.id, entryId: done?.id, target, sortDate: t.date,
    }
  }

  const stepItems = (p: Project, showDue: boolean): TodayItem[] => {
    if (p.deletedAt || p.state !== 'active') return []
    const steps = s.tasks
      .filter((t) => t.projectId === p.id && !t.deletedAt)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const out: TodayItem[] = []
    let currentShown = false
    const doneDates = steps
      .map((step) => entriesOf('task', step.id).filter((e) => e.outcome === 'hit').map((e) => e.date).sort()[0])
      .filter((d): d is DateStr => !!d)
    const { status } = projectPace(p, steps.length, doneDates, date)
    const pace = status === 'on_pace' || status === 'behind' || status === 'overdue' ? status : undefined
    steps.forEach((step, i) => {
      const done = latest(entriesOf('task', step.id).filter((e) => e.outcome === 'hit'))
      const base = {
        kind: 'step' as const, title: step.title, subjectType: 'task' as const, subjectId: step.id,
        step: { index: i + 1, total: steps.length }, target: { kind: 'project' as const, id: p.id },
      }
      if (done && done.date === date) {
        out.push({ ...base, key: `task:${step.id}`, done: true, entryId: done.id })
      } else if (!done && !currentShown) {
        currentShown = true
        if (isToday) {
          out.push({
            ...base, key: `task:${step.id}`, done: false, pace,
            detail: showDue ? t('today.stepOf', { project: p.title, when: relativeDay(p.targetDate, date) }) : undefined,
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
    const commitments = s.commitments
      .filter((c) => c.goalId === g.id && !c.deletedAt && c.startDate <= date)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    for (const c of commitments) {
      const mine = entriesOf('commitment', c.id)
      const period = periodOf(date, c.cadence.period)
      const inPeriod = mine.filter((e) => inSpan(e.date, period))
      const onDate = inPeriod.filter((e) => e.date === date)
      const periodWord = c.cadence.period === 'week' ? t('dates.thisWeek') : c.cadence.period === 'month' ? t('dates.thisMonth') : t('dates.today')

      if (c.shape === 'rhythm') {
        const times = c.cadence.times
        const hits = inPeriod.filter((e) => e.outcome === 'hit')
        const hitsToday = onDate.filter((e) => e.outcome === 'hit')
        const multiPerDay = c.cadence.period === 'day' && times > 1
        const doneToday = multiPerDay ? hitsToday.length >= times : hitsToday.length > 0
        const satisfied = hits.length >= times
        let detail: string | undefined
        if (multiPerDay) detail = t('today.nOfTimesToday', { n: hitsToday.length, times })
        else if (c.cadence.period !== 'day') {
          detail = satisfied && !doneToday
            ? t('today.doneForPeriod', { period: periodWord })
            : t('today.nOfTimesPeriod', { n: hits.length, times, period: periodWord })
        }
        items.push({
          key: `commitment:${c.id}`, kind: 'commitment', title: c.measurementDefinition, detail,
          done: doneToday || satisfied, subjectType: 'commitment', subjectId: c.id,
          entryId: doneToday ? latest(hitsToday)?.id : undefined, target,
        })
      } else if (c.shape === 'standard') {
        // Nothing to tick: occurrences are logged when they happen, from this row.
        const week = periodOf(date, 'week')
        const logged = s.occurrences.filter((o) => o.commitmentId === c.id && !o.deletedAt && inSpan(o.date, week)).length
        items.push({
          key: `log:${c.id}`, kind: 'log', title: t('today.logItem', { name: c.label }),
          detail: logged ? tn('today.loggedThisWeek', logged) : undefined,
          done: false, subjectType: 'commitment', subjectId: c.id, target,
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
          key: `prep:${p.id}`, kind: 'prep', title: p.title, detail: t('today.prepFor', { time: p.fireTime, name: c.label }),
          done: !!done, subjectType: 'prep', subjectId: p.id, entryId: done?.id, target,
        })
      }

      if (isToday && snoozes[c.id] !== ctx.today) {
        const prompt = withoutDismissed(missPrompt(c, s.entries, ctx), dismissed)
        if (prompt) prompts.push(prompt)
      }
    }

    for (const p of s.projects.filter((p) => p.goalId === g.id && !p.deletedAt && p.state === 'active')) {
      projectsInGoals.add(p.id)
      items.push(...stepItems(p, true))
    }
    items.push(
      ...s.tasks
        .filter((t) => t.goalId === g.id && !t.projectId && !t.deletedAt)
        .map((t) => taskItem(t, { kind: 'task', id: t.id }))
        .filter((i): i is NonNullable<typeof i> => !!i)
        .sort(byDue),
    )

    if (items.length || prompts.length) {
      groups.push({
        key: `goal:${g.id}`, kind: 'goal', goalId: g.id,
        // With no reason written, the title takes the reason's place and the eyebrow keeps just the value.
        eyebrow: g.whyText ? (value ? `${value.name} · ${g.title}` : g.title) : value?.name ?? '',
        title: g.title, why: g.whyText || undefined,
        items, prompts, done: prompts.length === 0 && items.filter(isTodo).length > 0 && items.filter(isTodo).every((i) => i.done),
      })
    }
  }

  // ——— standalone projects ———

  for (const p of s.projects) {
    if (p.deletedAt || p.state !== 'active' || projectsInGoals.has(p.id) || waitsForGoal(p, s.goals, date)) continue
    const items = stepItems(p, false)
    if (!items.length) continue
    const goal = p.goalId ? s.goals.find((g) => g.id === p.goalId) : undefined
    groups.push({
      key: `project:${p.id}`, kind: 'project', projectId: p.id,
      eyebrow: t('today.projectDue', { when: relativeDay(p.targetDate, date) }), title: p.title, why: goal?.whyText || undefined,
      items, prompts: [], done: items.every((i) => i.done),
    })
  }

  // ——— errands ———

  const errands: (TodayItem & { sortDate?: string | null })[] = []
  for (const t of s.tasks) {
    if (t.deletedAt || t.projectId) continue
    if (t.goalId && liveGoalIds.has(t.goalId)) continue
    const item = taskItem(t, { kind: 'task', id: t.id })
    if (item) errands.push(item)
  }
  errands.sort(byDue)
  if (errands.length) {
    groups.push({
      key: 'errands', kind: 'errands', eyebrow: t('today.errands'), title: t('today.errands'),
      items: errands, prompts: [], done: errands.every((i) => i.done),
    })
  }

  const all = groups.flatMap((g) => g.items).filter(isTodo)
  return { date, isToday, groups, total: all.length, open: all.filter((i) => !i.done).length }
}

function periodTotal(c: Commitment, inPeriod: Entry[], periodWord: string): string | undefined {
  if (c.checkinType !== 'quantity') return undefined
  const sum = thresholdAggregate(c, inPeriod) ?? 0
  const cmp = c.comparator === 'lte' ? '≤' : '≥'
  const total = `${num(sum)} ${c.unit ?? ''}`.trim()
  return t('today.periodTotal', { total, period: periodWord, cmp, target: c.targetValue == null ? '' : num(c.targetValue) }).trim()
}
