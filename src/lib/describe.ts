import { formatTime, monthName, weekdayName, addDays } from './dates'
import type { MissPrompt } from './scoring'
import type { Commitment, DateStr, MissReason, Period, Shape } from './types'

export const SHAPE_NAMES: Record<Shape, string> = {
  rhythm: 'Rhythm',
  standard: 'Standard',
  threshold: 'Threshold',
}

export const REASONS: { value: MissReason; label: string }[] = [
  { value: 'no_time', label: 'No time' },
  { value: 'too_tired', label: 'Too tired' },
  { value: 'forgot', label: 'Forgot' },
  { value: 'chose_other', label: 'Chose something else' },
]

export const reasonLabel = (r: MissReason) => REASONS.find((x) => x.value === r)?.label ?? r

const PER: Record<Period, string> = { day: 'day', week: 'week', month: 'month' }
const EVERY: Record<Period, string> = { day: 'daily', week: 'weekly', month: 'monthly' }

export function formatValue(c: Commitment, v: number | null | undefined): string {
  if (v == null) return '—'
  if (c.checkinType === 'timestamp') return formatTime(v)
  const n = Math.round(v * 100) / 100
  return c.unit ? `${n} ${c.unit}` : String(n)
}

/** "3× per week", "daily · ≥ 8 h", "per occurrence · by the agreed time". */
export function cadenceText(c: Commitment): string {
  if (c.shape === 'rhythm') {
    return c.cadence.times === 1 ? `once a ${PER[c.cadence.period]}` : `${c.cadence.times}× per ${PER[c.cadence.period]}`
  }
  if (c.shape === 'standard') {
    return c.checkinType === 'timestamp' ? 'when it comes up · on time or not' : 'when it comes up'
  }
  if (c.checkinType === 'binary') return EVERY[c.cadence.period]
  const cmp = c.comparator === 'lte' ? (c.checkinType === 'timestamp' ? 'by' : '≤') : c.checkinType === 'timestamp' ? 'at or after' : '≥'
  return `${EVERY[c.cadence.period]} · ${cmp} ${formatValue(c, c.targetValue)}`
}

export function promptQuestion(p: MissPrompt, c: Commitment, today: DateStr): string {
  const dates = p.slots.map((s) => s.date)
  if (p.period === 'day') {
    const name = (d: DateStr) => (d === addDays(today, -1) ? 'yesterday' : weekdayName(d))
    if (dates.length === 1) {
      const n = name(dates[0])
      return `You missed ${n === 'yesterday' ? 'yesterday' : n}’s ${c.label} — what happened?`
    }
    return `You missed ${c.label} on ${dates.map((d) => weekdayName(d).slice(0, 3)).join(', ')} — what happened?`
  }
  const when = p.period === 'week' ? 'Last week' : monthName(dates[0])
  return `${when}: ${p.hits ?? 0} of ${p.target ?? c.cadence.times} ${c.label}. What happened?`
}
