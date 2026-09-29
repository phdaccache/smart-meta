import { addDays, dayMonth, diffDays, inSpan, maxDate, periodOf, type Span } from './dates'
import { MAX_PREPS } from './draft'
import {
  activeEntries, goalPct, missPrompt, outcomeTime, scoreCommitment, statusFor, type MissPrompt, type ScoreContext,
} from './scoring'
import type { Snapshot } from './today'
import type {
  Commitment, DateStr, Displacement, Entry, Goal, ID, MissReason, Project, Revision, Status, WeekReview,
} from './types'

/** Patterns look this far back: one week is too small a sample. */
export const PATTERN_WEEKS = 4
/** A reason drives a suggestion once it explains at least this many misses. */
export const MIN_SAME_REASON = 2
/** Below tolerance in this many of the last PATTERN_WEEKS weeks: failing. */
export const FAILING_WEEKS = 3
/** On track every week for this long: ready for maintenance. */
export const MAINTENANCE_WEEKS = 8
/** No step done for this long: stalled. */
export const STALL_DAYS = 21
/** A dismissed suggestion stays hidden this long. */
export const DISMISS_WEEKS = 4
/** A finish line this close is worth a line in the review. */
export const DEADLINE_SOON_DAYS = 30

/** The week under review: the last full Monday–Sunday before today. */
export function reviewWeek(today: DateStr): Span {
  return periodOf(addDays(periodOf(today, 'week').start, -1), 'week')
}

export type SuggestionKind = 'add_prep' | 'change_prep' | 'lower_target' | 'pause' | 'maintenance'

export interface Suggestion {
  /** Stable across weeks, so a dismissal can hide it. */
  key: string
  kind: SuggestionKind
  goalId: ID
  commitmentId?: ID
  prepId?: ID
  /** The facts behind it, in plain words. */
  evidence: string
}

export interface ReasonCount {
  reason: MissReason
  count: number
  displacements: { label: string; count: number }[]
}

export interface CommitmentLine {
  commitment: Commitment
  text: string
}

export interface GoalCard {
  goal: Goal
  lines: CommitmentLine[]
  /** Cumulative status at the end of the reviewed week, and a week earlier. */
  status: Status | null
  before: Status | null
  reasons: ReasonCount[]
  suggestion: Suggestion | null
}

export type DateNoteKind = 'deadline_soon' | 'grace' | 'review_due'

export interface DateNote {
  goal: Goal
  kind: DateNoteKind
  date: DateStr
}

export interface StalledProject {
  project: Project
  why: 'overdue' | 'idle'
  /** Last day a step was done; null if none ever was. */
  lastDone: DateStr | null
  remaining: number
}

export interface ReviewData {
  week: Span
  /** Misses since the week began that still have no reason. */
  loose: MissPrompt[]
  goals: GoalCard[]
  dates: DateNote[]
  stalled: StalledProject[]
  /** Open active-goal slots, and the backlog goal that would fill one. */
  free: number
  next: Goal | null
  reviewed: boolean
  /** False until a goal has been active through a whole week. */
  ready: boolean
}

export interface ReviewInput {
  snap: Snapshot
  revisions: Revision[]
  displacements: Displacement[]
  weekReviews: WeekReview[]
  ctx: ScoreContext
  goalCap: number
}

const REASON_ORDER: MissReason[] = ['forgot', 'chose_other', 'no_time', 'too_tired']

const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)
const dayOf = (iso: string) => iso.slice(0, 10)

/** Whether last week still waits for its review. Cheap enough for the tab bar. */
export function reviewPending(goals: Goal[], weekReviews: WeekReview[], today: DateStr): boolean {
  const week = reviewWeek(today)
  if (live(weekReviews).some((w) => w.week === week.start && w.doneAt)) return false
  return live(goals).some((g) => g.state === 'active' && g.startDate <= week.end)
}

