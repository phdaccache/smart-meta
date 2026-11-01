import { describe, expect, it } from 'vitest'
import { inLang } from '../i18n'
import { DEFAULT_PREFS, openCount, planPushes, remindedRows, remindUrl, type PlanInput, type Prefs } from './planner'
import { dueWhen, reminderAt, reminderChoices, reminderLabel } from './reminders'
import { commitment, goal, hit, prep, project, snapshot, task } from './testkit'
import type { Reminder, WeekReview } from './types'
import { wallClock, zonedTime } from './zoned'

const SP = 'America/Sao_Paulo'
const NY = 'America/New_York'
// The mockup's now: Friday 30 October 2026, 9:41 in São Paulo.
const now = zonedTime('2026-10-30', '09:41', SP)
const at = (date: string, time: string, tz = SP) => zonedTime(date, time, tz)
const iso = (ms: number) => new Date(ms).toISOString()
const rem = (n: number, unit: Reminder['unit']): Reminder => ({ n, unit })

function plan(over: Partial<Omit<PlanInput, 'prefs'>> & { prefs?: Partial<Prefs> } = {}) {
  return planPushes({
    snap: snapshot(), weekReviews: [], now, timeZone: SP, rolloverHour: 4, ...over,
    prefs: { ...DEFAULT_PREFS, ...over.prefs },
  })
}
const only = (kind: string, list: ReturnType<typeof plan>) => list.filter((p) => p.kind === kind)

describe('time zones', () => {
  it('finds the instant of a wall clock time', () => {
    expect(iso(at('2026-10-30', '08:00'))).toBe('2026-10-30T11:00:00.000Z')
    expect(wallClock(at('2026-10-30', '23:59'), SP)).toEqual({ date: '2026-10-30', minutes: 23 * 60 + 59 })
  })

  it('moves a time the clocks skip forward, and takes the first of a time that happens twice', () => {
    // New York springs forward at 02:00 on 14 March 2027: 02:30 doesn't exist, 03:30 EDT does.
    expect(iso(at('2027-03-14', '02:30', NY))).toBe('2027-03-14T07:30:00.000Z')
    // It falls back at 02:00 on 1 November 2026: 01:30 happens twice; the first is EDT.
    expect(iso(at('2026-11-01', '01:30', NY))).toBe('2026-11-01T05:30:00.000Z')
  })
})

describe('reminders: when they fire', () => {
  it('counts minutes and hours back from the moment, days and months back on the calendar', () => {
    expect(iso(reminderAt(rem(15, 'minute'), '2026-11-05', '14:30', '08:00', SP))).toBe('2026-11-05T17:15:00.000Z')
    expect(iso(reminderAt(rem(1, 'day'), '2026-11-05', '14:30', '08:00', SP))).toBe('2026-11-04T17:30:00.000Z')
    // A date only is due at the morning summary's time (owner's answer 5).
    expect(iso(reminderAt(rem(0, 'day'), '2026-11-05', null, '08:00', SP))).toBe('2026-11-05T11:00:00.000Z')
    // 31 March less a month is the end of February.
    expect(iso(reminderAt(rem(1, 'month'), '2027-03-31', '10:00', '08:00', SP))).toBe('2027-02-28T13:00:00.000Z')
  })

  it('keeps the time of day across daylight saving: 1 day before noon is noon', () => {
    // 14 March 2027 noon in New York is EDT; the day before is still EST, an hour later in UTC terms.
    expect(iso(reminderAt(rem(1, 'day'), '2027-03-14', '12:00', '08:00', NY))).toBe('2027-03-13T17:00:00.000Z')
    expect(iso(reminderAt(rem(24, 'hour'), '2027-03-14', '12:00', '08:00', NY))).toBe('2027-03-13T16:00:00.000Z')
  })

  it('offers only the choices still ahead, as the mockup does', () => {
    const labels = (date: string, time: string | null) =>
      reminderChoices(date, time, '08:00', SP, now).map((x) => reminderLabel(x, !!time))
    // Due Thursday 5 November at 14:30: 1 week and 1 month before have passed.
    expect(labels('2026-11-05', '14:30')).toEqual([
      'At the time', '5 minutes before', '15 minutes before', '30 minutes before', '1 hour before', '2 hours before',
      '1 day before', '2 days before',
    ])
    expect(labels('2026-11-05', null)).toEqual(['On the day', '1 day before', '2 days before'])
    expect(labels('2027-06-01', null)).toHaveLength(8)
  })

  it('says when it is due from the day the push arrives', () => {
    expect(dueWhen('2026-11-05', '14:30', '2026-11-05')).toBe('Today, 14:30')
    expect(dueWhen('2026-11-05', '23:35', '2026-11-04')).toBe('Tomorrow, 23:35')
    expect(dueWhen('2026-11-05', '14:30', '2026-11-02')).toBe('Thursday, 14:30')
    expect(dueWhen('2026-11-05', null, '2026-11-03')).toBe('Thursday')
    expect(dueWhen('2027-06-01', null, '2027-05-01')).toBe('1 June')
    inLang('pt-BR', () => {
      expect(dueWhen('2026-11-05', '14:30', '2026-11-05')).toBe('Hoje, 14:30')
      expect(dueWhen('2026-11-05', null, '2026-11-02')).toBe('Quinta-feira')
      expect(dueWhen('2027-06-01', null, '2027-05-01')).toBe('1 de junho')
    })
  })
})

