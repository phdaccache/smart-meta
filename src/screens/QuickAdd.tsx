import { useState, useSyncExternalStore } from 'react'
import { createTask } from '../db/repo'
import { t } from '../i18n'
import type { DateStr } from '../lib/types'
import { NoteField, Sheet, TitleField, toast } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { DateTimeRows, TaskLinks } from './TaskSheet'


let open = false
/** What a new task starts linked to: nothing from the + button, its goal or project from that page's Add. */
let preset: { goalId?: string; projectId?: string } = {}
const listeners = new Set<() => void>()
const setOpen = (v: boolean) => {
  open = v
  listeners.forEach((l) => l())
}
export const openQuickAdd = () => openWith({})
export const openQuickAddFor = (link: { goalId: string } | { projectId: string }) => openWith(link)

/**
 * iOS opens the keyboard only for a focus made during the tap itself, and the sheet's field
 * doesn't exist yet then. So a stand-in field takes focus now, and hands it (and the keyboard)
 * to the real one as soon as it mounts.
 */
function openWith(link: typeof preset) {
  preset = link
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

  return isOpen ? <TaskForm today={today} onDone={close} /> : null
}

function TaskForm({ today, onDone }: { today: DateStr; onDone: () => void }) {
  const snap = useSnapshot()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<DateStr | null>(null)
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [goalId, setGoalId] = useState<string | null>(preset.goalId ?? null)
  const [projectId, setProjectId] = useState<string | null>(preset.projectId ?? null)
  const project = snap?.projects.find((p) => p.id === projectId)

  const save = async () => {
    if (!title.trim()) return
    // Always a task: of a project (not a step), of a goal, or on its own.
    await createTask({ title, note, date, time: time || null, goalId: project ? null : goalId, forProjectId: project?.id ?? null })
    toast(project ? t('qa.addedTo', { project: project.title }) : t('common.added'))
    onDone()
  }

  return (
    <Sheet open large onClose={onDone} label={t('qa.title')} done={{ label: t('common.add'), disabled: !title.trim(), onClick: save }}
      dirty={!!(title.trim() || note.trim() || date || goalId !== (preset.goalId ?? null) || projectId !== (preset.projectId ?? null))}>
      <form className="task-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="card task-text">
          <TitleField autoFocus value={title} onChange={setTitle} onEnter={save} placeholder={t('qa.placeholder')} label={t('common.task')} />
          <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
        </div>
        <DateTimeRows date={date} time={time} today={today} onChange={(d, tm) => { setDate(d); setTime(tm) }} />
        <TaskLinks projectId={projectId} goalId={goalId} onProject={setProjectId} onGoal={setGoalId} />
      </form>
    </Sheet>
  )
}
