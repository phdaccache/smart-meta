import { useMemo, useState } from 'react'
import { exportData, shareOrDownload } from '../db/backup'
import { addDisplacement, check, explainMiss, logValue, snoozePrompt, uncheck } from '../db/repo'
import { setSettings } from '../db/settings'
import { num, t, tn } from '../i18n'
import { addDays, dayMonth, diffDays, formatTime, isDateStr, parseTime, weekdayInSentence, weekdayName } from '../lib/dates'
import { formatValue, promptQuestion, reasons } from '../lib/describe'
import type { MissPrompt, ScoreContext } from '../lib/scoring'
import { buildDay, type Snapshot, type TodayGroup, type TodayItem } from '../lib/today'
import type { Commitment, DateStr, ID, MissReason, Task } from '../lib/types'
import { Badge, CheckButton, Chip, DatePickerButton, Screen, Segmented, toast } from '../ui/components'
import { useDisplacements, useSettings, useSnapshot, useSnoozes, useToday, useWeekReviews } from '../ui/hooks'
import { dismissedMisses, reviewPending } from '../lib/review'
import { IconCalendar, IconCheck, IconChevronRight, IconPlus } from '../ui/icons'
import { navigate } from '../ui/router'
import { openQuickAdd } from './QuickAdd'
import { OccurrenceSheet } from './OccurrenceSheet'
import { useSyncStatus } from '../sync/controller'
import { dashboardUrl } from '../sync/supabase'
import { TaskSheet } from './TaskSheet'
import { GettingStarted } from './Intro'

type Filter = 'all' | 'goals' | 'projects' | 'tasks'

/**
 * Goals: each goal with its habits, preps and the steps of its own projects.
 * Projects: every project step, wherever it sits. Tasks: one-off tasks.
 */
function keep(f: Exclude<Filter, 'all'>, g: TodayGroup, i: TodayItem): boolean {
  if (f === 'goals') return g.kind === 'goal' && i.kind !== 'task'
  if (f === 'projects') return i.kind === 'step'
  return i.kind === 'task'
}

function applyFilter(groups: TodayGroup[], f: Filter): TodayGroup[] {
  if (f === 'all') return groups
  return groups
    .map((g) => {
      const items = g.items.filter((i) => keep(f, g, i))
      const prompts = f === 'goals' ? g.prompts : []
      const todos = items.filter((i) => i.kind !== 'log')
      return { ...g, items, prompts, done: prompts.length === 0 && todos.length > 0 && todos.every((i) => i.done) }
    })
    .filter((g) => g.items.length > 0 || g.prompts.length > 0)
}

function useStoredFilter(): [Filter, (f: Filter) => void] {
  const [f, setF] = useState<Filter>(() => {
    try {
      return (localStorage.getItem('today-filter') as Filter | null) ?? 'all'
    } catch {
      return 'all'
    }
  })
  return [f, (next) => {
    setF(next)
    try {
      localStorage.setItem('today-filter', next)
    } catch {
      // private mode: the filter just won't be remembered
    }
  }]
}

