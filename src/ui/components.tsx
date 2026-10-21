import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t, tk, tlist, type Key } from '../i18n'
import { dayMonthShort } from '../lib/dates'
import { statusLabel } from '../lib/describe'
import type { DateStr, Status } from '../lib/types'
import { IconCheck, IconChevronLeft, IconClose, IconGoals, IconInfo, IconInsights, IconPlus, IconReview, IconSettings, IconToday } from './icons'
import { useSettings, useToday } from './hooks'
import { InlineCalendar } from './pickers'
import { goBack, navigate, pushLayer } from './router'

// ——— screen chrome ———

export function Screen(props: {
  eyebrow?: ReactNode
  title: ReactNode
  back?: string
  /** Back's text, when naming where it goes reads better (a tab's name). */
  backLabel?: string
  /** In place of Back: a link of the screen's own (Today's way back from a past day). */
  top?: ReactNode
  actions?: ReactNode
  settings?: boolean
  children: ReactNode
}) {
  const actions = (props.actions || props.settings) && (
    <div className="head-actions">
      {props.actions}
      {props.settings && (
        <button type="button" className="icon-btn" aria-label={t('nav.settings')} onClick={() => navigate('/settings')}>
          <IconSettings />
        </button>
      )}
    </div>
  )
  // Under a Back, the buttons sit up in its row, as in an iOS navigation bar, and the title gets the full width.
  const nav = !!(props.top || props.back)
  return (
    <div className="screen">
      <header className="screen-head">
        {nav ? (
          <div className="nav-row">
            {props.top}
            {props.back && (
              <button type="button" className="back" onClick={() => goBack(props.back!)}>
                <IconChevronLeft width={20} height={20} /> {props.backLabel ?? t('nav.back')}
              </button>
            )}
            {actions}
          </div>
        ) : null}
        <div className="head-row">
          <div className="head-text">
            {props.eyebrow && <div className="eyebrow">{props.eyebrow}</div>}
            <h1 className="large-title">{props.title}</h1>
          </div>
          {!nav && actions}
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
 * `large`: nearly full height, its top fixed just under the status bar whether the keyboard is up or not.
 * `dirty`: it holds typing not saved yet, so pulling it down (or tapping outside) asks before throwing that away.
 */
export function Sheet(props: {
  open: boolean; onClose: () => void; title?: string; label?: string; children: ReactNode
  done?: { label: string; disabled?: boolean; onClick: () => void }
  large?: boolean
  dirty?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Asking whether to throw away unsaved typing, as Reminders does.
  const [asking, setAsking] = useState(false)
  const dirty = useRef(props.dirty)
  dirty.current = props.dirty
  const layerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [view, setView] = useState<{ top: number; height: number; pageTop: number } | null>(null)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose

  // Android's back button closes the sheet rather than leaving the screen under it.
  useEffect(() => {
    if (props.open) return pushLayer(() => onClose.current())
  }, [props.open])

  // iOS doesn't shrink the page for the keyboard; it scrolls it, sometimes leaving the field
  // underneath. Pinning the sheet to the visible area keeps it right above the keyboard.
  const underRef = useRef<HTMLDivElement>(null)
  const large = !!props.large
  useEffect(() => {
    const vv = window.visualViewport
    if (!props.open || !vv) return
    // A large sheet doesn't move or resize for the keyboard, which simply covers its bottom, as on the iPhone:
    // only its content gets room to scroll above it. Following the keyboard meant moving the sheet a frame after
    // the phone had moved the view, and each time it glitched, with the page showing where the sheet should be.
    if (large) {
      const layer = layerRef.current
      const update = () => {
        if (!layer) return
        layer.style.setProperty('--kb', `${Math.max(0, layer.clientHeight - vv.height - vv.offsetTop)}px`)
        // Should the phone still slide the view up, the sheet stays where it is on screen.
        layer.style.transform = vv.offsetTop > 0 ? `translateY(${vv.offsetTop}px)` : ''
      }
      update()
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      return () => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }
    const update = () => {
      // Moved here and now, in the same frame the iPhone moves what's visible: going through a React render
      // left the sheet a frame behind as the keyboard closed, and the page flashed where the sheet should be.
      const layer = layerRef.current
      if (layer) Object.assign(layer.style, { top: `${vv.offsetTop}px`, height: `${vv.height}px`, bottom: 'auto' })
      if (underRef.current) underRef.current.style.top = `${vv.pageTop + vv.height}px`
      setView({ top: vv.offsetTop, height: vv.height, pageTop: vv.pageTop })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setView(null)
    }
  }, [props.open, large])
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
  /** Leaves, unless that would lose typing: then it asks first. */
  const leave = useRef<() => boolean>(() => true)
  leave.current = () => {
    if (!dirty.current) return true
    setAsking(true)
    return false
  }
  useEffect(() => {
    if (!props.open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && leave.current() && onClose.current()
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
  // Pull it down to close it, as in Reminders; with unsaved typing it springs back and asks.
  useSwipeToDismiss(ref, props.open && !asking, onClose, leave)
  // Closing, it slides back down the way it came, as on the iPhone. React lets go of the sheet at once
  // (often its parent goes too), so a still copy plays the way out while the page is already usable.
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!props.open || !layer) return
    return () => slideAway(layer)
  }, [props.open])
  // The visible area shrinks by the keyboard's height; a small change is just the browser's own bars.
  const keyboard = !!view && view.height < window.innerHeight - 150
  // When the keyboard goes away the sheet stays where the keyboard pushed it, as on the iPhone, instead
  // of dropping back down: it remembers how high its top got and grows to keep it there.
  const keptTop = useRef<number | null>(null)
  useLayoutEffect(() => {
    const sheet = ref.current
    const layer = layerRef.current
    if (!props.open || !sheet || !layer || !view || props.large) {
      keptTop.current = null
      return
    }
    if (keyboard) {
      sheet.style.minHeight = ''
      const top = sheet.getBoundingClientRect().top - layer.getBoundingClientRect().top
      keptTop.current = Math.min(keptTop.current ?? top, top)
    } else if (keptTop.current != null) {
      sheet.style.minHeight = `${Math.max(0, view.height - keptTop.current)}px`
    }
  }, [props.open, view, keyboard, props.large])
  if (!props.open) return null
  return createPortal(<>
    {/* With the keyboard up, iPhone's floating ↑ ↓ ✓ bar leaves a strip between the sheet and the keyboard where
        the page shows through, and the sheet's own fixed layer doesn't reach it. This sits in the page itself, just
        below what's visible, in the sheet's colour. */}
    {view && <div ref={underRef} className="sheet-underlay" aria-hidden="true" style={{ top: view.pageTop + view.height }} />}
    <div ref={layerRef} className={`sheet-layer ${keyboard ? 'keyboard' : ''} ${large ? 'large' : ''}`} style={view ? { top: view.top, height: view.height, bottom: 'auto' } : undefined}>
      <div className="sheet-backdrop" onClick={() => leave.current() && props.onClose()} />
      <div className={`sheet ${props.title || props.done ? '' : 'untitled'} ${props.large ? 'large' : ''}`} role="dialog" aria-modal="true" ref={ref}
        aria-labelledby={props.title ? titleId : undefined} aria-label={props.title ? undefined : props.label}>
        {!props.done && <div className="sheet-grabber" aria-hidden="true" />}
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
      {asking && (
        <div className="action-sheet" role="alertdialog" aria-label={t('sheet.discard')}>
          <div className="action-sheet-shade" onClick={() => setAsking(false)} />
          <div className="action-sheet-group">
            <button type="button" className="action-sheet-btn danger" onClick={() => { setAsking(false); props.onClose() }}>{t('sheet.discard')}</button>
          </div>
          <button type="button" className="action-sheet-btn cancel" autoFocus onClick={() => setAsking(false)}>{t('sheet.keepEditing')}</button>
        </div>
      )}
    </div>
  </>, document.body)
}

function slideAway(layer: HTMLElement) {
  const ghost = layer.cloneNode(true) as HTMLElement
  // The copy carries attributes, not what was typed: put the fields' text back so nothing blanks out.
  const fields = layer.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  ghost.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el, i) => { el.value = fields[i]?.value ?? '' })
  ghost.classList.add('closing')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  document.body.appendChild(ghost)
  const sheet = ghost.querySelector<HTMLElement>('.sheet')
  const backdrop = ghost.querySelector<HTMLElement>('.sheet-backdrop')
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)'
  const runs = [
    // From wherever a swipe left it, not from the top.
    sheet?.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: sheet.style.transform || 'none' }, { transform: 'translateY(100%)' }],
      { duration: still ? 150 : 300, easing: ease, fill: 'forwards' }),
    backdrop?.animate([{ opacity: backdrop.style.opacity || 1 }, { opacity: 0 }], { duration: still ? 150 : 300, easing: 'ease-out', fill: 'forwards' }),
  ]
  Promise.all(runs.map((a) => a?.finished)).catch(() => {}).finally(() => ghost.remove())
  // Animations wait while the app is in the background; the copy must not outlive its moment.
  setTimeout(() => ghost.remove(), 700)
}

