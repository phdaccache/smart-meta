import { useMemo, useState } from 'react'
import {
  addCommitment, addPrep, deleteGoal, draftFromCommitment, removeCommitment, removePrep, saveGoalReview, setGoalState,
  updateCommitment, updateGoal, updatePrep,
} from '../db/repo'
import { t } from '../i18n'
import { dayMonth, isDateStr, relativeDay, untilText, weekdaysLabel } from '../lib/dates'
import { cadenceText } from '../lib/describe'
import {
  doneWhenProblem, emptyCommitmentDraft, isValid, MAX_PREPS, validateCommitment, validatePrep,
  type CommitmentDraft, type PrepDraft,
} from '../lib/draft'
import { activeEntries, summarizeGoal, type ScoreContext } from '../lib/scoring'
import { dueBadge, type Snapshot } from '../lib/today'
import { stateLabel } from '../lib/revisions'
import type { Commitment, Goal, GoalReview, Prep } from '../lib/types'
import { Field, InfoTip, Screen, Section, Sheet, StatusInfo, StatusWord, toast, TypeToConfirm, WeekBar } from '../ui/components'
import { useGoalReviews, useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconHistory, IconInsights } from '../ui/icons'
import { goBack, navigate } from '../ui/router'
import { CadenceFields, GraceField, graceLabel, MeasurementFields, PrepEditor, ShapeField, ShapeInfo, SmartHead, ToleranceField, WhyFields } from './GoalForm'
import { projectProgress } from './Goals'
import { GoalHistorySheet } from './GoalHistory'
import { OccurrenceSheet } from './OccurrenceSheet'


function useGoalContext(id: string) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  const goal = snap?.goals.find((g) => g.id === id)
  return { settings, today, snap, ctx, goal }
}

function NotFound() {
  return (
    <Screen back="/goals" title={t('nav.notFound')}>
      <p className="muted">{t('common.goalGone')}</p>
    </Screen>
  )
}

