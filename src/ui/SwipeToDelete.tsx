import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { t } from '../i18n'
import { toast } from './components'
import { haptic } from './haptics'
import { IconTrash } from './icons'

/** How far the row rests open: room for the bin and its label. */
const OPEN = 84
/** Moving further than this decides between a swipe and a scroll. */
const SLOP = 8
/** Dragged past this share of the row's width, letting go deletes it (Notes' full swipe). */
const FULL = 0.55

/** "Deleted." with an Undo, after any swipe delete: a full swipe is easy to make by mistake. */
export function deletedToast(undo: () => void) {
  toast(t('common.deleted'), { label: t('common.undo'), run: undo })
}

/** A list with `item` put back where it was. */
export const putBack = <T,>(list: T[], at: number, item: T) => [...list.slice(0, at), item, ...list.slice(at)]

/** Only one row is swiped open at a time, as in the iPhone's lists: opening one closes the last. */
let closeOpen: (() => void) | null = null

/** Where a flick would come to rest (Apple's projection, a quick deceleration). */
const project = (v: number) => (v / 1000) * 0.99 / (1 - 0.99)
/** Past an edge the row follows less and less, like a rubber band. */
const rubberband = (over: number, size: number) => (over * size * 0.55) / (size + 0.55 * Math.abs(over))

/**
 * A row deleted the way iOS Notes does it: swipe it left and it comes away from the list as a
 * rounded row, with a red bin and "Delete" beside it; tap the bin, or swipe all the way across.
 * A tap anywhere else, the row included, slides it back. The row is this element itself (it takes
 * `className`), so the list's own styles for its rows still apply.
 *
 * The row follows the finger 1:1 and, once it has started sideways, keeps going even if the finger
 * drifts down. On release it springs to open or closed from where it is and as fast as the finger
 * was moving, and it can be caught again mid-way. Its state is kept in `data-swipe`, written straight
 * to the element: React re-rendering on every frame of a drag drops frames on a phone.
 */
