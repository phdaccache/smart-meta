import { useMemo, useRef, useState, type ReactNode } from 'react'
import { dayMonth, formatTime, monthName } from '../lib/dates'
import {
  burnups, goalsView, goalTrend, MIN_WEEKS, patternsView, prepare, RANGES, timeline, valueBalance, yearReview,
  type GoalTrend, type Marker, type NearMiss, type PatternsView, type Prepared, type PrepEffect, type PrepVerdict, type Range,
} from '../lib/insights'
import { statusFor, type ScoreContext } from '../lib/scoring'
import type { Goal } from '../lib/types'
import {
  Distribution, GoalChips, ProjectPace, ReasonBars, Sparkline, TimelineChart, ToleranceChart, TrendChart, useTapOutside,
  ValueMonths, WeekdayGrid,
} from '../ui/charts'
import { InfoTip, Screen, Section, Segmented } from '../ui/components'
import { useAllRevisions, useDisplacements, useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { IconChevronRight } from '../ui/icons'
import { navigate } from '../ui/router'

type View = 'goals' | 'patterns' | 'big'

function stored<T extends string | number>(key: string, parse: (s: string | null) => T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return parse(localStorage.getItem(key))
    } catch {
      return parse(null)
    }
  })
  return [v, (next) => {
    setV(next)
    try {
      localStorage.setItem(key, String(next))
    } catch {
      // private mode: just not remembered
    }
  }]
}

const useView = () => stored<View>('insights-view', (s) => (s === 'patterns' || s === 'big' ? s : 'goals'))
const useRange = () => stored<Range>('insights-range', (s) => RANGES.find((r) => String(r) === s) ?? 13)

const RANGE_LABEL: Record<string, string> = { 13: '3 months', 26: '6 months', 52: '1 year', Infinity: 'All' }

/** The last computed result per slot, so coming Back to Insights draws at once instead of recomputing. */
const memo = new Map<string, { deps: unknown[]; value: unknown }>()
function remember<T>(slot: string, deps: unknown[], compute: () => T): T {
  const hit = memo.get(slot)
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value as T
  const value = compute()
  memo.set(slot, { deps, value })
  return value
}

