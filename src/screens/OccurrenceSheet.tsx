import { useState } from 'react'
import { addDisplacement, logOccurrence } from '../db/repo'
import { formatTime, isDateStr, nowMinutes, parseTime } from '../lib/dates'
import { REASONS } from '../lib/describe'
import type { Commitment, DateStr, ID, MissReason } from '../lib/types'
import { Chip, Field, Sheet, toast } from '../ui/components'
import { useDisplacements } from '../ui/hooks'

/**
 * Logs one occurrence of a rule-type (standard) commitment: "I had a meeting
 * at 09:00 and arrived at 09:10". Opened from the goal's card on Today or the
 * goal's page.
 */
export function OccurrenceSheet(props: { commitment: Commitment | null; date: DateStr; today: DateStr; onClose: () => void }) {
  if (!props.commitment) return null
  return (
    <Sheet open onClose={props.onClose} title={`Log ${props.commitment.label}`}>
      <OccurrenceForm key={props.commitment.id} c={props.commitment} date={props.date} today={props.today} onDone={props.onClose} />
    </Sheet>
  )
}

function OccurrenceForm({ c, date: initialDate, today, onDone }: { c: Commitment; date: DateStr; today: DateStr; onDone: () => void }) {
  const displacements = useDisplacements()
  const [date, setDate] = useState<DateStr>(initialDate)
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
    await logOccurrence(c, {
      date, scheduledTime: scheduled || '00:00', actualTime: actual, kept: kept ?? false,
      miss: !hit && reason ? { reason, displacementId: reason === 'chose_other' ? dId : null, note } : undefined,
    })
    toast('Logged.')
    onDone()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
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
