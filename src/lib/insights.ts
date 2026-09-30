import { addDays, dayMonth, diffDays, inSpan, isoWeekday, maxDate, minDate, minutesIntoDay, parseTime, periodOf, periodsBetween, type Span } from './dates'
import { reviewWeek } from './review'
import { activeEntries, evaluateThreshold, meetsTarget, pct, scoreCommitment, thresholdAggregate, type Score, type ScoreContext } from './scoring'
import type { Snapshot } from './today'
import type {
  Commitment, DateStr, Displacement, Entry, Goal, GoalState, ID, MissReason, Prep, Project, Revision, Value, WeekReview,
} from './types'

/** A goal's charts stay hidden until it has this many weeks of data. */
export const MIN_WEEKS = 4
/** Trends and prep effects look back this far. */
export const TREND_WEEKS = 26
/** Patterns (reasons, weekdays, near misses) look back this far. */
export const LOOKBACK_WEEKS = 12
/** Weeks on each side of a change that its effect is judged on. */
export const EFFECT_WEEKS = 4
/** A difference this big (in points) is worth saying out loud. */
export const CLEAR_DIFF = 10

export interface InsightsInput {
  snap: Snapshot
  revisions: Revision[]
  displacements: Displacement[]
  weekReviews: WeekReview[]
  ctx: ScoreContext
}

/** Shared lookups, built once per render and reused by every chart. */
export interface Prepared extends InsightsInput {
  /** The last full week; trends stop here so a half-done week never drags them down. */
  lastWeek: Span
  yesterday: DateStr
  entriesOf: (subjectId: ID) => Entry[]
  commitmentsOf: (g: Goal) => Commitment[]
  lives: Map<ID, GoalLife>
}

const live = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt)
const dayOf = (iso: string) => iso.slice(0, 10)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const isLive = (s: string) => s === 'active' || s === 'maintenance'
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function prepare(input: InsightsInput): Prepared {
  const bySubject = new Map<ID, Entry[]>()
  for (const e of activeEntries(input.snap.entries)) {
    const list = bySubject.get(e.subjectId)
    if (list) list.push(e)
    else bySubject.set(e.subjectId, [e])
  }
  const commitments = live(input.snap.commitments)
  const lives = new Map(input.snap.goals.map((g) => [g.id, goalLife(g, input.revisions, input.ctx.today)]))
  return {
    ...input,
    lastWeek: reviewWeek(input.ctx.today),
    yesterday: addDays(input.ctx.today, -1),
    entriesOf: (id) => bySubject.get(id) ?? [],
    commitmentsOf: (g) => commitments.filter((c) => c.goalId === g.id),
    lives,
  }
}

// ——— a goal's life: when it was running, and how it ended ———

export interface Segment {
  start: DateStr
  end: DateStr
  state: 'active' | 'maintenance'
}

export interface GoalLife {
  goal: Goal
  /** Stretches when the goal was active or in maintenance, oldest first. */
  segments: Segment[]
  /** How it stopped, if it isn't running now: completed, abandoned, or paused (backlog). */
  ended: { date: DateStr; state: GoalState } | null
}

/** Rebuilt from the goal's state revisions; a goal made active straight away starts on its start date. */
export function goalLife(g: Goal, revisions: Revision[], today: DateStr): GoalLife {
  const changes = live(revisions)
    .filter((r) => r.goalId === g.id && r.field === 'state')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let state = (changes[0]?.oldValue ?? g.state) as GoalState
  let from = g.startDate
  let ended: GoalLife['ended'] = null
  const segments: Segment[] = []
  for (const r of changes) {
    const day = maxDate(dayOf(r.timestamp), g.startDate)
    const next = r.newValue as GoalState
    if (isLive(state) && day >= from) segments.push({ start: from, end: day, state: state as Segment['state'] })
    if (isLive(next)) {
      from = day
      ended = null
    } else if (isLive(state)) {
      ended = { date: day, state: next }
    }
    state = next
  }
  if (isLive(state) && from <= today) segments.push({ start: from, end: today, state: state as Segment['state'] })
  return { goal: g, segments, ended }
}

/** The parts of `span` when the goal was running; stretches that touch (active → maintenance) are joined. */
function liveParts(life: GoalLife, span: Span): Span[] {
  const out: Span[] = []
  for (const s of life.segments) {
    const part = { start: maxDate(s.start, span.start), end: minDate(s.end, span.end) }
    if (part.start > part.end) continue
    const last = out.at(-1)
    if (last && part.start <= addDays(last.end, 1)) last.end = maxDate(last.end, part.end)
    else out.push(part)
  }
  return out
}

