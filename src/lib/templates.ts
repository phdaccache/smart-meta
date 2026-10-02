import { t, tk, tn, type Key } from '../i18n'
import { addDays, capitalize } from './dates'
import { periodWord } from './describe'
import { emptyCommitmentDraft, emptyGoalDraft, type CommitmentDraft, type GoalDraft, type PrepDraft } from './draft'
import { addMonths, AREAS, areaInfo, type Area } from './intro'
import type { DateStr, Period } from './types'

/**
 * Ready-made goals to start from, in the spirit of the sample data: a goal
 * with its habit and preps, and for the bigger ones the supporting habits and
 * projects that make them real. Everything comes filled in, a generic why
 * included, so a template can be saved as is and adjusted later. Their text
 * lives in the language files under `tpl.<key>`.
 */

type Shape = Pick<CommitmentDraft, 'shape' | 'checkinType' | 'period' | 'times' | 'targetValue' | 'targetTime' | 'comparator'>

interface PrepSpec { days: number[]; time: string }

interface HabitSpec {
  /** Text under tpl.<template>.<id>: .what, .short, and .prep when it has one. */
  id: string
  shape: Partial<Shape>
  /** Starts this many days after the goal, so there's time to prepare first. */
  startIn?: number
  prep?: PrepSpec
}

interface ProjectSpec {
  /** Text under tpl.<template>.<id> (the outcome) and .<id>.steps (steps separated by |). */
  id: string
  /** Target date, days from the start. */
  days: number
}

interface Spec {
  key: string
  area: Area
  /** Months until the review date (habits) or the deadline (finish lines). */
  months: number
  tolerancePct?: number
  /** A habit goal's own commitment. Absent: a finish line, with tpl.<key>.what as its yes/no question. */
  habit?: Omit<HabitSpec, 'id' | 'startIn'>
  graceDays?: number
  /** Finish lines: the habits that support them. */
  habits?: HabitSpec[]
  projects?: ProjectSpec[]
}

const rhythm = (times: number, period: Period = 'week'): Partial<Shape> => ({ shape: 'rhythm', checkinType: 'binary', period, times })
const W = [1, 2, 3, 4, 5]
const ALL = [1, 2, 3, 4, 5, 6, 7]

const SPECS: Spec[] = [
  // health
  { key: 'gym', area: 'health', months: 3, habit: { shape: rhythm(3), prep: { days: [7, 2, 4], time: '21:00' } } },
  {
    key: 'sleep', area: 'health', months: 3, tolerancePct: 70,
    habit: { shape: { shape: 'threshold', checkinType: 'quantity', period: 'day', comparator: 'gte' }, prep: { days: ALL, time: '23:00' } },
  },
  {
    key: 'run', area: 'health', months: 4, graceDays: 14,
    habits: [{ id: 'h1', shape: rhythm(3), prep: { days: [1, 3, 5], time: '21:00' } }],
    projects: [{ id: 'p1', days: 14 }],
  },
  // work
  {
    key: 'job', area: 'work', months: 6, graceDays: 30, tolerancePct: 70,
    habits: [
      { id: 'h1', shape: rhythm(3), startIn: 21, prep: { days: [7], time: '20:00' } },
      { id: 'h2', shape: rhythm(1), prep: { days: [1], time: '21:00' } },
    ],
    projects: [{ id: 'p1', days: 21 }, { id: 'p2', days: 42 }],
  },
  { key: 'focus', area: 'work', months: 3, habit: { shape: rhythm(4), prep: { days: [7, 1, 2, 3], time: '18:00' } } },
  // study
  { key: 'read', area: 'study', months: 12, tolerancePct: 75, habit: { shape: rhythm(4), prep: { days: [1, 2, 3, 4], time: '21:00' } } },
  {
    key: 'course', area: 'study', months: 3, graceDays: 14,
    habits: [{ id: 'h1', shape: rhythm(3), prep: { days: [7], time: '19:00' } }],
    projects: [{ id: 'p1', days: 7 }],
  },
  // money
  {
    key: 'fund', area: 'money', months: 12, graceDays: 61,
    habits: [{ id: 'h1', shape: rhythm(1, 'month') }, { id: 'h2', shape: rhythm(1) }],
    projects: [{ id: 'p1', days: 14 }],
  },
  { key: 'spending', area: 'money', months: 3, habit: { shape: rhythm(1), prep: { days: [7], time: '19:00' } } },
  // people
  { key: 'family', area: 'people', months: 3, habit: { shape: rhythm(1), prep: { days: [6], time: '10:00' } } },
  {
    key: 'ontime', area: 'people', months: 3, tolerancePct: 90,
    habit: { shape: { shape: 'standard', checkinType: 'timestamp', period: 'week' }, prep: { days: [7, 1, 2, 3, 4], time: '22:00' } },
  },
  // create
  { key: 'practise', area: 'create', months: 3, tolerancePct: 75, habit: { shape: rhythm(4) } },
  {
    key: 'create', area: 'create', months: 3, graceDays: 14,
    habits: [{ id: 'h1', shape: rhythm(3) }],
    projects: [{ id: 'p1', days: 30 }],
  },
  // mind
  {
    key: 'phone', area: 'mind', months: 3, tolerancePct: 75,
    habit: { shape: { shape: 'threshold', checkinType: 'timestamp', period: 'day', comparator: 'lte', targetTime: '23:00' }, prep: { days: ALL, time: '22:30' } },
  },
  { key: 'meditate', area: 'mind', months: 3, tolerancePct: 70, habit: { shape: rhythm(5), prep: { days: W, time: '07:00' } } },
  // home
  { key: 'cook', area: 'home', months: 3, tolerancePct: 70, habit: { shape: rhythm(4), prep: { days: [7], time: '17:00' } } },
  { key: 'tidy', area: 'home', months: 3, habit: { shape: rhythm(1) } },
]