export function TodayScreen({ date }: { date?: DateStr }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const snoozes = useSnoozes()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [logFor, setLogFor] = useState<Commitment | null>(null)
  const [filter, setFilter] = useStoredFilter()
  const viewDate = date && isDateStr(date) && date <= today ? date : today
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  const weekReviews = useWeekReviews()
  const dismissed = useMemo(() => dismissedMisses(weekReviews ?? []), [weekReviews])
  const view = useMemo(() => (snap ? buildDay(snap, viewDate, ctx, snoozes, dismissed) : null), [snap, viewDate, ctx, snoozes, dismissed])
  const isPast = viewDate !== today

  if (!snap || !view) return null

  let count = ''
  if (view.total > 0) {
    if (view.open === 0) count = t('today.allDone')
    else if (view.open === view.total) count = tn('today.things', view.total)
    else count = t('today.left', { n: view.open })
  }

  const onOpen = (item: TodayItem) => {
    if (item.kind === 'log') return setLogFor(snap.commitments.find((c) => c.id === item.subjectId) ?? null)
    if (item.target.kind === 'goal') navigate(`/goals/${item.target.id}`)
    else if (item.target.kind === 'project') navigate(`/projects/${item.target.id}`)
    else setOpenTask(snap.tasks.find((x) => x.id === item.target.id) ?? null)
  }

  return (
    <Screen
      eyebrow={isPast ? t('today.pastDay', { date: dayMonth(viewDate) }) : [dayMonth(viewDate), count].filter(Boolean).join(' · ')}
      title={isPast && diffDays(viewDate, today) === 1 ? t('dates.Yesterday') : weekdayName(viewDate)}
      settings
      actions={<>
        {isPast && <button className="btn" onClick={() => navigate('/')}>{t('dates.Today')}</button>}
        <DatePickerButton className="icon-btn" value={viewDate} max={today} label={t('today.goToPastDay')}
          onPick={(d) => isDateStr(d) && d <= today && navigate(d === today ? '/' : `/day/${d}`)}>
          <IconCalendar />
        </DatePickerButton>
      </>}
    >
      {!isPast && <GettingStarted snap={snap} />}
      {view.groups.length === 0 ? (
        <EmptyDay snap={snap} ctx={ctx} isPast={isPast} />
      ) : (
        <>
          <div className="today-filter">
            <Segmented label={t('common.show')} value={filter} onChange={setFilter} options={[
              { value: 'all', label: t('common.all') }, { value: 'goals', label: t('today.filterGoals') },
              { value: 'projects', label: t('today.filterProjects') }, { value: 'tasks', label: t('today.filterTasks') },
            ]} />
          </div>
          {applyFilter(view.groups, filter).map((g) => (
            <Group key={g.key} group={g} snap={snap} date={viewDate} today={today} onOpen={onOpen} />
          ))}
          {applyFilter(view.groups, filter).length === 0 && <p className="muted" style={{ padding: '24px 4px' }}>{t('today.nothingHere')}</p>}
        </>
      )}

      {!isPast && <ReviewNotice snap={snap} today={today} />}
      {!isPast && <SyncNotice />}
      {!isPast && <ExportNudge lastExportAt={settings.lastExportAt} snap={snap} />}
      <TaskSheet task={openTask} onClose={() => setOpenTask(null)} today={today} />
      <OccurrenceSheet commitment={logFor} date={viewDate} today={today} onClose={() => setLogFor(null)} />
    </Screen>
  )
}

// ——— groups ———

function Group(props: {
  group: TodayGroup
  snap: Snapshot
  date: DateStr
  today: DateStr
  onOpen: (i: TodayItem) => void
}) {
  const { group } = props
  const [expanded, setExpanded] = useState(false)

  if (group.done && !expanded) {
    return (
      <div className={`card group collapsed tint-${group.kind}`}>
        <button className="group-head" onClick={() => setExpanded(true)} aria-expanded={false}>
          <span className="done-mark"><IconCheck width={15} height={15} /></span>
          <span className="title">{group.kind === 'errands' ? t('today.errands') : group.title}</span>
          <span className="count">{t('today.nDone', { n: group.items.filter((i) => i.kind !== 'log').length })}</span>
        </button>
      </div>
    )
  }

  const parent = group.goalId ? `/goals/${group.goalId}` : group.projectId ? `/projects/${group.projectId}` : null
  const head = (
    <>
      <div className="text">
        {group.kind === 'errands' ? (
          <div className="group-why">{t('today.errands')}</div>
        ) : (
          <>
            {group.eyebrow && <div className="group-eyebrow">{group.eyebrow}</div>}
            <div className="group-why">{group.why ?? group.title}</div>
            {group.kind === 'project' && group.why && <div className="group-sub">{group.title}</div>}
          </>
        )}
      </div>
      {parent && <IconChevronRight className="chev" width={20} height={20} />}
    </>
  )

  return (
    <div className={`card group tint-${group.kind}`}>
      {parent ? (
        <button className="group-head" onClick={() => navigate(parent)}>{head}</button>
      ) : (
        <div className="group-head">{head}</div>
      )}
      {group.prompts.map((p) => {
        const c = props.snap.commitments.find((x) => x.id === p.commitmentId)
        return c ? <MissPromptCard key={p.commitmentId} prompt={p} label={c.label} question={promptQuestion(p, c, props.today)}
          today={props.today} canLog={c.shape === 'threshold' && p.slots.length === 1} /> : null
      })}
      <ul className="items">
        {group.items.map((i) => (
          i.kind === 'log'
            ? <LogRow key={i.key} item={i} onOpen={() => props.onOpen(i)} />
            : <ItemRow key={i.key} item={i} date={props.date} onOpen={() => props.onOpen(i)} />
        ))}
      </ul>
    </div>
  )
}

