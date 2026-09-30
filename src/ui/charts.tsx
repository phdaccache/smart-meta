// Small hand-drawn charts for Insights. Plain SVG and CSS: no chart library.
// Tap (or drag across) a chart to read its values in the line above it.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { dayMonth, diffDays, monthName, periodOf } from '../lib/dates'
import { reasonLabel } from '../lib/describe'
import type {
  Burnup, GoalCount, Marker, NearMiss, Obstacles, Timeline, ToleranceRow, ValueBalance, WeekPoint, WeekdayPattern,
} from '../lib/insights'
import { statusFor } from '../lib/scoring'
import type { DateStr, Goal, Status } from '../lib/types'
import { navigate } from './router'

const statusClass = (s: Status | null) => (s ? `st-${s.replace(' ', '-')}` : 'st-none')
const shortMonth = (d: DateStr) => monthName(d).slice(0, 3)
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** While something is selected, a tap anywhere outside `ref` clears it. */
export function useTapOutside(ref: RefObject<HTMLElement | null>, active: boolean, clear: () => void) {
  const latest = useRef(clear)
  latest.current = clear
  useEffect(() => {
    if (!active) return
    const onDown = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) latest.current()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [active, ref])
}

/** The line above a chart that says what's under your finger. Fixed height, so nothing jumps. */
export function Readout({ children, hint }: { children?: ReactNode; hint?: string }) {
  return <div className="readout" aria-live="polite">{children ?? <span className="readout-hint">{hint}</span>}</div>
}

export function StatusDot({ status }: { status: Status | null }) {
  return <i className={`dot ${statusClass(status)}`} aria-hidden="true" />
}

/** Index of the week a date falls in, or -1. */
const weekIndex = (points: WeekPoint[], date: DateStr) => points.findIndex((p) => p.start === periodOf(date, 'week').start)

/** Runs of consecutive non-null points, so gaps (paused weeks) stay gaps. */
function runs(points: WeekPoint[]): { i: number; pct: number }[][] {
  const out: { i: number; pct: number }[][] = []
  let cur: { i: number; pct: number }[] = []
  points.forEach((p, i) => {
    if (p.pct == null) {
      if (cur.length) out.push(cur)
      cur = []
    } else {
      cur.push({ i, pct: p.pct })
    }
  })
  if (cur.length) out.push(cur)
  return out
}

// ——— goal trends ———

