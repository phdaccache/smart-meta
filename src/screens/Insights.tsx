import { useMemo, useRef, useState, type ReactNode } from 'react'
import { getLang, type Key, marked, num, t, tk, tn } from '../i18n'
import { capitalize, dayMonth, formatTime, monthName } from '../lib/dates'
import { periodWord } from '../lib/describe'
import {
  burnups, goalsView, goalTrend, MIN_WEEKS, patternsView, prepare, RANGES, timeline, valueBalance, yearReview,
  type GoalTrend, type Marker, type NearMiss, type PatternsView, type Prepared, type PrepEffect, type PrepVerdict, type Range,
} from '../lib/insights'
import { stateLabel } from '../lib/revisions'
import { statusFor, type ScoreContext } from '../lib/scoring'
import type { Goal } from '../lib/types'
import {
  Distribution, GoalChips, ProjectPace, ReasonBars, Sparkline, TimelineChart, ToleranceChart, TrendChart, useTapOutside,
  ValueMonths, WeekdayGrid,
} from '../ui/charts'
import { InfoTip, PageText, Screen, Section, Segmented } from '../ui/components'
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

const RANGE_LABEL: Record<string, Key> = { 13: 'ins.range3m', 26: 'ins.range6m', 52: 'ins.range1y', Infinity: 'ins.rangeAll' }

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
  // The language is a dependency: takeaways and markers are written as text.
  return remember('prepared', [snap, revisions, weekReviews, displacements, today, settings.rolloverHour, getLang()],
    () => prepare({ snap, revisions, weekReviews, displacements, ctx }))
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`)
const pctClass = (n: number | null, tol: number) => `st-text-${(statusFor(n, tol) ?? 'none').replace(' ', '-')}`

function Tip({ title, children }: { title: string; children: ReactNode }) {
  return <span className="title-row">{title}<InfoTip label={t('common.about', { topic: title.toLowerCase() })}>{children}</InfoTip></span>
}

/** A translated text with one part of it (a number) in bold. */
function Bold({ text, bold }: { text: string; bold: string }) {
  const i = text.indexOf(bold)
  return i < 0 ? <>{text}</> : <>{text.slice(0, i)}<b>{bold}</b>{text.slice(i + bold.length)}</>
}

export function InsightsScreen() {
  const p = usePrepared()
  const [view, setView] = useView()
  const [range, setRange] = useRange()
  if (!p) return null
  const title = (
    <span className="title-row">{t('nav.insights')}
      <InfoTip label={t('ins.about')}><PageText text={marked('ins.aboutText')} /></InfoTip>
    </span>
  )
  return (
    <Screen title={title} settings>
      <Segmented label={t('ins.view')} value={view} onChange={setView}
        options={[{ value: 'goals', label: t('ins.tabGoals') }, { value: 'patterns', label: t('ins.tabPatterns') }, { value: 'big', label: t('ins.tabBig') }]} />
      {view !== 'big' && (
        <div className="range-row" role="radiogroup" aria-label={t('ins.period')}>
          {RANGES.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
              {tk(RANGE_LABEL[String(r)])}
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

const endLabel = (state: string) => stateLabel(state === 'backlog' ? 'paused' : (state as 'completed'))

function GoalsTab({ p, range }: { p: Prepared; range: Range }) {
  const v = remember('goals', [p, range], () => goalsView(p, range))
  if (v.trends.length === 0 && v.ended.length === 0) {
    return (
      <div className="empty">
        <h2>{t('ins.nothingToChart')}</h2>
        <p className="muted">
          {t('ins.chartsAfter', { n: MIN_WEEKS })}
          {v.tooNew.length ? ` ${t('ins.gettingThere', { names: v.tooNew.map((g) => g.title).join(', ') })}` : ''}
        </p>
      </div>
    )
  }
  return (
    <>
      {v.trends.length > 0 && (
        <Section title={<Tip title={t('ins.trends')}>{t('ins.trendsInfo')}</Tip>}>
          <div className="card list">
            {v.trends.map((x) => <TrendRow key={x.goal.id} t={x} />)}
          </div>
          {v.tooNew.length > 0 && (
            <p className="small muted note">{t('ins.chartsAfterData', { n: MIN_WEEKS, names: v.tooNew.map((g) => g.title).join(', ') })}</p>
          )}
        </Section>
      )}

      {v.tolerance.rows.length > 0 && (
        <Section title={<Tip title={t('ins.tolerance')}>{t('ins.toleranceInfo')}</Tip>}>
          <div className="card pad"><ToleranceChart rows={v.tolerance.rows} /></div>
        </Section>
      )}

      {v.ended.length > 0 && (
        <Section title={t('ins.ended')}>
          <div className="card list">
            {v.ended.map((x) => {
              const end = p.lives.get(x.goal.id)!.ended
              return (
                <button key={x.goal.id} className="list-row" onClick={() => navigate(`/insights/goals/${x.goal.id}`)}>
                  <div className="text">
                    <div className="title" style={{ fontSize: 15 }}>{x.goal.title}</div>
                    <div className="meta">
                      {end && <span className={`pill end-${end.state}`}>{endLabel(end.state)}</span>}
                      <span className="small muted">{end ? `${dayMonth(end.date)} · ` : ''}{t('ins.averaged', { pct: pct(x.recent) })}</span>
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

function TrendRow({ t: trend }: { t: GoalTrend }) {
  return (
    <button className="list-row trend-row" onClick={() => navigate(`/insights/goals/${trend.goal.id}`)}>
      <div className="text">
        <div className="trend-head">
          <span className="title">{trend.goal.title}</span>
          <span className={`trend-pct ${pctClass(trend.recent, trend.goal.tolerancePct)}`}>{pct(trend.recent)}</span>
        </div>
        <Sparkline points={trend.points} tolerance={trend.goal.tolerancePct} markers={trend.markers} />
        <div className="sub trend-takeaway">{trend.takeaway}</div>
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
        <h2>{t('ins.noPatterns')}</h2>
        <p className="muted">{t('ins.noPatternsText')}</p>
      </div>
    ) : null
  }
  return (
    <>
      {data.obstacles.total > 0 && (
        <Section title={<Tip title={t('ins.inTheWay')}>{t('ins.inTheWayInfo')}</Tip>}
          aside={<span>{t('ins.misses', { n: data.obstacles.total })}</span>}>
          <div className="card pad"><ReasonBars o={data.obstacles} /></div>
        </Section>
      )}
      {data.preps.length > 0 && <PrepsSection effects={data.preps} />}
      {data.weekdays.length > 0 && (
        <Section title={<Tip title={t('ins.weekdays')}>{t('ins.weekdaysInfo')}</Tip>}>
          <div className="card pad"><WeekdayGrid rows={data.weekdays} /></div>
        </Section>
      )}
      {data.nearMisses.length > 0 && (
        <Section title={<Tip title={t('ins.howFar')}>{t('ins.howFarInfo')}</Tip>}>
          <div className="stack">
            {data.nearMisses.map((n) => <NearMissCard key={n.commitment.id} n={n} rolloverHour={p.ctx.rolloverHour} />)}
          </div>
        </Section>
      )}
    </>
  )
}

const VERDICT: Record<PrepVerdict, Key> = {
  works: 'ins.verdict.works', some: 'ins.verdict.some', no_difference: 'ins.verdict.none', always: 'ins.verdict.always',
  too_new: 'ins.verdict.tooNew',
}

function PrepsSection({ effects }: { effects: PrepEffect[] }) {
  return (
    <Section title={<Tip title={t('ins.preps')}>{t('ins.prepsInfo')}</Tip>}>
      <div className="card list">
        {effects.map((e) => (
          <div key={e.prep.id} className="list-row prep-effect">
            <div className="text">
              <div className="title">{e.prep.title}</div>
              <div className="meta">
                <span className={`pill verdict-${e.verdict}`}>{tk(VERDICT[e.verdict])}</span>
                <span className="small muted">{t('ins.for', { name: e.commitment.label })}</span>
              </div>
              <div className="bars">
                <Bar label={t('ins.done')} n={e.done.n} rate={e.done.rate} tone="prep" />
                {e.verdict !== 'always' && <Bar label={t('ins.skipped')} n={e.skipped.n} rate={e.skipped.rate} tone="muted" />}
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
  const format = n.kind === 'quantity' ? (v: number) => `${num(v)}${unit}`
    : n.kind === 'time' ? (v: number) => formatTime(v + rolloverHour * 60)
    : (v: number) => `${v > 0 ? '+' : ''}${t('ins.min', { n: Math.round(v) })}`
  const gap = n.kind === 'quantity' ? `${num(Math.round(n.avgGap * 10) / 10)}${unit}` : t('ins.min', { n: Math.round(n.avgGap) })
  const period = n.commitment.cadence.period
  const plural = ({ day: 'chart.unit.days', week: 'chart.unit.weeks', month: 'chart.unit.months' } as const)[period]
  const noun = (count: number) => n.commitment.shape === 'standard'
    ? t(count === 1 ? 'chart.unit.time' : 'chart.unit.times')
    : count === 1 ? periodWord(period) : t(plural)
  return (
    <div className="card pad">
      <div className="nm-head">
        <span className="nm-title">{n.commitment.label}</span>
        <span className="nm-stats">
          <span><Bold text={t('ins.missed', { n: n.misses })} bold={String(n.misses)} /></span>
          <span><Bold text={t(n.kind === 'late' ? 'ins.lateAvg' : 'ins.offAvg', { gap })} bold={gap} /></span>
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
      <Section title={t(y.final ? 'ins.yearReview' : 'ins.yearSoFar', { year: String(y.year) })}>
        <div className="card pad year">
          <div ref={tiles}>
            <div className="year-tiles">
              {tile('started', y.started.length, tn('ins.goalsStarted', y.started.length))}
              {tile('finished', y.finished.length, tn('ins.finished', y.finished.length))}
              {tile('habits', y.toMaintenance.length, t(y.toMaintenance.length === 1 ? 'ins.newHabit' : 'ins.newHabits'))}
            </div>
            {list && <GoalChips goals={lists[list]} />}
          </div>
          <dl className="year-facts">
            <dt>{t('ins.bestMonth')}</dt>
            <dd>{y.bestMonth ? <>{capitalize(monthName(y.bestMonth.month))} <span className="muted">{pct(y.bestMonth.pct)}</span></> : '—'}</dd>
            <dt>{t('ins.mostKept')}</dt>
            <dd>{y.mostKept ? <>{y.mostKept.goal.title} <span className="muted">{t('ins.wk', { n: y.mostKept.onTrack, total: y.mostKept.weeks })}</span></> : '—'}</dd>
            <dt>{t('ins.inWayMost')}</dt>
            <dd>{y.topDisplacement ? <>{y.topDisplacement.label} <span className="muted">×{y.topDisplacement.count}</span></> : '—'}</dd>
            <dt>{t('ins.weeksReviewed')}</dt>
            <dd>{y.reviews} <span className="muted">{t('ins.ofN', { n: y.reviewable })}</span></dd>
            <dt>{t('ins.planChanges')}</dt><dd>{y.planChanges}</dd>
            <dt>{t('ins.projectsDone')}</dt><dd>{y.projectsDone}</dd>
          </dl>
        </div>
      </Section>

      {data.balance.values.length > 0 && (
        <Section title={<Tip title={t('ins.valueBalance')}>{t('ins.valueBalanceInfo')}</Tip>}>
          <div className="card pad">
            <p className="takeaway">{data.balance.takeaway}</p>
            <ValueMonths b={data.balance} />
          </div>
        </Section>
      )}

      {data.timeline.rows.length > 0 && (
        <Section title={<Tip title={t('ins.timeline')}>{t('ins.timelineInfo')}</Tip>}>
          <div className="card pad"><TimelineChart t={data.timeline} /></div>
        </Section>
      )}

      {active.length > 0 && (
        <Section title={<Tip title={t('ins.projects')}>{t('ins.projectsInfo')}</Tip>}>
          <div className="card list tint-project">
            {active.map((b) => <ProjectPace key={b.project.id} b={b} />)}
          </div>
        </Section>
      )}
      {done.length > 0 && (
        <Section title={t('ins.doneProjects')}>
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
  if (!goal) return <Screen back="/insights" title={t('nav.notFound')}><p className="muted">{t('common.goalGone')}</p></Screen>
  const trend = remember(`trend:${id}`, [p, range], () => goalTrend(p, goal, range))
  const patterns = remember(`patterns:${id}`, [p, range], () => patternsView(p, range, goal.id, trend?.points[0]?.start))
  const enough = !!trend && trend.weeksWithData >= MIN_WEEKS
  return (
    <Screen back="/insights" eyebrow={t('nav.insights')} title={goal.title}>
      <div className="range-row" role="radiogroup" aria-label={t('ins.period')}>
        {RANGES.map((r) => (
          <button key={r} role="radio" aria-checked={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>
            {tk(RANGE_LABEL[String(r)])}
          </button>
        ))}
      </div>
      {!enough ? (
        <div className="card pad" style={{ marginTop: 16 }}>
          <p className="muted">
            {trend ? t('ins.chartsAfterSoFar', { n: MIN_WEEKS, sofar: trend.weeksWithData }) : t('ins.chartsAfter', { n: MIN_WEEKS })}
          </p>
        </div>
      ) : (
        <>
          <Section title={t('ins.trend')}>
            <div className="card pad">
              <div className="trend-summary">
                <span className={`hero ${pctClass(trend.recent, goal.tolerancePct)}`}>{pct(trend.recent)}</span>
                <span className="muted small">{t('ins.avgOver', { n: trend.weeksWithData })}<br />{t('ins.toleranceN', { n: goal.tolerancePct })}</span>
              </div>
              <TrendChart points={trend.points} tolerance={goal.tolerancePct} markers={trend.markers} />
            </div>
          </Section>
          {trend.markers.length > 0 && (
            <Section title={<Tip title={t('ins.planChanges')}>{t('ins.planChangesInfo')}</Tip>}>
              <MarkerList markers={trend.markers} />
            </Section>
          )}
          <PatternSections p={p} data={patterns} />
        </>
      )}
      <div style={{ marginTop: 28 }}>
        <button className="btn outline block" onClick={() => navigate(`/goals/${goal.id}`)}>{t('ins.openGoal')}</button>
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
              {diff == null ? <span className="muted small">{t('ins.tooSoon')}</span> : (
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