// ——— items ———

/** Rule-type commitments: nothing to tick, just a place to log what happened. */
function LogRow({ item, onOpen }: { item: TodayItem; onOpen: () => void }) {
  return (
    <li>
      <div className="item kind-log">
        <button className="check" aria-label={item.title} onClick={onOpen}>
          <span className="check-box log-box"><IconPlus width={16} height={16} /></span>
        </button>
        <button className="item-main" onClick={onOpen}>
          <div className="item-title">{item.title}</div>
          {item.detail && <div className="item-detail">{item.detail}</div>}
        </button>
        <div className="item-side"><Badge kind="goal">{t('common.log')}</Badge></div>
      </div>
    </li>
  )
}

function ItemRow({ item, date, onOpen }: { item: TodayItem; date: DateStr; onOpen: () => void }) {
  const [editing, setEditing] = useState(false)
  const shape = item.kind === 'commitment' ? 'circle' : 'square'
  const valued = !!item.commitment
  const satisfiedElsewhere = item.done && !item.entryId && !valued

  const toggle = async () => {
    if (valued) return setEditing((e) => !e)
    if (item.done && item.entryId) await uncheck(item.entryId)
    else await check({ subjectType: item.subjectType, subjectId: item.subjectId }, date)
  }

  let badge: React.ReactNode
  if (item.kind === 'commitment') badge = <Badge kind="goal">{t('common.goal')}</Badge>
  else if (item.kind === 'prep') badge = <Badge kind="prep">{t('common.prep')}</Badge>
  else if (item.kind === 'step') {
    badge = (
      <Badge kind="step">
        {item.step!.index}/{item.step!.total}
      </Badge>
    )
  }
  else badge = <Badge kind="task">{t('common.task')}</Badge>

  const miss = item.valueState === 'miss'
  return (
    <li>
      <div className={`item kind-${item.kind} ${item.done ? 'done' : ''}`}>
        <CheckButton shape={shape} checked={item.done} tone={miss ? 'miss' : satisfiedElsewhere ? 'muted' : undefined}
          label={valued ? t('today.logItem', { name: item.title }) : item.title} onClick={toggle} />
        <button className="item-main" onClick={onOpen}>
          <div className="item-title">{item.title}</div>
          {item.detail && <div className="item-detail">{item.detail}</div>}
          {item.due && <span className={`due due-${item.due.tone}`}>{item.due.label}</span>}
          {item.step && (
            <div className="stepdots" aria-hidden="true">
              {Array.from({ length: item.step.total }, (_, i) => <i key={i} className={i < item.step!.index - (item.done ? 0 : 1) ? 'on' : ''} />)}
            </div>
          )}
        </button>
        <div className="item-side">
          {valued && item.value != null && (
            <button className={`item-value ${miss ? 'miss' : ''}`} onClick={() => setEditing(true)}>
              {formatValue(item.commitment!, item.value)}
            </button>
          )}
          {badge}
        </div>
      </div>
      {editing && item.commitment && (
        <ValueEditor item={item} date={date} onDone={() => setEditing(false)} />
      )}
    </li>
  )
}

