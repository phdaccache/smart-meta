import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { buildReview, projectKey, reviewPending, reviewWeek, type ReviewInput } from './review'
import { missKey } from './scoring'
import { commitment, goal, hit, miss, prep, project, snapshot, task, weeklyHits } from './testkit'
import type { Displacement, Revision, WeekReview } from './types'

const today = '2026-10-01' // Thursday; the week under review is Mon 21 – Sun 27 Sep
const ctx = { today, rolloverHour: 4 }
const T = '2026-01-01T00:00:00.000Z'

const g = goal({ title: 'Exercise regularly', startDate: '2026-08-03' })
const gym = commitment(g, { label: 'gym' })
const phone: Displacement = { id: 'd1', label: 'phone', createdAt: T, updatedAt: T }

function input(over: Partial<ReviewInput['snap']> = {}, rest: Partial<Omit<ReviewInput, 'snap'>> = {}): ReviewInput {
  return {
    snap: snapshot({ goals: [g], commitments: [gym], ...over }),
    revisions: [], displacements: [phone], weekReviews: [], ctx, goalCap: 4, ...rest,
  }
}

const revision = (field: string, day: string): Revision => ({
  id: `r-${field}-${day}`, createdAt: T, updatedAt: T, goalId: g.id, field, oldValue: '4× per week',
  newValue: '3× per week', timestamp: `${day}T12:00:00.000Z`,
})

const weekReview = (week: string, over: Partial<WeekReview> = {}): WeekReview => ({
  id: `w-${week}`, createdAt: T, updatedAt: T, week, doneAt: null, dismissed: [], ...over,
})

describe('Review — the week', () => {
  it('reviews the last full Monday–Sunday', () => {
    expect(reviewWeek(today)).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(reviewWeek('2026-09-28')).toEqual({ start: '2026-09-21', end: '2026-09-27' })
  })

  it('reports last week in plain counts, with the status before and after', () => {
    const entries = [...weeklyHits(gym, '2026-08-03', [3, 3, 3, 3, 3, 3, 3], addDays), hit(gym, '2026-09-21'), hit(gym, '2026-09-23')]
    const [card] = buildReview(input({ entries })).goals
    expect(card.lines.map((l) => l.text)).toEqual(['gym: 2 of 3'])
    expect(card.before).toBe('on track')
    expect(card.status).toBe('on track')
  })

  it('groups the week’s reasons, naming what took the place', () => {
    const entries = [
      hit(gym, '2026-09-21'),
      miss(gym, '2026-09-27', { missReason: 'chose_other', displacementId: phone.id }),
      miss(gym, '2026-09-27', { missReason: 'too_tired' }),
    ]
    const [card] = buildReview(input({ entries })).goals
    expect(card.reasons).toEqual([
      { reason: 'chose_other', count: 1, displacements: [{ label: 'phone', count: 1 }] },
      { reason: 'too_tired', count: 1, displacements: [] },
    ])
  })

  it('catches misses Today no longer asks about', () => {
    const sleep = commitment(g, { label: 'sleep', shape: 'threshold', cadence: { period: 'day', times: 1 } })
    const entries = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']
      .map((d) => hit(sleep, d))
    const r = buildReview(input({ commitments: [sleep], entries }))
    // Monday 21st is 10 days back: past Today's 7-day window, still in the reviewed week.
    expect(r.loose).toHaveLength(1)
    expect(r.loose[0].slots.map((s) => s.date)).toEqual(['2026-09-21'])
  })
})

