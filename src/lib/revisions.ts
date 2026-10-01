import { inLang, num, t, tk, tn, type Key } from '../i18n'
import { dayMonth, isDateStr } from './dates'
import { cadenceText, periodWord } from './describe'
import type { Commitment, CommitmentPart, Goal, GoalState, Revision } from './types'

/**
 * Plan changes are kept as Revisions. Older ones only have English text
 * ("gym how often", "4× per week"); newer ones also carry the commitment, the
 * part and the stored values, so they read the same in any language.
 */

/** The English names older versions wrote after the label, longest first. */
const PART_NAMES: [CommitmentPart, string][] = [
  ['measurementDefinition', 'what counts'], ['checkinType', 'check-in'], ['cadence', 'how often'],
  ['comparator', 'direction'], ['targetValue', 'target'], ['label', 'name'], ['unit', 'unit'],
]
const partName = (p: CommitmentPart) => PART_NAMES.find(([k]) => k === p)![1]

const PART_LABEL: Record<CommitmentPart, Key> = {
  label: 'history.field.name', measurementDefinition: 'history.field.whatCounts', checkinType: 'history.field.checkIn',
  cadence: 'history.field.howOften', targetValue: 'history.field.target', comparator: 'history.field.direction',
  unit: 'history.field.unit',
}

/** What a commitment revision stores for one part. */
export function commitmentRevision(before: Commitment, after: Commitment, part: CommitmentPart) {
  const raw = (c: Commitment) => (part === 'cadence' ? cadenceRaw(c) : c[part] ?? null)
  return {
    field: `${before.label} ${partName(part)}`,
    oldValue: inLang('en', () => partValue(part, raw(before))),
    newValue: inLang('en', () => partValue(part, raw(after))),
    commitmentId: before.id, part, oldRaw: raw(before), newRaw: raw(after),
  }
}

/** Enough of a commitment to describe how often it's done. */
const cadenceRaw = (c: Commitment) => ({
  shape: c.shape, checkinType: c.checkinType, cadence: c.cadence, comparator: c.comparator ?? null,
  targetValue: c.targetValue ?? null, unit: c.unit ?? null,
})

/** The commitment label and part a revision changed, or null for a goal edit. */
export function commitmentEdit(r: Revision): { label: string; part: CommitmentPart } | null {
  for (const [part, name] of PART_NAMES) {
    if ((!r.part || r.part === part) && r.field.endsWith(` ${name}`)) return { label: r.field.slice(0, -name.length - 1), part }
  }
  return null
}

/** A change to how much or how often: what reviews and insights count as a target change. */
export function isTargetChange(r: Revision, c: Commitment): boolean {
  if (r.commitmentId) return r.commitmentId === c.id && (r.part === 'targetValue' || r.part === 'cadence')
  return r.goalId === c.goalId && (r.field === `${c.label} target` || r.field === `${c.label} how often`)
}

function partValue(part: CommitmentPart, raw: unknown): string {
  if (raw == null || raw === '') return '—'
  if (part === 'cadence' && typeof raw === 'object') return cadenceText(raw as Commitment)
  if (part === 'targetValue' && typeof raw === 'number') return num(raw)
  if (part === 'comparator') return raw === 'lte' ? t('form.atMost') : raw === 'gte' ? t('form.atLeast') : String(raw)
  if (part === 'checkinType') {
    const k = ({ binary: 'form.checkYesNo', quantity: 'form.checkNumber', timestamp: 'form.checkTime' } as const)[raw as 'binary']
    return k ? t(k) : String(raw)
  }
  return String(raw)
}

/** Older cadence text: "4× per week", "once a month". Anything else is shown as it was written. */
function legacyCadence(text: string): string {
  const m = /^(\d+)× per (day|week|month)$/.exec(text) ?? /^once a (day|week|month)$/.exec(text)
  if (!m) return text
  const once = m.length === 2
  const period = periodWord((once ? m[1] : m[2]) as 'week')
  return once ? t('cadence.once', { period }) : t('cadence.times', { n: Number(m[1]), period })
}

/** One side of a revision, in the current language. */
export function revisionValue(r: Revision, side: 'old' | 'new', ctx: RevisionContext = {}): string {
  const stored = side === 'old' ? r.oldValue : r.newValue
  const raw = side === 'old' ? r.oldRaw : r.newRaw
  const edit = commitmentEdit(r)
  if (edit) {
    if (raw !== undefined) return partValue(edit.part, raw)
    if (edit.part === 'cadence') return legacyCadence(stored)
    if (edit.part === 'comparator' || edit.part === 'checkinType') return partValue(edit.part, stored)
    return stored
  }
  if (stored === '—') return stored
  switch (r.field) {
    case 'state': return stateLabel(stored as GoalState)
    case 'tolerancePct': return `${stored}%`
    case 'startDate':
    case 'targetDate': return isDateStr(stored) ? `${dayMonth(stored)} ${stored.slice(0, 4)}` : stored
    case 'graceDays': return tn('dates.day', Number(stored))
    case 'whyValueId': return ctx.valueName?.(stored) ?? '—'
    default: return stored
  }
}

export interface RevisionContext {
  valueName?: (id: string) => string | undefined
  goal?: Goal
}

const GOAL_FIELDS: Record<string, Key> = {
  title: 'history.goal.title', whyValueId: 'history.goal.value', whyText: 'history.goal.why',
  tolerancePct: 'history.goal.tolerance', startDate: 'history.goal.start', doneWhen: 'history.goal.doneWhen',
  graceDays: 'history.goal.extraTime', state: 'history.goal.state', abandonReason: 'history.goal.reason',
}

/** "gym how often", "tolerance": what a revision changed, in the current language. */
export function revisionField(r: Revision, ctx: RevisionContext = {}): string {
  const edit = commitmentEdit(r)
  if (edit) return `${edit.label} ${tk(PART_LABEL[edit.part])}`
  if (r.field === 'targetDate') return t(ctx.goal?.kind === 'outcome' ? 'history.goal.deadline' : 'history.goal.reviewDate')
  return GOAL_FIELDS[r.field] ? tk(GOAL_FIELDS[r.field]) : r.field
}

const STATE_LABEL: Record<GoalState | 'paused', Key> = {
  active: 'state.active', backlog: 'state.backlog', maintenance: 'state.maintenance', completed: 'state.completed',
  abandoned: 'state.abandoned', paused: 'state.paused',
}

export const stateLabel = (s: GoalState | 'paused') => (STATE_LABEL[s] ? tk(STATE_LABEL[s]) : s)
