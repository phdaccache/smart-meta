import { useMemo, useState } from 'react'
import { exportData, shareOrDownload } from '../db/backup'
import { addDisplacement, check, explainMiss, logValue, snoozePrompt, uncheck } from '../db/repo'
import { setSettings } from '../db/settings'
import { addDays, dayMonth, diffDays, formatTime, isDateStr, parseTime, weekdayName } from '../lib/dates'
import { formatValue, promptQuestion, REASONS } from '../lib/describe'
import type { MissPrompt, ScoreContext } from '../lib/scoring'
import { buildDay, type Snapshot, type TodayGroup, type TodayItem } from '../lib/today'
import type { Commitment, DateStr, ID, MissReason, Task } from '../lib/types'
import { Badge, CheckButton, Chip, DatePickerButton, Screen, Segmented, toast } from '../ui/components'
import { useDisplacements, useSettings, useSnapshot, useSnoozes, useToday } from '../ui/hooks'
import { IconCalendar, IconCheck, IconChevronRight, IconPlus } from '../ui/icons'
import { navigate } from '../ui/router'
import { openQuickAdd } from './QuickAdd'
import { OccurrenceSheet } from './OccurrenceSheet'
import { TaskSheet } from './TaskSheet'

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
  const view = useMemo(() => (snap ? buildDay(snap, viewDate, ctx, snoozes) : null), [snap, viewDate, ctx, snoozes])
  const isPast = viewDate !== today

  if (!snap || !view) return null

  let count = ''
  if (view.total > 0) {
    if (view.open === 0) count = 'all done'
    else if (view.open === view.total) count = `${view.total} ${view.total === 1 ? 'thing' : 'things'}`
    else count = `${view.open} left`
  }

  const onOpen = (item: TodayItem) => {
    if (item.kind === 'log') return setLogFor(snap.commitments.find((c) => c.id === item.subjectId) ?? null)
    if (item.target.kind === 'goal') navigate(`/goals/${item.target.id}`)
    else if (item.target.kind === 'project') navigate(`/projects/${item.target.id}`)
    else setOpenTask(snap.tasks.find((t) => t.id === item.target.id) ?? null)
  }

  return (
    <Screen
      eyebrow={isPast ? `${dayMonth(viewDate)} · past day` : [dayMonth(viewDate), count].filter(Boolean).join(' · ')}
      title={isPast && diffDays(viewDate, today) === 1 ? 'Yesterday' : weekdayName(viewDate)}
      settings
      actions={<>
        {isPast && <button className="btn" onClick={() => navigate('/')}>Today</button>}
        <DatePickerButton className="icon-btn" value={viewDate} max={today} label="Go to a past day"
          onPick={(d) => isDateStr(d) && d <= today && navigate(d === today ? '/' : `/day/${d}`)}>
          <IconCalendar />
        </DatePickerButton>
      </>}
    >
      {view.groups.length === 0 ? (
        <EmptyDay snap={snap} ctx={ctx} isPast={isPast} />
      ) : (
        <>
          <div className="today-filter">
            <Segmented label="Show" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'goals', label: 'Goals' },
              { value: 'projects', label: 'Projects' }, { value: 'tasks', label: 'Tasks' },
            ]} />
          </div>
          {applyFilter(view.groups, filter).map((g) => (
            <Group key={g.key} group={g} snap={snap} date={viewDate} today={today} onOpen={onOpen} />
          ))}
          {applyFilter(view.groups, filter).length === 0 && <p className="muted" style={{ padding: '24px 4px' }}>Nothing here today.</p>}
        </>
      )}

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
          <span className="title">{group.kind === 'errands' ? 'Errands' : group.title}</span>
          <span className="count">{group.items.filter((i) => i.kind !== 'log').length} done</span>
        </button>
      </div>
    )
  }

  const parent = group.goalId ? `/goals/${group.goalId}` : group.projectId ? `/projects/${group.projectId}` : null
  const head = (
    <>
      <div className="text">
        {group.kind === 'errands' ? (
          <div className="group-why">Errands</div>
        ) : (
          <>
            <div className="group-eyebrow">{group.eyebrow}</div>
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
        <div className="item-side"><Badge kind="goal">Log</Badge></div>
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
  if (item.kind === 'commitment') badge = <Badge kind="goal">Goal</Badge>
  else if (item.kind === 'prep') badge = <Badge kind="prep">Prep</Badge>
  else if (item.kind === 'step') {
    badge = (
      <Badge kind="step">
        {item.step!.index}/{item.step!.total}
      </Badge>
    )
  }
  else badge = <Badge kind="task">Task</Badge>

  const miss = item.valueState === 'miss'
  return (
    <li>
      <div className={`item kind-${item.kind} ${item.done ? 'done' : ''}`}>
        <CheckButton shape={shape} checked={item.done} tone={miss ? 'miss' : satisfiedElsewhere ? 'muted' : undefined}
          label={valued ? `Log ${item.title}` : item.title} onClick={toggle} />
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
    return time ? formatTime(item.value) : String(item.value)
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
          placeholder={daily ? '0' : 'add'} aria-label={c.label} autoFocus />
      )}
      {!time && c.unit && <span className="unit">{c.unit}</span>}
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      <button type="submit" className="btn primary" disabled={!ok}>{daily ? 'Save' : 'Add'}</button>
    </form>
  )
}