function ValueEditor({ item, date, onDone }: { item: TodayItem; date: DateStr; onDone: () => void }) {
  const c = item.commitment!
  const time = c.checkinType === 'timestamp'
  const daily = c.cadence.period === 'day'
  const [text, setText] = useState(() => {
    if (!daily || item.value == null) return ''
    return time ? formatTime(item.value) : num(item.value)
  })
  const parsed = time ? parseTime(text) : text.trim() === '' ? null : Number(text.replace(',', '.'))
  const ok = parsed != null && Number.isFinite(parsed) && parsed >= 0
  const save = async () => {
    if (!ok) return
    await logValue(c, date, parsed!, daily ? item.entryIds ?? [] : [])
    onDone()
  }
  return (
    <form className="log-inline" onSubmit={(e) => { e.preventDefault(); save() }}>
      {time ? (
        <input type="time" value={text} onChange={(e) => setText(e.target.value)} aria-label={c.label} autoFocus />
      ) : (
        <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={daily ? '0' : t('today.addPlaceholder')} aria-label={c.label} autoFocus />
      )}
      {!time && c.unit && <span className="unit">{c.unit}</span>}
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={onDone}>{t('common.cancel')}</button>
      <button type="submit" className="btn primary" disabled={!ok}>{daily ? t('common.save') : t('common.add')}</button>
    </form>
  )
}

// ——— miss prompt ———