// ——— weekly percentages ———

export interface WeekPoint {
  /** Monday. */
  start: DateStr
  /** Null: the goal wasn't running, or nothing could be judged. */
  pct: number | null
}

/** A goal's percentage over a span: the mean of its commitments', counting only the days it was running. */
export function spanPct(p: Prepared, g: Goal, span: Span): number | null {
  const parts = liveParts(p.lives.get(g.id)!, span)
  if (parts.length === 0) return null
  const pcts = p.commitmentsOf(g)
    .map((c) => {
      const total: Score = { hits: 0, expected: 0 }
      for (const part of parts) {
        const s = scoreCommitment(c, p.entriesOf(c.id), p.snap.occurrences, p.ctx, part.start, part.end)
        total.hits += s.hits
        total.expected += s.expected
      }
      return pct(total)
    })
    .filter((x): x is number => x != null)
  return mean(pcts)
}

function weekPoints(p: Prepared, g: Goal, from: DateStr, to: DateStr): WeekPoint[] {
  return periodsBetween(from, to, 'week').map((w) => ({ start: w.start, pct: spanPct(p, g, w) }))
}

// ——— goal trend with markers ———

export type MarkerKind = 'prep' | 'target' | 'tolerance' | 'state' | 'commitment'

export interface Marker {
  date: DateStr
  kind: MarkerKind
  text: string
  /** Mean weekly % in the weeks before and after; null without enough weeks on a side. */
  before: number | null
  after: number | null
}

export interface GoalTrend {
  goal: Goal
  points: WeekPoint[]
  weeksWithData: number
  /** Mean of the last LOOKBACK_WEEKS weeks with data. */
  recent: number | null
  markers: Marker[]
  takeaway: string
}

const STATE_TEXT: Partial<Record<GoalState, string>> = {
  maintenance: 'Moved to maintenance', active: 'Made active again', backlog: 'Paused',
}

