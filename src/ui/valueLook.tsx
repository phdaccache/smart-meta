import type { CSSProperties } from 'react'
import { setValueLook } from '../db/repo'
import { t, tk, type Key } from '../i18n'
import type { Value } from '../lib/types'
import { Sheet } from './components'
import { IconCheck } from './icons'

/**
 * Each value's icon and color: a glyph on a tile of its color, shown on goal
 * cards, Today's group heads and Review. Icons are 24×24, filled unless `line`.
 */
type Glyph = { d: string; line?: boolean }

export const VALUE_ICONS: Record<string, Glyph> = {
  star: { d: 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z' },
  heart: { d: 'M12 20.5s-7.6-4.5-9.4-9.4C1.3 7.5 3.6 4 7 4c2.1 0 3.6 1.1 5 2.9C13.4 5.1 14.9 4 17 4c3.4 0 5.7 3.5 4.4 7.1-1.8 4.9-9.4 9.4-9.4 9.4z' },
  moon: { d: 'M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3z' },
  briefcase: { d: 'M9.5 3.5h5A1.5 1.5 0 0 1 16 5v1.5h4A1.5 1.5 0 0 1 21.5 8v4.2h-19V8A1.5 1.5 0 0 1 4 6.5h4V5a1.5 1.5 0 0 1 1.5-1.5zm0 1.8v1.2h5V5.3zM2.5 13.7h8v.8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-.8h8V19a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19z' },
  book: { d: 'M11 5.6C9.1 4.4 6.5 4 3.4 4.2a.9.9 0 0 0-.9.9v12.7a.9.9 0 0 0 1 .9c2.9-.2 5.3.2 7.5 1.5zM13 5.6c1.9-1.2 4.5-1.6 7.6-1.4a.9.9 0 0 1 .9.9v12.7a.9.9 0 0 1-1 .9c-2.9-.2-5.3.2-7.5 1.5z' },
  dumbbell: { d: 'M2 10.2a1 1 0 0 1 1-1h1v5.6H3a1 1 0 0 1-1-1zM5 7.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zM9.5 11h5v2h-5zM15.5 7.5a1 1 0 0 1 1-1H18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1zM20 9.2h1a1 1 0 0 1 1 1v3.6a1 1 0 0 1-1 1h-1z' },
  bolt: { d: 'M13.6 2.2 4.3 13.4h6.4l-1.3 8.4 9.3-11.2h-6.4z' },
  leaf: { d: 'M20.5 3.5C9.4 3.6 4 9 4 15.6c0 1.5.3 2.8.9 4l1.7-1.6c1.6-4.7 5-7.6 9.4-9.2-3.9 2.3-6.8 5.5-8.4 10 1.2.6 2.6.9 4.2.9 6.7 0 8.7-7.3 8.7-16.2z' },
  people: { d: 'M9 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM1.8 19.2c0-3.4 3.2-6 7.2-6s7.2 2.6 7.2 6v.8H1.8zM17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17.8 13.1c2.6.4 4.4 2.5 4.4 5.1V20h-4.4v-.8c0-2.4-1-4.5-2.8-5.8.9-.3 1.8-.4 2.8-.3z' },
  person: { d: 'M12 11.6a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.9 3.6-6.6 8-6.6s8 2.7 8 6.6v.6H4z' },
  house: { d: 'M12 2.8 2.3 11h2.6v9.2h5.3v-6h3.6v6h5.3V11h2.6z' },
  money: { d: 'M3.5 5h17A1.5 1.5 0 0 1 22 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5v-11A1.5 1.5 0 0 1 3.5 5zM12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z' },
  bulb: { d: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 19.4h6v1.1a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20.5z' },
  music: { d: 'M20 2.8v12.7a3 3 0 1 1-2-2.8V7.3l-8 1.8v8.4a3 3 0 1 1-2-2.8V5.5z' },
  palette: { d: 'M12 2.5C6.8 2.5 2.5 6.6 2.5 11.7c0 5.1 4 9.3 9 9.3 1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.2c3 0 5.5-2.5 5.5-5.6 0-4.5-4.3-8.2-9.5-8.2zM7.2 12.8a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zm3.3-4.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zm5 0a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z' },
  code: { d: 'm8.5 6.5-5.5 5.5 5.5 5.5M15.5 6.5l5.5 5.5-5.5 5.5', line: true },
  globe: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.2 12h17.6M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9s1.2-6.4 3.6-9z', line: true },
  plane: { d: 'M21.5 15.6v-2l-8-5V3.8a1.5 1.5 0 0 0-3 0v4.8l-8 5v2l8-2.5v4.6L8 19.6v1.8l4-1.1 4 1.1v-1.8l-2.5-1.9v-4.6z' },
  sun: { d: 'M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7', line: true },
  cup: { d: 'M4 8.5h12v5.5a4.5 4.5 0 0 1-4.5 4.5h-3A4.5 4.5 0 0 1 4 14zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M7.5 2.8v2.6M10 2.8v2.6M12.5 2.8v2.6', line: true },
  flame: { d: 'M12 22c4.4 0 7.5-3 7.5-7.2 0-3.8-2.5-6.3-4.3-8.6-.3 1.8-1.2 3-2.4 3.6.3-3.3-1.2-6.3-3.8-7.8.2 3.2-1.5 5.4-3.2 7.4-1.2 1.8-1.3 3.6-1.3 5.4C4.5 19 7.6 22 12 22z' },
  target: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z', line: true },
  mountain: { d: 'M1.8 20 9 7.6l4.1 7 2.6-3.7L22.2 20z' },
  cap: { d: 'M12 3.2 1 8.6l11 5.5 9-4.5v6.2h2V8.6zM5.4 12.4v3.8c0 1.9 3 3.5 6.6 3.5s6.6-1.6 6.6-3.5v-3.8L12 15.7z' },
  chat: { d: 'M12 3.5c-5.2 0-9.5 3.5-9.5 7.8 0 2.4 1.3 4.5 3.4 5.9-.2 1.5-.9 2.9-2 3.8 2.2 0 4.1-.8 5.5-2 .8.2 1.7.3 2.6.3 5.2 0 9.5-3.5 9.5-7.9S17.2 3.5 12 3.5z' },
  pencil: { d: 'M15.6 3.4a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L9.1 19.9l-5.6 1.1 1.1-5.6z' },
  camera: { d: 'M8.6 4h6.8l1.6 2.5h3A1.5 1.5 0 0 1 21.5 8v10.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 4 6.5h3zM12 16.6a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z' },
  smile: { d: 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM9 10.9a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zm6 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6zM7.8 13.4h8.4a4.2 4.2 0 0 1-8.4 0z' },
  sparkles: { d: 'M10 3.5l1.9 5.6 5.6 1.9-5.6 1.9L10 18.5l-1.9-5.6L2.5 11l5.6-1.9zM18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z' },
  drop: { d: 'M12 2.5S5 10 5 14.6a7 7 0 0 0 14 0C19 10 12 2.5 12 2.5z' },
}

const FOLDER: Glyph = { d: 'M2.5 6.5A1.5 1.5 0 0 1 4 5h5.2l2 2.4H20A1.5 1.5 0 0 1 21.5 9v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5z' }

/** Apple's system colors, defined per theme in styles.css as --c-<name>. */
export const VALUE_COLORS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'indigo', 'yellow', 'mint', 'brown', 'gray'] as const
export type ValueColor = (typeof VALUE_COLORS)[number]

export const DEFAULT_ICON = 'star'

/**
 * A value's icon and color. Without a color picked, it takes one from its place
 * in the list, in the order Insights always used, so charts keep their colors.
 */
export function valueLook(value: Value | undefined, values: Value[]): { icon: string; color: string } {
  if (!value) return { icon: DEFAULT_ICON, color: 'gray' }
  const icon = value.icon && VALUE_ICONS[value.icon] ? value.icon : DEFAULT_ICON
  if (value.color && (VALUE_COLORS as readonly string[]).includes(value.color)) return { icon, color: value.color }
  const i = values.findIndex((v) => v.id === value.id)
  return { icon, color: i < 0 ? 'gray' : VALUE_COLORS[i % VALUE_COLORS.length] }
}

/** For charts: the CSS color of the value at this index ('' id: no value, greyed). */
export function valueFill(values: Value[], i: number): string {
  const v = values[i]
  if (!v || v.id === '') return 'var(--line-strong)'
  return `var(--c-${valueLook(v, values).color})`
}

export function Glyph({ g, size }: { g: Glyph; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={g.line ? 'none' : 'currentColor'} fillRule="evenodd"
      stroke={g.line ? 'currentColor' : 'none'} strokeWidth={g.line ? 2.2 : 0} strokeLinecap="round" strokeLinejoin="round">
      <path d={g.d} />
    </svg>
  )
}

type TileSize = 'sm' | 'md' | 'lg'
const GLYPH: Record<TileSize, number> = { sm: 15, md: 22, lg: 34 }

/** The colored tile. With `onClick` it's a button (a goal card's icon opens the picker). */
export function Tile(props: { icon: string; color: string; size?: TileSize; label?: string; onClick?: () => void; folder?: boolean }) {
  const size = props.size ?? 'md'
  const style = { '--c': `var(--c-${props.color})` } as CSSProperties
  const glyph = <Glyph g={props.folder ? FOLDER : VALUE_ICONS[props.icon] ?? VALUE_ICONS[DEFAULT_ICON]} size={GLYPH[size]} />
  if (props.onClick) {
    return <button type="button" className={`tile tile-${size}`} style={style} aria-label={props.label} onClick={props.onClick}>{glyph}</button>
  }
  return <span className={`tile tile-${size}`} style={style}>{glyph}</span>
}

export function ValueTile(props: { value: Value | undefined; values: Value[]; size?: TileSize; onPick?: (v: Value) => void }) {
  const look = valueLook(props.value, props.values)
  const v = props.value
  return (
    <Tile {...look} size={props.size}
      label={v ? t('look.change', { name: v.name }) : undefined}
      onClick={v && props.onPick ? () => props.onPick!(v) : undefined} />
  )
}

export const ProjectTile = ({ size }: { size?: TileSize }) => <Tile icon="" color="project" folder size={size} />

/** Pick a value's icon and color. Each tap saves at once, like iOS settings. */
export function ValueLookSheet({ value, values, onClose }: { value: Value | null; values: Value[]; onClose: () => void }) {
  // Keep showing the latest saved look while the sheet is open.
  const live = value ? values.find((v) => v.id === value.id) ?? value : null
  if (!live) return null
  const look = valueLook(live, values)
  const save = (p: { icon?: string; color?: string }) => setValueLook(live, { icon: look.icon, color: look.color, ...p })
  return (
    <Sheet open onClose={onClose} title={live.name}>
      <div className="look-preview"><Tile {...look} size="lg" /></div>
      <div className="look-colors" role="radiogroup" aria-label={t('look.color')}>
        {VALUE_COLORS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={look.color === c} aria-label={tk(`look.c.${c}` as Key)}
            className={`swatch ${look.color === c ? 'on' : ''}`} style={{ '--c': `var(--c-${c})` } as CSSProperties}
            onClick={() => save({ color: c })}>
            {look.color === c && <IconCheck width={16} height={16} />}
          </button>
        ))}
      </div>
      <div className="look-icons" role="radiogroup" aria-label={t('look.icon')}>
        {Object.entries(VALUE_ICONS).map(([k, g]) => (
          <button key={k} type="button" role="radio" aria-checked={look.icon === k} aria-label={tk(`look.i.${k}` as Key)}
            className={`look-icon ${look.icon === k ? 'on' : ''}`} style={{ '--c': `var(--c-${look.color})` } as CSSProperties}
            onClick={() => save({ icon: k })}>
            <Glyph g={g} size={22} />
          </button>
        ))}
      </div>
      <p className="settings-note" style={{ margin: '14px 4px 0' }}>{t('look.shared')}</p>
    </Sheet>
  )
}
