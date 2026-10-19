import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t, tk, tlist, type Key } from '../i18n'
import { statusLabel } from '../lib/describe'
import type { Status } from '../lib/types'
import { IconCheck, IconChevronLeft, IconClose, IconGoals, IconInfo, IconInsights, IconReview, IconSettings, IconToday } from './icons'
import { goBack, navigate, pushLayer } from './router'

// ——— screen chrome ———

export function Screen(props: {
  eyebrow?: ReactNode
  title: ReactNode
  back?: string
  /** In place of Back: a link of the screen's own (Today's way back from a past day). */
  top?: ReactNode
  actions?: ReactNode
  settings?: boolean
  children: ReactNode
}) {
  return (
    <div className="screen">
      <header className="screen-head">
        {props.top}
        {props.back && (
          <button type="button" className="back" onClick={() => goBack(props.back!)}>
            <IconChevronLeft width={20} height={20} /> {t('nav.back')}
          </button>
        )}
        <div className="head-row">
          <div className="head-text">
            {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
            <h1 className="large-title">{props.title}</h1>
          </div>
          <div className="head-actions">
            {props.actions}
            {props.settings && (
              <button type="button" className="icon-btn" aria-label={t('nav.settings')} onClick={() => navigate('/settings')}>
                <IconSettings />
              </button>
            )}
          </div>
        </div>
      </header>
      {props.children}
    </div>
  )
}

export function Section(props: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${props.className ?? ''}`}>
      {(props.title || props.aside) && (
        <div className="section-head">
          <h2>{props.title}</h2>
          {props.aside}
        </div>
      )}
      {props.children}
    </section>
  )
}

// ——— pages named in text ———

const PAGES: { name: Key; Icon: typeof IconToday }[] = [
  { name: 'nav.today', Icon: IconToday },
  { name: 'nav.plan', Icon: IconGoals },
  { name: 'nav.review', Icon: IconReview },
  { name: 'nav.insights', Icon: IconInsights },
  { name: 'nav.settings', Icon: IconSettings },
]

/**
 * A text from `marked`, with each [Page] shown as that page: highlighted, with
 * its tab's icon, so "Today" reads as the screen and not the word.
 */
export function PageText({ text }: { text: string }) {
  const parts = text.split(/\[([^\]]+)\]/)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part
        const page = PAGES.find((p) => tk(p.name).toLowerCase() === part.toLowerCase())
        if (!page) return part
        return <span key={i} className="page-ref"><page.Icon width={13} height={13} />{part}</span>
      })}
    </>
  )
}

// ——— sheet ———

/**
 * A sheet with no title (just its `label` for screen readers) starts straight with its content.
 * With `done`, it has ✕ at the left to leave without saving and ✓ at the right to save, as in iPhone's Reminders.
 */
export function Sheet(props: {
  open: boolean; onClose: () => void; title?: string; label?: string; children: ReactNode
  done?: { label: string; disabled?: boolean; onClick: () => void }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [view, setView] = useState<{ top: number; height: number } | null>(null)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose

  // Android's back button closes the sheet rather than leaving the screen under it.
  useEffect(() => {
    if (props.open) return pushLayer(() => onClose.current())
  }, [props.open])

  // iOS doesn't shrink the page for the keyboard; it scrolls it, sometimes leaving the field
  // underneath. Pinning the sheet to the visible area keeps it right above the keyboard.
  useEffect(() => {
    const vv = window.visualViewport
    if (!props.open || !vv) return
    const update = () => setView({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setView(null)
    }
  }, [props.open])
  // iPhone hands a drag on the sheet to the page under it (or, with the keyboard up, moves the whole view).
  // Only what scrolls inside the sheet may move; any other drag goes nowhere.
  useEffect(() => {
    const layer = layerRef.current
    if (!props.open || !layer) return
    const onMove = (e: TouchEvent) => {
      // Moving the caret or a selection in the field being typed in.
      if (e.target === document.activeElement && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return
      for (let el = e.target as HTMLElement | null; el && el !== layer; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el)
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return
      }
      e.preventDefault()
    }
    layer.addEventListener('touchmove', onMove, { passive: false })
    return () => layer.removeEventListener('touchmove', onMove)
  }, [props.open])
  useEffect(() => {
    if (!props.open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    // A field that focused itself on mount (autoFocus) keeps it; otherwise the first control gets it.
    if (!ref.current?.contains(document.activeElement)) {
      ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button')?.focus({ preventScroll: true })
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
      prev?.focus?.({ preventScroll: true })
    }
  }, [props.open])
  useSwipeToDismiss(ref, props.open, onClose)
  if (!props.open) return null
  // The visible area shrinks by the keyboard's height; a small change is just the browser's own bars.
  const keyboard = !!view && view.height < window.innerHeight - 150
  return createPortal(
    <div ref={layerRef} className={`sheet-layer ${keyboard ? 'keyboard' : ''}`} style={view ? { top: view.top, height: view.height, bottom: 'auto' } : undefined}>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className={`sheet ${props.title || props.done ? '' : 'untitled'}`} role="dialog" aria-modal="true" ref={ref}
        aria-labelledby={props.title ? titleId : undefined} aria-label={props.title ? undefined : props.label}>
        <div className="sheet-grabber" aria-hidden="true" />
        {props.done ? (
          <div className="sheet-head bar">
            <button type="button" className="round-btn" aria-label={t('nav.close')} onClick={props.onClose}>
              <IconClose width={20} height={20} />
            </button>
            {props.title ? <h2 id={titleId}>{props.title}</h2> : <span />}
            <button type="button" className="round-btn primary" aria-label={props.done.label} disabled={props.done.disabled} onClick={props.done.onClick}>
              <IconCheck width={20} height={20} />
            </button>
          </div>
        ) : props.title && (
          <div className="sheet-head">
            <h2 id={titleId}>{props.title}</h2>
            <button type="button" className="icon-btn" aria-label={t('nav.close')} onClick={props.onClose}>
              <IconClose width={20} height={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Pull a sheet down to close it, as on the iPhone: from its top, or from
 * anywhere once its content is scrolled to the top. It follows the finger;
 * let go far enough down, or with a flick, and it slides away.
 */
function useSwipeToDismiss(ref: React.RefObject<HTMLDivElement | null>, open: boolean, close: React.RefObject<() => void>) {
  useEffect(() => {
    const sheet = ref.current
    if (!open || !sheet) return
    const backdrop = sheet.previousElementSibling as HTMLElement | null
    let start: { y: number; t: number } | null = null
    let dragging = false
    let last = { y: 0, t: 0, v: 0 }
    const set = (dy: number, animate: boolean) => {
      const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)'
      sheet.style.transition = animate ? `transform 0.3s ${ease}` : 'none'
      sheet.style.transform = dy ? `translateY(${dy}px)` : ''
      if (backdrop) {
        backdrop.style.transition = animate ? `opacity 0.3s ${ease}` : 'none'
        backdrop.style.opacity = String(Math.max(0, 1 - dy / sheet.offsetHeight))
      }
    }
    const onStart = (e: TouchEvent) => {
      const el = e.target as HTMLElement
      const body = sheet.querySelector('.sheet-body')
      const atTop = !body || body.scrollTop <= 0 || !body.contains(el)
      if (e.touches.length !== 1 || !atTop || el.closest('input, textarea, select, .look-icons, .look-colors')) return
      start = { y: e.touches[0].clientY, t: e.timeStamp }
      last = { y: start.y, t: e.timeStamp, v: 0 }
      dragging = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const y = e.touches[0].clientY
      const dy = y - start.y
      if (!dragging) {
        if (dy < -4) { start = null; return } // scrolling the content up
        if (dy < 8) return
        dragging = true
      }
      if (e.cancelable) e.preventDefault()
      const dt = Math.max(1, e.timeStamp - last.t)
      last = { y, t: e.timeStamp, v: (y - last.y) / dt }
      // Above its resting place it resists, the way iOS rubber-bands.
      set(dy > 0 ? dy : -Math.sqrt(-dy) * 2, false)
    }
    const onEnd = () => {
      if (!start || !dragging) { start = null; return }
      const dy = last.y - start.y
      start = null
      dragging = false
      // Where a flick would carry it (Apple's projection), not just where the finger stopped.
      const projected = dy + (last.v * 0.998) / (1 - 0.998)
      if (projected > sheet.offsetHeight * 0.45 && last.v > -0.1) {
        set(sheet.offsetHeight, true)
        setTimeout(() => close.current(), 220)
      } else {
        set(0, true)
      }
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [ref, open, close])
}

// ——— controls ———

export function CheckButton(props: {
  shape: 'circle' | 'square'
  checked: boolean
  tone?: 'miss' | 'muted'
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`check ${props.shape} ${props.checked ? 'on' : ''} ${props.tone ?? ''}`}
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={props.onClick}
    >
      <span className="check-box">{props.checked && <IconCheck width={16} height={16} />}</span>
    </button>
  )
}

export function Badge(props: { kind: 'goal' | 'prep' | 'step' | 'task'; children: ReactNode }) {
  return <span className={`badge badge-${props.kind}`}>{props.children}</span>
}

export function StatusWord({ status }: { status: Status | null }) {
  if (!status) return <span className="status status-none">{t('status.noData')}</span>
  return <span className={`status status-${status.replace(' ', '-')}`}>{statusLabel(status)}</span>
}

/** "On track: at or above it." with the term in bold. */
function Term({ text }: { text: string }) {
  const i = text.indexOf(':')
  return i < 0 ? <>{text}</> : <><b>{text.slice(0, i)}</b>{text.slice(i)}</>
}

/** What on track / behind / at risk mean, behind an (i). */
export function StatusInfo() {
  return (
    <InfoTip label={t('status.infoLabel')}>
      {t('status.infoIntro')}<br />
      <Term text={t('status.infoOnTrack')} /><br />
      <Term text={t('status.infoBehind')} /><br />
      <Term text={t('status.infoAtRisk')} /><br />
      {t('status.infoFinish')} {t('status.infoBars')}
    </InfoTip>
  )
}

export function WeekBar({ weeks, label = t('status.last4Weeks') }: { weeks: (Status | null)[]; label?: string }) {
  const text = weeks.map((w, i) => t('status.weekN', { n: i + 1, status: w ? statusLabel(w) : t('status.noData') })).join(', ')
  return (
    <span className="weekbar" role="img" aria-label={`${label}: ${text}`} title={label}>
      {weeks.map((w, i) => (
        <span key={i} className={`seg ${w ? `seg-${w.replace(' ', '-')}` : 'seg-none'}`} />
      ))}
    </span>
  )
}

/**
 * An (i) that opens a short explanation. Use it for ideas that are genuinely
 * new; everything else should explain itself without text.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.min(300, window.innerWidth - 32)
    const left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - 16 - width))
    const below = r.bottom + 160 < window.innerHeight
    setStyle(below ? { top: r.bottom + 6, left, width } : { top: r.top - 6, left, width, transform: 'translateY(-100%)' })
    const close = (e: Event) => {
      if (!btn.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  return (
    <>
      <button type="button" ref={btn} className="info-btn" aria-label={label} aria-expanded={open}
        aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
        <IconInfo width={18} height={18} />
      </button>
      {open && style && createPortal(<div id={id} role="tooltip" className="info-pop" style={style}>{children}</div>, document.body)}
    </>
  )
}

export function Field(props: {
  label: string; hint?: ReactNode; info?: ReactNode; error?: string; children: ReactNode; htmlFor?: string
}) {
  return (
    <div className={`field ${props.error ? 'has-error' : ''}`}>
      <div className="field-label-row">
        <label className="field-label" htmlFor={props.htmlFor}>{props.label}</label>
        {props.info && <InfoTip label={t('common.about', { topic: props.label.toLowerCase() })}>{props.info}</InfoTip>}
      </div>
      {props.hint && <div className="field-hint">{props.hint}</div>}
      {props.children}
      {props.error && <div className="field-error" role="alert">{props.error}</div>}
    </div>
  )
}

export function Segmented<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={props.value === o.value}
          className={props.value === o.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip(props: { selected?: boolean; onClick: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <button type="button" className={`chip ${props.selected ? 'on' : ''} ${props.wide ? 'wide' : ''}`} aria-pressed={!!props.selected}
      onClick={props.onClick}>
      {props.selected && <IconCheck width={14} height={14} />}
      {props.children}
    </button>
  )
}

/** An on/off switch, like iPhone's Settings. */
export function Switch(props: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" className="switch" aria-checked={props.checked} aria-label={props.label}
      onClick={() => props.onChange(!props.checked)} />
  )
}

export function WeekdayPicker(props: { value: number[]; onChange: (v: number[]) => void }) {
  const days = tlist('dates.weekdayInitials')
  const names = (['dates.monday', 'dates.tuesday', 'dates.wednesday', 'dates.thursday', 'dates.friday', 'dates.saturday', 'dates.sunday'] as const).map((k) => t(k))
  return (
    <div className="weekdays" role="group" aria-label={t('common.days')}>
      {days.map((d, i) => {
        const iso = i + 1
        const on = props.value.includes(iso)
        return (
          <button type="button" key={iso} aria-pressed={on} aria-label={names[i]} className={on ? 'on' : ''}
            onClick={() => props.onChange(on ? props.value.filter((x) => x !== iso) : [...props.value, iso])}>
            {d}
          </button>
        )
      })}
    </div>
  )
}

export function Stepper(props: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <button type="button" aria-label={t('common.less')} disabled={props.value <= props.min} onClick={() => props.onChange(props.value - 1)}>−</button>
      <output>{props.value}</output>
      <button type="button" aria-label={t('common.more')} disabled={props.value >= props.max} onClick={() => props.onChange(props.value + 1)}>+</button>
    </div>
  )
}

/** A destructive action behind a typed confirmation: deliberately awkward. */
export function TypeToConfirm(props: { phrase: string; action: string; onConfirm: () => void }) {
  const [text, setText] = useState('')
  const ok = text.trim().toLowerCase() === props.phrase.trim().toLowerCase()
  return (
    <div className="type-confirm">
      <Field label={t('common.typeToConfirm', { phrase: props.phrase })}>
        <input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" autoComplete="off" />
      </Field>
      <button type="button" className="btn danger" disabled={!ok} onClick={props.onConfirm}>{props.action}</button>
    </div>
  )
}

/**
 * A native date picker behind a custom button. The input sits invisibly on top
 * of the button so a tap opens the picker directly, which iOS requires.
 */
export function DatePickerButton(props: {
  value: string
  min?: string
  max?: string
  label: string
  className?: string
  children: ReactNode
  onPick: (date: string) => void
}) {
  const [picks, setPicks] = useState(0)
  const focusedAt = useRef(0)
  return (
    <span className={`date-overlay ${props.className ?? ''}`}>
      {props.children}
      {/* iPhone's calendar stays open after a day is picked, even one that's refused: a fresh field closes it. */}
      <input key={picks} type="date" value={props.value} min={props.min} max={props.max} aria-label={props.label}
        onFocus={() => { focusedAt.current = Date.now() }}
        onChange={(e) => {
          if (!e.target.value) return
          // An empty field gets today filled in by iPhone as its calendar opens: that's not a pick, so it stays open.
          if (!props.value && Date.now() - focusedAt.current < 600) return
          e.target.blur()
          setPicks((n) => n + 1)
          props.onPick(e.target.value)
        }} />
    </span>
  )
}

/** Notes on a task or project: several lines, growing with what's written. */
export function NoteField(props: {
  id?: string; value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; label?: string; compact?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [props.value])
  return (
    <textarea ref={ref} id={props.id} rows={props.compact ? 1 : 3} className={`growing note-field ${props.compact ? 'compact' : ''}`} value={props.value}
      placeholder={props.compact ? t('common.notes') : t('common.notesPlaceholder')}
      aria-label={props.label} onChange={(e) => props.onChange(e.target.value)} onBlur={(e) => props.onBlur?.(e.target.value)} />
  )
}

// ——— toast ———

let toastMsg: string | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()

export function toast(msg: string) {
  toastMsg = msg
  toastListeners.forEach((l) => l())
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg = null
    toastListeners.forEach((l) => l())
  }, 3200)
}

export function Toaster() {
  const msg = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toastMsg,
  )
  return (
    <div className="toast-region" aria-live="polite">
      {msg && <div className="toast">{msg}</div>}
    </div>
  )
}
