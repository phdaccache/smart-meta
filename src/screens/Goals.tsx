import { useMemo, useState, type ReactNode } from 'react'
import { reorderGoals, setGoalState } from '../db/repo'
import { marked, t } from '../i18n'
import { dayMonth, relativeDay } from '../lib/dates'
import { cadenceText } from '../lib/describe'
import { activeEntries, summarizeGoal, type ScoreContext } from '../lib/scoring'
import { waitsForGoal, type Snapshot } from '../lib/today'
import type { Goal, Project } from '../lib/types'
import { InfoTip, PageText, Screen, Section, Segmented, Sheet, StatusInfo, StatusWord, toast, WeekBar } from '../ui/components'
import { useAllGoalReviews, useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconMore, IconPlus } from '../ui/icons'
import { navigate } from '../ui/router'
import { Sortable } from '../ui/Sortable'

type View = 'goals' | 'projects'

function useStoredView(): [View, (v: View) => void] {
  const [v, setV] = useState<View>(() => {
    try {
      return localStorage.getItem('plan-view') === 'projects' ? 'projects' : 'goals'
    } catch {
      return 'goals'
    }
  })
  return [v, (next) => {
    setV(next)
    try {
      localStorage.setItem('plan-view', next)
    } catch {
      // private mode: just not remembered
    }
  }]
}

