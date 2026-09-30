import { useMemo, useState } from 'react'
import { dismissInReview, markWeekReviewed, setGoalState, updateProject } from '../db/repo'
import { dayMonth, untilText } from '../lib/dates'
import { promptQuestion, reasonLabel } from '../lib/describe'
import {
  buildReview, projectKey, reviewableWeeks, type DateNote, type GoalCard, type HandledProject, type ReasonCount, type StalledProject,
  type Suggestion, type SuggestionKind,
} from '../lib/review'
import { missKey, type MissPrompt, type ScoreContext } from '../lib/scoring'
import type { Commitment, Goal, Prep } from '../lib/types'
import { DatePickerButton, InfoTip, Screen, Section, Sheet, StatusWord, toast } from '../ui/components'
import { useAllRevisions, useDisplacements, useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { IconCalendar, IconCheck, IconChevronRight } from '../ui/icons'
import { navigate, useLocation } from '../ui/router'
import { CommitmentSheet, PrepSheet } from './GoalDetail'
import { MissPromptCard } from './Today'

const QUESTION: Record<SuggestionKind, string> = {
  add_prep: 'Add a prep?',
  change_prep: 'The prep isn’t helping yet. Change it?',
  lower_target: 'Lower the target, or change how often?',
  pause: 'Pause it and free the slot?',
  maintenance: 'Switch to maintenance? It stays on Today and frees a slot.',
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
    <span className="title-row">Review
      <InfoTip label="About the review">
        Once a week: answer what’s left, look at last week, and change what isn’t working.
        Suggestions come from your miss reasons over the last four weeks.
      </InfoTip>
    </span>
  )

  if (!r.ready) {
    return (
      <Screen title={title} settings>
        <div className="empty">
          <h2>Nothing to review yet.</h2>
          <p className="muted">The first review opens the Monday after an active goal’s first full week.</p>
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
      return toast('Paused. It’s in the backlog.')
    }
    if (s.kind === 'maintenance') {
      await setGoalState(goal, 'maintenance')
      return toast('Now in maintenance.')
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
    toast(open.length ? 'Reviewed. Whatever was left open is set aside.' : 'Reviewed.')
  }
  const start = async (g: Goal) => {
    await setGoalState(g, 'active')
    setChoosing(false)
    toast(`Started “${g.title}”.`)
  }

  const actions = (
    <>
      {!r.latest && <button className="btn" onClick={() => navigate('/review')}>Last week</button>}
      {weeks.length > 1 && (
        <button className="icon-btn" aria-label="Other weeks" onClick={() => setPicking(true)}><IconCalendar /></button>
      )}
    </>
  )

  const nothing = !r.loose.length && !r.goals.length && !r.dates.length && !r.stalled.length && !r.next

  return (
    <Screen eyebrow={`Week of ${dayMonth(r.week.start)}${r.reviewed ? ' · reviewed' : ''}`} title={title} actions={actions} settings>
      {r.loose.length > 0 && (
        <Section title="Loose ends">
          <div className="stack">
            {r.loose.map((p) => {
              const c = snap.commitments.find((x) => x.id === p.commitmentId)!
              const g = snap.goals.find((x) => x.id === c.goalId)
              return (
                <div key={p.commitmentId} className="card tint-goal">
                  <div className="pad" style={{ paddingBottom: 10 }}><div className="group-eyebrow">{g?.title}</div></div>
                  <MissPromptCard prompt={p} label={c.label} question={promptQuestion(p, c, today)} today={today}
                    canLog={false} snooze={false}
                    onSkip={() => dismissInReview(r.week.start, missKeys(p)).then(() => toast('Skipped. It won’t ask again.'))} />
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {r.goals.length > 0 && (
        <Section title={r.latest ? 'Last week' : 'That week'}>
          <div className="stack">
            {r.goals.map((card) => (
              <GoalReviewCard key={card.goal.id} card={card} onAccept={accept}
                onDismiss={(s) => dismissInReview(r.week.start, s.key).then(() => toast('Hidden for 4 weeks.'))} />
            ))}
          </div>
        </Section>
      )}

      {r.dates.length > 0 && (
        <Section title="Dates">
          <div className="card list tint-goal">
            {r.dates.map((d) => <DateRow key={d.goal.id} note={d} today={today} />)}
          </div>
        </Section>
      )}

      {(r.stalled.length > 0 || r.handled.length > 0) && (
        <Section title="Stalled projects">
          <div className="card list tint-project">
            {r.stalled.map((s) => <StalledRow key={s.project.id} s={s} today={today} week={r.week.start} />)}
            {r.handled.map((h) => <HandledRow key={h.project.id} h={h} />)}
          </div>
        </Section>
      )}

      {r.next && (
        <Section title="Open slot">
          <div className="card pad">
            <div className="small muted">{r.free} of {settings.goalCap} free · top of your backlog:</div>
            <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <button className="link-btn" style={{ fontWeight: 600, textAlign: 'left' }} onClick={() => navigate(`/goals/${r.next!.id}`)}>
                {r.next.title}
              </button>
              <button className="btn primary" onClick={() => start(r.next!)}>Start</button>
            </div>
            {r.backlog.length > 1 && (
              <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setChoosing(true)}>Choose another</button>
            )}
          </div>
        </Section>
      )}

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Start which goal?">
        <div className="card list">
          {r.backlog.map((g) => (
            <div key={g.id} className="list-row">
              <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${g.id}`)}>
                <div className="title" style={{ fontSize: 15 }}>{g.title}</div>
              </button>
              <button className="btn" onClick={() => start(g)}>Start</button>
            </div>
          ))}
        </div>
      </Sheet>

      {nothing && (
        <div className="empty">
          <h2>Nothing to change.</h2>
          <p className="muted">No misses to explain and nothing stalled.</p>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {r.reviewed ? (
          <p className="muted small" style={{ textAlign: 'center' }}>
            {r.latest ? 'Reviewed. The next one opens on Monday.' : 'Reviewed.'}
          </p>
        ) : (
          <button className="btn primary block" onClick={done}>{r.latest ? 'Done for this week' : 'Mark reviewed'}</button>
        )}
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Weeks">
        <div className="card list">
          {weeks.map((w, i) => (
            <button key={w.start} className="list-row" aria-current={w.start === r.week.start ? 'true' : undefined}
              onClick={() => { setPicking(false); navigate(i === 0 ? '/review' : `/review?week=${w.start}`) }}>
              <div className="text">
                <div className="title" style={{ fontSize: 15 }}>Week of {dayMonth(w.start)}{i === 0 && <span className="muted"> · last week</span>}</div>
              </div>
              {w.reviewed
                ? <span className="week-done"><IconCheck width={14} height={14} /> reviewed</span>
                : <span className="small muted">not reviewed</span>}
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
  return `${reasonLabel(r.reason).toLowerCase()} ×${r.count}${d ? ` (${d})` : ''}`
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
          <div className="suggestion-q">{QUESTION[s.kind]}</div>
          <div className="small muted">{s.evidence}</div>
          <div className="actions">
            <button className="link-btn" onClick={() => props.onDismiss(s)}>Dismiss</button>
            <div className="row" style={{ gap: 8 }}>
              {s.kind === 'pause' && s.commitmentId && <button className="btn" onClick={() => props.onAccept(s, true)}>Edit target</button>}
              <button className="btn primary" onClick={() => props.onAccept(s)}>{ACTION[s.kind]}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ACTION: Record<SuggestionKind, string> = {
  add_prep: 'Add prep',
  change_prep: 'Edit prep',
  lower_target: 'Edit',
  pause: 'Pause',
  maintenance: 'Maintenance',
}

function DateRow({ note, today }: { note: DateNote; today: string }) {
  const when = (d: string) => `${dayMonth(d)} (${untilText(d, today)})`
  let sub: string
  if (note.deadline) {
    sub = note.kind === 'deadline_soon' ? `Deadline ${when(note.deadline)}`
      : note.kind === 'grace' ? `Deadline passed ${dayMonth(note.deadline)} · extra time until ${when(note.date)}`
      : `Deadline was ${dayMonth(note.deadline)}; extra time ended ${when(note.date)}`
  } else {
    sub = `Review date was ${when(note.date)}`
  }
  const review = note.kind === 'review_due'
  return (
    <div className="list-row">
      <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${note.goal.id}`)}>
        <div className="title">{note.goal.title}</div>
        <div className="sub">{sub}</div>
      </button>
      {review
        ? <button className="btn primary" onClick={() => navigate(`/goals/${note.goal.id}/review`)}>Review</button>
        : <IconChevronRight className="chev" width={18} />}
    </div>
  )
}

function StalledRow({ s, today, week }: { s: StalledProject; today: string; week: string }) {
  const steps = `${s.remaining} step${s.remaining === 1 ? '' : 's'} left`
  const why = s.why === 'overdue'
    ? `Past its date (${dayMonth(s.project.targetDate)})`
    : s.lastDone ? `No step done since ${dayMonth(s.lastDone)}` : 'No step done yet'
  return (
    <div className="list-row" style={{ display: 'block' }}>
      <button className="text" style={{ textAlign: 'left', width: '100%' }} onClick={() => navigate(`/projects/${s.project.id}`)}>
        <div className="title">{s.project.title}</div>
        <div className="sub">{why} · {steps}</div>
      </button>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <DatePickerButton value={s.project.targetDate > today ? s.project.targetDate : today} min={today} label="New date"
          onPick={async (d) => {
            await updateProject(s.project, { targetDate: d })
            await dismissInReview(week, projectKey(s.project.id, 'moved'))
          }}>
          <span className="btn">Move date</span>
        </DatePickerButton>
        <button className="btn ghost" onClick={async () => {
          if (!confirm(`Put “${s.project.title}” down? It moves to done projects; you can reopen it.`)) return
          await updateProject(s.project, { state: 'archived' })
          await dismissInReview(week, projectKey(s.project.id, 'put_down'))
        }}>Put down</button>
        <span className="spacer" />
        <button className="link-btn" onClick={() => dismissInReview(week, projectKey(s.project.id, 'dismissed'))}>Dismiss</button>
      </div>
    </div>
  )
}

/** A stalled project already dealt with in this review: what happened to it. */
function HandledRow({ h }: { h: HandledProject }) {
  const text = h.action === 'moved' ? `New date: ${dayMonth(h.project.targetDate)}`
    : h.action === 'put_down' ? 'Put down · reopen it from its page'
    : 'Dismissed for 4 weeks'
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
