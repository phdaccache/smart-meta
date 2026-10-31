import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { t, tlist } from '../i18n'
import {
  CUSTOM_MAX, DATE_UNITS, isPreset, reminderChoices, reminderLabel, sameReminder, TIMED_UNITS,
} from '../lib/reminders'
import type { DateStr, Reminder } from '../lib/types'
import { phoneTimeZone } from '../lib/zoned'
import { usePopPhase, Reveal } from './components'
import { usePrefs } from './hooks'
import { IconBell, IconCheck, IconChevronUpDown } from './icons'
import { Wheel } from './pickers'
import { IconTile } from './valueLook'

/**
 * The Notification card (the owner's design, plan §14 S5, as in iPhone's Reminders): under Date and Time once
 * an item has a date, one row whose value opens a menu: None, the choices still ahead, and Custom, which opens
 * two wheels under the row with what's set in red above them. No date, no card.
 */
export function ReminderCard(props: {
  date: DateStr | null; time: string | null | undefined; value: Reminder | null | undefined; onChange: (r: Reminder | null) => void
}) {
  const prefs = usePrefs()
  const pop = usePopPhase()
  const anchor = useRef<HTMLButtonElement>(null)
  const [custom, setCustom] = useState(false)
  const { date, value } = props
  const timed = !!props.time
  const isCustom = !!value && (custom || !isPreset(value, timed))
  // Custom stays open while it's the choice; a new item (another sheet) starts closed.
  useEffect(() => {
    if (!value) setCustom(false)
  }, [value])
  if (!date) return null

  const now = Date.now()
  const ahead = reminderChoices(date, props.time, prefs?.summaryTime ?? '08:00', phoneTimeZone(), now)
  // What's set stays in the menu even once its time has gone by, so the tick has somewhere to be.
  const choices = value && !isCustom && !ahead.some((c) => sameReminder(c, value)) ? [value, ...ahead] : ahead
  const units = timed ? TIMED_UNITS : DATE_UNITS
  const unitWords = tlist('rem.unitWords')
  const words = units.map((u) => unitWords[TIMED_UNITS.indexOf(u)])
  const shown = !value ? t('rem.none') : isCustom ? t('rem.custom') : reminderLabel(value, timed)
  const pick = (r: Reminder | null, asCustom = false) => {
    setCustom(asCustom)
    props.onChange(r)
    pop.set(false)
  }
  const n = value && value.n > 0 ? value.n : 1
  const unit = value && units.includes(value.unit) ? value.unit : units[0]

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
        {isCustom && value && (
          <div className="dt-picker">
            <p className="custom-line">{reminderLabel({ n, unit }, timed)}</p>
            <div className="wheels">
              <Wheel count={CUSTOM_MAX} value={n - 1} label={t('rem.amount')} format={(i) => String(i + 1)}
                onChange={(i) => props.onChange({ n: i + 1, unit })} />
              <Wheel count={units.length} value={units.indexOf(unit)} label={t('rem.unit')} className="wide" format={(i) => words[i]}
                onChange={(i) => props.onChange({ n, unit: units[i] })} />
            </div>
          </div>
        )}
      </Reveal>
      {pop.phase !== 'closed' && anchor.current && (
        <ChoiceMenu anchor={anchor.current} closing={pop.phase === 'closing'} onClose={() => pop.set(false)}>
          <div className="menu-group">
            <MenuItem on={!value} label={t('rem.none')} onClick={() => pick(null)} />
          </div>
          {choices.length > 0 && (
            <div className="menu-group">
              {choices.map((c) => (
                <MenuItem key={`${c.n}${c.unit}`} on={!isCustom && sameReminder(c, value)} label={reminderLabel(c, timed)} onClick={() => pick(c)} />
              ))}
            </div>
          )}
          <div className="menu-group">
            <MenuItem on={isCustom} label={t('rem.custom')}
              onClick={() => pick(value && value.n > 0 ? value : { n: 1, unit: timed ? 'hour' : 'day' }, true)} />
          </div>
        </ChoiceMenu>
      )}
    </div>
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
 * there, scrolling when neither fits. Drawn over everything (a sheet's scroll would cut it), and a tap
 * anywhere else closes it without reaching what's underneath.
 */
function ChoiceMenu({ anchor, closing, onClose, children }: {
  anchor: HTMLElement; closing: boolean; onClose: () => void; children: React.ReactNode
}) {
  const menu = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const el = menu.current
    if (!el) return
    const r = anchor.getBoundingClientRect()
    const vh = window.visualViewport?.height ?? window.innerHeight
    const right = Math.max(16, window.innerWidth - r.right - 4)
    const below = vh - r.bottom - 16
    const above = r.top - 16
    const h = el.scrollHeight
    const down = h <= below || below >= above
    const maxHeight = Math.max(120, Math.min(h, down ? below : above))
    setPlace(down
      ? { right, top: r.bottom + 6, maxHeight, transformOrigin: 'calc(100% - 22px) -12px' }
      : { right, bottom: vh - r.top + 6, maxHeight, transformOrigin: 'calc(100% - 22px) calc(100% + 12px)' })
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
