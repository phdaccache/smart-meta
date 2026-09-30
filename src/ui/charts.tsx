// Small hand-drawn charts for Insights. Plain SVG and CSS: no chart library.
import type { CSSProperties } from 'react'
import { dayMonth, diffDays, monthName, periodOf } from '../lib/dates'
import type { Burnup, Marker, NearMiss, Timeline, ValueBalance, WeekPoint, WeekdayPattern } from '../lib/insights'
import { statusFor } from '../lib/scoring'
import type { DateStr, Status } from '../lib/types'

const statusClass = (s: Status | null) => (s ? `st-${s.replace(' ', '-')}` : 'st-none')
const shortMonth = (d: DateStr) => monthName(d).slice(0, 3)

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

/** A goal's weekly percentage in one line, with its tolerance dashed and plan changes as ticks. */
export function Sparkline({ points, tolerance, markers }: { points: WeekPoint[]; tolerance: number; markers: Marker[] }) {
  const W = 100
  const H = 28
  const x = (i: number) => (points.length <= 1 ? W / 2 : (i / (points.length - 1)) * W)
  const y = (pct: number) => 2 + (1 - pct / 100) * (H - 4)
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

/** The goal page chart: weekly dots coloured by status, tolerance line, numbered plan changes. */
export function TrendChart({ points, tolerance, markers }: { points: WeekPoint[]; tolerance: number; markers: Marker[] }) {
  const W = 320
  const H = 170
  const L = 30
  const R = 10
  const T = 20
  const B = 20
  const x = (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i / (points.length - 1)) * (W - L - R))
  const y = (pct: number) => T + (1 - pct / 100) * (H - T - B)
  const monthTicks = points
    .map((p, i) => ({ i, month: p.start.slice(0, 7) }))
    .filter((p, k, all) => k === 0 || p.month !== all[k - 1].month)
  // Thin the labels when the chart spans many months.
  const every = monthTicks.length > 6 ? 2 : 1
  const summary = points.filter((p) => p.pct != null).map((p) => `${dayMonth(p.start)}: ${Math.round(p.pct!)}%`).join(', ')
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly percentage. ${summary}`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="axis">{v}%</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(tolerance)} y2={y(tolerance)} className="tol" />
      <text x={L + 4} y={y(tolerance) - 4} className="axis tol-label">tolerance {tolerance}%</text>
      {monthTicks.map((m, k) => k % every === 0 && (
        <text key={m.month} x={x(m.i)} y={H - 5} textAnchor={k === 0 ? 'start' : 'middle'} className="axis">{shortMonth(`${m.month}-01`)}</text>
      ))}
      {markers.map((m, k) => {
        const i = weekIndex(points, m.date)
        if (i < 0) return null
        return (
          <g key={k}>
            <line x1={x(i)} x2={x(i)} y1={T - 2} y2={H - B} className="marker" />
            <circle cx={x(i)} cy={T - 9} r={7.5} className="marker-dot" />
            <text x={x(i)} y={T - 5.5} textAnchor="middle" className="marker-num">{k + 1}</text>
          </g>
        )
      })}
      {runs(points).map((r, k) => (
        <polyline key={k} points={r.map((p) => `${x(p.i)},${y(p.pct)}`).join(' ')} className="line" />
      ))}
      {points.map((p, i) => p.pct != null && (
        <circle key={i} cx={x(i)} cy={y(p.pct)} r={3.2} className={`pt ${statusClass(statusFor(p.pct, tolerance))}`} />
      ))}
    </svg>
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

/** One labelled horizontal bar. */
export function HBar({ label, value, max, detail, tone }: { label: string; value: number; max: number; detail?: string; tone?: 'accent' | 'miss' | 'prep' | 'muted' }) {
  return (
    <div className="hbar">
      <span className="hbar-label">{label}</span>
      <span className="hbar-track"><i className={`hbar-fill tone-${tone ?? 'accent'}`} style={{ width: `${max ? (100 * value) / max : 0}%` }} /></span>
      <span className="hbar-value">{detail ?? value}</span>
    </div>
  )
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Rows of commitments, columns of weekdays: the darker, the more misses. */
export function WeekdayGrid({ rows }: { rows: WeekdayPattern[] }) {
  return (
    <div className="wd-grid" role="table" aria-label="Misses by weekday">
      <div className="wd-row wd-head" role="row">
        <span role="columnheader" />
        {WEEKDAY_LETTERS.map((d, i) => <span key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]}>{d}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.commitment.id} className="wd-row" role="row">
          <span className="wd-label" role="rowheader">{r.commitment.label}</span>
          {r.days.map((d, i) => {
            const missed = d.judged - d.kept
            const rate = d.judged ? missed / d.judged : 0
            return (
              <span key={i} role="cell" className={`wd-cell ${d.judged ? '' : 'wd-none'}`}
                title={`${WEEKDAY_NAMES[i]}: missed ${missed} of ${d.judged}`}
                aria-label={`${WEEKDAY_NAMES[i]}: missed ${missed} of ${d.judged}`}
                style={{ '--miss': `${Math.round(8 + rate * 82)}%` } as CSSProperties} />
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Hits and misses by value, with the target marked. */
export function Histogram({ n, format }: { n: NearMiss; format: (v: number) => string }) {
  const vals = n.values.map((v) => v.value)
  const lo = Math.min(...vals, n.target)
  const hi = Math.max(...vals, n.target)
  const step = n.kind === 'quantity' ? niceStep((hi - lo) / 7) : n.kind === 'late' ? 5 : 15
  const first = Math.floor(lo / step) * step
  const count = Math.max(1, Math.floor((hi - first) / step) + 1)
  const bins = Array.from({ length: count }, (_, i) => ({ from: first + i * step, hit: 0, miss: 0 }))
  for (const v of n.values) {
    const b = bins[Math.min(count - 1, Math.floor((v.value - first) / step + 1e-9))]
    if (v.hit) b.hit++
    else b.miss++
  }
  const max = Math.max(...bins.map((b) => b.hit + b.miss))
  const targetAt = ((n.target - first) / (count * step)) * 100
  return (
    <div className="histo" role="img" aria-label={`${n.values.length} values from ${format(lo)} to ${format(hi)}; target ${format(n.target)}`}>
      <div className="histo-bars">
        {bins.map((b, i) => (
          <span key={i} className="histo-col" title={`${format(b.from)}: ${b.hit + b.miss}`}>
            <i className="histo-miss" style={{ height: `${(100 * b.miss) / max}%` }} />
            <i className="histo-hit" style={{ height: `${(100 * b.hit) / max}%` }} />
          </span>
        ))}
        <i className="histo-target" style={{ left: `${targetAt}%` }} />
      </div>
      <div className="histo-axis">
        <span>{format(first)}</span>
        <span className="histo-target-label" style={{ left: `${targetAt}%` }}>{format(n.target)}</span>
        <span>{format(first + count * step)}</span>
      </div>
    </div>
  )
}

function niceStep(raw: number): number {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000]) if (s >= raw) return s
  return 1000
}

/** Each goal as bars across the last year: active, maintenance, and how it ended. */
export function TimelineChart({ t }: { t: Timeline }) {
  const total = Math.max(1, diffDays(t.from, t.to) + 1)
  const at = (d: DateStr) => `${(100 * Math.max(0, diffDays(t.from, d))) / total}%`
  const width = (a: DateStr, b: DateStr) => `${(100 * Math.max(1, diffDays(a, b) + 1)) / total}%`
  const END: Record<string, string> = { completed: 'completed', abandoned: 'abandoned', backlog: 'paused' }
  return (
    <div className="tl">
      <div className="tl-months" aria-hidden="true">
        {t.months.map((m, i) => (
          <span key={m} style={{ left: at(m) }}>{t.months.length > 7 && i % 2 ? '' : shortMonth(m)}</span>
        ))}
      </div>
      {t.rows.map(({ life, ticks }) => {
        const first = life.segments[0].start
        const last = life.segments.at(-1)!.end
        const ended = life.ended ? `${END[life.ended.state] ?? life.ended.state} ${dayMonth(life.ended.date)}` : 'running'
        return (
          <div key={life.goal.id} className="tl-row">
            <div className="tl-label">
              <span className="tl-title">{life.goal.title}</span>
              <span className="tl-end">{ended}</span>
            </div>
            <div className="tl-track" role="img" aria-label={`${life.goal.title}: from ${dayMonth(first)}, ${ended}`}>
              {life.segments.filter((s) => s.end >= t.from).map((s, i) => (
                <i key={i} className={`tl-seg tl-${s.state} ${life.ended?.state === 'abandoned' ? 'tl-dropped' : ''}`}
                  style={{ left: at(s.start < t.from ? t.from : s.start), width: width(s.start < t.from ? t.from : s.start, s.end) }} />
              ))}
              {ticks.map((d, i) => <i key={`t${i}`} className="tl-tick" style={{ left: at(d) }} />)}
              {life.ended?.state === 'completed' && <i className="tl-done" style={{ left: at(last) }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Steps done over time against the straight line to the target date. */
export function BurnupSpark({ b, today }: { b: Burnup; today: DateStr }) {
  const W = 100
  const H = 36
  const end = [b.project.targetDate, today, b.done.at(-1) ?? today].sort().at(-1)!
  const span = Math.max(1, diffDays(b.start, end))
  const x = (d: DateStr) => (diffDays(b.start, d) / span) * W
  const y = (n: number) => H - 2 - (n / Math.max(1, b.total)) * (H - 4)
  const stop = b.project.state === 'done' ? b.done.at(-1) ?? today : today
  const path: string[] = [`${x(b.start)},${y(0)}`]
  b.done.forEach((d, i) => path.push(`${x(d)},${y(i)}`, `${x(d)},${y(i + 1)}`))
  path.push(`${x(stop)},${y(b.done.length)}`)
  return (
    <svg className="burnup" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={x(b.start)} y1={y(0)} x2={x(b.project.targetDate)} y2={y(b.total)} className="burnup-ideal" vectorEffect="non-scaling-stroke" />
      <line x1={x(b.project.targetDate)} x2={x(b.project.targetDate)} y1={0} y2={H} className="burnup-target" vectorEffect="non-scaling-stroke" />
      <polyline points={path.join(' ')} className="burnup-line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Kept weeks per month, stacked by value. */
export function ValueMonths({ b }: { b: ValueBalance }) {
  const max = Math.max(1, ...b.months.map((m) => m.counts.reduce((a, c) => a + c, 0)))
  return (
    <div className="vm">
      <div className="vm-cols">
        {b.months.map((m) => {
          const sum = m.counts.reduce((a, c) => a + c, 0)
          return (
            <div key={m.month} className="vm-col">
              <span className="vm-stack" style={{ height: `${(100 * sum) / max}%` }}
                role="img" aria-label={`${monthName(m.month)}: ${b.values.map((v, i) => `${v.name} ${m.counts[i]}`).join(', ')}`}>
                {m.counts.map((c, i) => c > 0 && <i key={i} className={`vc-${i % 6}`} style={{ flexGrow: c }} />)}
              </span>
              <span className="vm-label">{shortMonth(m.month)}</span>
            </div>
          )
        })}
      </div>
      <div className="vm-legend">
        {b.values.map((v, i) => (
          <span key={v.id} className={b.totals[i] ? '' : 'none'}>
            <i className={`vc-${i % 6}`} />{v.name} <b>{b.totals[i]}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

