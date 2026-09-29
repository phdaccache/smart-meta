import {
  addDays, diffDays, inSpan, maxDate, minDate, minutesIntoDay, periodOf, periodsBetween, spanDays,
  type Span,
} from './dates'
import type { Commitment, DateStr, Entry, Goal, Occurrence, Status } from './types'

/** Status bands: at or above tolerance, within this many points below, or worse. */
export const BEHIND_BAND = 15
export const RECENT_WEEKS = 4
/** How far back an unexplained miss still prompts on Today. */
export const MISS_LOOKBACK_DAYS = 7

export interface ScoreContext {
  today: DateStr
  rolloverHour: number
}

export interface Score {
  hits: number
  expected: number
}

/** Drops voided and superseded entries, leaving the current truth. */
export function activeEntries(entries: Entry[]): Entry[] {
  const superseded = new Set<string>()
  for (const e of entries) if (e.supersedes && !e.deletedAt) superseded.add(e.supersedes)
  return entries.filter((e) => !e.deletedAt && e.outcome !== 'void' && !superseded.has(e.id))
}

export function meetsTarget(c: Commitment, value: number, rolloverHour: number): boolean {
  if (c.targetValue == null) return true
  let a = value
  let b = c.targetValue
  if (c.checkinType === 'timestamp') {
    a = minutesIntoDay(value, rolloverHour)
    b = minutesIntoDay(c.targetValue, rolloverHour)
  }
  return c.comparator === 'lte' ? a <= b : a >= b
}

export type PeriodEval = 'hit' | 'miss' | 'pending' | 'none'

/**
 * The aggregate a threshold is judged on: the sum of quantities in the period
 * (so a nap adds to a night's sleep), or the latest logged time.
 */
export function thresholdAggregate(c: Commitment, entries: Entry[]): number | null {
  const valued = entries.filter((e) => e.value != null)
  if (valued.length === 0) return null
  if (c.checkinType === 'timestamp') {
    return [...valued].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)).at(-1)!.value!
  }
  return valued.reduce((sum, e) => sum + e.value!, 0)
}

/** Judges one threshold period from its active entries. */
export function evaluateThreshold(c: Commitment, entries: Entry[], closed: boolean, rolloverHour: number): PeriodEval {
  if (c.checkinType === 'binary') {
    if (entries.some((e) => e.outcome === 'hit')) return 'hit'
    if (entries.some((e) => e.outcome === 'miss')) return 'miss'
    return closed ? 'miss' : 'none'
  }
  const agg = thresholdAggregate(c, entries)
  if (agg == null) return closed || entries.some((e) => e.outcome === 'miss') ? 'miss' : 'none'
  const ok = meetsTarget(c, agg, rolloverHour)
  if (closed || c.checkinType === 'timestamp') return ok ? 'hit' : 'miss'
  // An open period is only decided once it can no longer change direction.
  if (ok && c.comparator !== 'lte') return 'hit'
  if (!ok && c.comparator === 'lte') return 'miss'
  return 'pending'
}

/**
 * Hits and expected slots for one commitment over [from, to], clipped to the
 * commitment's start and today.
 *
 * Closed periods count in full (prorated where the range clips them). The
 * current, still-open period only counts what is already decided, so an
 * unfinished week never reads as a failure.
 */
export function scoreCommitment(
  c: Commitment,
  entries: Entry[],
  occurrences: Occurrence[],
  ctx: ScoreContext,
  from: DateStr = c.startDate,
  to: DateStr = ctx.today,
): Score {
  const lo = maxDate(from, c.startDate)
  const hi = minDate(to, ctx.today)
  const score: Score = { hits: 0, expected: 0 }
  if (lo > hi) return score
  const mine = activeEntries(entries).filter((e) => e.subjectType === 'commitment' && e.subjectId === c.id)

  if (c.shape === 'standard') {
    for (const o of occurrences) {
      if (o.deletedAt || o.commitmentId !== c.id || o.date < lo || o.date > hi) continue
      const e = mine.find((x) => x.occurrenceId === o.id)
      if (!e) continue // unanswered: not yet a hit or a miss
      score.expected += 1
      if (e.outcome === 'hit') score.hits += 1
    }
    return score
  }

  for (const p of periodsBetween(lo, hi, c.cadence.period)) {
    const ov: Span = { start: maxDate(p.start, lo), end: minDate(p.end, hi) }
    const frac = spanDays(ov) / spanDays(p)
    const closed = p.end < ctx.today

    if (c.shape === 'rhythm') {
      const target = c.cadence.times
      const hits = mine.filter((e) => e.outcome === 'hit' && inSpan(e.date, ov)).length
      if (closed) {
        const expected = target * frac
        score.hits += Math.min(hits, expected)
        score.expected += expected
      } else {
        const counted = Math.min(hits, target)
        score.hits += counted
        score.expected += counted
      }
    } else {
      const inPeriod = mine.filter((e) => inSpan(e.date, p))
      const ev = evaluateThreshold(c, inPeriod, closed, ctx.rolloverHour)
      if (ev === 'hit') {
        score.hits += frac
        score.expected += frac
      } else if (ev === 'miss') {
        score.expected += frac
      }
    }
  }
  return score
}

