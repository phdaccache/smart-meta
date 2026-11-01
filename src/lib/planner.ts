import { t, tn } from '../i18n'
import type { PushMessage } from '../../supabase/functions/_shared/webpush'
import { APP_PUSHES_MAX, PLAN_DAYS, PLAN_ROWS_MAX, QUIET_FROM, QUIET_TO, REVIEW_TIME, SUMMARY_TIME } from '../numbers'
import { addDays, isoWeekday, parseTime } from './dates'
import { dueWhen, reminderAt, validReminder } from './reminders'
import { reviewPending } from './review'
import { activeEntries } from './scoring'
import { buildDay, isLiveGoal, stepDeadlines, waitsForGoal, type Snapshot, type TodayItem } from './today'
import type { DateStr, NotificationPrefs, Reminder, Task, WeekReview } from './types'
import { wallClock, zonedTime } from './zoned'

/**
 * The notification planner (plan §4): every push for the next N-6 days, from what's on the phone and
 * Settings → Notifications. Pure: the sync layer encrypts what it returns for the account's push
 * subscription and uploads only what changed (src/sync/planner.ts). Texts are in the app's language
 * (spec NO-14), so call it with that language set.
 */

export type Prefs = Omit<NotificationPrefs, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const DEFAULT_PREFS: Prefs = {
  summary: true, summaryTime: SUMMARY_TIME, weekdaysOnly: false, reminders: true, review: true, reviewTime: REVIEW_TIME,
  goalReviews: true, badge: false, details: true, quiet: false, quietFrom: QUIET_FROM, quietTo: QUIET_TO,
}

export interface PlanInput {
  snap: Snapshot
  weekReviews: WeekReview[]
  prefs: Prefs
  /** Milliseconds since 1970: only pushes after this are planned. */
  now: number
  /** IANA name of the phone's time zone. */
  timeZone: string
  rolloverHour: number
}

export type PushKind = 'reminder' | 'summary' | 'review' | 'goal-review'

export interface PlannedPush {
  /** Deterministic (plan §4.1): planning again gives the same id for the same push. */
  id: string
  kind: PushKind
  fireAt: number
  message: PushMessage
}

/** Text from people's own items is cut, so a push always fits (spec SE-2: at most 4 KB, encrypted). */
const TITLE_MAX = 120
const BODY_MAX = 600
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)
const msg = (title: string, body: string, url: string, tag?: string): PushMessage =>
  ({ title: clip(title, TITLE_MAX), body: clip(body, BODY_MAX), url, ...(tag && { tag }) })

const okTime = (s: string | null | undefined): s is string => typeof s === 'string' && parseTime(s) != null

export function planPushes(input: PlanInput): PlannedPush[] {
  const { now, timeZone: tz } = input
  const prefs = cleanPrefs(input.prefs)
  if (!okTime(prefs.reviewTime)) prefs.reviewTime = REVIEW_TIME
  const until = now + PLAN_DAYS * 86_400_000
  const inWindow = (ms: number) => ms > now && ms <= until
  const today = wallClock(now, tz).date
  // Every day a push may fall on, and the day before: what quiet hours hold overnight comes from there.
  const days = Array.from({ length: PLAN_DAYS + 2 }, (_, i) => addDays(today, i - 1))

  const app: PlannedPush[] = [
    ...(prefs.summary ? summaries(input, prefs, days) : []),
    ...(prefs.review ? reviews(input, prefs, days) : []),
    ...(prefs.goalReviews ? goalReviews(input, prefs, days) : []),
  ].map((p) => ({ ...p, fireAt: afterQuiet(p.fireAt, prefs, tz) })).filter((p) => inWindow(p.fireAt))
  const asked = prefs.reminders ? reminders(input, prefs).filter((x) => inWindow(x.at)).map(toPush) : []

  // N-7: what the app starts by itself, a few a day at most. What the person asked for always goes.
  const perDay = new Map<DateStr, number>()
  const capped = app.sort((a, b) => a.fireAt - b.fireAt).filter((p) => {
    const day = wallClock(p.fireAt, tz).date
    const n = perDay.get(day) ?? 0
    perDay.set(day, n + 1)
    return n < APP_PUSHES_MAX
  })
  const pushes = [...capped, ...asked].sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id)).slice(0, PLAN_ROWS_MAX)
  return pushes.map((p) => withBadge(input, prefs, prefs.details ? p : withoutDetails(p)))
}