function usePrepared(): Prepared | null {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const revisions = useAllRevisions()
  const weekReviews = useWeekReviews()
  const displacements = useDisplacements()
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  if (!snap || !revisions || !weekReviews) return null
  return remember('prepared', [snap, revisions, weekReviews, displacements, today, settings.rolloverHour],
    () => prepare({ snap, revisions, weekReviews, displacements, ctx }))
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`)
const pctClass = (n: number | null, tol: number) => `st-text-${(statusFor(n, tol) ?? 'none').replace(' ', '-')}`

function Tip({ title, children }: { title: string; children: ReactNode }) {
  return <span className="title-row">{title}<InfoTip label={`About ${title.toLowerCase()}`}>{children}</InfoTip></span>
}

export function InsightsScreen() {
  const p = usePrepared()
  const [view, setView] = useView()
  const [range, setRange] = useRange()
  if (!p) return null
  const title = (
    <span className="title-row">Insights
      <InfoTip label="About insights">
        The long run: whether goals are working, what gets in the way, and where the effort goes.
        Review is for next week; this is for the months behind you.
      </InfoTip>
    </span>
  )
  return (
    <Screen title={title} settings>
      <Segmented label="Insights view" value={view} onChange={setView}
        options={[{ value: 'goals', label: 'Goals' }, { value: 'patterns', label: 'Patterns' }, { value: 'big', label: 'Big picture' }]} />
      {view !== 'big' && (
        <div className="range-row" role="radiogroup" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {RANGE_LABEL[String(r)]}
            </button>
          ))}
        </div>
      )}
      {view === 'goals' && <GoalsTab p={p} range={range} />}
      {view === 'patterns' && <PatternsTab p={p} range={range} />}
      {view === 'big' && <BigPictureTab p={p} />}
    </Screen>
  )
}

// ——— Goals ———

const END_LABEL: Record<string, string> = { completed: 'Completed', abandoned: 'Abandoned', backlog: 'Paused' }

function GoalsTab({ p, range }: { p: Prepared; range: Range }) {
  const v = remember('goals', [p, range], () => goalsView(p, range))
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
      {v.trends.length > 0 && (
        <Section title={<Tip title="Trends">
          Each line is a goal’s result week by week; the dashed line is its tolerance and the green ticks are changes to the plan
          (a prep added, a target lowered). The number is its average over the period. Tap a goal for the full chart.
        </Tip>}>
          <div className="card list">
            {v.trends.map((t) => <TrendRow key={t.goal.id} t={t} />)}
          </div>
          {v.tooNew.length > 0 && (
            <p className="small muted note">Charts after {MIN_WEEKS} weeks of data: {v.tooNew.map((g) => g.title).join(', ')}.</p>
          )}
        </Section>
      )}

      {v.tolerance.rows.length > 0 && (
        <Section title={<Tip title="Tolerance vs actual">
          The tick is each goal’s tolerance, the dot what you actually did over the period.
          A dot far to the right of its tick means the bar may be too easy; far to the left, the goal may be too big for now.
        </Tip>}>
          <div className="card pad"><ToleranceChart rows={v.tolerance.rows} /></div>
        </Section>
      )}

      {v.ended.length > 0 && (
        <Section title="Ended goals">
          <div className="card list">
            {v.ended.map((t) => {
              const end = p.lives.get(t.goal.id)!.ended
              return (
                <button key={t.goal.id} className="list-row" onClick={() => navigate(`/insights/goals/${t.goal.id}`)}>
                  <div className="text">
                    <div className="title" style={{ fontSize: 15 }}>{t.goal.title}</div>
                    <div className="meta">
                      {end && <span className={`pill end-${end.state}`}>{END_LABEL[end.state] ?? end.state}</span>}
                      <span className="small muted">{end ? `${dayMonth(end.date)} · ` : ''}averaged {pct(t.recent)}</span>
                    </div>
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
        <div className="sub trend-takeaway">{t.takeaway}</div>
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
}

// ——— Patterns ———

function PatternsTab({ p, range }: { p: Prepared; range: Range }) {
  const data = remember('patterns', [p, range], () => patternsView(p, range))
  return <PatternSections p={p} data={data} empty />
}

function PatternSections({ p, data, empty }: { p: Prepared; data: PatternsView; empty?: boolean }) {
  const nothing = data.obstacles.total === 0 && !data.preps.length && !data.weekdays.length && !data.nearMisses.length
  if (nothing) {
    return empty ? (
      <div className="empty">
        <h2>No patterns yet.</h2>
        <p className="muted">They show up as misses get reasons and preps get checked off.</p>
      </div>
    ) : null
  }
  return (
    <>
      {data.obstacles.total > 0 && (
        <Section title={<Tip title="What gets in the way">
          The reasons you gave for misses. Under “Something else”: what you chose instead.
          Tap a row to see which goals it hit.
        </Tip>} aside={<span>{data.obstacles.total} misses</span>}>
          <div className="card pad"><ReasonBars o={data.obstacles} /></div>
        </Section>
      )}
      {data.preps.length > 0 && <PrepsSection effects={data.preps} />}
      {data.weekdays.length > 0 && (
        <Section title={<Tip title="Weekdays">
          How often each daily commitment was missed on each weekday: the stronger the red, the more often. Tap a square for the numbers.
        </Tip>}>
          <div className="card pad"><WeekdayGrid rows={data.weekdays} /></div>
        </Section>
      )}
      {data.nearMisses.length > 0 && (
        <Section title={<Tip title="How far off">
          For commitments with a number or a time: every value you logged, grouped. Green columns met the target, red ones missed it.
          Misses just past the dashed line are close calls; far ones need a bigger change.
        </Tip>}>
          <div className="stack">
            {data.nearMisses.map((n) => <NearMissCard key={n.commitment.id} n={n} rolloverHour={p.ctx.rolloverHour} />)}
          </div>
        </Section>
      )}
    </>
  )
}

const VERDICT: Record<PrepVerdict, string> = {
  works: 'Earns its place', some: 'Helps a little', no_difference: 'No clear effect', always: 'Always done', too_new: 'Too new',
}

function PrepsSection({ effects }: { effects: PrepEffect[] }) {
  return (
    <Section title={<Tip title="Preps">
      How the commitment went after you did the prep, versus after you skipped it (an evening prep counts toward the next day).
      “Always done” means there are no skipped days to compare with.
    </Tip>}>
      <div className="card list">
        {effects.map((e) => (
          <div key={e.prep.id} className="list-row prep-effect">
            <div className="text">
              <div className="title">{e.prep.title}</div>
              <div className="meta">
                <span className={`pill verdict-${e.verdict}`}>{VERDICT[e.verdict]}</span>
                <span className="small muted">for {e.commitment.label}</span>
              </div>
              <div className="bars">
                <Bar label="Done" n={e.done.n} rate={e.done.rate} tone="prep" />
                {e.verdict !== 'always' && <Bar label="Skipped" n={e.skipped.n} rate={e.skipped.rate} tone="muted" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Bar({ label, n, rate, tone }: { label: string; n: number; rate: number | null; tone: string }) {
  return (
    <>
      <span className="bar-label">{label} <span className="muted">×{n}</span></span>
      <span className="bar-track"><i className={`tone-${tone}`} style={{ width: `${rate ?? 0}%` }} /></span>
      <span className="bar-value">{pct(rate)}</span>
    </>
  )
}

function NearMissCard({ n, rolloverHour }: { n: NearMiss; rolloverHour: number }) {
  const unit = n.commitment.unit ? ` ${n.commitment.unit}` : ''
  const format = n.kind === 'quantity' ? (v: number) => `${Math.round(v * 100) / 100}${unit}`
    : n.kind === 'time' ? (v: number) => formatTime(v + rolloverHour * 60)
    : (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} min`
  const gap = n.kind === 'quantity' ? `${Math.round(n.avgGap * 10) / 10}${unit}` : `${Math.round(n.avgGap)} min`
  const noun = n.commitment.shape === 'standard' ? 'time' : n.commitment.cadence.period
  return (
    <div className="card pad">
      <div className="nm-head">
        <span className="nm-title">{n.commitment.label}</span>
        <span className="nm-stats">
          <span><b>{n.misses}</b> missed</span>
          <span><b>{gap}</b> {n.kind === 'late' ? 'late' : 'off'} on average</span>
        </span>
      </div>
      <Distribution n={n} format={format} noun={noun} />
    </div>
  )
}

