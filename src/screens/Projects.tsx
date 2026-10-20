import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { check, createProject, createTask, deleteProject, deleteTask, pauseProject, reorderSteps, startProject, uncheck, updateProject, updateTask } from '../db/repo'
import { marked, t } from '../i18n'
import { addDays, dayMonth, dayMonthShort, diffDays, isDateStr, relativeDay } from '../lib/dates'
import { activeEntries } from '../lib/scoring'
import { stepDeadlines } from '../lib/today'
import type { DateStr, Project, Task } from '../lib/types'
import { CheckButton, DatePickerButton, InfoTip, NoteField, PageText, Screen, Section, TitleField, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconCalendar, IconClose } from '../ui/icons'
import { Sortable } from '../ui/Sortable'
import { SwipeToDelete } from '../ui/SwipeToDelete'
import { navigate } from '../ui/router'
import { openQuickAddFor } from './QuickAdd'
import { DateTimeRows, GoalChoice, linkableGoals, TaskList } from './TaskSheet'

/**
 * The step list of a project being written. Adding a step moves the cursor to
 * it straight away, while the keyboard is still up: the new field is rendered
 * and focused within the same tap (iOS only opens the keyboard for a focus
 * made during one), and the "+" button never takes focus from the field.
 * A step is removed by swiping it left, as in the iPhone's lists; the last one stays.
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
            <SwipeToDelete className="steps-editor-row" label={t('project.removeStepN', { n: i + 1 })} disabled={steps.length < 2}
              onDelete={() => onChange(steps.filter((_, j) => j !== i))}>
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
            </SwipeToDelete>
          </li>
        ))}
      </ol>
      <button type="button" className="link-btn" onPointerDown={(e) => e.preventDefault()} onClick={addStep}>{t('project.addStepPlus')}</button>
    </>
  )
}

/** Laid out like Quick add: title and notes, then date and time, then the goal; then its steps, as on its page. */
export function NewProjectScreen({ goalId: presetGoal }: { goalId?: string | null }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  // A month to start with; switched off, it has no due date.
  const [targetDate, setTargetDate] = useState<DateStr | null>(() => addDays(today, 30))
  const [time, setTime] = useState('')
  const [goalId, setGoalId] = useState<string | null>(presetGoal ?? null)
  const [steps, setSteps] = useState<DraftStep[]>([])
  const [tried, setTried] = useState(false)

  const save = async () => {
    if (!title.trim()) return setTried(true)
    const p = await createProject({ title, note, targetDate, time, goalId, steps: steps.map((s) => s.title), state: 'backlog' })
    toast(t('project.savedBacklog'))
    navigate(`/projects/${p.id}`, { replace: true })
  }

  return (
    <Screen back="/goals" title={t('project.new')}>
      <div className="task-form">
        <div>
          <div className="card task-text">
            <TitleField value={title} onChange={setTitle} onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
              placeholder={t('project.phTitle')} label={t('project.title')} />
            <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
          </div>
          {tried && !title.trim() && <div className="field-error" role="alert">{t('project.nameOutcome')}</div>}
        </div>
        <DateTimeRows date={targetDate} time={time} today={today} firstDate={addDays(today, 30)} onChange={(d, tm) => { setTargetDate(d); setTime(tm) }} />
        {linkableGoals(snap, goalId).length > 0 && <div className="card list settings"><GoalChoice id="p-goal" goalId={goalId} onChange={setGoalId} /></div>}
      </div>
      <Section title={<span className="title-row">{t('project.steps')}<InfoTip label={t('project.steps')}><PageText text={marked('project.stepsHint')} /></InfoTip></span>}>
        <DraftSteps steps={steps} onChange={setSteps} />
      </Section>
      <div className="wizard-nav"><button className="btn primary" onClick={save}>{t('project.save')}</button></div>
    </Screen>
  )
}

interface DraftStep { key: string; title: string }

