import { useState, useSyncExternalStore } from 'react'
import { createTask } from '../db/repo'
import { t } from '../i18n'
import type { DateStr, Reminder } from '../lib/types'
import { holdKeyboard, NoteField, Sheet, TitleField, toast } from '../ui/components'
import { ReminderCard, usePassedCheck } from '../ui/ReminderCard'
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

function openWith(link: typeof preset) {
  preset = link
  // Opens ready to type: the keyboard rises with the sheet.
  holdKeyboard()
  setOpen(true)
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
  const [reminder, setReminder] = useState<Reminder | null>(null)
  const [note, setNote] = useState('')
  const [goalId, setGoalId] = useState<string | null>(preset.goalId ?? null)
  const [projectId, setProjectId] = useState<string | null>(preset.projectId ?? null)
  const project = snap?.projects.find((p) => p.id === projectId)

  const passed = usePassedCheck()
  const save = () => {
    if (!title.trim()) return
    passed.guard(date ? reminder : null, date, time, async () => {
      // Always a task: of a project (not a step), of a goal, or on its own.
      await createTask({
        title, note, date, time: time || null, reminder: date ? reminder : null, goalId: project ? null : goalId, forProjectId: project?.id ?? null,
      })
      toast(project ? t('qa.addedTo', { project: project.title }) : t('common.added'))
      onDone()
    })
  }

  return (
    <Sheet open large typing onClose={onDone} label={t('qa.title')} done={{ label: t('common.add'), disabled: !title.trim(), onClick: save }}
      dirty={!!(title.trim() || note.trim() || date || goalId !== (preset.goalId ?? null) || projectId !== (preset.projectId ?? null))}>
      <form className="task-form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="card task-text">
          <TitleField value={title} onChange={setTitle} onEnter={save} placeholder={t('qa.placeholder')} label={t('common.task')} />
          <NoteField compact value={note} onChange={setNote} label={t('common.notes')} />
        </div>
        <DateTimeRows date={date} time={time} today={today} onChange={(d, tm) => { setDate(d); setTime(tm) }} />
        <ReminderCard date={date} time={time} value={reminder} onChange={setReminder} />
        <TaskLinks projectId={projectId} goalId={goalId} onProject={setProjectId} onGoal={setGoalId} />
      </form>
      {passed.ask}
    </Sheet>
  )
}
