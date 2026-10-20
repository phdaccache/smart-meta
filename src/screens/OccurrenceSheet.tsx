import { useState } from 'react'
import { logOccurrence, putOffMiss } from '../db/repo'
import { capitalize, formatTime, nowMinutes, parseTime } from '../lib/dates'
import { t } from '../i18n'
import type { MissPrompt } from '../lib/scoring'
import type { Commitment, DateStr, ID, Occurrence } from '../lib/types'
import { Chip, DateField, Field, Sheet, toast } from '../ui/components'
import { useSnapshot } from '../ui/hooks'
import { IconChevronUpDown } from '../ui/icons'
import { MissPromptCard } from './Today'

/**
 * Logs one occurrence of a rule-type (standard) commitment: "I had a meeting
 * at 09:00 and arrived at 09:10". Opened from the goal's card on Today or the
 * goal's page. Once a missed one is logged, the same sheet asks why, as after
 * a daily value under its line; not now leaves the question for Today.
 */
export function OccurrenceSheet(props: { commitment: Commitment | null; date: DateStr; today: DateStr; onClose: () => void }) {
  const [why, setWhy] = useState<{ prompt: MissPrompt; question: string } | null>(null)
  const c = props.commitment
  if (!c) return null
  const close = () => {
    setWhy(null)
    props.onClose()
  }
  const putOff = () => {
    if (why) putOffMiss(why.prompt, props.today)
    close()
  }
  if (why) {
    return (
      <Sheet open onClose={putOff} label={why.question}>
        <MissPromptCard prompt={why.prompt} question={why.question} today={props.today} canLog={false} sheet
          onNotNow={putOff} onSaved={close} />
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={close} title={t('today.logItem', { name: c.label })}>
      <OccurrenceForm key={c.id} c={c} date={props.date} today={props.today} onDone={close} onMissed={setWhy} />
    </Sheet>
  )
}

function OccurrenceForm({ c, date: initialDate, today, onDone, onMissed }: {
  c: Commitment; date: DateStr; today: DateStr; onDone: () => void
  /** Logged as missed: the question to ask next. */
  onMissed: (why: { prompt: MissPrompt; question: string }) => void
}) {
  const snap = useSnapshot()
  const names = earlierNames(snap?.occurrences ?? [], c.id)
  const [date, setDate] = useState<DateStr>(initialDate)
  const [title, setTitle] = useState('')
  const [scheduled, setScheduled] = useState('')
  const [actual, setActual] = useState(() => formatTime(nowMinutes(new Date())))
  const [kept, setKept] = useState<boolean | null>(null)

  const timed = c.checkinType === 'timestamp'
  const sched = parseTime(scheduled)
  const act = parseTime(actual)
  const hit = timed ? sched != null && act != null && act <= sched : kept
  const decided = timed ? sched != null && act != null : kept != null

  // Logged first, then asked why: the question waits for the button, not for the second time typed.
  const save = async () => {
    if (!decided) return
    const r = await logOccurrence(c, { date, scheduledTime: scheduled || '00:00', actualTime: actual, kept: kept ?? false, title })
    if (r.hit) {
      toast(t('common.logged'))
      return onDone()
    }
    const name = title.trim() || c.label
    onMissed({
      prompt: {
        commitmentId: c.id, period: 'day', slots: [{ date, count: 1 }],
        occurrence: { id: r.occurrence.id, entryId: r.entry.id, title: r.occurrence.title, time: scheduled || undefined },
      },
      question: timed ? capitalize(t('miss.later', { name, value: actual, target: scheduled })) : t('occ.whatHappened'),
    })
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }}>
      <p className="muted small" style={{ margin: '0 0 14px' }}>{c.measurementDefinition}</p>
      <Field label={t('common.day')} htmlFor="occ-date">
        <DateField id="occ-date" value={date} max={today} onChange={setDate} />
      </Field>
      <div style={{ marginTop: 18 }}>
        <Field label={t('occ.whatWasIt')} htmlFor="occ-title">
          <div className="name-pick">
            <input id="occ-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('occ.whatWasItPlaceholder')} />
            {names.length > 0 && (
              // The phone's own list, as for picking a goal: fine however many names pile up.
              <span className="btn pick-btn">
                {t('occ.earlierNames')} <IconChevronUpDown width={14} height={14} />
                <select aria-label={t('occ.earlierNames')} value="" onChange={(e) => e.target.value && setTitle(e.target.value)}>
                  <option value="">{t('occ.earlierNames')}</option>
                  {names.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </span>
            )}
          </div>
        </Field>
      </div>
      {timed ? (
        <div className="inline-fields" style={{ marginTop: 18 }}>
          <Field label={t('occ.agreedTime')} htmlFor="occ-s">
            <input id="occ-s" type="time" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </Field>
          <Field label={t('occ.youArrived')} htmlFor="occ-a">
            <input id="occ-a" type="time" value={actual} onChange={(e) => setActual(e.target.value)} />
          </Field>
        </div>
      ) : (
        <Field label={t('occ.keptIt')}>
          <div className="chips">
            <Chip selected={kept === true} onClick={() => setKept(true)}>{t('common.yes')}</Chip>
            <Chip selected={kept === false} onClick={() => setKept(false)}>{t('common.no')}</Chip>
          </div>
        </Field>
      )}

      <div className="sheet-actions">
        <button type="submit" className="btn primary" disabled={!decided}>
          {decided ? (hit ? t('occ.logKept') : t('occ.logMissed')) : t('common.log')}
        </button>
      </div>
    </form>
  )
}

/** Names given to this rule's earlier occurrences, most recently used first, each once. */
function earlierNames(occurrences: Occurrence[], commitmentId: ID): string[] {
  const seen = new Map<string, string>()
  for (const o of [...occurrences].filter((x) => x.commitmentId === commitmentId && !x.deletedAt && x.title?.trim())
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))) {
    const name = o.title!.trim()
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()]
}