export function GoalsScreen() {
  const [view, setView] = useStoredView()
  const [acting, setActing] = useState<Goal | null>(null)
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const reviews = useAllGoalReviews()
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  if (!snap) return null

  const byPriority = (a: Goal, b: Goal) => a.priority - b.priority
  const active = snap.goals.filter((g) => g.state === 'active').sort(byPriority)
  const maintenance = snap.goals.filter((g) => g.state === 'maintenance').sort(byPriority)
  const backlog = snap.goals.filter((g) => g.state === 'backlog').sort(byPriority)
  const archived = snap.goals.filter((g) => g.state === 'completed' || g.state === 'abandoned')
  // The journal (or what happened) from an ended goal's last review, so it's seen without opening it.
  const lastWords = (id: string) => {
    const r = reviews.filter((x) => x.goalId === id).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    return r?.journalNote || r?.whatHappened || ''
  }
  const projects = snap.projects.filter((p) => p.state === 'active' && !waitsForGoal(p, snap.goals, today))
  const waiting = snap.projects.filter((p) => p.state === 'active' && waitsForGoal(p, snap.goals, today))
  const doneProjects = snap.projects.filter((p) => p.state !== 'active')
  const slotOpen = active.length < settings.goalCap

  return (
    <Screen title={t('plan.title')} settings actions={
      <button className="icon-btn" aria-label={view === 'goals' ? t('plan.newGoal') : t('plan.newProject')}
        onClick={() => navigate(view === 'goals' ? '/goals/new' : '/projects/new')}><IconPlus /></button>
    }>
      <div className="today-filter">
        <Segmented label={t('common.show')} value={view} onChange={setView}
          options={[{ value: 'goals', label: t('plan.goals') }, { value: 'projects', label: t('plan.projects') }]} />
      </div>

      {view === 'projects' ? (
        <>
          <Section title={t('plan.activeProjects')} aside={<span>{projects.length}</span>}>
            {projects.length === 0 ? (
              <div className="card list-empty">{t('plan.noProjects')} <button className="link-btn" onClick={() => navigate('/projects/new')}>{t('plan.createProject')}</button></div>
            ) : (
              <div className="card list tint-project">
                {projects.map((p) => <ProjectRow key={p.id} project={p} snap={snap} today={today} />)}
              </div>
            )}
          </Section>
          {waiting.length > 0 && (
            <Section title={<span className="title-row">{t('plan.waitingProjects')}<InfoTip label={t('plan.waitingProjects')}>{t('plan.waitingInfo')}</InfoTip></span>}
              aside={<span>{waiting.length}</span>}>
              <div className="card list">
                {waiting.map((p) => <ProjectRow key={p.id} project={p} snap={snap} today={today} />)}
              </div>
            </Section>
          )}
          {doneProjects.length > 0 && (
            <Section title={t('plan.doneProjects')}>
              <div className="card list">
                {doneProjects.map((p) => <ProjectRow key={p.id} project={p} snap={snap} today={today} />)}
              </div>
            </Section>
          )}
        </>
      ) : (<>
      <Section title={<span className="title-row">{t('plan.active')} <StatusInfo /></span>} aside={<span>{t('chart.nOf', { n: active.length, total: settings.goalCap })}</span>}>
        {active.length === 0 ? (
          <div className="card list-empty">
            {t('plan.noActive')} {backlog.length > 0 ? t('plan.startFromBacklog') : <button className="link-btn" onClick={() => navigate('/goals/new')}>{t('plan.createGoal')}</button>}
          </div>
        ) : (
          <Sortable items={active} keyOf={(g) => g.id} labelOf={(g) => g.title} className="card-stack"
            onReorder={(next) => reorderGoals([...next, ...maintenance, ...backlog])}
            render={(g, grip) => <GoalCard goal={g} snap={snap} ctx={ctx} grip={grip} onMore={() => setActing(g)} />} />
        )}
      </Section>

      {maintenance.length > 0 && (
        <Section title={<span className="title-row">{t('plan.maintenance')} <InfoTip label={t('common.about', { topic: t('plan.maintenance').toLowerCase() })}>{t('plan.maintenanceInfo')}</InfoTip></span>}>
          <div className="card-stack">
            {maintenance.map((g) => <GoalCard key={g.id} goal={g} snap={snap} ctx={ctx} onMore={() => setActing(g)} />)}
          </div>
        </Section>
      )}

      {backlog.length > 0 && (
        <Section title={t('plan.backlog')}>
          <div className="card tint-goal">
            <Sortable items={backlog} keyOf={(g) => g.id} labelOf={(g) => g.title} className="list"
              onReorder={(next) => reorderGoals([...active, ...maintenance, ...next])}
              render={(g, grip) => (
                <div className="list-row">
                  <button className="text" style={{ textAlign: 'left' }} onClick={() => navigate(`/goals/${g.id}`)}>
                    <div className="title">{g.title}</div>
                    <div className="sub">{g.kind === 'outcome' ? t('plan.finishLine') : habitSummary(g, snap)}</div>
                  </button>
                  {slotOpen && (
                    <button className="btn" onClick={async () => {
                      await setGoalState(g, 'active')
                      toast(t('common.started'))
                    }}>{t('common.start')}</button>
                  )}
                  {backlog.length > 1 && grip}
                </div>
              )} />
          </div>
        </Section>
      )}

      {archived.length > 0 && (
        <Section title={t('plan.archive')}>
          <details className="card">
            <summary className="list-row" style={{ cursor: 'pointer' }}>
              <span className="text title">{t('plan.archivedCount', { n: archived.length })}</span>
            </summary>
            <div className="list">
              {archived.map((g) => (
                <button key={g.id} className="list-row" onClick={() => navigate(`/goals/${g.id}`)}>
                  <div className="text">
                    <div className="title">{g.title}</div>
                    <div className="sub">
                      {g.state === 'completed' ? t('state.completed')
                        : g.abandonReason ? t('plan.abandonedBecause', { reason: g.abandonReason }) : t('state.abandoned')}
                    </div>
                    {lastWords(g.id) && <div className="sub last-words">“{lastWords(g.id)}”</div>}
                  </div>
                  <IconChevronRight className="chev" width={18} />
                </button>
              ))}
            </div>
          </details>
        </Section>
      )}
      </>)}
      <GoalStateSheet goal={acting} slotOpen={slotOpen} onClose={() => setActing(null)} />
    </Screen>
  )
}