function cleanPrefs(given: Prefs): Prefs {
  const prefs = { ...DEFAULT_PREFS, ...given }
  if (!okTime(prefs.summaryTime)) prefs.summaryTime = SUMMARY_TIME
  if (!okTime(prefs.quietFrom)) prefs.quietFrom = QUIET_FROM
  if (!okTime(prefs.quietTo)) prefs.quietTo = QUIET_TO
  return prefs
}

/** The day a push at `hhmm` on calendar day `day` belongs to: before the rollover hour it's still the day before. */
const logicalDay = (day: DateStr, hhmm: string, rolloverHour: number) =>
  (parseTime(hhmm) ?? 0) < rolloverHour * 60 ? addDays(day, -1) : day

// ——— quiet hours (spec NO-22) ———

/**
 * When a push due at `ms` may arrive: everything falling in quiet hours waits until they end (owner,
 * 2026-11-01), since the iPhone has no silent push. The push keeps its id, so what already went out stays
 * sent (the server keeps those rows as they are) if quiet hours are turned on or changed later.
 */
function afterQuiet(ms: number, prefs: Prefs, tz: string): number {
  const from = parseTime(prefs.quietFrom)
  const to = parseTime(prefs.quietTo)
  if (!prefs.quiet || from == null || to == null || from === to) return ms
  const { date, minutes } = wallClock(ms, tz)
  const quiet = from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
  if (!quiet) return ms
  // Past midnight in overnight hours, or within a day: they end today. Before midnight: tomorrow.
  return zonedTime(from > to && minutes >= from ? addDays(date, 1) : date, prefs.quietTo, tz)
}

// ——— details and the badge (spec NO-20, NO-21) ———

const GENERIC = { reminder: 'push.reminder', summary: 'notif.summary', review: 'notif.review', 'goal-review': 'push.goalReviewDate' } as const

/** Details off: the kind only, no names or counts. It still opens the same place. */
const withoutDetails = (p: PlannedPush): PlannedPush => ({ ...p, message: { ...p.message, title: t(GENERIC[p.kind]), body: '' } })

const isTodo = (i: TodayItem) => i.kind !== 'log' && !i.adds

const openItems = (snap: Snapshot, date: DateStr, rolloverHour: number) =>
  buildDay(snap, date, { today: date, rolloverHour }).groups.flatMap((g) => g.items).filter((i) => isTodo(i) && !i.done)

/**
 * The app's icon: what's late or left on this day. Today also lists tasks due later and tasks with no date, as
 * the morning summary counts them, but those aren't late or for today; as Today's "Today" filter has it.
 */
export const openCount = (snap: Snapshot, date: DateStr, rolloverHour: number) =>
  openItems(snap, date, rolloverHour).filter((i) => (i.kind !== 'task' && i.kind !== 'step') || (!!i.dueDate && i.dueDate <= date)).length

/** A push carries the number for when it arrives: the iPhone allows no silent push to change it otherwise (plan §5). */
function withBadge(input: PlanInput, prefs: Prefs, p: PlannedPush): PlannedPush {
  if (!prefs.badge) return p
  const { date, minutes } = wallClock(p.fireAt, input.timeZone)
  const day = minutes < input.rolloverHour * 60 ? addDays(date, -1) : date
  return { ...p, message: { ...p.message, badge: openCount(input.snap, day, input.rolloverHour) } }
}

// ——— morning summary (spec NO-1) ———

