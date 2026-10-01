import { useEffect, useState } from 'react'
import { deleteTask, promoteTask, updateTask } from '../db/repo'
import { t } from '../i18n'
import { addDays, isDateStr } from '../lib/dates'
import type { DateStr, Task } from '../lib/types'
import { Chip, Field, Sheet, toast } from '../ui/components'
import { useSnapshot } from '../ui/hooks'
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
      <input type="date" aria-label={t('task.pickDate')} value={custom ? props.value! : ''} min={props.today}
        style={{ width: 'auto', minHeight: 40, borderRadius: 999, padding: '0 12px', fontSize: 14 }}
        onChange={(e) => isDateStr(e.target.value) && props.onChange(e.target.value)} />
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
  const [goalId, setGoalId] = useState<string | null>(null)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDate(task.date ?? null)
    setGoalId(task.goalId ?? null)
  }, [task])

  if (!task) return null

  const save = async () => {
    if (!title.trim()) return
    await updateTask(task, { title: title.trim(), date, goalId })
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
        <Field label={t('common.goal')} htmlFor="task-goal">
          <GoalSelect id="task-goal" value={goalId} onChange={setGoalId} />
        </Field>
        <div className="sheet-actions">
          <button type="submit" className="btn primary" disabled={!title.trim()}>{t('common.save')}</button>
        </div>
      </form>
      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn outline block" onClick={async () => {
          const p = await promoteTask({ ...task, title: title.trim() || task.title, date, goalId }, today)
          onClose()
          toast(t('task.nowProject'))
          navigate(`/projects/${p.id}`)
        }}>
          {t('task.toProject')}
        </button>
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
