import { joinList, t, tn } from '../i18n'
import type { PushMessage } from '../../supabase/functions/_shared/webpush'
import { APP_PUSHES_MAX, MERGE_MS, PLAN_DAYS, PLAN_ROWS_MAX, REVIEW_TIME, SUMMARY_NAMES, SUMMARY_TIME } from '../numbers'
import { addDays, capitalize, isoWeekday, parseTime } from './dates'
import { dueWhen, reminderAt, validReminder } from './reminders'
import { reviewPending } from './review'
import { activeEntries } from './scoring'
import { buildDay, isLiveGoal, stepDeadlines, waitsForGoal, type Snapshot, type TodayItem } from './today'
import type { DateStr, NotificationPrefs, Reminder, Task, WeekReview } from './types'
import { wallClock, wallTime, zonedTime } from './zoned'

/**
 * The notification planner (plan §4): every push for the next N-6 days, from what's on the phone and
 * Settings → Notifications. Pure: the sync layer encrypts what it returns for the account's push
 * subscription and uploads only what changed (src/sync/planner.ts). Texts are in the app's language
 * (spec NO-14), so call it with that language set.
 */

export type Prefs = Omit<NotificationPrefs, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const DEFAULT_PREFS: Prefs = {
  summary: true, summaryTime: SUMMARY_TIME, weekdaysOnly: false, reminders: true, review: true, reviewTime: REVIEW_TIME,
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

export type PushKind = 'reminder' | 'summary' | 'review'

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
  const prefs = { ...DEFAULT_PREFS, ...input.prefs }
  if (!okTime(prefs.summaryTime)) prefs.summaryTime = SUMMARY_TIME
  if (!okTime(prefs.reviewTime)) prefs.reviewTime = REVIEW_TIME
  const until = now + PLAN_DAYS * 86_400_000
  const inWindow = (ms: number) => ms > now && ms <= until
  const today = wallClock(now, tz).date
  // Every day a push may fall on, and a little before (a reminder counts back from its day).
  const days = Array.from({ length: PLAN_DAYS + 1 }, (_, i) => addDays(today, i))

  const app: PlannedPush[] = [
    ...(prefs.summary ? summaries(input, prefs, days) : []),
    ...(prefs.review ? reviews(input, prefs, days) : []),
  ].filter((p) => inWindow(p.fireAt))
  const asked = prefs.reminders ? merge(reminders(input, prefs).filter((x) => inWindow(x.fireAt)), tz) : []

  // N-7: what the app starts by itself, a few a day at most. What the person asked for always goes.
  const perDay = new Map<DateStr, number>()
  const capped = app.sort((a, b) => a.fireAt - b.fireAt).filter((p) => {
    const day = wallClock(p.fireAt, tz).date
    const n = perDay.get(day) ?? 0
    perDay.set(day, n + 1)
    return n < APP_PUSHES_MAX
  })
  return [...capped, ...asked].sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id)).slice(0, PLAN_ROWS_MAX)
}

/** The day a push at `hhmm` on calendar day `day` belongs to: before the rollover hour it's still the day before. */
const logicalDay = (day: DateStr, hhmm: string, rolloverHour: number) =>
  (parseTime(hhmm) ?? 0) < rolloverHour * 60 ? addDays(day, -1) : day

// ——— morning summary (spec NO-1) ———

const isTodo = (i: TodayItem) => i.kind !== 'log' && !i.adds