describe('Review — suggestions', () => {
  const choseOther = (d: string) => miss(gym, d, { missReason: 'chose_other', displacementId: phone.id })

  it('“chose something else” with no prep → add a prep, naming the displacement', () => {
    const entries = [choseOther('2026-09-13'), choseOther('2026-09-20'), miss(gym, '2026-09-27', { missReason: 'no_time' })]
    const s = buildReview(input({ entries })).goals[0].suggestion
    expect(s?.kind).toBe('add_prep')
    expect(s?.evidence).toBe('2 of 3 gym misses since 31 August: chose something else (phone ×2).')
  })

  it('“chose something else” with a prep already → change the prep', () => {
    const p = prep(gym)
    const entries = [choseOther('2026-09-13'), choseOther('2026-09-20')]
    const s = buildReview(input({ entries, preps: [p] })).goals[0].suggestion
    expect(s?.kind).toBe('change_prep')
    expect(s?.prepId).toBe(p.id)
  })

  it('judges an accepted change only on what happens after it', () => {
    const p = prep(gym, { createdAt: '2026-09-21T10:00:00.000Z' }) // added after the misses
    const entries = [choseOther('2026-09-13'), choseOther('2026-09-20')]
    expect(buildReview(input({ entries, preps: [p] })).goals[0].suggestion).toBeNull()
  })

  it('“forgot” → add a prep as a cue', () => {
    const entries = [miss(gym, '2026-09-13', { missReason: 'forgot' }), miss(gym, '2026-09-27', { missReason: 'forgot' })]
    expect(buildReview(input({ entries })).goals[0].suggestion?.kind).toBe('add_prep')
  })

  it('“no time” → lower the target; after two target changes, pause instead', () => {
    const entries = [miss(gym, '2026-09-13', { missReason: 'no_time' }), miss(gym, '2026-09-27', { missReason: 'no_time' })]
    expect(buildReview(input({ entries })).goals[0].suggestion?.kind).toBe('lower_target')

    const revisions = [revision('gym how often', '2026-08-10'), revision('gym how often', '2026-08-20')]
    const s = buildReview(input({ entries }, { revisions })).goals[0].suggestion
    expect(s?.kind).toBe('pause')
    expect(s?.evidence).toContain('You’ve already changed this target twice.')
  })

  it('failing 3 of the last 4 weeks, with no reasons given → pause', () => {
    const entries = weeklyHits(gym, '2026-08-31', [1, 3, 1, 1], addDays)
    const s = buildReview(input({ entries })).goals[0].suggestion
    expect(s?.kind).toBe('pause')
    expect(s?.evidence).toBe('Below 80% in 3 of the last 4 weeks.')
  })

  it('on track every week for 8 weeks → maintenance', () => {
    const entries = weeklyHits(gym, '2026-08-03', [3, 3, 3, 3, 3, 3, 3, 3], addDays)
    expect(buildReview(input({ entries })).goals[0].suggestion?.kind).toBe('maintenance')
  })

  it('marking the week reviewed settles its suggestions', () => {
    const entries = weeklyHits(gym, '2026-08-03', [3, 3, 3, 3, 3, 3, 3, 3], addDays)
    expect(buildReview(input({ entries }, { weekReviews: [weekReview('2026-09-21', { doneAt: T })] })).goals[0].suggestion).toBeNull()
  })

  it('older weeks show results only', () => {
    const entries = weeklyHits(gym, '2026-08-03', [3, 3, 3, 3, 3, 3, 3, 3], addDays)
    const r = buildReview(input({ entries }), '2026-09-09')
    expect(r.latest).toBe(false)
    expect(r.week).toEqual({ start: '2026-09-07', end: '2026-09-13' })
    expect(r.goals[0].suggestion).toBeNull()
    expect(r.goals[0].lines[0].text).toBe('gym: 3 of 3')
  })

  it('a dismissed suggestion stays hidden for 4 weeks', () => {
    const entries = weeklyHits(gym, '2026-08-03', [3, 3, 3, 3, 3, 3, 3, 3], addDays)
    const key = `${g.id}:maintenance:`
    expect(buildReview(input({ entries }, { weekReviews: [weekReview('2026-09-14', { dismissed: [key] })] })).goals[0].suggestion).toBeNull()
    expect(buildReview(input({ entries }, { weekReviews: [weekReview('2026-08-17', { dismissed: [key] })] })).goals[0].suggestion?.kind)
      .toBe('maintenance')
  })
})

describe('Review — the rest', () => {
  it('flags projects with no step done in 3 weeks, or past their date', () => {
    const idle = project({ title: 'CV', targetDate: '2026-12-01', createdAt: '2026-08-01T00:00:00.000Z' })
    const late = project({ title: 'License', targetDate: '2026-09-15', createdAt: '2026-09-20T00:00:00.000Z' })
    const busy = project({ title: 'App', targetDate: '2026-12-01', createdAt: '2026-08-01T00:00:00.000Z' })
    const steps = [idle, late, busy].flatMap((p) => [task({ projectId: p.id }), task({ projectId: p.id })])
    const entries = [
      hit(steps[0], '2026-09-01', { subjectType: 'task' }),
      hit(steps[4], '2026-09-28', { subjectType: 'task' }),
    ]
    const r = buildReview(input({ projects: [idle, late, busy], tasks: steps, entries }))
    expect(r.stalled.map((s) => [s.project.title, s.why, s.lastDone, s.remaining])).toEqual([
      ['CV', 'idle', '2026-09-01', 1],
      ['License', 'overdue', null, 2],
    ])
  })

  it('a stalled project dealt with in this review shows what happened, then stays away', () => {
    const idle = project({ title: 'CV', createdAt: '2026-08-01T00:00:00.000Z' })
    const steps = [task({ projectId: idle.id })]
    const handledNow = buildReview(input({ projects: [idle], tasks: steps }, {
      weekReviews: [weekReview('2026-09-21', { dismissed: [projectKey(idle.id, 'moved')] })],
    }))
    expect(handledNow.stalled).toEqual([])
    expect(handledNow.handled.map((h) => h.action)).toEqual(['moved'])
    const nextWeek = buildReview(input({ projects: [idle], tasks: steps }, {
      weekReviews: [weekReview('2026-09-14', { dismissed: [projectKey(idle.id, 'dismissed')] })],
    }))
    expect(nextWeek.stalled).toEqual([])
    expect(nextWeek.handled).toEqual([])
  })

  it('skipped loose ends are never asked about again', () => {
    const sleep = commitment(g, { label: 'sleep', shape: 'threshold', cadence: { period: 'day', times: 1 } })
    const entries = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']
      .map((d) => hit(sleep, d))
    const skipped = weekReview('2026-09-21', { dismissed: [missKey(sleep.id, '2026-09-21')] })
    const r = buildReview(input({ commitments: [sleep], entries }, { weekReviews: [skipped] }))
    expect(r.loose.flatMap((p) => p.slots.map((s) => s.date))).toEqual(['2026-09-22'])
  })

  it('offers the top backlog goal when a slot is free', () => {
    const b1 = goal({ title: 'Read', state: 'backlog', priority: 2 })
    const b2 = goal({ title: 'Eat well', state: 'backlog', priority: 1 })
    const r = buildReview(input({ goals: [g, b1, b2] }, { goalCap: 2 }))
    expect(r.free).toBe(1)
    expect(r.next?.title).toBe('Eat well')
    expect(r.backlog.map((b) => b.title)).toEqual(['Eat well', 'Read'])
  })

  it('is pending until marked done, once a goal ran through the week', () => {
    expect(reviewPending([g], [], today)).toBe(true)
    expect(reviewPending([g], [weekReview('2026-09-21', { doneAt: T })], today)).toBe(false)
    expect(reviewPending([goal({ startDate: '2026-09-29' })], [], today)).toBe(false)
  })
})