/** Move a goal between active, maintenance and the backlog, any time. */
export function GoalStateSheet({ goal, slotOpen, onClose }: { goal: Goal | null; slotOpen: boolean; onClose: () => void }) {
  if (!goal) return null
  const move = async (state: Goal['state'], msg: string) => {
    await setGoalState(goal, state)
    toast(msg)
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={goal.title}>
      <div className="card list">
        {goal.state === 'active' && goal.kind !== 'outcome' && (
          <button className="list-row" onClick={() => move('maintenance', t('move.nowMaintenance'))}>
            <div className="text">
              <div className="title">{t('move.toMaintenance')}</div>
              <div className="sub"><PageText text={goal.targetDate ? marked('move.toMaintenanceSubDate') : marked('move.toMaintenanceSub')} /></div>
            </div>
          </button>
        )}
        {goal.state === 'maintenance' && (
          <button className="list-row" disabled={!slotOpen} onClick={() => move('active', t('move.activeAgain'))}>
            <div className="text">
              <div className="title">{t('move.makeActive')}</div>
              <div className="sub">{slotOpen ? t('move.takesSlot') : t('move.noSlot')}</div>
            </div>
          </button>
        )}
        <button className="list-row" onClick={() => move('backlog', t('move.paused'))}>
          <div className="text">
            <div className="title">{t('move.pause')}</div>
            <div className="sub"><PageText text={marked('move.pauseSub')} /></div>
          </div>
        </button>
      </div>
    </Sheet>
  )
}

function habitSummary(goal: Goal, snap: Snapshot, today?: string): string {
  return snap.commitments
    .filter((c) => c.goalId === goal.id)
    .map((c) => `${c.label} · ${cadenceText(c)}${today && c.startDate > today ? ` ${t('plan.fromDate', { when: relativeDay(c.startDate, today) })}` : ''}`)
    .join('  ·  ')
}

function GoalCard({ goal, snap, ctx, grip, onMore }: { goal: Goal; snap: Snapshot; ctx: ScoreContext; grip?: ReactNode; onMore?: () => void }) {
  const s = summarizeGoal(goal, snap.commitments, snap.entries, snap.occurrences, ctx)
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const hasHabits = snap.commitments.some((c) => c.goalId === goal.id)
  const projects = snap.projects.filter((p) => p.goalId === goal.id && p.state === 'active')
  const outcome = goal.kind === 'outcome'
  const reviewOn = outcome && s.time ? s.time.graceEnd : goal.targetDate
  const open = () => navigate(`/goals/${goal.id}`)
  return (
    <div className="card goal-card tint-goal">
      <div className="goal-card-head">
        <button className="text" onClick={open}>
          <div className="group-eyebrow">{value?.name ?? t('common.goal')}{outcome ? t('plan.finishLineTag') : ''}</div>
          <div className="goal-card-title">{goal.title}</div>
        </button>
        {onMore && <button className="icon-btn" aria-label={t('common.change', { name: goal.title })} onClick={onMore}><IconMore /></button>}
        {grip}
      </div>
      <button className="goal-card-body" onClick={open}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <StatusWord status={s.status} />
          {outcome && goal.targetDate
            ? <span className="small muted">{t('today.due', { when: `${dayMonth(goal.targetDate)} ${goal.targetDate.slice(0, 4)}` })}</span>
            : hasHabits && <WeekBar weeks={s.weeks} />}
        </div>
        {hasHabits && <div className="small muted" style={{ marginTop: 6 }}>{habitSummary(goal, snap, ctx.today)}</div>}
        {reviewOn && reviewOn <= ctx.today && <div className="small" style={{ marginTop: 8, color: 'var(--accent)', fontWeight: 600 }}>{t('plan.reviewDue')}</div>}
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
  const steps = snap.tasks.filter((x) => x.projectId === p.id)
  const doneIds = new Set(activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => e.subjectId))
  const done = steps.filter((x) => doneIds.has(x.id)).length
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
          {total ? t('plan.stepsOf', { done, total }) : t('plan.noSteps')}
          {project.state === 'active' && waitsForGoal(project, snap.goals, today)
            ? null
            : project.state === 'active'
            ? <> · <span style={overdue ? { color: 'var(--at-risk)' } : undefined}>{t('today.due', { when: relativeDay(project.targetDate, today) })}</span></>
            : project.state === 'archived' ? t('plan.setAside') : t('plan.done')}
          {goal && ` · ${goal.title}`}
        </div>
        {total > 0 && <div className="progress"><i style={{ width: `${(100 * done) / total}%` }} /></div>}
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
}
