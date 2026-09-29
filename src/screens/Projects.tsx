import { useState } from 'react'
import { check, createProject, createTask, deleteProject, reorderSteps, uncheck, updateProject, updateTask } from '../db/repo'
import { addDays, dayMonth, isDateStr, relativeDay } from '../lib/dates'
import { activeEntries } from '../lib/scoring'
import type { Task } from '../lib/types'
import { CheckButton, Field, Screen, Section, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight } from '../ui/icons'
import { Sortable } from '../ui/Sortable'
import { navigate } from '../ui/router'
import { GoalSelect } from './TaskSheet'

export function NewProjectScreen({ goalId: presetGoal }: { goalId?: string | null }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState(() => addDays(today, 30))
  const [goalId, setGoalId] = useState<string | null>(presetGoal ?? null)
  const [steps, setSteps] = useState<string[]>(['', ''])
  const [tried, setTried] = useState(false)

  const errors = {
    title: title.trim() ? undefined : 'Name the outcome.',
    targetDate: isDateStr(targetDate) && targetDate >= today ? undefined : 'Pick a date from today on.',
  }
  const save = async () => {
    if (errors.title || errors.targetDate) return setTried(true)
    const p = await createProject({ title, targetDate, goalId, steps })
    toast('Project saved.')
    navigate(`/projects/${p.id}`, { replace: true })
  }

  return (
    <Screen back="/goals" title="New project">
      <Field label="Outcome" htmlFor="p-title" error={tried ? errors.title : undefined}>
        <input id="p-title" autoFocus value={title} placeholder="Get driver’s license" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Target date" htmlFor="p-date" error={tried ? errors.targetDate : undefined}>
        <input id="p-date" type="date" min={today} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Goal" htmlFor="p-goal">
        <GoalSelect id="p-goal" value={goalId} onChange={setGoalId} />
      </Field>
      <Field label="Steps" info="Today shows only the current step.">
        <ol className="steps-editor">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="num">{i + 1}</span>
              <input value={s} aria-label={`Step ${i + 1}`} placeholder={i === 0 ? 'Book the theory exam' : ''}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (i === steps.length - 1) setSteps([...steps, ''])
                  }
                }} />
            </li>
          ))}
        </ol>
        <button className="link-btn" onClick={() => setSteps([...steps, ''])}>+ Add step</button>
      </Field>
      <div className="wizard-nav"><button className="btn primary" onClick={save}>Save project</button></div>
    </Screen>
  )
}

