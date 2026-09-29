import { useMemo, useState } from 'react'
import {
  addCommitment, addPrep, deleteGoal, draftFromCommitment, removeCommitment, removePrep, saveGoalReview, setGoalState,
  updateCommitment, updateGoal, updatePrep,
} from '../db/repo'
import { dayMonth, diffDays, isDateStr, relativeDay, weekdaysLabel } from '../lib/dates'
import { cadenceText, formatValue, reasonLabel } from '../lib/describe'
import {
  emptyCommitmentDraft, isValid, MAX_PREPS, measurementProblem, validateCommitment, validatePrep,
  type CommitmentDraft, type PrepDraft,
} from '../lib/draft'
import { activeEntries, summarizeGoal, type ScoreContext } from '../lib/scoring'
import { dueBadge, type Snapshot } from '../lib/today'
import type { Commitment, Entry, Goal, GoalState, Prep, Revision } from '../lib/types'
import { DatePickerButton, Field, InfoTip, Screen, Section, Sheet, StatusWord, toast, TypeToConfirm, WeekBar } from '../ui/components'
import { useDisplacements, useGoalReviews, useRevisions, useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight } from '../ui/icons'
import { navigate } from '../ui/router'
import { CadenceFields, GraceField, graceLabel, MeasurementFields, PrepEditor, SHAPE_INFO, ShapeField, SmartHead, ToleranceField, WhyFields } from './GoalForm'
import { projectProgress } from './Goals'
import { OccurrenceSheet } from './OccurrenceSheet'

const STATE_LABEL: Record<GoalState, string> = {
  active: 'Active', backlog: 'Backlog', maintenance: 'Maintenance', abandoned: 'Abandoned', completed: 'Completed',
}

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
    <Screen back="/goals" title="Not found">
      <p className="muted">This goal doesn’t exist, or was deleted.</p>
    </Screen>
  )
}

