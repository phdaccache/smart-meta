import { useMemo, type ReactNode } from 'react'
import { reorderGoals, setGoalState } from '../db/repo'
import { dayMonth, relativeDay } from '../lib/dates'
import { cadenceText } from '../lib/describe'
import { activeEntries, summarizeGoal, type ScoreContext } from '../lib/scoring'
import type { Snapshot } from '../lib/today'
import type { Goal, Project } from '../lib/types'
import { InfoTip, Screen, Section, StatusWord, toast, WeekBar } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconPlus } from '../ui/icons'
import { navigate } from '../ui/router'
import { Sortable } from '../ui/Sortable'

export function GoalsScreen() {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  if (!snap) return null

  const byPriority = (a: Goal, b: Goal) => a.priority - b.priority
  const active = snap.goals.filter((g) => g.state === 'active').sort(byPriority)
  const maintenance = snap.goals.filter((g) => g.state === 'maintenance').sort(byPriority)
  const backlog = snap.goals.filter((g) => g.state === 'backlog').sort(byPriority)
  const archived = snap.goals.filter((g) => g.state === 'completed' || g.state === 'abandoned')
  const shownInCards = new Set([...active, ...maintenance].map((g) => g.id))
  // Projects of active goals live inside their goal's card; the rest are listed on their own.
  const projects = snap.projects.filter((p) => p.state === 'active' && !(p.goalId && shownInCards.has(p.goalId)))
  const doneProjects = snap.projects.filter((p) => p.state !== 'active')
  const slotOpen = active.length < settings.goalCap

  return (
    <Screen title="Goals" settings actions={
      <button className="icon-btn" aria-label="New goal" onClick={() => navigate('/goals/new')}><IconPlus /></button>
    }>
      <Section title="Active" aside={<span>{active.length} of {settings.goalCap}</span>}>
        {active.length === 0 ? (
          <div className="card list-empty">
            No active goals. {backlog.length > 0 ? 'Start one from the backlog.' : <button className="link-btn" onClick={() => navigate('/goals/new')}>Create one</button>}
          </div>
        ) : (
          <Sortable items={active} keyOf={(g) => g.id} labelOf={(g) => g.title} className="card-stack"
            onReorder={(next) => reorderGoals([...next, ...maintenance, ...backlog])}
            render={(g, grip) => <GoalCard goal={g} snap={snap} ctx={ctx} grip={grip} />} />
        )}
      </Section>

      {maintenance.length > 0 && (
        <Section title={<span className="title-row">Maintenance <InfoTip label="About maintenance">Goals you keep doing without a finish line. Still scored; they don’t count toward the active limit.</InfoTip></span>}>
          <div className="card-stack">
            {maintenance.map((g) => <GoalCard key={g.id} goal={g} snap={snap} ctx={ctx} />)}
          </div>
        </Section>
      )}

      {backlog.length > 0 && (
        <Section title="Backlog">
          <div className="card">
            <Sortable items={backlog} keyOf={(g) => g.id} labelOf={(g) => g.title} className="list"
              onReorder={(next) => reorderGoals([...active, ...maintenance, ...next])}
              render={(g, grip) => (
                <div className="list-row">
                  <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${g.id}`)}>
                    <div className="title">{g.title}</div>
                    <div className="sub">{g.kind === 'outcome' ? 'Finish line' : habitSummary(g, snap)}</div>
                  </button>
                  {slotOpen && (
                    <button className="btn" onClick={async () => {
                      await setGoalState(g, 'active')
                      toast('Started.')
                    }}>Start</button>
                  )}
                  {backlog.length > 1 && grip}
                </div>
              )} />
          </div>
        </Section>
      )}

      <Section title="Projects" aside={<button className="link-btn" onClick={() => navigate('/projects/new')}>New project</button>}>
        {projects.length === 0 ? (
          <div className="card list-empty">{snap.projects.some((p) => p.state === 'active') ? 'All inside their goals above.' : 'No projects.'}</div>
        ) : (
          <div className="card list">
            {projects.map((p) => <ProjectRow key={p.id} project={p} snap={snap} today={today} />)}
          </div>
        )}
      </Section>

      {(archived.length > 0 || doneProjects.length > 0) && (
        <Section title="History">
          <details className="card">
            <summary className="list-row" style={{ cursor: 'pointer' }}>
              <span className="text title">Archived · {archived.length + doneProjects.length}</span>
            </summary>
            <div className="list">
              {archived.map((g) => (
                <button key={g.id} className="list-row" onClick={() => navigate(`/goals/${g.id}`)}>
                  <div className="text">
                    <div className="title">{g.title}</div>
                    <div className="sub">{g.state === 'completed' ? 'Completed' : `Abandoned${g.abandonReason ? ` — ${g.abandonReason}` : ''}`}</div>
                  </div>
                  <IconChevronRight className="chev" width={18} />
                </button>
              ))}
              {doneProjects.map((p) => <ProjectRow key={p.id} project={p} snap={snap} today={today} />)}
            </div>
          </details>
        </Section>
      )}
    </Screen>
  )
}

function habitSummary(goal: Goal, snap: Snapshot, today?: string): string {
  return snap.commitments
    .filter((c) => c.goalId === goal.id)
    .map((c) => `${c.label} · ${cadenceText(c)}${today && c.startDate > today ? ` (from ${relativeDay(c.startDate, today)})` : ''}`)
    .join('  ·  ')
}

function GoalCard({ goal, snap, ctx, grip }: { goal: Goal; snap: Snapshot; ctx: ScoreContext; grip?: ReactNode }) {
  const s = summarizeGoal(goal, snap.commitments, snap.entries, snap.occurrences, ctx)
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const hasHabits = snap.commitments.some((c) => c.goalId === goal.id)
  const projects = snap.projects.filter((p) => p.goalId === goal.id && p.state === 'active')
  const outcome = goal.kind === 'outcome'
  const reviewOn = outcome && s.time ? s.time.graceEnd : goal.targetDate
  const open = () => navigate(`/goals/${goal.id}`)
  return (
    <div className="card goal-card">
      <div className="goal-card-head">
        <button className="text" onClick={open}>
          <div className="group-eyebrow">{value?.name ?? 'Goal'}{outcome ? ' · Finish line' : ''}</div>
          <div className="goal-card-title">{goal.title}</div>
        </button>
        {grip}
      </div>
      <button className="goal-card-body" onClick={open}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <StatusWord status={s.status} />
          {outcome && goal.targetDate
            ? <span className="small muted">due {dayMonth(goal.targetDate)} {goal.targetDate.slice(0, 4)}</span>
            : hasHabits && <WeekBar weeks={s.weeks} />}
        </div>
        {hasHabits && <div className="small muted" style={{ marginTop: 6 }}>{habitSummary(goal, snap, ctx.today)}</div>}
        {reviewOn && reviewOn <= ctx.today && <div className="small" style={{ marginTop: 8, color: 'var(--accent)', fontWeight: 600 }}>Review due</div>}
      </button>
      {projects.length > 0 && (
        <div className="goal-card-projects">
          {projects.map((p) => {
            const { done, total } = projectProgress(p, snap)
            return (
              <button key={p.id} className="mini-project" onClick={() => navigate(`/projects/${p.id}`)}>
                <span className="name">{p.title}</span>
                <span className="small muted">{done}/{total}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function projectProgress(p: Project, snap: Snapshot) {
  const steps = snap.tasks.filter((t) => t.projectId === p.id)
  const doneIds = new Set(activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => e.subjectId))
  const done = steps.filter((t) => doneIds.has(t.id)).length
  return { done, total: steps.length, doneIds }
}

function ProjectRow({ project, snap, today }: { project: Project; snap: Snapshot; today: string }) {
  const { done, total } = projectProgress(project, snap)
  const goal = project.goalId ? snap.goals.find((g) => g.id === project.goalId) : undefined
  const overdue = project.state === 'active' && project.targetDate < today
  return (
    <button className="list-row" onClick={() => navigate(`/projects/${project.id}`)}>
      <div className="text">
        <div className="title">{project.title}</div>
        <div className="sub">
          {total ? `${done} of ${total} steps` : 'No steps yet'}
          {project.state === 'active' ? <> · <span style={overdue ? { color: 'var(--at-risk)' } : undefined}>due {relativeDay(project.targetDate, today)}</span></> : ' · done'}
          {goal && ` · ${goal.title}`}
        </div>
        {total > 0 && <div className="progress"><i style={{ width: `${(100 * done) / total}%` }} /></div>}
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
}
