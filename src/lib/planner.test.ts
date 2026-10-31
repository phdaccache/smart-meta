import { describe, expect, it } from 'vitest'
import { inLang } from '../i18n'
import { DEFAULT_PREFS, planPushes, type PlanInput, type Prefs } from './planner'
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
    expect(p.message).toEqual({ title: 'Renew gym membership', body: 'Today, 14:30', url: `/?task=${t1.id}` })
    expect(p.id).toBe(`rem:${p.fireAt}`)
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
    expect(pushes[0].message.url).toBe(`/projects/${live.id}`)
    expect(iso(pushes[0].fireAt)).toBe('2026-11-02T11:00:00.000Z')
    const paused = snapshot({ projects: [{ ...live, state: 'backlog' }], tasks: [...steps, own] })
    expect(only('reminder', plan({ snap: paused }))).toEqual([])
  })

  it('follows each of a prep’s times, except a day it was already done', () => {
    const g = goal({ title: 'Exercise regularly' })
    const c = commitment(g, { label: 'gym' })
    const p = prep(c, { title: 'Pack the gym bag', fireWeekdays: [3, 5], fireTime: '21:00', reminder: rem(15, 'minute') })
    const snap = snapshot({ goals: [g], commitments: [c], preps: [p], entries: [hit(p, '2026-10-30', { subjectType: 'prep' })] })
    const pushes = only('reminder', plan({ snap }))
    // Wednesdays and Fridays in the next 14 days (to 13 November, 9:41), but not today's: it's done.
    expect(pushes.map((x) => wallClock(x.fireAt, SP).date)).toEqual(['2026-11-04', '2026-11-06', '2026-11-11'])
    expect(pushes[0].message).toEqual({ title: 'Pack the gym bag', body: 'Prep · Exercise regularly', url: `/goals/${g.id}` })
    expect(iso(pushes[0].fireAt)).toBe('2026-11-04T23:45:00.000Z')
  })

  it('merges reminders within 15 minutes into one push', () => {
    const tasks = [
      task({ title: 'Call the bank', date: '2026-11-03', time: '11:00', reminder: rem(0, 'minute') }),
      task({ title: 'Send the invoice', date: '2026-11-03', time: '11:10', reminder: rem(0, 'minute') }),
      task({ title: 'Lunch with Bia', date: '2026-11-03', time: '12:30', reminder: rem(0, 'minute') }),
    ]
    const pushes = only('reminder', plan({ snap: snapshot({ tasks }) }))
    expect(pushes.map((p) => p.message)).toEqual([
      { title: '2 things at 11:00', body: 'Call the bank\nSend the invoice, 11:10', url: '/' },
      { title: 'Lunch with Bia', body: 'Today, 12:30', url: `/?task=${tasks[2].id}` },
    ])
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

  it('lists timed items first, then late ones, then the rest, three names at most', () => {
    expect(iso(monday().fireAt)).toBe('2026-11-02T11:00:00.000Z')
    expect(monday().message).toEqual({
      title: 'Today: 6 things',
      body: 'Dentist appointment at 14:30, Renew gym membership (late), Gym and 3 more',
      url: '/', tag: 'summary',
    })
  })

  it('speaks the app’s language', () => {
    const pt = inLang('pt-BR', () => plan({ snap }).find((p) => p.id === 'sum:2026-11-02')!)
    expect(pt.message.title).toBe('Hoje: 6 itens')
    expect(pt.message.body).toBe('Dentist appointment às 14:30, Renew gym membership (atrasada), Gym e mais 3')
  })

  it('names just a few without “more”', () => {
    const few = snapshot({ tasks: [task({ title: 'Buy stamps' }), task({ title: 'Call mum' })] })
    expect(plan({ snap: few })[0].message).toMatchObject({ title: 'Today: 2 things', body: 'Buy stamps and Call mum' })
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
    const late = snapshot({ tasks: [task({ title: 'Pay rent', date: '2026-11-02' })] })
    const body = (time: string) => plan({ snap: late, prefs: { summaryTime: time } }).find((p) => p.id === 'sum:2026-11-03')!.message.body
    expect(body('08:00')).toBe('Pay rent (late)')
    // At 02:00 it's still 2 November in the app (the new day starts at 4:00): due today, not late.
    expect(body('02:00')).toBe('Pay rent')
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