/** Changes to the plan worth marking on a trend: targets, preps, tolerance, maintenance. */
function planChanges(p: Prepared, g: Goal): Omit<Marker, 'before' | 'after'>[] {
  const out: Omit<Marker, 'before' | 'after'>[] = []
  for (const r of live(p.revisions)) {
    if (r.goalId !== g.id) continue
    const date = dayOf(r.timestamp)
    if (r.field === 'state') {
      const text = STATE_TEXT[r.newValue as GoalState]
      if (text && r.oldValue !== 'backlog') out.push({ date, kind: 'state', text })
    } else if (r.field === 'tolerancePct') {
      out.push({ date, kind: 'tolerance', text: `Tolerance ${r.oldValue}% → ${r.newValue}%` })
    } else if (r.field.endsWith(' target') || r.field.endsWith(' how often')) {
      out.push({ date, kind: 'target', text: `${r.field.replace(/ how often$/, '')} ${r.oldValue} → ${r.newValue}` })
    } else if (r.field === 'commitment' && date > g.startDate) {
      out.push({ date, kind: 'commitment', text: r.newValue === 'removed' ? 'Commitment removed' : 'Commitment added' })
    }
  }
  for (const c of p.commitmentsOf(g)) {
    for (const prep of live(p.snap.preps)) {
      if (prep.commitmentId !== c.id) continue
      // Preps set up with the commitment are the original plan.
      const made = dayOf(prep.createdAt)
      const edited = dayOf(prep.updatedAt)
      if (made > dayOf(c.createdAt)) out.push({ date: made, kind: 'prep', text: `Prep added: ${prep.title}` })
      if (edited > made && edited > dayOf(c.createdAt)) out.push({ date: edited, kind: 'prep', text: `Prep changed: ${prep.title}` })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function goalTrend(p: Prepared, g: Goal): GoalTrend | null {
  const life = p.lives.get(g.id)!
  if (life.segments.length === 0 || p.commitmentsOf(g).length === 0) return null
  const end = minDate(p.lastWeek.end, life.segments.at(-1)!.end)
  const start = maxDate(life.segments[0].start, addDays(periodOf(end, 'week').start, -7 * (TREND_WEEKS - 1)))
  if (start > end) return null
  const points = weekPoints(p, g, start, end)
  const valued = points.filter((x) => x.pct != null)
  const markers = planChanges(p, g)
    .filter((m) => m.date >= points[0]?.start && m.date <= end)
    .map((m) => {
      const week = periodOf(m.date, 'week').start
      const side = (xs: WeekPoint[]) => {
        const v = xs.filter((x) => x.pct != null).map((x) => x.pct!)
        return v.length >= 2 ? mean(v) : null
      }
      return {
        ...m,
        before: side(points.filter((x) => x.start < week).slice(-EFFECT_WEEKS)),
        after: side(points.filter((x) => x.start > week).slice(0, EFFECT_WEEKS)),
      }
    })
  const recent = mean(valued.slice(-LOOKBACK_WEEKS).map((x) => x.pct!))
  return { goal: g, points, weeksWithData: valued.length, recent, markers, takeaway: trendTakeaway(points, markers, recent) }
}

const r0 = (n: number) => Math.round(n)

function trendTakeaway(points: WeekPoint[], markers: Marker[], recent: number | null): string {
  const effect = markers.filter((m) => m.before != null && m.after != null && Math.abs(m.after - m.before) >= CLEAR_DIFF).at(-1)
  if (effect) return `${effect.text} (${dayMonth(effect.date)}): ${r0(effect.before!)}% → ${r0(effect.after!)}%`
  const vals = points.filter((x) => x.pct != null).slice(-8).map((x) => x.pct!)
  if (vals.length >= 4) {
    const half = Math.floor(vals.length / 2)
    const a = mean(vals.slice(0, half))!
    const b = mean(vals.slice(half))!
    if (b - a >= CLEAR_DIFF) return `Up from ${r0(a)}% to ${r0(b)}% over ${vals.length} weeks`
    if (a - b >= CLEAR_DIFF) return `Down from ${r0(a)}% to ${r0(b)}% over ${vals.length} weeks`
  }
  return recent == null ? 'Nothing to judge yet' : `Steady around ${r0(recent)}%`
}

// ——— tolerance vs actual ———

export interface ToleranceRow {
  goal: Goal
  tolerance: number
  actual: number
  band: 'above' | 'near' | 'below'
}

/** Whether tolerances match reality: a bar far below what you do is too easy; far above, too hard. */
export function toleranceCheck(trends: GoalTrend[]): { rows: ToleranceRow[]; takeaway: string } {
  const rows = trends
    .filter((t) => t.weeksWithData >= MIN_WEEKS && t.recent != null && isLive(t.goal.state))
    .map((t): ToleranceRow => {
      const tol = t.goal.tolerancePct
      const actual = t.recent!
      const band = actual >= tol + 15 && tol < 95 ? 'above' : actual < tol - 15 ? 'below' : 'near'
      return { goal: t.goal, tolerance: tol, actual, band }
    })
  const above = rows.filter((r) => r.band === 'above').map((r) => r.goal.title)
  const below = rows.filter((r) => r.band === 'below').map((r) => r.goal.title)
  const parts: string[] = []
  if (above.length) parts.push(`${list(above)} ${above.length === 1 ? 'runs' : 'run'} well above ${above.length === 1 ? 'its' : 'their'} tolerance: the bar may be too low.`)
  if (below.length) parts.push(`${list(below)} ${below.length === 1 ? 'is' : 'are'} far below: the target or the tolerance may be too ambitious.`)
  return { rows, takeaway: parts.join(' ') || (rows.length ? 'Tolerances look realistic.' : '') }
}

function list(xs: string[]): string {
  const q = xs.map((x) => `“${x}”`)
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q.at(-1)}`
}

// ——— what gets in the way ———

export interface Obstacles {
  total: number
  reasons: { reason: MissReason; count: number }[]
  displacements: { label: string; count: number; goals: { goal: Goal; count: number }[] }[]
  takeaway: string
}

const REASON_FIX: Record<MissReason, string> = {
  forgot: 'A prep is the usual fix: a cue before the moment.',
  chose_other: 'The moment keeps getting lost: remove friction beforehand.',
  no_time: 'Some targets may be too big for your real weeks.',
  too_tired: 'Look at sleep, and at when these are scheduled.',
}
const REASON_SHORT: Record<MissReason, string> = {
  forgot: 'forgot', chose_other: 'chose something else', no_time: 'no time', too_tired: 'too tired',
}

/** Miss reasons across every goal. `goalId` narrows it to one goal. */
export function obstacles(p: Prepared, from: DateStr, goalId?: ID): Obstacles {
  const owner = new Map(live(p.snap.commitments).map((c) => [c.id, c.goalId]))
  const misses = [...owner.keys()]
    .filter((id) => !goalId || owner.get(id) === goalId)
    .flatMap((id) => p.entriesOf(id))
    .filter((e) => e.outcome === 'miss' && e.missReason && e.date >= from && e.date <= p.ctx.today)
  const reasons = new Map<MissReason, number>()
  const disp = new Map<string, Map<ID, number>>()
  for (const e of misses) {
    reasons.set(e.missReason!, (reasons.get(e.missReason!) ?? 0) + 1)
    const label = e.displacementId && p.displacements.find((d) => d.id === e.displacementId)?.label
    if (label) {
      const byGoal = disp.get(label) ?? new Map<ID, number>()
      const g = owner.get(e.subjectId)!
      byGoal.set(g, (byGoal.get(g) ?? 0) + 1)
      disp.set(label, byGoal)
    }
  }
  const out: Obstacles = {
    total: misses.length,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    displacements: [...disp]
      .map(([label, byGoal]) => ({
        label,
        count: [...byGoal.values()].reduce((a, b) => a + b, 0),
        goals: [...byGoal]
          .map(([id, count]) => ({ goal: p.snap.goals.find((g) => g.id === id)!, count }))
          .filter((x) => x.goal)
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count),
    takeaway: '',
  }
  const spread = out.displacements.find((d) => d.goals.length >= 2)
  const top = out.reasons[0]
  if (!goalId && spread) {
    out.takeaway = `“${spread.label}” got in the way of ${list(spread.goals.map((x) => x.goal.title))}. It might deserve a goal of its own.`
  } else if (top) {
    out.takeaway = `Most misses: ${REASON_SHORT[top.reason]} (${top.count} of ${out.total}). ${REASON_FIX[top.reason]}`
  }
  return out
}

// ——— prep effect ———

export type PrepVerdict = 'works' | 'some' | 'no_difference' | 'always' | 'too_new'

export interface PrepEffect {
  prep: Prep
  commitment: Commitment
  goal: Goal
  done: { n: number; rate: number | null }
  skipped: { n: number; rate: number | null }
  verdict: PrepVerdict
}

/**
 * How the commitment went after the prep was done versus skipped. Each firing
 * owns the days until the next one: an evening prep counts from the next day,
 * a morning one from the same day.
 */
export function prepEffect(p: Prepared, prep: Prep): PrepEffect | null {
  const c = live(p.snap.commitments).find((x) => x.id === prep.commitmentId)
  const goal = c && p.snap.goals.find((g) => g.id === c.goalId)
  if (!c || !goal || prep.fireWeekdays.length === 0) return null
  const evening = (parseTime(prep.fireTime) ?? 0) >= 12 * 60
  const since = maxDate(maxDate(dayOf(prep.createdAt), c.startDate), addDays(p.lastWeek.start, -7 * (TREND_WEEKS - 1)))
  const doneDays = new Set(p.entriesOf(prep.id).filter((e) => e.outcome === 'hit').map((e) => e.date))
  const life = p.lives.get(goal.id)!
  const done: number[] = []
  const skipped: number[] = []
  for (let d = since; d <= p.yesterday; d = addDays(d, 1)) {
    if (!prep.fireWeekdays.includes(isoWeekday(d))) continue
    let next = addDays(d, 1)
    while (!prep.fireWeekdays.includes(isoWeekday(next))) next = addDays(next, 1)
    const window = evening ? { start: addDays(d, 1), end: next } : { start: d, end: addDays(next, -1) }
    if (window.end > p.yesterday || liveParts(life, window).length === 0) continue
    const result = windowResult(p, c, window)
    if (result == null) continue
    ;(doneDays.has(d) ? done : skipped).push(result)
  }
  const rate = (xs: number[]) => (xs.length ? (100 * xs.reduce((a, b) => a + b, 0)) / xs.length : null)
  const out = { prep, commitment: c, goal, done: { n: done.length, rate: rate(done) }, skipped: { n: skipped.length, rate: rate(skipped) } }
  let verdict: PrepVerdict
  if (done.length < 3) verdict = 'too_new'
  else if (skipped.length < 2) verdict = 'always'
  else {
    const diff = out.done.rate! - out.skipped.rate!
    verdict = diff >= 15 ? 'works' : diff >= 5 ? 'some' : 'no_difference'
  }
  return { ...out, verdict }
}

/** 0–1: how the commitment went in a window, or null if there was nothing to judge. */
function windowResult(p: Prepared, c: Commitment, w: Span): number | null {
  const mine = p.entriesOf(c.id)
  if (c.shape === 'rhythm') return mine.some((e) => e.outcome === 'hit' && inSpan(e.date, w)) ? 1 : 0
  if (c.shape === 'standard') {
    const judged = mine.filter((e) => e.occurrenceId && inSpan(e.date, w))
    return judged.length ? judged.filter((e) => e.outcome === 'hit').length / judged.length : null
  }
  if (c.cadence.period !== 'day') return null
  const days = periodsBetween(maxDate(w.start, c.startDate), w.end, 'day')
  if (days.length === 0) return null
  const kept = days.filter((d) => evaluateThreshold(c, mine.filter((e) => e.date === d.start), true, p.ctx.rolloverHour) === 'hit')
  return kept.length / days.length
}

// ——— weekday pattern ———

export interface WeekdayPattern {
  commitment: Commitment
  goal: Goal
  /** Monday first. */
  days: { kept: number; judged: number }[]
  /** Weekdays that clearly stand out, worst first. */
  slips: { weekday: number; missed: number; judged: number }[]
}

/** Which weekdays daily commitments (and one-off standards) slip on. */
export function weekdayPattern(p: Prepared, c: Commitment, from: DateStr): WeekdayPattern | null {
  const goal = p.snap.goals.find((g) => g.id === c.goalId)
  if (!goal) return null
  if (c.shape === 'rhythm' || (c.shape === 'threshold' && c.cadence.period !== 'day')) return null
  const days = Array.from({ length: 7 }, () => ({ kept: 0, judged: 0 }))
  const life = p.lives.get(goal.id)!
  const mine = p.entriesOf(c.id)
  const span = { start: maxDate(from, c.startDate), end: p.yesterday }
  for (const part of liveParts(life, span)) {
    if (c.shape === 'standard') {
      for (const e of mine) {
        if (!e.occurrenceId || !inSpan(e.date, part)) continue
        const cell = days[isoWeekday(e.date) - 1]
        cell.judged++
        if (e.outcome === 'hit') cell.kept++
      }
    } else {
      for (let d = part.start; d <= part.end; d = addDays(d, 1)) {
        const cell = days[isoWeekday(d) - 1]
        cell.judged++
        if (evaluateThreshold(c, mine.filter((e) => e.date === d), true, p.ctx.rolloverHour) === 'hit') cell.kept++
      }
    }
  }
  const judged = days.reduce((a, d) => a + d.judged, 0)
  if (judged < 7) return null
  const overall = 1 - days.reduce((a, d) => a + d.kept, 0) / judged
  const slips = days
    .map((d, i) => ({ weekday: i + 1, missed: d.judged - d.kept, judged: d.judged }))
    .filter((d) => d.judged >= 3 && d.missed / d.judged >= 0.5 && d.missed / d.judged >= overall + 0.25)
    .sort((a, b) => b.missed / b.judged - a.missed / a.judged)
  return { commitment: c, goal, days, slips }
}

// ——— near misses ———

export interface NearMiss {
  commitment: Commitment
  goal: Goal
  kind: 'quantity' | 'time' | 'late'
  /** Every judged value: the quantity, the time in minutes into the day, or minutes late (negative: early). */
  values: { value: number; hit: boolean }[]
  target: number
  misses: number
  /** How far misses fall from the target, on average: units, or minutes. */
  avgGap: number
  close: boolean
}

/** How far off the misses are, for commitments with a number: 7.4 h and 5 h need different fixes. */
export function nearMiss(p: Prepared, c: Commitment, from: DateStr): NearMiss | null {
  const goal = p.snap.goals.find((g) => g.id === c.goalId)
  if (!goal) return null
  const mine = p.entriesOf(c.id)
  const values: NearMiss['values'] = []
  let kind: NearMiss['kind']
  let target: number
  if (c.shape === 'standard' && c.checkinType === 'timestamp') {
    kind = 'late'
    target = 0
    for (const o of p.snap.occurrences) {
      if (o.commitmentId !== c.id || o.date < from) continue
      const e = mine.find((x) => x.occurrenceId === o.id)
      const agreed = parseTime(o.scheduledAt.slice(11, 16))
      if (!e || e.value == null || agreed == null) continue
      values.push({ value: minutesIntoDay(e.value, p.ctx.rolloverHour) - minutesIntoDay(agreed, p.ctx.rolloverHour), hit: e.outcome === 'hit' })
    }
  } else if (c.shape === 'threshold' && c.checkinType !== 'binary' && c.targetValue != null) {
    kind = c.checkinType === 'timestamp' ? 'time' : 'quantity'
    target = kind === 'time' ? minutesIntoDay(c.targetValue, p.ctx.rolloverHour) : c.targetValue
    for (const period of periodsBetween(maxDate(from, c.startDate), p.yesterday, c.cadence.period)) {
      if (period.end > p.yesterday) continue
      const agg = thresholdAggregate(c, mine.filter((e) => inSpan(e.date, period)))
      if (agg == null) continue
      values.push({
        value: kind === 'time' ? minutesIntoDay(agg, p.ctx.rolloverHour) : agg,
        hit: meetsTarget(c, agg, p.ctx.rolloverHour),
      })
    }
  } else {
    return null
  }
  const missed = values.filter((v) => !v.hit)
  if (missed.length < 2) return null
  const avgGap = mean(missed.map((v) => Math.abs(v.value - target)))!
  const close = kind === 'quantity' ? avgGap <= Math.abs(target) * 0.1 : avgGap <= 15
  return { commitment: c, goal, kind, values, target, misses: missed.length, avgGap, close }
}

// ——— value balance ———

export interface ValueMonth {
  /** First day of the month. */
  month: DateStr
  /** Weeks on track per value, in the order of `values`. */
  counts: number[]
}

export interface ValueBalance {
  values: Value[]
  months: ValueMonth[]
  /** Weeks on track per value over the whole span. */
  totals: number[]
  takeaway: string
}

/** Weeks on track, per value, per month: what the effort actually went to. */
export function valueBalance(p: Prepared, monthsBack = 6): ValueBalance {
  const values = live(p.snap.values)
  const [y, m] = p.ctx.today.split('-').map(Number)
  const back = y * 12 + (m - 1) - (monthsBack - 1)
  const first = `${Math.floor(back / 12)}-${String((back % 12) + 1).padStart(2, '0')}-01`
  const months = periodsBetween(first, p.lastWeek.end, 'month').map((m) => ({ month: m.start, counts: values.map(() => 0) }))
  const runningLately = values.map(() => false)
  const recentFrom = addDays(p.lastWeek.start, -7 * (LOOKBACK_WEEKS - 1))
  for (const g of p.snap.goals) {
    const vi = values.findIndex((v) => v.id === g.whyValueId)
    if (vi < 0 || p.commitmentsOf(g).length === 0) continue
    for (const w of weekPoints(p, g, first, p.lastWeek.end)) {
      if (w.pct == null) continue
      if (w.start >= recentFrom) runningLately[vi] = true
      const m = months.find((x) => x.month === w.start.slice(0, 8) + '01')
      if (m && w.pct >= g.tolerancePct - 1e-9) m.counts[vi]++
    }
  }
  const totals = values.map((_, i) => months.reduce((a, m) => a + m.counts[i], 0))
  const idle = values.filter((_, i) => !runningLately[i]).map((v) => v.name)
  const struggling = values.filter((_, i) => runningLately[i] && months.slice(-3).every((m) => m.counts[i] === 0)).map((v) => v.name)
  const parts: string[] = []
  if (idle.length) parts.push(`Nothing running for ${idle.join(' or ')} in the last ${LOOKBACK_WEEKS} weeks.`)
  if (struggling.length) parts.push(`${struggling.join(' and ')}: goals running, but no week on track lately.`)
  return { values, months, totals, takeaway: parts.join(' ') || 'Every value got some kept weeks lately.' }
}

// ——— goals timeline ———

export interface TimelineRow {
  life: GoalLife
  /** Days the plan changed (targets, preps, tolerance). */
  ticks: DateStr[]
}

export interface Timeline {
  from: DateStr
  to: DateStr
  /** First day of each month shown. */
  months: DateStr[]
  rows: TimelineRow[]
}

/** Every goal that ran in the last year, as bars from start to end. */
export function timeline(p: Prepared): Timeline {
  const yearAgo = periodOf(addDays(p.ctx.today, -334), 'month').start
  const lives = [...p.lives.values()].filter((l) => l.segments.some((s) => s.end >= yearAgo))
  const earliest = lives.map((l) => l.segments[0].start).sort()[0] ?? p.ctx.today
  const from = periodOf(maxDate(earliest, yearAgo), 'month').start
  const to = p.ctx.today
  const rows = lives
    .sort((a, b) => a.segments[0].start.localeCompare(b.segments[0].start) || a.goal.priority - b.goal.priority)
    .map((life) => ({
      life,
      ticks: planChanges(p, life.goal).filter((m) => m.kind !== 'state' && m.date >= from).map((m) => m.date),
    }))
  return { from, to, months: periodsBetween(from, to, 'month').map((m) => m.start), rows }
}

// ——— project burn-up ———

export interface Burnup {
  project: Project
  total: number
  /** Day each step was done, oldest first. */
  done: DateStr[]
  start: DateStr
  /** At the pace so far; null with nothing done yet, or nothing left. */
  projected: DateStr | null
  text: string
}

function lateness(days: number): string {
  const n = Math.abs(days)
  return n < 14 ? plural(n, 'day') : n < 60 ? plural(Math.round(n / 7), 'week') : plural(Math.round(n / 30.4), 'month')
}

export function burnup(p: Prepared, project: Project): Burnup {
  const steps = live(p.snap.tasks).filter((t) => t.projectId === project.id)
  const done = steps
    .map((s) => p.entriesOf(s.id).filter((e) => e.outcome === 'hit').map((e) => e.date).sort()[0])
    .filter((d): d is DateStr => !!d)
    .sort()
  const start = minDate(dayOf(project.createdAt), done[0] ?? dayOf(project.createdAt))
  const remaining = steps.length - done.length
  let projected: DateStr | null = null
  let text: string
  if (project.state === 'done') {
    const end = done.at(-1) ?? dayOf(project.updatedAt)
    const d = diffDays(end, project.targetDate)
    text = `Done ${dayMonth(end)}, ${d === 0 ? 'on the day' : d > 0 ? `${lateness(d)} early` : `${lateness(d)} late`}`
  } else if (remaining === 0) {
    text = `All ${steps.length} steps done`
  } else if (done.length === 0) {
    text = `No steps done yet · due ${dayMonth(project.targetDate)}`
  } else {
    const pace = done.length / Math.max(7, diffDays(start, p.ctx.today))
    projected = addDays(p.ctx.today, Math.ceil(remaining / pace))
    const late = diffDays(project.targetDate, projected)
    text = `${done.length} of ${steps.length} · at this pace, done ${dayMonth(projected)}`
      + (late > 0 ? ` (${lateness(late)} after the target)` : ' (in time)')
  }
  return { project, total: steps.length, done, start, projected, text }
}

export function burnups(p: Prepared): Burnup[] {
  const since = addDays(p.ctx.today, -183)
  return live(p.snap.projects)
    .filter((pr) => pr.state === 'active' || pr.state === 'done')
    .map((pr) => burnup(p, pr))
    .filter((b) => b.total > 0 && (b.project.state === 'active' || (b.done.at(-1) ?? '') >= since))
    .sort((a, b) => (a.project.state === b.project.state ? a.project.targetDate.localeCompare(b.project.targetDate) : a.project.state === 'active' ? -1 : 1))
}

// ——— year in review ———

export interface YearReview {
  year: number
  /** December, or January looking back: the year is (nearly) over. */
  final: boolean
  started: Goal[]
  finished: Goal[]
  toMaintenance: Goal[]
  bestMonth: { month: DateStr; pct: number } | null
  mostKept: { goal: Goal; onTrack: number; weeks: number } | null
  topDisplacement: { label: string; count: number } | null
  reviews: number
  planChanges: number
  projectsDone: number
}

export function yearReview(p: Prepared): YearReview {
  const month = Number(p.ctx.today.slice(5, 7))
  const year = Number(p.ctx.today.slice(0, 4)) - (month === 1 ? 1 : 0)
  const span = { start: `${year}-01-01`, end: minDate(`${year}-12-31`, p.lastWeek.end) }
  const inYear = (d: DateStr) => d >= span.start && d <= `${year}-12-31`
  const stateRevs = live(p.revisions).filter((r) => r.field === 'state' && inYear(dayOf(r.timestamp)))
  const goalsTo = (state: GoalState) => [...new Set(stateRevs.filter((r) => r.newValue === state).map((r) => r.goalId))]
    .map((id) => p.snap.goals.find((g) => g.id === id))
    .filter((g): g is Goal => !!g)

  // Every goal-week in the year, to find the best month and the most-kept goal.
  const byMonth = new Map<string, number[]>()
  let mostKept: YearReview['mostKept'] = null
  for (const g of p.snap.goals) {
    if (p.commitmentsOf(g).length === 0 || span.start > span.end) continue
    let onTrack = 0
    let weeks = 0
    for (const w of weekPoints(p, g, span.start, span.end)) {
      if (w.pct == null || w.start < span.start) continue
      weeks++
      if (w.pct >= g.tolerancePct - 1e-9) onTrack++
      const key = w.start.slice(0, 7)
      byMonth.set(key, [...(byMonth.get(key) ?? []), w.pct])
    }
    if (weeks >= MIN_WEEKS && (!mostKept || onTrack > mostKept.onTrack)) mostKept = { goal: g, onTrack, weeks }
  }
  let bestMonth: YearReview['bestMonth'] = null
  for (const [m, pcts] of byMonth) {
    if (pcts.length < 3) continue
    const v = mean(pcts)!
    if (!bestMonth || v > bestMonth.pct) bestMonth = { month: `${m}-01`, pct: v }
  }

  const counts = new Map<string, number>()
  for (const e of activeEntries(p.snap.entries)) {
    if (e.outcome !== 'miss' || !e.displacementId || !inYear(e.date)) continue
    const label = p.displacements.find((d) => d.id === e.displacementId)?.label
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const [top] = [...counts].sort((a, b) => b[1] - a[1])

  return {
    year,
    final: month === 12 || month === 1,
    started: [...p.lives.values()].filter((l) => l.segments[0] && inYear(l.segments[0].start)).map((l) => l.goal),
    finished: goalsTo('completed'),
    toMaintenance: goalsTo('maintenance'),
    bestMonth,
    mostKept,
    topDisplacement: top ? { label: top[0], count: top[1] } : null,
    reviews: live(p.weekReviews).filter((w) => w.doneAt && inYear(w.week)).length,
    planChanges: live(p.revisions).filter((r) => r.field !== 'state' && inYear(dayOf(r.timestamp))).length,
    projectsDone: burnupsDoneIn(p, year),
  }
}

function burnupsDoneIn(p: Prepared, year: number): number {
  return live(p.snap.projects)
    .filter((pr) => pr.state === 'done')
    .filter((pr) => (burnup(p, pr).done.at(-1) ?? dayOf(pr.updatedAt)).startsWith(String(year))).length
}

// ——— everything the screen needs ———

export interface GoalsView {
  trends: GoalTrend[]
  /** Running goals without MIN_WEEKS of data yet. */
  tooNew: Goal[]
  ended: GoalTrend[]
  tolerance: ReturnType<typeof toleranceCheck>
}

export function goalsView(p: Prepared): GoalsView {
  const trends = p.snap.goals
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((g) => goalTrend(p, g))
    .filter((t): t is GoalTrend => !!t)
  const running = trends.filter((t) => isLive(t.goal.state))
  return {
    trends: running.filter((t) => t.weeksWithData >= MIN_WEEKS),
    tooNew: running.filter((t) => t.weeksWithData < MIN_WEEKS).map((t) => t.goal),
    ended: trends
      .filter((t) => !isLive(t.goal.state) && t.weeksWithData >= MIN_WEEKS)
      .sort((a, b) => (p.lives.get(b.goal.id)!.ended?.date ?? '').localeCompare(p.lives.get(a.goal.id)!.ended?.date ?? '')),
    tolerance: toleranceCheck(running),
  }
}

export interface PatternsView {
  from: DateStr
  obstacles: Obstacles
  preps: PrepEffect[]
  weekdays: WeekdayPattern[]
  nearMisses: NearMiss[]
}

export function patternsView(p: Prepared): PatternsView {
  const from = addDays(p.lastWeek.start, -7 * (LOOKBACK_WEEKS - 1))
  const running = new Set(p.snap.goals.filter((g) => isLive(g.state)).map((g) => g.id))
  const order = new Map(p.snap.goals.map((g) => [g.id, g.priority]))
  const cs = live(p.snap.commitments)
    .filter((c) => running.has(c.goalId))
    .sort((a, b) => order.get(a.goalId)! - order.get(b.goalId)!)
  return {
    from,
    obstacles: obstacles(p, from),
    preps: cs.flatMap((c) => live(p.snap.preps).filter((x) => x.commitmentId === c.id))
      .map((x) => prepEffect(p, x))
      .filter((x): x is PrepEffect => !!x && x.verdict !== 'too_new'),
    weekdays: cs.map((c) => weekdayPattern(p, c, from)).filter((x): x is WeekdayPattern => !!x),
    nearMisses: cs.map((c) => nearMiss(p, c, from)).filter((x): x is NearMiss => !!x),
  }
}