function summaries(input: PlanInput, prefs: Prefs, days: DateStr[]): PlannedPush[] {
  const { snap, timeZone: tz, rolloverHour } = input
  const out: PlannedPush[] = []
  for (const day of days) {
    if (prefs.weekdaysOnly && isoWeekday(day) > 5) continue
    const date = logicalDay(day, prefs.summaryTime, rolloverHour)
    const view = buildDay(snap, date, { today: date, rolloverHour })
    const open = view.groups.flatMap((g) => g.items).filter((i) => isTodo(i) && !i.done)
    if (!open.length) continue // empty days get no summary
    const timed: { name: string; time: string }[] = []
    const late: string[] = []
    const rest: string[] = []
    for (const item of open) {
      const name = itemName(snap, item)
      const time = item.kind === 'prep' ? snap.preps.find((p) => p.id === item.subjectId)?.fireTime
        : item.kind === 'task' && item.dueDate === date ? snap.tasks.find((x) => x.id === item.subjectId)?.time : null
      if (okTime(time)) timed.push({ name, time })
      else if (item.dueDate && item.dueDate < date) late.push(t('push.late', { name }))
      else rest.push(name)
    }
    const names = [...timed.sort((a, b) => a.time.localeCompare(b.time)).map((x) => t('push.at', x)), ...late, ...rest]
    const shown = names.slice(0, SUMMARY_NAMES)
    const more = names.length - shown.length
    const body = more ? `${shown.join(', ')} ${tn('push.andMore', more)}` : joinList(shown)
    out.push({
      id: `sum:${day}`, kind: 'summary', fireAt: zonedTime(day, prefs.summaryTime, tz),
      message: msg(tn('push.summaryTitle', open.length), body, '/', 'summary'),
    })
  }
  return out
}

/** A commitment by its short name ("Gym"), anything else by its title. */
function itemName(snap: Snapshot, item: TodayItem): string {
  if (item.kind === 'commitment') {
    const label = snap.commitments.find((c) => c.id === item.subjectId)?.label?.trim()
    if (label) return capitalize(label)
  }
  return item.title
}

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

// ——— reminders set on items (spec NO-3) ———

interface Asked { key: string; name: string; body: string; url: string; fireAt: number }

function reminders(input: PlanInput, prefs: Prefs): Asked[] {
  const { snap, timeZone: tz, now } = input
  const out: Asked[] = []
  // Ticked off: a task or step for good, a prep for that day only.
  const done = new Set<string>()
  for (const e of activeEntries(snap.entries)) {
    if (e.outcome === 'hit') done.add(e.subjectType === 'prep' ? `prep:${e.subjectId}:${e.date}` : `${e.subjectType}:${e.subjectId}`)
  }
  const at = (x: Reminder, date: DateStr, time?: string | null) => reminderAt(x, date, okTime(time) ? time : null, prefs.summaryTime, tz)
  const from = (ms: number) => wallClock(ms, tz).date
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
      url: `/?task=${task.id}`, fireAt,
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
        url: `/projects/${p.id}`, fireAt: at(step.reminder, end),
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
    // A reminder up to a month before reaches back from days a little past the window.
    for (let i = 0; i <= PLAN_DAYS + 31; i++) {
      const day = addDays(today, i)
      if (!prep.fireWeekdays.includes(isoWeekday(day)) || day < g.startDate || day < c.startDate) continue
      if (done.has(`prep:${prep.id}:${day}`)) continue
      out.push({
        key: `prep:${prep.id}:${day}`, name: prep.title, body: t('push.prep', { goal: g.title }),
        url: `/goals/${g.id}`, fireAt: at(prep.reminder, day, prep.fireTime),
      })
    }
  }
  return out
}

/**
 * N-10: reminders this close together go out as one push, at the first one's time: "2 things at 11:00", one
 * per line, the later ones with their own time (plan §2, "Several at once").
 */
function merge(asked: Asked[], tz: string): PlannedPush[] {
  const sorted = [...asked].sort((a, b) => a.fireAt - b.fireAt || a.key.localeCompare(b.key))
  const out: PlannedPush[] = []
  for (let i = 0; i < sorted.length;) {
    const first = sorted[i]
    let j = i + 1
    while (j < sorted.length && sorted[j].fireAt - first.fireAt < MERGE_MS) j++
    const group = sorted.slice(i, j)
    i = j
    const id = `rem:${first.fireAt}`
    if (group.length === 1) {
      out.push({ id, kind: 'reminder', fireAt: first.fireAt, message: msg(first.name, first.body, first.url) })
      continue
    }
    const time = wallTime(first.fireAt, tz)
    const lines = group.map((x) => (x.fireAt === first.fireAt ? x.name : t('push.lineAt', { name: x.name, time: wallTime(x.fireAt, tz) })))
    out.push({ id, kind: 'reminder', fireAt: first.fireAt, message: msg(tn('push.several', group.length, { time }), lines.join('\n'), '/') })
  }
  return out
}
