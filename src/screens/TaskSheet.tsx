import { useEffect, useRef, useState, type ReactNode } from 'react'
import { deleteTask, promoteTask, updateTask } from '../db/repo'
import { t } from '../i18n'
import { capitalize, dayMonth, diffDays, formatTime, nowMinutes, relativeDay, weekdayName } from '../lib/dates'
import type { DateStr, Task } from '../lib/types'
import { NoteField, Sheet, Switch, toast } from '../ui/components'
import { InlineCalendar, TimeWheel } from '../ui/pickers'
import { useSnapshot } from '../ui/hooks'
import { IconCalendar, IconChevronUpDown, IconClock, IconGoals } from '../ui/icons'
import { navigate } from '../ui/router'
import { IconTile, ProjectTile, ValueTile } from '../ui/valueLook'

/** "Today", "Tomorrow", or "Saturday, 24 October". */
function dateText(d: DateStr, today: DateStr): string {
  return Math.abs(diffDays(today, d)) <= 1 ? capitalize(relativeDay(d, today)) : `${weekdayName(d)}, ${dayMonth(d)}`
}

/**
 * Date and time as two switches, as in iPhone's Reminders: switching one on picks today (or the
 * next hour) and opens a calendar (or clock) right under it; tapping the row opens or closes it again.
 * A time needs a date, so switching the time on also switches the date on, and the date off takes the time with it.
 */
export function DateTimeRows(props: { date: DateStr | null; time: string; today: DateStr; onChange: (date: DateStr | null, time: string) => void }) {
  const { date, time, today, onChange } = props
  const [open, setOpen] = useState<'date' | 'time' | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])
  const show = (which: 'date' | 'time' | null) => {
    // The keyboard would cover what opens.
    if (which) (document.activeElement as HTMLElement | null)?.blur?.()
    setOpen(which)
  }
  const nextHour = () => formatTime(Math.min(23 * 60, (Math.floor(nowMinutes(new Date()) / 60) + 1) * 60))
  return (
    <div className="card list settings dt-rows">
      <div className="list-row">
        <IconTile color="red"><IconCalendar width={16} height={16} /></IconTile>
        <button type="button" className="dt-text" disabled={!date} aria-expanded={date ? open === 'date' : undefined}
          onClick={() => show(open === 'date' ? null : 'date')}>
          <span className="title">{t('common.date')}</span>
          {date && <span className="dt-value">{dateText(date, today)}</span>}
        </button>
        <Switch checked={!!date} label={t('common.date')} onChange={(on) => {
          onChange(on ? today : null, '')
          show(on ? 'date' : null)
        }} />
      </div>
      {date && open === 'date' && (
        <div className="dt-picker" ref={pickerRef}>
          <InlineCalendar value={date} min={date < today ? date : today} today={today} onPick={(d) => onChange(d, time)} />
        </div>
      )}
      <div className="list-row">
        <IconTile color="blue"><IconClock width={16} height={16} /></IconTile>
        <button type="button" className="dt-text" disabled={!time} aria-expanded={time ? open === 'time' : undefined}
          onClick={() => show(open === 'time' ? null : 'time')}>
          <span className="title">{t('common.time')}</span>
          {time && <span className="dt-value">{time}</span>}
        </button>
        <Switch checked={!!time} label={t('common.time')} onChange={(on) => {
          onChange(on ? date ?? today : date, on ? nextHour() : '')
          show(on ? 'time' : open === 'time' ? null : open)
        }} />
      </div>
      {time && open === 'time' && (
        <div className="dt-picker" ref={pickerRef}>
          <TimeWheel value={time} onChange={(tm) => onChange(date ?? today, tm)} />
        </div>
      )}
    </div>
  )
}

/** A row that picks one of a list with the phone's own picker, showing the choice at the right. Nothing to pick from, no row. */
export function ChoiceRow(props: {
  id: string; icon: ReactNode; label: string; value: string | null; options: { id: string; title: string }[]; onChange: (id: string | null) => void
}) {
  if (!props.options.length) return null
  return (
    <div className="list-row select-row">
      {props.icon}
      <div className="text"><label className="title" htmlFor={props.id}>{props.label}</label></div>
      <span className="row-value">{props.options.find((o) => o.id === props.value)?.title ?? t('common.none')}</span>
      <IconChevronUpDown className="chev" width={16} height={16} />
      <select id={props.id} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
        <option value="">{t('common.none')}</option>
        {props.options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
    </div>
  )
}

/** A task's project and goal; a project's task takes its goal from the project, so the goal row goes while a project is picked. */
export function TaskLinks(props: { projectId: string | null; goalId: string | null; onProject: (id: string | null) => void; onGoal: (id: string | null) => void }) {
  const snap = useSnapshot()
  const goals = (snap?.goals ?? []).filter((g) => g.state === 'active' || g.state === 'maintenance' || g.state === 'backlog' || g.id === props.goalId)
  const projects = (snap?.projects ?? []).filter((p) => p.state === 'active' || p.state === 'backlog' || p.id === props.projectId)
  if (!projects.length && (props.projectId || !goals.length)) return null
  const goal = goals.find((g) => g.id === props.goalId)
  return (
    <div className="card list settings">
      <ChoiceRow id="task-project" icon={<ProjectTile size="sm" />} label={t('common.project')}
        value={props.projectId} options={projects} onChange={props.onProject} />
      {!props.projectId && (
        <ChoiceRow id="task-goal" icon={goal ? <ValueTile value={snap?.values.find((v) => v.id === goal.whyValueId)} values={snap?.values ?? []} size="sm" /> : <IconTile color="gray"><IconGoals width={16} height={16} /></IconTile>} label={t('common.goal')}
          value={props.goalId} options={goals} onChange={props.onGoal} />
      )}
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

export function TaskSheet({ task, onClose, today }: { task: Task | null; onClose: () => void; today: DateStr }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<DateStr | null>(null)
  const [time, setTime] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDate(task.date ?? null)
    setTime(task.time ?? '')
    setGoalId(task.goalId ?? null)
    setProjectId(task.forProjectId ?? null)
    setNote(task.note ?? '')
  }, [task])

  if (!task) return null

  const save = async () => {
    if (!title.trim()) return
    // A project's task takes its goal from the project.
    await updateTask(task, {
      title: title.trim(), date, time: date && time ? time : null, goalId: projectId ? null : goalId, forProjectId: projectId, note: note.trim() || null,
    })
    onClose()
  }

  return (
    <Sheet open={!!task} onClose={onClose} title={t('common.task')} done={{ label: t('common.save'), disabled: !title.trim(), onClick: save }}>
      <form className="task-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="card task-text">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('qa.placeholder')} aria-label={t('common.task')}
            enterKeyHint="done" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
          <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
        </div>
        <DateTimeRows date={date} time={time} today={today} onChange={(d, tm) => { setDate(d); setTime(tm) }} />
        <TaskLinks projectId={projectId} goalId={goalId} onProject={setProjectId} onGoal={setGoalId} />
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
