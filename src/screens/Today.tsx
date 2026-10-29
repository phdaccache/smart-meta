import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { exportData, shareOrDownload } from '../db/backup'
import { addDisplacement, check, explainMiss, logValue, putOffMiss, uncheck } from '../db/repo'
import { setSettings } from '../db/settings'
import { num, t, tn } from '../i18n'
import { addDays, dayMonth, diffDays, formatTime, isDateStr, parseTime, periodOf, weekdayInSentence, weekdayName } from '../lib/dates'
import { formatValue, promptQuestion, reasons, valueMissQuestion } from '../lib/describe'
import { asksWhyAtOnce, type MissPrompt, type ScoreContext } from '../lib/scoring'
import { buildDay, type Snapshot, type TodayGroup, type TodayItem } from '../lib/today'
import type { Commitment, DateStr, ID, MissReason, Task } from '../lib/types'
import { CheckButton, Chip, DatePickerButton, DueText, Screen, Segmented, Sheet, toast } from '../ui/components'
import { ProjectTile, ValueTile } from '../ui/valueLook'
import { useDisplacements, useMissAsksLoaded, useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { dismissedMisses, reviewPending } from '../lib/review'
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconFilter, IconNote, IconPlus } from '../ui/icons'
import { navigate } from '../ui/router'
import { SwipeToDelete } from '../ui/SwipeToDelete'
import { openQuickAdd } from './QuickAdd'
import { OccurrenceSheet } from './OccurrenceSheet'
import { useSyncStatus } from '../sync/controller'
import { dashboardUrl } from '../sync/supabase'
import { deleteWithUndo, TaskSheet } from './TaskSheet'
import { GettingStarted } from './Intro'
import { SyncBanner } from './Account'

type Filter = 'all' | 'goals' | 'projects' | 'tasks'

/**
 * Goals: each goal with its habits, preps, tasks and its own projects.
 * Projects: every project's step and tasks, wherever they sit. Tasks: every task.
 */
function keep(f: Exclude<Filter, 'all'>, g: TodayGroup, i: TodayItem): boolean {
  if (f === 'goals') return g.kind === 'goal'
  if (f === 'projects') return i.kind === 'step' || !!i.forProject
  return i.kind === 'task'
}

function applyFilter(groups: TodayGroup[], f: Filter): TodayGroup[] {
  if (f === 'all') return groups
  return groups
    .map((g) => {
      const items = g.items.filter((i) => keep(f, g, i))
      const prompts = f === 'goals' ? g.prompts : []
      const todos = items.filter((i) => i.kind !== 'log' && !i.adds)
      return { ...g, items, prompts, done: prompts.length === 0 && todos.length > 0 && todos.every((i) => i.done) }
    })
    .filter((g) => g.items.length > 0 || g.prompts.length > 0)
}

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial
    } catch {
      return initial
    }
  })
  return [v, (next) => {
    setV(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      // private mode: the filter just won't be remembered
    }
  }]
}

const useStoredFilter = () => useStored<Filter>('today-filter', 'all')

/** When tasks are due, from the filter button: anything but "all" shows only tasks and steps due then. */
type When = 'today' | 'tomorrow' | 'week' | 'all'
const WHENS: { value: When; label: () => string }[] = [
  { value: 'all', label: () => t('common.all') },
  { value: 'today', label: () => t('today.whenToday') },
  { value: 'tomorrow', label: () => t('today.whenTomorrow') },
  { value: 'week', label: () => t('today.whenWeek') },
]

function dueThen(i: TodayItem, when: Exclude<When, 'all'>, today: DateStr): boolean {
  if (i.kind !== 'task' && i.kind !== 'step') return false
  const d = i.dueDate
  if (!d) return false
  if (when === 'today') return d <= today
  if (when === 'tomorrow') return d === addDays(today, 1)
  // This week: everything due by Sunday, the late ones included.
  return d <= periodOf(today, 'week').end
}

function applyWhen(groups: TodayGroup[], when: When, today: DateStr): TodayGroup[] {
  if (when === 'all') return groups
  return groups
    .map((g) => {
      const items = g.items.filter((i) => dueThen(i, when, today))
      return { ...g, items, prompts: [], done: items.length > 0 && items.every((i) => i.done) }
    })
    .filter((g) => g.items.length > 0)
}

/**
 * The filter button and the menu it opens, as on the iPhone: the menu grows out of the button,
 * the choice is ticked, and a tap anywhere else closes it. The button fills while a filter is on.
 */