export function buildReview(input: ReviewInput): ReviewData {
  const { snap, ctx, goalCap } = input
  const week = reviewWeek(ctx.today)
  const entries = activeEntries(snap.entries)
  const goals = live(snap.goals).sort((a, b) => a.priority - b.priority)
  const liveGoals = goals.filter((g) => g.state === 'active' || g.state === 'maintenance')
  const commitmentsOf = (g: Goal) => live(snap.commitments).filter((c) => c.goalId === g.id)

  const loose = liveGoals
    .flatMap(commitmentsOf)
    .map((c) => missPrompt(c, snap.entries, ctx, diffDays(week.start, ctx.today)))
    .filter((p): p is MissPrompt => !!p)

  const cards: GoalCard[] = []
  for (const g of liveGoals) {
    if (g.startDate > week.end) continue
    const cs = commitmentsOf(g).filter((c) => c.startDate <= week.end)
    if (cs.length === 0) continue
    const weekStatus = statusFor(goalPct(cs, snap.entries, snap.occurrences, ctx, week.start, week.end), g.tolerancePct)
    // Maintenance goals only show up when they slip.
    if (g.state === 'maintenance' && weekStatus !== 'behind' && weekStatus !== 'at risk') continue
    cards.push({
      goal: g,
      lines: cs.map((c) => ({ commitment: c, text: weekLine(c, entries, snap, ctx, week) })),
      status: statusFor(goalPct(cs, snap.entries, snap.occurrences, ctx, undefined, week.end), g.tolerancePct),
      before: statusFor(goalPct(cs, snap.entries, snap.occurrences, ctx, undefined, addDays(week.start, -1)), g.tolerancePct),
      reasons: reasonCounts(entries.filter((e) => inSpan(e.date, week) && cs.some((c) => c.id === e.subjectId)), input.displacements),
      suggestion: suggest(g, cs, input, week, entries),
    })
  }

  const dates: DateNote[] = []
  for (const g of liveGoals) {
    const t = outcomeTime(g, ctx.today)
    if (t) {
      if (t.phase === 'overdue') dates.push({ goal: g, kind: 'review_due', date: t.graceEnd })
      else if (t.phase === 'grace') dates.push({ goal: g, kind: 'grace', date: t.graceEnd })
      else if (diffDays(ctx.today, t.deadline) <= DEADLINE_SOON_DAYS) dates.push({ goal: g, kind: 'deadline_soon', date: t.deadline })
    } else if (g.targetDate && g.targetDate <= ctx.today) {
      dates.push({ goal: g, kind: 'review_due', date: g.targetDate })
    }
  }

  const active = goals.filter((g) => g.state === 'active').length
  const free = Math.max(0, goalCap - active)

  return {
    week,
    loose,
    goals: cards,
    dates,
    stalled: stalledProjects(snap, entries, ctx.today),
    free,
    next: free > 0 ? goals.find((g) => g.state === 'backlog') ?? null : null,
    reviewed: live(input.weekReviews).some((w) => w.week === week.start && !!w.doneAt),
    ready: goals.some((g) => g.state === 'active' && g.startDate <= week.end),
  }
}

/** "gym 2 of 3", "sleep 5 of 7 days", "punctuality 3 of 4 kept". */
function weekLine(c: Commitment, entries: Entry[], snap: Snapshot, ctx: ScoreContext, week: Span): string {
  const s = scoreCommitment(c, entries, snap.occurrences, ctx, week.start, week.end)
  const expected = Math.round(s.expected)
  if (c.shape === 'standard') {
    return expected === 0 ? `${c.label}: nothing logged` : `${c.label}: ${Math.round(s.hits)} of ${expected} kept`
  }
  if (c.shape === 'rhythm') {
    // Show the real count, so doing more than planned is visible.
    const done = entries.filter((e) => e.subjectId === c.id && e.outcome === 'hit' && inSpan(e.date, week) && e.date >= c.startDate).length
    return `${c.label}: ${done} of ${expected}`
  }
  const unit = c.cadence.period === 'day' ? ' days' : ''
  return `${c.label}: ${Math.round(s.hits)} of ${expected}${unit}`
}

function reasonCounts(misses: Entry[], displacements: Displacement[]): ReasonCount[] {
  const out = new Map<MissReason, ReasonCount>()
  for (const e of misses) {
    if (e.outcome !== 'miss' || !e.missReason) continue
    const r = out.get(e.missReason) ?? { reason: e.missReason, count: 0, displacements: [] }
    r.count++
    if (e.displacementId) {
      const label = displacements.find((d) => d.id === e.displacementId)?.label
      if (label) {
        const d = r.displacements.find((x) => x.label === label)
        if (d) d.count++
        else r.displacements.push({ label, count: 1 })
      }
    }
    out.set(e.missReason, r)
  }
  return [...out.values()]
    .map((r) => ({ ...r, displacements: r.displacements.sort((a, b) => b.count - a.count) }))
    .sort((a, b) => b.count - a.count || REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason))
}

/** Target and cadence edits on this commitment, from its revisions. */
function targetChanges(c: Commitment, revisions: Revision[]): Revision[] {
  return live(revisions).filter(
    (r) => r.goalId === c.goalId && (r.field === `${c.label} target` || r.field === `${c.label} how often`),
  )
}

/**
 * The last time the plan for this commitment changed: a target edit, or a prep
 * added or edited after the commitment was set up. Evidence only counts from here, so an
 * accepted suggestion is judged on what happens next, not on what came before.
 */
function lastChange(c: Commitment, input: ReviewInput): DateStr {
  let d = c.startDate
  for (const r of targetChanges(c, input.revisions)) d = maxDate(d, dayOf(r.timestamp))
  for (const p of live(input.snap.preps)) {
    // Preps set up with the commitment are part of the original plan; later ones, or edits, are changes.
    const touched = dayOf(maxDate(p.createdAt, p.updatedAt))
    if (p.commitmentId === c.id && touched > dayOf(c.createdAt)) d = maxDate(d, touched)
  }
  return d
}

function hiddenKeys(input: ReviewInput, week: Span): Set<string> {
  const since = addDays(week.start, -7 * DISMISS_WEEKS)
  return new Set(live(input.weekReviews).filter((w) => w.week > since).flatMap((w) => w.dismissed))
}

