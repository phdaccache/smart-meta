import { t } from '../i18n'
import { en } from '../i18n/en'
import { ptBR } from '../i18n/pt-BR'
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

/**
 * The same check with each language's words (check.words), so a sentence
 * passes whatever language it was written in or the app is set to.
 */
const NUMBER_WORDS_PT = 'um, uma, dois, duas, três, quatro, cinco, seis, sete, oito, nove, dez, zero, nenhum, nenhuma, qualquer'
const words = (list: string) => list.split(',').map((w) => w.trim()).filter(Boolean)
const MEASURABLE_ANY = new RegExp(
  `(?<!\\p{L})(${[...words(en['check.words']), ...words(ptBR['check.words']), ...words(NUMBER_WORDS_PT)].join('|')})(?!\\p{L})`,
  'iu',
)

export function measurementProblem(text: string): string | null {
  const s = text.trim()
  if (!s) return t('err.required')
  if (s.split(/\s+/).length < 3) return t('err.tooShort')
  if (!MEASURABLE.test(s) && !MEASURABLE_ANY.test(s)) return t('err.notCheckable')
  return null
}

/**
 * A finish line is already a yes/no event ("I get a job offer"), so it needs
 * no quantity; it only has to be a real sentence.
 */
export function doneWhenProblem(text: string): string | null {
  const s = text.trim()
  if (!s) return t('err.required')
  if (s.split(/\s+/).length < 3) return t('err.yesNoSentence')
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
  if (!d.label.trim()) e.label = t('err.shortName')
  if (!CHECKIN_TYPES[d.shape].includes(d.checkinType)) e.checkinType = t('err.checkInType')
  if (d.shape === 'rhythm' && !(Number.isInteger(d.times) && d.times >= 1 && d.times <= 31)) {
    e.times = t('err.timesRange')
  }
  if (d.shape === 'threshold' && d.checkinType === 'quantity') {
    const n = Number(d.targetValue.replace(',', '.'))
    if (!d.targetValue.trim() || !Number.isFinite(n) || n < 0) e.targetValue = t('err.limitNumber')
  }
  if (d.shape === 'threshold' && d.checkinType === 'timestamp' && parseTime(d.targetTime) == null) {
    e.targetTime = t('err.timeLike', { example: '23:30' })
  }
  return e
}

export function validatePrep(p: PrepDraft): Errors<PrepDraft> {
  const e: Errors<PrepDraft> = {}
  if (!p.title.trim()) e.title = t('err.prepWhat')
  if (p.fireWeekdays.length === 0) e.fireWeekdays = t('err.oneDay')
  if (parseTime(p.fireTime) == null) e.fireTime = t('err.timeLike', { example: '21:00' })
  return e
}

export function validateGoal(d: GoalDraft): Errors<GoalDraft> {
  const outcome = d.goalKind === 'outcome'
  // A habit is measured by its commitment; an outcome by its finish line.
  const e: Errors<GoalDraft> = outcome ? {} : { ...validateCommitment(d) }
  if (outcome) {
    const m = doneWhenProblem(d.doneWhen)
    if (m) e.doneWhen = m
    if (!(d.graceDays >= 0)) e.graceDays = t('err.graceOk')
  }
  // Every goal gets a date: a deadline, or a day to look back on a habit.
  if (!d.targetDate) e.targetDate = outcome ? t('err.needsDeadline') : t('err.lookBack')
  if (!d.title.trim()) e.title = t('err.nameWhat')
  if (!(d.tolerancePct >= 1 && d.tolerancePct <= 100)) e.tolerancePct = t('err.pctRange')
  if (!d.whyValueId) e.whyValueId = t('err.pickValue')
  if (!d.whyText.trim()) e.whyText = t('err.sayHow')
  if (!isDateStr(d.startDate)) e.startDate = t('err.startDate')
  if (d.targetDate && (!isDateStr(d.targetDate) || d.targetDate <= d.startDate)) {
    e.targetDate = t('err.afterStart')
  }
  if (d.preps.length > MAX_PREPS) e.preps = t('err.maxPreps', { n: MAX_PREPS })
  else if (d.preps.some((p) => Object.keys(validatePrep(p)).length)) e.preps = t('err.finishPrep')
  return e
}

export const isValid = (e: object) => Object.keys(e).length === 0
