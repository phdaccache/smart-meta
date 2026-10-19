import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from './haptics'

const HOLD_MS = 450
/** Moving further than this before the hold completes is a scroll, not a drag. */
const SLOP = 8
const EDGE = 90

type Drag = {
  from: number
  /** Page coordinates, so the list can scroll under the finger. */
  startY: number
  y: number
  tops: number[]
  bottoms: number[]
  /** How far each other row moves to make room: the held row's height plus the gap. */
  pitch: number
}

type View = { from: number; to: number; dy: number; phase: 'lifted' | 'dropping' }

/**
 * A vertical list reordered the iPhone way: press and hold anywhere on a row
 * until it lifts, then drag it. A tap still opens the row, a quick swipe still
 * scrolls. Alt + arrow keys move the focused row for the keyboard.
 */
export function Sortable<T>(props: {
  items: T[]
  keyOf: (item: T) => string
  labelOf: (item: T) => string
  onReorder: (items: T[]) => void
  render: (item: T) => ReactNode
  className?: string
}) {
  const list = useRef<HTMLUListElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const drag = useRef<Drag | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [held, setHeld] = useState<number | null>(null)
  const [settling, setSettling] = useState(false)
  const latest = useRef(props)
  latest.current = props

  const move = (from: number, to: number) => {
    if (from === to) return
    const next = [...latest.current.items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    latest.current.onReorder(next)
  }

  useEffect(() => {
    const ul = list.current
    if (!ul) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let holdTimer: ReturnType<typeof setTimeout> | undefined
    let start: { x: number; y: number; i: number } | null = null
    let suppressClick = false
    let frame = 0
    let lastClientY = 0

    const targetIndex = (dy: number, d: Drag) => {
      const n = d.tops.length
      const mid = (d.tops[d.from] + d.bottoms[d.from]) / 2 + dy
      let to = d.from
      while (to < n - 1 && mid > (d.tops[to + 1] + d.bottoms[to + 1]) / 2) to++
      while (to > 0 && mid < (d.tops[to - 1] + d.bottoms[to - 1]) / 2) to--
      return to
    }

    const update = () => {
      const d = drag.current
      if (!d) return
      const dy = d.y - d.startY
      setView({ from: d.from, to: targetIndex(dy, d), dy, phase: 'lifted' })
    }

    // Near the top or bottom of the screen the page scrolls on its own, carrying the row.
    const autoscroll = () => {
      const d = drag.current
      if (!d) return
      const h = window.innerHeight
      const step = lastClientY < EDGE ? -Math.ceil((EDGE - lastClientY) / 6)
        : lastClientY > h - EDGE - 60 ? Math.ceil((lastClientY - (h - EDGE - 60)) / 6) : 0
      if (step) {
        const before = window.scrollY
        window.scrollBy(0, step)
        d.y += window.scrollY - before
        update()
      }
      frame = requestAnimationFrame(autoscroll)
    }

    const lift = () => {
      if (!start) return
      const els = rows.current.slice(0, latest.current.items.length)
      const rects = els.map((r) => r!.getBoundingClientRect())
      const sy = window.scrollY
      const i = start.i
      const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0
      drag.current = {
        from: i, startY: start.y + sy, y: start.y + sy,
        tops: rects.map((r) => r.top + sy), bottoms: rects.map((r) => r.bottom + sy),
        pitch: rects[i].height + gap,
      }
      lastClientY = start.y
      setHeld(null)
      haptic()
      update()
      frame = requestAnimationFrame(autoscroll)
    }

    const cancelHold = () => {
      clearTimeout(timer)
      clearTimeout(holdTimer)
      start = null
      setHeld(null)
    }

    const begin = (x: number, y: number, target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el || el.closest('input, textarea, select, [contenteditable]')) return false
      const li = el.closest('li')
      const i = rows.current.indexOf(li as HTMLLIElement)
      if (i < 0 || latest.current.items.length < 2) return false
      start = { x, y, i }
      holdTimer = setTimeout(() => setHeld(i), 150)
      timer = setTimeout(lift, HOLD_MS)
      return true
    }

    const track = (x: number, y: number): boolean => {
      if (drag.current) {
        lastClientY = y
        drag.current.y = y + window.scrollY
        update()
        return true
      }
      if (start && Math.hypot(x - start.x, y - start.y) > SLOP) cancelHold()
      return false
    }

    const end = () => {
      cancelAnimationFrame(frame)
      const d = drag.current
      cancelHold()
      if (!d) return
      drag.current = null
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 400)
      const to = targetIndex(d.y - d.startY, d)
      // Glide into the slot, then reorder underneath without a visible jump.
      const land = to > d.from ? d.bottoms[to] - d.bottoms[d.from] : to < d.from ? d.tops[to] - d.tops[d.from] : 0
      setView({ from: d.from, to, dy: land, phase: 'dropping' })
      haptic()
      setTimeout(() => {
        setSettling(true)
        setView(null)
        move(d.from, to)
        requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)))
      }, 280)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return cancelHold()
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target)
    }
    // Not passive: once a row is lifted, the finger moves the row instead of the page.
    const onTouchMove = (e: TouchEvent) => {
      if (track(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return
      begin(e.clientX, e.clientY, e.target)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') track(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') end()
    }
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick = false
      }
    }
    const onContextMenu = (e: Event) => {
      if (start || drag.current) e.preventDefault()
    }

    ul.addEventListener('touchstart', onTouchStart, { passive: true })
    ul.addEventListener('touchmove', onTouchMove, { passive: false })
    ul.addEventListener('touchend', end)
    ul.addEventListener('touchcancel', end)
    ul.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    ul.addEventListener('click', onClick, true)
    ul.addEventListener('contextmenu', onContextMenu)
    return () => {
      clearTimeout(timer)
      clearTimeout(holdTimer)
      cancelAnimationFrame(frame)
      ul.removeEventListener('touchstart', onTouchStart)
      ul.removeEventListener('touchmove', onTouchMove)
      ul.removeEventListener('touchend', end)
      ul.removeEventListener('touchcancel', end)
      ul.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      ul.removeEventListener('click', onClick, true)
      ul.removeEventListener('contextmenu', onContextMenu)
    }
  }, [])

  const shift = (j: number): number => {
    if (!view || j === view.from) return 0
    const pitch = drag.current?.pitch ?? (rows.current[view.from]?.offsetHeight ?? 0)
    if (view.from < view.to && j > view.from && j <= view.to) return -pitch
    if (view.from > view.to && j < view.from && j >= view.to) return pitch
    return 0
  }

  return (
    <ul ref={list} className={`sortable ${view ? 'lifting' : ''} ${props.className ?? ''}`}>
      {props.items.map((item, i) => {
        const mine = view?.from === i
        return (
          <li key={props.keyOf(item)} ref={(el) => { rows.current[i] = el }}
            className={mine ? view!.phase : held === i ? 'held' : ''}
            aria-grabbed={mine || undefined}
            style={{
              transform: mine ? `translateY(${view!.dy}px)` : shift(i) ? `translateY(${shift(i)}px)` : undefined,
              transition: settling ? 'none' : undefined,
            }}
            onKeyDown={(e) => {
              if (!e.altKey) return
              if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); move(i, i - 1) }
              if (e.key === 'ArrowDown' && i < props.items.length - 1) { e.preventDefault(); move(i, i + 1) }
            }}>
            {props.render(item)}
          </li>
        )
      })}
    </ul>
  )
}
