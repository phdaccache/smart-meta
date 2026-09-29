import { describe, expect, it } from 'vitest'
import { addDays, parseTime } from './dates'
import {
  activeEntries, goalPct, missPrompt, pct, scoreCommitment, statusFor, summarizeGoal,
} from './scoring'
import { commitment, goal, hit, miss, occurrence, weeklyHits } from './testkit'

// Wednesday. Weeks: 7 Sep, 14 Sep, 21 Sep closed; 28 Sep open.
const ctx = { today: '2026-09-30', rolloverHour: 4 }

describe('status bands', () => {
  it('splits on tolerance and tolerance − 15', () => {
    expect(statusFor(80, 80)).toBe('on track')
    expect(statusFor(79.9, 80)).toBe('behind')
    expect(statusFor(65, 80)).toBe('behind')
    expect(statusFor(64.9, 80)).toBe('at risk')
    expect(statusFor(null, 80)).toBeNull()
  })
})

describe('Gym — rhythm, 3× per week, tolerance 80%', () => {
  const g = goal({ startDate: '2026-09-07', tolerancePct: 80 })
  const c = commitment(g, { cadence: { period: 'week', times: 3 } })

  it('scores hits ÷ target over closed weeks, counting only what is done in the open week', () => {
    const entries = [...weeklyHits(c, '2026-09-07', [3, 3, 2, 1], addDays)]
    const s = scoreCommitment(c, entries, [], ctx)
    expect(s).toEqual({ hits: 9, expected: 10 })
    expect(statusFor(pct(s), g.tolerancePct)).toBe('on track')
  })

  it('does not punish an unfinished week', () => {
    const s = scoreCommitment(c, weeklyHits(c, '2026-09-07', [3, 3, 3, 0], addDays), [], ctx)
    expect(pct(s)).toBe(100)
  })

  it('caps extra sessions at the target so a big week cannot hide a missed one', () => {
    const s = scoreCommitment(c, weeklyHits(c, '2026-09-07', [6, 0, 3], addDays), [], ctx)
    expect(s).toEqual({ hits: 6, expected: 9 })
  })

  it('prorates a week the goal started partway through', () => {
    const late = commitment(goal({ startDate: '2026-09-10' }), { startDate: '2026-09-10' }) // Thursday
    const s = scoreCommitment(late, [hit(late, '2026-09-10'), hit(late, '2026-09-12')], [], ctx, '2026-09-07', '2026-09-13')
    expect(s.expected).toBeCloseTo((3 * 4) / 7)
    expect(pct(s)).toBe(100)
  })

  it('records a miss as a miss: no skip days', () => {
    const s = scoreCommitment(c, weeklyHits(c, '2026-09-07', [3, 1, 3], addDays), [], ctx)
    expect(statusFor(pct(s), 80)).toBe('behind') // 7/9 = 77.8
  })

  it('prompts once for last week’s shortfall until a reason is logged', () => {
    const entries = weeklyHits(c, '2026-09-07', [3, 3, 2], addDays)
    const p = missPrompt(c, entries, ctx)
    expect(p).toMatchObject({ period: 'week', slots: [{ date: '2026-09-27', count: 1 }], hits: 2, target: 3 })

    const explained = [...entries, miss(c, '2026-09-27', { missReason: 'chose_other' })]
    expect(missPrompt(c, explained, ctx)).toBeNull()
    // The reason annotates the miss; it never changes the score.
    expect(scoreCommitment(c, explained, [], ctx)).toEqual(scoreCommitment(c, entries, [], ctx))
  })

  it('does not prompt for weeks older than the lookback', () => {
    const entries = weeklyHits(c, '2026-09-07', [0, 3, 3], addDays)
    expect(missPrompt(c, entries, ctx)).toBeNull()
  })
})

describe('Punctuality — standard, per occurrence, tolerance 90%', () => {
  const g = goal({ tolerancePct: 90 })
  const c = commitment(g, {
    shape: 'standard', checkinType: 'timestamp', cadence: { period: 'day', times: 1 },
    measurementDefinition: 'Arrived at or before the agreed time',
  })

  it('scores compliance ÷ answered occurrences', () => {
    const occs = Array.from({ length: 10 }, (_, i) => occurrence(c, addDays('2026-09-10', i)))
    const entries = occs.map((o, i) =>
      i === 4 ? miss(c, o.date, { occurrenceId: o.id }) : hit(c, o.date, { occurrenceId: o.id }),
    )
    const unanswered = occurrence(c, '2026-09-29')
    const s = scoreCommitment(c, entries, [...occs, unanswered], ctx)
    expect(s).toEqual({ hits: 9, expected: 10 })
    expect(statusFor(pct(s), 90)).toBe('on track')
  })

  it('never generates miss prompts: there is no schedule to miss', () => {
    expect(missPrompt(c, [], ctx)).toBeNull()
  })
})

