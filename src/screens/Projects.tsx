import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { check, createProject, createTask, deleteProject, pauseProject, reorderSteps, startProject, uncheck, updateProject, updateTask } from '../db/repo'
import { marked, t } from '../i18n'
import { addDays, dayMonth, dayMonthShort, isDateStr, relativeDay } from '../lib/dates'
import { activeEntries } from '../lib/scoring'
import { stepDeadlines } from '../lib/today'
import type { DateStr, Task } from '../lib/types'
import { CheckButton, DatePickerButton, Field, InfoTip, PageText, Screen, Section, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconCalendar, IconChevronRight, IconClose } from '../ui/icons'
import { Sortable } from '../ui/Sortable'
import { navigate } from '../ui/router'
import { GoalSelect } from './TaskSheet'

/**
 * The step list of a project being written. Adding a step moves the cursor to
 * it straight away, while the keyboard is still up: the new field is rendered
 * and focused within the same tap (iOS only opens the keyboard for a focus
 * made during one), and the "+" button never takes focus from the field.
 */
export function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  const fields = useRef<(HTMLInputElement | null)[]>([])
  const focusStep = (i: number) => fields.current[i]?.focus()
  const addStep = () => {
    flushSync(() => onChange([...steps, '']))
    focusStep(steps.length)
  }
  return (
    <>
      <ol className="steps-editor">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="num">{i + 1}</span>
            <input ref={(el) => { fields.current[i] = el }} value={s} aria-label={t('project.stepN', { n: i + 1 })}
              placeholder={i === 0 ? t('project.phStep') : ''} enterKeyHint="next"
              onChange={(e) => onChange(steps.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (i === steps.length - 1) addStep()
                else focusStep(i + 1)
              }} />
            {steps.length > 1 && (
              <button type="button" className="icon-btn step-remove" aria-label={t('project.removeStepN', { n: i + 1 })}
                onClick={() => onChange(steps.filter((_, j) => j !== i))}>
                <IconClose width={16} height={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="link-btn" onPointerDown={(e) => e.preventDefault()} onClick={addStep}>{t('project.addStepPlus')}</button>
    </>
  )
}

export function NewProjectScreen({ goalId: presetGoal }: { goalId?: string | null }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState(() => addDays(today, 30))
  const [goalId, setGoalId] = useState<string | null>(presetGoal ?? null)
  const [steps, setSteps] = useState<string[]>([''])
  const [tried, setTried] = useState(false)

  const errors = {
    title: title.trim() ? undefined : t('project.nameOutcome'),
    targetDate: isDateStr(targetDate) && targetDate >= today ? undefined : t('project.dateFromToday'),
  }
  const save = async () => {
    if (errors.title || errors.targetDate) return setTried(true)
    const p = await createProject({ title, targetDate, goalId, steps, state: 'backlog' })
    toast(t('project.savedBacklog'))
    navigate(`/projects/${p.id}`, { replace: true })
  }

  return (
    <Screen back="/goals" title={t('project.new')}>
      <Field label={t('project.outcome')} htmlFor="p-title" error={tried ? errors.title : undefined}>
        <input id="p-title" autoFocus value={title} placeholder={t('project.phOutcome')} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('project.targetDate')} htmlFor="p-date" error={tried ? errors.targetDate : undefined}>
        <input id="p-date" type="date" min={today} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label={t('common.goal')} htmlFor="p-goal">
        <GoalSelect id="p-goal" value={goalId} onChange={setGoalId} />
      </Field>
      <Field label={t('project.steps')} info={<PageText text={marked('project.stepsHint')} />}>
        <StepsEditor steps={steps} onChange={setSteps} />
      </Field>
      <div className="wizard-nav"><button className="btn primary" onClick={save}>{t('project.save')}</button></div>
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
    return <Screen back="/goals" title={t('nav.notFound')}><p className="muted">{t('common.projectGone')}</p></Screen>
  }

  const goal = project.goalId ? snap.goals.find((g) => g.id === project.goalId) : undefined
  const steps = snap.tasks.filter((x) => x.projectId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const deadlines = stepDeadlines(project, steps)
  const doneEntry = new Map(
    activeEntries(snap.entries).filter((e) => e.subjectType === 'task' && e.outcome === 'hit').map((e) => [e.subjectId, e]),
  )
  const done = steps.filter((s) => doneEntry.has(s.id)).length
  const allDone = steps.length > 0 && done === steps.length
  const eyebrow = {
    backlog: 'project.eyebrowBacklog', active: 'project.eyebrow', archived: 'project.eyebrowSetAside', done: 'project.eyebrowDone',
  } as const

  const toggle = (step: Task) => {
    const e = doneEntry.get(step.id)
    return e ? uncheck(e.id) : check({ subjectType: 'task', subjectId: step.id }, today)
  }
  const add = async () => {
    if (!newStep.trim()) return
    await createTask({ title: newStep, projectId: id })
    setNewStep('')
  }

  return (
    <Screen back={goal ? `/goals/${goal.id}` : '/goals'} eyebrow={t(eyebrow[project.state])} title={project.title}>
      {project.state === 'backlog' && (
        <div className="banner">
          <div className="text">{t('project.inBacklog')}</div>
          <button className="btn primary" onClick={() => startProject(project, today).then(() => toast(t('project.started')))}>{t('common.start')}</button>
        </div>
      )}
      {allDone && project.state === 'active' && (
        <div className="banner">
          <div className="text">{t('project.everyStepDone')}</div>
          <button className="btn primary" onClick={async () => {
            await updateProject(project, { state: 'done' })
            toast(t('project.doneArchived'))
          }}>{t('project.markDone')}</button>
        </div>
      )}

      <Section title={t('common.details')} aside={<button className="link-btn" onClick={() => setEditing(!editing)}>{editing ? t('common.doneEditing') : t('common.edit')}</button>}>
        <div className="card tint-project">
          {goal && (
            <button className="card-head pad list-row" style={{ borderRadius: 0 }} onClick={() => navigate(`/goals/${goal.id}`)}>
              <div className="text">
                {goal.whyText && <div className="group-eyebrow">{goal.title}</div>}
                <div className="group-why">{goal.whyText || goal.title}</div>
              </div>
              <IconChevronRight className="chev" width={18} />
            </button>
          )}
          <div className="pad">
            {editing ? (
              <>
                <Field label={t('project.outcome')} htmlFor="pe-title">
                  <input id="pe-title" defaultValue={project.title}
                    onBlur={(e) => e.target.value.trim() && updateProject(project, { title: e.target.value.trim() })} />
                </Field>
                <Field label={t('project.targetDate')} htmlFor="pe-date">
                  <input id="pe-date" type="date" defaultValue={project.targetDate}
                    onChange={(e) => isDateStr(e.target.value) && updateProject(project, { targetDate: e.target.value })} />
                </Field>
                <Field label={t('common.goal')} htmlFor="pe-goal">
                  <GoalSelect id="pe-goal" value={project.goalId ?? null} onChange={(goalId) => updateProject(project, { goalId })} />
                </Field>
              </>
            ) : (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small muted">{t('plan.stepsOf', { done, total: steps.length })}</span>
                  <span className="small muted">{t('today.due', { when: relativeDay(project.targetDate, today) })} · {dayMonth(project.targetDate)}</span>
                </div>
                <div className="progress"><i style={{ width: `${steps.length ? (100 * done) / steps.length : 0}%` }} /></div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title={<span className="title-row">{t('project.steps')}<InfoTip label={t('project.stepDates')}>{t('project.stepDatesInfo')}</InfoTip></span>}>
        <div className="card tint-project">
          <Sortable items={steps} keyOf={(x) => x.id} labelOf={(x) => x.title} onReorder={reorderSteps} className="items"
            render={(step, grip) => {
              const isDone = doneEntry.has(step.id)
              return (
                <div className={`item kind-step ${isDone ? 'done' : ''}`}>
                  <CheckButton shape="square" checked={isDone} label={step.title} onClick={() => toggle(step)} />
                  <div className="item-main">
                    <StepTitle task={step} />
                    {!isDone && (
                      <div className="step-meta">
                        <StepEnd task={step} end={deadlines[steps.indexOf(step)]} />
                      </div>
                    )}
                  </div>
                  {grip}
                </div>
              )
            }} />
          <form className="add-inline" style={{ padding: 12, marginTop: 0, borderTop: steps.length ? '1px solid var(--line)' : 0 }}
            onSubmit={(e) => { e.preventDefault(); add() }}>
            <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={t('project.addAStep')} aria-label={t('project.newStep')}
              enterKeyHint="done" />
            {/* Not taking focus keeps the keyboard up for the next step. */}
            <button className="btn" type="submit" disabled={!newStep.trim()} onPointerDown={(e) => e.preventDefault()}>{t('common.add')}</button>
          </form>
        </div>
      </Section>

      <Section title={t('common.manage')}>
        <div className="card pad stack">
          {project.state === 'active' ? (
            <>
              <button className="btn outline block" onClick={() => updateProject(project, { state: 'done' })}>{t('project.markDoneArchive')}</button>
              <button className="btn outline block" onClick={() => pauseProject(project, today).then(() => toast(t('project.paused')))}>
                {t('project.pauseToBacklog')}
              </button>
            </>
          ) : project.state !== 'backlog' && (
            <button className="btn outline block" onClick={() => updateProject(project, { state: 'active' })}>{t('project.reopen')}</button>
          )}
          <details>
            <summary className="small muted" style={{ cursor: 'pointer', padding: '10px 0' }}>{t('project.delete')}</summary>
            <TypeToConfirm phrase={project.title} action={t('project.deleteConfirm')} onConfirm={async () => {
              await deleteProject(project)
              navigate('/goals', { replace: true })
            }} />
          </details>
        </div>
      </Section>
    </Screen>
  )
}

function StepTitle({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input autoFocus defaultValue={task.title} aria-label={t('project.stepTitle')} style={{ margin: '6px 0' }}
        onBlur={async (e) => {
          if (e.target.value.trim() && e.target.value.trim() !== task.title) await updateTask(task, { title: e.target.value.trim() })
          setEditing(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    )
  }
  return (
    <button className="step-title" onClick={() => setEditing(true)}>
      <span className="item-title">{task.title}</span>
    </button>
  )
}

/** A step's end date: spread from the project's dates until one is picked, then kept (× goes back to spread). */
function StepEnd({ task, end }: { task: Task; end: DateStr }) {
  const set = !!task.date
  return (
    <span className={`step-end ${set ? 'set' : ''}`}>
      <DatePickerButton className="step-end-hit" value={end} label={t('project.stepEndLabel', { step: task.title })}
        onPick={(d) => isDateStr(d) && updateTask(task, { date: d })}>
        <IconCalendar width={14} height={14} />
        <span>{t('project.stepUntil', { date: dayMonthShort(end) })}</span>
      </DatePickerButton>
      {set && (
        <button type="button" className="step-end-clear" aria-label={t('project.stepEndClear')} onClick={() => updateTask(task, { date: null })}>
          <IconClose width={12} height={12} />
        </button>
      )}
    </span>
  )
}
