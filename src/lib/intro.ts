import { addDays, dayMonth, diffDays } from './dates'
import { emptyGoalDraft, type GoalDraft, type PrepDraft } from './draft'
import type { DateStr, MissReason } from './types'

/**
 * First-run personalization, as plain lookup tables: the areas someone picks
 * choose which example goals, values and "why" placeholders they're offered.
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

export const AREAS: AreaInfo[] = [
  { key: 'health', label: 'Health & fitness', value: 'Health', why: 'So I have energy to play with my kids.', title: 'Exercise regularly' },
  { key: 'work', label: 'Work & career', value: 'Career', why: 'So I do work I’m proud of.', title: 'Get a new job' },
  { key: 'study', label: 'Studies', value: 'Growth', why: 'So I stop feeling behind.', title: 'Learn English' },
  { key: 'money', label: 'Money', value: 'Money', why: 'So an emergency never becomes a crisis.', title: 'Save for a trip' },
  { key: 'people', label: 'Family & friends', value: 'Relationships', why: 'So the people I love feel it.', title: 'Call my parents more' },
  { key: 'create', label: 'Creativity', value: 'Creativity', why: 'So the ideas in my head get out into the world.', title: 'Play guitar again' },
  { key: 'mind', label: 'Peace of mind', value: 'Peace of mind', why: 'So I end the day calm, not drained.', title: 'Less phone at night' },
  { key: 'home', label: 'Home', value: 'Home', why: 'So home feels like rest, not another to-do.', title: 'Keep the house tidy' },
]

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

const rhythm = (times: number, measurementDefinition: string, label: string): Partial<GoalDraft> => ({
  goalKind: 'habit', shape: 'rhythm', checkinType: 'binary', period: 'week', times, measurementDefinition, label,
})
const finish = (doneWhen: string, graceDays: number): Partial<GoalDraft> => ({ goalKind: 'outcome', doneWhen, graceDays })

export const EXAMPLES: Example[] = [
  { key: 'exercise', area: 'health', title: 'Exercise 3× a week', draft: rhythm(3, 'At least 30 minutes of exercise', 'exercise') },
  {
    key: 'sleep', area: 'health', title: 'Sleep 7.5 hours',
    draft: {
      goalKind: 'habit', shape: 'threshold', checkinType: 'quantity', period: 'day', comparator: 'gte',
      targetValue: '7.5', unit: 'hours', measurementDefinition: 'Slept at least 7.5 hours', label: 'sleep',
    },
  },
  { key: 'job', area: 'work', title: 'Get a new job', draft: finish('Signed an offer for a role I want', 30), months: 6 },
  { key: 'focus', area: 'work', title: 'Focused work', draft: rhythm(4, 'At least 90 minutes of work with the phone away', 'focus') },
  { key: 'study', area: 'study', title: 'Study 4× a week', draft: rhythm(4, 'At least 45 minutes of study', 'study') },
  { key: 'course', area: 'study', title: 'Finish a course', draft: finish('Got the certificate', 14), months: 3 },
  { key: 'fund', area: 'money', title: 'Build an emergency fund', draft: finish('Have 3 months of expenses saved', 61), months: 12 },
  { key: 'spending', area: 'money', title: 'Check my spending', draft: rhythm(1, 'Went through every expense of the week', 'spending') },
  { key: 'family', area: 'people', title: 'Call my family', draft: rhythm(1, 'A call of at least 15 minutes', 'call') },
  {
    key: 'ontime', area: 'people', title: 'Be on time',
    draft: { goalKind: 'habit', shape: 'standard', checkinType: 'timestamp', period: 'week', measurementDefinition: 'Arrived at or before the agreed time', label: 'punctuality' },
  },
  { key: 'practise', area: 'create', title: 'Practise 4× a week', draft: rhythm(4, 'At least 20 minutes of practice', 'practice') },
  { key: 'project', area: 'create', title: 'Finish a creative project', draft: finish('Showed the finished work to someone', 14), months: 3 },
  {
    key: 'phone', area: 'mind', title: 'Phone away at night',
    draft: {
      goalKind: 'habit', shape: 'threshold', checkinType: 'timestamp', period: 'day', comparator: 'lte',
      targetTime: '23:00', measurementDefinition: 'Phone away by 23:00', label: 'phone',
    },
  },
  { key: 'meditate', area: 'mind', title: 'Meditate', draft: rhythm(5, 'At least 10 minutes of meditation', 'meditation') },
  { key: 'tidy', area: 'home', title: 'Tidy up weekly', draft: rhythm(1, 'At least 30 minutes tidying the house', 'tidy') },
  { key: 'cook', area: 'home', title: 'Cook at home', draft: rhythm(4, 'Cooked at least one meal at home', 'cooking') },
]

/** Not tied to an area: fills the list when few areas are picked. */
const READ: Example = { key: 'read', area: 'study', title: 'Read more', draft: rhythm(3, 'Read at least 20 pages', 'reading') }

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
export const OBSTACLE_PREPS: { reason: MissReason; label: string; prep: PrepDraft }[] = [
  { reason: 'forgot', label: 'Forgot', prep: { title: 'Leave a reminder where I’ll see it', fireWeekdays: [1, 2, 3, 4, 5], fireTime: '21:00' } },
  { reason: 'no_time', label: 'No time', prep: { title: 'Block the time in my calendar', fireWeekdays: [7], fireTime: '20:00' } },
  { reason: 'too_tired', label: 'Too tired', prep: { title: 'Get it ready the night before', fireWeekdays: [1, 2, 3, 4, 5], fireTime: '21:00' } },
  { reason: 'chose_other', label: 'Chose something else', prep: { title: 'Decide the day and time in advance', fireWeekdays: [7], fireTime: '20:00' } },
]

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

/** "At 80%, missing 1 in 5 still counts as on track." */
export function toleranceLine(pct: number): string {
  if (pct >= 100) return 'At 100%, every miss puts you off track.'
  const miss = 100 - pct
  const g = gcd(miss, 100)
  return `At ${pct}%, missing ${miss / g} in ${100 / g} still counts as on track.`
}

/** Plain arithmetic on the plan: what keeping it adds up to by the review date (or 3 months). */
export function projection(d: GoalDraft, today: DateStr): string {
  if (d.goalKind === 'outcome') {
    if (!d.targetDate) return ''
    const days = Math.max(0, diffDays(today, d.targetDate))
    const span = days < 14 ? `${days} ${days === 1 ? 'day' : 'days'}` : `${Math.round(days / 7)} weeks`
    return `${span} to your deadline, ${dayMonth(d.targetDate)}.`
  }
  if (d.shape === 'standard') return 'Each time it comes up, you’ll log yes or no.'
  const start = d.startDate > today ? d.startDate : today
  const end = d.targetDate || addMonths(start, 3)
  const days = Math.max(1, diffDays(start, addDays(end, 1)))
  const t = d.tolerancePct / 100
  const by = `by ${dayMonth(end)}`
  if (d.shape === 'rhythm') {
    const periods = d.period === 'month' ? days / 30.44 : d.period === 'day' ? days : days / 7
    const n = Math.max(1, Math.round(d.times * periods * t))
    return `${d.times}× a ${d.period}, ${d.tolerancePct}% of the time: about ${n} times ${by}.`
  }
  const periods = d.period === 'month' ? days / 30.44 : d.period === 'week' ? days / 7 : days
  const n = Math.max(1, Math.round(periods * t))
  const unit = d.period === 'month' ? 'months' : d.period === 'week' ? 'weeks' : 'days'
  return `About ${n} ${n === 1 ? unit.slice(0, -1) : unit} on track ${by}.`
}