export function MissPromptCard(props: {
  prompt: MissPrompt; label: string; question: string; today: DateStr; canLog: boolean
  /** Today only: "Not now" hides the prompt until tomorrow. */
  snooze?: boolean
  /** Review only: leave these misses unexplained for good. */
  onSkip?: () => void
}) {
  const displacements = useDisplacements()
  const [reason, setReason] = useState<MissReason | null>(null)
  const [displacementId, setDisplacementId] = useState<ID | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [note, setNote] = useState('')

  const addNew = async () => {
    if (!newLabel.trim()) return
    const d = await addDisplacement(newLabel)
    setDisplacementId(d.id)
    setNewLabel('')
  }

  const save = async () => {
    if (!reason) return
    let dId = displacementId
    if (reason === 'chose_other' && !dId && newLabel.trim()) dId = (await addDisplacement(newLabel)).id
    await explainMiss(props.prompt, { reason, displacementId: reason === 'chose_other' ? dId : null, note })
    toast(t('common.logged'))
  }

  return (
    <div className="prompt" role="group" aria-label={props.question}>
      <div className="prompt-q">{props.question}</div>
      <div className="chips">
        {reasons().map((r) => (
          <Chip key={r.value} selected={reason === r.value} wide={r.value === 'chose_other'}
            onClick={() => setReason(reason === r.value ? null : r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {reason === 'chose_other' && (
        <>
          <div className="prompt-sub">{t('miss.tookItsPlace')}</div>
          {displacements.length > 0 && (
            <div className="chips">
              {displacements.map((d) => (
                <Chip key={d.id} selected={displacementId === d.id}
                  onClick={() => setDisplacementId(displacementId === d.id ? null : d.id)}>
                  {d.label}
                </Chip>
              ))}
            </div>
          )}
          <form className="add-inline" onSubmit={(e) => { e.preventDefault(); addNew() }}>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              placeholder={displacements.length ? t('miss.addAnother') : t('miss.insteadPlaceholder')} aria-label={t('miss.tookItsPlaceLabel')} />
            {newLabel.trim() && <button className="btn" type="submit">{t('common.add')}</button>}
          </form>
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('miss.noteOptional')} aria-label={t('miss.note')} />
      </div>

      <div className="actions">
        <div className="row">
          {props.snooze !== false && (
            <button className="link-btn" onClick={() => snoozePrompt(props.prompt.commitmentId, props.today)}>{t('miss.notNow')}</button>
          )}
          {props.onSkip && <button className="link-btn" onClick={props.onSkip}>{t('common.skip')}</button>}
          {props.canLog && (
            <button className="link-btn" onClick={() => navigate(`/day/${props.prompt.slots[0].date}`)}>{t('miss.logInstead')}</button>
          )}
        </div>
        <button className="btn primary" disabled={!reason} onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  )
}

// ——— empty & nudges ———

function EmptyDay({ snap, ctx, isPast }: { snap: Snapshot; ctx: ScoreContext; isPast: boolean }) {
  const hasGoals = snap.goals.some((g) => g.state === 'active' || g.state === 'maintenance')
  const next = useMemo(() => {
    if (isPast) return null
    for (let i = 1; i <= 14; i++) {
      const d = addDays(ctx.today, i)
      const v = buildDay(snap, d, { ...ctx, today: d })
      const item = v.groups[0]?.items[0]
      if (item) return { date: d, item, why: v.groups[0].why }
    }
    return null
  }, [snap, ctx, isPast])

  if (isPast) {
    return (
      <div className="empty">
        <h2>{t('today.nothingScheduled')}</h2>
      </div>
    )
  }
  const nextText = next && t('today.nextUp', {
    when: diffDays(ctx.today, next.date) === 1 ? t('dates.tomorrow') : weekdayInSentence(next.date),
    item: next.item.title.toLowerCase() + (next.why ? `, ${lowerFirst(next.why)}` : ''),
  })
  return (
    <div className="empty">
      <h2>{t('today.nothingDue')}</h2>
      <p>
        {t('today.allowed')}
        {nextText && ` ${nextText}.`}
      </p>
      {hasGoals ? (
        <button className="btn outline" onClick={openQuickAdd}>
          {t('today.addSomething')}
        </button>
      ) : (
        <button className="btn primary" onClick={() => navigate('/goals/new')}>{t('today.createGoal')}</button>
      )}
    </div>
  )
}

const lowerFirst = (s: string) => s.replace(/[.!]+$/, '').replace(/^\p{L}/u, (c) => c.toLowerCase())

/** Quiet, from Monday until the week is reviewed. */
function ReviewNotice({ snap, today }: { snap: Snapshot; today: DateStr }) {
  const weekReviews = useWeekReviews()
  if (!weekReviews || !reviewPending(snap.goals, weekReviews, today)) return null
  return (
    <div className="banner" style={{ marginTop: 20 }}>
      <div className="text">{t('today.reviewReady')}</div>
      <button className="btn" onClick={() => navigate('/review')}>{t('nav.review')}</button>
    </div>
  )
}

/**
 * Sync failing for over a day while online usually means Supabase paused the
 * free project. Nothing is lost (changes wait on the phone), but it needs a click.
 */
function SyncNotice() {
  const s = useSyncStatus()
  if (s.phase !== 'error' || !navigator.onLine) return null
  const since = s.lastSyncedAt ? Date.now() - new Date(s.lastSyncedAt).getTime() : Infinity
  if (since < 86_400_000) return null
  return (
    <div className="banner" style={{ marginTop: 20 }}>
      <div className="text">
        {t('today.notSynced', { since: s.lastSyncedAt ? t('today.since', { date: dayMonth(s.lastSyncedAt.slice(0, 10)) }) : t('today.yet') })}
        {s.pending > 0 && ` ${tn('today.pendingSafe', s.pending)}`}
      </div>
      {dashboardUrl && <a className="btn" href={dashboardUrl} target="_blank" rel="noreferrer">{t('today.restore')}</a>}
    </div>
  )
}

function ExportNudge({ lastExportAt, snap }: { lastExportAt: string | null; snap: Snapshot }) {
  const since = lastExportAt ?? snap.goals.map((g) => g.createdAt).sort()[0]
  if (!since) return null
  const days = (Date.now() - new Date(since).getTime()) / 86_400_000
  if (days < 30) return null
  const run = async () => {
    const result = await shareOrDownload(await exportData())
    if (result !== 'cancelled') {
      await setSettings({ lastExportAt: new Date().toISOString() })
      toast(t('common.exportedKeep'))
    }
  }
  return (
    <div className="banner" style={{ marginTop: 20 }}>
      <div className="text">{lastExportAt ? t('today.backupOld') : t('today.noBackup')}</div>
      <button className="btn" onClick={run}>{t('today.export')}</button>
    </div>
  )
}
