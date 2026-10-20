import { describe, expect, it } from 'vitest'
import { measurementProblem, emptyGoalDraft, validateGoal } from './draft'
import { commitment, goal, hit, miss, prep, project, snapshot, task, value } from './testkit'
import { buildDay, stepDeadlines } from './today'
import { asksWhyAtOnce, missKey, type MissAsks } from './scoring'
import { addDays } from './dates'

const today = '2026-09-30' // Wednesday
const ctx = { today, rolloverHour: 4 }
const titles = (v: ReturnType<typeof buildDay>) => v.groups.flatMap((g) => g.items.map((i) => i.title))

describe('Today — Gym (rhythm)', () => {
  const health = value('Health')
  const g = goal({ whyValueId: health.id, whyText: 'So I can carry Mia on my shoulders.' })
  const c = commitment(g, { measurementDefinition: 'At least 45 minutes of exercise', label: 'gym' })
  const p = prep(c, { title: 'Pack gym bag', fireWeekdays: [3, 5] })
  const s = snapshot({ values: [health], goals: [g], commitments: [c], preps: [p] })

  it('shows the commitment every day and the prep on its chosen evenings', () => {
    expect(titles(buildDay(s, today, ctx))).toEqual(['At least 45 minutes of exercise', 'Pack gym bag'])
    expect(titles(buildDay(s, '2026-10-01', { ...ctx, today: '2026-10-01' }))).toEqual([
      'At least 45 minutes of exercise',
    ])
  })

  it('carries the why and the value on the group', () => {
    const [group] = buildDay(s, today, ctx).groups
    expect(group.eyebrow).toBe('Health · Goal')
    expect(group.why).toBe('So I can carry Mia on my shoulders.')
  })

  it('shows progress through the week and collapses once everything is done', () => {
    const done = { ...s, entries: [hit(c, '2026-09-28'), hit(c, today), hit(p, today, { subjectType: 'prep' })] }
    const v = buildDay(done, today, ctx) // last week's miss waits for the review
    expect(v.groups[0].items[0].detail).toBe('2 of 3 this week')
    expect(v.groups[0].done).toBe(true)
    expect(v.open).toBe(0)
  })

  it('leaves a weekly rhythm’s miss to the review, never Today', () => {
    const lastWeek = { ...s, entries: [hit(c, '2026-09-21'), hit(c, '2026-09-23')] }
    expect(buildDay(lastWeek, today, ctx).groups[0].prompts).toHaveLength(0)
  })
})

describe('Today — asking why', () => {
  const g = goal()
  const sleep = commitment(g, {
    shape: 'threshold', checkinType: 'quantity', label: 'sleep', cadence: { period: 'day', times: 1 },
    targetValue: 8, comparator: 'gte', unit: 'h', startDate: '2026-09-29',
  })
  const s = snapshot({ goals: [g], commitments: [sleep], entries: [miss(sleep, '2026-09-29', { value: 6 })] })
  const key = missKey(sleep.id, '2026-09-29')
  const prompts = (asks: MissAsks) => buildDay(s, today, ctx, asks).groups[0].prompts

  it('asks the next day, and “Not now” hides it for today', () => {
    expect(prompts({})).toHaveLength(1)
    expect(prompts({ [key]: { n: 1, last: today } })).toHaveLength(0)
  })

  it('put off once, asks again the next day; twice, it waits for the review', () => {
    expect(prompts({ [key]: { n: 1, last: '2026-09-29' } })).toHaveLength(1)
    expect(prompts({ [key]: { n: 2, last: '2026-09-29' } })).toHaveLength(0)
  })

  it('asks at once only for daily amounts under an “at least” line and daily times', () => {
    expect(asksWhyAtOnce(sleep)).toBe(true)
    expect(asksWhyAtOnce({ ...sleep, comparator: 'lte' })).toBe(false)
    expect(asksWhyAtOnce({ ...sleep, cadence: { period: 'week', times: 1 } })).toBe(false)
    expect(asksWhyAtOnce({ ...sleep, checkinType: 'timestamp', comparator: 'lte' })).toBe(true)
    expect(asksWhyAtOnce({ ...sleep, checkinType: 'binary' })).toBe(false)
  })

  it('a weekly amount adds up: not a to-do, done once an “at least” total is reached', () => {
    const run = { ...sleep, label: 'run', unit: 'km', targetValue: 20, cadence: { period: 'week' as const, times: 1 } }
    const some = snapshot({ goals: [g], commitments: [run], entries: [hit(run, '2026-09-28', { value: 5 })] })
    const row = buildDay(some, today, ctx).groups[0].items[0]
    expect(row.adds).toBe(true)
    expect(row.done).toBe(false)
    expect(buildDay(some, today, ctx).total).toBe(0)
    const enough = { ...some, entries: [...some.entries, hit(run, today, { value: 16 })] }
    expect(buildDay(enough, today, ctx).groups[0].items[0].done).toBe(true)
  })
})

