import { useState, useSyncExternalStore } from 'react'
import { createTask } from '../db/repo'
import { t } from '../i18n'
import type { DateStr } from '../lib/types'
import { NoteField, Sheet, toast } from '../ui/components'
import { IconClose, IconGoals, IconSteps } from '../ui/icons'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { DateTimeRows } from './TaskSheet'


let open = false
const listeners = new Set<() => void>()
const setOpen = (v: boolean) => {
  open = v
  listeners.forEach((l) => l())
}
/**
 * iOS opens the keyboard only for a focus made during the tap itself, and the sheet's field
 * doesn't exist yet then. So a stand-in field takes focus now, and hands it (and the keyboard)
 * to the real one as soon as it mounts.
 */
export const openQuickAdd = () => {
  const standIn = document.createElement('input')
  standIn.setAttribute('aria-hidden', 'true')
  standIn.tabIndex = -1
  standIn.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;'
  document.body.appendChild(standIn)
  standIn.focus({ preventScroll: true })
  setOpen(true)
  setTimeout(() => standIn.remove(), 1000)
}

export function QuickAdd() {
  const isOpen = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => open)
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const close = () => setOpen(false)

  return (
    <Sheet open={isOpen} onClose={close} label={t('qa.title')}>
      <TaskForm today={today} onDone={close} />
    </Sheet>
  )
}

/** An icon that opens a native picker directly, and shows the choice with an × to clear it. */
function PickerTool(props: {
  icon: React.ReactNode
  label: string
  value: string | null
  shown?: string
  options: { id: string; title: string }[]
  onChange: (id: string | null) => void
}) {
  return (
    <span className={`tool ${props.value ? 'on' : ''}`}>
      <span className="date-overlay tool-hit">
        {props.icon}
        {props.shown && <span className="tool-text">{props.shown}</span>}
        <select aria-label={props.label} value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
          <option value="">{t('common.none')}</option>
          {props.options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
      </span>
      {props.value && (
        <button type="button" className="tool-clear" aria-label={t('qa.clear', { name: props.label.toLowerCase() })} onClick={() => props.onChange(null)}>
          <IconClose width={14} height={14} />
        </button>
      )}
    </span>
  )
}

function TaskForm({ today, onDone }: { today: DateStr; onDone: () => void }) {
  const snap = useSnapshot()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<DateStr | null>(null)
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const goals = (snap?.goals ?? []).filter((g) => g.state === 'active' || g.state === 'maintenance' || g.state === 'backlog')
  const projects = (snap?.projects ?? []).filter((p) => p.state === 'active' || p.state === 'backlog')
  const goal = goals.find((g) => g.id === goalId)
  const project = projects.find((p) => p.id === projectId)

  const save = async () => {
    if (!title.trim()) return
    // Always a task: of a project (not a step), of a goal, or on its own.
    await createTask({ title, note, date, time: time || null, goalId: project ? null : goalId, forProjectId: project?.id ?? null })
    setTitle('')
    toast(project ? t('qa.addedTo', { project: project.title }) : t('common.added'))
    onDone()
  }

  return (
    <form className="task-form" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="card task-text">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={t('qa.placeholder')} aria-label={t('common.task')} enterKeyHint="done" />
        <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
      </div>
      <DateTimeRows date={date} time={time} today={today} onChange={(d, tm) => { setDate(d); setTime(tm) }} />
      <div className="qa-tools">
        {!project && goals.length > 0 && (
          <PickerTool icon={<IconGoals width={20} height={20} />} label={t('common.goal')} value={goalId} shown={goal?.title}
            options={goals} onChange={setGoalId} />
        )}
        {!goalId && projects.length > 0 && (
          <PickerTool icon={<IconSteps width={20} height={20} />} label={t('common.project')} value={projectId} shown={project?.title}
            options={projects} onChange={setProjectId} />
        )}
        <span className="spacer" />
        <button type="submit" className="btn primary" disabled={!title.trim()}>{t('common.add')}</button>
      </div>
    </form>
  )
}

