import { useState, useSyncExternalStore } from 'react'
import { addDisplacement, createTask, logOccurrence } from '../db/repo'
import { isDateStr, nowMinutes, formatTime, parseTime } from '../lib/dates'
import { REASONS } from '../lib/describe'
import type { Commitment, DateStr, ID, MissReason } from '../lib/types'
import { Chip, Field, Segmented, Sheet, toast } from '../ui/components'
import { useDisplacements, useSettings, useSnapshot, useToday } from '../ui/hooks'
import { DateChoice, GoalSelect } from './TaskSheet'

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
  const snap = useSnapshot()
  const standards = (snap?.commitments ?? []).filter((c) => {
    const g = snap?.goals.find((x) => x.id === c.goalId)
    return c.shape === 'standard' && g && (g.state === 'active' || g.state === 'maintenance')
  })
  const [mode, setMode] = useState<'task' | 'log'>('task')
  const close = () => setOpen(false)

  return (
    <Sheet open={isOpen} onClose={close} title={mode === 'task' ? 'Quick add' : 'Log what happened'}>
      {standards.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Segmented label="Add" value={mode} onChange={setMode}
            options={[{ value: 'task', label: 'Task' }, { value: 'log', label: 'Log an occurrence' }]} />
        </div>
      )}
      {mode === 'task' || standards.length === 0 ? (
        <TaskForm today={today} onDone={close} />
      ) : (
        <OccurrenceForm commitments={standards} today={today} onDone={close} />
      )}
    </Sheet>
  )
}

function TaskForm({ today, onDone }: { today: DateStr; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState<DateStr | null>(null)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [more, setMore] = useState(false)

  const save = async () => {
    if (!title.trim()) return
    await createTask({ title, date, goalId })
    setTitle('')
    toast(date && date > today ? 'Added. It shows up on the day.' : 'Added to Today.')
    onDone()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?"
        aria-label="Task" enterKeyHint="done" />
      {more ? (
        <>
          <Field label="When"><DateChoice value={date} today={today} onChange={setDate} /></Field>
          <Field label="Goal" htmlFor="qa-goal"><GoalSelect id="qa-goal" value={goalId} onChange={setGoalId} /></Field>
        </>
      ) : (
        <button type="button" className="link-btn" onClick={() => setMore(true)}>Date or goal…</button>
      )}
      <div className="sheet-actions">
        <button type="submit" className="btn primary" disabled={!title.trim()}>Add</button>
      </div>
    </form>
  )
}

function OccurrenceForm({ commitments, today, onDone }: { commitments: Commitment[]; today: DateStr; onDone: () => void }) {
  const displacements = useDisplacements()
  const [cId, setCId] = useState<ID>(commitments[0].id)
  const c = commitments.find((x) => x.id === cId) ?? commitments[0]
  const [date, setDate] = useState<DateStr>(today)
  const [scheduled, setScheduled] = useState('')
  const [actual, setActual] = useState(() => formatTime(nowMinutes(new Date())))
  const [kept, setKept] = useState<boolean | null>(null)
  const [reason, setReason] = useState<MissReason | null>(null)
  const [displacementId, setDisplacementId] = useState<ID | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [note, setNote] = useState('')

  const timed = c.checkinType === 'timestamp'
  const sched = parseTime(scheduled)
  const act = parseTime(actual)
  const hit = timed ? sched != null && act != null && act <= sched : kept
  const decided = timed ? sched != null && act != null : kept != null

  const save = async () => {
    if (!decided) return
    let dId = displacementId
    if (reason === 'chose_other' && !dId && newLabel.trim()) dId = (await addDisplacement(newLabel)).id
    const r = await logOccurrence(c, {
      date, scheduledTime: scheduled || '00:00', actualTime: actual, kept: kept ?? false,
      miss: !hit && reason ? { reason, displacementId: reason === 'chose_other' ? dId : null, note } : undefined,
    })
    toast(r.hit ? 'Logged: kept.' : 'Logged. A miss is just data.')
    onDone()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
      {commitments.length > 1 && (
        <Field label="Commitment" htmlFor="occ-c">
          <select id="occ-c" value={cId} onChange={(e) => setCId(e.target.value)}>
            {commitments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
      )}
      <p className="muted small" style={{ margin: '0 0 14px' }}>{c.measurementDefinition}</p>
      <Field label="Day" htmlFor="occ-date">
        <input id="occ-date" type="date" value={date} max={today} onChange={(e) => isDateStr(e.target.value) && setDate(e.target.value)} />
      </Field>
      {timed ? (
        <div className="inline-fields" style={{ marginTop: 18 }}>
          <Field label="Agreed time" htmlFor="occ-s">
            <input id="occ-s" type="time" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label="You arrived" htmlFor="occ-a">
            <input id="occ-a" type="time" value={actual} onChange={(e) => setActual(e.target.value)} />
          </Field>
        </div>
      ) : (
        <Field label="Did you keep it?">
          <div className="chips">
            <Chip selected={kept === true} onClick={() => setKept(true)}>Yes</Chip>
            <Chip selected={kept === false} onClick={() => setKept(false)}>No</Chip>
          </div>
        </Field>
      )}

      {decided && !hit && (
        <div className="prompt" style={{ margin: '18px 0 0' }}>
          <div className="prompt-q">What happened?</div>
          <div className="chips">
            {REASONS.map((r) => (
              <Chip key={r.value} selected={reason === r.value} wide={r.value === 'chose_other'}
                onClick={() => setReason(reason === r.value ? null : r.value)}>{r.label}</Chip>
            ))}
          </div>
          {reason === 'chose_other' && (
            <>
              <div className="prompt-sub">What took its place?</div>
              <div className="chips">
                {displacements.map((d) => (
                  <Chip key={d.id} selected={displacementId === d.id}
                    onClick={() => setDisplacementId(displacementId === d.id ? null : d.id)}>{d.label}</Chip>
                ))}
              </div>
              <input style={{ marginTop: 8 }} value={newLabel} onChange={(e) => { setNewLabel(e.target.value); setDisplacementId(null) }}
                placeholder="Add another" aria-label="What took its place" />
            </>
          )}
          <input style={{ marginTop: 10 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
        </div>
      )}

      <div className="sheet-actions">
        <button type="submit" className="btn primary" disabled={!decided}>
          {decided ? (hit ? 'Log: kept' : 'Log: missed') : 'Log'}
        </button>
      </div>
    </form>
  )
}