export interface TemplateHabit {
  draft: CommitmentDraft
  preps: PrepDraft[]
  startIn: number
}

export interface TemplateProject {
  title: string
  steps: string[]
  days: number
}

export interface Template {
  key: string
  area: Area
  title: string
  /** The value it's usually for, offered when picking one. */
  value: string
  /** A reason that fits most people; theirs to change later. */
  why: string
  /** Everything the goal form holds, starting on `start`. */
  draft: (start: DateStr) => GoalDraft
  /** Finish lines: supporting habits, added with the goal. */
  habits: TemplateHabit[]
  projects: TemplateProject[]
  /** "3× per week · 1 prep", "Finish line · 2 habits · 2 projects". */
  summary: string
}

const text = (key: string, part: string) => tk(`tpl.${key}.${part}` as Key)
const steps = (key: string, id: string) => text(key, `${id}.steps`).split('|').map((s) => s.trim()).filter(Boolean)

function habitDraft(key: string, prefix: string, shape: Partial<Shape>): CommitmentDraft {
  const d = { ...emptyCommitmentDraft(), ...shape, measurementDefinition: text(key, `${prefix}what`), label: text(key, `${prefix}short`) }
  // A quantity's target is written the way the language writes numbers (7.5, 7,5).
  if (shape.checkinType === 'quantity') {
    d.unit = text(key, `${prefix}unit`)
    d.targetValue = text(key, `${prefix}target`)
  }
  return d
}

const prepDraft = (key: string, prefix: string, p?: PrepSpec): PrepDraft[] =>
  p ? [{ title: text(key, `${prefix}prep`), fireWeekdays: p.days, fireTime: p.time }] : []

/** "3× per week", "daily": how often a habit is, from its draft. */
export function cadenceOf(d: CommitmentDraft): string {
  if (d.shape === 'rhythm') {
    const period = periodWord(d.period)
    return d.times === 1 ? t('cadence.once', { period }) : t('cadence.times', { n: d.times, period })
  }
  if (d.shape === 'standard') return t('cadence.whenItComesUp')
  return t(d.period === 'day' ? 'cadence.daily' : d.period === 'week' ? 'cadence.weekly' : 'cadence.monthly')
}

function template(s: Spec): Template {
  const outcome = !s.habit
  return {
    key: s.key,
    area: s.area,
    get title() { return text(s.key, 'title') },
    get value() { return areaInfo(s.area).value },
    get why() { return text(s.key, 'why') },
    draft(start) {
      const base = emptyGoalDraft(start)
      const shared = { title: text(s.key, 'title'), whyText: text(s.key, 'why'), tolerancePct: s.tolerancePct ?? 80, startDate: start, targetDate: addMonths(start, s.months) }
      if (outcome) return { ...base, ...shared, goalKind: 'outcome', doneWhen: text(s.key, 'what'), graceDays: s.graceDays ?? 0 }
      return { ...base, ...habitDraft(s.key, '', s.habit!.shape), ...shared, goalKind: 'habit', preps: prepDraft(s.key, '', s.habit!.prep) }
    },
    get habits() {
      return (s.habits ?? []).map((h) => ({
        draft: habitDraft(s.key, `${h.id}.`, h.shape), preps: prepDraft(s.key, `${h.id}.`, h.prep), startIn: h.startIn ?? 0,
      }))
    },
    get projects() {
      return (s.projects ?? []).map((p) => ({ title: text(s.key, p.id), steps: steps(s.key, p.id), days: p.days }))
    },
    get summary() {
      const parts: string[] = []
      if (outcome) parts.push(t('plan.finishLine'))
      else {
        parts.push(cadenceOf(habitDraft(s.key, '', s.habit!.shape)))
        if (s.habit!.prep) parts.push(tn('tpl.preps', 1))
      }
      if (s.habits?.length) parts.push(tn('tpl.habits', s.habits.length))
      if (s.projects?.length) parts.push(tn('tpl.projects', s.projects.length))
      return capitalize(parts.join(' · '))
    },
  }
}

export const TEMPLATES: Template[] = SPECS.map(template)

export const templateByKey = (key: string) => TEMPLATES.find((x) => x.key === key)

/** The areas picked in the intro first (in the intro's order), then the rest. */
export function templatesFor(areas: string[]): { forYou: Template[]; more: { area: Area; label: string; templates: Template[] }[] } {
  const picked = AREAS.filter((a) => areas.includes(a.key))
  const forYou = picked.flatMap((a) => TEMPLATES.filter((x) => x.area === a.key))
  const more = AREAS.filter((a) => !areas.includes(a.key))
    .map((a) => ({ area: a.key, label: a.label, templates: TEMPLATES.filter((x) => x.area === a.key) }))
    .filter((g) => g.templates.length)
  return { forYou, more }
}

/** Days from the goal's start to a supporting habit's or project's date. */
export const fromStart = (start: DateStr, days: number) => addDays(start, days)
