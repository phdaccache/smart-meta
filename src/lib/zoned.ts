import type { DateStr } from './types'

/**
 * Wall clocks in a time zone, without a library: Intl knows every zone's rules, daylight saving
 * included. The planner works in the phone's zone (spec NO-14), and its tests in any zone.
 */

const formats = new Map<string, Intl.DateTimeFormat>()
function format(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
    formats.set(tz, f)
  }
  return f
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The wall clock at `ms`, as if it were UTC: the same instant number Date.UTC gives for that date and time. */
function wallMs(ms: number, tz: string): number {
  const parts = format(tz).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
}

/** The calendar day and the minutes into it at `ms`, on the clock of `tz`. */
export function wallClock(ms: number, tz: string): { date: DateStr; minutes: number } {
  const w = new Date(wallMs(ms, tz))
  return {
    date: `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`,
    minutes: w.getUTCHours() * 60 + w.getUTCMinutes(),
  }
}

/** 'HH:MM' at `ms` in `tz`. */
export function wallTime(ms: number, tz: string): string {
  const m = wallClock(ms, tz).minutes
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Wall clock minus UTC at `ms`, to the minute. */
const offset = (ms: number, tz: string) => wallMs(ms, tz) - Math.floor(ms / 60_000) * 60_000

/**
 * The instant `date` at `hhmm` happens in `tz`. A time the clocks skip (spring forward) comes as the
 * clocks show it once they've moved on (02:30 is 03:30); a time that happens twice (fall back) is the first.
 */
export function zonedTime(date: DateStr, hhmm: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, h, mi)
  // Changes of offset are months apart, so these are the offsets before and after any change near `wall`.
  const before = offset(wall - 36 * 3_600_000, tz)
  const after = offset(wall + 36 * 3_600_000, tz)
  const fits = [wall - before, wall - after].filter((ms) => wallMs(ms, tz) === wall)
  return fits.length ? Math.min(...fits) : wall - before
}

/** The phone's own time zone (an IANA name), or UTC when the browser won't say. */
export const phoneTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