// ——— Big picture ———

type YearList = 'started' | 'finished' | 'habits'

function BigPictureTab({ p }: { p: Prepared }) {
  const data = remember('big', [p], () => ({ year: yearReview(p), balance: valueBalance(p), timeline: timeline(p), burnups: burnups(p) }))
  const [list, setList] = useState<YearList | null>(null)
  const tiles = useRef<HTMLDivElement>(null)
  useTapOutside(tiles, list != null, () => setList(null))
  const y = data.year
  const lists: Record<YearList, Goal[]> = { started: y.started, finished: y.finished, habits: y.toMaintenance }
  const tile = (key: YearList, n: number, label: string) => (
    <button className={`year-tile tile-${key} ${list === key ? 'on' : ''}`} aria-expanded={list === key} disabled={n === 0}
      onClick={() => setList(list === key ? null : key)}>
      <span className="year-num">{n}</span>
      <span className="year-label">{label}</span>
    </button>
  )
  const active = data.burnups.filter((b) => b.project.state === 'active')
  const done = data.burnups.filter((b) => b.project.state === 'done')
  return (
    <>
      <Section title={y.final ? `${y.year} in review` : `${y.year} so far`}>
        <div className="card pad year">
          <div ref={tiles}>
            <div className="year-tiles">
              {tile('started', y.started.length, 'goals started')}
              {tile('finished', y.finished.length, 'finished')}
              {tile('habits', y.toMaintenance.length, y.toMaintenance.length === 1 ? 'new habit' : 'new habits')}
            </div>
            {list && <GoalChips goals={lists[list]} />}
          </div>
          <dl className="year-facts">
            <dt>Best month</dt>
            <dd>{y.bestMonth ? <>{monthName(y.bestMonth.month)} <span className="muted">{pct(y.bestMonth.pct)}</span></> : '—'}</dd>
            <dt>Most kept</dt>
            <dd>{y.mostKept ? <>{y.mostKept.goal.title} <span className="muted">{y.mostKept.onTrack}/{y.mostKept.weeks} wk</span></> : '—'}</dd>
            <dt>In the way most</dt>
            <dd>{y.topDisplacement ? <>{y.topDisplacement.label} <span className="muted">×{y.topDisplacement.count}</span></> : '—'}</dd>
            <dt>Weeks reviewed</dt>
            <dd>{y.reviews} <span className="muted">of {y.reviewable}</span></dd>
            <dt>Plan changes</dt><dd>{y.planChanges}</dd>
            <dt>Projects done</dt><dd>{y.projectsDone}</dd>
          </dl>
        </div>
      </Section>

      {data.balance.values.length > 0 && (
        <Section title={<Tip title="Value balance">
          Each bar is a month. Every week a goal was on track adds a block to it, in the colour of the value that goal serves.
          So a tall bar is a good month, and a value with no blocks got nothing done for it.
        </Tip>}>
          <div className="card pad">
            <p className="takeaway">{data.balance.takeaway}</p>
            <ValueMonths b={data.balance} />
          </div>
        </Section>
      )}

      {data.timeline.rows.length > 0 && (
        <Section title={<Tip title="Goals timeline">
          Every goal of the last year as a bar from when it started. Blue while active, green once it became a habit (maintenance).
          A bar reaching the right edge is still running; a mark at its end says how it ended. Tap one for its dates.
        </Tip>}>
          <div className="card pad"><TimelineChart t={data.timeline} /></div>
        </Section>
      )}

      {active.length > 0 && (
        <Section title={<Tip title="Projects">
          Steps done against the time gone since the project began. When the steps bar trails the time bar, it’s behind.
          “At your pace” is when you’d finish if steps keep coming as fast as they have so far.
        </Tip>}>
          <div className="card list tint-project">
            {active.map((b) => <ProjectPace key={b.project.id} b={b} />)}
          </div>
        </Section>
      )}
      {done.length > 0 && (
        <Section title="Done projects">
          <div className="card list tint-project">
            {done.map((b) => <ProjectPace key={b.project.id} b={b} />)}
          </div>
        </Section>
      )}
    </>
  )
}

