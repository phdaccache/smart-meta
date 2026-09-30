import type { DateStr, Period } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The day actually being lived. Before `rolloverHour` (local wall clock) it is
 * still yesterday, so a 01:00 check-in lands on the evening it belongs to.
 * Uses wall-clock hours, so DST transitions cannot shift the boundary.
 */
export function logicalDate(now: Date, rolloverHour: number): DateStr {
  const today = toDateStr(now)
  return now.getHours() < rolloverHour ? addDays(today, -1) : today
}

function parse(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function format(d: Date): DateStr {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function isDateStr(s: unknown): s is DateStr {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && format(parse(s)) === s
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parse(s)
  d.setUTCDate(d.getUTCDate() + n)
  return format(d)
}

/** b − a, in whole days. */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(s: DateStr): number {
  const day = parse(s).getUTCDay()
  return day === 0 ? 7 : day
}

export const minDate = (a: DateStr, b: DateStr) => (a < b ? a : b)
export const maxDate = (a: DateStr, b: DateStr) => (a > b ? a : b)

export interface Span {
  start: DateStr
  end: DateStr
}

/** Weeks start on Monday. */
export function periodOf(s: DateStr, period: Period): Span {
  if (period === 'day') return { start: s, end: s }
  if (period === 'week') {
    const start = addDays(s, 1 - isoWeekday(s))
    return { start, end: addDays(start, 6) }
  }
  const d = parse(s)
  const start = format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
  const end = format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
  return { start, end }
}

export function spanDays(p: Span): number {
  return diffDays(p.start, p.end) + 1
}

/** All periods that intersect [from, to], in order. */
export function periodsBetween(from: DateStr, to: DateStr, period: Period): Span[] {
  const out: Span[] = []
  if (from > to) return out
  let p = periodOf(from, period)
  while (p.start <= to) {
    out.push(p)
    p = periodOf(addDays(p.end, 1), period)
  }
  return out
}

export function inSpan(s: DateStr, p: Span): boolean {
  return s >= p.start && s <= p.end
}

// ——— time of day ———

export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * Minutes since the start of the logical day, so 00:30 sorts after 23:30
 * when the day runs 04:00 → 04:00.
 */
export function minutesIntoDay(minutes: number, rolloverHour: number): number {
  return (((minutes - rolloverHour * 60) % 1440) + 1440) % 1440
}

export function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

// ——— display ———

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const weekdayName = (s: DateStr) => WEEKDAYS[isoWeekday(s) - 1]
export const weekdayShort = (iso: number) => WEEKDAYS[iso - 1].slice(0, 3)
export const monthName = (s: DateStr) => MONTHS[Number(s.slice(5, 7)) - 1]

export function dayMonth(s: DateStr): string {
  return `${Number(s.slice(8, 10))} ${monthName(s)}`
}

/** "today", "tomorrow", "Fri", or "3 Oct", relative to `today`. */
export function relativeDay(s: DateStr, today: DateStr): string {
  const d = diffDays(today, s)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  if (Math.abs(d) < 7) return weekdayName(s).slice(0, 3)
  return `${Number(s.slice(8, 10))} ${monthName(s).slice(0, 3)}`
}

/** "in 5 days", "in 3 weeks", "in 11 months", "today", or "5 days ago". */
export function untilText(date: DateStr, today: DateStr): string {
  const d = diffDays(today, date)
  if (d === 0) return 'today'
  const n = Math.abs(d)
  const unit = n < 14 ? [n, 'day'] as const : n < 60 ? [Math.round(n / 7), 'week'] as const : [Math.round(n / 30.4), 'month'] as const
  const text = `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'}`
  return d > 0 ? `in ${text}` : `${text} ago`
}

/** "Mon, Wed" or "every day" / "weekdays". */
export function weekdaysLabel(days: number[]): string {
  const sorted = [...days].sort()
  if (sorted.length === 7) return 'every day'
  if (sorted.join() === '1,2,3,4,5') return 'weekdays'
  if (sorted.join() === '6,7') return 'weekends'
  return sorted.map(weekdayShort).join(', ')
}
