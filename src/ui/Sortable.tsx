import { useRef, useState, type ReactNode } from 'react'

/**
 * A vertical list reordered by dragging each row's grip. Pointer events cover
 * touch and mouse; arrow keys on the grip cover the keyboard.
 */
export function Sortable<T>(props: {
  items: T[]
  keyOf: (item: T) => string
  labelOf: (item: T) => string
  onReorder: (items: T[]) => void
  render: (item: T, grip: ReactNode) => ReactNode
  className?: string
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const drag = useRef<{ from: number; startY: number; mids: number[]; height: number } | null>(null)
  const [state, setState] = useState<{ from: number; to: number; dy: number } | null>(null)

  const move = (from: number, to: number) => {
    if (from === to) return
    const next = [...props.items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    props.onReorder(next)
  }

  const onDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rects = rows.current.map((r) => r!.getBoundingClientRect())
    drag.current = { from: i, startY: e.clientY, mids: rects.map((r) => r.top + r.height / 2), height: rects[i].height }
    setState({ from: i, to: i, dy: 0 })
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const center = d.mids[d.from] + dy
    let to = d.mids.filter((m, j) => j !== d.from && m < center).length
    to = Math.max(0, Math.min(props.items.length - 1, to))
    setState({ from: d.from, to, dy })
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d && state) move(d.from, state.to)
    setState(null)
  }

  const shift = (j: number): number => {
    if (!state || j === state.from || !drag.current) return 0
    const h = drag.current.height
    if (state.from < state.to && j > state.from && j <= state.to) return -h
    if (state.from > state.to && j < state.from && j >= state.to) return h
    return 0
  }

  return (
    <ul className={`sortable ${props.className ?? ''}`}>
      {props.items.map((item, i) => {
        const dragging = state?.from === i
        const grip = (
          <button type="button" className="grip" aria-label={`Reorder ${props.labelOf(item)}`}
            onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); move(i, i - 1) }
              if (e.key === 'ArrowDown' && i < props.items.length - 1) { e.preventDefault(); move(i, i + 1) }
            }}>
            <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true" fill="currentColor">
              {[3, 9, 15].flatMap((y) => [<circle key={`a${y}`} cx="4" cy={y} r="1.6" />, <circle key={`b${y}`} cx="10" cy={y} r="1.6" />])}
            </svg>
          </button>
        )
        return (
          <li key={props.keyOf(item)} ref={(el) => { rows.current[i] = el }}
            className={dragging ? 'dragging' : ''}
            style={{
              transform: `translateY(${dragging ? state!.dy : shift(i)}px)`,
              transition: dragging || !state ? 'none' : 'transform 0.15s ease',
            }}>
            {props.render(item, grip)}
          </li>
        )
      })}
    </ul>
  )
}