describe('reminders on items', () => {
  const t1 = task({ title: 'Renew gym membership', date: '2026-11-05', time: '14:30', reminder: rem(15, 'minute') })

  it('pushes once, before the item is due, with its name and when it is due', () => {
    const [p] = only('reminder', plan({ snap: snapshot({ tasks: [t1] }) }))
    expect(iso(p.fireAt)).toBe('2026-11-05T17:15:00.000Z')
    expect(p.message).toEqual({
      title: 'Renew gym membership', body: 'Today, 14:30', url: remindUrl(`task:${t1.id}`, p.fireAt, `/?task=${t1.id}`), tag: `task:${t1.id}`,
    })
    expect(p.id).toBe(`rem:${p.fireAt}:task:${t1.id}`)
  })

  it('pushes nothing for a task with no reminder, done, deleted, or no date', () => {
    const tasks = [
      task({ date: '2026-11-05', time: '14:30' }),
      { ...t1, id: 'gone', deletedAt: '2026-10-30T00:00:00.000Z' },
      task({ reminder: rem(0, 'day') }),
    ]
    const done = { ...t1, id: 'done' }
    const snap = snapshot({ tasks: [...tasks, done], entries: [hit(done, '2026-10-30', { subjectType: 'task' })] })
    expect(only('reminder', plan({ snap }))).toEqual([])
  })

  it('pushes nothing already past, nor past the 14 days ahead', () => {
    const tasks = [
      task({ date: '2026-10-30', time: '09:00', reminder: rem(0, 'minute') }),
      task({ date: '2026-11-20', reminder: rem(0, 'day') }),
    ]
    expect(only('reminder', plan({ snap: snapshot({ tasks }) }))).toEqual([])
  })

  it('stops while its project is paused, for the project, its steps and its own tasks', () => {
    const live = project({ title: 'CV & LinkedIn', targetDate: '2026-11-06', time: '18:00', reminder: rem(1, 'day') })
    const steps = [1, 2, 3, 4].map((n) => task({ title: `Step ${n}`, projectId: live.id, order: n }))
    steps[0].date = '2026-11-02'
    steps[0].reminder = rem(0, 'day')
    const own = task({ title: 'Ask Ana', forProjectId: live.id, date: '2026-11-03', reminder: rem(0, 'day') })
    const snap = snapshot({ projects: [live], tasks: [...steps, own] })
    const pushes = only('reminder', plan({ snap }))
    expect(pushes.map((p) => [p.message.title, p.message.body])).toEqual([
      ['Step 1', 'CV & LinkedIn · step 1 of 4'], ['Ask Ana', 'Today'], ['CV & LinkedIn', 'Tomorrow, 18:00'],
    ])
    // A step opens Today on its row, or its project when it isn't the current step; the project, its page.
    expect(pushes[0].message.url).toBe(remindUrl(`task:${steps[0].id}`, pushes[0].fireAt, `/projects/${live.id}`))
    expect(pushes[2].message.url).toBe(`/projects/${live.id}`)
    expect(iso(pushes[0].fireAt)).toBe('2026-11-02T11:00:00.000Z')
    const paused = snapshot({ projects: [{ ...live, state: 'backlog' }], tasks: [...steps, own] })
    expect(only('reminder', plan({ snap: paused }))).toEqual([])
  })

  it('reminds for a step whose end date is spread from the project’s, following that date (owner’s answer 9a)', () => {
    // Started 30 October, due 7 November: two steps get about 4 days each, so the first ends on 3 November.
    const p = project({ title: 'Move flat', startDate: '2026-10-30', targetDate: '2026-11-07' })
    const steps = [task({ title: 'Pack', projectId: p.id, order: 0, reminder: rem(0, 'day') }), task({ title: 'Move', projectId: p.id, order: 1 })]
    const [push] = only('reminder', plan({ snap: snapshot({ projects: [p], tasks: steps }) }))
    expect(iso(push.fireAt)).toBe('2026-11-03T11:00:00.000Z')
    expect(push.message.body).toBe('Move flat · step 1 of 2')
  })

  it('follows each of a prep’s times, except a day it was already done', () => {
    const g = goal({ title: 'Exercise regularly' })
    const c = commitment(g, { label: 'gym' })
    const p = prep(c, { title: 'Pack the gym bag', fireWeekdays: [3, 5], fireTime: '21:00', reminder: rem(15, 'minute') })
    const snap = snapshot({ goals: [g], commitments: [c], preps: [p], entries: [hit(p, '2026-10-30', { subjectType: 'prep' })] })
    const pushes = only('reminder', plan({ snap }))
    // Wednesdays and Fridays in the next 14 days (to 13 November, 9:41), but not today's: it's done.
    expect(pushes.map((x) => wallClock(x.fireAt, SP).date)).toEqual(['2026-11-04', '2026-11-06', '2026-11-11'])
    expect(pushes[0].message).toMatchObject({
      title: 'Pack the gym bag', body: 'Prep · Exercise regularly', url: remindUrl(`prep:${p.id}`, pushes[0].fireAt, `/goals/${g.id}`),
    })
    expect(iso(pushes[0].fireAt)).toBe('2026-11-04T23:45:00.000Z')
  })

  it('sends each reminder on its own, even at the same minute (owner, 2026-10-31)', () => {
    const tasks = [
      task({ title: 'Call the bank', date: '2026-11-03', time: '11:00', reminder: rem(0, 'minute') }),
      task({ title: 'Send the invoice', date: '2026-11-03', time: '11:00', reminder: rem(0, 'minute') }),
      task({ title: 'Lunch with Bia', date: '2026-11-03', time: '11:10', reminder: rem(0, 'minute') }),
    ]
    const pushes = only('reminder', plan({ snap: snapshot({ tasks }) }))
    expect(pushes.map((p) => p.message.title).sort()).toEqual(['Call the bank', 'Lunch with Bia', 'Send the invoice'])
    expect(new Set(pushes.map((p) => p.id)).size).toBe(3)
    // Different tags: the phone keeps all three, stacked, rather than one replacing another.
    expect(new Set(pushes.map((p) => p.message.tag)).size).toBe(3)
  })

  it('finds the rows that reminded around a moment, for Today’s “Now”', () => {
    const tasks = [
      task({ title: 'Call the bank', date: '2026-11-03', time: '11:00', reminder: rem(0, 'minute') }),
      task({ title: 'Send the invoice', date: '2026-11-03', time: '11:10', reminder: rem(0, 'minute') }),
      task({ title: 'Lunch with Bia', date: '2026-11-03', time: '12:30', reminder: rem(0, 'minute') }),
    ]
    const input = { snap: snapshot({ tasks }), prefs: DEFAULT_PREFS, now, timeZone: SP, rolloverHour: 4 }
    const tapped = at('2026-11-03', '11:10')
    expect(remindedRows(input, tapped - 15 * 60_000, tapped)).toEqual([`task:${tasks[0].id}`, `task:${tasks[1].id}`])
  })

  it('sends nothing the person asked for when “Reminders you set” is off', () => {
    expect(only('reminder', plan({ snap: snapshot({ tasks: [t1] }), prefs: { reminders: false } }))).toEqual([])
  })
})

