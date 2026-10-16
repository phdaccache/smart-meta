import { useEffect, useState } from 'react'
import { deleteTask, promoteTask, updateTask } from '../db/repo'
import { t } from '../i18n'
import { addDays, dayMonthShort, isDateStr } from '../lib/dates'
import type { DateStr, Task } from '../lib/types'
import { Chip, DatePickerButton, Field, Sheet, toast } from '../ui/components'
import { useSnapshot } from '../ui/hooks'
import { IconCalendar, IconClose } from '../ui/icons'
import { navigate } from '../ui/router'

/** Today / Tomorrow / No date / a picked date. */
export function DateChoice(props: { value: DateStr | null; today: DateStr; onChange: (d: DateStr | null) => void }) {
  const tomorrow = addDays(props.today, 1)
  const custom = props.value && props.value !== props.today && props.value !== tomorrow
  return (
    <div className="chips">
      <Chip selected={!props.value} onClick={() => props.onChange(null)}>{t('task.noDate')}</Chip>
      <Chip selected={props.value === props.today} onClick={() => props.onChange(props.today)}>{t('dates.Today')}</Chip>
      <Chip selected={props.value === tomorrow} onClick={() => props.onChange(tomorrow)}>{t('dates.Tomorrow')}</Chip>
      <DatePickerButton className={`chip ${custom ? 'on' : ''}`} value={custom ? props.value! : ''} min={props.today} label={t('task.pickDate')}
        onPick={(d) => isDateStr(d) && props.onChange(d)}>
        <IconCalendar width={16} height={16} />
        {custom ? dayMonthShort(props.value!) : t('task.pickDate')}
      </DatePickerButton>
    </div>
  )
}

/** Links a task to a live goal, or leaves it standalone. */
export function GoalSelect(props: { value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const snap = useSnapshot()
  const goals = (snap?.goals ?? []).filter((g) => g.state === 'active' || g.state === 'maintenance' || g.state === 'backlog')
  return (
    <select id={props.id} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
      <option value="">{t('common.none')}</option>
      {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
    </select>
  )
}

/** Links a task to a project (as one of its tasks, not a step), or leaves it out of any. */
export function ProjectSelect(props: { value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const snap = useSnapshot()
  const projects = (snap?.projects ?? []).filter((p) => p.state === 'active' || p.state === 'backlog' || p.id === props.value)
  return (
    <select id={props.id} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
      <option value="">{t('common.none')}</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select>
  )
}

export function TaskSheet({ task, onClose, today }: { task: Task | null; onClose: () => void; today: DateStr }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<DateStr | null>(null)
  const [time, setTime] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDate(task.date ?? null)
    setTime(task.time ?? '')
    setGoalId(task.goalId ?? null)
    setProjectId(task.forProjectId ?? null)
  }, [task])

  if (!task) return null

  const save = async () => {
    if (!title.trim()) return
    // A project's task takes its goal from the project.
    await updateTask(task, { title: title.trim(), date, time: date && time ? time : null, goalId: projectId ? null : goalId, forProjectId: projectId })
    onClose()
  }

  return (
    <Sheet open={!!task} onClose={onClose} title={t('common.task')}>
      <form onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={t('common.task')} htmlFor="task-title">
          <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('task.due')}>
          <DateChoice value={date} today={today} onChange={setDate} />
        </Field>
        <Field label={t('common.time')} htmlFor="task-time">
          {/* A time with no date means today. */}
          <div className="row" style={{ gap: 4 }}>
            <input id="task-time" type="time" value={time} style={{ width: 140 }}
              onChange={(e) => {
                setTime(e.target.value)
                if (e.target.value && !date) setDate(today)
              }} />
            {time && (
              <button type="button" className="icon-btn" aria-label={t('qa.clearTime')} onClick={() => setTime('')}>
                <IconClose width={16} height={16} />
              </button>
            )}
          </div>
        </Field>
        <Field label={t('common.project')} htmlFor="task-project">
          <ProjectSelect id="task-project" value={projectId} onChange={setProjectId} />
        </Field>
        {!projectId && (
          <Field label={t('common.goal')} htmlFor="task-goal">
            <GoalSelect id="task-goal" value={goalId} onChange={setGoalId} />
          </Field>
        )}
        <div className="sheet-actions">
          <button type="submit" className="btn primary" disabled={!title.trim()}>{t('common.save')}</button>
        </div>
      </form>
      <div className="stack" style={{ marginTop: 16 }}>
        {!projectId && (
          <button className="btn outline block" onClick={async () => {
            const p = await promoteTask({ ...task, title: title.trim() || task.title, date, goalId }, today)
            onClose()
            toast(t('task.nowProject'))
            navigate(`/projects/${p.id}`)
          }}>
            {t('task.toProject')}
          </button>
        )}
        <button className="btn danger block" onClick={async () => {
          await deleteTask(task)
          onClose()
        }}>
          {t('task.delete')}
        </button>
      </div>
    </Sheet>
  )
}
