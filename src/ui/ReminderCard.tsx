import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t, tlist } from '../i18n'
import {
  CUSTOM_MAX, DATE_CHOICES, DATE_UNITS, isPreset, PREP_CHOICES, PREP_MAX, PREP_UNITS, reminderChoices, reminderLabel, sameReminder,
  TIMED_CHOICES, TIMED_UNITS,
} from '../lib/reminders'
import type { DateStr, Reminder, ReminderUnit } from '../lib/types'
import { phoneTimeZone } from '../lib/zoned'
import { Reveal, Sheet, usePopPhase } from './components'
import { usePrefs } from './hooks'
import { IconBell, IconCheck, IconChevronUpDown } from './icons'
import { Wheel } from './pickers'
import { IconTile } from './valueLook'

/**
 * What an item's reminder can be: a dated item counts back from its date (and time), and only choices still
 * ahead are offered; a prep repeats every week, so it offers up to a day before, every time.
 */
interface Kind {
  timed: boolean
  menu: Reminder[]
  /** The menu as shown: the choices still ahead (all of them for a prep). */
  choices: Reminder[]
  units: ReminderUnit[]
  max: (u: ReminderUnit) => number
}

function useKind(date: DateStr | null, time: string | null | undefined, repeats: boolean): Kind {
  const prefs = usePrefs()
  if (repeats) return { timed: true, menu: PREP_CHOICES, choices: PREP_CHOICES, units: PREP_UNITS, max: (u) => PREP_MAX[u] ?? CUSTOM_MAX }
  const timed = !!time
  const choices = date ? reminderChoices(date, time, prefs?.summaryTime ?? '08:00', phoneTimeZone(), Date.now()) : []
  return { timed, menu: timed ? TIMED_CHOICES : DATE_CHOICES, choices, units: timed ? TIMED_UNITS : DATE_UNITS, max: () => CUSTOM_MAX }
}

/**
 * The Notification card (the owner's design, plan §14 S5, as in iPhone's Reminders): under Date and Time once
 * an item has a date (a prep: under its days and time), one row whose value opens a menu: None, the choices
 * still ahead, and Custom, which opens two wheels under the row with what's set in red above them.
 */
export function ReminderCard(props: {
  date: DateStr | null; time: string | null | undefined; value: Reminder | null | undefined; onChange: (r: Reminder | null) => void
  /** A prep: no date, every week at its time. */
  repeats?: boolean
}) {
  const kind = useKind(props.date, props.time, !!props.repeats)
  const pop = usePopPhase()
  const anchor = useRef<HTMLButtonElement>(null)
  const [custom, setCustom] = useState(false)
  const { value } = props
  const isCustom = !!value && (custom || !isPreset(value, kind.menu))
  // Custom stays open while it's the choice; a new item (another sheet) starts closed.
  useEffect(() => {
    if (!value) setCustom(false)
  }, [value])
  if (!props.date && !props.repeats) return null

  const shown = !value ? t('rem.none') : isCustom ? t('rem.custom') : reminderLabel(value, kind.timed)
  const pick = (r: Reminder | null, asCustom = false) => {
    setCustom(asCustom)
    props.onChange(r)
    pop.set(false)
  }
  return (
    <div className="card list settings dt-rows">
      <div className="list-row">
        <IconTile color="orange"><IconBell width={16} height={16} /></IconTile>
        <div className="text"><span className="title">{t('rem.notification')}</span></div>
        <button ref={anchor} type="button" className="menu-value" aria-haspopup="menu" aria-expanded={pop.open}
          aria-label={`${t('rem.notification')}: ${shown}`}
          onClick={() => {
            ;(document.activeElement as HTMLElement | null)?.blur?.()
            pop.set(!pop.open)
          }}>
          <span className="row-value">{shown}</span>
          <IconChevronUpDown className="chev" width={16} height={16} />
        </button>
      </div>
      <Reveal open={isCustom}>
        {isCustom && value && <div className="dt-picker"><CustomWheels kind={kind} value={value} onChange={props.onChange} /></div>}
      </Reveal>
      {pop.phase !== 'closed' && anchor.current && (
        <ChoiceMenu anchor={anchor.current} closing={pop.phase === 'closing'} onClose={() => pop.set(false)}>
          <MenuItems kind={kind} value={value} isCustom={isCustom} onPick={pick} />
        </ChoiceMenu>
      )}
    </div>
  )
}

/**
 * A project step's reminder (owner's pick 7b): a bell beside its end date, on the project's page. Its menu
 * opens right there; once set, the bell shows the choice. Custom opens a small sheet with the two wheels.
 * A step's date is a date only, so its reminder comes at the morning summary's time.
 */
