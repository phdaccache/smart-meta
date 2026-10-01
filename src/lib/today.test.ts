import { describe, expect, it } from 'vitest'
import { measurementProblem, emptyGoalDraft, validateGoal } from './draft'
import { commitment, goal, hit, miss, prep, project, snapshot, task, value } from './testkit'
import { buildDay } from './today'
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
    const v = buildDay(done, today, ctx, { [c.id]: today }) // last week's prompt snoozed
    expect(v.groups[0].items[0].detail).toBe('2 of 3 this week')
    expect(v.groups[0].done).toBe(true)
    expect(v.open).toBe(0)
  })

  it('attaches last week’s miss prompt to the goal, and “Not now” hides it for today', () => {
    const lastWeek = { ...s, entries: [hit(c, '2026-09-21'), hit(c, '2026-09-23')] }
    expect(buildDay(lastWeek, today, ctx).groups[0].prompts).toHaveLength(1)
    expect(buildDay(lastWeek, today, ctx, { [c.id]: today }).groups[0].prompts).toHaveLength(0)
    const explained = { ...lastWeek, entries: [...lastWeek.entries, miss(c, '2026-09-27', { missReason: 'forgot' })] }
    expect(buildDay(explained, today, ctx).groups[0].prompts).toHaveLength(0)
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