export function GoalDetailScreen({ id }: { id: string }) {
  const { settings, today, snap, ctx, goal } = useGoalContext(id)
  const [abandoning, setAbandoning] = useState(false)
  const [editingC, setEditingC] = useState<Commitment | 'new' | null>(null)
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
  const tasks = snap.tasks.filter((t) => t.goalId === goal.id && !t.projectId)
  const doneTasks = new Set(activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => e.subjectId))
  const openTasks = tasks.filter((t) => !doneTasks.has(t.id))

  return (
    <Screen back="/goals" eyebrow={[value?.name, STATE_LABEL[goal.state]].filter(Boolean).join(' · ')} title={goal.title}>
      {goal.state === 'backlog' && (
        <div className="banner">
          <div className="text">{full ? `In the backlog. You have ${settings.goalCap} active goals.` : 'In the backlog.'}</div>
          <button className="btn primary" disabled={full} onClick={() => setGoalState(goal, 'active').then(() => toast('Started.'))}>Start</button>
        </div>
      )}
      {reviewDue && (
        <div className="banner">
          <div className="text">{outcome ? 'Deadline and extra time are over.' : 'Review date reached.'}</div>
          <button className="btn primary" onClick={() => navigate(`/goals/${goal.id}/review`)}>Review</button>
        </div>
      )}

      <Section title="Details">
        <div className="card">
          <div className="pad card-head"><div className="group-why">{goal.whyText}</div></div>
          <div className="pad">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <StatusWord status={summary.status} />
              {commitments.length > 0 && <WeekBar weeks={summary.weeks} />}
            </div>
            {summary.time && (
              <div className="progress" style={{ marginTop: 12 }} title="Time used">
                <i style={{ width: `${Math.round(summary.time.elapsed * 100)}%` }} />
              </div>
            )}
            <dl className="kv" style={{ marginTop: 14 }}>
              {outcome && <><dt>Done when</dt><dd>{goal.doneWhen}</dd></>}
              {outcome && goal.targetDate && <><dt>Deadline</dt><dd>{dayMonth(goal.targetDate)} {goal.targetDate.slice(0, 4)} · {untilText(goal.targetDate, today)}</dd></>}
              {outcome && <><dt>Extra time</dt><dd>{graceLabel(goal.graceDays ?? 0)}</dd></>}
              <dt>Since</dt><dd>{dayMonth(goal.startDate)}</dd>
              {commitments.length > 0 && <><dt>Tolerance</dt><dd>{goal.tolerancePct}%</dd></>}
              {!outcome && goal.targetDate && <><dt>Review</dt><dd>{dayMonth(goal.targetDate)}</dd></>}
            </dl>
            {outcome && live && (
              <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => navigate(`/goals/${goal.id}/review?hit=1`)}>
                I did it
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title={<span className="title-row">{outcome ? 'Supporting habits' : 'Commitments'}
        {outcome && <InfoTip label="About supporting habits">Optional habits that get you to the finish line, like LeetCode 4× a week. Each can start on its own date, so you can prepare first and apply later.</InfoTip>}
      </span>} aside={<button className="link-btn" onClick={() => setEditingC('new')}>Add</button>}>
        {commitments.length === 0 ? (
          <div className="card list-empty">None yet.</div>
        ) : (
          <div className="stack">
            {commitments.map((c) => (
              <CommitmentCard key={c.id} c={c} snap={snap} today={today} canRemove={outcome || commitments.length > 1}
                onEdit={() => setEditingC(c)} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Projects" aside={<button className="link-btn" onClick={() => navigate(`/projects/new?goal=${goal.id}`)}>Add</button>}>
        {projects.length === 0 ? (
          <div className="card list-empty">None yet.</div>
        ) : (
          <div className="card list">
            {projects.map((p) => {
              const { done, total } = projectProgress(p, snap)
              return (
                <button key={p.id} className="list-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div className="text">
                    <div className="title">{p.title}</div>
                    <div className="sub">{done} of {total} steps · due {relativeDay(p.targetDate, today)}</div>
                  </div>
                  <IconChevronRight className="chev" width={18} />
                </button>
              )
            })}
          </div>
        )}
      </Section>

      {openTasks.length > 0 && (
        <Section title="Tasks">
          <div className="card list">
            {openTasks.map((t) => (
              <div key={t.id} className="list-row">
                <div className="text">
                  <div className="title" style={{ fontSize: 15 }}>{t.title}</div>
                  {t.date && <span className={`due due-${dueBadge(t.date, today).tone}`}>{dueBadge(t.date, today).label}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <GoalHistory goal={goal} snap={snap} today={today} />

      <Section title="Manage">
        <div className="card pad stack">
          <button className="btn outline block" onClick={() => navigate(`/goals/${goal.id}/edit`)}>Edit goal</button>
          {goal.state === 'active' && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'backlog').then(() => toast('Moved to the backlog.'))}>
              Move to backlog
            </button>
          )}
          {goal.state === 'maintenance' && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'completed')}>Close it out</button>
          )}
          {(goal.state === 'abandoned' || goal.state === 'completed') && (
            <button className="btn outline block" onClick={() => setGoalState(goal, 'backlog')}>Restore to backlog</button>
          )}
          {goal.state !== 'abandoned' && goal.state !== 'completed' && (
            <button className="btn outline block" onClick={() => setAbandoning(true)}>Abandon…</button>
          )}
          <details>
            <summary className="small muted" style={{ cursor: 'pointer', padding: '10px 0' }}>Delete permanently</summary>
            <TypeToConfirm phrase={goal.title} action="Delete goal and its history" onConfirm={async () => {
              await deleteGoal(goal)
              toast('Deleted.')
              navigate('/goals', { replace: true })
            }} />
          </details>
        </div>
      </Section>

      <AbandonSheet goal={abandoning ? goal : null} onClose={() => setAbandoning(false)} />
      <CommitmentSheet goal={goal} editing={editingC} today={today} onClose={() => setEditingC(null)} />
    </Screen>
  )
}

/** "in 5 days", "in 3 weeks", "in 11 months", or "5 days ago". */
function untilText(date: string, today: string): string {
  const d = diffDays(today, date)
  const n = Math.abs(d)
  const unit = n < 14 ? [n, 'day'] as const : n < 60 ? [Math.round(n / 7), 'week'] as const : [Math.round(n / 30.4), 'month'] as const
  const text = `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'}`
  return d >= 0 ? `in ${text}` : `${text} ago`
}

function CommitmentCard({ c, snap, today, canRemove, onEdit }: { c: Commitment; snap: Snapshot; today: string; canRemove: boolean; onEdit: () => void }) {
  const preps = snap.preps.filter((p) => p.commitmentId === c.id)
  const [editingPrep, setEditingPrep] = useState<Prep | 'new' | null>(null)
  const [logging, setLogging] = useState(false)
  return (
    <div className="card">
      <div className="pad">
        <div className="group-eyebrow">{c.label} · {cadenceText(c)}{c.startDate > today && <> · <b>starts {relativeDay(c.startDate, today)}</b></>}</div>
        <div style={{ fontWeight: 600 }}>{c.measurementDefinition}</div>
        <div className="row" style={{ marginTop: 10, gap: 4, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onEdit}>Edit</button>
          {c.shape === 'standard' && <button className="btn" onClick={() => setLogging(true)}>Log</button>}
          {canRemove && (
            <button className="btn ghost" onClick={async () => {
              if (confirm(`Remove “${c.label}”? Its history stays, but it stops being scored.`)) await removeCommitment(c)
            }}>Remove</button>
          )}
        </div>
      </div>
      <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
        {preps.map((p) => (
          <button key={p.id} className="list-row" onClick={() => setEditingPrep(p)}>
            <div className="text">
              <div className="title" style={{ fontSize: 15 }}>{p.title}</div>
              <div className="sub">Prep · {weekdaysLabel(p.fireWeekdays)} at {p.fireTime}</div>
            </div>
            <IconChevronRight className="chev" width={18} />
          </button>
        ))}
        {preps.length < MAX_PREPS && (
          <button className="list-row link-btn" style={{ minHeight: 48 }} onClick={() => setEditingPrep('new')}>
            + Add prep
          </button>
        )}
      </div>
      <PrepSheet commitment={c} editing={editingPrep} onClose={() => setEditingPrep(null)} />
      <OccurrenceSheet commitment={logging ? c : null} date={today} today={today} onClose={() => setLogging(false)} />
    </div>
  )
}

function PrepSheet({ commitment, editing, onClose }: { commitment: Commitment; editing: Prep | 'new' | null; onClose: () => void }) {
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
    <Sheet open onClose={onClose} title={editing === 'new' ? `Prep for ${commitment.label}` : 'Edit prep'}>
      <PrepEditor preps={drafts} onChange={(p) => p.length ? setDrafts(p) : onClose()} showErrors={tried} />
      <div className="sheet-actions">
        {editing !== 'new' && <button className="btn danger" onClick={async () => { await removePrep(editing); onClose() }}>Delete</button>}
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  )
}

function CommitmentSheet({ goal, editing, today, onClose }: { goal: Goal; editing: Commitment | 'new' | null; today: string; onClose: () => void }) {
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
    toast('Saved.')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={editing === 'new' ? 'New commitment' : 'Edit commitment'}>
      {editing === 'new' && (
        <Field label="Kind" info={SHAPE_INFO}><ShapeField d={d} set={patch} /></Field>
      )}
      <div style={{ height: 18 }} />
      <MeasurementFields d={d} set={patch} e={e} showErrors={tried} />
      <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={e} showErrors={tried} /></div>
      {editing === 'new' && (
        <Field label="Starts" htmlFor="c-start" info="Scoring starts on this day. Pick a later date to prepare first — it won’t show on Today until then.">
          <input id="c-start" type="date" value={start} onChange={(ev) => setStart(ev.target.value)} />
        </Field>
      )}
      <div className="sheet-actions"><button className="btn primary" onClick={save}>Save</button></div>
    </Sheet>
  )
}

function AbandonSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [reason, setReason] = useState('')
  if (!goal) return null
  return (
    <Sheet open onClose={onClose} title="Abandon this goal?">
      <Field label="Reason (optional)" htmlFor="abandon-why" info="It leaves Today but stays in your history. A decision, not a failure.">
        <textarea id="abandon-why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Keep it</button>
        <button className="btn primary" onClick={async () => {
          await setGoalState(goal, 'abandoned', reason)
          toast('Abandoned.')
          onClose()
        }}>Abandon</button>
      </div>
    </Sheet>
  )
}

// ——— history ———

function GoalHistory({ goal, snap, today }: { goal: Goal; snap: Snapshot; today: string }) {
  const revisions = useRevisions(goal.id)
  const reviews = useGoalReviews(goal.id)
  const displacements = useDisplacements()
  const [limit, setLimit] = useState(30)
  const commitments = snap.commitments.filter((c) => c.goalId === goal.id)
  const preps = snap.preps.filter((p) => commitments.some((c) => c.id === p.commitmentId))
  const subjects = new Map<string, { label: string; c?: Commitment }>()
  commitments.forEach((c) => subjects.set(c.id, { label: c.label, c }))
  preps.forEach((p) => subjects.set(p.id, { label: `prep: ${p.title}` }))

  const entries = snap.entries.filter((e) => subjects.has(e.subjectId) && !e.deletedAt)
  const supersededBy = new Map<string, Entry>()
  entries.forEach((e) => e.supersedes && supersededBy.set(e.supersedes, e))
  const rows = entries
    .filter((e) => e.outcome !== 'void')
    .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt))

  const describe = (e: Entry) => {
    const s = subjects.get(e.subjectId)!
    const parts = [s.label]
    if (e.value != null && s.c) parts.push(formatValue(s.c, e.value))
    if (e.outcome === 'hit') parts.push(e.value != null ? '✓' : 'done')
    if (e.outcome === 'miss') {
      parts.push('missed')
      if (e.missReason) parts.push(`— ${reasonLabel(e.missReason)}`)
      const d = displacements.find((x) => x.id === e.displacementId)
      if (d) parts.push(`(${d.label})`)
    }
    return parts.join(' ')
  }

  return (
    <Section title="History" aside={
      <DatePickerButton className="link-btn" value="" max={today} label="Backfill a day"
        onPick={(d) => isDateStr(d) && d <= today && navigate(`/day/${d}`)}>
        Backfill a day
      </DatePickerButton>
    }>
      <div className="card">
        {rows.length === 0 ? (
          <div className="list-empty">No check-ins yet.</div>
        ) : (
          <ul className="history">
            {rows.slice(0, limit).map((e) => {
              const replaced = supersededBy.get(e.id)
              return (
                <li key={e.id}>
                  <span className="when">{dayMonth(e.date).replace(/(\w{3})\w*$/, '$1')}</span>
                  <span className="what">
                    <span className={replaced ? 'superseded' : ''}>{describe(e)}</span>
                    {replaced && <span className="tag"> {replaced.outcome === 'void' ? 'undone' : 'corrected'}</span>}
                    {e.supersedes && <span className="tag"> correction</span>}
                    {e.note && <div className="tag">“{e.note}”</div>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {rows.length > limit && <button className="list-row link-btn" onClick={() => setLimit(limit + 60)}>Show more</button>}
      </div>

      {(revisions.length > 0 || reviews.length > 0) && (
        <div className="card" style={{ marginTop: 12 }}>
          <ul className="history">
            {reviews.map((r) => (
              <li key={r.id}>
                <span className="when">{r.timestamp.slice(0, 10)}</span>
                <span className="what">
                  Review: {r.hit ? 'hit it' : 'didn’t hit it'} · {r.outcome}
                  {r.whatHappened && <div className="tag">{r.whatHappened}</div>}
                  {r.journalNote && <div className="tag">“{r.journalNote}”</div>}
                </span>
              </li>
            ))}
            {[...revisions].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((r) => (
              <li key={r.id}>
                <span className="when">{r.timestamp.slice(0, 10)}</span>
                <span className="what">{revisionText(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function revisionText(r: Revision) {
  if (r.field === 'commitment' && r.oldValue === '—') return <>Added habit: {r.newValue}</>
  if (r.field === 'commitment' && r.newValue === 'removed') return <>Removed habit: {r.oldValue}</>
  return <>Changed {r.field}: <s className="muted">{r.oldValue}</s> → {r.newValue}</>
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
    title: d.title.trim() ? undefined : 'Required.',
    doneWhen: outcome ? measurementProblem(d.doneWhen ?? '') ?? undefined : undefined,
    whyValueId: d.whyValueId ? undefined : 'Pick a value.',
    whyText: d.whyText.trim() ? undefined : 'Required.',
    targetDate: outcome && !d.targetDate ? 'A finish line needs a deadline.'
      : d.targetDate && d.targetDate <= d.startDate ? 'Must be after the start date.' : undefined,
  }
  const ok = !Object.values(errors).some(Boolean)
  const save = async () => {
    if (!ok) return setTried(true)
    await updateGoal(goal, {
      title: d.title.trim(), whyValueId: d.whyValueId, whyText: d.whyText.trim(), tolerancePct: d.tolerancePct,
      startDate: d.startDate, targetDate: d.targetDate || null,
      ...(outcome ? { doneWhen: (d.doneWhen ?? '').trim(), graceDays: d.graceDays ?? 0 } : {}),
    })
    toast('Saved.')
    navigate(`/goals/${goal.id}`, { replace: true })
  }

  return (
    <Screen back={`/goals/${goal.id}`} eyebrow="Edit" title={goal.title}>
      <section className="card pad smart-section">
        <SmartHead k="S" />
        <Field label="Goal" htmlFor="title" error={tried ? errors.title : undefined}>
          <input id="title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
      </section>
      {outcome && (
        <section className="card pad smart-section">
          <SmartHead k="M" />
          <Field label="Done when" htmlFor="done-when" error={tried ? errors.doneWhen : undefined}>
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
          onValue={(v) => setD({ ...d, whyValueId: v })} onText={(t) => setD({ ...d, whyText: t })} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="T" />
        <div className="inline-fields">
          <Field label="Start" htmlFor="start">
            <input id="start" type="date" value={d.startDate} onChange={(e) => isDateStr(e.target.value) && setD({ ...d, startDate: e.target.value })} />
          </Field>
          <Field label={outcome ? 'Deadline' : 'Review on'} htmlFor="target" error={tried ? errors.targetDate : undefined}>
            <input id="target" type="date" value={d.targetDate ?? ''} onChange={(e) => setD({ ...d, targetDate: e.target.value || null })} />
          </Field>
        </div>
      </section>
      {!outcome && <p className="small muted" style={{ margin: '12px 4px 0' }}>Commitments are edited on the goal’s page.</p>}
      <div className="wizard-nav"><button className="btn primary" onClick={save}>Save changes</button></div>
    </Screen>
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
    toast('Saved.')
    navigate(`/goals/${goal.id}`, { replace: true })
  }
  const choice = (v: typeof outcome, t: string, d: string) => (
    <button role="radio" aria-checked={outcome === v} className={`choice ${outcome === v ? 'on' : ''}`} onClick={() => setOutcome(v)}>
      <div className="t">{t}</div><div className="d">{d}</div>
    </button>
  )

  return (
    <Screen back={`/goals/${goal.id}`} eyebrow="Goal review" title={goal.title}>
      <Field label="1. Did you hit it?">
        <div className="segmented" role="radiogroup" aria-label="Did you hit it">
          <button role="radio" aria-checked={hit === true} className={hit === true ? 'on' : ''} onClick={() => setHit(true)}>Yes</button>
          <button role="radio" aria-checked={hit === false} className={hit === false ? 'on' : ''} onClick={() => setHit(false)}>No</button>
        </div>
      </Field>
      <Field label="2. What happened?" htmlFor="wh">
        <textarea id="wh" rows={3} value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)} />
      </Field>
      <Field label="Journal" htmlFor="journal" info="Kept with the goal. Write what would make it make sense to you a year from now.">
        <textarea id="journal" rows={5} value={journal} onChange={(e) => setJournal(e.target.value)} />
      </Field>
      <div className="section">
        <div className="field-label" style={{ marginBottom: 10 }}>3. What next?</div>
        <div role="radiogroup" aria-label="What next">
          {!(finishLine && hit) && choice('renewed', 'Renew', finishLine ? 'New deadline.' : 'New review date.')}
          {!finishLine && choice('maintenance', 'Maintenance', 'Keep doing it, no finish line.')}
          {choice('completed', 'Close it out', finishLine && hit ? 'Done. It moves to your history.' : 'Archive it.')}
        </div>
        {outcome === 'renewed' && (
          <Field label={finishLine ? 'New deadline' : 'New review date'} htmlFor="renew">
            <input id="renew" type="date" min={today} value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="wizard-nav"><button className="btn primary" disabled={!ready} onClick={save}>Save review</button></div>
    </Screen>
  )
}
