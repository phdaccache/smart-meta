import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Status } from '../lib/types'
import { IconCheck, IconChevronLeft, IconClose, IconInfo, IconSettings } from './icons'
import { goBack, navigate } from './router'

// ——— screen chrome ———

export function Screen(props: {
  eyebrow?: ReactNode
  title: ReactNode
  back?: string
  actions?: ReactNode
  settings?: boolean
  children: ReactNode
}) {
  return (
    <div className="screen">
      <header className="screen-head">
        {props.back && (
          <button type="button" className="back" onClick={() => goBack(props.back!)}>
            <IconChevronLeft width={20} height={20} /> Back
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
              <button type="button" className="icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
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

// ——— sheet ———

export function Sheet(props: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
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
  if (!props.open) return null
  return createPortal(
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="sheet-head">
          <h2 id={titleId}>{props.title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
            <IconClose width={20} height={20} />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
      </div>
    </div>,
    document.body,
  )
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
  if (!status) return <span className="status status-none">no data yet</span>
  return <span className={`status status-${status.replace(' ', '-')}`}>{status}</span>
}

/** What on track / behind / at risk mean, behind an (i). */
export function StatusInfo() {
  return (
    <InfoTip label="What the status means">
      Counted from the goal’s start, against its tolerance (say 80%):<br />
      <b>On track</b>: at or above it.<br />
      <b>Behind</b>: below it, by up to 15 points (65–79%).<br />
      <b>At risk</b>: more than 15 points below.<br />
      Finish lines turn <b>behind</b> during their extra time and <b>at risk</b> after it.
      The four bars are the last four weeks, oldest first; grey means nothing to judge yet.
    </InfoTip>
  )
}

export function WeekBar({ weeks, label = 'Last 4 weeks' }: { weeks: (Status | null)[]; label?: string }) {
  const text = weeks.map((w, i) => `week ${i + 1}: ${w ?? 'no data'}`).join(', ')
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
        {props.info && <InfoTip label={`About ${props.label.toLowerCase()}`}>{props.info}</InfoTip>}
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

export function WeekdayPicker(props: { value: number[]; onChange: (v: number[]) => void }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return (
    <div className="weekdays" role="group" aria-label="Days">
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
      <button type="button" aria-label="Less" disabled={props.value <= props.min} onClick={() => props.onChange(props.value - 1)}>−</button>
      <output>{props.value}</output>
      <button type="button" aria-label="More" disabled={props.value >= props.max} onClick={() => props.onChange(props.value + 1)}>+</button>
    </div>
  )
}

/** A destructive action behind a typed confirmation: deliberately awkward. */
export function TypeToConfirm(props: { phrase: string; action: string; onConfirm: () => void }) {
  const [text, setText] = useState('')
  const ok = text.trim().toLowerCase() === props.phrase.trim().toLowerCase()
  return (
    <div className="type-confirm">
      <Field label={`Type “${props.phrase}” to confirm`}>
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
  return (
    <span className={`date-overlay ${props.className ?? ''}`}>
      {props.children}
      <input type="date" value={props.value} min={props.min} max={props.max} aria-label={props.label}
        onChange={(e) => e.target.value && props.onPick(e.target.value)} />
    </span>
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