describe('Today — Punctuality (standard)', () => {
  it('has nothing to tick: a log row, plus the prep on schedule', () => {
    const g = goal()
    const c = commitment(g, { shape: 'standard', checkinType: 'timestamp', label: 'punctuality' })
    const p = prep(c, { title: 'Leave 15 minutes early', fireWeekdays: [3] })
    const s = snapshot({ goals: [g], commitments: [c], preps: [p] })
    const v = buildDay(s, today, ctx)
    expect(titles(v)).toEqual(['Log punctuality', 'Leave 15 minutes early'])
    expect(v.total).toBe(1) // the log row is an action, not a to-do
    const thu = buildDay(s, '2026-10-01', { ...ctx, today: '2026-10-01' })
    expect(titles(thu)).toEqual(['Log punctuality'])
    expect(thu.total).toBe(0)
    expect(thu.groups[0].done).toBe(false)
  })
})

describe('Today — Driver’s license (project)', () => {
  const pr = project({ title: 'Get driver’s license' })
  const steps = ['Book theory exam', 'Study', 'Sit theory'].map((title, order) => task({ title, order, projectId: pr.id }))

  it('shows the current step only', () => {
    const v = buildDay(snapshot({ projects: [pr], tasks: steps }), today, ctx)
    expect(titles(v)).toEqual(['Book theory exam'])
    expect(v.groups[0].items[0].step).toEqual({ index: 1, total: 3 })
  })

  it('keeps a step checked today in place and reveals the next', () => {
    const entries = [hit(steps[0], today, { subjectType: 'task' })]
    expect(titles(buildDay(snapshot({ projects: [pr], tasks: steps, entries }), today, ctx))).toEqual([
      'Book theory exam', 'Study',
    ])
  })

  it('drops steps finished on earlier days', () => {
    const entries = [hit(steps[0], '2026-09-29', { subjectType: 'task' })]
    expect(titles(buildDay(snapshot({ projects: [pr], tasks: steps, entries }), today, ctx))).toEqual(['Study'])
  })

  it('nests a goal-linked project inside its goal', () => {
    const g = goal()
    const linked = { ...pr, goalId: g.id }
    const v = buildDay(snapshot({ goals: [g], projects: [linked], tasks: steps }), today, ctx)
    expect(v.groups).toHaveLength(1)
    expect(v.groups[0].kind).toBe('goal')
  })
})

