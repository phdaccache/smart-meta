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

/** A month to pick a day from, opened in place as in iPhone's Reminders. Weeks start on Monday, as everywhere in the app. */
export function InlineCalendar(props: { value: DateStr; min?: DateStr; today: DateStr; onPick: (d: DateStr) => void }) {
  const [month, setMonth] = useState(firstOfMonth(props.value))
  useEffect(() => setMonth(firstOfMonth(props.value)), [props.value])
  const lead = isoWeekday(month) - 1
  const days: DateStr[] = []
  for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) days.push(d)
  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-title">{capitalize(monthName(month))} {month.slice(0, 4)}</span>
        <button type="button" className="icon-btn" aria-label={t('qa.prevMonth')} onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={!!props.min && shiftMonth(month, -1) < firstOfMonth(props.min)}>
          <IconChevronLeft width={20} height={20} />
        </button>
        <button type="button" className="icon-btn" aria-label={t('qa.nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))}>
          <IconChevronRight width={20} height={20} />
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {[1, 2, 3, 4, 5, 6, 7].map((w) => <span key={w} className="cal-wd">{weekdayShort(w)}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {days.map((d) => (
          <button type="button" key={d} disabled={!!props.min && d < props.min} aria-pressed={d === props.value}
            className={`cal-day ${d === props.value ? 'on' : ''} ${d === props.today ? 'today' : ''}`} onClick={() => props.onPick(d)}>
            {Number(d.slice(8, 10))}
          </button>
        ))}
      </div>
    </div>
  )
}

const ITEM = 36
const pad = (n: number) => String(n).padStart(2, '0')

/** One column of the wheel: scrolls and snaps, and the row in the middle is the choice. */
function Wheel(props: { count: number; value: number; label: string; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const el = ref.current
    if (el && Math.round(el.scrollTop / ITEM) !== props.value) el.scrollTop = props.value * ITEM
  }, [props.value])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div ref={ref} className="wheel" role="listbox" aria-label={props.label} tabIndex={0}
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
          {pad(i)}
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