/** The steps of a project not saved yet, kept and changed as on a project's page (without ticking them off). */
function DraftSteps({ steps, onChange }: { steps: DraftStep[]; onChange: (steps: DraftStep[]) => void }) {
  const next = useRef(0)
  const add = (title: string) => onChange([...steps, { key: `s${next.current++}`, title }])
  return (
    <div className="card">
      <Sortable items={steps} keyOf={(s) => s.key} labelOf={(s) => s.title} onReorder={onChange} className="items step-list"
        render={(step) => (
          <SwipeToDelete className="item kind-step" label={t('project.removeStep', { step: step.title })}
            onDelete={() => onChange(steps.filter((s) => s.key !== step.key))}>
            <div className="item-main">
              <StepTitle title={step.title} onSave={(title) => onChange(steps.map((s) => (s.key === step.key ? { ...s, title } : s)))} />
            </div>
          </SwipeToDelete>
        )} />
      <AddStep first={!steps.length} onAdd={add} />
    </div>
  )
}

/** The field at the bottom of a project's steps. */
function AddStep({ first, onAdd }: { first: boolean; onAdd: (title: string) => void | Promise<unknown> }) {
  const [text, setText] = useState('')
  const add = async () => {
    if (!text.trim()) return
    await onAdd(text.trim())
    setText('')
  }
  return (
    <form className="add-inline" style={{ padding: 12, marginTop: 0, borderTop: first ? 0 : '1px solid var(--line)' }}
      onSubmit={(e) => { e.preventDefault(); add() }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('project.addAStep')} aria-label={t('project.newStep')}
        enterKeyHint="done" />
      {/* Not taking focus keeps the keyboard up for the next step. */}
      <button className="btn" type="submit" disabled={!text.trim()} onPointerDown={(e) => e.preventDefault()}>{t('common.add')}</button>
    </form>
  )
}