describe('Today — Pay a friend (task)', () => {
  const t = task({ title: 'Pay Ana back' })

  it('appears, gets checked off, and is gone the next day', () => {
    expect(buildDay(snapshot({ tasks: [t] }), today, ctx).groups[0].title).toBe('Other tasks')
    const entries = [hit(t, today, { subjectType: 'task' })]
    expect(buildDay(snapshot({ tasks: [t], entries }), today, ctx).groups[0].items[0].done).toBe(true)
    const tomorrow = '2026-10-01'
    expect(buildDay(snapshot({ tasks: [t], entries }), tomorrow, { ...ctx, today: tomorrow }).groups).toHaveLength(0)
  })

  it('shows open tasks now, soonest due first, with a colored due badge', () => {
    const later = task({ title: 'Later', date: '2026-10-05' })
    const tomorrow = task({ title: 'Tomorrow', date: '2026-10-01' })
    const late = task({ title: 'Late', date: '2026-09-28' })
    const undated = task({ title: 'Whenever' })
    const v = buildDay(snapshot({ tasks: [undated, later, tomorrow, late] }), today, ctx)
    expect(titles(v)).toEqual(['Late', 'Tomorrow', 'Later', 'Whenever'])
    expect(v.groups[0].items.map((i) => i.due)).toEqual([
      { label: 'overdue · Mon', tone: 'red' },
      { label: 'due tomorrow', tone: 'yellow' },
      { label: 'due Mon', tone: 'green' },
      undefined,
    ])
  })

  it('marks a task due today red', () => {
    const v = buildDay(snapshot({ tasks: [task({ date: today })] }), today, ctx)
    expect(v.groups[0].items[0].due).toEqual({ label: 'due today', tone: 'red' })
  })
})

describe('Today — supporting habits that start later', () => {
  it('hides a commitment and its preps until its start date', () => {
    const g = goal({ kind: 'outcome' })
    const later = commitment(g, { startDate: '2026-11-30', measurementDefinition: 'Sent at least one tailored application' })
    const p = prep(later, { title: 'Pick 3 companies', fireWeekdays: [3] })
    const s = snapshot({ goals: [g], commitments: [later], preps: [p] })
    expect(buildDay(s, today, ctx).groups).toHaveLength(0)
  })
})

describe('Goals must be SMART to be saved', () => {
  it('lets a finish line stand without commitments, but not without a deadline', () => {
    const d = {
      ...emptyGoalDraft(today), goalKind: 'outcome' as const, title: 'Work at a big tech, earning 10k+',
      doneWhen: 'Signed an offer paying at least 10k a month', whyValueId: 'v', whyText: 'Career.',
    }
    expect(validateGoal(d)).toEqual({ targetDate: 'A finish line needs a deadline.' })
    expect(validateGoal({ ...d, targetDate: '2027-09-29' })).toEqual({})
    expect(validateGoal({ ...d, targetDate: '2027-09-29', doneWhen: 'I get a job offer' })).toEqual({})
    expect(validateGoal({ ...d, targetDate: '2027-09-29', doneWhen: 'Job' }).doneWhen).toBeTruthy()
  })

  it('rejects “Be more kind” and “Go to the gym”', () => {
    expect(measurementProblem('Be more kind')).not.toBeNull()
    expect(measurementProblem('Go to the gym')).not.toBeNull()
    const d = { ...emptyGoalDraft(today), title: 'Be more kind', measurementDefinition: 'Be more kind' }
    expect(validateGoal(d).measurementDefinition).toBeTruthy()
  })

  it('accepts the rewritten forms', () => {
    expect(measurementProblem('Message one friend I haven’t spoken to in a month')).toBeNull()
    expect(measurementProblem('When someone annoys me, pause before replying')).toBeNull()
    expect(measurementProblem('Did at least 45 minutes of exercise')).toBeNull()
    expect(measurementProblem('Arrived at or before the agreed time')).toBeNull()
    expect(measurementProblem('Slept at least 8 hours')).toBeNull()
  })

  it('requires a why, a value and a day to look back', () => {
    const d = {
      ...emptyGoalDraft(today), title: 'Exercise regularly', label: 'gym',
      measurementDefinition: 'Did at least 45 minutes of exercise',
    }
    const e = validateGoal(d)
    expect(Object.keys(e).sort()).toEqual(['targetDate', 'whyText', 'whyValueId'])
    expect(e.targetDate).toBe('Pick a day to look back.')
    expect(validateGoal({ ...d, whyValueId: 'v', whyText: 'Health and energy.', targetDate: addDays(today, 90) })).toEqual({})
  })
})

