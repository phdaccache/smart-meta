import { describe, expect, it } from 'vitest'
import { asRhythm, migrateRecord } from './migrations'
import { scoreCommitment } from './scoring'
import { commitment, goal, hit } from './testkit'
import type { Commitment, Period } from './types'

const convert = (c: Commitment) => asRhythm('commitments', c as unknown as Record<string, unknown>) as unknown as Commitment

const ctx = { today: '2026-09-30', rolloverHour: 4 }

describe('Yes/no thresholds become rhythms', () => {
  const g = goal({ startDate: '2026-08-31' })
  const yesNo = (period: Period) => commitment(g, {
    shape: 'threshold', checkinType: 'binary', cadence: { period, times: 1 }, startDate: '2026-08-31',
  })

  it('once per their period, whatever they came with', () => {
    for (const period of ['day', 'week', 'month'] as const) {
      const c = convert(yesNo(period))
      expect(c).toMatchObject({ shape: 'rhythm', checkinType: 'binary', cadence: { period, times: 1 }, targetValue: null, comparator: null })
    }
  })

  // A week or month still running and already kept now counts in full, as rhythms do, not by the days gone.
  it('scores the same as before over finished periods', () => {
    const entries = (c: Commitment) => ['2026-09-01', '2026-09-02', '2026-09-08', '2026-09-20', '2026-09-30'].map((d) => hit(c, d))
    for (const period of ['day', 'week', 'month'] as const) {
      const before = yesNo(period)
      const after = convert(before)
      const later = { ...ctx, today: '2026-10-05' } // September and its weeks have ended
      expect(scoreCommitment(after, entries(after), [], later)).toEqual(scoreCommitment(before, entries(before), [], later))
    }
  })

  it('leaves everything else alone, and converts records coming in from older versions', () => {
    const amount = commitment(g, { shape: 'threshold', checkinType: 'quantity', targetValue: 8, comparator: 'gte' })
    expect(convert(amount)).toBe(amount)
    expect(asRhythm('goals', { shape: 'threshold', checkinType: 'binary' })).toEqual({ shape: 'threshold', checkinType: 'binary' })
    expect(migrateRecord<Commitment>('commitments', { ...yesNo('day') } as unknown as Record<string, unknown>, 1).shape).toBe('rhythm')
  })
})
