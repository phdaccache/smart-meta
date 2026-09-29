import { useMemo } from 'react'
import { reorderGoals, setGoalState } from '../db/repo'
import { relativeDay } from '../lib/dates'
import { cadenceText } from '../lib/describe'
import { activeEntries, summarizeGoal, type ScoreContext } from '../lib/scoring'
import type { Snapshot } from '../lib/today'
import type { Goal, Project } from '../lib/types'
import { InfoTip, Screen, Section, StatusWord, toast, WeekBar } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconDown, IconPlus, IconUp } from '../ui/icons'
import { navigate } from '../ui/router'

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
  const projects = snap.projects.filter((p) => p.state === 'active')
  const doneProjects = snap.projects.filter((p) => p.state !== 'active')
  const slotOpen = active.length < settings.goalCap

  const move = (list: Goal[], i: number, dir: -1 | 1) => {
    const next = [...list]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    reorderGoals(next)
  }

  return (
    <Screen title="Goals" settings actions={
      <button className="icon-btn" aria-label="New goal" onClick={() => navigate('/goals/new')}><IconPlus /></button>
    }>
      <Section title="Active" aside={<span>{active.length} of {settings.goalCap}</span>}>
        {active.length === 0 ? (
          <div className="card list-empty">
            No active goals. <button className="link-btn" onClick={() => navigate('/goals/new')}>Create one</button>
          </div>
        ) : (
          <div className="stack">
            {active.map((g) => <GoalCard key={g.id} goal={g} snap={snap} ctx={ctx} />)}
          </div>
        )}
      </Section>

      {maintenance.length > 0 && (
        <Section title={<span className="title-row">Maintenance <InfoTip label="About maintenance">Goals you keep doing without a finish line. Still scored; they don’t count toward the active limit.</InfoTip></span>}>
          <div className="card list">
            {maintenance.map((g) => <GoalRow key={g.id} goal={g} snap={snap} ctx={ctx} />)}
          </div>
        </Section>
      )}

      {backlog.length > 0 && <Section title="Backlog">
        {(
          <div className="card list">
            {backlog.map((g, i) => (
              <div key={g.id} className="list-row">
                <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${g.id}`)}>
                  <div className="title">{g.title}</div>
                </button>
                {backlog.length > 1 && (
                  <div className="row" style={{ gap: 0 }}>
                    <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(backlog, i, -1)}><IconUp width={18} /></button>
                    <button className="icon-btn" aria-label="Move down" disabled={i === backlog.length - 1} onClick={() => move(backlog, i, 1)}><IconDown width={18} /></button>
                  </div>
                )}
                {slotOpen && (
                  <button className="btn" onClick={async () => {
                    await setGoalState(g, 'active')
                    toast('Started.')
                  }}>Start</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>}

      <Section title="Projects" aside={<button className="link-btn" onClick={() => navigate('/projects/new')}>New project</button>}>
        {projects.length === 0 ? (
          <div className="card list-empty">No projects.</div>
        ) : (
          <div className="card list tint-project">
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

function GoalCard({ goal, snap, ctx }: { goal: Goal; snap: Snapshot; ctx: ScoreContext }) {
  const s = summarizeGoal(goal, snap.commitments, snap.entries, snap.occurrences, ctx)
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const commitments = snap.commitments.filter((c) => c.goalId === goal.id)
  const reviewDue = goal.targetDate && goal.targetDate <= ctx.today
  return (
    <button className="card goal-card tint-goal" style={{ textAlign: 'left', width: '100%' }} onClick={() => navigate(`/goals/${goal.id}`)}>
      <div className="top">
        <div style={{ minWidth: 0 }}>
          <div className="group-eyebrow">{value?.name ?? 'Goal'}</div>
          <div className="title" style={{ fontWeight: 650, fontSize: 17 }}>{goal.title}</div>
        </div>
        <IconChevronRight className="chev" width={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
      </div>
      <div className="sub muted small" style={{ marginTop: 4 }}>
        {commitments.map((c) => `${c.label} · ${cadenceText(c)}`).join('  ·  ')}
      </div>
      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <StatusWord status={s.status} />
        <WeekBar weeks={s.weeks} />
      </div>
      {reviewDue && <div className="small" style={{ marginTop: 10, color: 'var(--accent)', fontWeight: 600 }}>Review due</div>}
    </button>
  )
}

function GoalRow({ goal, snap, ctx }: { goal: Goal; snap: Snapshot; ctx: ScoreContext }) {
  const s = summarizeGoal(goal, snap.commitments, snap.entries, snap.occurrences, ctx)
  return (
    <button className="list-row" onClick={() => navigate(`/goals/${goal.id}`)}>
      <div className="text">
        <div className="title">{goal.title}</div>
        <div className="meta"><StatusWord status={s.status} /><WeekBar weeks={s.weeks} /></div>
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
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