export function ReminderChip(props: { date: DateStr; value: Reminder | null | undefined; label: string; onChange: (r: Reminder | null) => void }) {
  const kind = useKind(props.date, null, false)
  const pop = usePopPhase()
  const anchor = useRef<HTMLButtonElement>(null)
  const [wheels, setWheels] = useState<Reminder | null>(null)
  const { value } = props
  const isCustom = !!value && !isPreset(value, kind.menu)
  const shown = value ? reminderLabel(value, false) : null
  return (
    <>
      <button ref={anchor} type="button" className={`step-bell ${value ? 'set' : ''}`} aria-haspopup="menu" aria-expanded={pop.open}
        aria-label={`${props.label}: ${shown ?? t('rem.none')}`} onClick={() => pop.set(!pop.open)}>
        <IconBell width={14} height={14} />
        {shown && <span>{shown}</span>}
      </button>
      {pop.phase !== 'closed' && anchor.current && (
        <ChoiceMenu anchor={anchor.current} closing={pop.phase === 'closing'} onClose={() => pop.set(false)}>
          <MenuItems kind={kind} value={value} isCustom={isCustom} onPick={(r, asCustom) => {
            pop.set(false)
            if (asCustom) setWheels(r)
            else props.onChange(r)
          }} />
        </ChoiceMenu>
      )}
      <Sheet open={!!wheels} onClose={() => setWheels(null)} title={t('rem.notification')}
        done={{ label: t('common.doneEditing'), onClick: () => { props.onChange(wheels); setWheels(null) } }}>
        {wheels && <CustomWheels kind={kind} value={wheels} onChange={setWheels} />}
      </Sheet>
    </>
  )
}

function MenuItems({ kind, value, isCustom, onPick }: {
  kind: Kind; value: Reminder | null | undefined; isCustom: boolean; onPick: (r: Reminder | null, asCustom?: boolean) => void
}) {
  // What's set stays in the menu even once its time has gone by, so the tick has somewhere to be.
  const choices = value && !isCustom && !kind.choices.some((c) => sameReminder(c, value)) ? [value, ...kind.choices] : kind.choices
  return (
    <>
      <div className="menu-group">
        <MenuItem on={!value} label={t('rem.none')} onClick={() => onPick(null)} />
      </div>
      {choices.length > 0 && (
        <div className="menu-group">
          {choices.map((c) => (
            <MenuItem key={`${c.n}${c.unit}`} on={!isCustom && sameReminder(c, value)} label={reminderLabel(c, kind.timed)} onClick={() => onPick(c)} />
          ))}
        </div>
      )}
      <div className="menu-group">
        <MenuItem on={isCustom} label={t('rem.custom')}
          onClick={() => onPick(value && value.n > 0 && kind.units.includes(value.unit) ? value : { n: 1, unit: kind.timed ? 'hour' : 'day' }, true)} />
      </div>
    </>
  )
}

/** Custom: a number and a unit on two wheels, with what's set in red above them. */
function CustomWheels({ kind, value, onChange }: { kind: Kind; value: Reminder; onChange: (r: Reminder) => void }) {
  const unitWords = tlist('rem.unitWords')
  const words = kind.units.map((u) => unitWords[TIMED_UNITS.indexOf(u)])
  const unit = kind.units.includes(value.unit) ? value.unit : kind.units[0]
  const max = kind.max(unit)
  const n = Math.min(max, Math.max(1, value.n))
  return (
    <>
      <p className="custom-line">{reminderLabel({ n, unit }, kind.timed)}</p>
      <div className="wheels">
        <Wheel count={max} value={n - 1} label={t('rem.amount')} format={(i) => String(i + 1)} onChange={(i) => onChange({ n: i + 1, unit })} />
        <Wheel count={kind.units.length} value={kind.units.indexOf(unit)} label={t('rem.unit')} className="wide" format={(i) => words[i]}
          onChange={(i) => onChange({ n: Math.min(n, kind.max(kind.units[i])), unit: kind.units[i] })} />
      </div>
    </>
  )
}

function MenuItem({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} className="menu-item" onClick={onClick}>
      <span className="menu-check">{on && <IconCheck width={16} height={16} strokeWidth={2.4} />}</span>
      {label}
    </button>
  )
}

/**
 * An iOS pull-down menu grown out of the value that opened it: below it, or above when there's more room
 * there, scrolling when neither fits; right-aligned to it, or left-aligned when that would leave the screen.
 * Drawn over everything (a sheet's scroll would cut it), and a tap anywhere else closes it without reaching
 * what's underneath.
 */
function ChoiceMenu({ anchor, closing, onClose, children }: {
  anchor: HTMLElement; closing: boolean; onClose: () => void; children: ReactNode
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const el = menu.current
    if (!el) return
    const r = anchor.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.visualViewport?.height ?? window.innerHeight
    const right = Math.max(16, vw - r.right - 4)
    const side: CSSProperties = vw - right - el.offsetWidth >= 16
      ? { right }
      : { left: Math.max(16, Math.min(r.left - 4, vw - el.offsetWidth - 16)) }
    const x = 'right' in side ? 'calc(100% - 22px)' : '22px'
    const below = vh - r.bottom - 16
    const above = r.top - 16
    const h = el.scrollHeight
    const down = h <= below || below >= above
    const maxHeight = Math.max(120, Math.min(h, down ? below : above))
    setPlace(down
      ? { ...side, top: r.bottom + 6, maxHeight, transformOrigin: `${x} -12px` }
      : { ...side, bottom: vh - r.top + 6, maxHeight, transformOrigin: `${x} calc(100% + 12px)` })
    el.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape closes the menu, not the sheet it was opened from.
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (document.activeElement === document.body || el.contains(document.activeElement)) anchor.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(
    <div className="choice-menu-layer">
      <div className="date-pop-catch" onPointerDown={(e) => { e.preventDefault(); close.current() }} />
      <div ref={menu} role="menu" aria-label={t('rem.notification')} className={`menu choice-menu ${closing ? 'closing' : ''}`}
        style={place ?? { visibility: 'hidden' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
