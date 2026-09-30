import { useMemo, useState } from 'react'
import { addDays, dayMonth, formatTime, monthName, weekdayShort } from '../lib/dates'
import { reasonLabel } from '../lib/describe'
import {
  burnups, goalsView, goalTrend, LOOKBACK_WEEKS, MIN_WEEKS, nearMiss, obstacles, patternsView, prepare, prepEffect, timeline,
  valueBalance, weekdayPattern, yearReview, type GoalTrend, type Marker, type NearMiss, type Obstacles, type PrepEffect,
  type Prepared, type PrepVerdict, type WeekdayPattern,
} from '../lib/insights'
import { statusFor, type ScoreContext } from '../lib/scoring'
import { InfoTip, Screen, Section, Segmented } from '../ui/components'
import { BurnupSpark, HBar, Histogram, Sparkline, TimelineChart, ToleranceTrack, TrendChart, ValueMonths, WeekdayGrid } from '../ui/charts'
import { useAllRevisions, useDisplacements, useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { IconChevronRight } from '../ui/icons'
import { navigate } from '../ui/router'

type View = 'goals' | 'patterns' | 'big'
const weekdayName = (iso: number) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][iso - 1]

function useStoredView(): [View, (v: View) => void] {
  const [v, setV] = useState<View>(() => {
    try {
      const s = localStorage.getItem('insights-view')
      return s === 'patterns' || s === 'big' ? s : 'goals'
    } catch {
      return 'goals'
    }
  })
  return [v, (next) => {
    setV(next)
    try {
      localStorage.setItem('insights-view', next)
    } catch {
      // private mode: just not remembered
    }
  }]
}