/** A goal's weekly result in one line, with its tolerance dashed and plan changes as ticks. */
export function Sparkline({ points, tolerance, markers }: { points: WeekPoint[]; tolerance: number; markers: Marker[] }) {
  const W = 100
  const H = 32
  const x = (i: number) => (points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W)
  const y = (pct: number) => 3 + (1 - pct / 100) * (H - 6)
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={W} y1={y(tolerance)} y2={y(tolerance)} className="spark-tol" vectorEffect="non-scaling-stroke" />
      {markers.map((m, k) => {
        const i = weekIndex(points, m.date)
        return i < 0 ? null : <line key={k} x1={x(i)} x2={x(i)} y1={0} y2={H} className="spark-marker" vectorEffect="non-scaling-stroke" />
      })}
      {runs(points).map((r, k) => (
        <polyline key={k} points={r.map((p) => `${x(p.i)},${y(p.pct)}`).join(' ')} className="spark-line" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/** The goal page chart: weekly dots coloured by status, tolerance, numbered plan changes. Tap or drag to read a week. */
export function TrendChart({ points, tolerance, markers }: { points: WeekPoint[]; tolerance: number; markers: Marker[] }) {
  const W = 320
  const H = 176
  const L = 34
  const R = 10
  const T = 30
  const B = 22
  const svg = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const valued = points.map((p, i) => (p.pct == null ? -1 : i)).filter((i) => i >= 0)
  const [sel, setSel] = useState<number | null>(null)
  useTapOutside(wrap, sel != null, () => setSel(null))
  const idx = sel ?? valued.at(-1) ?? -1
  const x = (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i / (points.length - 1)) * (W - L - R))
  const y = (pct: number) => T + (1 - pct / 100) * (H - T - B)
  const monthTicks = points
    .map((p, i) => ({ i, month: p.start.slice(0, 7) }))
    .filter((p, k, all) => k === 0 || p.month !== all[k - 1].month)
  const every = Math.ceil(monthTicks.length / 6)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * W
    let best = -1
    for (const i of valued) if (best < 0 || Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i
    if (best >= 0) setSel(best)
  }
  const key = (e: KeyboardEvent) => {
    const at = valued.indexOf(idx)
    if (e.key === 'ArrowLeft' && at > 0) setSel(valued[at - 1])
    if (e.key === 'ArrowRight' && at < valued.length - 1) setSel(valued[at + 1])
  }
  const p = points[idx]
  const here = markers.map((m, k) => ({ m, n: k + 1 })).filter(({ m }) => p && periodOf(m.date, 'week').start === p.start)
  const st = p?.pct != null ? statusFor(p.pct, tolerance) : null

  return (
    <div className="trend-wrap" ref={wrap}>
      <Readout hint="Tap the chart to read a week">
        {p && p.pct != null && (
          <>
            <span className="readout-main">Week of {dayMonth(p.start)}</span>
            <span className="readout-value"><StatusDot status={st} />{Math.round(p.pct)}%</span>
            {here.map(({ m, n }) => <span key={n} className="readout-note"><b className="marker-badge small">{n}</b>{m.text}</span>)}
          </>
        )}
      </Readout>
      <svg ref={svg} className="trend" viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} onKeyDown={key}
        aria-label="Weekly percentage. Use the arrow keys to move between weeks."
        onPointerDown={pick} onPointerMove={(e) => e.buttons && pick(e)}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 8} y={y(v) + 3.5} textAnchor="end" className="axis">{v}%</text>
          </g>
        ))}
        {monthTicks.map((m, k) => k % every === 0 && (
          <text key={m.month} x={x(m.i)} y={H - 4} textAnchor={m.i === 0 ? 'start' : 'middle'} className="axis">{shortMonth(`${m.month}-01`)}</text>
        ))}
        <line x1={L} x2={W - R} y1={y(tolerance)} y2={y(tolerance)} className="tol" />
        {markers.map((m, k) => {
          const i = weekIndex(points, m.date)
          if (i < 0) return null
          return (
            <g key={k}>
              <line x1={x(i)} x2={x(i)} y1={T - 8} y2={H - B} className="marker" />
              <circle cx={x(i)} cy={11} r={8.5} className="marker-dot" />
              <text x={x(i)} y={14.5} textAnchor="middle" className="marker-num">{k + 1}</text>
            </g>
          )
        })}
        {idx >= 0 && <line x1={x(idx)} x2={x(idx)} y1={T - 4} y2={H - B} className="crosshair" />}
        {runs(points).map((r, k) => (
          <polyline key={k} points={r.map((q) => `${x(q.i)},${y(q.pct)}`).join(' ')} className="line" />
        ))}
        {points.map((q, i) => q.pct != null && (
          <circle key={i} cx={x(i)} cy={y(q.pct)} r={i === idx ? 5.5 : 4} className={`pt ${statusClass(statusFor(q.pct, tolerance))}`} />
        ))}
      </svg>
      <div className="legend">
        <span><i className="key-line" />week</span>
        <span><i className="key-dash" />tolerance {tolerance}%</span>
        <span><StatusDot status="on track" />on track</span>
        <span><StatusDot status="behind" />behind</span>
        <span><StatusDot status="at risk" />at risk</span>
        {markers.length > 0 && <span><b className="marker-badge small">1</b>plan change</span>}
      </div>
    </div>
  )
}

/** Every goal's tolerance (tick) against what was actually done (dot). Tap a goal for its numbers. */
export function ToleranceChart({ rows }: { rows: ToleranceRow[] }) {
  const [sel, setSel] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, sel != null, () => setSel(null))
  const r = rows.find((x) => x.goal.id === sel)
  return (
    <div ref={ref}>
      <Readout hint="Tap a goal to see its numbers">
        {r && (
          <>
            <span className="readout-main">{r.goal.title}</span>
            <span className="readout-value">
              tolerance {r.tolerance}% · <StatusDot status={statusFor(r.actual, r.tolerance)} />actual {Math.round(r.actual)}%
            </span>
          </>
        )}
      </Readout>
      <div className="tol-rows">
        {rows.map((x) => (
          <button key={x.goal.id} className={`tol-row ${sel === x.goal.id ? 'on' : ''}`} aria-pressed={sel === x.goal.id}
            onClick={() => setSel(sel === x.goal.id ? null : x.goal.id)}>
            <span className="tol-name">{x.goal.title}</span>
            <ToleranceTrack tolerance={x.tolerance} actual={x.actual} />
          </button>
        ))}
      </div>
      <div className="legend">
        <span><i className="key-tick" />tolerance</span>
        <span><i className="dot st-on-track" />actual</span>
      </div>
    </div>
  )
}