describe('morning summary', () => {
  const g = goal({ title: 'Exercise regularly' })
  const gym = commitment(g, { label: 'gym', cadence: { period: 'day', times: 1 } })
  const tasks = [
    task({ title: 'Dentist appointment', date: '2026-11-02', time: '14:30' }),
    task({ title: 'Renew gym membership', date: '2026-10-29' }),
    task({ title: 'Buy stamps' }), task({ title: 'Call mum' }), task({ title: 'Water the plants' }),
  ]
  const snap = snapshot({ goals: [g], commitments: [gym], tasks })
  const monday = () => plan({ snap }).find((p) => p.id === 'sum:2026-11-02')!

  it('counts each kind, leaving out the kinds with none (owner, 2026-10-31)', () => {
    expect(iso(monday().fireAt)).toBe('2026-11-02T11:00:00.000Z')
    expect(monday().message).toEqual({ title: 'Today: 6 things', body: 'Tasks: 5, Commitments: 1', url: '/', tag: 'summary' })
  })

  it('speaks the app’s language', () => {
    const pt = inLang('pt-BR', () => plan({ snap }).find((p) => p.id === 'sum:2026-11-02')!)
    expect(pt.message.title).toBe('Hoje: 6 itens')
    expect(pt.message.body).toBe('Tarefas: 5, Compromissos: 1')
  })

  it('counts preps and a project’s current step too', () => {
    const p = project({ title: 'Move flat', targetDate: '2026-11-20' })
    const step = task({ title: 'Pack', projectId: p.id, order: 0 })
    const bag = prep(gym, { title: 'Pack the gym bag', fireWeekdays: [1], fireTime: '21:00' })
    const more = snapshot({ goals: [g], commitments: [gym], preps: [bag], projects: [p], tasks: [step, task({ title: 'Call mum' })] })
    expect(plan({ snap: more }).find((x) => x.id === 'sum:2026-11-02')!.message)
      .toMatchObject({ title: 'Today: 4 things', body: 'Tasks: 1, Preps: 1, Commitments: 1, Projects: 1' })
  })

  it('skips empty days, and weekends with “Weekdays only”', () => {
    expect(only('summary', plan())).toEqual([])
    const days = only('summary', plan({ snap, prefs: { weekdaysOnly: true } })).map((p) => p.id)
    expect(days).not.toContain('sum:2026-10-31')
    expect(days).not.toContain('sum:2026-11-01')
    expect(days).toContain('sum:2026-11-02')
    // Today's 8:00 has passed: the first is tomorrow's.
    expect(only('summary', plan({ snap }))[0].id).toBe('sum:2026-10-31')
  })

  it('belongs to the day before when it comes before the new day starts', () => {
    // A prep on Mondays only: on Tuesday 3 November at 08:00 it isn't there.
    const bag = prep(gym, { title: 'Pack the gym bag', fireWeekdays: [1], fireTime: '21:00' })
    const both = snapshot({ goals: [g], commitments: [gym], preps: [bag] })
    const body = (time: string) => plan({ snap: both, prefs: { summaryTime: time } }).find((p) => p.id === 'sum:2026-11-03')!.message.body
    expect(body('08:00')).toBe('Commitments: 1')
    // At 02:00 it's still Monday 2 November in the app (the new day starts at 4:00).
    expect(body('02:00')).toBe('Preps: 1, Commitments: 1')
  })

  it('follows the phone to another time zone', () => {
    const lisbon = plan({ snap, timeZone: 'Europe/Lisbon' }).find((p) => p.id === 'sum:2026-11-02')!
    expect(iso(lisbon.fireAt)).toBe('2026-11-02T08:00:00.000Z')
  })

  it('is off when switched off', () => {
    expect(only('summary', plan({ snap, prefs: { summary: false } }))).toEqual([])
  })
})