// ——— one goal ———

export function GoalInsightsScreen({ id }: { id: string }) {
  const p = usePrepared()
  const [range, setRange] = useRange()
  const goal = p?.snap.goals.find((g) => g.id === id)
  if (!p) return null
  if (!goal) return <Screen back="/insights" title="Not found"><p className="muted">This goal doesn’t exist, or was deleted.</p></Screen>
  const trend = remember(`trend:${id}`, [p, range], () => goalTrend(p, goal, range))
  const patterns = remember(`patterns:${id}`, [p, range], () => patternsView(p, range, goal.id, trend?.points[0]?.start))
  const enough = !!trend && trend.weeksWithData >= MIN_WEEKS
  return (
    <Screen back="/insights" eyebrow="Insights" title={goal.title}>
      <div className="range-row" role="radiogroup" aria-label="Period">
        {RANGES.map((r) => (
          <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
            {RANGE_LABEL[String(r)]}
          </button>
        ))}
      </div>
      {!enough ? (
        <div className="card pad" style={{ marginTop: 16 }}>
          <p className="muted">Charts appear after {MIN_WEEKS} weeks of data{trend ? ` (${trend.weeksWithData} so far)` : ''}.</p>
        </div>
      ) : (
        <>
          <Section title="Trend">
            <div className="card pad">
              <div className="trend-summary">
                <span className={`hero ${pctClass(trend.recent, goal.tolerancePct)}`}>{pct(trend.recent)}</span>
                <span className="muted small">average over {trend.weeksWithData} weeks<br />tolerance {goal.tolerancePct}%</span>
              </div>
              <TrendChart points={trend.points} tolerance={goal.tolerancePct} markers={trend.markers} />
            </div>
          </Section>
          {trend.markers.length > 0 && (
            <Section title={<Tip title="Plan changes">
              Each change to the plan, with the average of up to 4 weeks before and after it. That’s how you tell whether a change worked.
            </Tip>}>
              <MarkerList markers={trend.markers} />
            </Section>
          )}
          <PatternSections p={p} data={patterns} />
        </>
      )}
      <div style={{ marginTop: 28 }}>
        <button className="btn outline block" onClick={() => navigate(`/goals/${goal.id}`)}>Open the goal</button>
      </div>
    </Screen>
  )
}

function MarkerList({ markers }: { markers: Marker[] }) {
  return (
    <div className="card list">
      {markers.map((m, i) => {
        const diff = m.before != null && m.after != null ? m.after - m.before : null
        return (
          <div key={i} className="list-row marker-row">
            <b className="marker-badge">{i + 1}</b>
            <div className="text">
              <div className="title">{m.text}</div>
              <div className="sub">{dayMonth(m.date)}</div>
            </div>
            <div className="marker-effect">
              {diff == null ? <span className="muted small">too soon</span> : (
                <>
                  <span className="muted">{pct(m.before)} →</span>{' '}
                  <b className={diff >= 10 ? 'st-text-on-track' : diff <= -10 ? 'st-text-at-risk' : ''}>{pct(m.after)}</b>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
