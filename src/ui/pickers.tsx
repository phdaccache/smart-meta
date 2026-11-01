import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { addDays, capitalize, isoWeekday, monthName, toDateStr, weekdayShort } from '../lib/dates'
import type { DateStr } from '../lib/types'
import { IconChevronLeft, IconChevronRight } from './icons'

const firstOfMonth = (s: DateStr) => `${s.slice(0, 7)}-01`
function shiftMonth(first: DateStr, n: number): DateStr {
  const d = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + n, 1)
  return toDateStr(d)
}

/** Slides the month in from the side it was asked for, as iPhone's calendar does; with less motion, it only fades. */
function slideMonth(grid: HTMLElement | null, dir: number) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  grid?.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${dir * 8}%)` }, { opacity: 1, transform: 'none' }],
    { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
}

/**
 * A month to pick a day from, opened in place as in iPhone's Reminders. Weeks start on Monday, as everywhere in the app.
 * Days before `min` or after `max` are greyed out. With no `value` yet, it opens on today's month (or the nearest one allowed).
 */
export function InlineCalendar(props: { value: DateStr | ''; min?: DateStr; max?: DateStr; today: DateStr; onPick: (d: DateStr) => void }) {
  const { min, max } = props
  const start = props.value || (max && props.today > max ? max : min && props.today < min ? min : props.today)
  const [month, setMonth] = useState(firstOfMonth(start))
  useEffect(() => setMonth(firstOfMonth(start)), [start])
  const grid = useRef<HTMLDivElement>(null)
  // Tapping the month and year swaps the days for wheels of months and years, as iPhone's calendar does.
  const [wheels, setWheels] = useState(false)
  const canBack = !min || shiftMonth(month, -1) >= firstOfMonth(min)
  const canOn = !max || shiftMonth(month, 1) <= max
  const step = (n: number) => {
    if (n < 0 ? !canBack : !canOn) return
    setMonth(shiftMonth(month, n))
    slideMonth(grid.current, n)
  }
  // A sideways swipe turns the month, too.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const lead = isoWeekday(month) - 1
  const days: DateStr[] = []
  for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) days.push(d)
  return (
    <div className="cal"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const from = touch.current
        touch.current = null
        if (!from) return
        const dx = e.changedTouches[0].clientX - from.x
        const dy = e.changedTouches[0].clientY - from.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
      }}>
      <div className="cal-head">
        <button type="button" className={`cal-title ${wheels ? 'on' : ''}`} aria-expanded={wheels} onClick={() => setWheels(!wheels)}>
          {capitalize(monthName(month))} {month.slice(0, 4)}
          <IconChevronRight className="cal-title-chev" width={15} height={15} />
        </button>
        {!wheels && <>
          <button type="button" className="icon-btn" aria-label={t('qa.prevMonth')} onClick={() => step(-1)} disabled={!canBack}>
            <IconChevronLeft width={20} height={20} />
          </button>
          <button type="button" className="icon-btn" aria-label={t('qa.nextMonth')} onClick={() => step(1)} disabled={!canOn}>
            <IconChevronRight width={20} height={20} />
          </button>
        </>}
      </div>
      {wheels ? <MonthYearWheels month={month} min={min} max={max} today={props.today} onChange={setMonth} /> : (
      <div className="cal-grid" role="grid" ref={grid}>
        {[1, 2, 3, 4, 5, 6, 7].map((w) => <span key={w} className="cal-wd">{weekdayShort(w)}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {days.map((d) => (
          <button type="button" key={d} disabled={(!!min && d < min) || (!!max && d > max)} aria-pressed={d === props.value}
            className={`cal-day ${d === props.value ? 'on' : ''} ${d === props.today ? 'today' : ''}`} onClick={() => props.onPick(d)}>
            {Number(d.slice(8, 10))}
          </button>
        ))}
      </div>
      )}
    </div>
  )
}

/** A month and a year on two wheels, kept within `min` and `max`; years run 30 either side of today's without them. */
function MonthYearWheels(props: { month: DateStr; min?: DateStr; max?: DateStr; today: DateStr; onChange: (first: DateStr) => void }) {
  const now = Number(props.today.slice(0, 4))
  const from = props.min ? Number(props.min.slice(0, 4)) : now - 30
  const to = props.max ? Number(props.max.slice(0, 4)) : now + 30
  const y = Number(props.month.slice(0, 4))
  const m = Number(props.month.slice(5, 7)) - 1
  const pick = (year: number, mon: number) => {
    let first = `${year}-${pad(mon + 1)}-01`
    if (props.min && first < firstOfMonth(props.min)) first = firstOfMonth(props.min)
    if (props.max && first > props.max) first = firstOfMonth(props.max)
    props.onChange(first)
  }
  return (
    <div className="wheels cal-wheels">
      <Wheel count={12} value={m} label={t('qa.months')} className="wide" format={(i) => capitalize(monthName(`2000-${pad(i + 1)}-01`))}
        onChange={(i) => pick(y, i)} />
      <Wheel count={to - from + 1} value={y - from} label={t('qa.years')} format={(i) => String(from + i)} onChange={(i) => pick(from + i, m)} />
    </div>
  )
}

const ITEM = 36
const pad = (n: number) => String(n).padStart(2, '0')

/** One column of the wheel: scrolls and snaps, and the row in the middle is the choice. */
export function Wheel(props: { count: number; value: number; label: string; onChange: (n: number) => void; format?: (i: number) => string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const el = ref.current
    if (el && Math.round(el.scrollTop / ITEM) !== props.value) el.scrollTop = props.value * ITEM
  }, [props.value])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div ref={ref} className={`wheel ${props.className ?? ''}`} role="listbox" aria-label={props.label} tabIndex={0}
      onScroll={() => {
        // Waits for the flick to settle before choosing.
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          const el = ref.current
          if (!el) return
          const n = Math.max(0, Math.min(props.count - 1, Math.round(el.scrollTop / ITEM)))
          if (n !== props.value) props.onChange(n)
        }, 120)
      }}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
        if (!step) return
        e.preventDefault()
        props.onChange(Math.max(0, Math.min(props.count - 1, props.value + step)))
      }}>
      {Array.from({ length: props.count }, (_, i) => (
        <div key={i} role="option" aria-selected={i === props.value} className={`wheel-item ${i === props.value ? 'on' : ''}`}
          onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}>
          {props.format ? props.format(i) : pad(i)}
        </div>
      ))}
    </div>
  )
}

/** Hours and minutes on two wheels, like the iPhone's clock. `value` is "HH:MM". */
export function TimeWheel(props: { value: string; onChange: (hhmm: string) => void }) {
  const h = Number(props.value.slice(0, 2)) || 0
  const m = Number(props.value.slice(3, 5)) || 0
  return (
    <div className="wheels">
      <Wheel count={24} value={h} label={t('qa.hours')} onChange={(n) => props.onChange(`${pad(n)}:${pad(m)}`)} />
      <span className="wheels-colon">:</span>
      <Wheel count={60} value={m} label={t('qa.minutes')} onChange={(n) => props.onChange(`${pad(h)}:${pad(n)}`)} />
    </div>
  )
}