export function GoalDetailScreen({ id }: { id: string }) {
  const { settings, today, snap, ctx, goal } = useGoalContext(id)
  const [abandoning, setAbandoning] = useState(false)
  const [editingC, setEditingC] = useState<Commitment | 'new' | null>(null)
  const [history, setHistory] = useState(false)
  if (!snap) return null
  if (!goal) return <NotFound />

  const outcome = goal.kind === 'outcome'
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const summary = summarizeGoal(goal, snap.commitments, snap.entries, snap.occurrences, ctx)
  const commitments = snap.commitments.filter((c) => c.goalId === goal.id)
  const live = goal.state === 'active' || goal.state === 'maintenance'
  const reviewOn = outcome && summary.time ? summary.time.graceEnd : goal.targetDate
  const reviewDue = live && reviewOn && reviewOn <= today
  const activeCount = snap.goals.filter((g) => g.state === 'active').length
  const full = activeCount >= settings.goalCap
  const projects = snap.projects.filter((p) => p.goalId === goal.id && p.state === 'active')
  const tasks = snap.tasks.filter((x) => x.goalId === goal.id && !x.projectId)
  const doneTasks = new Set(activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => e.subjectId))
  const openTasks = tasks.filter((x) => !doneTasks.has(x.id))
  const ended = goal.state === 'completed' || goal.state === 'abandoned'

  return (
    <Screen back="/goals" eyebrow={[value?.name, stateLabel(goal.state)].filter(Boolean).join(' · ')} title={goal.title}
      actions={<>
        {commitments.length > 0 && (
          <button className="icon-btn" aria-label={t('goal.insights')} onClick={() => navigate(`/insights/goals/${goal.id}`)}><IconInsights /></button>
        )}
        <button className="icon-btn" aria-label={t('goal.history')} onClick={() => setHistory(true)}><IconHistory /></button>
      </>}>
      {goal.state === 'backlog' && (
        <div className="banner">
          <div className="text">{full ? t('goal.inBacklogFull', { n: settings.goalCap }) : t('goal.inBacklog')}</div>
          <button className="btn primary" disabled={full} onClick={() => setGoalState(goal, 'active').then(() => toast(t('common.started')))}>{t('common.start')}</button>
        </div>
      )}
      {reviewDue && (
        <div className="banner">
          <div className="text">{outcome ? t('goal.deadlineOver') : t('goal.reviewReached')}</div>
          <button className="btn primary" onClick={() => navigate(`/goals/${goal.id}/review`)}>{t('goal.review')}</button>
        </div>
      )}

      {ended && <LookingBack goal={goal} />}

      <Section title={t('common.details')}>
        <div className="card tint-goal">
          {goal.whyText && <div className="pad card-head"><div className="group-why">{goal.whyText}</div></div>}
          <div className="pad">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              {/* An ended goal has no live status: how it ended is in Looking back. */}
              {ended ? <span /> : <span className="row" style={{ gap: 0 }}><StatusWord status={summary.status} /><StatusInfo /></span>}
              {commitments.length > 0 && <WeekBar weeks={summary.weeks} />}
            </div>
            {summary.time && (
              <div className="progress" style={{ marginTop: 12 }} title={t('goal.timeUsed')}>
                <i style={{ width: `${Math.round(summary.time.elapsed * 100)}%` }} />
              </div>
            )}
            <dl className="kv" style={{ marginTop: 14 }}>
              {outcome && <><dt>{t('goal.doneWhen')}</dt><dd>{goal.doneWhen}</dd></>}
              {outcome && goal.targetDate && <><dt>{t('goal.deadline')}</dt><dd>{dayMonth(goal.targetDate)} {goal.targetDate.slice(0, 4)} · {untilText(goal.targetDate, today)}</dd></>}
              {outcome && <><dt>{t('goal.extraTime')}</dt><dd>{graceLabel(goal.graceDays ?? 0)}</dd></>}
              <dt>{t('goal.since')}</dt><dd>{dayMonth(goal.startDate)}</dd>
              {commitments.length > 0 && <><dt>{t('goal.tolerance')}</dt><dd>{goal.tolerancePct}%</dd></>}
              {!outcome && goal.targetDate && <><dt>{t('goal.reviewOn')}</dt><dd>{dayMonth(goal.targetDate)}</dd></>}
            </dl>
            {outcome && live && (
              <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => navigate(`/goals/${goal.id}/review?hit=1`)}>
                {t('goal.iDidIt')}
              </button>
            )}
          </div>
        </div>
      </Section>

      {!ended && <LookingBack goal={goal} />}

      <Section title={<span className="title-row">{outcome ? t('goal.supportingHabits') : t('goal.commitments')}
        {outcome && <InfoTip label={t('goal.aboutSupporting')}>{t('goal.supportingInfo')}</InfoTip>}
      </span>} aside={<button className="link-btn" onClick={() => setEditingC('new')}>{t('common.add')}</button>}>
        {commitments.length === 0 ? (
          <div className="card list-empty">{t('common.noneYet')}</div>
        ) : (
          <div className="stack">
            {commitments.map((c) => (
              <CommitmentCard key={c.id} c={c} snap={snap} today={today} canRemove={outcome || commitments.length > 1}
                onEdit={() => setEditingC(c)} />
            ))}
          </div>
        )}
      </Section>

      <Section title={t('goal.projects')} aside={<button className="link-btn" onClick={() => navigate(`/projects/new?goal=${goal.id}`)}>{t('common.add')}</button>}>
        {projects.length === 0 ? (
          <div className="card list-empty">{t('common.noneYet')}</div>
        ) : (
          <div className="card list tint-project">
            {projects.map((p) => {
              const { done, total } = projectProgress(p, snap)
              return (
                <button key={p.id} className="list-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div className="text">
                    <div className="title">{p.title}</div>
                    <div className="sub">{t('plan.stepsOf', { done, total })} · {t('today.due', { when: relativeDay(p.targetDate, today) })}</div>
                  </div>
                  <IconChevronRight className="chev" width={18} />
                </button>
              )
            })}
          </div>
        )}
      </Section>

      {openTasks.length > 0 && (
        <Section title={t('goal.tasks')}>
          <div className="card list">
            {openTasks.map((task) => (
              <div key={task.id} className="list-row">
                <div className="text">
                  <div className="title" style={{ fontSize: 15 }}>{task.title}</div>
                  {task.date && <span className={`due due-${dueBadge(task.date, today).tone}`}>{dueBadge(task.date, today).label}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={t('common.manage')}>
        <div className="card pad stack">
          <button className="btn outline block" onClick={() => navigate(`/goals/${goal.id}/edit`)}>{t('goal.editGoal')}</button>
          {goal.state === 'active' && !outcome && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'maintenance').then(() => toast(t('move.nowMaintenance')))}>
              {t('move.toMaintenance')}
            </button>
          )}
          {goal.state === 'maintenance' && (
            <button className="btn outline block" disabled={full} onClick={() => setGoalState(goal, 'active').then(() => toast(t('move.activeAgain')))}>
              {full ? t('move.makeActiveNoSlot') : t('move.makeActive')}
            </button>
          )}
          {live && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'backlog').then(() => toast(t('move.paused')))}>
              {t('move.pauseToBacklog')}
            </button>
          )}
          {goal.state === 'maintenance' && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'completed')}>{t('goal.closeItOut')}</button>
          )}
          {(goal.state === 'abandoned' || goal.state === 'completed') && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'backlog')}>{t('goal.restoreToBacklog')}</button>
          )}
          {goal.state !== 'abandoned' && goal.state !== 'completed' && (
            <button className="btn outline block" onClick={() => setAbandoning(true)}>{t('goal.abandonEllipsis')}</button>
          )}
          <details>
            <summary className="small muted" style={{ cursor: 'pointer', padding: '10px 0' }}>{t('goal.deletePermanently')}</summary>
            <TypeToConfirm phrase={goal.title} action={t('goal.deleteConfirm')} onConfirm={async () => {
              await deleteGoal(goal)
              toast(t('common.deleted'))
              navigate('/goals', { replace: true })
            }} />
          </details>
        </div>
      </Section>

      <AbandonSheet goal={abandoning ? goal : null} onClose={() => setAbandoning(false)} />
      <GoalHistorySheet goal={goal} snap={snap} today={today} open={history} onClose={() => setHistory(false)} />
      <CommitmentSheet goal={goal} editing={editingC} today={today} onClose={() => setEditingC(null)} />
    </Screen>
  )
}