/** A 0–100 track with the tolerance as a tick and the actual as a dot. */
export function ToleranceTrack({ tolerance, actual }: { tolerance: number; actual: number }) {
  return (
    <span className="tol-track" role="img" aria-label={`Tolerance ${tolerance}%, actual ${Math.round(actual)}%`}>
      <i className="tol-tick" style={{ left: `${tolerance}%` }} />
      <i className={`tol-dot ${statusClass(statusFor(actual, tolerance))}`} style={{ left: `${Math.min(100, actual)}%` }} />
    </span>
  )
}

// ——— patterns ———

const goalList = (goals: GoalCount[]) => goals.map((g) => `${g.goal.title} ×${g.count}`).join(' · ')
const SHORT_REASON: Record<string, string> = { chose_other: 'Something else' }

/** Miss reasons as bars; under "something else", what was chosen instead. Tap a row for the goals it hit. */
export function ReasonBars({ o }: { o: Obstacles }) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, open != null, () => setOpen(null))
  const max = Math.max(1, ...o.reasons.map((r) => r.count))
  const row = (id: string, label: string, count: number, goals: GoalCount[], sub = false) => (
    <div key={id} className={`rb ${sub ? 'rb-sub' : ''} ${open === id ? 'open' : ''}`}>
      <button className="rb-row" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
        <span className="rb-label">{label}</span>
        <span className="rb-track"><i style={{ width: `${(100 * count) / max}%` }} /></span>
        <span className="rb-count">{count}</span>
      </button>
      {open === id && <div className="rb-detail">{goalList(goals)}</div>}
    </div>
  )
  return (
    <div className="rbars" ref={ref}>
      {o.reasons.map((r) => (
        <div key={r.reason} className="rb-group">
          {row(r.reason, SHORT_REASON[r.reason] ?? reasonLabel(r.reason), r.count, r.goals)}
          {r.reason === 'chose_other' && o.displacements.length > 0 && (
            <div className="rb-subs">
              {o.displacements.map((d) => row(`d:${d.label}`, d.label, d.count, d.goals, true))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Rows of commitments, columns of weekdays, shaded by how often it was missed. Tap a square. */
export function WeekdayGrid({ rows }: { rows: WeekdayPattern[] }) {
  const [sel, setSel] = useState<{ r: number; d: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, sel != null, () => setSel(null))
  const cur = sel && rows[sel.r]?.days[sel.d]
  return (
    <div ref={ref}>
      <Readout hint="Tap a square to see the numbers">
        {sel && cur && (
          <>
            <span className="readout-main">{rows[sel.r].commitment.label} · {WEEKDAYS[sel.d]}s</span>
            <span className="readout-value">
              {cur.judged ? `missed ${cur.judged - cur.kept} of ${cur.judged}` : 'nothing to judge'}
            </span>
          </>
        )}
      </Readout>
      <div className="wd-grid" role="grid" aria-label="Misses by weekday">
        <div className="wd-row wd-head" role="row">
          <span role="columnheader" />
          {WEEKDAYS.map((d) => <span key={d} role="columnheader" aria-label={d}>{d[0]}</span>)}
        </div>
        {rows.map((r, ri) => (
          <div key={r.commitment.id} className="wd-row" role="row">
            <span className="wd-label" role="rowheader">{r.commitment.label}</span>
            {r.days.map((d, i) => {
              const rate = d.judged ? (d.judged - d.kept) / d.judged : 0
              const on = sel?.r === ri && sel.d === i
              return (
                <button key={i} role="gridcell" className={`wd-cell ${d.judged ? '' : 'wd-none'} ${on ? 'on' : ''}`}
                  aria-label={`${r.commitment.label}, ${WEEKDAYS[i]}: missed ${d.judged - d.kept} of ${d.judged}`}
                  onClick={() => setSel(on ? null : { r: ri, d: i })}
                  style={{ '--miss': `${Math.round(6 + rate * 84)}%` } as CSSProperties} />
              )
            })}
          </div>
        ))}
      </div>
      <div className="legend wd-legend">
        <span>never missed</span><i className="wd-scale" /><span>always</span>
        <span className="wd-none-key"><i />nothing to judge</span>
      </div>
    </div>
  )
}

/** How logged values fall around the target: kept to one side, missed to the other. Tap a column. */
export function Distribution({ n, format, noun }: { n: NearMiss; format: (v: number) => string; noun: string }) {
  const [sel, setSel] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, sel != null, () => setSel(null))
  const bins = n.bins
  const max = Math.max(1, ...bins.map((b) => b.count))
  let divider = bins.findIndex((b) => Math.abs(b.from - n.target) < 1e-9)
  if (divider < 0) divider = n.target <= bins[0].from ? 0 : bins.length
  const b = sel != null ? bins[sel] : null
  const label = (at: number) => `${(100 * at) / bins.length}%`
  return (
    <div className="dist" ref={ref}>
      <Readout hint="Tap a column to see the numbers">
        {b && (
          <>
            <span className="readout-main">{format(b.from)} to {format(b.to)}</span>
            <span className="readout-value"><i className={`dot ${b.hit ? 'st-on-track' : 'st-at-risk'}`} />{b.count} {noun}{b.count === 1 ? '' : 's'}</span>
          </>
        )}
      </Readout>
      <div className="dist-plot">
        {bins.map((bin, i) => (
          <button key={i} className={`dist-col ${sel === i ? 'on' : ''}`} onClick={() => setSel(sel === i ? null : i)}
            aria-label={`${format(bin.from)} to ${format(bin.to)}: ${bin.count} ${noun}s, ${bin.hit ? 'kept' : 'missed'}`}>
            <i className={bin.hit ? 'kept' : 'missed'} style={{ height: bin.count ? `${Math.max(4, (100 * bin.count) / max)}%` : 0 }} />
          </button>
        ))}
        <i className="dist-target" style={{ left: label(divider) }} />
      </div>
      <div className="dist-axis">
        {/* The ends are labelled only where the target's label leaves room. */}
        {divider > 1 && <span style={{ left: 0 }}>{format(bins[0].from)}</span>}
        <span className={`dist-target-label ${divider === 0 ? 'at-start' : divider === bins.length ? 'at-end' : ''}`}
          style={{ left: label(divider) }}>{format(n.target)}</span>
        {divider < bins.length - 1 && <span style={{ right: 0 }}>{format(bins.at(-1)!.to)}</span>}
      </div>
      <div className="legend">
        <span><i className="dot st-on-track" />kept</span>
        <span><i className="dot st-at-risk" />missed</span>
        <span><i className="key-dash upright" />target</span>
      </div>
    </div>
  )
}

// ——— big picture ———

/** Six value colours in a fixed order; past six, the rest share a grey. */
export const valueSlot = (i: number, id?: string) => (id === '' ? 'vc-none' : i < 6 ? `vc-${i}` : 'vc-other')

/** Weeks on track per month, stacked by value. Tap a month. */
export function ValueMonths({ b }: { b: ValueBalance }) {
  const [sel, setSel] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, sel != null, () => setSel(null))
  const sums = b.months.map((m) => m.counts.reduce((a, c) => a + c, 0))
  const max = Math.max(1, ...sums)
  const m = sel != null ? b.months[sel] : null
  return (
    <div className="vm" ref={ref}>
      <Readout hint="Tap a month to see it by value">
        {m && (
          <>
            <span className="readout-main">{monthName(m.month)}</span>
            <span className="readout-value">
              {sums[sel!] === 0 ? 'no weeks on track' : b.values.map((v, i) => m.counts[i] ? `${v.name} ${m.counts[i]}` : '').filter(Boolean).join(' · ')}
            </span>
          </>
        )}
      </Readout>
      <div className="vm-cols">
        {b.months.map((mo, mi) => (
          <button key={mo.month} className={`vm-col ${sel === mi ? 'on' : ''}`} onClick={() => setSel(sel === mi ? null : mi)}
            aria-label={`${monthName(mo.month)}: ${b.values.map((v, i) => `${v.name} ${mo.counts[i]}`).join(', ')}`}>
            <span className="vm-bar">
              <span className="vm-stack" style={{ height: `${(100 * sums[mi]) / max}%` }}>
                {mo.counts.map((c, i) => c > 0 && <i key={i} className={valueSlot(i, b.values[i].id)} style={{ flexGrow: c }} />)}
              </span>
            </span>
            <span className="vm-label">{shortMonth(mo.month)}</span>
          </button>
        ))}
      </div>
      <div className="legend">
        {b.values.map((v, i) => (
          <span key={v.id} className={b.totals[i] ? '' : 'faded'}><i className={`key-box ${valueSlot(i, v.id)}`} />{v.name} <b>{b.totals[i]}</b></span>
        ))}
      </div>
    </div>
  )
}

const END_TEXT: Record<string, string> = { completed: 'Completed', abandoned: 'Abandoned', backlog: 'Paused' }
const END_MARK: Record<string, string> = { completed: '✓', abandoned: '✕', backlog: '‖' }

/** Every goal that ran in the last year, by start. The mark at the end says how it ended; tap a row for its dates. */
export function TimelineChart({ t }: { t: Timeline }) {
  const [sel, setSel] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useTapOutside(ref, sel != null, () => setSel(null))
  const total = Math.max(1, diffDays(t.from, t.to) + 1)
  const at = (d: DateStr) => (100 * Math.max(0, diffDays(t.from, d))) / total
  const every = t.months.length > 7 ? 2 : 1

  return (
    <div className="tl" ref={ref}>
      <div className="tl-body">
        <div className="tl-grid" aria-hidden="true">
          {t.months.map((m, i) => (
            <span key={m} style={{ left: `${at(m)}%` }}>{i % every === 0 ? shortMonth(m) : ''}</span>
          ))}
        </div>
        {t.rows.map(({ life, ticks }) => {
          const last = life.segments.at(-1)!
          const end = life.ended
          const on = sel === life.goal.id
          const status = end
            ? `${END_TEXT[end.state] ?? end.state} ${dayMonth(end.date)}`
            : last.state === 'maintenance' ? `habit since ${dayMonth(last.start)}` : 'still running'
          const tone = end ? `tl-${end.state}` : last.state === 'maintenance' ? 'tl-habit' : ''
          return (
            <div key={life.goal.id} className={`tl-row ${on ? 'on' : ''}`}>
              <button className="tl-hit" aria-expanded={on} onClick={() => setSel(on ? null : life.goal.id)}>
                <span className="tl-title">{life.goal.title}</span>
                <span className={`tl-track ${end ? 'tl-past' : ''}`}>
                  {life.segments.filter((s) => s.end >= t.from).map((s, i) => {
                    const from = s.start < t.from ? t.from : s.start
                    return <i key={i} className={`tl-seg tl-${s.state}`} style={{ left: `${at(from)}%`, width: `${Math.max(0.8, at(s.end) - at(from))}%` }} />
                  })}
                  {ticks.map((d, i) => <i key={`t${i}`} className="tl-tick" style={{ left: `${at(d)}%` }} />)}
                  {end && <b className={`tl-end tl-${end.state}`} style={{ left: `${at(last.end)}%` }}>{END_MARK[end.state]}</b>}
                </span>
              </button>
              {on && (
                <div className="tl-detail">
                  <span>Started {dayMonth(life.segments[0].start)} · <span className={`tl-status ${tone}`}>{status}</span></span>
                  <button className="link-btn" onClick={() => navigate(`/insights/goals/${life.goal.id}`)}>Open</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="key-box tl-active" />active</span>
        <span><i className="key-box tl-maintenance" />habit (maintenance)</span>
        <span><b className="tl-end tl-completed inline">✓</b>completed</span>
        <span><b className="tl-end tl-abandoned inline">✕</b>abandoned</span>
        <span><i className="tl-tick inline" />plan change</span>
      </div>
    </div>
  )
}

const PACE: Record<Burnup['status'], string> = {
  done: 'Done', all_done: 'Steps done', not_started: 'Not started', on_pace: 'On pace', behind: 'Behind', overdue: 'Overdue',
}

/** A project's steps done against the time gone: when the steps bar trails the time bar, it's behind. */
export function ProjectPace({ b }: { b: Burnup }) {
  const steps = b.total ? b.done.length / b.total : 0
  const time = Math.min(1, Math.max(0, b.timeUsed))
  return (
    <button className="list-row pace-row" onClick={() => navigate(`/projects/${b.project.id}`)}>
      <div className="text">
        <div className="pace-head">
          <span className="title">{b.project.title}</span>
          <span className={`pill pace-${b.status}`}>{PACE[b.status]}</span>
        </div>
        {b.status !== 'done' && (
          <div className="pace-bars">
            <span className="pace-label">Steps</span>
            <span className="pace-track"><i className="pace-steps" style={{ width: `${100 * steps}%` }} /></span>
            <span className="pace-value">{b.done.length} of {b.total}</span>
            <span className="pace-label">Time</span>
            <span className="pace-track"><i className="pace-time" style={{ width: `${100 * time}%` }} /></span>
            <span className="pace-value">{b.timeUsed > 1 ? 'past due' : `${Math.round(100 * time)}%`}</span>
          </div>
        )}
        <div className="sub">{b.text}</div>
      </div>
    </button>
  )
}

/** Goals as small tappable names. */
export function GoalChips({ goals }: { goals: Goal[] }) {
  return (
    <div className="goal-chips">
      {goals.map((g) => <button key={g.id} className="goal-chip" onClick={() => navigate(`/insights/goals/${g.id}`)}>{g.title}</button>)}
    </div>
  )
}