/**
 * Pull a sheet down to close it, as on the iPhone: from its top, or from
 * anywhere once its content is scrolled to the top. It follows the finger;
 * let go far enough down, or with a flick, and it slides away.
 */
function useSwipeToDismiss(
  ref: React.RefObject<HTMLDivElement | null>, open: boolean, close: React.RefObject<() => void>, mayLeave: React.RefObject<() => boolean>,
) {
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
      if (projected > sheet.offsetHeight * 0.45 && last.v > -0.1 && mayLeave.current()) {
        set(sheet.offsetHeight, true)
        setTimeout(() => close.current(), 300)
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
  }, [ref, open, close, mayLeave])
}

// ——— controls ———

export function CheckButton(props: {
  shape: 'circle' | 'square'
  checked: boolean
  tone?: 'miss' | 'muted'
  /**
   * value: takes a number or a time, dashed until one is logged.
   * adds: each value adds to a weekly or monthly total, dashed with a plus until it's reached.
   */
  variant?: 'value' | 'adds'
  label: string
  onClick: () => void
}) {
  // The tick pops in only when it's just been ticked, not on every check already done when the list shows.
  const was = useRef(props.checked)
  const pop = props.checked && !was.current
  useEffect(() => { was.current = props.checked }, [props.checked])
  return (
    <button
      className={`check ${props.shape} ${props.checked ? 'on' : ''} ${pop ? 'pop' : ''} ${props.tone ?? ''} ${props.variant ? 'takes-value' : ''}`}
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={props.onClick}
    >
      <span className="check-box">
        {props.checked ? <IconCheck width={16} height={16} /> : props.variant === 'adds' && <IconPlus width={16} height={16} />}
      </span>
    </button>
  )
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
  const i = props.options.findIndex((o) => o.value === props.value)
  return (
    <div className="segmented slides" role="radiogroup" aria-label={props.label}>
      {/* One white thumb that slides to the choice, as in iOS, instead of each button lighting up. */}
      {i >= 0 && <span className="seg-thumb" aria-hidden="true" style={{ '--i': i, '--n': props.options.length } as React.CSSProperties} />}
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

/** Open, or closing a moment while it shrinks away, then gone. */
export function usePopPhase(closeMs = 200) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const set = (on: boolean) => {
    clearTimeout(timer.current)
    if (on) return setPhase('open')
    setPhase((p) => (p === 'closed' ? p : 'closing'))
    timer.current = setTimeout(() => setPhase('closed'), closeMs)
  }
  return { phase, open: phase === 'open', set }
}

interface DateLimits {
  /** The day picked, or '' for none yet. */
  value: DateStr | ''
  min?: DateStr
  max?: DateStr
}

/**
 * The app's calendar in a card that grows out of what was tapped and shrinks back into it, as iPhone's compact
 * date picker does. It sits below the button, or above it when there's no room. A tap anywhere else closes it,
 * and doesn't reach what's underneath.
 */
function DatePop(props: DateLimits & {
  anchor: HTMLElement; closing: boolean; label: string; confirm?: string; onPick: (d: DateStr) => void; onClose: () => void
}) {
  // With `confirm`, a tap only marks the day; the button below hands it over.
  const [chosen, setChosen] = useState(props.value)
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const pop = useRef<HTMLDivElement>(null)
  const width = Math.min(340, window.innerWidth - 32)
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  useLayoutEffect(() => {
    const el = pop.current
    if (!el) return
    const r = props.anchor.getBoundingClientRect()
    const vh = window.visualViewport?.height ?? window.innerHeight
    const height = el.offsetHeight
    const left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - 16 - width))
    const x = `${r.left + r.width / 2 - left}px`
    // Above, it's pinned by its bottom edge, so a month with an extra week grows away from the button.
    if (r.bottom + 8 + height <= vh - 16) setPlace({ left, width, top: r.bottom + 8, transformOrigin: `${x} ${-8 - r.height / 2}px` })
    else if (r.top - 8 - height >= 16) setPlace({ left, width, bottom: vh - r.top + 8, transformOrigin: `${x} calc(100% + ${8 + r.height / 2}px)` })
    else {
      const top = Math.max(16, (vh - height) / 2)
      setPlace({ left, width, top, transformOrigin: `${x} ${r.top + r.height / 2 - top}px` })
    }
    el.querySelector<HTMLElement>('.cal-day[aria-pressed="true"], .cal-day.today:not(:disabled)')?.focus({ preventScroll: true })
    const anchor = props.anchor
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape closes the calendar, not the sheet it was opened from.
      e.stopPropagation()
      onClose.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      if (document.activeElement === document.body || el.contains(document.activeElement)) anchor.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(
    <div className={`date-pop-layer ${props.closing ? 'closing' : ''}`}>
      <div className="date-pop-catch" onPointerDown={(e) => { e.preventDefault(); props.onClose() }} />
      <div ref={pop} role="dialog" aria-label={props.label} className={`date-pop ${props.closing ? 'closing' : ''}`}
        style={place ?? { width, visibility: 'hidden' }}>
        <InlineCalendar value={props.confirm ? chosen : props.value} min={props.min} max={props.max} today={today}
          onPick={props.confirm ? setChosen : props.onPick} />
        {props.confirm && (
          <button type="button" className="btn primary block date-pop-ok" disabled={!chosen} onClick={() => chosen && props.onPick(chosen)}>
            {props.confirm}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * A button that opens the app's calendar (see DatePop). Picking a day closes it and hands the day over.
 * Without `label`, the button is named by a <label> pointing at its `id`, as a form's field is.
 */
export function DatePickerButton(props: DateLimits & {
  id?: string
  label?: string
  /** Waits for this button (its label) before handing the day over, instead of taking the first tap. */
  confirm?: string
  className?: string
  children: ReactNode
  onPick: (date: DateStr) => void
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const pop = usePopPhase()
  return (
    <>
      <button type="button" ref={btn} id={props.id} className={`date-btn ${props.className ?? ''}`} aria-label={props.label}
        aria-haspopup="dialog" aria-expanded={pop.open} onClick={() => {
          // The keyboard would cover the calendar.
          (document.activeElement as HTMLElement | null)?.blur?.()
          pop.set(!pop.open)
        }}>
        {props.children}
      </button>
      {pop.phase !== 'closed' && btn.current && (
        <DatePop value={props.value} min={props.min} max={props.max} anchor={btn.current} label={props.label ?? t('common.date')} confirm={props.confirm}
          closing={pop.phase === 'closing'} onClose={() => pop.set(false)}
          onPick={(d) => { pop.set(false); props.onPick(d) }} />
      )}
    </>
  )
}

/** A form's date, written out as the field's text ("20 Oct 2026"); tapping it opens the calendar. */
export function DateField(props: DateLimits & { id: string; className?: string; placeholder?: string; onChange: (d: DateStr) => void }) {
  const { value } = props
  return (
    <DatePickerButton id={props.id} value={value} min={props.min} max={props.max} className={`date-field ${props.className ?? ''}`}
      onPick={props.onChange}>
      {value ? <span>{dayMonthShort(value)} {value.slice(0, 4)}</span> : <span className="date-field-empty">{props.placeholder ?? t('common.none')}</span>}
    </DatePickerButton>
  )
}

/**
 * What opens in place under a row, as a picker does in Reminders: it unfolds, pushing what's below down with it,
 * and folds back up when closed. What it held stays drawn while it folds, even once the row has let go of it.
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [held, setHeld] = useState(open)
  if (open && !held) setHeld(true)
  const last = useRef<ReactNode>(children)
  if (open) last.current = children
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => setHeld(false), 400)
      return () => clearTimeout(id)
    }
    // Keeps what opens in view while it grows, as a list scrolls along with a row opening at its bottom.
    const end = performance.now() + 420
    let frame = requestAnimationFrame(function follow() {
      box.current?.scrollIntoView({ block: 'nearest' })
      if (performance.now() < end) frame = requestAnimationFrame(follow)
    })
    return () => cancelAnimationFrame(frame)
  }, [open])
  return (
    <div ref={box} className={`reveal ${open ? 'open' : ''}`} inert={!open}>
      <div className="reveal-inner">{held && (open ? children : last.current)}</div>
    </div>
  )
}

/**
 * When a task is due, after the dates it was due before, struck through: putting a task off
 * again should feel like it. A finished task shows neither.
 */
export function DueText({ due, movedFrom }: { due?: { label: string; tone: string } | null; movedFrom?: DateStr[] | null }) {
  const moved = movedFrom ?? []
  if (!due && !moved.length) return null
  const shown = moved.slice(0, 3)
  return (
    <span className="due-line">
      {moved.length > 0 && (
        <span className="moved" role="img" aria-label={t('task.wasDue', { dates: moved.map(dayMonthShort).join(', ') })}>
          {shown.map((d, i) => <s key={i}>{dayMonthShort(d)}</s>)}
          {moved.length > shown.length && <span>+{moved.length - shown.length}</span>}
        </span>
      )}
      {due && <span className={`due due-${due.tone}`}>{due.label}</span>}
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

/** A task's title: one line that grows to show all of it, as in Reminders. Return saves instead of starting a new line. */
export function TitleField(props: {
  value: string; onChange: (v: string) => void; onEnter: () => void; placeholder: string; label: string; autoFocus?: boolean
  onBlur?: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [props.value])
  return (
    <textarea ref={ref} rows={1} className="growing title-field" autoFocus={props.autoFocus} value={props.value}
      placeholder={props.placeholder} aria-label={props.label} enterKeyHint="done" onBlur={props.onBlur}
      // A pasted title with line breaks stays one title.
      onChange={(e) => props.onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          props.onEnter()
        }
      }} />
  )
}

// ——— toast ———

type ToastAction = { label: string; run: () => void }
let toastMsg: { text: string; action?: ToastAction } | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()

/** With an action (an Undo), the toast stays a little longer and takes a tap. */
export function toast(msg: string, action?: ToastAction) {
  toastMsg = { text: msg, action }
  toastListeners.forEach((l) => l())
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg = null
    toastListeners.forEach((l) => l())
  }, action ? 5000 : 3200)
}

export function Toaster() {
  const msg = useSyncExternalStore(
    (l) => {
      toastListeners.add(l)
      return () => toastListeners.delete(l)
    },
    () => toastMsg,
  )
  // The last message stays in place while it fades, so a toast leaves as smoothly as it came.
  const last = useRef(msg)
  if (msg) last.current = msg
  const shown = msg ?? last.current
  return (
    <div className="toast-region" aria-live="polite">
      <div className={`toast ${msg ? 'on' : ''} ${shown?.action ? 'has-action' : ''}`} aria-hidden={!msg}>
        {shown?.text}
        {shown?.action && (
          <button type="button" className="toast-action" tabIndex={msg ? 0 : -1} onClick={() => {
            shown.action!.run()
            clearTimeout(toastTimer)
            toastMsg = null
            toastListeners.forEach((l) => l())
          }}>{shown.action.label}</button>
        )}
      </div>
    </div>
  )
}