describe('Sleep — threshold, ≥ 8 h nightly, tolerance 70%', () => {
  const g = goal({ startDate: '2026-09-21', tolerancePct: 70 })
  const c = commitment(g, {
    shape: 'threshold', checkinType: 'quantity', cadence: { period: 'day', times: 1 },
    targetValue: 8, comparator: 'gte', unit: 'h', label: 'sleep',
  })
  const night = (date: string, h: number) => hit(c, date, { value: h, outcome: h >= 8 ? 'hit' : 'miss' })

  it('counts periods within the limit; an unlogged closed night is a miss', () => {
    // 21–29 Sep closed (9 nights): 6 logged ≥ 8, 1 logged short, 2 unlogged.
    const entries = [
      night('2026-09-21', 8), night('2026-09-22', 8.5), night('2026-09-23', 7), night('2026-09-24', 8),
      night('2026-09-26', 9), night('2026-09-27', 8), night('2026-09-29', 8),
    ]
    const s = scoreCommitment(c, entries, [], ctx)
    expect(s).toEqual({ hits: 6, expected: 9 })
    expect(statusFor(pct(s), 70)).toBe('behind')
  })

  it('leaves tonight undecided until it can no longer change', () => {
    const short = scoreCommitment(c, [night('2026-09-30', 7.5)], [], ctx, '2026-09-30')
    expect(short).toEqual({ hits: 0, expected: 0 })
    const enough = scoreCommitment(c, [night('2026-09-30', 8)], [], ctx, '2026-09-30')
    expect(enough).toEqual({ hits: 1, expected: 1 })
  })

  it('adds a nap to the night', () => {
    const s = scoreCommitment(c, [night('2026-09-28', 7), night('2026-09-28', 1)], [], ctx, '2026-09-28', '2026-09-28')
    expect(s).toEqual({ hits: 1, expected: 1 })
  })

  it('merges a lost stretch into one prompt', () => {
    const entries = [night('2026-09-23', 8), night('2026-09-24', 8), night('2026-09-25', 8), night('2026-09-26', 8)]
    const p = missPrompt(c, entries, ctx)
    expect(p?.slots.map((s) => s.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29'])
  })

  it('judges bedtime across midnight using the 04:00 day', () => {
    const bed = commitment(g, {
      shape: 'threshold', checkinType: 'timestamp', cadence: { period: 'day', times: 1 },
      targetValue: parseTime('23:30'), comparator: 'lte',
    })
    const at = (date: string, t: string) => hit(bed, date, { value: parseTime(t) })
    expect(scoreCommitment(bed, [at('2026-09-28', '23:10')], [], ctx, '2026-09-28', '2026-09-28').hits).toBe(1)
    expect(scoreCommitment(bed, [at('2026-09-28', '00:15')], [], ctx, '2026-09-28', '2026-09-28').hits).toBe(0)
  })
})

describe('entries are append-only', () => {
  const g = goal()
  const c = commitment(g)

  it('an undo is a void that supersedes', () => {
    const e = hit(c, '2026-09-29')
    const undo = hit(c, '2026-09-29', { outcome: 'void', supersedes: e.id })
    expect(activeEntries([e, undo])).toEqual([])
  })

  it('a correction replaces the value but both stay on record', () => {
    const wrong = hit(c, '2026-09-29', { value: 6 })
    const fixed = hit(c, '2026-09-29', { value: 8, supersedes: wrong.id })
    expect(activeEntries([wrong, fixed])).toEqual([fixed])
  })
})

describe('goal summary', () => {
  it('averages commitments rather than slots', () => {
    const g = goal({ startDate: '2026-09-21' })
    const weekly = commitment(g)
    const nightly = commitment(g, { shape: 'threshold', cadence: { period: 'day', times: 1 } })
    const entries = [
      ...weeklyHits(weekly, '2026-09-21', [3], addDays),
      // nightly: nothing logged → 0% over 9 closed nights
    ]
    expect(goalPct([weekly, nightly], entries, [], ctx)).toBe(50)
  })

  it('shows a bad fortnight in the recent weeks while cumulative stays on track', () => {
    const g = goal({ startDate: '2026-03-02', tolerancePct: 80 })
    const c = commitment(g, { startDate: g.startDate })
    // 28 good weeks at 3/3 (through the week of 7 Sep), then two empty weeks, then the open week.
    const good = weeklyHits(c, '2026-03-02', Array(28).fill(3), addDays)
    const s = summarizeGoal(g, [c], good, [], ctx)
    expect(s.status).toBe('on track')
    expect(s.weeks).toEqual(['on track', 'at risk', 'at risk', null])
    expect(s.recentStatus).toBe('at risk')
  })
})
