import { num, t, tk, tn, type Key } from '../i18n'
import { addDays, dayMonth, diffDays } from './dates'
import { periodWord } from './describe'
import { emptyGoalDraft, type GoalDraft, type PrepDraft } from './draft'
import type { DateStr, MissReason } from './types'

/**
 * First-run personalization, as plain lookup tables: the areas someone picks
 * choose which example goals, values and "why" placeholders they're offered.
 * The text comes from the current language each time it's read.
 */

export type Area = 'health' | 'work' | 'study' | 'money' | 'people' | 'create' | 'mind' | 'home'

export interface AreaInfo {
  key: Area
  label: string
  /** The value suggested in the R step. */
  value: string
  why: string
  title: string
}

const area = (key: Area): AreaInfo => ({
  key,
  get label() { return tk(`area.${key}` as Key) },
  get value() { return tk(`area.${key}.value` as Key) },
  get why() { return tk(`area.${key}.why` as Key) },
  get title() { return tk(`area.${key}.title` as Key) },
})

export const AREAS: AreaInfo[] = (['health', 'work', 'study', 'money', 'people', 'create', 'mind', 'home'] as const).map(area)

export const areaInfo = (a: Area) => AREAS.find((x) => x.key === a)!

export interface Example {
  key: string
  area: Area
  title: string
  /** Fields set on top of an empty draft. */
  draft: Partial<GoalDraft>
  /** Finish lines: deadline this many months after the start. */
  months?: number
}

const text = (key: string, part = '') => tk(`example.${key}${part}` as Key)

/** An example's wording (title, what counts, short name) comes from the language files. */
function example(key: string, area: Area, shape: (key: string) => Partial<GoalDraft>, months?: number): Example {
  return {
    key, area, months,
    get title() { return text(key) },
    get draft() { return shape(key) },
  }
}

const rhythm = (times: number) => (key: string): Partial<GoalDraft> => ({
  goalKind: 'habit', shape: 'rhythm', checkinType: 'binary', period: 'week', times,
  measurementDefinition: text(key, '.what'), label: text(key, '.short'),
})
const finish = (graceDays: number) => (key: string): Partial<GoalDraft> => ({ goalKind: 'outcome', doneWhen: text(key, '.what'), graceDays })

export const EXAMPLES: Example[] = [
  example('exercise', 'health', rhythm(3)),
  example('sleep', 'health', (key) => ({
    goalKind: 'habit', shape: 'threshold', checkinType: 'quantity', period: 'day', comparator: 'gte',
    targetValue: num(7.5), unit: text(key, '.unit'), measurementDefinition: text(key, '.what'), label: text(key, '.short'),
  })),
  example('job', 'work', finish(30), 6),
  example('focus', 'work', rhythm(4)),
  example('study', 'study', rhythm(4)),
  example('course', 'study', finish(14), 3),
  example('fund', 'money', finish(61), 12),
  example('spending', 'money', rhythm(1)),
  example('family', 'people', rhythm(1)),
  example('ontime', 'people', (key) => ({
    goalKind: 'habit', shape: 'standard', checkinType: 'timestamp', period: 'week',
    measurementDefinition: text(key, '.what'), label: text(key, '.short'),
  })),
  example('practise', 'create', rhythm(4)),
  example('project', 'create', finish(14), 3),
  example('phone', 'mind', (key) => ({
    goalKind: 'habit', shape: 'threshold', checkinType: 'timestamp', period: 'day', comparator: 'lte',
    targetTime: '23:00', measurementDefinition: text(key, '.what'), label: text(key, '.short'),
  })),
  example('meditate', 'mind', rhythm(5)),
  example('tidy', 'home', rhythm(1)),
  example('cook', 'home', rhythm(4)),
]

/** Not tied to an area: fills the list when few areas are picked. */
const READ: Example = example('read', 'study', rhythm(3))