describe('weekly review', () => {
  const g = goal()
  const review = (week: string): WeekReview => ({
    id: `w${week}`, createdAt: '2026-11-02T12:00:00.000Z', updatedAt: '2026-11-02T12:00:00.000Z', week, doneAt: '2026-11-02T12:00:00.000Z', dismissed: [],
  })

  it('comes on Mondays at its own time while a week waits to be reviewed', () => {
    const pushes = only('review', plan({ snap: snapshot({ goals: [g] }), prefs: { reviewTime: '09:30' } }))
    expect(pushes.map((p) => p.id)).toEqual(['rev:2026-11-02', 'rev:2026-11-09'])
    expect(iso(pushes[0].fireAt)).toBe('2026-11-02T12:30:00.000Z')
    expect(pushes[0].message).toEqual({ title: 'Weekly review', body: 'Look back at last week and plan this one.', url: '/review', tag: 'review' })
  })

  it('skips a week already reviewed, and comes with no active goal at all', () => {
    const pushes = only('review', plan({ snap: snapshot({ goals: [g] }), weekReviews: [review('2026-10-26')] }))
    expect(pushes.map((p) => p.id)).toEqual(['rev:2026-11-09'])
    expect(only('review', plan())).toEqual([])
  })
})

describe('the plan as a whole', () => {
  it('gives the same ids for the same data, so planning again updates instead of adding', () => {
    const snap = snapshot({ goals: [goal()], tasks: [task({ title: 'Call mum', date: '2026-11-03', reminder: rem(0, 'day') })] })
    expect(plan({ snap }).map((p) => p.id)).toEqual(plan({ snap }).map((p) => p.id))
  })

  it('ignores a reminder another device wrote wrong', () => {
    const bad = task({ date: '2026-11-03', reminder: { n: -1, unit: 'day' } })
    const odd = task({ date: '2026-11-03', reminder: { n: 1, unit: 'year' } as unknown as Reminder })
    expect(only('reminder', plan({ snap: snapshot({ tasks: [bad, odd] }) }))).toEqual([])
  })
})

