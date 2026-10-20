import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { addDays, isDateStr, monthShort, weekdayAbbr } from '../lib/dates'
import { byNewest, commitmentHistory, type HistoryRow } from '../lib/history'
import { revisionField, revisionValue, stateLabel } from '../lib/revisions'
import type { Snapshot } from '../lib/today'
import type { DateStr, Goal } from '../lib/types'
import { DatePickerButton, Sheet } from '../ui/components'
import { useDisplacements, useGoalReviews, useRevisions, useSettings } from '../ui/hooks'
import { IconCalendar } from '../ui/icons'
import { navigate } from '../ui/router'

type Kind = HistoryRow['kind'] | 'change' | 'review'

interface Row {
  key: string
  date: DateStr
  at: string
  kind: Kind
  text: ReactNode
  sub?: string
  struck?: boolean
  quiet?: boolean
}

const MARK: Record<Kind, string> = { hit: '✓', miss: '✕', undone: '↺', add: '+', change: '✎', review: '★' }

/** A goal's timeline: check-ins, misses, corrections, edits and reviews, newest first. */
export function GoalHistorySheet(props: { goal: Goal; snap: Snapshot; today: DateStr; open: boolean; onClose: () => void }) {
  const { goal, snap, today } = props
  const revisions = useRevisions(goal.id)
  const reviews = useGoalReviews(goal.id)
  const displacements = useDisplacements()
  const settings = useSettings()
  const [limit, setLimit] = useState(60)
  if (!props.open) return null

  const commitments = snap.commitments.filter((c) => c.goalId === goal.id)
  const ctx = { today, rolloverHour: settings.rolloverHour }
  const rows: Row[] = commitments.flatMap((c) => commitmentHistory(c, snap.entries, snap.occurrences, ctx, displacements))
    .map((r) => ({ ...r, text: <>{r.text}{r.why && <span className="h-why"> · {r.why}</span>}</>, sub: r.note }))
  // Preps aren't scored: just the evenings they were done.
  const preps = new Map(snap.preps.filter((p) => commitments.some((c) => c.id === p.commitmentId)).map((p) => [p.id, p]))
  const prepEntries = snap.entries.filter((e) => e.subjectType === 'prep' && preps.has(e.subjectId) && !e.deletedAt)
  const undone = new Set(prepEntries.map((e) => e.supersedes).filter(Boolean))
  for (const e of prepEntries) {
    if (e.outcome !== 'hit') continue
    rows.push({ key: e.id, date: e.date, at: e.recordedAt, kind: undone.has(e.id) ? 'undone' : 'hit', text: <>{preps.get(e.subjectId)!.title}</>, struck: undone.has(e.id), quiet: true })
  }
  // Old and new revisions alike are shown in the current language.
  const rctx = { goal, valueName: (id: string) => snap.values.find((v) => v.id === id)?.name }
  for (const r of revisions) {
    const added = r.field === 'commitment' && r.oldValue === '—'
    const removed = r.field === 'commitment' && r.newValue === 'removed'
    rows.push({
      key: r.id, date: r.timestamp.slice(0, 10), at: r.timestamp, kind: 'change',
      text: added ? <>{t('history.added', { what: r.newValue })}</> : removed ? <>{t('history.removed', { what: r.oldValue })}</>
        : <>{revisionField(r, rctx)}: <s>{revisionValue(r, 'old', rctx)}</s> → {revisionValue(r, 'new', rctx)}</>,
    })
  }
  const outcomeWord = (o: string) => (o === 'renewed' ? t('goalReview.renew') : stateLabel(o as 'completed')).toLowerCase()
  for (const r of reviews) {
    rows.push({
      key: r.id, date: r.timestamp.slice(0, 10), at: r.timestamp, kind: 'review',
      text: <>{t('history.review', { result: t(r.hit ? 'history.hitIt' : 'history.didntHitIt'), outcome: outcomeWord(r.outcome) })}</>,
      sub: r.journalNote || r.whatHappened || undefined,
    })
  }
  rows.sort(byNewest)

  const shown = rows.slice(0, limit)
  const days: { date: DateStr; rows: Row[] }[] = []
  for (const r of shown) {
    const last = days.at(-1)
    if (last?.date === r.date) last.rows.push(r)
    else days.push({ date: r.date, rows: [r] })
  }

  const dayLabel = (d: DateStr) => {
    if (d === today) return t('dates.Today')
    if (d === addDays(today, -1)) return t('dates.Yesterday')
    return t('dates.historyDay', { wd: weekdayAbbr(d), day: String(Number(d.slice(8, 10))), mon: monthShort(d) })
  }

  return (
    <Sheet open onClose={props.onClose} title={t('goal.history')}>
      <DatePickerButton className="btn outline block backfill-btn" value={today} max={today} label={t('history.fillPastDay')}
        onPick={(d) => {
          // Opening an iOS date picker reports today's date before anything is picked: ignore it.
          if (!isDateStr(d) || d >= today) return
          props.onClose()
          navigate(`/day/${d}`)
        }}>
        <IconCalendar width={18} height={18} /> {t('history.fillPastDay')}
      </DatePickerButton>

      {days.length === 0 ? (
        <p className="muted" style={{ marginTop: 20 }}>{t('common.nothingYet')}</p>
      ) : (
        <div className="timeline">
          {days.map((d) => (
            <section key={d.date}>
              <h3>{dayLabel(d.date)}</h3>
              <ul>
                {d.rows.map((r) => (
                  <li key={r.key} className={`h-${r.kind} ${r.quiet ? 'h-quiet' : ''}`}>
                    <span className="h-mark" aria-label={r.kind}>{MARK[r.kind]}</span>
                    <div className="h-text">
                      <div className={r.struck ? 'h-struck' : undefined}>{r.text}</div>
                      {r.sub && <div className="h-sub">“{r.sub}”</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {rows.length > limit && <button className="link-btn" onClick={() => setLimit(limit + 60)}>{t('common.showMore')}</button>}
        </div>
      )}
    </Sheet>
  )
}