function CommitmentCard({ c, snap, today, canRemove, onEdit }: { c: Commitment; snap: Snapshot; today: string; canRemove: boolean; onEdit: () => void }) {
  const preps = snap.preps.filter((p) => p.commitmentId === c.id)
  const [editingPrep, setEditingPrep] = useState<Prep | 'new' | null>(null)
  const [logging, setLogging] = useState(false)
  const outcome = snap.goals.find((g) => g.id === c.goalId)?.kind === 'outcome'
  return (
    <div className="card commitment-card">
      <div className="pad">
        <div className="commitment-kind">{outcome ? t('goal.supportingHabit') : t('goal.commitment')}</div>
        <div className="group-eyebrow">{c.label} · {cadenceText(c)}{c.startDate > today && <> · <b>{t('goal.startsOn', { when: relativeDay(c.startDate, today) })}</b></>}</div>
        <div style={{ fontWeight: 600 }}>{c.measurementDefinition}</div>
        <div className="row" style={{ marginTop: 10, gap: 4, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onEdit}>{t('common.edit')}</button>
          {c.shape === 'standard' && <button className="btn" onClick={() => setLogging(true)}>{t('common.log')}</button>}
          {canRemove && (
            <button className="btn ghost" onClick={async () => {
              if (confirm(t('goal.removeCommitment', { name: c.label }))) await removeCommitment(c)
            }}>{t('common.remove')}</button>
          )}
        </div>
      </div>
      <div className="prep-block">
        <div className="prep-block-head">
          <span className="title-row">{t('ins.preps')}
            <InfoTip label={t('goal.aboutPreps')}>{t('goal.prepsInfo')}</InfoTip>
          </span>
        </div>
        <div className="list">
          {preps.map((p) => (
            <button key={p.id} className="list-row" onClick={() => setEditingPrep(p)}>
              <div className="text">
                <div className="title" style={{ fontSize: 15 }}>{p.title}</div>
                <div className="sub">{t('goal.prepWhen', { days: weekdaysLabel(p.fireWeekdays), time: p.fireTime })}</div>
              </div>
              <IconChevronRight className="chev" width={18} />
            </button>
          ))}
          {preps.length < MAX_PREPS && (
            <button className="list-row link-btn" style={{ minHeight: 48 }} onClick={() => setEditingPrep('new')}>
              + {t('form.addPrep')}
            </button>
          )}
        </div>
      </div>
      <PrepSheet commitment={c} editing={editingPrep} onClose={() => setEditingPrep(null)} />
      <OccurrenceSheet commitment={logging ? c : null} date={today} today={today} onClose={() => setLogging(false)} />
    </div>
  )
}

export function PrepSheet({ commitment, editing, onClose }: { commitment: Commitment; editing: Prep | 'new' | null; onClose: () => void }) {
  const [drafts, setDrafts] = useState<PrepDraft[]>([])
  const [tried, setTried] = useState(false)
  const [key, setKey] = useState<unknown>(null)
  if (editing !== key) {
    setKey(editing)
    setTried(false)
    setDrafts(editing === 'new' ? [{ title: '', fireWeekdays: [], fireTime: '21:00' }]
      : editing ? [{ title: editing.title, fireWeekdays: editing.fireWeekdays, fireTime: editing.fireTime }] : [])
  }
  if (!editing) return null
  const d = drafts[0]
  const save = async () => {
    if (!d || !isValid(validatePrep(d))) return setTried(true)
    if (editing === 'new') await addPrep(commitment.id, d)
    else await updatePrep(editing, d)
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={editing === 'new' ? t('goal.prepFor', { name: commitment.label }) : t('goal.editPrep')}>
      <PrepEditor preps={drafts} onChange={(p) => p.length ? setDrafts(p) : onClose()} showErrors={tried} />
      <div className="sheet-actions">
        {editing !== 'new' && <button className="btn danger" onClick={async () => { await removePrep(editing); onClose() }}>{t('common.delete')}</button>}
        <button className="btn primary" onClick={save}>{t('common.save')}</button>
      </div>
    </Sheet>
  )
}

export function CommitmentSheet({ goal, editing, today, onClose }: { goal: Goal; editing: Commitment | 'new' | null; today: string; onClose: () => void }) {
  const [d, setD] = useState<CommitmentDraft>(emptyCommitmentDraft)
  const [start, setStart] = useState(today)
  const [tried, setTried] = useState(false)
  const [key, setKey] = useState<unknown>(null)
  if (editing !== key) {
    setKey(editing)
    setTried(false)
    setD(editing && editing !== 'new' ? draftFromCommitment(editing) : emptyCommitmentDraft())
    setStart(today)
  }
  if (!editing) return null
  const e = validateCommitment(d)
  const patch = (p: Partial<CommitmentDraft>) => setD((x) => ({ ...x, ...p }))
  const save = async () => {
    if (!isValid(e)) return setTried(true)
    if (editing === 'new') await addCommitment(goal, d, isDateStr(start) ? start : today)
    else await updateCommitment(editing, d)
    toast(t('common.saved'))
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={editing === 'new' ? t('goal.newCommitment') : t('goal.editCommitment')}>
      {editing === 'new' && (
        <Field label={t('goal.kind')} info={<ShapeInfo />}><ShapeField d={d} set={patch} /></Field>
      )}
      <div style={{ height: 18 }} />
      <MeasurementFields d={d} set={patch} e={e} showErrors={tried} />
      <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={e} showErrors={tried} /></div>
      {editing === 'new' && (
        <Field label={t('goal.starts')} htmlFor="c-start" info={t('goal.startsInfo')}>
          <input id="c-start" type="date" value={start} onChange={(ev) => setStart(ev.target.value)} />
        </Field>
      )}
      <div className="sheet-actions"><button className="btn primary" onClick={save}>{t('common.save')}</button></div>
    </Sheet>
  )
}

function AbandonSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  if (!goal) return null
  return (
    <Sheet open onClose={onClose} title={t('goal.abandonTitle')}>
      <Field label={t('goal.abandonReason')} htmlFor="abandon-why" info={t('goal.abandonInfo')}>
        <textarea id="abandon-why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>{t('goal.keepIt')}</button>
        <button className="btn primary" onClick={async () => {
          await setGoalState(goal, 'abandoned', reason)
          toast(t('goal.abandoned'))
          onClose()
        }}>{t('goal.abandon')}</button>
      </div>
    </Sheet>
  )
}