describe('goal review date (spec NO-6)', () => {
  const dated = (over = {}) => goal({ title: 'Run a 10k', targetDate: '2026-11-05', ...over })

  it("comes on a goal's review date at the morning summary's time, and opens the goal", () => {
    const g = dated()
    const pushes = only('goal-review', plan({ snap: snapshot({ goals: [g] }), prefs: { summaryTime: '09:15', summary: false } }))
    expect(pushes.map((p) => p.id)).toEqual([`gol:2026-11-05:${g.id}`])
    expect(iso(pushes[0].fireAt)).toBe('2026-11-05T12:15:00.000Z')
    expect(pushes[0].message).toEqual({ title: 'Review date reached', body: 'Run a 10k', url: `/goals/${g.id}`, tag: `goal:${g.id}` })
  })

  it("waits for an outcome goal's extra days, as the goal's page does", () => {
    const g = dated({ kind: 'outcome', graceDays: 3 })
    const pushes = only('goal-review', plan({ snap: snapshot({ goals: [g] }) }))
    expect(pushes.map((p) => p.id)).toEqual([`gol:2026-11-08:${g.id}`])
  })

  it('stays away from goals not running, dates gone by, and with its switch off', () => {
    const snap = (over: object) => snapshot({ goals: [dated(over)] })
    expect(only('goal-review', plan({ snap: snap({ state: 'backlog' }) }))).toEqual([])
    expect(only('goal-review', plan({ snap: snap({ state: 'completed' }) }))).toEqual([])
    expect(only('goal-review', plan({ snap: snap({ deletedAt: '2026-10-01T00:00:00.000Z' }) }))).toEqual([])
    expect(only('goal-review', plan({ snap: snap({ targetDate: '2026-10-29' }) }))).toEqual([])
    expect(only('goal-review', plan({ snap: snap({}), prefs: { goalReviews: false } }))).toEqual([])
  })

  it('counts a time before the rollover hour for the day before, as the summary does', () => {
    const pushes = only('goal-review', plan({ snap: snapshot({ goals: [dated()] }), prefs: { summaryTime: '03:00' } }))
    expect(iso(pushes[0].fireAt)).toBe('2026-11-06T06:00:00.000Z')
  })

  it('counts toward the cap of what the app starts by itself', () => {
    const goals = [1, 2, 3, 4].map((n) => dated({ title: `Goal ${n}` }))
    const day = (p: { fireAt: number }) => wallClock(p.fireAt, SP).date
    const pushes = plan({ snap: snapshot({ goals }), prefs: { review: false } }).filter((p) => day(p) === '2026-11-05')
    expect(pushes).toHaveLength(3)
  })
})