const times = (n: number) => (n === 2 ? 'twice' : `${n} times`)

function suggest(g: Goal, cs: Commitment[], input: ReviewInput, week: Span, entries: Entry[]): Suggestion | null {
  const windowStart = addDays(week.start, -7 * (PATTERN_WEEKS - 1))
  const candidates: Suggestion[] = []
  const key = (kind: SuggestionKind, c?: Commitment) => `${g.id}:${kind}:${c?.id ?? ''}`

  // 1. What the reasons say, per commitment.
  for (const c of cs) {
    const since = maxDate(windowStart, lastChange(c, input))
    const misses = entries.filter(
      (e) => e.subjectId === c.id && e.outcome === 'miss' && e.missReason && e.date >= since && e.date <= week.end,
    )
    const [top] = reasonCounts(misses, input.displacements)
    if (!top || top.count < MIN_SAME_REASON) continue
    const preps = live(input.snap.preps).filter((p) => p.commitmentId === c.id)
    const share = `${top.count} of ${misses.length} ${c.label} misses since ${dayMonth(since)}`
    const shown = top.displacements[0]
    const because = top.reason === 'chose_other' && shown
      ? `chose something else (${shown.label} ×${shown.count})`
      : { forgot: 'forgot', chose_other: 'chose something else', no_time: 'no time', too_tired: 'too tired' }[top.reason]
    const evidence = `${share}: ${because}.`

    if (top.reason === 'forgot' || (top.reason === 'chose_other' && preps.length === 0)) {
      if (preps.length < MAX_PREPS) candidates.push({ key: key('add_prep', c), kind: 'add_prep', goalId: g.id, commitmentId: c.id, evidence })
    } else if (top.reason === 'chose_other') {
      candidates.push({ key: key('change_prep', c), kind: 'change_prep', goalId: g.id, commitmentId: c.id, prepId: preps[0].id, evidence })
    } else if (c.shape !== 'standard') {
      const changed = targetChanges(c, input.revisions).length
      if (changed >= 2) {
        candidates.push({
          key: key('pause'), kind: 'pause', goalId: g.id, commitmentId: c.id,
          evidence: `${evidence} You’ve already changed this target ${times(changed)}.`,
        })
      } else {
        candidates.push({ key: key('lower_target', c), kind: 'lower_target', goalId: g.id, commitmentId: c.id, evidence })
      }
    }
  }

  // 2. Failing, whatever the reasons: judged only on weeks since the plan last changed.
  const planSince = cs.map((c) => lastChange(c, input)).reduce(maxDate, g.startDate)
  let below = 0
  let judged = 0
  for (let i = 0; i < PATTERN_WEEKS; i++) {
    const start = addDays(week.start, -7 * i)
    if (start < planSince) continue
    const s = statusFor(goalPct(cs, input.snap.entries, input.snap.occurrences, input.ctx, start, addDays(start, 6)), g.tolerancePct)
    if (s == null) continue
    judged++
    if (s !== 'on track') below++
  }
  if (below >= FAILING_WEEKS && g.state === 'active') {
    candidates.push({
      key: key('pause'), kind: 'pause', goalId: g.id,
      evidence: `Below ${g.tolerancePct}% in ${below} of the last ${judged} weeks.`,
    })
  }

  // 3. Doing well for long enough to stop counting it against the cap.
  if (g.state === 'active' && g.kind !== 'outcome') {
    let onTrack = 0
    for (let i = 0; i < MAINTENANCE_WEEKS; i++) {
      const start = addDays(week.start, -7 * i)
      const s = statusFor(goalPct(cs, input.snap.entries, input.snap.occurrences, input.ctx, start, addDays(start, 6)), g.tolerancePct)
      if (s === 'on track') onTrack++
    }
    if (onTrack === MAINTENANCE_WEEKS) {
      candidates.push({
        key: key('maintenance'), kind: 'maintenance', goalId: g.id,
        evidence: `On track every week for the last ${MAINTENANCE_WEEKS} weeks.`,
      })
    }
  }

  const hidden = hiddenKeys(input, week)
  return candidates.find((s) => !hidden.has(s.key)) ?? null
}

function stalledProjects(snap: Snapshot, entries: Entry[], today: DateStr): StalledProject[] {
  const out: StalledProject[] = []
  for (const p of live(snap.projects)) {
    if (p.state !== 'active') continue
    const steps = live(snap.tasks).filter((t) => t.projectId === p.id)
    const done = entries.filter((e) => e.subjectType === 'task' && e.outcome === 'hit' && steps.some((s) => s.id === e.subjectId))
    const remaining = steps.filter((s) => !done.some((e) => e.subjectId === s.id)).length
    if (remaining === 0) continue
    const lastDone = done.map((e) => e.date).sort().at(-1) ?? null
    if (p.targetDate < today) {
      out.push({ project: p, why: 'overdue', lastDone, remaining })
    } else if (diffDays(lastDone ?? dayOf(p.createdAt), today) >= STALL_DAYS) {
      out.push({ project: p, why: 'idle', lastDone, remaining })
    }
  }
  return out
}
