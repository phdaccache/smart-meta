import { num, t } from '../i18n'
import { addDays, capitalize, dayMonth, diffDays, formatTime, monthName, relativeDay, weekdayAbbr, weekdayName } from './dates'
import type { MissPrompt } from './scoring'
import type { Commitment, DateStr, MissReason, Period, Status } from './types'

const REASON_KEY = { no_time: 'reason.noTime', too_tired: 'reason.tooTired', forgot: 'reason.forgot', chose_other: 'reason.choseOther' } as const

export const reasonLabel = (r: MissReason) => (REASON_KEY[r] ? t(REASON_KEY[r]) : r)

/** The reason in lower case, inside a sentence. */
export const reasonLower = (r: MissReason) => (REASON_KEY[r] ? t(`${REASON_KEY[r]}.lower`) : r)

const REASON_ORDER: MissReason[] = ['no_time', 'too_tired', 'forgot', 'chose_other']

/** The miss reasons, in the order they're offered. */
export const reasons = () => REASON_ORDER.map((value) => ({ value, label: reasonLabel(value) }))

/** "on track", "behind", "at risk" in the current language. */
export const statusLabel = (s: Status) => t(({ 'on track': 'status.onTrack', behind: 'status.behind', 'at risk': 'status.atRisk' } as const)[s])

/** "day", "week", "month" as a word. */
export const periodWord = (p: Period) => t(({ day: 'period.day', week: 'period.week', month: 'period.month' } as const)[p])
const every = (p: Period) => t(({ day: 'cadence.daily', week: 'cadence.weekly', month: 'cadence.monthly' } as const)[p])

export function formatValue(c: Commitment, v: number | null | undefined): string {
  if (v == null) return '—'
  if (c.checkinType === 'timestamp') return formatTime(v)
  return c.unit ? `${num(v)} ${c.unit}` : num(v)
}

/** "3× per week", "daily · ≥ 8 h", "per occurrence · by the agreed time". */
export function cadenceText(c: Commitment): string {
  if (c.shape === 'rhythm') {
    const period = periodWord(c.cadence.period)
    return c.cadence.times === 1 ? t('cadence.once', { period }) : t('cadence.times', { n: c.cadence.times, period })
  }
  if (c.shape === 'standard') {
    return c.checkinType === 'timestamp' ? t('cadence.whenItComesUpTimed') : t('cadence.whenItComesUp')
  }
  if (c.checkinType === 'binary') return every(c.cadence.period)
  const timed = c.checkinType === 'timestamp'
  const cmp = c.comparator === 'lte' ? (timed ? t('cadence.by') : '≤') : timed ? t('cadence.atOrAfter') : '≥'
  return `${every(c.cadence.period)} · ${cmp} ${formatValue(c, c.targetValue)}`
}

/** Asked right after a daily value misses its line: "Sleep: 6 h, under your 8 h. What happened?" */
export function valueMissQuestion(c: Commitment, value: number): string {
  const key = c.checkinType === 'timestamp' ? (c.comparator === 'lte' ? 'miss.later' : 'miss.earlier') : 'miss.under'
  return capitalize(t(key, { name: c.label, value: formatValue(c, value), target: formatValue(c, c.targetValue) }))
}

export function promptQuestion(p: MissPrompt, c: Commitment, today: DateStr): string {
  const dates = p.slots.map((s) => s.date)
  // One occurrence of a rule: say which, by what it was or when.
  const which = p.occurrence?.title || p.occurrence?.time
  const name = which ? `${c.label} (${which})` : c.label
  // Weekday names only while they're unambiguous; older days get a date.
  const recent = (d: DateStr) => diffDays(d, today) < 7
  if (p.period === 'day') {
    if (dates.length === 1) {
      const d = dates[0]
      if (d === addDays(today, -1)) return t('miss.yesterday', { name })
      if (recent(d)) return t('miss.weekday', { weekday: weekdayName(d), name })
      return capitalize(t('miss.onDate', { name, date: relativeDay(d, today) }))
    }
    const days = dates.map((d) => (recent(d) ? weekdayAbbr(d) : relativeDay(d, today))).join(', ')
    return capitalize(t('miss.onDays', { name, days }))
  }
  const last = dates[dates.length - 1]
  const when = p.period === 'month' ? monthName(last)
    : diffDays(last, today) <= 7 ? t('dates.lastWeek') : t('dates.weekOf', { date: dayMonth(addDays(last, -6)) })
  // A weekly or monthly amount has no count of times to report.
  if (c.shape === 'threshold') return capitalize(t('miss.periodTarget', { when, name }))
  return capitalize(t('miss.period', { when, hits: p.hits ?? 0, target: p.target ?? c.cadence.times, name }))
}