function usePrepared(): Prepared | null {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const revisions = useAllRevisions()
  const weekReviews = useWeekReviews()
  const displacements = useDisplacements()
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  return useMemo(
    () => (snap && revisions && weekReviews ? prepare({ snap, revisions, weekReviews, displacements, ctx }) : null),
    [snap, revisions, weekReviews, displacements, ctx],
  )
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`)
const pctClass = (n: number | null, tol: number) => `st-text-${(statusFor(n, tol) ?? 'none').replace(' ', '-')}`

export function InsightsScreen() {
  const p = usePrepared()
  const [view, setView] = useStoredView()
  if (!p) return null
  const title = (
    <span className="title-row">Insights
      <InfoTip label="About insights">
        What months of check-ins say: whether goals are working, what gets in the way, and where the effort goes.
        Review is for next week; this is for the long run.
      </InfoTip>
    </span>
  )
  return (
    <Screen title={title} settings>
      <Segmented label="Insights view" value={view} onChange={setView}
        options={[{ value: 'goals', label: 'Goals' }, { value: 'patterns', label: 'Patterns' }, { value: 'big', label: 'Big picture' }]} />
      {view === 'goals' && <GoalsTab p={p} />}
      {view === 'patterns' && <PatternsTab p={p} />}
      {view === 'big' && <BigPictureTab p={p} />}
    </Screen>
  )
}

// ——— Goals ———

function GoalsTab({ p }: { p: Prepared }) {
  const v = useMemo(() => goalsView(p), [p])
  if (v.trends.length === 0 && v.ended.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing to chart yet.</h2>
        <p className="muted">A goal’s charts appear after {MIN_WEEKS} weeks of check-ins.{v.tooNew.length ? ` Getting there: ${v.tooNew.map((g) => g.title).join(', ')}.` : ''}</p>
      </div>
    )
  }
  return (
    <>
      <Section title="Trends" aside={<span>weekly · last {Math.min(26, Math.max(...v.trends.map((t) => t.points.length), 0))} weeks</span>}>
        <div className="card list">
          {v.trends.map((t) => <TrendRow key={t.goal.id} t={t} />)}
        </div>
        {v.tooNew.length > 0 && (
          <p className="small muted note">Charts after {MIN_WEEKS} weeks of data: {v.tooNew.map((g) => g.title).join(', ')}.</p>
        )}
      </Section>

      {v.tolerance.rows.length > 0 && (
        <Section title={<span className="title-row">Tolerance vs actual
          <InfoTip label="About tolerance vs actual">
            The tick is each goal’s tolerance; the dot is what you actually did over the last {LOOKBACK_WEEKS} weeks.
            Far above means the bar may be too easy; far below, the goal may be too big for now.
          </InfoTip></span>}>
          <div className="card pad">
            <p className="takeaway">{v.tolerance.takeaway}</p>
            <div className="tol-rows">
              {v.tolerance.rows.map((r) => (
                <div key={r.goal.id} className="tol-row">
                  <span className="tol-name">{r.goal.title}</span>
                  <ToleranceTrack tolerance={r.tolerance} actual={r.actual} />
                  <span className={`tol-num ${pctClass(r.actual, r.tolerance)}`}>{pct(r.actual)}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {v.ended.length > 0 && (
        <Section title="Ended goals">
          <div className="card list">
            {v.ended.map((t) => {
              const end = p.lives.get(t.goal.id)!.ended
              const how = end ? { completed: 'Completed', abandoned: 'Abandoned', backlog: 'Paused' }[end.state as string] ?? end.state : ''
              return (
                <button key={t.goal.id} className="list-row" onClick={() => navigate(`/insights/goals/${t.goal.id}`)}>
                  <div className="text">
                    <div className="title" style={{ fontSize: 15 }}>{t.goal.title}</div>
                    <div className="sub">{how}{end ? ` ${dayMonth(end.date)}` : ''} · {pct(t.recent)} over its last weeks</div>
                  </div>
                  <IconChevronRight className="chev" width={18} />
                </button>
              )
            })}
          </div>
        </Section>
      )}
    </>
  )
}

function TrendRow({ t }: { t: GoalTrend }) {
  return (
    <button className="list-row trend-row" onClick={() => navigate(`/insights/goals/${t.goal.id}`)}>
      <div className="text">
        <div className="trend-head">
          <span className="title">{t.goal.title}</span>
          <span className={`trend-pct ${pctClass(t.recent, t.goal.tolerancePct)}`}>{pct(t.recent)}</span>
        </div>
        <Sparkline points={t.points} tolerance={t.goal.tolerancePct} markers={t.markers} />
        <div className="sub">{t.takeaway}</div>
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
}

// ——— Patterns ———

function PatternsTab({ p }: { p: Prepared }) {
  const data = useMemo(() => patternsView(p), [p])
  const from = data.from
  const nothing = data.obstacles.total === 0 && !data.preps.length && !data.weekdays.length && !data.nearMisses.length
  return (
    <>
      <p className="small muted note">Across all running goals, since {dayMonth(from)}.</p>
      {nothing && (
        <div className="empty">
          <h2>No patterns yet.</h2>
          <p className="muted">They show up as misses get reasons and preps get checked off.</p>
        </div>
      )}
      {data.obstacles.total > 0 && <ObstaclesSection o={data.obstacles} />}
      {data.preps.length > 0 && <PrepsSection effects={data.preps} />}
      {data.weekdays.length > 0 && <WeekdaysSection rows={data.weekdays} />}
      {data.nearMisses.length > 0 && <NearMissSection items={data.nearMisses} p={p} />}
    </>
  )
}

function ObstaclesSection({ o, title = 'What gets in the way' }: { o: Obstacles; title?: string }) {
  const max = o.reasons[0]?.count ?? 1
  return (
    <Section title={title} aside={<span>{o.total} explained misses</span>}>
      <div className="card pad">
        <p className="takeaway">{o.takeaway}</p>
        <div className="hbars">
          {o.reasons.map((r) => <HBar key={r.reason} label={reasonLabel(r.reason)} value={r.count} max={max} tone="miss" />)}
        </div>
        {o.displacements.length > 0 && (
          <>
            <div className="mini-head">Chose instead</div>
            <ul className="plain-list">
              {o.displacements.slice(0, 5).map((d) => (
                <li key={d.label}>
                  <b>{d.label}</b> ×{d.count}
                  <span className="muted"> · {d.goals.map((x) => `${x.goal.title}${d.goals.length > 1 ? ` ${x.count}` : ''}`).join(', ')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  )
}

const VERDICT: Record<PrepVerdict, string> = {
  works: 'Earns its place.',
  some: 'Helps a little.',
  no_difference: 'No clear difference: change it, or drop it?',
  always: 'Done almost every time, so there’s nothing to compare it with.',
  too_new: 'Too new to tell.',
}

function PrepsSection({ effects, title = 'Preps' }: { effects: PrepEffect[]; title?: string }) {
  return (
    <Section title={<span className="title-row">{title}
      <InfoTip label="About prep effect">
        How often the commitment went well after you did the prep, versus after you skipped it.
        An evening prep counts toward the next day.
      </InfoTip></span>}>
      <div className="card list">
        {effects.map((e) => (
          <div key={e.prep.id} className="list-row prep-effect">
            <div className="text">
              <div className="title" style={{ fontSize: 15 }}>{e.prep.title}</div>
              <div className="sub">for {e.commitment.label}</div>
              <div className="hbars" style={{ marginTop: 8 }}>
                <HBar label={`Done (${e.done.n})`} value={e.done.rate ?? 0} max={100} detail={pct(e.done.rate)} tone="prep" />
                {e.verdict !== 'always' && (
                  <HBar label={`Skipped (${e.skipped.n})`} value={e.skipped.rate ?? 0} max={100} detail={pct(e.skipped.rate)} tone="muted" />
                )}
              </div>
              <div className={`verdict verdict-${e.verdict}`}>{VERDICT[e.verdict]}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function WeekdaysSection({ rows }: { rows: WeekdayPattern[] }) {
  const notes = rows.filter((r) => r.slips.length)
  return (
    <Section title={<span className="title-row">Weekdays
      <InfoTip label="About weekdays">Daily commitments by weekday: the darker the square, the more often it was missed.</InfoTip></span>}>
      <div className="card pad">
        <p className="takeaway">
          {notes.length
            ? notes.map((r) => r.slips.length === 1
              ? `${r.commitment.label}: most misses on ${weekdayName(r.slips[0].weekday)}s (${r.slips[0].missed} of ${r.slips[0].judged}).`
              : `${r.commitment.label}: misses cluster on ${r.slips.map((d) => weekdayShort(d.weekday)).join(', ')}.`).join(' ')
            : 'No weekday stands out.'}
        </p>
        <WeekdayGrid rows={rows} />
      </div>
    </Section>
  )
}

function missFormat(n: NearMiss, rolloverHour: number) {
  const unit = n.commitment.unit ? ` ${n.commitment.unit}` : ''
  if (n.kind === 'quantity') return (v: number) => `${Math.round(v * 10) / 10}${unit}`
  if (n.kind === 'time') return (v: number) => formatTime(v + rolloverHour * 60)
  return (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} min`
}