// ——— miss prompt ———

function MissPromptCard(props: { prompt: MissPrompt; label: string; question: string; today: DateStr; canLog: boolean }) {
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
    toast('Logged.')
  }

  return (
    <div className="prompt" role="group" aria-label={props.question}>
      <div className="prompt-q">{props.question}</div>
      <div className="chips">
        {REASONS.map((r) => (
          <Chip key={r.value} selected={reason === r.value} wide={r.value === 'chose_other'}
            onClick={() => setReason(reason === r.value ? null : r.value)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {reason === 'chose_other' && (
        <>
          <div className="prompt-sub">What took its place?</div>
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
              placeholder={displacements.length ? 'Add another' : 'e.g. what you did instead'} aria-label="What took its place" />
            {newLabel.trim() && <button className="btn" type="submit">Add</button>}
          </form>
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
      </div>

      <div className="actions">
        <div className="row">
          <button className="link-btn" onClick={() => snoozePrompt(props.prompt.commitmentId, props.today)}>Not now</button>
          {props.canLog && (
            <button className="link-btn" onClick={() => navigate(`/day/${props.prompt.slots[0].date}`)}>Log it instead</button>
          )}
        </div>
        <button className="btn primary" disabled={!reason} onClick={save}>Save</button>
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
        <h2>Nothing scheduled that day.</h2>
      </div>
    )
  }
  return (
    <div className="empty">
      <h2>Nothing due today.</h2>
      <p>
        That’s allowed.
        {next && <> Next up is {diffDays(ctx.today, next.date) === 1 ? 'tomorrow' : weekdayName(next.date)}: {next.item.title.toLowerCase()}{next.why ? <>, {lowerFirst(next.why)}</> : null}.</>}
      </p>
      {hasGoals ? (
        <button className="btn outline" onClick={openQuickAdd}>
          Add something for today
        </button>
      ) : (
        <button className="btn primary" onClick={() => navigate('/goals/new')}>Create a goal</button>
      )}
    </div>
  )
}

const lowerFirst = (s: string) => s.replace(/[.!]+$/, '').replace(/^\w/, (c) => c.toLowerCase())

function ExportNudge({ lastExportAt, snap }: { lastExportAt: string | null; snap: Snapshot }) {
  const since = lastExportAt ?? snap.goals.map((g) => g.createdAt).sort()[0]
  if (!since) return null
  const days = (Date.now() - new Date(since).getTime()) / 86_400_000
  if (days < 30) return null
  const run = async () => {
    const result = await shareOrDownload(await exportData())
    if (result !== 'cancelled') {
      await setSettings({ lastExportAt: new Date().toISOString() })
      toast('Exported. Keep it somewhere that isn’t this phone.')
    }
  }
  return (
    <div className="banner" style={{ marginTop: 20 }}>
      <div className="text">{lastExportAt ? 'Last backup over a month ago.' : 'No backup yet.'}</div>
      <button className="btn" onClick={run}>Export</button>
    </div>
  )
}
