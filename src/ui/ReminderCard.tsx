import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t, tlist } from '../i18n'
import {
  CUSTOM_MAX, DATE_CHOICES, DATE_UNITS, isPreset, PREP_CHOICES, PREP_MAX, PREP_UNITS, reminderAt, reminderChoices, reminderLabel,
  sameReminder, TIMED_CHOICES, TIMED_UNITS,
} from '../lib/reminders'
import type { DateStr, Reminder, ReminderUnit } from '../lib/types'
import { phoneTimeZone } from '../lib/zoned'
import { Reveal, Sheet } from './components'
import { usePrefs } from './hooks'
import { IconBell, IconChevronUpDown } from './icons'
import { Wheel } from './pickers'
import { IconTile } from './valueLook'

/**
 * What an item's reminder can be: a dated item counts back from its date (and time), and only what's still
 * ahead is offered, in the menu and in Custom's wheels alike (owner, 2026-10-31); a prep repeats every
 * week, so it offers up to a day before, every time.
 */
interface Kind {
  timed: boolean
  menu: Reminder[]
  /** The menu as shown: the choices still ahead (all of them for a prep). */
  choices: Reminder[]
  /** Custom's units: those with at least 1 still ahead. None: no Custom. */
  units: ReminderUnit[]
  /** The most of a unit still ahead (or allowed). */
  max: (u: ReminderUnit) => number
}

function useKind(date: DateStr | null, time: string | null | undefined, repeats: boolean): Kind {
  const prefs = usePrefs()
  if (repeats) return { timed: true, menu: PREP_CHOICES, choices: PREP_CHOICES, units: PREP_UNITS, max: (u) => PREP_MAX[u] ?? CUSTOM_MAX }
  const timed = !!time
  const summaryTime = prefs?.summaryTime ?? '08:00'
  const tz = phoneTimeZone()
  const now = Date.now()
  const choices = date ? reminderChoices(date, time, summaryTime, tz, now) : []
  // Earlier for every extra one, so the most still ahead is found by halving.
  const most = new Map<ReminderUnit, number>()
  for (const u of timed ? TIMED_UNITS : DATE_UNITS) {
    let lo = 0
    let hi = CUSTOM_MAX
    while (date && lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (reminderAt({ n: mid, unit: u }, date, time, summaryTime, tz) > now) lo = mid
      else hi = mid - 1
    }
    most.set(u, lo)
  }
  const units = [...most].filter(([, n]) => n > 0).map(([u]) => u)
  return { timed, menu: timed ? TIMED_CHOICES : DATE_CHOICES, choices, units, max: (u) => most.get(u) ?? 0 }
}

const NONE = 'none'
const CUSTOM = 'custom'
const keyOf = (r: Reminder) => `${r.n}:${r.unit}`

/** Custom starts from what's set, or 1 hour (1 day with a date only), kept inside what's still ahead. */
function customStart(kind: Kind, value: Reminder | null | undefined): Reminder {
  const unit = value && value.n > 0 && kind.units.includes(value.unit) ? value.unit
    : kind.units.includes(kind.timed ? 'hour' : 'day') ? (kind.timed ? 'hour' : 'day') : kind.units[0]
  return { n: Math.min(kind.max(unit), Math.max(1, value?.unit === unit ? value.n : 1)), unit }
}

/**
 * The phone's own picker for the choices (owner, 2026-10-31: as for a task's goal or project), laid over
 * what opens it: None, the choices still ahead (and what's set, even once gone by, so it stays ticked), and
 * Custom when anything is still ahead.
 */
function Choices({ kind, value, isCustom, label, onPick }: {
  kind: Kind; value: Reminder | null | undefined; isCustom: boolean; label: string; onPick: (r: Reminder | null, asCustom?: boolean) => void
}) {
  const choices = value && !isCustom && !kind.choices.some((c) => sameReminder(c, value)) ? [value, ...kind.choices] : kind.choices
  const current = !value ? NONE : isCustom ? CUSTOM : keyOf(choices.find((c) => sameReminder(c, value)) ?? value)
  return (
    <select aria-label={label} value={current} onChange={(e) => {
      const v = e.target.value
      if (v === NONE) return onPick(null)
      if (v === CUSTOM) return onPick(customStart(kind, value), true)
      const [n, unit] = v.split(':')
      onPick({ n: Number(n), unit: unit as ReminderUnit })
    }}>
      <option value={NONE}>{t('rem.none')}</option>
      {choices.length > 0 && <hr />}
      {choices.map((c) => <option key={keyOf(c)} value={keyOf(c)}>{reminderLabel(c, kind.timed)}</option>)}
      {(kind.units.length > 0 || isCustom) && <hr />}
      {(kind.units.length > 0 || isCustom) && <option value={CUSTOM}>{t('rem.custom')}</option>}
    </select>
  )
}

/**
 * The Notification card (the owner's design, plan §14 S5, as in iPhone's Reminders): under Date and Time once
 * an item has a date (a prep: under its days and time), one row whose value opens the phone's picker: None,
 * the choices still ahead, and Custom, which opens two wheels under the row with what's set in red above
 * them. Tapping the red line folds the wheels away and keeps what's set; tapping it again opens them.
 */