export function ProjectScreen({ id }: { id: string }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const [newStep, setNewStep] = useState('')
  const [editing, setEditing] = useState(false)
  if (!snap) return null
  const project = snap.projects.find((p) => p.id === id)
  if (!project) {
    return <Screen back="/goals" title="Not found"><p className="muted">This project doesn’t exist, or was deleted.</p></Screen>
  }

  const goal = project.goalId ? snap.goals.find((g) => g.id === project.goalId) : undefined
  const steps = snap.tasks.filter((t) => t.projectId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const doneEntry = new Map(
    activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => [e.subjectId, e]),
  )
  const done = steps.filter((s) => doneEntry.has(s.id)).length
  const currentId = steps.find((s) => !doneEntry.has(s.id))?.id
  const allDone = steps.length > 0 && done === steps.length

  const toggle = (t: Task) => {
    const e = doneEntry.get(t.id)
    return e ? uncheck(e.id) : check({ subjectType: 'task', subjectId: t.id }, today)
  }
  const add = async () => {
    if (!newStep.trim()) return
    await createTask({ title: newStep, projectId: id })
    setNewStep('')
  }

  return (
    <Screen back={goal ? `/goals/${goal.id}` : '/goals'} eyebrow={project.state === 'active' ? 'Project' : project.state === 'archived' ? 'Project · set aside' : 'Project · done'} title={project.title}>
      {allDone && project.state === 'active' && (
        <div className="banner">
          <div className="text">Every step is done.</div>
          <button className="btn primary" onClick={async () => {
            await updateProject(project, { state: 'done' })
            toast('Done and archived.')
          }}>Mark done</button>
        </div>
      )}

      <Section title="Details" aside={<button className="link-btn" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>}>
        <div className="card tint-project">
          {goal && (
            <button className="card-head pad list-row" style={{ borderRadius: 0 }} onClick={() => navigate(`/goals/${goal.id}`)}>
              <div className="text">
                <div className="group-eyebrow">{goal.title}</div>
                <div className="group-why">{goal.whyText}</div>
              </div>
              <IconChevronRight className="chev" width={18} />
            </button>
          )}
          <div className="pad">
            {editing ? (
              <>
                <Field label="Outcome" htmlFor="pe-title">
                  <input id="pe-title" defaultValue={project.title}
                    onBlur={(e) => e.target.value.trim() && updateProject(project, { title: e.target.value.trim() })} />
                </Field>
                <Field label="Target date" htmlFor="pe-date">
                  <input id="pe-date" type="date" defaultValue={project.targetDate}
                    onChange={(e) => isDateStr(e.target.value) && updateProject(project, { targetDate: e.target.value })} />
                </Field>
                <Field label="Goal" htmlFor="pe-goal">
                  <GoalSelect id="pe-goal" value={project.goalId ?? null} onChange={(goalId) => updateProject(project, { goalId })} />
                </Field>
              </>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small muted">{done} of {steps.length} steps</span>
                  <span className="small muted">due {relativeDay(project.targetDate, today)} · {dayMonth(project.targetDate)}</span>
                </div>
                <div className="progress"><i style={{ width: `${steps.length ? (100 * done) / steps.length : 0}%` }} /></div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Steps">
        <div className="card tint-project">
          <Sortable items={steps} keyOf={(t) => t.id} labelOf={(t) => t.title} onReorder={reorderSteps} className="items"
            render={(t, grip) => (
              <div className={`item kind-step ${doneEntry.has(t.id) ? 'done' : ''}`}>
                <CheckButton shape="square" checked={doneEntry.has(t.id)} label={t.title} onClick={() => toggle(t)} />
                <StepTitle task={t} current={t.id === currentId} />
                {grip}
              </div>
            )} />
          <form className="add-inline" style={{ padding: 12, marginTop: 0, borderTop: steps.length ? '1px solid var(--line)' : 0 }}
            onSubmit={(e) => { e.preventDefault(); add() }}>
            <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step" aria-label="New step" />
            <button className="btn" type="submit" disabled={!newStep.trim()}>Add</button>
          </form>
        </div>
      </Section>

      <Section title="Manage">
        <div className="card pad stack">
          {project.state === 'active' ? (
            <button className="btn outline block" onClick={() => updateProject(project, { state: 'done' })}>Mark done and archive</button>
          ) : (
            <button className="btn outline block" onClick={() => updateProject(project, { state: 'active' })}>Reopen</button>
          )}
          <details>
            <summary className="small muted" style={{ cursor: 'pointer', padding: '10px 0' }}>Delete project</summary>
            <TypeToConfirm phrase={project.title} action="Delete project and its steps" onConfirm={async () => {
              await deleteProject(project)
              navigate('/goals', { replace: true })
            }} />
          </details>
        </div>
      </Section>
    </Screen>
  )
}

function StepTitle({ task, current }: { task: Task; current: boolean }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input className="item-main" autoFocus defaultValue={task.title} aria-label="Step title" style={{ margin: '6px 0' }}
        onBlur={async (e) => {
          if (e.target.value.trim() && e.target.value.trim() !== task.title) await updateTask(task, { title: e.target.value.trim() })
          setEditing(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    )
  }
  return (
    <button className="item-main" onClick={() => setEditing(true)}>
      <div className="item-title">{task.title}</div>
      {current && <div className="item-detail">Current</div>}
    </button>
  )
}