// ——— edit ———

export function GoalEditScreen({ id }: { id: string }) {
  const { snap, goal } = useGoalContext(id)
  const [d, setD] = useState<Goal | null>(null)
  const [tried, setTried] = useState(false)
  if (goal && !d) setD(goal)
  if (!snap) return null
  if (!goal || !d) return <NotFound />

  const outcome = goal.kind === 'outcome'
  const hasHabits = snap.commitments.some((c) => c.goalId === goal.id)
  const errors = {
    title: d.title.trim() ? undefined : t('err.required'),
    doneWhen: outcome ? doneWhenProblem(d.doneWhen ?? '') ?? undefined : undefined,
    // A goal made in the intro may have no reason yet; one that has a reason keeps it.
    whyValueId: d.whyValueId || !goal.whyValueId ? undefined : t('goal.pickValue'),
    whyText: d.whyText.trim() || !goal.whyText ? undefined : t('err.required'),
    // A habit kept in maintenance has no date to look back on; every other running goal does.
    targetDate: outcome && !d.targetDate ? t('err.needsDeadline')
      : !d.targetDate && (goal.state === 'active' || goal.state === 'backlog') ? t('err.lookBack')
      : d.targetDate && d.targetDate <= d.startDate ? t('err.afterStart') : undefined,
  }
  const ok = !Object.values(errors).some(Boolean)
  const save = async () => {
    if (!ok) return setTried(true)
    await updateGoal(goal, {
      title: d.title.trim(), whyValueId: d.whyValueId, whyText: d.whyText.trim(), tolerancePct: d.tolerancePct,
      startDate: d.startDate, targetDate: d.targetDate || null,
      ...(outcome ? { doneWhen: (d.doneWhen ?? '').trim(), graceDays: d.graceDays ?? 0 } : {}),
    })
    toast(t('common.saved'))
    goBack(`/goals/${goal.id}`)
  }

  return (
    <Screen back={`/goals/${goal.id}`} eyebrow={t('goal.editEyebrow')} title={goal.title}>
      <section className="card pad smart-section">
        <SmartHead k="S" />
        <Field label={t('form.goal')} htmlFor="title" error={tried ? errors.title : undefined}>
          <input id="title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
      </section>
      {outcome && (
        <section className="card pad smart-section">
          <SmartHead k="M" />
          <Field label={t('form.doneWhen')} htmlFor="done-when" error={tried ? errors.doneWhen : undefined}>
            <textarea id="done-when" rows={2} value={d.doneWhen ?? ''} onChange={(e) => setD({ ...d, doneWhen: e.target.value })} />
          </Field>
        </section>
      )}
      {(outcome || hasHabits) && (
        <section className="card pad smart-section">
          <SmartHead k="A" />
          {outcome && <GraceField value={d.graceDays ?? 0} onChange={(n) => setD({ ...d, graceDays: n })} />}
          {hasHabits && <ToleranceField value={d.tolerancePct} onChange={(n) => setD({ ...d, tolerancePct: n })} />}
        </section>
      )}
      <section className="card pad smart-section">
        <SmartHead k="R" />
        <WhyFields valueId={d.whyValueId} text={d.whyText} errors={errors} showErrors={tried}
          onValue={(v) => setD({ ...d, whyValueId: v })} onText={(text) => setD({ ...d, whyText: text })} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="T" />
        <div className="inline-fields top">
          <Field label={t('form.start')} htmlFor="start">
            <input id="start" type="date" value={d.startDate} onChange={(e) => isDateStr(e.target.value) && setD({ ...d, startDate: e.target.value })} />
          </Field>
          <Field label={outcome ? t('form.deadline') : t('form.reviewOn')} htmlFor="target" error={tried ? errors.targetDate : undefined}>
            <input id="target" type="date" value={d.targetDate ?? ''} onChange={(e) => setD({ ...d, targetDate: e.target.value || null })} />
          </Field>
        </div>
      </section>
      {!outcome && <p className="small muted" style={{ margin: '12px 4px 0' }}>{t('goal.commitmentsEditedElsewhere')}</p>}
      <div className="wizard-nav"><button className="btn primary" onClick={save}>{t('common.saveChanges')}</button></div>
    </Screen>
  )
}