describe('quiet hours (spec NO-22): everything waits until they end', () => {
  const quiet = { quiet: true, quietFrom: '22:00', quietTo: '07:00' }
  const late = task({ title: 'Call mum', date: '2026-11-03', time: '23:00', reminder: rem(0, 'minute') })

  it('holds a reminder until they end, keeping its id, and says when it was due from the day it arrives', () => {
    const [plain] = only('reminder', plan({ snap: snapshot({ tasks: [late] }) }))
    const [held] = only('reminder', plan({ snap: snapshot({ tasks: [late] }), prefs: quiet }))
    expect(iso(held.fireAt)).toBe('2026-11-04T10:00:00.000Z')
    expect(held.id).toBe(plain.id)
    expect(held.message.body).toBe('Yesterday, 23:00')
    expect(held.message.url).toContain(`at=${held.fireAt}`)
  })

  it('holds the morning summary too, and leaves alone what falls outside', () => {
    const snap = snapshot({ tasks: [task({ date: '2026-11-03' })] })
    const at630 = only('summary', plan({ snap, prefs: { ...quiet, summaryTime: '06:30' } }))
    expect(iso(at630.find((p) => p.id === 'sum:2026-11-03')!.fireAt)).toBe('2026-11-03T10:00:00.000Z')
    const at8 = only('summary', plan({ snap, prefs: quiet }))
    expect(iso(at8.find((p) => p.id === 'sum:2026-11-03')!.fireAt)).toBe('2026-11-03T11:00:00.000Z')
  })

  it('works within a day too, and does nothing when they start and end together or are off', () => {
    const midday = task({ date: '2026-11-03', time: '14:00', reminder: rem(0, 'minute') })
    const [held] = only('reminder', plan({ snap: snapshot({ tasks: [midday] }), prefs: { quiet: true, quietFrom: '13:00', quietTo: '15:00' } }))
    expect(iso(held.fireAt)).toBe('2026-11-03T18:00:00.000Z')
    const [same] = only('reminder', plan({ snap: snapshot({ tasks: [midday] }), prefs: { quiet: true, quietFrom: '13:00', quietTo: '13:00' } }))
    expect(iso(same.fireAt)).toBe('2026-11-03T17:00:00.000Z')
    const [off] = only('reminder', plan({ snap: snapshot({ tasks: [midday] }), prefs: { quiet: false, quietFrom: '13:00', quietTo: '15:00' } }))
    expect(iso(off.fireAt)).toBe('2026-11-03T17:00:00.000Z')
  })

  it('keeps what it holds when the phone plans again during the night', () => {
    const c = commitment(goal())
    const p = prep(c, { title: 'Pack the bag', fireWeekdays: [2], fireTime: '23:30', reminder: rem(0, 'minute') })
    const night = at('2026-11-04', '01:00')
    const snap = snapshot({ goals: [goal({ id: c.goalId })], commitments: [c], preps: [p], tasks: [late] })
    const ids = only('reminder', plan({ snap, now: night, prefs: quiet })).filter((x) => iso(x.fireAt) === '2026-11-04T10:00:00.000Z')
    expect(ids).toHaveLength(2)
  })

  it('finds a held reminder for "Now" at the time it arrived', () => {
    const input = { snap: snapshot({ tasks: [late] }), prefs: { ...DEFAULT_PREFS, ...quiet }, now, timeZone: SP, rolloverHour: 4 }
    const arrived = at('2026-11-04', '07:00')
    expect(remindedRows(input, arrived - 60_000, arrived + 60_000)).toEqual([`task:${late.id}`])
    expect(remindedRows(input, at('2026-11-03', '22:59'), at('2026-11-03', '23:01'))).toEqual([])
  })
})

