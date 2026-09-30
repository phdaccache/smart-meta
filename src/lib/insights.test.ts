import { describe, expect, it } from 'vitest'
import { addDays, isoWeekday } from './dates'
import {
  burnup, goalLife, goalTrend, goalsView, nearMiss, obstacles, prepare, prepEffect, toleranceCheck, valueBalance, weekdayPattern,
  yearReview, type InsightsInput,
} from './insights'
import { commitment, goal, hit, miss, occurrence, prep, project, snapshot, task, weeklyHits } from './testkit'
import type { Displacement, Entry, Revision } from './types'

const today = '2026-10-01' // Thursday; the last full week is Mon 21 – Sun 27 Sep
const ctx = { today, rolloverHour: 4 }
const T = '2026-01-01T00:00:00.000Z'

const g = goal({ title: 'Exercise regularly', startDate: '2026-06-01' })
const gym = commitment(g, { label: 'gym', createdAt: '2026-06-01T08:00:00.000Z' })

function input(over: Partial<InsightsInput['snap']> = {}, rest: Partial<Omit<InsightsInput, 'snap'>> = {}): InsightsInput {
  return { snap: snapshot({ goals: [g], commitments: [gym], ...over }), revisions: [], displacements: [], weekReviews: [], ctx, ...rest }
}

const rev = (goalId: string, field: string, oldValue: string, newValue: string, day: string): Revision => ({
  id: `r-${field}-${day}`, createdAt: T, updatedAt: T, goalId, field, oldValue, newValue, timestamp: `${day}T12:00:00.000Z`,
})

