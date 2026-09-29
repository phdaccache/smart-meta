import { describe, expect, it } from 'vitest'
import {
  addDays, diffDays, isDateStr, isoWeekday, logicalDate, minutesIntoDay, parseTime, periodOf, periodsBetween,
  relativeDay, weekdaysLabel,
} from './dates'

describe('logicalDate (04:00 rollover)', () => {
  const at = (iso: string) => new Date(iso) // local time, no Z

  it('keeps a 01:00 check-in on the evening it belongs to', () => {
    expect(logicalDate(at('2026-09-24T01:00:00'), 4)).toBe('2026-09-23')
  })
  it('switches exactly at the offset', () => {
    expect(logicalDate(at('2026-09-24T03:59:59'), 4)).toBe('2026-09-23')
    expect(logicalDate(at('2026-09-24T04:00:00'), 4)).toBe('2026-09-24')
  })
  it('behaves like midnight when the offset is 0', () => {
    expect(logicalDate(at('2026-09-24T00:05:00'), 0)).toBe('2026-09-24')
  })
  it('crosses month and year boundaries', () => {
    expect(logicalDate(at('2027-01-01T02:00:00'), 4)).toBe('2026-12-31')
    expect(logicalDate(at('2026-03-01T02:00:00'), 4)).toBe('2026-02-28')
  })
  it('uses wall-clock hours, so a DST night still rolls over at 04:00', () => {
    // Whatever the machine's zone, getHours() reports wall-clock time.
    const d = new Date(2026, 2, 29, 3, 30) // 29 Mar 2026, EU spring-forward night
    expect(logicalDate(d, 4)).toBe('2026-03-28')
    const e = new Date(2026, 9, 25, 4, 30) // 25 Oct 2026, EU fall-back day
    expect(logicalDate(e, 4)).toBe('2026-10-25')
  })
})

describe('date arithmetic', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('diffs across DST changes in whole days', () => {
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })
  it('validates date strings', () => {
    expect(isDateStr('2026-02-29')).toBe(false)
    expect(isDateStr('2028-02-29')).toBe(true)
    expect(isDateStr('2026-9-1')).toBe(false)
  })
  it('numbers weekdays ISO-style', () => {
    expect(isoWeekday('2026-09-28')).toBe(1) // Monday
    expect(isoWeekday('2026-10-04')).toBe(7) // Sunday
  })
})

describe('periods', () => {
  it('weeks run Monday → Sunday', () => {
    expect(periodOf('2026-09-30', 'week')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    expect(periodOf('2026-10-04', 'week')).toEqual({ start: '2026-09-28', end: '2026-10-04' })
    expect(periodOf('2026-10-05', 'week')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
  })
  it('months know their length', () => {
    expect(periodOf('2028-02-10', 'month')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(periodOf('2026-12-31', 'month')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
  it('lists every period touching a range', () => {
    expect(periodsBetween('2026-09-30', '2026-10-06', 'week')).toHaveLength(2)
    expect(periodsBetween('2026-09-30', '2026-10-06', 'day')).toHaveLength(7)
    expect(periodsBetween('2026-09-30', '2026-10-06', 'month')).toHaveLength(2)
    expect(periodsBetween('2026-10-06', '2026-09-30', 'day')).toHaveLength(0)
  })
})

describe('time of day', () => {
  it('parses and rejects', () => {
    expect(parseTime('23:30')).toBe(1410)
    expect(parseTime('7:05')).toBe(425)
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('nope')).toBeNull()
  })
  it('orders 00:30 after 23:30 within a 04:00 day', () => {
    expect(minutesIntoDay(30, 4)).toBeGreaterThan(minutesIntoDay(1410, 4))
    expect(minutesIntoDay(240, 4)).toBe(0)
  })
})

describe('labels', () => {
  it('describes relative days and weekday sets', () => {
    expect(relativeDay('2026-10-01', '2026-09-30')).toBe('tomorrow')
    expect(relativeDay('2026-10-02', '2026-09-30')).toBe('Fri')
    expect(relativeDay('2026-10-20', '2026-09-30')).toBe('20 Oct')
    expect(weekdaysLabel([3, 5])).toBe('Wed, Fri')
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('weekdays')
  })
})