describe('details on the lock screen off (spec NO-21)', () => {
  const g = goal({ title: 'Run a 10k', targetDate: '2026-11-05' })
  const snap = snapshot({ goals: [g], tasks: [task({ title: 'Call mum', date: '2026-11-03', reminder: rem(0, 'day') })] })

  it('says only the kind, and still opens the same place', () => {
    const on = plan({ snap })
    const off = plan({ snap, prefs: { details: false } })
    const of = (list: typeof on, kind: string) => only(kind, list)[0].message
    expect(of(off, 'reminder')).toMatchObject({ title: 'Reminder', body: '', url: of(on, 'reminder').url })
    expect(of(off, 'summary')).toMatchObject({ title: 'Morning summary', body: '' })
    expect(of(off, 'review')).toMatchObject({ title: 'Weekly review', body: '' })
    expect(of(off, 'goal-review')).toMatchObject({ title: 'Goal review date', body: '', url: `/goals/${g.id}` })
  })

  it("leaves no name in what's sent", () => {
    const text = JSON.stringify(plan({ snap, prefs: { details: false } }).map((p) => [p.message.title, p.message.body]))
    expect(text).not.toContain('Call mum')
    expect(text).not.toContain('Run a 10k')
    expect(text).not.toContain('1 thing')
  })
})

describe('app icon badge (spec NO-20)', () => {
  const snap = snapshot({
    tasks: [
      task({ title: 'Late', date: '2026-10-28' }),
      task({ title: 'Today', date: '2026-10-30', reminder: rem(0, 'day') }),
      task({ title: 'Later', date: '2026-11-03', reminder: rem(0, 'day') }),
    ],
  })

  it("is off to start with: what's sent has no number", () => {
    expect(plan({ snap }).every((p) => !('badge' in p.message))).toBe(true)
  })

  it('counts late + left on the day the push arrives', () => {
    const pushes = plan({ snap, prefs: { badge: true, summaryTime: '10:00' } })
    const sum = (day: string) => pushes.find((p) => p.id === `sum:${day}`)!.message
    expect(sum('2026-10-31').badge).toBe(2)
    expect(sum('2026-11-03').badge).toBe(3)
    expect(openCount(snap, '2026-10-31', 4)).toBe(2)
  })

  it('leaves out tasks with no date', () => {
    expect(openCount(snapshot({ tasks: [task({ title: 'Someday' })] }), '2026-10-31', 4)).toBe(0)
  })
})