describe('Step end dates', () => {
  // Started 2026-10-01, due a month later: 4 steps get about a week each.
  const pr = project({ startDate: '2026-10-01', targetDate: '2026-10-29', state: 'active' })
  const steps = (dates: (string | null)[]) => dates.map((date, order) => task({ projectId: pr.id, order, date }))

  it('spreads the time equally when no step has a date', () => {
    expect(stepDeadlines(pr, steps([null, null, null, null]))).toEqual(['2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'])
  })

  it('keeps a date that was set and spreads the rest around it', () => {
    expect(stepDeadlines(pr, steps([null, '2026-10-05', null, null]))).toEqual(['2026-10-03', '2026-10-05', '2026-10-17', '2026-10-29'])
  })

  it('gives the last step the project’s date unless it has its own', () => {
    expect(stepDeadlines(pr, steps([null, '2026-11-10']))).toEqual(['2026-10-21', '2026-11-10'])
    expect(stepDeadlines(pr, steps(['2026-11-10', null]))).toEqual(['2026-11-10', '2026-11-10'])
  })

  it('shows the current step’s end date on Today as a badge', () => {
    const s = snapshot({ projects: [pr], tasks: steps([null, null, null, null]) })
    const v = buildDay(s, '2026-10-07', { ...ctx, today: '2026-10-07' })
    expect(v.groups[0].items[0].due).toEqual({ label: 'due tomorrow', tone: 'yellow' })
  })

  it('with no project date, gives a date only to steps up to the last one set', () => {
    const open = { ...pr, targetDate: null }
    expect(stepDeadlines(open, steps([null, null, null]))).toEqual([null, null, null])
    expect(stepDeadlines(open, steps([null, '2026-10-05', null]))).toEqual(['2026-10-03', '2026-10-05', null])
  })

  it('shows no badge for a project with no date, or its step with none', () => {
    const s = snapshot({ projects: [{ ...pr, targetDate: null }], tasks: steps([null, null]) })
    const v = buildDay(s, '2026-10-07', { ...ctx, today: '2026-10-07' })
    expect(v.groups[0].due).toBeUndefined()
    expect(v.groups[0].items[0].due).toBeUndefined()
  })

  it('shows a task’s time in its badge', () => {
    const s = snapshot({ tasks: [task({ title: 'Call mom', date: today, time: '21:00' })] })
    expect(buildDay(s, today, ctx).groups[0].items[0].due?.label).toBe('due today at 21:00')
  })
})

describe('A project’s own tasks', () => {
  const pr = project({ title: 'Learn to cook' })
  const step = task({ title: 'Buy a knife', projectId: pr.id, order: 0 })
  const oil = task({ title: 'Buy olive oil', forProjectId: pr.id, date: '2026-10-02' })

  it('show with the project, after its step, and not as loose tasks', () => {
    const v = buildDay(snapshot({ projects: [pr], tasks: [step, oil] }), today, ctx)
    expect(v.groups.map((g) => g.kind)).toEqual(['project'])
    expect(v.groups[0].items.map((i) => [i.title, i.kind, !!i.forProject])).toEqual([
      ['Buy a knife', 'step', false], ['Buy olive oil', 'task', true],
    ])
  })

  it('wait with a project in the backlog', () => {
    const v = buildDay(snapshot({ projects: [{ ...pr, state: 'backlog' }], tasks: [step, oil] }), today, ctx)
    expect(titles(v)).toEqual([])
  })

  it('become loose tasks if the project is gone', () => {
    const v = buildDay(snapshot({ projects: [{ ...pr, deletedAt: '2026-09-29T00:00:00.000Z' }], tasks: [oil] }), today, ctx)
    expect(v.groups.map((g) => g.kind)).toEqual(['errands'])
  })
})