export function ReminderCard(props: {
  date: DateStr | null; time: string | null | undefined; value: Reminder | null | undefined; onChange: (r: Reminder | null) => void
  /** A prep: no date, every week at its time. */
  repeats?: boolean
}) {
  const kind = useKind(props.date, props.time, !!props.repeats)
  const [custom, setCustom] = useState(false)
  const [wheels, setWheels] = useState(false)
  const { value } = props
  const isCustom = !!value && (custom || !isPreset(value, kind.menu))
  // Custom stays while it's the choice; a new item (another sheet) starts with it closed.
  useEffect(() => {
    if (!value) {
      setCustom(false)
      setWheels(false)
    }
  }, [value])
  if (!props.date && !props.repeats) return null

  const shown = !value ? t('rem.none') : isCustom ? t('rem.custom') : reminderLabel(value, kind.timed)
  return (
    <div className="card list settings dt-rows">
      <div className="list-row select-row">
        <IconTile color="orange"><IconBell width={16} height={16} /></IconTile>
        <div className="text"><span className="title">{t('rem.notification')}</span></div>
        <span className="row-value">{shown}</span>
        <IconChevronUpDown className="chev" width={16} height={16} />
        <Choices kind={kind} value={value} isCustom={isCustom} label={t('rem.notification')} onPick={(r, asCustom = false) => {
          setCustom(asCustom)
          setWheels(asCustom)
          props.onChange(r)
        }} />
      </div>
      {isCustom && value && (
        <div className="dt-picker custom-picker">
          <button type="button" className="custom-line" aria-expanded={wheels} onClick={() => setWheels(!wheels)}>
            {reminderLabel(value, kind.timed)}
          </button>
          <Reveal open={wheels}>
            <CustomWheels kind={kind} value={value} onChange={props.onChange} />
          </Reveal>
        </div>
      )}
    </div>
  )
}

/**
 * A project step's reminder (owner's pick 7b): a bell beside its end date, on the project's page, opening
 * the phone's picker right there; once set, the bell shows the choice. Custom opens a small sheet with the
 * two wheels. A step's date is a date only, so its reminder comes at the morning summary's time.
 */
export function ReminderChip(props: { date: DateStr; value: Reminder | null | undefined; label: string; onChange: (r: Reminder | null) => void }) {
  const kind = useKind(props.date, null, false)
  const [wheels, setWheels] = useState<Reminder | null>(null)
  const { value } = props
  const isCustom = !!value && !isPreset(value, kind.menu)
  const shown = value ? reminderLabel(value, false) : null
  return (
    <>
      <span className={`step-bell ${value ? 'set' : ''}`}>
        <IconBell width={14} height={14} />
        {shown && <span>{shown}</span>}
        <Choices kind={kind} value={value} isCustom={isCustom} label={`${props.label}: ${shown ?? t('rem.none')}`}
          onPick={(r, asCustom) => (asCustom ? setWheels(r) : props.onChange(r))} />
      </span>
      <Sheet open={!!wheels} onClose={() => setWheels(null)} title={t('rem.notification')}
        done={{ label: t('common.doneEditing'), onClick: () => { props.onChange(wheels); setWheels(null) } }}>
        {wheels && (
          <>
            <p className="custom-line">{reminderLabel(wheels, false)}</p>
            <CustomWheels kind={kind} value={wheels} onChange={setWheels} />
          </>
        )}
      </Sheet>
    </>
  )
}

/** Custom: a number and a unit on two wheels, each only as far as is still ahead. */
function CustomWheels({ kind, value, onChange }: { kind: Kind; value: Reminder; onChange: (r: Reminder) => void }) {
  const unitWords = tlist('rem.unitWords')
  const units = kind.units.length ? kind.units : [value.unit]
  const words = units.map((u) => unitWords[TIMED_UNITS.indexOf(u)])
  const unit = units.includes(value.unit) ? value.unit : units[0]
  const max = Math.max(1, kind.max(unit))
  const n = Math.min(max, Math.max(1, value.n))
  return (
    <div className="wheels">
      <Wheel count={max} value={n - 1} label={t('rem.amount')} format={(i) => String(i + 1)} onChange={(i) => onChange({ n: i + 1, unit })} />
      <Wheel count={units.length} value={units.indexOf(unit)} label={t('rem.unit')} className="wide" format={(i) => words[i]}
        onChange={(i) => onChange({ n: Math.min(n, Math.max(1, kind.max(units[i]))), unit: units[i] })} />
    </div>
  )
}

/**
 * Saving with a notification whose time has passed (owner, 2026-10-31): the date moved closer, or the screen
 * stayed open past it. Nothing would be sent, so it asks first, as an iOS action sheet: save anyway, or go
 * back and change it. `guard` runs `save` at once when there's nothing to say.
 */
export function usePassedCheck(): {
  guard: (r: Reminder | null | undefined, date: DateStr | null | undefined, time: string | null | undefined, save: () => void) => void
  ask: ReactNode
} {
  const prefs = usePrefs()
  const [pending, setPending] = useState<(() => void) | null>(null)
  const guard = (r: Reminder | null | undefined, date: DateStr | null | undefined, time: string | null | undefined, save: () => void) => {
    const passed = !!r && !!date && reminderAt(r, date, time || null, prefs?.summaryTime ?? '08:00', phoneTimeZone()) <= Date.now()
    if (passed) setPending(() => save)
    else save()
  }
  const ask = pending && createPortal(
    <div className="action-sheet-layer">
      <div className="action-sheet" role="alertdialog" aria-label={t('rem.passedTitle')}>
        <div className="action-sheet-shade" onClick={() => setPending(null)} />
        <div className="action-sheet-group">
          <p className="action-sheet-msg"><b>{t('rem.passedTitle')}</b>{t('rem.passedBody')}</p>
          <button type="button" className="action-sheet-btn" onClick={() => { setPending(null); pending() }}>{t('rem.saveAnyway')}</button>
        </div>
        <button type="button" className="action-sheet-btn cancel" autoFocus onClick={() => setPending(null)}>{t('rem.changeIt')}</button>
      </div>
    </div>,
    document.body,
  )
  return { guard, ask }
}
