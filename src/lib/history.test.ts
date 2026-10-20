import { describe, expect, it } from 'vitest'
import { byNewest, commitmentHistory, recentHistory } from './history'
import { commitment, goal, hit, miss, occurrence } from './testkit'
import type { Commitment, Displacement, Entry, Occurrence } from './types'

const today = '2026-09-30' // Wednesday
const ctx = { today, rolloverHour: 4 }
const T = '2026-01-01T00:00:00.000Z'
const phone: Displacement = { id: 'd1', label: 'phone', createdAt: T, updatedAt: T }
const g = goal({ startDate: '2026-09-21' })

const lines = (c: Commitment, entries: Entry[], occurrences: Occurrence[] = []) =>
  commitmentHistory(c, entries, occurrences, ctx, [phone]).sort(byNewest)
    .map((r) => `${r.date} ${r.kind} ${r.text}${r.why ? ` · ${r.why}` : ''}${r.struck ? ' (struck)' : ''}`)

describe('History — every check-in type', () => {
  it('rhythm, weekly: each tick, then how the week came out, with its reasons', () => {
    const gym = commitment(g, { label: 'gym', startDate: '2026-09-21' })
    expect(lines(gym, [
      hit(gym, '2026-09-22'), hit(gym, '2026-09-24'),
      miss(gym, '2026-09-27', { missReason: 'chose_other', displacementId: 'd1' }),
      hit(gym, '2026-09-28'), hit(gym, '2026-09-29'), hit(gym, '2026-09-30'),
    ])).toEqual([
      '2026-09-30 hit gym: 3 of 3 that week', // reached while the week is still running
      '2026-09-30 hit gym', '2026-09-29 hit gym', '2026-09-28 hit gym',
      '2026-09-27 miss gym: 2 of 3 that week · phone',
      '2026-09-24 hit gym', '2026-09-22 hit gym',
    ])
  })

  it('rhythm, daily: ticks, and a ✕ for a day not done', () => {
    const med = commitment(g, { label: 'meditate', startDate: '2026-09-27', cadence: { period: 'day', times: 1 } })
    expect(lines(med, [hit(med, '2026-09-27'), miss(med, '2026-09-28', { missReason: 'forgot' })])).toEqual([
      '2026-09-29 miss meditate · not done',
      '2026-09-28 miss meditate · not done · forgot',
      '2026-09-27 hit meditate',
    ])
  })

  it('threshold yes/no: a tick, or a ✕ for a day not ticked; an undone tick is struck', () => {
    const sugar = commitment(g, { label: 'no sugar', shape: 'threshold', startDate: '2026-09-28', cadence: { period: 'day', times: 1 } })
    const tick = hit(sugar, '2026-09-28')
    expect(lines(sugar, [tick, hit(sugar, '2026-09-29', { id: 'x' }), { ...miss(sugar, '2026-09-29'), outcome: 'void', supersedes: 'x' }]))
      .toEqual(['2026-09-29 miss no sugar · not done', '2026-09-29 undone no sugar (struck)', '2026-09-28 hit no sugar'])
  })

  it('daily amount: the value, a correction struck, the reason on the value, and a day with nothing', () => {
    const sleep = commitment(g, {
      label: 'sleep', shape: 'threshold', checkinType: 'quantity', cadence: { period: 'day', times: 1 },
      targetValue: 8, comparator: 'gte', unit: 'h', startDate: '2026-09-27',
    })
    const six = miss(sleep, '2026-09-28', { id: 'six', value: 6 })
    expect(lines(sleep, [
      hit(sleep, '2026-09-27', { value: 8 }),
      six, miss(sleep, '2026-09-28', { value: 5, supersedes: 'six', recordedAt: '2026-09-28T13:00:00.000Z' }),
      miss(sleep, '2026-09-28', { missReason: 'too_tired' }),
    ])).toEqual([
      '2026-09-29 miss sleep · nothing logged',
      '2026-09-28 miss sleep 5 h · too tired',
      '2026-09-28 undone sleep 6 h (struck)',
      '2026-09-27 hit sleep 8 h',
    ])
  })

  it('daily time: late is a ✕ with its reason', () => {
    const bed = commitment(g, {
      label: 'bedtime', shape: 'threshold', checkinType: 'timestamp', cadence: { period: 'day', times: 1 },
      targetValue: 23 * 60, comparator: 'lte', startDate: '2026-09-29',
    })
    expect(lines(bed, [miss(bed, '2026-09-29', { value: 23 * 60 + 40 }), miss(bed, '2026-09-29', { missReason: 'chose_other', displacementId: 'd1' })]))
      .toEqual(['2026-09-29 miss bedtime 23:40 · phone'])
  })

  it('weekly amount: each value adds, neither ✓ nor ✕; the week’s total decides', () => {
    const run = commitment(g, {
      label: 'run', shape: 'threshold', checkinType: 'quantity', cadence: { period: 'week', times: 1 },
      targetValue: 20, comparator: 'gte', unit: 'km', startDate: '2026-09-21',
    })
    // Stored as misses, as older versions wrote each value against the whole target.
    expect(lines(run, [
      miss(run, '2026-09-22', { value: 5 }), miss(run, '2026-09-25', { value: 8 }),
      miss(run, '2026-09-29', { value: 12 }), miss(run, '2026-09-30', { value: 9 }),
    ])).toEqual([
      '2026-09-30 hit run: 21 km that week, target ≥ 20',
      '2026-09-30 add run +9 km', '2026-09-29 add run +12 km',
      '2026-09-27 miss run: 13 km that week, target ≥ 20',
      '2026-09-25 add run +8 km', '2026-09-22 add run +5 km',
    ])
  })

  it('monthly “at most” amount: shows once it’s over, even mid-month', () => {
    const spend = commitment(g, {
      label: 'eating out', shape: 'threshold', checkinType: 'quantity', cadence: { period: 'month', times: 1 },
      targetValue: 100, comparator: 'lte', unit: 'R$', startDate: '2026-09-21',
    })
    expect(lines(spend, [hit(spend, '2026-09-22', { value: 60 }), hit(spend, '2026-09-28', { value: 50 })]))
      .toEqual(['2026-09-28 miss eating out: 110 R$ that month, target ≤ 100', '2026-09-28 add eating out +50 R$', '2026-09-22 add eating out +60 R$'])
  })

  it('rule: each occurrence by its name and times; a reason added later is not a correction', () => {
    const late = commitment(g, { label: 'punctuality', shape: 'standard', checkinType: 'timestamp' })
    const o1 = { ...occurrence(late, '2026-09-28', '09:00'), title: 'Team standup' }
    const o2 = occurrence(late, '2026-09-29', '14:00')
    const first = miss(late, o1.date, { id: 'first', occurrenceId: o1.id, value: 560 })
    expect(lines(late, [
      first, miss(late, o1.date, { occurrenceId: o1.id, value: 560, missReason: 'no_time', supersedes: 'first', recordedAt: '2026-09-29T08:00:00.000Z' }),
      hit(late, o2.date, { occurrenceId: o2.id, value: 835 }),
    ], [o1, o2])).toEqual([
      '2026-09-29 hit punctuality · 13:55, agreed 14:00',
      '2026-09-28 miss punctuality · Team standup · 09:20, agreed 09:00 · no time',
    ])
  })

  it('the card shows the last few, newest first', () => {
    const gym = commitment(g, { label: 'gym', startDate: '2026-09-21' })
    const rows = commitmentHistory(gym, [hit(gym, '2026-09-22'), hit(gym, '2026-09-23'), hit(gym, '2026-09-29')], [], ctx, [])
    expect(recentHistory(rows, today, 2).map((r) => `${r.date} ${r.text}`)).toEqual(['2026-09-29 gym', '2026-09-27 gym: 2 of 3 that week'])
  })
})