export function pct(s: Score): number | null {
  return s.expected > 0 ? (100 * s.hits) / s.expected : null
}

export function statusFor(p: number | null, tolerancePct: number): Status | null {
  if (p == null) return null
  if (p >= tolerancePct - 1e-9) return 'on track'
  if (p >= tolerancePct - BEHIND_BAND) return 'behind'
  return 'at risk'
}

/** Mean of each commitment's percentage, so a nightly threshold doesn't outweigh a weekly rhythm. */
export function goalPct(
  commitments: Commitment[],
  entries: Entry[],
  occurrences: Occurrence[],
  ctx: ScoreContext,
  from?: DateStr,
  to?: DateStr,
): number | null {
  const pcts = commitments
    .filter((c) => !c.deletedAt)
    .map((c) => pct(scoreCommitment(c, entries, occurrences, ctx, from ?? c.startDate, to ?? ctx.today)))
    .filter((p): p is number => p != null)
  if (pcts.length === 0) return null
  return pcts.reduce((a, b) => a + b, 0) / pcts.length
}

export interface GoalSummary {
  /** Cumulative, start → today. Null when nothing has been decided yet. */
  pct: number | null
  status: Status | null
  /** Last four calendar weeks, oldest first; null for a week with no data. */
  weeks: (Status | null)[]
  recentStatus: Status | null
}

export function summarizeGoal(
  goal: Goal,
  commitments: Commitment[],
  entries: Entry[],
  occurrences: Occurrence[],
  ctx: ScoreContext,
): GoalSummary {
  const mine = commitments.filter((c) => c.goalId === goal.id && !c.deletedAt)
  const cumulative = goalPct(mine, entries, occurrences, ctx)
  const thisWeek = periodOf(ctx.today, 'week')
  const weeks: (Status | null)[] = []
  for (let i = RECENT_WEEKS - 1; i >= 0; i--) {
    const start = addDays(thisWeek.start, -7 * i)
    weeks.push(statusFor(goalPct(mine, entries, occurrences, ctx, start, addDays(start, 6)), goal.tolerancePct))
  }
  const recentFrom = addDays(thisWeek.start, -7 * (RECENT_WEEKS - 1))
  return {
    pct: cumulative,
    status: statusFor(cumulative, goal.tolerancePct),
    weeks,
    recentStatus: statusFor(goalPct(mine, entries, occurrences, ctx, recentFrom, ctx.today), goal.tolerancePct),
  }
}

// ——— miss prompts ———

export interface MissSlot {
  /** The day a miss entry is written against (the period's last day). */
  date: DateStr
  count: number
}

export interface MissPrompt {
  commitmentId: string
  period: 'day' | 'week' | 'month'
  slots: MissSlot[]
  /** Rhythm only: what was done and what was expected in the period. */
  hits?: number
  target?: number
}

/**
 * Closed periods in the lookback window that fell short and have no reason
 * logged yet. Daily misses are merged into one prompt so a lost week asks once.
 */
export function missPrompt(c: Commitment, entries: Entry[], ctx: ScoreContext): MissPrompt | null {
  if (c.shape === 'standard' || c.deletedAt) return null
  const yesterday = addDays(ctx.today, -1)
  const earliest = maxDate(c.startDate, addDays(ctx.today, -MISS_LOOKBACK_DAYS))
  if (earliest > yesterday) return null
  const mine = activeEntries(entries).filter((e) => e.subjectType === 'commitment' && e.subjectId === c.id)
  const slots: MissSlot[] = []
  let hits: number | undefined
  let target: number | undefined

  for (const p of periodsBetween(earliest, yesterday, c.cadence.period)) {
    if (p.end >= ctx.today || p.end < earliest) continue
    const inPeriod = mine.filter((e) => inSpan(e.date, p))
    const explained = inPeriod.filter((e) => e.outcome === 'miss' && e.missReason).length

    if (c.shape === 'rhythm') {
      const ovStart = maxDate(p.start, c.startDate)
      const expected = Math.round((c.cadence.times * (diffDays(ovStart, p.end) + 1)) / spanDays(p))
      const done = inPeriod.filter((e) => e.outcome === 'hit' && e.date >= ovStart).length
      const pending = Math.max(0, expected - done) - explained
      if (pending > 0) {
        slots.push({ date: p.end, count: pending })
        hits = done
        target = expected
      }
    } else if (explained === 0 && evaluateThreshold(c, inPeriod, true, ctx.rolloverHour) === 'miss') {
      slots.push({ date: p.end, count: 1 })
    }
  }
  if (slots.length === 0) return null
  return { commitmentId: c.id, period: c.cadence.period, slots, hits, target }
}
