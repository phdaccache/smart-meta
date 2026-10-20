import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { IconTrash } from './icons'

/** How far the row slides to show its bin: the button's width. */
const OPEN = 76
/** Moving further than this decides between a swipe and a scroll. */
const SLOP = 8

/** Only one row is swiped open at a time, as in the iPhone's lists: opening one closes the last. */
let closeOpen: (() => void) | null = null

/**
 * A row deleted the iPhone way: swipe it left to show a red bin at its end, then tap the bin.
 * A tap anywhere else, the row included, slides it back. The row is this element itself (it takes
 * `className`), so the list's own styles for its rows still apply.
 *
 * The bin sits just past the row's right edge and slides in with it, so the row's container clips
 * it while it shows (see `.swipeable` in the styles).
 */
export function SwipeToDelete(props: {
  className?: string
  style?: CSSProperties
  /** What the bin says to a screen reader, e.g. "Remove step 2". */
  label: string
  onDelete: () => void
  /** The last row of a list that can't be empty. */
  disabled?: boolean
  children: ReactNode
}) {
  const row = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [swiping, setSwiping] = useState(false)
  const [removing, setRemoving] = useState(false)
  const latest = useRef({ open, disabled: props.disabled })
  latest.current = { open, disabled: props.disabled }
  const closeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const el = row.current
    if (!el) return
    let start: { x: number; y: number; id: number; from: number } | null = null
    let dragging = false
    let offset = 0
    /** Until when a click is the end of a swipe or of closing, not a press of its own. */
    let suppressUntil = 0
    const suppressClick = () => { suppressUntil = performance.now() + 400 }

    const place = (x: number) => {
      offset = x
      el.style.transform = x ? `translateX(${x}px)` : ''
    }

    const onPointerDown = (e: PointerEvent) => {
      if (latest.current.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as HTMLElement).closest('.swipe-delete')) return
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, from: latest.current.open ? -OPEN : 0 }
      dragging = false
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!dragging) {
        // A row being reordered moves up and down, not sideways.
        if (el.closest('li.lifted, li.dropping')) { start = null; return }
        if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) { start = null; return }
        if (Math.abs(dx) <= SLOP) return
        dragging = true
        el.setPointerCapture(e.pointerId)
        setSwiping(true)
        if (closeOpen !== close) closeOpen?.()
        // As in Reminders, a swipe ends the typing in its row.
        if (el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      }
      // Past the bin it gives, like a rubber band; to the right it stops at rest.
      const x = start.from + dx
      place(x < -OPEN ? -OPEN + (x + OPEN) / 3 : Math.min(0, x))
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const moved = dragging
      const from = start.from
      start = null
      dragging = false
      if (!moved) return
      suppressClick()
      setSwiping(false)
      // Past halfway it opens; a short flick opens or closes it from where it started.
      const flick = Math.abs(offset - from) > 24
      const shut = from ? flick && offset > from : offset > -OPEN / 2
      setOpen(!shut)
      place(shut ? 0 : -OPEN)
    }
    const onPointerCancel = () => {
      if (!start) return
      start = null
      if (!dragging) return
      dragging = false
      setSwiping(false)
      place(latest.current.open ? -OPEN : 0)
    }
    // The tap that ends a swipe, or closes an open row, doesn't also press what's under the finger.
    const onClick = (e: MouseEvent) => {
      if (performance.now() > suppressUntil) return
      e.preventDefault()
      e.stopPropagation()
      suppressUntil = 0
    }

    const close = () => {
      if (closeOpen === close) closeOpen = null
      setOpen(false)
      place(0)
    }
    closeRef.current = close

    // While open, any press outside the bin closes it; one on the row itself does nothing else.
    const onDocDown = (e: PointerEvent) => {
      if (!latest.current.open || (e.target as HTMLElement).closest?.('.swipe-delete')) return
      if (el.contains(e.target as Node)) {
        suppressClick()
        start = null
      }
      close()
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    el.addEventListener('click', onClick, true)
    document.addEventListener('pointerdown', onDocDown, true)
    return () => {
      if (closeOpen === close) closeOpen = null
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      el.removeEventListener('click', onClick, true)
      document.removeEventListener('pointerdown', onDocDown, true)
    }
  }, [])

  useEffect(() => {
    if (open) closeOpen = closeRef.current
  }, [open])

  const remove = () => {
    const el = row.current
    if (!el || removing) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return props.onDelete()
    // The row fades and its place closes up, then it's gone.
    const fold = { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0' }
    el.style.height = `${el.offsetHeight}px`
    setRemoving(true)
    requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(el.style, fold)))
    setTimeout(() => {
      // A row reused for the next item (a list keyed by place) starts closed and whole.
      for (const k of [...Object.keys(fold), 'transform']) el.style.removeProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
      setRemoving(false)
      setOpen(false)
      props.onDelete()
    }, 240)
  }

  const state = removing ? 'removing' : swiping ? 'swiping' : open ? 'open' : ''
  return (
    <div ref={row} className={`${props.className ?? ''} swipeable ${state}`} style={props.style}>
      {props.children}
      {(open || swiping || removing) && (
        <button type="button" className="swipe-delete" aria-label={props.label} onClick={remove}>
          <IconTrash width={22} height={22} />
        </button>
      )}
    </div>
  )
}