function summaries(input: PlanInput, prefs: Prefs, days: DateStr[]): PlannedPush[] {
  const { snap, timeZone: tz, rolloverHour } = input
  const out: PlannedPush[] = []
  for (const day of days) {
    if (prefs.weekdaysOnly && isoWeekday(day) > 5) continue
    const date = logicalDay(day, prefs.summaryTime, rolloverHour)
    const open = openItems(snap, date, rolloverHour)
    if (!open.length) continue // empty days get no summary
    // How many of each (owner, 2026-10-31): "Tasks: 4, Preps: 2, Commitments: 2, Projects: 3", none left out
    // of the title's count, and a kind with none not named.
    const body = SUMMARY_KINDS
      .map(([kind, key]) => [key, open.filter((i) => i.kind === kind).length] as const)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => t('push.count', { what: t(key), n }))
      .join(', ')
    out.push({
      id: `sum:${day}`, kind: 'summary', fireAt: zonedTime(day, prefs.summaryTime, tz),
      message: msg(tn('push.summaryTitle', open.length), body, '/', 'summary'),
    })
  }
  return out
}

/** The summary's kinds, in its order: a project's current step counts for Projects. */
const SUMMARY_KINDS = [
  ['task', 'push.tasks'], ['prep', 'push.preps'], ['commitment', 'push.commitments'], ['step', 'push.projects'],
] as const

// ——— weekly review (spec NO-4) ———

function reviews(input: PlanInput, prefs: Prefs, days: DateStr[]): PlannedPush[] {
  return days.filter((d) => isoWeekday(d) === 1).flatMap((day) => {
    const date = logicalDay(day, prefs.reviewTime, input.rolloverHour)
    // Only while there's a week to review: an active goal, and not reviewed yet.
    if (!reviewPending(input.snap.goals, input.weekReviews, date)) return []
    return [{
      id: `rev:${day}`, kind: 'review' as const, fireAt: zonedTime(day, prefs.reviewTime, input.timeZone),
      message: msg(t('push.reviewTitle'), t('push.reviewBody'), '/review', 'review'),
    }]
  })
}

// ——— goal review date (spec NO-6) ———

/** The day the goal's page starts asking for its review, at the morning summary's time (owner, 2026-11-01). Once only. */
function goalReviews(input: PlanInput, prefs: Prefs, days: DateStr[]): PlannedPush[] {
  return input.snap.goals.filter(isLiveGoal).flatMap((g) => {
    if (!g.targetDate) return []
    const reviewOn = g.kind === 'outcome' ? addDays(g.targetDate, g.graceDays ?? 0) : g.targetDate
    const day = days.find((d) => logicalDay(d, prefs.summaryTime, input.rolloverHour) === reviewOn)
    return day ? [{
      id: `gol:${day}:${g.id}`, kind: 'goal-review' as const, fireAt: zonedTime(day, prefs.summaryTime, input.timeZone),
      message: msg(t('push.goalReviewTitle'), g.title, `/goals/${g.id}`, `goal:${g.id}`),
    }] : []
  })
}

// ——— reminders set on items (spec NO-3) ———

interface Asked {
  key: string; name: string; body: string
  /** When it's due, and `at` when it may arrive, after quiet hours. */
  fireAt: number; at?: number
  /** Its row on Today (`TodayItem.key`), if it has one; else where tapping the push goes. */
  row?: string; url: string
}