export function SwipeToDelete(props: {
  className?: string
  style?: CSSProperties
  /** What the bin says to a screen reader, e.g. "Remove step 2". */
  label: string
  onDelete: () => void
  /** Asked before the row goes (a value goals still use); false sends it back. */
  confirm?: () => boolean
  /** The last row of a list that can't be empty. */
  disabled?: boolean
  /** Another verb than Delete, on a grey pill: the sync banner's Hide. */
  verb?: { label: string; icon: ReactNode }
  /**
   * A second action left of Delete, as Notes has more than one: the row then opens wider and a swipe all the
   * way across no longer deletes (with two choices, which one would it be?).
   */
  extra?: { label: string; icon: ReactNode; run: () => void }
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  const removeRef = useRef<() => void>(() => {})
  const extraRef = useRef<() => void>(() => {})

  useEffect(() => {
    const el = row.current
    if (!el) return
    let start: { x: number; y: number; id: number; from: number; wasOpen: boolean } | null = null
    let dragging = false
    let open = false
    let armed = false
    let removing = false
    let x = 0
    let width = 1
    let frame = 0
    /** The last few positions, for the finger's speed when it lets go. */
    let trail: { x: number; t: number }[] = []
    /** Until when a click is the end of a swipe or of closing, not a press of its own. */
    let suppressUntil = 0
    const suppressClick = () => { suppressUntil = performance.now() + 400 }

    /** How far the row rests open: one action's room, or two. */
    const openAt = () => (latest.current.extra ? OPEN * 2 : OPEN)

    const place = (nx: number) => {
      x = nx
      const reveal = Math.max(0, -nx)
      el.style.transform = nx ? `translateX(${nx}px)` : ''
      el.style.setProperty('--reveal', `${reveal}px`)
      // The row rounds off as it comes away, and the bin grows in as it's uncovered.
      el.style.setProperty('--swipe-r', `${Math.min(14, reveal / 4)}px`)
      el.style.setProperty('--bin', `${Math.min(1, reveal / openAt())}`)
      if (nx) el.dataset.swipe = removing ? 'removing' : 'on'
      else if (!dragging && !removing) delete el.dataset.swipe
    }

    const arm = (on: boolean) => {
      if (on === armed) return
      armed = on
      if (on) el.dataset.armed = ''
      else delete el.dataset.armed
      haptic()
    }

    /** A spring from where the row is, at the speed it's moving (Apple's damping and response). */
    const springTo = (target: number, velocity: number, damping = 1, response = 0.35, done?: () => void) => {
      cancelAnimationFrame(frame)
      const w = (2 * Math.PI) / response
      let v = velocity
      let last = performance.now()
      const step = (now: number) => {
        let dt = Math.min(0.064, (now - last) / 1000)
        last = now
        while (dt > 0) {
          const h = Math.min(dt, 1 / 240)
          v += (-w * w * (x - target) - 2 * damping * w * v) * h
          x += v * h
          dt -= h
        }
        if (Math.abs(x - target) < 0.4 && Math.abs(v) < 4) {
          place(target)
          return done?.()
        }
        place(x)
        frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }

    const close = () => {
      if (closeOpen === close) closeOpen = null
      open = false
      springTo(0, 0)
    }

    /** `tapped`: from the bin itself, so it's quicker than a swipe let go, and the haptic was the tap. */
    const remove = (velocity = 0, tapped = false) => {
      if (removing) return
      if (latest.current.confirm && !latest.current.confirm()) {
        arm(false)
        return close()
      }
      removing = true
      if (closeOpen === close) closeOpen = null
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return latest.current.onDelete()
      width = el.offsetWidth || width
      if (tapped) {
        el.dataset.quick = ''
        armed = true
        el.dataset.armed = ''
      } else if (!armed) arm(true)
      el.dataset.swipe = 'removing'
      // The row goes off to the left with the red behind it, then its place closes up.
      springTo(-width, Math.min(velocity, 0), 1, tapped ? 0.2 : 0.3, () => {
        el.style.height = `${el.offsetHeight}px`
        requestAnimationFrame(() => {
          Object.assign(el.style, { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0' })
        })
        setTimeout(() => {
          // A row reused for the next item (a list keyed by place) starts closed and whole.
          for (const k of ['height', 'min-height', 'padding-top', 'padding-bottom', 'opacity']) el.style.removeProperty(k)
          removing = false
          open = false
          armed = false
          delete el.dataset.armed
          delete el.dataset.quick
          place(0)
          delete el.dataset.swipe
          latest.current.onDelete()
        }, 260)
      })
    }
    removeRef.current = () => remove(0, true)
    extraRef.current = () => {
      close()
      latest.current.extra?.run()
    }

    const onPointerDown = (e: PointerEvent) => {
      if (latest.current.disabled || removing || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as HTMLElement).closest('.swipe-actions')) return
      // Caught mid-way, it carries on from where it is.
      cancelAnimationFrame(frame)
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, from: x, wasOpen: open || x !== 0 }
      width = el.offsetWidth || 1
      trail = [{ x, t: e.timeStamp }]
      dragging = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!dragging) {
        // A row being reordered moves up and down, not sideways.
        if (el.closest('li.lifted, li.dropping')) { start = null; return }
        if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
          start = null
          if (x) close()
          return
        }
        if (Math.abs(dx) <= SLOP) return
        dragging = true
        el.setPointerCapture(e.pointerId)
        el.dataset.swipe = 'on'
        if (closeOpen && closeOpen !== close) closeOpen()
        // As in Reminders, a swipe ends the typing in its row.
        if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      }
      // From here only the sideways part counts: a finger drifting down keeps swiping.
      let nx = start.from + dx
      const furthest = latest.current.extra ? openAt() : width
      if (nx > 0) nx = rubberband(nx, width)
      else if (nx < -furthest) nx = -furthest - rubberband(-furthest - nx, width)
      place(nx)
      arm(!latest.current.extra && -nx > width * FULL)
      trail.push({ x: nx, t: e.timeStamp })
      if (trail.length > 6) trail.shift()
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const s = start
      start = null
      if (!dragging) {
        // A tap on an open row only closes it.
        if (s.wasOpen) {
          suppressClick()
          close()
        }
        return
      }
      dragging = false
      suppressClick()
      const first = trail.find((p) => e.timeStamp - p.t < 100) ?? trail[0]
      const lastP = trail[trail.length - 1]
      const v = lastP.t > first.t ? ((lastP.x - first.x) / (lastP.t - first.t)) * 1000 : 0
      if (armed) return remove(v)
      // Where the flick is heading decides, not just where it was let go.
      const opening = x + project(v) < -openAt() / 2
      open = opening
      if (opening) closeOpen = close
      else if (closeOpen === close) closeOpen = null
      // A thrown row overshoots a little; one just let go settles.
      springTo(opening ? -openAt() : 0, v, Math.abs(v) > 300 ? 0.82 : 1)
    }
    const onPointerCancel = () => {
      if (!start) return
      start = null
      if (!dragging) return
      dragging = false
      arm(false)
      springTo(open ? -openAt() : 0, 0)
    }
    // Once the row is moving sideways, the page doesn't scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (!start || !e.cancelable) return
      const tch = e.touches[0]
      if (dragging || Math.abs(tch.clientX - start.x) > Math.abs(tch.clientY - start.y) + 2) e.preventDefault()
    }
    // The tap that ends a swipe, or closes an open row, doesn't also press what's under the finger.
    const onClick = (e: MouseEvent) => {
      if (performance.now() > suppressUntil) return
      e.preventDefault()
      e.stopPropagation()
      suppressUntil = 0
    }
    // While open, a press anywhere outside the row closes it.
    const onDocDown = (e: PointerEvent) => {
      if (!open || removing || el.contains(e.target as Node)) return
      close()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', onDocDown, true)
    return () => {
      cancelAnimationFrame(frame)
      if (closeOpen === close) closeOpen = null
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('click', onClick, true)
      document.removeEventListener('pointerdown', onDocDown, true)
    }
  }, [])

  return (
    <div ref={row} className={`${props.className ?? ''} swipeable`} style={props.style}>
      {props.children}
      {props.extra ? (
        <div className="swipe-actions two">
          <div className="swipe-act">
            <button type="button" className="swipe-delete extra" aria-label={props.extra.label} tabIndex={-1} onClick={() => extraRef.current()}>
              {props.extra.icon}
            </button>
            <span className="swipe-label" aria-hidden="true">{props.extra.label}</span>
          </div>
          <div className="swipe-act">
            <button type="button" className="swipe-delete" aria-label={props.label} tabIndex={-1} onClick={() => removeRef.current()}>
              <IconTrash width={20} height={20} />
            </button>
            <span className="swipe-label" aria-hidden="true">{t('common.delete')}</span>
          </div>
        </div>
      ) : (
        <div className="swipe-actions">
          <button type="button" className={`swipe-delete ${props.verb ? 'grey' : ''}`} aria-label={props.label} tabIndex={-1}
            onClick={() => removeRef.current()}>
            {props.verb?.icon ?? <IconTrash width={20} height={20} />}
          </button>
          <span className="swipe-label" aria-hidden="true">{props.verb?.label ?? t('common.delete')}</span>
        </div>
      )}
    </div>
  )
}