function nearMissText(n: NearMiss): string {
  const gap = n.kind === 'quantity'
    ? `${Math.round(n.avgGap * 10) / 10}${n.commitment.unit ? ` ${n.commitment.unit}` : ''} ${n.commitment.comparator === 'lte' ? 'over' : 'short'}`
    : `${Math.round(n.avgGap)} min ${n.kind === 'late' ? 'late' : 'off'}`
  const lead = n.kind === 'late' ? `Late ${n.misses} times` : `${n.misses} misses`
  return `${lead}, ${gap} on average. ${n.close ? 'Close calls: a small push should do it.' : 'Not close: something bigger is in the way.'}`
}

function NearMissSection({ items, p, title = 'How far off' }: { items: NearMiss[]; p: Prepared; title?: string }) {
  return (
    <Section title={<span className="title-row">{title}
      <InfoTip label="About how far off">
        For commitments with a number or a time: how far the misses fall from the target.
        Just missing and missing badly need different fixes.
      </InfoTip></span>}>
      <div className="card list">
        {items.map((n) => (
          <div key={n.commitment.id} className="list-row near-miss">
            <div className="text">
              <div className="title" style={{ fontSize: 15 }}>{n.commitment.label}</div>
              <div className="sub">{nearMissText(n)}</div>
              <Histogram n={n} format={missFormat(n, p.ctx.rolloverHour)} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ——— Big picture ———

function BigPictureTab({ p }: { p: Prepared }) {
  const data = useMemo(() => ({
    year: yearReview(p), balance: valueBalance(p), timeline: timeline(p), burnups: burnups(p),
  }), [p])
  const y = data.year
  return (
    <>
      <Section title={y.final ? `${y.year} in review` : `${y.year} so far`}>
        <div className="card pad year">
          <div className="year-grid">
            <Stat big={`${y.started.length}`} label={`goals started${y.finished.length ? ` · ${y.finished.length} finished` : ''}${y.toMaintenance.length ? ` · ${y.toMaintenance.length} to maintenance` : ''}`} />
            <Stat big={y.bestMonth ? monthName(y.bestMonth.month) : '—'} label={y.bestMonth ? `best month · ${pct(y.bestMonth.pct)} of the plan kept` : 'best month'} />
            <Stat big={y.mostKept ? y.mostKept.goal.title : '—'} label={y.mostKept ? `most kept · on track ${y.mostKept.onTrack} of ${y.mostKept.weeks} weeks` : 'most kept'} />
            <Stat big={y.topDisplacement ? y.topDisplacement.label : '—'} label={y.topDisplacement ? `got in the way most · ×${y.topDisplacement.count}` : 'got in the way most'} />
            <Stat big={`${y.reviews}`} label={`weekly reviews · ${y.planChanges} plan changes`} />
            <Stat big={`${y.projectsDone}`} label={y.projectsDone === 1 ? 'project done' : 'projects done'} />
          </div>
          {y.finished.length > 0 && <p className="small muted" style={{ marginTop: 12 }}>Finished: {y.finished.map((g) => g.title).join(', ')}.</p>}
        </div>
      </Section>

      {data.balance.values.length > 0 && (
        <Section title={<span className="title-row">Value balance
          <InfoTip label="About value balance">
            Weeks on track each month, by the value each goal serves. Is anything being done for all of them?
          </InfoTip></span>}>
          <div className="card pad">
            <p className="takeaway">{data.balance.takeaway}</p>
            <ValueMonths b={data.balance} />
          </div>
        </Section>
      )}

      {data.timeline.rows.length > 0 && (
        <Section title={<span className="title-row">Goals timeline
          <InfoTip label="About the timeline">
            Every goal that ran in the last year. Dark: active; light: maintenance. Small ticks are plan changes.
          </InfoTip></span>}>
          <div className="card pad">
            <TimelineChart t={data.timeline} />
          </div>
        </Section>
      )}

      {data.burnups.length > 0 && (
        <Section title={<span className="title-row">Projects
          <InfoTip label="About project burn-up">
            Steps done over time. The dashed line is the pace that reaches the target date; the upright line is the target.
          </InfoTip></span>}>
          <div className="card list tint-project">
            {data.burnups.map((b) => (
              <button key={b.project.id} className="list-row burnup-row" onClick={() => navigate(`/projects/${b.project.id}`)}>
                <div className="text">
                  <div className="title" style={{ fontSize: 15 }}>{b.project.title}</div>
                  <div className="sub">{b.text}</div>
                </div>
                <BurnupSpark b={b} today={p.ctx.today} />
              </button>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-big">{big}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

// ——— one goal ———

export function GoalInsightsScreen({ id }: { id: string }) {
  const p = usePrepared()
  const data = useMemo(() => {
    const goal = p?.snap.goals.find((g) => g.id === id)
    if (!p || !goal) return null
    const from = addDays(p.lastWeek.start, -7 * (LOOKBACK_WEEKS - 1))
    const cs = p.commitmentsOf(goal)
    return {
      goal,
      from,
      trend: goalTrend(p, goal),
      obstacles: obstacles(p, from, goal.id),
      preps: cs.flatMap((c) => p.snap.preps.filter((x) => x.commitmentId === c.id))
        .map((x) => prepEffect(p, x)).filter((x): x is PrepEffect => !!x && x.verdict !== 'too_new'),
      weekdays: cs.map((c) => weekdayPattern(p, c, from)).filter((x): x is WeekdayPattern => !!x),
      nearMisses: cs.map((c) => nearMiss(p, c, from)).filter((x): x is NearMiss => !!x),
    }
  }, [p, id])
  if (!p) return null
  if (!data) {
    return <Screen back="/insights" title="Not found"><p className="muted">This goal doesn’t exist, or was deleted.</p></Screen>
  }
  const { goal, trend } = data
  const enough = !!trend && trend.weeksWithData >= MIN_WEEKS
  return (
    <Screen back="/insights" eyebrow="Insights" title={goal.title}>
      {!enough ? (
        <div className="card pad" style={{ marginTop: 8 }}>
          <p className="muted">Charts appear after {MIN_WEEKS} weeks of data{trend ? ` (${trend.weeksWithData} so far)` : ''}.</p>
        </div>
      ) : (
        <Section title="Trend">
          <div className="card pad">
            <div className="trend-summary">
              <span className={`trend-pct big ${pctClass(trend.recent, goal.tolerancePct)}`}>{pct(trend.recent)}</span>
              <span className="muted small">over the last {Math.min(LOOKBACK_WEEKS, trend.weeksWithData)} weeks · tolerance {goal.tolerancePct}%</span>
            </div>
            <p className="takeaway">{trend.takeaway}</p>
            <TrendChart points={trend.points} tolerance={goal.tolerancePct} markers={trend.markers} />
            {trend.markers.length > 0 && <MarkerList markers={trend.markers} />}
          </div>
        </Section>
      )}
      {enough && data.obstacles.total > 0 && <ObstaclesSection o={data.obstacles} title="What gets in the way" />}
      {enough && data.preps.length > 0 && <PrepsSection effects={data.preps} />}
      {enough && data.weekdays.length > 0 && <WeekdaysSection rows={data.weekdays} />}
      {enough && data.nearMisses.length > 0 && <NearMissSection items={data.nearMisses} p={p} />}
      <div style={{ marginTop: 24 }}>
        <button className="btn outline block" onClick={() => navigate(`/goals/${goal.id}`)}>Open the goal</button>
      </div>
    </Screen>
  )
}

function MarkerList({ markers }: { markers: Marker[] }) {
  return (
    <ol className="marker-list">
      {markers.map((m, i) => (
        <li key={i}>
          <span className="marker-badge">{i + 1}</span>
          <div>
            <div>{m.text}</div>
            <div className="small muted">
              {dayMonth(m.date)} · {m.before != null && m.after != null
                ? `${pct(m.before)} in the weeks before, ${pct(m.after)} after`
                : 'too soon to tell'}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