const days = (from: string, to: string) => {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

describe('Insights — a goal’s life', () => {
  it('runs from the start date until it is completed, with maintenance as its own stretch', () => {
    const revisions = [rev(g.id, 'state', 'active', 'maintenance', '2026-08-01'), rev(g.id, 'state', 'maintenance', 'completed', '2026-09-01')]
    const life = goalLife({ ...g, state: 'completed' }, revisions, today)
    expect(life.segments).toEqual([
      { start: '2026-06-01', end: '2026-08-01', state: 'active' },
      { start: '2026-08-01', end: '2026-09-01', state: 'maintenance' },
    ])
    expect(life.ended).toEqual({ date: '2026-09-01', state: 'completed' })
  })

  it('starts when a backlog goal is started, not when it was written down', () => {
    const life = goalLife(g, [rev(g.id, 'state', 'backlog', 'active', '2026-07-06')], today)
    expect(life.segments).toEqual([{ start: '2026-07-06', end: today, state: 'active' }])
    expect(life.ended).toBeNull()
  })
})

describe('Insights — goal trend', () => {
  it('shows weekly percentages up to the last full week', () => {
    const entries = weeklyHits(gym, '2026-06-01', Array(17).fill(3), addDays)
    const t = goalTrend(prepare(input({ entries })), g)!
    expect(t.points.at(-1)!.start).toBe('2026-09-21')
    expect(t.points.every((x) => x.pct === 100)).toBe(true)
    expect(t.takeaway).toBe('Steady around 100%')
  })

  it('stops at the end of a goal instead of counting empty weeks as misses', () => {
    const done = { ...g, state: 'completed' as const }
    const entries = weeklyHits(gym, '2026-06-01', Array(8).fill(3), addDays)
    const t = goalTrend(prepare(input({ goals: [done], entries }, { revisions: [rev(g.id, 'state', 'active', 'completed', '2026-07-26')] })), done)!
    expect(t.points.at(-1)!.start).toBe('2026-07-20')
    expect(t.recent).toBe(100)
  })

  it('marks a prep added later and says what changed around it', () => {
    // 1 of 3 before the prep, 3 of 3 after.
    const entries = weeklyHits(gym, '2026-06-01', [1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3], addDays)
    const bag = prep(gym, { title: 'Pack the bag', createdAt: '2026-07-27T20:00:00.000Z', updatedAt: '2026-07-27T20:00:00.000Z' })
    const t = goalTrend(prepare(input({ entries, preps: [bag] })), g)!
    expect(t.markers).toHaveLength(1)
    expect(t.markers[0]).toMatchObject({ date: '2026-07-27', kind: 'prep', text: 'Prep added: Pack the bag' })
    expect(Math.round(t.markers[0].before!)).toBe(33)
    expect(t.markers[0].after).toBe(100)
    expect(t.takeaway).toBe('Prep added: Pack the bag (27 July): 33% → 100%')
  })

  it('leaves out preps set up with the commitment', () => {
    const bag = prep(gym, { createdAt: '2026-06-01T08:05:00.000Z', updatedAt: '2026-06-01T08:05:00.000Z' })
    const t = goalTrend(prepare(input({ preps: [bag], entries: weeklyHits(gym, '2026-06-01', Array(17).fill(2), addDays) })), g)!
    expect(t.markers).toEqual([])
  })

  it('hides goals with fewer than 4 weeks of data', () => {
    const fresh = goal({ title: 'New', startDate: '2026-09-14' })
    const c = commitment(fresh)
    const v = goalsView(prepare(input({ goals: [g, fresh], commitments: [gym, c], entries: weeklyHits(gym, '2026-06-01', Array(17).fill(3), addDays) })))
    expect(v.trends.map((t) => t.goal.title)).toEqual(['Exercise regularly'])
    expect(v.tooNew.map((x) => x.title)).toEqual(['New'])
  })
})

describe('Insights — tolerance vs actual', () => {
  it('flags a bar far below reality and one far above it', () => {
    const easy = { goal: goal({ title: 'Sleep', tolerancePct: 60 }), points: [], weeksWithData: 8, recent: 95, markers: [], takeaway: '' }
    const hard = { goal: goal({ title: 'Replies', tolerancePct: 80 }), points: [], weeksWithData: 8, recent: 55, markers: [], takeaway: '' }
    const ok = { goal: goal({ title: 'Gym', tolerancePct: 80 }), points: [], weeksWithData: 8, recent: 82, markers: [], takeaway: '' }
    const r = toleranceCheck([easy, hard, ok])
    expect(r.rows.map((x) => x.band)).toEqual(['above', 'below', 'near'])
    expect(r.takeaway).toBe('“Sleep” runs well above its tolerance: the bar may be too low. “Replies” is far below: the target or the tolerance may be too ambitious.')
  })
})

describe('Insights — what gets in the way', () => {
  const phone: Displacement = { id: 'd1', label: 'phone', createdAt: T, updatedAt: T }
  const g2 = goal({ title: 'Sleep well' })
  const sleep = commitment(g2, { label: 'sleep', shape: 'threshold', cadence: { period: 'day', times: 1 } })

  it('notices a displacement that beats more than one goal', () => {
    const entries = [
      miss(gym, '2026-09-10', { missReason: 'chose_other', displacementId: 'd1' }),
      miss(gym, '2026-09-17', { missReason: 'chose_other', displacementId: 'd1' }),
      miss(sleep, '2026-09-18', { missReason: 'chose_other', displacementId: 'd1' }),
      miss(gym, '2026-09-20', { missReason: 'forgot' }),
    ]
    const o = obstacles(prepare(input({ goals: [g, g2], commitments: [gym, sleep], entries }, { displacements: [phone] })), '2026-07-01')
    expect(o.total).toBe(4)
    expect(o.reasons[0]).toMatchObject({ reason: 'chose_other', count: 3 })
    expect(o.reasons[0].goals.map((x) => x.count)).toEqual([2, 1])
    expect(o.displacements[0].goals.map((x) => [x.goal.title, x.count])).toEqual([['Exercise regularly', 2], ['Sleep well', 1]])
    expect(o.takeaway).toBe('“phone” got in the way of “Exercise regularly” and “Sleep well”. It might deserve a goal of its own.')
  })

  it('otherwise names the top reason and its usual fix', () => {
    const entries = [miss(gym, '2026-09-10', { missReason: 'forgot' }), miss(gym, '2026-09-17', { missReason: 'forgot' })]
    expect(obstacles(prepare(input({ entries })), '2026-07-01').takeaway).toBe('Most misses: forgot (2 of 2). A prep is the usual fix: a cue before the moment.')
  })
})

describe('Insights — prep effect', () => {
  // Gym on Mon/Wed/Fri; the bag packed the evening before (Sun/Tue/Thu).
  const bag = prep(gym, { fireWeekdays: [7, 2, 4], fireTime: '21:00', createdAt: '2026-06-01T08:00:00.000Z' })
  const window = (d: string) => days(d, '2026-09-27').filter((x) => [1, 3, 5].includes(isoWeekday(x)))

  it('compares the gym after packing the bag with the gym after not packing it', () => {
    const entries: Entry[] = []
    for (const d of days('2026-06-01', '2026-09-27')) {
      if (![7, 2, 4].includes(isoWeekday(d))) continue
      const packed = Number(d.slice(8)) % 3 !== 0
      if (packed) entries.push(hit(bag, d, { subjectType: 'prep' }))
      const next = addDays(d, 1)
      if (packed && next <= '2026-09-27') entries.push(hit(gym, next))
    }
    const e = prepEffect(prepare(input({ preps: [bag], entries })), bag)!
    expect(e.done.rate).toBe(100)
    expect(e.skipped.rate).toBe(0)
    expect(e.verdict).toBe('works')
    expect(window('2026-06-01').length).toBeGreaterThan(0)
  })

  it('has nothing to compare when the prep is always done', () => {
    const entries = days('2026-06-01', '2026-09-30').filter((d) => [7, 2, 4].includes(isoWeekday(d))).map((d) => hit(bag, d, { subjectType: 'prep' }))
    expect(prepEffect(prepare(input({ preps: [bag], entries })), bag)!.verdict).toBe('always')
  })
})

describe('Insights — weekday pattern and near misses', () => {
  const g2 = goal({ title: 'Sleep well', startDate: '2026-07-06' })
  const sleep = commitment(g2, {
    label: 'sleep', shape: 'threshold', checkinType: 'quantity', cadence: { period: 'day', times: 1 },
    targetValue: 7.5, comparator: 'gte', unit: 'h',
  })
  const entries = days('2026-07-06', '2026-09-30').map((d) => hit(sleep, d, { value: isoWeekday(d) === 6 ? 6.5 : 8, outcome: isoWeekday(d) === 6 ? 'miss' : 'hit' }))
  const p = prepare(input({ goals: [g2], commitments: [sleep], entries }))

  it('finds the weekday the misses fall on', () => {
    const w = weekdayPattern(p, sleep, '2026-07-06')!
    expect(w.slips).toEqual([{ weekday: 6, missed: 12, judged: 12 }])
    expect(w.days[0]).toEqual({ kept: 13, judged: 13 })
  })

  it('says how far off the misses are', () => {
    const n = nearMiss(p, sleep, '2026-07-06')!
    expect(n.kind).toBe('quantity')
    expect(n.misses).toBe(12)
    expect(n.avgGap).toBe(1)
    // Buckets start at the target, so each is all hits or all misses.
    expect(n.bins[0]).toEqual({ from: 6.5, to: 6.75, count: 12, hit: false })
    expect(n.bins.find((b) => b.from === 7.5)!.hit).toBe(true)
  })

  it('measures lateness for on-time commitments', () => {
    const g3 = goal({ title: 'Be on time', startDate: '2026-09-01' })
    const punct = commitment(g3, { label: 'punctuality', shape: 'standard', checkinType: 'timestamp', cadence: { period: 'day', times: 1 } })
    const o1 = occurrence(punct, '2026-09-08', '09:00')
    const o2 = occurrence(punct, '2026-09-15', '09:00')
    const o3 = occurrence(punct, '2026-09-22', '09:00')
    const es = [
      hit(punct, o1.date, { occurrenceId: o1.id, value: 9 * 60 + 12, outcome: 'miss' }),
      hit(punct, o2.date, { occurrenceId: o2.id, value: 9 * 60 + 8, outcome: 'miss' }),
      hit(punct, o3.date, { occurrenceId: o3.id, value: 8 * 60 + 55 }),
    ]
    const n = nearMiss(prepare(input({ goals: [g3], commitments: [punct], entries: es, occurrences: [o1, o2, o3] })), punct, '2026-09-01')!
    expect(n.kind).toBe('late')
    expect(n.values.map((v) => v.value)).toEqual([12, 8, -5])
    expect(n.avgGap).toBe(10)
    expect(n.bins.map((b) => [b.from, b.count, b.hit])).toEqual([[-10, 1, true], [-5, 0, true], [0, 0, false], [5, 1, false], [10, 1, false]])
  })
})

describe('Insights — big picture', () => {
  it('projects a project’s finish from its pace so far', () => {
    const pr = project({ title: 'System design', targetDate: '2026-10-15', createdAt: '2026-09-01T08:00:00.000Z' })
    const steps = [0, 1, 2, 3].map((i) => task({ projectId: pr.id, order: i }))
    const entries = [hit(steps[0], '2026-09-08', { subjectType: 'task' }), hit(steps[1], '2026-09-22', { subjectType: 'task' })]
    const b = burnup(prepare(input({ projects: [pr], tasks: steps, entries })), pr)
    expect(b.done).toEqual(['2026-09-08', '2026-09-22'])
    // 2 steps in 30 days: 2 more take 30 more days.
    expect(b.projected).toBe('2026-10-31')
    expect(b.status).toBe('behind')
    expect(b.text).toBe('Due 15 October · at your pace, ~31 October')
  })

  it('counts kept weeks per value, and names a value with nothing running', () => {
    const health = { id: 'v0', name: 'Health', description: '', createdAt: T, updatedAt: T }
    const freedom = { id: 'v9', name: 'Freedom', description: '', createdAt: '2026-01-02T00:00:00.000Z', updatedAt: T }
    const entries = weeklyHits(gym, '2026-06-01', Array(17).fill(3), addDays)
    const b = valueBalance(prepare(input({ values: [health, freedom], entries })))
    expect(b.months.map((m) => m.month)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'])
    expect(b.months[1].counts).toEqual([5, 0])
    expect(b.takeaway).toBe('No goal for Freedom in the last 12 weeks.')
  })

  it('puts goals with no value in their own row, left out of the takeaway', () => {
    const health = { id: 'v0', name: 'Health', description: '', createdAt: T, updatedAt: T }
    const bare = goal({ title: 'Read more', whyValueId: '', whyText: '', startDate: '2026-06-01' })
    const reading = commitment(bare, { label: 'reading' })
    const entries = [...weeklyHits(gym, '2026-06-01', Array(17).fill(3), addDays), ...weeklyHits(reading, '2026-06-01', Array(17).fill(3), addDays)]
    const b = valueBalance(prepare(input({ values: [health], goals: [g, bare], commitments: [gym, reading], entries })))
    expect(b.values.map((v) => v.name)).toEqual(['Health', 'No value'])
    expect(b.months[1].counts).toEqual([5, 5])
    expect(b.takeaway).toBe('Every value had kept weeks lately.')
  })

  it('sums up the year so far', () => {
    const done = goal({ title: 'Run a 10k', startDate: '2026-03-02', state: 'completed' })
    const runs = commitment(done, { label: 'runs' })
    const entries = [
      ...weeklyHits(gym, '2026-06-01', Array(17).fill(3), addDays),
      ...weeklyHits(runs, '2026-03-02', [3, 3, 3, 1, 1, 1, 1, 1], addDays),
    ]
    const y = yearReview(prepare(input({ goals: [g, done], commitments: [gym, runs], entries }, {
      revisions: [rev(done.id, 'state', 'active', 'completed', '2026-04-26'), rev(g.id, 'gym target', '4', '3', '2026-07-01')],
    })))
    expect(y.year).toBe(2026)
    expect(y.final).toBe(false)
    expect(y.finished.map((x) => x.title)).toEqual(['Run a 10k'])
    expect(y.started).toHaveLength(2)
    expect(y.mostKept).toMatchObject({ goal: { title: 'Exercise regularly' }, onTrack: 17, weeks: 17 })
    expect(y.bestMonth!.pct).toBe(100)
    expect(y.planChanges).toBe(1)
  })
})