export function ProjectScreen({ id }: { id: string }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
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
        {editing ? (
          // As in Quick add, each its own card on the page: inside the details card, the date's card would be lost in it.
          <div className="task-form">
            <div className="card task-text"><ProjectTitle key={project.id} title={project.title} onSave={(title) => updateProject(project, { title })} /></div>
            <DateTimeRows date={project.targetDate ?? null} time={project.time ?? ''} today={today} firstDate={addDays(today, 30)}
              onChange={(targetDate, time) => updateProject(project, { targetDate, time: targetDate && time ? time : null })} />
            {linkableGoals(snap, project.goalId ?? null).length > 0 && (
              <div className="card list settings">
                <GoalChoice id="pe-goal" goalId={project.goalId ?? null} onChange={(goalId) => updateProject(project, { goalId })} />
              </div>
            )}
          </div>
        ) : (
          <div className="card pad">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted">{t('plan.stepsOf', { done, total: steps.length })}</span>
              <span className="small muted">{dueText(project, today)}</span>
            </div>
            <div className="progress project"><i style={{ width: `${steps.length ? (100 * done) / steps.length : 0}%` }} /></div>
          </div>
        )}
      </Section>

      <Section title={t('common.notes')}>
        <ProjectNote key={project.id} note={project.note ?? ''} onSave={(note) => updateProject(project, { note: note.trim() || null })} />
      </Section>

      <Section title={<span className="title-row">{t('project.steps')}<InfoTip label={t('project.stepDates')}>{t('project.stepDatesInfo')}</InfoTip></span>}>
        <div className="card">
          <Sortable items={steps} keyOf={(x) => x.id} labelOf={(x) => x.title} onReorder={reorderSteps} className="items step-list"
            render={(step) => {
              const isDone = doneEntry.has(step.id)
              return (
                <SwipeToDelete className={`item kind-step ${isDone ? 'done' : ''}`} label={t('project.removeStep', { step: step.title })}
                  onDelete={() => deleteTask(step)}>
                  <CheckButton shape="square" checked={isDone} label={step.title} onClick={() => toggle(step)} />
                  <div className="item-main">
                    <StepTitle title={step.title} onSave={(title) => updateTask(step, { title })} />
                    {!isDone && (
                      <div className="step-meta">
                        <StepEnd task={step} end={deadlines[steps.indexOf(step)]} />
                      </div>
                    )}
                  </div>
                </SwipeToDelete>
              )
            }} />
          <AddStep first={!steps.length} onAdd={(title) => createTask({ title, projectId: id })} />
        </div>
      </Section>

      <Section title={t('project.tasks')} aside={<button className="link-btn" onClick={() => openQuickAddFor({ projectId: id })}>{t('common.add')}</button>}>
        <TaskList tasks={snap.tasks.filter((x) => x.forProjectId === id && !x.projectId)} today={today} />
      </Section>

      <Section title={t('common.manage')}>
        <div className="card list manage">
          {project.state === 'active' ? (
            <>
              <button className="list-row" onClick={() => updateProject(project, { state: 'done' })}>{t('project.markDoneArchive')}</button>
              <button className="list-row" onClick={() => pauseProject(project, today).then(() => toast(t('project.paused')))}>
                {t('project.pauseToBacklog')}
              </button>
            </>
          ) : project.state !== 'backlog' && (
            <button className="list-row" onClick={() => updateProject(project, { state: 'active' })}>{t('project.reopen')}</button>
          )}
          <details className="manage-delete">
            <summary className="list-row">{t('project.delete')}</summary>
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

/** Saved when the field is left, like a step's title, or when the page is (an app sent to the background may skip the blur). */
function ProjectNote({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(note)
  const saved = useRef(note)
  const latest = useRef(text)
  latest.current = text
  const save = (v: string) => {
    if (v === saved.current) return
    saved.current = v
    onSave(v)
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const away = () => document.visibilityState === 'hidden' && saveRef.current(latest.current)
    document.addEventListener('visibilitychange', away)
    return () => {
      document.removeEventListener('visibilitychange', away)
      saveRef.current(latest.current)
    }
  }, [])
  return <NoteField value={text} label={t('common.notes')} onChange={setText} onBlur={save} />
}

/** "due Fri at 18:00 · 20 November" (the day spelled out only when the first part names it another way), or that it has no date. */
function dueText(p: Project, today: DateStr): string {
  if (!p.targetDate) return t('project.noDate')
  const when = relativeDay(p.targetDate, today)
  const due = p.time ? t('today.dueAt', { when, time: p.time }) : t('today.due', { when })
  return Math.abs(diffDays(today, p.targetDate)) < 7 ? `${due} · ${dayMonth(p.targetDate)}` : due
}

/** The project's title while editing its details: saved when the field is left, or when Done closes it (a tap on iPhone may not leave it). */
function ProjectTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [text, setText] = useState(title)
  const saved = useRef(title)
  const save = (v: string) => {
    if (!v.trim()) return setText(saved.current)
    if (v.trim() === saved.current) return
    saved.current = v.trim()
    onSave(v.trim())
  }
  const latest = useRef({ text, save })
  latest.current = { text, save }
  useEffect(() => () => latest.current.save(latest.current.text), [])
  return (
    <TitleField value={text} onChange={setText} onEnter={() => (document.activeElement as HTMLElement | null)?.blur()} onBlur={() => save(text)}
      placeholder={t('project.phTitle')} label={t('project.title')} />
  )
}

function StepTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input autoFocus defaultValue={title} aria-label={t('project.stepTitle')} style={{ margin: '6px 0' }}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value.trim() !== title) onSave(e.target.value.trim())
          setEditing(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    )
  }
  return (
    <button className="step-title" onClick={() => setEditing(true)}>
      <span className="item-title">{title}</span>
    </button>
  )
}

/**
 * A step's end date: spread from the project's dates until one is picked, then kept (× goes back to spread).
 * With none (a project with no date), a button to give it one.
 */
function StepEnd({ task, end }: { task: Task; end: DateStr | null }) {
  const set = !!task.date
  return (
    <span className={`step-end ${set ? 'set' : ''}`}>
      <DatePickerButton className="step-end-hit" value={end ?? ''} label={t('project.stepEndLabel', { step: task.title })}
        onPick={(d) => isDateStr(d) && updateTask(task, { date: d })}>
        <IconCalendar width={14} height={14} />
        <span>{end ? t('project.stepUntil', { date: dayMonthShort(end) }) : t('project.stepNoEnd')}</span>
      </DatePickerButton>
      {set && (
        <button type="button" className="step-end-clear" aria-label={t('project.stepEndClear')} onClick={() => updateTask(task, { date: null })}>
          <IconClose width={12} height={12} />
        </button>
      )}
    </span>
  )
}