export const exampleByKey = (key: string) => [...EXAMPLES, READ].find((e) => e.key === key)

/** Three examples: the first of each picked area, then their seconds, then general ones. */
export function examplesFor(areas: Area[]): Example[] {
  const picked = AREAS.filter((a) => areas.includes(a.key)).map((a) => EXAMPLES.filter((e) => e.area === a.key))
  const out: Example[] = []
  const add = (e?: Example) => e && out.length < 3 && !out.includes(e) && out.push(e)
  picked.forEach((list) => add(list[0]))
  picked.forEach((list) => add(list[1]))
  for (const key of ['exercise', 'sleep', 'read']) add(exampleByKey(key))
  return out
}

export function addMonths(d: DateStr, n: number): DateStr {
  const [y, m, day] = d.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** A full draft from an example, keeping the chosen start date. */
export function draftFromExample(e: Example, startDate: DateStr): GoalDraft {
  return {
    ...emptyGoalDraft(startDate),
    ...e.draft,
    title: e.title,
    targetDate: e.months ? addMonths(startDate, e.months) : '',
  }
}

/** The same four reasons asked on Today, each with a prep that usually helps. */
const obstacle = (reason: MissReason, label: Key, title: Key, fireWeekdays: number[], fireTime: string) => ({
  reason,
  get label() { return tk(label) },
  get prep(): PrepDraft { return { title: tk(title), fireWeekdays, fireTime } },
})

export const OBSTACLE_PREPS: { reason: MissReason; label: string; prep: PrepDraft }[] = [
  obstacle('forgot', 'reason.forgot', 'obstacle.forgot', [1, 2, 3, 4, 5], '21:00'),
  obstacle('no_time', 'reason.noTime', 'obstacle.noTime', [7], '20:00'),
  obstacle('too_tired', 'reason.tooTired', 'obstacle.tooTired', [1, 2, 3, 4, 5], '21:00'),
  obstacle('chose_other', 'reason.choseOther', 'obstacle.choseOther', [7], '20:00'),
]

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/** "At 80%, missing 1 in 5 still counts as on track." */
export function toleranceLine(pct: number): string {
  if (pct >= 100) return t('intro.toleranceAll')
  const miss = 100 - pct
  const g = gcd(miss, 100)
  return t('intro.toleranceLine', { pct, miss: miss / g, of: 100 / g })
}

/** Plain arithmetic on the plan: what keeping it adds up to by the review date (or 3 months). */
export function projection(d: GoalDraft, today: DateStr): string {
  if (d.goalKind === 'outcome') {
    if (!d.targetDate) return ''
    const days = Math.max(0, diffDays(today, d.targetDate))
    const time = days < 14 ? tn('dates.day', days) : tn('dates.week', Math.round(days / 7))
    return t('intro.proj.deadline', { time, date: dayMonth(d.targetDate) })
  }
  if (d.shape === 'standard') return t('intro.proj.standard')
  const start = d.startDate > today ? d.startDate : today
  const end = d.targetDate || addMonths(start, 3)
  const days = Math.max(1, diffDays(start, addDays(end, 1)))
  const share = d.tolerancePct / 100
  const date = dayMonth(end)
  if (d.shape === 'rhythm') {
    const periods = d.period === 'month' ? days / 30.44 : d.period === 'day' ? days : days / 7
    const total = Math.max(1, Math.round(d.times * periods * share))
    return t('intro.proj.rhythm', { n: d.times, period: periodWord(d.period), pct: d.tolerancePct, total, date })
  }
  const periods = d.period === 'month' ? days / 30.44 : d.period === 'week' ? days / 7 : days
  const n = Math.max(1, Math.round(periods * share))
  const plural = ({ month: 'chart.unit.months', week: 'chart.unit.weeks', day: 'chart.unit.days' } as const)[d.period]
  return t('intro.proj.threshold', { n, unit: n === 1 ? periodWord(d.period) : t(plural), date })
}