// ——— looking back ———

/**
 * What was written when the goal was reviewed (newest first), and why it was
 * dropped if it was. Ended goals show it first: it's what's left of them.
 */
function LookingBack({ goal }: { goal: Goal }) {
  const reviews = [...useGoalReviews(goal.id)].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const stopped = goal.state === 'abandoned' && goal.abandonReason
  if (!reviews.length && !stopped) return null
  const outcomeWord = (o: GoalReview['outcome']) => (o === 'renewed' ? t('goal.renewed') : stateLabel(o))
  return (
    <Section title={t('goal.lookingBack')}>
      <div className="stack">
        {stopped && (
          <div className="card pad looking-back">
            <div className="lb-label">{t('goal.whyStopped')}</div>
            <p className="lb-text">{goal.abandonReason}</p>
          </div>
        )}
        {reviews.map((r) => (
          <div key={r.id} className="card pad looking-back">
            <div className="lb-head">
              <span className={`lb-result ${r.hit ? 'hit' : 'miss'}`}>{r.hit ? '✓' : '✕'} {t(r.hit ? 'goal.hitIt' : 'goal.didntHitIt')}</span>
              <span className="lb-meta">{outcomeWord(r.outcome)} · {dayMonth(r.timestamp.slice(0, 10))} {r.timestamp.slice(0, 4)}</span>
            </div>
            {r.whatHappened && <><div className="lb-label">{t('goal.whatHappened')}</div><p className="lb-text">{r.whatHappened}</p></>}
            {r.journalNote && <><div className="lb-label">{t('goalReview.journal')}</div><p className="lb-text">{r.journalNote}</p></>}
            {!r.whatHappened && !r.journalNote && <p className="lb-text muted">{t('goal.nothingWritten')}</p>}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ——— end-of-goal review ———

export function GoalReviewScreen({ id, presetHit }: { id: string; presetHit?: boolean }) {
  const { snap, goal, today } = useGoalContext(id)
  const [hit, setHit] = useState<boolean | null>(presetHit ?? null)
  const [whatHappened, setWhatHappened] = useState('')
  const [journal, setJournal] = useState('')
  const [outcome, setOutcome] = useState<'renewed' | 'maintenance' | 'completed' | null>(null)
  const [renewDate, setRenewDate] = useState('')
  if (!snap) return null
  if (!goal) return <NotFound />

  const finishLine = goal.kind === 'outcome'
  const ready = hit != null && outcome && (outcome !== 'renewed' || (isDateStr(renewDate) && renewDate > today))
  const save = async () => {
    if (!ready) return
    await saveGoalReview(goal, { hit: hit!, whatHappened: whatHappened.trim(), journalNote: journal.trim() }, outcome!, renewDate || null)
    toast(t('common.saved'))
    goBack(`/goals/${goal.id}`)
  }
  const choice = (v: typeof outcome, title: string, d: string) => (
    <button role="radio" aria-checked={outcome === v} className={`choice ${outcome === v ? 'on' : ''}`} onClick={() => setOutcome(v)}>
      <div className="t">{title}</div><div className="d">{d}</div>
    </button>
  )

  return (
    <Screen back={`/goals/${goal.id}`} eyebrow={t('goalReview.title')} title={goal.title}>
      <Field label={t('goalReview.q1')}>
        <div className="segmented" role="radiogroup" aria-label={t('goalReview.q1Label')}>
          <button role="radio" aria-checked={hit === true} className={hit === true ? 'on' : ''} onClick={() => setHit(true)}>{t('common.yes')}</button>
          <button role="radio" aria-checked={hit === false} className={hit === false ? 'on' : ''} onClick={() => setHit(false)}>{t('common.no')}</button>
        </div>
      </Field>
      <Field label={t('goalReview.q2')} htmlFor="wh">
        <textarea id="wh" rows={3} value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} />
      </Field>
      <Field label={t('goalReview.journal')} htmlFor="journal" info={t('goalReview.journalInfo')}>
        <textarea id="journal" rows={5} value={journal} onChange={(e) => setJournal(e.target.value)} />
      </Field>
      <div className="section">
        <div className="field-label" style={{ marginBottom: 10 }}>{t('goalReview.q3')}</div>
        <div role="radiogroup" aria-label={t('goalReview.q3Label')}>
          {!(finishLine && hit) && choice('renewed', t('goalReview.renew'), finishLine ? t('goalReview.renewDeadline') : t('goalReview.renewReview'))}
          {!finishLine && choice('maintenance', t('state.maintenance'), t('goalReview.maintenanceSub'))}
          {choice('completed', t('goal.closeItOut'), finishLine && hit ? t('goalReview.closeSubDone') : t('goalReview.closeSubArchive'))}
        </div>
        {outcome === 'renewed' && (
          <Field label={finishLine ? t('goalReview.newDeadline') : t('goalReview.newReviewDate')} htmlFor="renew">
            <input id="renew" type="date" min={today} value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="wizard-nav"><button className="btn primary" disabled={!ready} onClick={save}>{t('goalReview.save')}</button></div>
    </Screen>
  )
}
