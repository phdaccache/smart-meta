import { useEffect, useState, type ReactNode } from 'react'
import { deleteTask, promoteTask, updateTask } from '../db/repo'
import { t } from '../i18n'
import { capitalize, dayMonth, diffDays, formatTime, isDateStr, nowMinutes, relativeDay, weekdayName } from '../lib/dates'
import type { DateStr, Task } from '../lib/types'
import { DatePickerButton, NoteField, Sheet, Switch, toast } from '../ui/components'
import { useSnapshot } from '../ui/hooks'
import { IconCalendar, IconChevronUpDown, IconClock, IconGoals, IconSteps } from '../ui/icons'
import { navigate } from '../ui/router'

/** "Today", "Tomorrow", or "Saturday, 24 October". */
function dateText(d: DateStr, today: DateStr): string {
  return Math.abs(diffDays(today, d)) <= 1 ? capitalize(relativeDay(d, today)) : `${weekdayName(d)}, ${dayMonth(d)}`
}

/**
 * Date and time as two switches, as in iPhone's Reminders: switching one on picks today (or the
 * next hour), and tapping what it picked opens the iPhone's own calendar or clock to change it.
 * A time needs a date, so switching the time on also switches the date on, and the date off takes the time with it.
 */
export function DateTimeRows(props: { date: DateStr | null; time: string; today: DateStr; onChange: (date: DateStr | null, time: string) => void }) {
  const { date, time, today, onChange } = props
  const nextHour = () => formatTime(Math.min(23 * 60, (Math.floor(nowMinutes(new Date()) / 60) + 1) * 60))
  return (
    <div className="card list settings dt-rows">
      <div className="list-row">
        <IconCalendar className="row-icon" width={22} height={22} />
        {date ? (
          <DatePickerButton className="dt-text" value={date} min={today} label={t('qa.dueDate')} onPick={(d) => isDateStr(d) && onChange(d, time)}>
            <span className="title">{t('common.date')}</span>
            <span className="dt-value">{dateText(date, today)}</span>
          </DatePickerButton>
        ) : (
          <span className="dt-text"><span className="title">{t('common.date')}</span></span>
        )}
        <Switch checked={!!date} label={t('common.date')} onChange={(on) => onChange(on ? today : null, '')} />
      </div>
      <div className="list-row">
        <IconClock className="row-icon" width={22} height={22} />
        {time ? (
          <span className="date-overlay dt-text">
            <span className="title">{t('common.time')}</span>
            <span className="dt-value">{time}</span>
            <input type="time" aria-label={t('qa.time')} value={time} onChange={(e) => e.target.value && onChange(date ?? today, e.target.value)} />
          </span>
        ) : (
          <span className="dt-text"><span className="title">{t('common.time')}</span></span>
        )}
        <Switch checked={!!time} label={t('common.time')} onChange={(on) => onChange(on ? date ?? today : date, on ? nextHour() : '')} />
      </div>
    </div>
  )
}

/** A row that picks one of a list with the phone's own picker, showing the choice at the right. */
function ChoiceRow(props: {
  id: string; icon: ReactNode; label: string; value: string | null; options: { id: string; title: string }[]; onChange: (id: string | null) => void
}) {
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
  const snap = useSnapshot()

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

  const goals = (snap?.goals ?? []).filter((g) => g.state === 'active' || g.state === 'maintenance' || g.state === 'backlog' || g.id === goalId)
  const projects = (snap?.projects ?? []).filter((p) => p.state === 'active' || p.state === 'backlog' || p.id === projectId)

  return (
    <Sheet open={!!task} onClose={onClose} title={t('common.task')}>
      <form className="task-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="card task-text">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('qa.placeholder')} aria-label={t('common.task')} />
          <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
        </div>
        <DateTimeRows date={date} time={time} today={today} onChange={(d, tm) => { setDate(d); setTime(tm) }} />
        <div className="card list settings">
          <ChoiceRow id="task-project" icon={<IconSteps className="row-icon" width={22} height={22} />} label={t('common.project')}
            value={projectId} options={projects} onChange={setProjectId} />
          {!projectId && (
            <ChoiceRow id="task-goal" icon={<IconGoals className="row-icon" width={22} height={22} />} label={t('common.goal')}
              value={goalId} options={goals} onChange={setGoalId} />
          )}
        </div>
        <button type="submit" className="btn primary block" disabled={!title.trim()}>{t('common.save')}</button>
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
