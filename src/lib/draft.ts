import { isDateStr, parseTime } from './dates'
import type { CheckinType, Comparator, DateStr, GoalKind, Period, Shape } from './types'

/**
 * A measurement definition must say how much, how long, when, or how often —
 * something a check-in can be judged against. "Go to the gym" and "Be more
 * kind" fail; "Did at least 45 minutes of exercise" passes. This only checks
 * structure; the wording is always the user's.
 */
const MEASURABLE =
  /\b(\d+([.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|once|twice|at least|at most|no more than|or more|or less|or fewer|less than|more than|fewer than|under|over|before|after|by|within|until|every|each|never|always|only|zero|without|any)\b|[≥≤<>%]|\d/i

export function measurementProblem(text: string): string | null {
  const t = text.trim()
  if (!t) return 'Required.'
  if (t.split(/\s+/).length < 3) return 'Too short to judge. Write it as the sentence you’ll answer yes or no to.'
  if (!MEASURABLE.test(t)) {
    return 'Not checkable yet. Add how much, how long, when, or how often — so a check-in needs no judgment call.'
  }
  return null
}

export interface PrepDraft {
  title: string
  fireWeekdays: number[]
  fireTime: string
}

export interface CommitmentDraft {
  shape: Shape
  label: string
  measurementDefinition: string
  checkinType: CheckinType
  period: Period
  times: number
  /** Quantity threshold. Kept as typed text until save. */
  targetValue: string
  /** Timestamp threshold, 'HH:MM'. */
  targetTime: string
  comparator: Comparator
  unit: string
}

export interface GoalDraft extends CommitmentDraft {
  goalKind: GoalKind
  /** Outcome: the yes/no sentence that says it's done. */
  doneWhen: string
  /** Outcome: extra days after the deadline that still count. */
  graceDays: number
  title: string
  tolerancePct: number
  whyValueId: string
  whyText: string
  startDate: DateStr
  targetDate: string
  preps: PrepDraft[]
}

export const MAX_PREPS = 3

export function emptyCommitmentDraft(): CommitmentDraft {
  return {
    shape: 'rhythm', label: '', measurementDefinition: '', checkinType: 'binary',
    period: 'week', times: 3, targetValue: '', targetTime: '', comparator: 'gte', unit: '',
  }
}

export function emptyGoalDraft(today: DateStr): GoalDraft {
  return {
    ...emptyCommitmentDraft(), goalKind: 'habit', doneWhen: '', graceDays: 0, title: '', tolerancePct: 80, whyValueId: '', whyText: '',
    startDate: today, targetDate: '', preps: [],
  }
}

/** Check-in types that make sense for each shape. */
export const CHECKIN_TYPES: Record<Shape, CheckinType[]> = {
  rhythm: ['binary'],
  threshold: ['quantity', 'timestamp', 'binary'],
  standard: ['timestamp', 'binary'],
}

export type Errors<T> = Partial<Record<keyof T, string>>

export function validateCommitment(d: CommitmentDraft): Errors<CommitmentDraft> {
  const e: Errors<CommitmentDraft> = {}
  const m = measurementProblem(d.measurementDefinition)
  if (m) e.measurementDefinition = m
  if (!d.label.trim()) e.label = 'Give it a short name, like “gym” or “sleep”.'
  if (!CHECKIN_TYPES[d.shape].includes(d.checkinType)) e.checkinType = 'Pick how you’ll check in.'
  if (d.shape === 'rhythm' && !(Number.isInteger(d.times) && d.times >= 1 && d.times <= 31)) {
    e.times = 'How many times per period? (1–31)'
  }
  if (d.shape === 'threshold' && d.checkinType === 'quantity') {
    const n = Number(d.targetValue.replace(',', '.'))
    if (!d.targetValue.trim() || !Number.isFinite(n) || n < 0) e.targetValue = 'Enter the limit as a number.'
  }
  if (d.shape === 'threshold' && d.checkinType === 'timestamp' && parseTime(d.targetTime) == null) {
    e.targetTime = 'Enter a time like 23:30.'
  }
  return e
}

export function validatePrep(p: PrepDraft): Errors<PrepDraft> {
  const e: Errors<PrepDraft> = {}
  if (!p.title.trim()) e.title = 'What will you do?'
  if (p.fireWeekdays.length === 0) e.fireWeekdays = 'Pick at least one day.'
  if (parseTime(p.fireTime) == null) e.fireTime = 'Enter a time like 21:00.'
  return e
}

export function validateGoal(d: GoalDraft): Errors<GoalDraft> {
  const outcome = d.goalKind === 'outcome'
  // A habit is measured by its commitment; an outcome by its finish line.
  const e: Errors<GoalDraft> = outcome ? {} : { ...validateCommitment(d) }
  if (outcome) {
    const m = measurementProblem(d.doneWhen)
    if (m) e.doneWhen = m
    if (!d.targetDate) e.targetDate = 'A finish line needs a deadline.'
    if (!(d.graceDays >= 0)) e.graceDays = 'Pick how much extra time is OK.'
  }
  if (!d.title.trim()) e.title = 'Name what you want.'
  if (!(d.tolerancePct >= 1 && d.tolerancePct <= 100)) e.tolerancePct = 'Between 1 and 100%.'
  if (!d.whyValueId) e.whyValueId = 'Pick the value this serves.'
  if (!d.whyText.trim()) e.whyText = 'Say how this goal serves it. This is what you’ll see every day.'
  if (!isDateStr(d.startDate)) e.startDate = 'Pick a start date.'
  if (d.targetDate && (!isDateStr(d.targetDate) || d.targetDate <= d.startDate)) {
    e.targetDate = 'Must be after the start date.'
  }
  if (d.preps.length > MAX_PREPS) e.preps = `At most ${MAX_PREPS}. Needing more means the commitment is too big.`
  else if (d.preps.some((p) => Object.keys(validatePrep(p)).length)) e.preps = 'Finish or remove the prep.'
  return e
}

export const isValid = (e: object) => Object.keys(e).length === 0
