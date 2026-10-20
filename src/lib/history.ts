import { num, t } from '../i18n'
import { diffDays, inSpan, maxDate, periodsBetween, spanDays, type Span } from './dates'
import { formatValue, reasonLower } from './describe'
import { activeEntries, evaluateThreshold, meetsTarget, thresholdAggregate, type ScoreContext } from './scoring'
import type { Commitment, DateStr, Displacement, Entry, Occurrence } from './types'

/** add: one value toward a weekly or monthly total, neither a hit nor a miss on its own. */
export type HistoryKind = 'hit' | 'miss' | 'undone' | 'add'

export interface HistoryRow {
  key: string
  date: DateStr
  /** Orders rows within a day. */
  at: string
  kind: HistoryKind
  text: string
  /** The reasons given, in words: "too tired", "phone ×2". */
  why?: string
  note?: string
  struck?: boolean
}

/** Only a reason: the miss entry written when a miss is explained. */
const reasonOnly = (e: Entry) => e.outcome === 'miss' && e.value == null && !e.occurrenceId

function whyText(misses: Entry[], displacements: Displacement[]): string | undefined {
  const counts = new Map<string, number>()
  for (const e of misses) {
    if (e.outcome !== 'miss' || !e.missReason) continue
    const w = displacements.find((d) => d.id === e.displacementId)?.label ?? reasonLower(e.missReason)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  if (!counts.size) return undefined
  return [...counts].map(([w, n]) => (n > 1 ? `${w} ×${n}` : w)).join(', ')
}

const COUNT = { day: 'history.countDay', week: 'history.countWeek', month: 'history.countMonth' } as const
const TOTAL = { day: 'history.totalWeek', week: 'history.totalWeek', month: 'history.totalMonth' } as const

/**
 * One commitment's history, unsorted: what was logged, plus how each finished
 * day, week or month came out, so a period with nothing logged still shows.
 * Reasons sit on the row they explain, not on rows of their own.
 */
export function commitmentHistory(
  c: Commitment,
  allEntries: Entry[],
  occurrences: Occurrence[],
  ctx: ScoreContext,
  displacements: Displacement[],
): HistoryRow[] {
  const entries = allEntries.filter((e) => e.subjectType === 'commitment' && e.subjectId === c.id && !e.deletedAt)
  const active = activeEntries(entries)
  const replacedBy = new Map<string, Entry>()
  entries.forEach((e) => e.supersedes && replacedBy.set(e.supersedes, e))
  const daily = c.cadence.period === 'day'
  const valued = c.shape === 'threshold' && c.checkinType !== 'binary'
  const reasonsIn = (span: Span) => active.filter((e) => reasonOnly(e) && inSpan(e.date, span))
  const rows: HistoryRow[] = []

  // ——— what was logged ———
  for (const e of entries) {
    if (e.outcome === 'void' || reasonOnly(e)) continue
    const by = replacedBy.get(e.id)
    // A reason added later supersedes the entry without changing what happened.
    if (by && by.outcome === e.outcome && by.value === e.value && by.occurrenceId === e.occurrenceId) continue
    const struck = !!by
    const base = { key: e.id, date: e.date, at: e.recordedAt, note: e.note ?? undefined, struck }

    if (c.shape === 'standard') {
      const o = occurrences.find((x) => x.id === e.occurrenceId)
      let text = [c.label, o?.title].filter(Boolean).join(' · ')
      if (e.value != null) {
        const agreed = o?.scheduledAt.slice(11, 16)
        const actual = formatValue(c, e.value)
        text += ` · ${agreed && agreed !== '00:00' ? t('history.arrivedFor', { actual, agreed }) : actual}`
      }
      const kind = struck ? 'undone' : e.outcome === 'hit' ? 'hit' : 'miss'
      rows.push({ ...base, kind, text, why: kind === 'miss' ? whyText([e], displacements) : undefined })
    } else if (valued && !daily) {
      rows.push({ ...base, kind: struck ? 'undone' : 'add', text: `${c.label} +${formatValue(c, e.value)}` })
    } else if (valued) {
      const hit = e.value != null && meetsTarget(c, e.value, ctx.rolloverHour)
      const kind = struck ? 'undone' : hit ? 'hit' : 'miss'
      const why = kind === 'miss' ? whyText(reasonsIn({ start: e.date, end: e.date }), displacements) : undefined
      rows.push({ ...base, kind, text: `${c.label} ${formatValue(c, e.value)}`, why })
    } else if (e.outcome === 'hit') {
      rows.push({ ...base, kind: struck ? 'undone' : 'hit', text: c.label })
    }
  }

  // ——— how each period came out ———
  if (c.shape === 'standard' || c.deletedAt || c.startDate > ctx.today) return rows
  for (const p of periodsBetween(c.startDate, ctx.today, c.cadence.period)) {
    const closed = p.end < ctx.today
    const span = { start: maxDate(p.start, c.startDate), end: p.end }
    const inP = active.filter((e) => inSpan(e.date, span))
    const hits = inP.filter((e) => e.outcome === 'hit')
    const lastDay = [...inP].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date ?? p.end
    const push = (kind: 'hit' | 'miss', text: string, date: DateStr = p.end) => rows.push({
      key: `period:${c.id}:${p.start}`, date, at: `${date}T23:59:59`, kind, text,
      why: kind === 'miss' ? whyText(inP.filter(reasonOnly), displacements) : undefined,
    })

    if (c.shape === 'rhythm') {
      const times = c.cadence.times
      const expected = Math.round((times * (diffDays(span.start, p.end) + 1)) / spanDays(p))
      const text = t(COUNT[c.cadence.period], { name: c.label, n: hits.length, times: expected })
      if (!closed) {
        // A week or month still running only shows once it's reached.
        if (!daily && hits.length >= times) push('hit', t(COUNT[c.cadence.period], { name: c.label, n: hits.length, times }), lastDay)
      } else if (expected > 0 && hits.length < expected) {
        push('miss', daily && times === 1 ? t('history.notDone', { name: c.label }) : text)
      } else if (expected > 0 && !daily) {
        push('hit', text)
      }
    } else if (!valued) {
      if (closed && !hits.length) push('miss', t('history.notDone', { name: c.label }))
    } else if (daily) {
      if (closed && !inP.some((e) => e.value != null)) push('miss', t('history.notLogged', { name: c.label }))
    } else {
      const ev = evaluateThreshold(c, inP, closed, ctx.rolloverHour)
      if (ev !== 'hit' && ev !== 'miss') continue
      const total = formatValue(c, thresholdAggregate(c, inP) ?? 0)
      const cmp = c.comparator === 'lte' ? '≤' : '≥'
      const target = c.targetValue == null ? '' : `${cmp} ${num(c.targetValue)}`
      push(ev, t(TOTAL[c.cadence.period], { name: c.label, total, target }).trim(), closed ? p.end : lastDay)
    }
  }
  return rows
}

/** Newest first. */
export const byNewest = (a: { date: DateStr; at: string }, b: { date: DateStr; at: string }) =>
  b.date.localeCompare(a.date) || b.at.localeCompare(a.at)

