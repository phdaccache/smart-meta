import { useMemo, useState } from 'react'
import { dismissInReview, markWeekReviewed, setGoalState, updateProject } from '../db/repo'
import { t, tk, tn, type Key } from '../i18n'
import { dayMonth, isDateStr, untilText } from '../lib/dates'
import { promptQuestion, reasonLower } from '../lib/describe'
import {
  buildReview, projectKey, reviewableWeeks, type DateNote, type GoalCard, type HandledProject, type ReasonCount, type StalledProject,
  type Suggestion, type SuggestionKind,
} from '../lib/review'
import { missKey, type MissPrompt, type ScoreContext } from '../lib/scoring'
import type { Commitment, Goal, Prep } from '../lib/types'
import { Field, InfoTip, Screen, Section, Sheet, StatusWord, toast } from '../ui/components'
import { useAllRevisions, useDisplacements, useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { IconCalendar, IconCheck, IconChevronRight } from '../ui/icons'
import { navigate, useLocation } from '../ui/router'
import { CommitmentSheet, PrepSheet } from './GoalDetail'
import { MissPromptCard } from './Today'

const QUESTION: Record<SuggestionKind, Key> = {
  add_prep: 'review.q.addPrep',
  change_prep: 'review.q.changePrep',
  lower_target: 'review.q.lowerTarget',
  pause: 'review.q.pause',
  maintenance: 'review.q.maintenance',
}

type Editing =
  | { kind: 'prep'; commitment: Commitment; prep: Prep | 'new' }
  | { kind: 'commitment'; goal: Goal; commitment: Commitment }

export function ReviewScreen() {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const revisions = useAllRevisions()
  const weekReviews = useWeekReviews()
  const displacements = useDisplacements()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [picking, setPicking] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const { query } = useLocation()
  const asked = query.get('week') ?? undefined
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])

  const r = useMemo(
    () => snap && revisions && weekReviews
      ? buildReview({ snap, revisions, displacements, weekReviews, ctx, goalCap: settings.goalCap }, asked)
      : null,
    [snap, revisions, weekReviews, displacements, ctx, settings.goalCap, asked],
  )
  const weeks = useMemo(
    () => snap && weekReviews ? reviewableWeeks(snap.goals, weekReviews, today) : [],
    [snap, weekReviews, today],
  )
  if (!snap || !r) return null

  const title = (
    <span className="title-row">{t('review.title')}
      <InfoTip label={t('review.about')}>{t('review.aboutText')} {t('review.aboutSuggestions')}</InfoTip>
    </span>
  )

  if (!r.ready) {
    return (
      <Screen title={title} settings>
        <div className="empty">
          <h2>{t('review.nothingYet')}</h2>
          <p className="muted">{t('review.firstOpens')}</p>
        </div>
      </Screen>
    )
  }

  const accept = async (s: Suggestion, alt = false) => {
    const goal = snap.goals.find((g) => g.id === s.goalId)!
    const c = snap.commitments.find((x) => x.id === s.commitmentId)
    if (s.kind === 'add_prep' && c) return setEditing({ kind: 'prep', commitment: c, prep: 'new' })
    if (s.kind === 'change_prep' && c) {
      const p = snap.preps.find((x) => x.id === s.prepId)
      return setEditing({ kind: 'prep', commitment: c, prep: p ?? 'new' })
    }
    if ((s.kind === 'lower_target' || (s.kind === 'pause' && alt)) && c) return setEditing({ kind: 'commitment', goal, commitment: c })
    if (s.kind === 'pause') {
      await setGoalState(goal, 'backlog')
      return toast(t('move.paused'))
    }
    if (s.kind === 'maintenance') {
      await setGoalState(goal, 'maintenance')
      return toast(t('move.nowMaintenance'))
    }
  }

  const missKeys = (p: MissPrompt) => p.slots.map((s) => missKey(p.commitmentId, s.date))
  const done = async () => {
    const open = [
      ...r.goals.map((g) => g.suggestion?.key).filter((k): k is string => !!k),
      ...r.loose.flatMap(missKeys),
      ...r.stalled.map((s) => projectKey(s.project.id, 'dismissed')),
    ]
    await markWeekReviewed(r.week.start, open)
    toast(open.length ? t('review.reviewedSetAside') : t('review.reviewed'))
  }
  const start = async (g: Goal) => {
    await setGoalState(g, 'active')
    setChoosing(false)
    toast(t('review.startedGoal', { name: g.title }))
  }

  const actions = (
    <>
      {!r.latest && <button className="btn" onClick={() => navigate('/review')}>{t('review.lastWeek')}</button>}
      {weeks.length > 1 && (
        <button className="icon-btn" aria-label={t('review.otherWeeks')} onClick={() => setPicking(true)}><IconCalendar /></button>
      )}
    </>
  )

  const nothing = !r.loose.length && !r.goals.length && !r.dates.length && !r.stalled.length && !r.next

  return (
    <Screen eyebrow={`${t('review.weekOf', { date: dayMonth(r.week.start) })}${r.reviewed ? t('review.reviewedTag') : ''}`} title={title} actions={actions} settings>
      {r.loose.length > 0 && (
        <Section title={t('review.looseEnds')}>
          <div className="stack">
            {r.loose.map((p) => {
              const c = snap.commitments.find((x) => x.id === p.commitmentId)!
              const g = snap.goals.find((x) => x.id === c.goalId)
              return (
                <div key={p.commitmentId} className="card tint-goal">
                  <div className="pad" style={{ paddingBottom: 10 }}><div className="group-eyebrow">{g?.title}</div></div>
                  <MissPromptCard prompt={p} label={c.label} question={promptQuestion(p, c, today)} today={today}
                    canLog={false} snooze={false}
                    onSkip={() => dismissInReview(r.week.start, missKeys(p)).then(() => toast(t('review.skippedNoAsk')))} />
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {r.goals.length > 0 && (
        <Section title={r.latest ? t('review.lastWeek') : t('review.thatWeek')}>
          <div className="stack">
            {r.goals.map((card) => (
              <GoalReviewCard key={card.goal.id} card={card} onAccept={accept}
                onDismiss={(s) => dismissInReview(r.week.start, s.key).then(() => toast(t('review.hidden4')))} />
            ))}
          </div>
        </Section>
      )}

      {r.dates.length > 0 && (
        <Section title={t('review.dates')}>
          <div className="card list tint-goal">
            {r.dates.map((d) => <DateRow key={d.goal.id} note={d} today={today} />)}
          </div>
        </Section>
      )}

      {(r.stalled.length > 0 || r.handled.length > 0) && (
        <Section title={t('review.stalled')}>
          <div className="card list tint-project">
            {r.stalled.map((s) => <StalledRow key={s.project.id} s={s} today={today} week={r.week.start} />)}
            {r.handled.map((h) => <HandledRow key={h.project.id} h={h} />)}
          </div>
        </Section>
      )}

      {r.next && (
        <Section title={t('review.openSlot')}>
          <div className="card pad">
            <div className="small muted">{t('review.freeOf', { free: r.free, cap: settings.goalCap })}</div>
            <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <button className="link-btn" style={{ fontWeight: 600, textAlign: 'left' }} onClick={() => navigate(`/goals/${r.next!.id}`)}>
                {r.next.title}
              </button>
              <button className="btn primary" onClick={() => start(r.next!)}>{t('common.start')}</button>
            </div>
            {r.backlog.length > 1 && (
              <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setChoosing(true)}>{t('review.chooseAnother')}</button>
            )}
          </div>
        </Section>
      )}

      <Sheet open={choosing} onClose={() => setChoosing(false)} title={t('review.startWhich')}>
        <div className="card list">
          {r.backlog.map((g) => (
            <div key={g.id} className="list-row">
              <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${g.id}`)}>
                <div className="title" style={{ fontSize: 15 }}>{g.title}</div>
              </button>
              <button className="btn" onClick={() => start(g)}>{t('common.start')}</button>
            </div>
          ))}
        </div>
      </Sheet>

      {nothing && (
        <div className="empty">
          <h2>{t('review.nothingToChange')}</h2>
          <p className="muted">{t('review.noMisses')}</p>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {r.reviewed ? (
          <p className="muted small" style={{ textAlign: 'center' }}>
            {r.latest ? t('review.nextMonday') : t('review.reviewed')}
          </p>
        ) : (
          <button className="btn primary block" onClick={done}>{r.latest ? t('review.doneForWeek') : t('review.markReviewed')}</button>
        )}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('review.weeks')}>
        <div className="card list">
          {weeks.map((w, i) => (
            <button key={w.start} className="list-row" aria-current={w.start === r.week.start ? 'true' : undefined}
              onClick={() => { setPicking(false); navigate(i === 0 ? '/review' : `/review?week=${w.start}`) }}>
              <div className="text">
                <div className="title" style={{ fontSize: 15 }}>
                  {t('review.weekOf', { date: dayMonth(w.start) })}{i === 0 && <span className="muted">{t('review.lastWeekTag')}</span>}
                </div>
              </div>
              {w.reviewed
                ? <span className="week-done"><IconCheck width={14} height={14} /> {t('review.reviewedLower')}</span>
                : <span className="small muted">{t('review.notReviewed')}</span>}
            </button>
          ))}
        </div>
      </Sheet>

      {editing?.kind === 'prep' && (
        <PrepSheet commitment={editing.commitment} editing={editing.prep} onClose={() => setEditing(null)} />
      )}
      {editing?.kind === 'commitment' && (
        <CommitmentSheet goal={editing.goal} editing={editing.commitment} today={today} onClose={() => setEditing(null)} />
      )}
    </Screen>
  )
}

function reasonText(r: ReasonCount): string {
  const d = r.displacements.map((x) => (x.count > 1 ? `${x.label} ×${x.count}` : x.label)).join(', ')
  return `${reasonLower(r.reason)} ×${r.count}${d ? ` (${d})` : ''}`
}

function GoalReviewCard(props: { card: GoalCard; onAccept: (s: Suggestion, alt?: boolean) => void; onDismiss: (s: Suggestion) => void }) {
  const { card } = props
  const s = card.suggestion
  const changed = card.before && card.status && card.before !== card.status
  return (
    <div className="card tint-goal">
      <button className="group-head" onClick={() => navigate(`/goals/${card.goal.id}`)}>
        <div className="text">
          <div className="goal-card-title">{card.goal.title}</div>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            {changed && <><StatusWord status={card.before} /><span className="muted">→</span></>}
            <StatusWord status={card.status} />
          </div>
        </div>
        <IconChevronRight className="chev" width={18} />
      </button>
      <div className="review-body">
        <ul className="review-lines">
          {card.lines.map((l) => <li key={l.commitment.id}>{l.text}</li>)}
        </ul>
        {card.reasons.length > 0 && (
          <div className="small muted" style={{ marginTop: 6 }}>{card.reasons.map(reasonText).join(' · ')}</div>
        )}
      </div>
      {s && (
        <div className="suggestion">
          <div className="suggestion-q">{tk(QUESTION[s.kind])}</div>
          <div className="small muted">{s.evidence}</div>
          <div className="actions">
            <button className="link-btn" onClick={() => props.onDismiss(s)}>{t('common.dismiss')}</button>
            <div className="row" style={{ gap: 8 }}>
              {s.kind === 'pause' && s.commitmentId && <button className="btn" onClick={() => props.onAccept(s, true)}>{t('review.editTarget')}</button>}
              <button className="btn primary" onClick={() => props.onAccept(s)}>{tk(ACTION[s.kind])}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ACTION: Record<SuggestionKind, Key> = {
  add_prep: 'review.a.addPrep',
  change_prep: 'review.a.editPrep',
  lower_target: 'review.a.edit',
  pause: 'review.a.pause',
  maintenance: 'review.a.maintenance',
}

function DateRow({ note, today }: { note: DateNote; today: string }) {
  const when = (d: string) => t('review.date.when', { date: dayMonth(d), relative: untilText(d, today) })
  let sub: string
  if (note.deadline) {
    sub = note.kind === 'deadline_soon' ? t('review.date.deadline', { when: when(note.deadline) })
      : note.kind === 'grace' ? t('review.date.inExtra', { date: dayMonth(note.deadline), when: when(note.date) })
      : t('review.date.extraEnded', { date: dayMonth(note.deadline), when: when(note.date) })
  } else {
    sub = t('review.date.reviewWas', { when: when(note.date) })
  }
  const review = note.kind === 'review_due'
  return (
    <div className="list-row">
      <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${note.goal.id}`)}>
        <div className="title">{note.goal.title}</div>
        <div className="sub">{sub}</div>
      </button>
      {review
        ? <button className="btn primary" onClick={() => navigate(`/goals/${note.goal.id}/review`)}>{t('goal.review')}</button>
        : <IconChevronRight className="chev" width={18} />}
    </div>
  )
}

function StalledRow({ s, today, week }: { s: StalledProject; today: string; week: string }) {
  const steps = tn('review.stepsLeft', s.remaining)
  const why = s.why === 'overdue'
    ? t('review.pastDate', { date: dayMonth(s.project.targetDate) })
    : s.lastDone ? t('review.noStepSince', { date: dayMonth(s.lastDone) }) : t('review.noStepYet')
  const [moving, setMoving] = useState(false)
  const [date, setDate] = useState(s.project.targetDate > today ? s.project.targetDate : today)
  const save = async () => {
    if (!isDateStr(date)) return
    await updateProject(s.project, { targetDate: date })
    await dismissInReview(week, projectKey(s.project.id, 'moved'))
    setMoving(false)
  }
  return (
    <div className="list-row" style={{ display: 'block' }}>
      <button className="text" style={{ textAlign: 'left', width: '100%' }} onClick={() => navigate(`/projects/${s.project.id}`)}>
        <div className="title">{s.project.title}</div>
        <div className="sub">{why} · {steps}</div>
      </button>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={() => setMoving(true)}>{t('review.moveDate')}</button>
        <button className="btn ghost" onClick={async () => {
          if (!confirm(t('review.putDownQ', { name: s.project.title }))) return
          await updateProject(s.project, { state: 'archived' })
          await dismissInReview(week, projectKey(s.project.id, 'put_down'))
        }}>{t('review.putDown')}</button>
        <span className="spacer" />
        <button className="link-btn" onClick={() => dismissInReview(week, projectKey(s.project.id, 'dismissed'))}>{t('common.dismiss')}</button>
      </div>
      {/* A sheet with Save, not an instant picker: iOS reports a date while you're still scrolling. */}
      <Sheet open={moving} onClose={() => setMoving(false)} title={t('review.newDateFor', { name: s.project.title })}>
        <Field label={t('project.targetDate')} htmlFor={`move-${s.project.id}`}>
          <input id={`move-${s.project.id}`} type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="sheet-actions">
          <button className="btn" onClick={() => setMoving(false)}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!isDateStr(date) || date < today} onClick={save}>{t('common.save')}</button>
        </div>
      </Sheet>
    </div>
  )
}

/** A stalled project already dealt with in this review: what happened to it. */
function HandledRow({ h }: { h: HandledProject }) {
  const text = h.action === 'moved' ? t('review.newDate', { date: dayMonth(h.project.targetDate) })
    : h.action === 'put_down' ? t('review.putDownDone')
    : t('review.dismissed4')
  return (
    <button className="list-row handled" onClick={() => navigate(`/projects/${h.project.id}`)}>
      <span className="done-mark"><IconCheck width={13} height={13} /></span>
      <div className="text">
        <div className="title" style={{ fontSize: 15 }}>{h.project.title}</div>
        <div className="sub">{text}</div>
      </div>
    </button>
  )
}
