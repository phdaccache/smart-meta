import { useState, useSyncExternalStore } from 'react'
import { createTask } from '../db/repo'
import { isDateStr, relativeDay } from '../lib/dates'
import type { DateStr } from '../lib/types'
import { DatePickerButton, Sheet, toast } from '../ui/components'
import { IconCalendar, IconClose, IconGoals, IconSteps } from '../ui/icons'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

let open = false
const listeners = new Set<() => void>()
const setOpen = (v: boolean) => {
  open = v
  listeners.forEach((l) => l())
}
export const openQuickAdd = () => setOpen(true)

export function QuickAdd() {
  const isOpen = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => open)
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const close = () => setOpen(false)

  return (
    <Sheet open={isOpen} onClose={close} title="Quick add">
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
          <option value="">None</option>
          {props.options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
      </span>
      {props.value && (
        <button type="button" className="tool-clear" aria-label={`Clear ${props.label.toLowerCase()}`} onClick={() => props.onChange(null)}>
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
  const [goalId, setGoalId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const goals = (snap?.goals ?? []).filter((g) => g.state === 'active' || g.state === 'maintenance' || g.state === 'backlog')
  const projects = (snap?.projects ?? []).filter((p) => p.state === 'active')
  const goal = goals.find((g) => g.id === goalId)
  const project = projects.find((p) => p.id === projectId)

  const save = async () => {
    if (!title.trim()) return
    // With a project picked, the text becomes that project's next step.
    await createTask(project ? { title, projectId: project.id } : { title, date, goalId })
    setTitle('')
    toast(project ? `Step added to ${project.title}.` : 'Added.')
    onDone()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={project ? 'Next step…' : 'What needs doing?'} aria-label={project ? 'Step' : 'Task'} enterKeyHint="done" />
      <div className="qa-tools">
        {!project && (
          <span className={`tool ${date ? 'on' : ''}`}>
            <DatePickerButton className="tool-hit" value={date ?? ''} min={today} label="Due date"
              onPick={(d) => isDateStr(d) && setDate(d)}>
              <IconCalendar width={20} height={20} />
              {date && <span className="tool-text">{capitalize(relativeDay(date, today))}</span>}
            </DatePickerButton>
            {date && <button type="button" className="tool-clear" aria-label="Clear due date" onClick={() => setDate(null)}><IconClose width={14} height={14} /></button>}
          </span>
        )}
        {!project && goals.length > 0 && (
          <PickerTool icon={<IconGoals width={20} height={20} />} label="Goal" value={goalId} shown={goal?.title}
            options={goals} onChange={setGoalId} />
        )}
        {!goalId && !date && projects.length > 0 && (
          <PickerTool icon={<IconSteps width={20} height={20} />} label="Project" value={projectId} shown={project?.title}
            options={projects} onChange={setProjectId} />
        )}
        <span className="spacer" />
        <button type="submit" className="btn primary" disabled={!title.trim()}>Add</button>
      </div>
    </form>
  )
}

