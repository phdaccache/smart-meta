import { t, tlist, tn } from '../i18n'
import { addDays, capitalize, dayMonth, diffDays, isoWeekday } from './dates'
import type { DateStr, Reminder, ReminderUnit } from './types'
import { zonedTime } from './zoned'

/**
 * Reminders set on an item's Notification card (spec NO-3; the owner's design, plan §14 S5): once only,
 * counted back from when the item is due. A date with no time is due at the morning summary's time.
 */

const r = (n: number, unit: ReminderUnit): Reminder => ({ n, unit })

/** The menu with a date and a time: "At the time" first (owner's answer 4a). */
export const TIMED_CHOICES: Reminder[] = [
  r(0, 'minute'), r(5, 'minute'), r(15, 'minute'), r(30, 'minute'), r(1, 'hour'), r(2, 'hour'),
  r(1, 'day'), r(2, 'day'), r(1, 'week'), r(1, 'month'),
]
/** The menu with a date only: "On the day" first. */
export const DATE_CHOICES: Reminder[] = [
  r(0, 'day'), r(1, 'day'), r(2, 'day'), r(1, 'week'), r(2, 'week'), r(1, 'month'), r(3, 'month'), r(6, 'month'),
]
/** Custom: 1 to this many of a unit. */
export const CUSTOM_MAX = 200
export const TIMED_UNITS: ReminderUnit[] = ['minute', 'hour', 'day', 'week', 'month']
/** With a date only, Custom counts whole days at least. */
export const DATE_UNITS: ReminderUnit[] = ['day', 'week', 'month']
/** A prep's menu (owner's pick 8b): it comes back every week, so a day before at most. */
export const PREP_CHOICES: Reminder[] = [r(0, 'minute'), r(5, 'minute'), r(15, 'minute'), r(30, 'minute'), r(1, 'hour'), r(2, 'hour'), r(1, 'day')]
export const PREP_UNITS: ReminderUnit[] = ['minute', 'hour', 'day']
/** Custom on a prep stays inside its week. */
export const PREP_MAX: Partial<Record<ReminderUnit, number>> = { hour: 24, day: 6 }

export const sameReminder = (a: Reminder | null | undefined, b: Reminder | null | undefined) =>
  !!a && !!b && a.n === b.n && (a.unit === b.unit || (a.n === 0 && b.n === 0))

/** One of the menu's own choices, rather than Custom. */
export const isPreset = (x: Reminder, menu: Reminder[]) => menu.some((c) => sameReminder(c, x))

/** Anything stored on an item is checked before it's used: another device or an older app may have written it. */
export function validReminder(x: unknown): x is Reminder {
  const v = x as Reminder | null
  return !!v && typeof v === 'object' && Number.isInteger(v.n) && v.n >= 0 && v.n <= CUSTOM_MAX
    && (TIMED_UNITS as string[]).includes(v.unit)
}

/** Months back on the calendar, kept inside the month: 31 March less a month is 28 (or 29) February. */
function monthsBefore(d: DateStr, n: number): DateStr {
  const [y, m, day] = d.split('-').map(Number)
  const total = y * 12 + (m - 1) - n
  const year = Math.floor(total / 12)
  const month = total - year * 12 + 1
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/**
 * When a reminder fires: minutes and hours before the moment it's due; days, weeks and months before on
 * the calendar, at the same time of day (so "1 day before" a 14:30 is 14:30 the day before, daylight
 * saving or not). With no time, it's due at `dayTime`.
 */
export function reminderAt(x: Reminder, date: DateStr, time: string | null | undefined, dayTime: string, tz: string): number {
  const at = time || dayTime
  if (x.unit === 'minute' || x.unit === 'hour') return zonedTime(date, at, tz) - x.n * (x.unit === 'minute' ? 60_000 : 3_600_000)
  const day = x.unit === 'day' ? addDays(date, -x.n) : x.unit === 'week' ? addDays(date, -7 * x.n) : monthsBefore(date, x.n)
  return zonedTime(day, at, tz)
}

/** "At the time", "On the day", "15 minutes before", "1 day before". */
export function reminderLabel(x: Reminder, timed: boolean): string {
  if (x.n === 0) return timed ? t('rem.atTime') : t('rem.onDay')
  return tn(`rem.before.${x.unit}`, x.n)
}

/** The menu's choices still ahead of `now`, as the menu shows them (the owner's design: past ones are left out). */
export function reminderChoices(date: DateStr, time: string | null | undefined, dayTime: string, tz: string, now: number): Reminder[] {
  return (time ? TIMED_CHOICES : DATE_CHOICES).filter((x) => reminderAt(x, date, time, dayTime, tz) > now)
}

/**
 * When it's due, said from the day the push arrives (plan §2, task text A): "Today, 14:30", "Tomorrow, 23:35",
 * a weekday within a week ("Thursday, 14:30"), then the date ("1 June"). With no time, the day alone.
 */
export function dueWhen(due: DateStr, time: string | null | undefined, from: DateStr): string {
  const d = diffDays(from, due)
  const day = d === 0 ? capitalize(t('dates.today')) : d === 1 ? capitalize(t('dates.tomorrow')) : d === -1 ? capitalize(t('dates.yesterday'))
    : d > 1 && d < 7 ? tlist('rem.weekdays')[isoWeekday(due) - 1] : dayMonth(due)
  return time ? t('rem.dueAt', { day, time }) : day
}