function WhenMenu({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  // Closing keeps it shown a moment, while it shrinks back into the button.
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const open = phase === 'open'
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const setOpen = (on: boolean) => {
    clearTimeout(timer.current)
    if (on) return setPhase('open')
    setPhase((p) => (p === 'closed' ? p : 'closing'))
    timer.current = setTimeout(() => setPhase('closed'), 200)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc)
    wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="when" ref={wrap}>
      <button type="button" className={`icon-btn filter-btn ${value !== 'all' ? 'on' : ''}`} aria-label={t('today.when')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconFilter />
      </button>
      {phase !== 'closed' && (
        <div className={`menu ${phase === 'closing' ? 'closing' : ''}`} role="menu" aria-label={t('today.when')}>
          <div className="menu-title">{t('today.when')}</div>
          {WHENS.map((w) => (
            <button key={w.value} type="button" role="menuitemradio" aria-checked={value === w.value} className="menu-item"
              onClick={() => { onChange(w.value); setOpen(false) }}>
              <span className="menu-check">{value === w.value && <IconCheck width={16} height={16} strokeWidth={2.4} />}</span>
              {w.label()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TodayScreen({ date }: { date?: DateStr }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const asks = useMissAsksLoaded()
  const [openTask, setOpenTask] = useState<Task | null>(null)
  const [logFor, setLogFor] = useState<Commitment | null>(null)
  const [filter, setFilter] = useStoredFilter()
  const [when, setWhen] = useStored<When>('today-when', 'all')
  const viewDate = date && isDateStr(date) && date <= today ? date : today
  const ctx: ScoreContext = useMemo(() => ({ today, rolloverHour: settings.rolloverHour }), [today, settings.rolloverHour])
  const weekReviews = useWeekReviews()
  const dismissed = useMemo(() => dismissedMisses(weekReviews ?? []), [weekReviews])
  // Drawn once what was put off and dismissed is known too, so no question shows for a moment and goes.
  const view = useMemo(() => (snap && asks && weekReviews ? buildDay(snap, viewDate, ctx, asks, dismissed) : null),
    [snap, viewDate, ctx, asks, weekReviews, dismissed])
  const isPast = viewDate !== today

  if (!snap || !view) return null
  // Past days show what was done; the date filter is for what's ahead.
  const whenOn = !isPast && when !== 'all'
  const shown = applyWhen(applyFilter(view.groups, filter), isPast ? 'all' : when, today)

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
      // With a date filter on, the line under the date says which, so a short list is never a surprise.
      eyebrow={isPast ? t('today.pastDay', { date: dayMonth(viewDate) })
        : [dayMonth(viewDate), whenOn ? WHENS.find((w) => w.value === when)!.label() : count].filter(Boolean).join(' · ')}
      title={isPast && diffDays(viewDate, today) === 1 ? t('dates.Yesterday') : weekdayName(viewDate)}
      settings
      // Top-left, not beside the title: a long day name ("Wednesday") keeps one line.
      top={isPast && (
        <button type="button" className="back" onClick={() => navigate('/')}>
          <IconChevronLeft width={20} height={20} /> {t('dates.Today')}
        </button>
      )}
      actions={<>
        {!isPast && view.groups.length > 0 && <WhenMenu value={when} onChange={setWhen} />}
        <DatePickerButton className="icon-btn" value={viewDate} max={today} label={t('today.goToPastDay')} confirm={t('today.goToDay')}
          onPick={(d) => navigate(d === today ? '/' : `/day/${d}`)}>
          <IconCalendar />
        </DatePickerButton>
      </>}
    >
      {!isPast && <SyncBanner settings={settings} />}
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
          {shown.map((g) => (
            <Group key={g.key} group={g} snap={snap} date={viewDate} today={today} onOpen={onOpen} />
          ))}
          {shown.length === 0 && <p className="muted" style={{ padding: '24px 4px' }}>{t(whenOn ? 'today.whenNothing' : 'today.nothingHere')}</p>}
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

/** When something on Today was last ticked or logged, so a group folds only after a tick of its own. */
let tickedAt = 0

function Group(props: {
  group: TodayGroup
  snap: Snapshot
  date: DateStr
  today: DateStr
  onOpen: (i: TodayItem) => void
}) {
  const { group } = props
  const [expanded, setExpanded] = useState(false)
  // Ticking the last thing leaves the card open a moment, so the tick is seen, then it folds into one line.
  // That holds every time, even after it was opened again from that line and something was unticked and ticked.
  // Only a tick does it: a day still loading, coming back to Today, can't look finished a moment later and fold again.
  const [wasDone, setWasDone] = useState(group.done)
  const [settling, setSettling] = useState(false)
  if (group.done !== wasDone) {
    setWasDone(group.done)
    setSettling(group.done && Date.now() - tickedAt < 3000)
  }
  const card = useRef<HTMLDivElement>(null)
  const from = useRef<number | null>(null)
  const fold = (open: boolean) => {
    from.current = card.current?.offsetHeight ?? null
    setExpanded(open)
  }
  useEffect(() => {
    if (!settling) return
    const id = setTimeout(() => {
      from.current = card.current?.offsetHeight ?? null
      setSettling(false)
      setExpanded(false)
    }, 700)
    return () => clearTimeout(id)
  }, [settling])
  const open = !group.done || expanded || settling
  // Folding or unfolding, the card's height eases from what it was to what it is, and what's in it fades in.
  useLayoutEffect(() => {
    const el = card.current
    const h = from.current
    from.current = null
    if (!el || h == null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = el.offsetHeight
    if (to === h) return
    el.animate([{ height: `${h}px` }, { height: `${to}px` }], { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
    for (const child of el.children) child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' })
  }, [open])

  if (!open) {
    return (
      <div className="card group collapsed" ref={card}>
        <button className="group-head" onClick={() => fold(true)} aria-expanded={false}>
          <span className="done-mark"><IconCheck width={15} height={15} /></span>
          <span className="title">{group.kind === 'errands' ? '' : group.title}</span>
          <span className="count">{t('today.nDone', { n: group.items.filter((i) => i.kind !== 'log').length })}</span>
        </button>
      </div>
    )
  }

  const parent = group.goalId ? `/goals/${group.goalId}` : group.projectId ? `/projects/${group.projectId}` : null
  const goal = group.goalId ? props.snap.goals.find((g) => g.id === group.goalId) : undefined
  // Just what it is: the goal's or project's name, after its icon. Its why lives on Plan and Review.
  const head = (
    <>
      {group.kind === 'project'
        ? <ProjectTile size="sm" />
        : <ValueTile value={props.snap.values.find((v) => v.id === goal?.whyValueId)} values={props.snap.values} size="sm" />}
      <div className="text">
        <div className="group-title">{group.title}</div>
        {group.due && <span className={`due due-${group.due.tone}`}>{group.due.label}</span>}
      </div>
      {parent && <IconChevronRight className="chev" width={18} height={18} />}
    </>
  )

  return (
    // Loose tasks need no heading: their square checkboxes say what they are.
    <div className={`card group kind-${group.kind}`} ref={card}>
      {parent ? (
        <button className="group-head" onClick={() => navigate(parent)}>{head}</button>
      ) : group.kind !== 'errands' && (
        <div className="group-head">{head}</div>
      )}
      {group.prompts.map((p) => {
        const c = props.snap.commitments.find((x) => x.id === p.commitmentId)
        return c ? <MissPromptCard key={p.commitmentId} prompt={p} question={promptQuestion(p, c, props.today)}
          today={props.today} canLog={c.shape === 'threshold' && p.slots.length === 1}
          onNotNow={() => putOffMiss(p, props.today)} /> : null
      })}
      <ul className="items">
        {group.items.map((i) => (
          i.kind === 'log'
            ? <LogRow key={i.key} item={i} onOpen={() => props.onOpen(i)} />
            : <ItemRow key={i.key} item={i} date={props.date} today={props.today} onOpen={() => props.onOpen(i)} />
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
        <button className="check circle" aria-label={item.title} onClick={onOpen}>
          <span className="check-box log-box"><IconPlus width={16} height={16} /></span>
        </button>
        <button className="item-main" onClick={onOpen}>
          <div className="item-title">{item.title}</div>
          {item.detail && <div className="item-detail">{item.detail}</div>}
        </button>
      </div>
    </li>
  )
}

function ItemRow({ item, date, today, onOpen }: { item: TodayItem; date: DateStr; today: DateStr; onOpen: () => void }) {
  const [editing, setEditing] = useState(false)
  /** Set right after a daily value misses its line: the sheet asking why. */
  const [why, setWhy] = useState<{ prompt: MissPrompt; question: string } | null>(null)
  // Round for what keeps a habit going (habits and their preps), square for one-off to-dos.
  const shape = item.kind === 'commitment' || item.kind === 'prep' ? 'circle' : 'square'
  const valued = !!item.commitment
  const satisfiedElsewhere = item.done && !item.entryId && !valued

  const toggle = async () => {
    if (valued) return setEditing((e) => !e)
    if (item.done && item.entryId) await uncheck(item.entryId)
    else {
      tickedAt = Date.now()
      await check({ subjectType: item.subjectType, subjectId: item.subjectId }, date)
    }
  }

  // Preps and steps are less obvious than habits and tasks, so they say what they are, in their color.
  const kind = item.kind === 'prep' ? t('common.prep')
    : item.kind === 'step' ? t('today.stepOf', { n: item.step!.index, total: item.step!.total }) : null
  const detail = [kind && <span key="k" className="item-kind">{kind}</span>, item.detail].filter(Boolean)

  const miss = item.valueState === 'miss'
  // Tasks and project steps can be swiped away; habits and preps are changed on their goal.
  const deletable = item.kind === 'task' || item.kind === 'step'
  const rowClass = `item kind-${item.kind} ${item.done ? 'done' : ''}`
  const content = (
    <>
        <CheckButton shape={shape} checked={item.done} tone={miss ? 'miss' : satisfiedElsewhere ? 'muted' : undefined}
          variant={valued ? (item.adds ? 'adds' : 'value') : undefined}
          label={valued ? t('today.logItem', { name: item.title }) : item.title} onClick={toggle} />
        <button className="item-main" onClick={onOpen}>
          <div className="item-title">
            {item.title}
            {item.note && <IconNote className="note-mark" width={15} height={15} role="img" aria-hidden={false} aria-label={t('common.hasNotes')} />}
          </div>
          {detail.length > 0 && <div className="item-detail">{detail.flatMap((d, i) => (i ? [' · ', d] : [d]))}</div>}
          <DueText due={item.due} movedFrom={item.movedFrom} />
        </button>
        {valued && item.value != null && (
          <div className="item-side">
            <button className={`item-value ${miss ? 'miss' : ''}`} onClick={() => setEditing(true)}>
              {formatValue(item.commitment!, item.value)}
            </button>
          </div>
        )}
    </>
  )
  return (
    <li>
      {deletable ? (
        <SwipeToDelete className={rowClass} label={t('task.deleteNamed', { task: item.title })} onDelete={() => deleteWithUndo(item.subjectId)}>
          {content}
        </SwipeToDelete>
      ) : <div className={rowClass}>{content}</div>}
      {editing && item.commitment && (
        <ValueEditor item={item} date={date} onDone={(asked) => { setEditing(false); if (asked) setWhy(asked) }} />
      )}
      {why && (
        <Sheet open onClose={() => { putOffMiss(why.prompt, today); setWhy(null) }} label={why.question}>
          <MissPromptCard prompt={why.prompt} question={why.question} today={today} canLog={false} sheet
            onNotNow={() => { putOffMiss(why.prompt, today); setWhy(null) }} onSaved={() => setWhy(null)} />
        </Sheet>
      )}
    </li>
  )
}

function ValueEditor({ item, date, onDone }: {
  item: TodayItem; date: DateStr
  /** With the question to ask, when the value just missed its line and nothing explains it yet. */
  onDone: (asked?: { prompt: MissPrompt; question: string }) => void
}) {
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
    tickedAt = Date.now()
    const r = await logValue(c, date, parsed!, daily ? item.entryIds ?? [] : [])
    if (r.missed && !r.explained && asksWhyAtOnce(c)) {
      onDone({ prompt: { commitmentId: c.id, period: 'day', slots: [{ date, count: 1 }] }, question: valueMissQuestion(c, parsed!) })
    } else onDone()
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
      <button type="button" className="btn ghost" onClick={() => onDone()}>{t('common.cancel')}</button>
      <button type="submit" className="btn primary" disabled={!ok}>{daily ? t('common.save') : t('common.add')}</button>
    </form>
  )
}

// ——— miss prompt ———

export function MissPromptCard(props: {
  prompt: MissPrompt; question: string; today: DateStr; canLog: boolean
  /** Today and the sheet: "Not now" asks again the next day, then leaves it to the review. */
  onNotNow?: () => void
  /** Review only: leave these misses unexplained for good. */
  onSkip?: () => void
  onSaved?: () => void
  /** Inside a sheet: the question is its heading. */
  sheet?: boolean
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
    props.onSaved?.()
  }

  return (
    <div className={`prompt ${props.sheet ? 'in-sheet' : ''}`} role="group" aria-label={props.question}>
      {props.sheet ? <h2 className="prompt-q">{props.question}</h2> : <div className="prompt-q">{props.question}</div>}
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
          {props.onNotNow && <button className="link-btn" onClick={props.onNotNow}>{t('miss.notNow')}</button>}
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
