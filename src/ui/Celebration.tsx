import { useEffect, useRef, useSyncExternalStore } from 'react'
import { t, tn } from '../i18n'
import { dayMonth, diffDays } from '../lib/dates'
import type { DateStr, Goal, Value } from '../lib/types'
import { haptic } from './haptics'
import { valueLook } from './valueLook'

/**
 * The moment a goal is hit or closed out (spec NO-7; option A of the S6 mockups, with more motion, owner
 * 2026-11-01): a ring in the goal's value color closes, a tick, then the words. In the app only, no push.
 */

interface Moment {
  title: string; color: string; ended: boolean; since: string
  closing?: boolean
}

const RING_R = 60
/** When the ring closes (src/styles.css, .cele-arc): the phone taps as it does. */
const CLOSES_MS = 1000
const LEAVE_MS = 220
const SPARKS = 12

let moment: Moment | null = null
const listeners = new Set<() => void>()
const set = (m: Moment | null) => {
  moment = m
  listeners.forEach((l) => l())
}

export function celebrate(goal: Goal, values: Value[], today: DateStr, ended: boolean) {
  const value = values.find((v) => v.id === goal.whyValueId)
  const weeks = Math.floor(diffDays(goal.startDate, today) / 7)
  const date = dayMonth(goal.startDate)
  set({
    title: goal.title, ended, color: `var(--c-${valueLook(value, values).color})`,
    since: weeks > 0 ? tn('celebrate.since', weeks, { date }) : t('celebrate.sinceNow', { date }),
  })
}

/** Developer: to see it again without closing a goal. */
export const celebrateSample = () => set({ title: 'Run a 10k', ended: true, color: 'var(--c-pink)', since: tn('celebrate.since', 34, { date: '2 March' }) })

export function Celebration() {
  const m = useSyncExternalStore((l) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }, () => moment)
  const done = useRef<HTMLButtonElement>(null)
  const open = !!m
  useEffect(() => {
    if (!open) return
    done.current?.focus({ preventScroll: true })
    // Two quick taps as it closes, as the iPhone marks a success.
    const first = setTimeout(haptic, CLOSES_MS)
    const second = setTimeout(haptic, CLOSES_MS + 110)
    return () => {
      clearTimeout(first)
      clearTimeout(second)
    }
  }, [open])
  if (!m) return null
  const leave = () => {
    set({ ...m, closing: true })
    setTimeout(() => set(null), LEAVE_MS)
  }
  return (
    <div className={`cele ${m.closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cele-title" style={{ '--c': m.color } as React.CSSProperties}>
      <div className="cele-middle">
        <div className="cele-ring">
          <span className="cele-glow" />
          {Array.from({ length: SPARKS }, (_, i) => (
            <span key={i} className="cele-spark" style={{ '--a': `${(i * 360) / SPARKS}deg`, '--far': i % 2 ? '104px' : '92px', animationDelay: `${CLOSES_MS - 30 + (i % 3) * 25}ms` } as React.CSSProperties} />
          ))}
          <svg viewBox="0 0 148 148" aria-hidden="true">
            <circle className="cele-track" cx="74" cy="74" r={RING_R} />
            <circle className="cele-arc" cx="74" cy="74" r={RING_R} />
            <path className="cele-tick" d="M52 76 L67 91 L97 59" />
          </svg>
        </div>
        <div className="cele-words">
          <div className="cele-kicker">{t(m.ended ? 'celebrate.completed' : 'celebrate.hit')}</div>
          <h2 id="cele-title">{m.title}</h2>
          <div className="cele-since">{m.since}</div>
        </div>
      </div>
      <button ref={done} className="btn primary block cele-done" onClick={leave}>{t('common.doneEditing')}</button>
    </div>
  )
}