function reminders(input: PlanInput, prefs: Prefs): (Asked & { at: number })[] {
  const { snap, timeZone: tz, now } = input
  const out: Asked[] = []
  // Ticked off: a task or step for good, a prep for that day only.
  const done = new Set<string>()
  for (const e of activeEntries(snap.entries)) {
    if (e.outcome === 'hit') done.add(e.subjectType === 'prep' ? `prep:${e.subjectId}:${e.date}` : `${e.subjectType}:${e.subjectId}`)
  }
  const at = (x: Reminder, date: DateStr, time?: string | null) => reminderAt(x, date, okTime(time) ? time : null, prefs.summaryTime, tz)
  const from = (ms: number) => wallClock(afterQuiet(ms, prefs, tz), tz).date
  const projects = new Map(snap.projects.filter((p) => !p.deletedAt).map((p) => [p.id, p]))
  /** A project on Today: started, not done, and not waiting for its goal. */
  const running = (id: string, date: DateStr) => {
    const p = projects.get(id)
    return !!p && p.state === 'active' && !waitsForGoal(p, snap.goals, date)
  }

  // Tasks, and a project's own tasks while it runs.
  for (const task of snap.tasks) {
    if (task.deletedAt || task.projectId || !task.date || !validReminder(task.reminder) || done.has(`task:${task.id}`)) continue
    if (task.forProjectId && projects.has(task.forProjectId) && !running(task.forProjectId, task.date)) continue
    const fireAt = at(task.reminder, task.date, task.time)
    out.push({
      key: `task:${task.id}`, name: task.title, body: dueWhen(task.date, okTime(task.time) ? task.time : null, from(fireAt)),
      row: `task:${task.id}`, url: `/?task=${task.id}`, fireAt,
    })
  }

  // Projects, by their target date; their steps, by each step's end date.
  for (const p of projects.values()) {
    if (p.targetDate && validReminder(p.reminder) && running(p.id, p.targetDate)) {
      const fireAt = at(p.reminder, p.targetDate, p.time)
      out.push({
        key: `project:${p.id}`, name: p.title, body: dueWhen(p.targetDate, okTime(p.time) ? p.time : null, from(fireAt)),
        url: `/projects/${p.id}`, fireAt,
      })
    }
    const steps: Task[] = snap.tasks.filter((x) => x.projectId === p.id && !x.deletedAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const ends = stepDeadlines(p, steps)
    steps.forEach((step, i) => {
      const end = ends[i]
      if (!end || !validReminder(step.reminder) || done.has(`task:${step.id}`) || !running(p.id, end)) return
      out.push({
        key: `step:${step.id}`, name: step.title, body: t('push.step', { project: p.title, n: i + 1, total: steps.length }),
        row: `task:${step.id}`, url: `/projects/${p.id}`, fireAt: at(step.reminder, end),
      })
    })
  }

  // Preps, before each of their times (they repeat every week).
  const goals = new Map(snap.goals.map((g) => [g.id, g]))
  const commitments = new Map(snap.commitments.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const today = wallClock(now, tz).date
  for (const prep of snap.preps) {
    if (prep.deletedAt || !validReminder(prep.reminder) || !okTime(prep.fireTime)) continue
    const c = commitments.get(prep.commitmentId)
    const g = c && goals.get(c.goalId)
    if (!c || !g || !isLiveGoal(g)) continue
    // A reminder up to a month before reaches back from days a little past the window; yesterday's, quiet hours hold.
    for (let i = -1; i <= PLAN_DAYS + 31; i++) {
      const day = addDays(today, i)
      if (!prep.fireWeekdays.includes(isoWeekday(day)) || day < g.startDate || day < c.startDate) continue
      if (done.has(`prep:${prep.id}:${day}`)) continue
      out.push({
        key: `prep:${prep.id}:${day}`, name: prep.title, body: t('push.prep', { goal: g.title }),
        row: `prep:${prep.id}`, url: `/goals/${g.id}`, fireAt: at(prep.reminder, day, prep.fireTime),
      })
    }
  }
  return out.map((x) => ({ ...x, at: afterQuiet(x.fireAt, prefs, tz) }))
}

/**
 * Each reminder is a push of its own, as in Reminders (owner, 2026-10-31): the phone stacks those that come
 * together. Tapping one opens Today on its row (`remindUrl`), or where it lives when it has no row there.
 */
function toPush(x: Asked & { at: number }): PlannedPush {
  return {
    id: `rem:${x.fireAt}:${x.key}`, kind: 'reminder', fireAt: x.at,
    message: msg(x.name, x.body, x.row ? remindUrl(x.row, x.at, x.url) : x.url, x.key),
  }
}

/** Today, on this row; `else` when the row isn't on Today (a step not current yet, a prep on another day). */
export const remindUrl = (row: string, fireAt: number, elsewhere: string) =>
  `/?remind=${encodeURIComponent(row)}&at=${fireAt}&else=${encodeURIComponent(elsewhere)}`

/**
 * The rows on Today whose reminders fired between `from` and `to`: what Today's "Now" shows when a push is
 * tapped while others came with it (owner, 2026-10-31).
 */
export function remindedRows(input: Omit<PlanInput, 'weekReviews'>, from: number, to: number): string[] {
  const prefs = cleanPrefs(input.prefs)
  if (!prefs.reminders) return []
  const rows = reminders({ ...input, weekReviews: [] }, prefs).filter((x) => x.row && x.at >= from && x.at <= to).map((x) => x.row!)
  return [...new Set(rows)]
}
