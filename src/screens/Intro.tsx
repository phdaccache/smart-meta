import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import signature from '../assets/signature.png'
import { exportData, shareOrDownload } from '../db/backup'
import { createGoal, ensureValue } from '../db/repo'
import { getSettings, setSettings } from '../db/settings'
import { dayMonth, relativeDay } from '../lib/dates'
import { REASONS } from '../lib/describe'
import {
  CHECKIN_TYPES, doneWhenProblem, emptyGoalDraft, validateCommitment, validatePrep, type Errors, type GoalDraft,
} from '../lib/draft'
import {
  addMonths, AREAS, areaInfo, draftFromExample, EXAMPLES, exampleByKey, examplesFor, OBSTACLE_PREPS, projection, toleranceLine,
  type Area, type Example,
} from '../lib/intro'
import { buildDay, type Snapshot } from '../lib/today'
import type { Goal, Shape } from '../lib/types'
import { Badge, CheckButton, Chip, Field, toast } from '../ui/components'
import { useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { IconCheck, IconChevronLeft, IconClose } from '../ui/icons'
import { goBack, match, navigate } from '../ui/router'
import {
  CadenceFields, DateFields, DoneWhenField, GraceField, MeasurementFields, PrepEditor, SmartBar, ToleranceField,
  type Letter, type SetField,
} from './GoalForm'

/**
 * First run: what the app is for, a note from Pedro, a guided first goal that
 * teaches SMART as it's filled in, and how a week works. Every screen can be
 * skipped, and each is its own address so the back gesture walks back.
 */

// ——— state shared by the intro's screens ———

interface IntroState {
  areas: Area[]
  draft: GoalDraft | null
  /** '' = no value. Created on save if it doesn't exist yet. */
  valueName: string
  example: string | null
  goalId: string | null
  /** Opened from Getting started: just the goal, then back to Today. */
  short: boolean
}

const EMPTY: IntroState = { areas: [], draft: null, valueName: '', example: null, goalId: null, short: false }
const STORE_KEY = 'intro-state'
const subs = new Set<() => void>()

let state: IntroState = (() => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY
  } catch {
    return EMPTY
  }
})()

function setIntro(p: Partial<IntroState>) {
  state = { ...state, ...p }
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    // private mode: a reload mid-intro starts the goal over
  }
  subs.forEach((f) => f())
}

export function resetIntro(p: Partial<IntroState> = {}) {
  setIntro({ ...EMPTY, ...p })
}

function useIntro(): IntroState {
  return useSyncExternalStore((l) => {
    subs.add(l)
    return () => subs.delete(l)
  }, () => state)
}

/** Skip or finish: first run leaves the Getting started card on Today. */
async function leaveIntro() {
  const s = await getSettings()
  if (!s.onboarded) await setSettings({ onboarded: true, gettingStarted: true })
  resetIntro()
  navigate('/')
}

// ——— routing ———

/** On an iPhone, Safari and the Home Screen app keep separate data: install first. */
function inIosBrowser(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && nav.standalone !== true && !window.matchMedia('(display-mode: standalone)').matches
}

/** The first screen of a first run, shown at whatever address the app opened on. */
export function IntroStart() {
  return inIosBrowser() ? <IntroHome /> : <IntroWelcome />
}

export function introRoute(path: string): ReactNode | null {
  let m: Record<string, string> | null
  if (path === '/welcome') return <IntroWelcome />
  if (path === '/welcome/home') return <IntroHome />
  if (path === '/welcome/note') return <IntroNote />
  if (path === '/welcome/areas') return <IntroAreas />
  if ((m = match('/welcome/goal/:step', path))) return <IntroGoal key={m.step} step={m.step as Step} />
  if (path === '/welcome/plan') return <IntroPlan />
  if ((m = match('/welcome/week/:n', path))) return <IntroWeek key={m.n} n={Number(m.n) || 1} />
  return null
}

// ——— frame ———

function Frame(props: { back?: string; children: ReactNode; nav?: ReactNode; className?: string }) {
  return (
    <div className={`screen intro ${props.className ?? ''}`}>
      <div className="intro-top">
        {props.back ? (
          <button type="button" className="back" onClick={() => goBack(props.back!)}>
            <IconChevronLeft width={20} height={20} /> Back
          </button>
        ) : <span />}
        <button type="button" className="btn ghost" onClick={leaveIntro}>Skip</button>
      </div>
      {props.children}
      {props.nav && <div className="wizard-nav">{props.nav}</div>}
    </div>
  )
}

// ——— 0 · Home Screen ———

const IconShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 9H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2" /><path d="M12 3v12" /><path d="m8 7 4-4 4 4" />
  </svg>
)

function IntroHome() {
  return (
    <Frame>
      <h1 className="intro-title">Put it on your Home Screen first</h1>
      <p className="intro-sub">It opens like an app and keeps your goals saved on your phone.</p>
      <ol className="intro-steps">
        <li><span className="n">1</span>Tap <b className="share">Share <IconShare /></b></li>
        <li><span className="n">2</span>Tap <b>Add to Home Screen</b></li>
        <li><span className="n">3</span>Open Smart Meta from your Home Screen</li>
      </ol>
      <p className="intro-center">
        <button className="link-btn" onClick={() => navigate('/welcome')}>Continue in Safari</button>
      </p>
    </Frame>
  )
}

// ——— 1 · Welcome ———

const DEMO_HITS = [0, 2, 4]

/** An example goal filling up over a week: the app in use, before any words. */
function WelcomeDemo() {
  const [step, setStep] = useState(() => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 4 : 0))
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setStep((s) => (s + 1) % 8), 900)
    return () => clearInterval(t)
  }, [])
  const hits = Math.min(step, 3)
  const done = step >= 4
  return (
    <div className={`card group tint-goal demo ${done ? 'demo-done' : ''}`} aria-hidden="true">
      <div className="group-head">
        <div className="text">
          <div className="group-eyebrow">Health · Exercise 3× a week</div>
          <div className="group-why">So I have energy to play with my kids.</div>
        </div>
      </div>
      <ul className="items">
        <li>
          <div className={`item kind-commitment ${step >= 1 && step <= 3 ? 'done' : ''}`}>
            <CheckButton shape="circle" checked={step >= 1 && step <= 3} label="" onClick={() => {}} />
            <div className="item-main">
              <div className="item-title">At least 30 minutes of exercise</div>
              <div className="item-detail">{hits} of 3 this week</div>
            </div>
            <div className="item-side"><Badge kind="goal">Goal</Badge></div>
          </div>
        </li>
      </ul>
      <div className="demo-week">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => {
          const on = DEMO_HITS.indexOf(i) > -1 && DEMO_HITS.indexOf(i) < hits
          return <span key={i} className={on ? 'on' : ''}>{on ? <IconCheck width={13} height={13} /> : l}</span>
        })}
        <span className={`demo-status ${done ? 'show' : ''}`}>3 of 3 · on track</span>
      </div>
    </div>
  )
}

function IntroWelcome() {
  return (
    <Frame nav={<button className="btn primary" onClick={() => { resetIntro(); navigate('/welcome/note') }}>Get started</button>}>
      <WelcomeDemo />
      <h1 className="intro-title">Stop dropping goals you never really defined.</h1>
      <p className="intro-sub">Turn them into a weekly plan and start improving now.</p>
      <p className="intro-center">
        <button className="link-btn" onClick={() => navigate('/settings')}>Restore from a backup</button>
      </p>
    </Frame>
  )
}

// ——— 2 · Note ———

function IntroNote() {
  return (
    <Frame back="/welcome" nav={<button className="btn primary" onClick={() => navigate('/welcome/areas')}>Continue</button>}>
      <h1 className="intro-title">A note from Pedro</h1>
      <div className="card pad note">
        <p>I’m always dreaming up goals, projects and new habits, but I never turn them into a real plan. I get lost in my own ideas, and by morning I’ve forgotten what I dreamed of the night before.</p>
        <p>I built this app to help me become the person I want to be. I hope it helps you too.</p>
        <div className="signature" role="img" aria-label="Pedro" style={{ WebkitMaskImage: `url(${signature})`, maskImage: `url(${signature})` }} />
      </div>
    </Frame>
  )
}

// ——— 3 · Areas ———

function IntroAreas() {
  const s = useIntro()
  const toggle = (a: Area) => setIntro({ areas: s.areas.includes(a) ? s.areas.filter((x) => x !== a) : [...s.areas, a] })
  return (
    <Frame back="/welcome/note" nav={<button className="btn primary" onClick={() => navigate('/welcome/goal/s')}>Continue</button>}>
      <h1 className="intro-title">What do you want to work on?</h1>
      <p className="intro-sub">Pick any. We’ll suggest goals to match.</p>
      <div className="chips intro-chips">
        {AREAS.map((a) => <Chip key={a.key} selected={s.areas.includes(a.key)} onClick={() => toggle(a.key)}>{a.label}</Chip>)}
      </div>
    </Frame>
  )
}

// ——— 4–10 · the first goal ———

type Step = 's' | 'm' | 'how' | 'a' | 'r' | 't' | 'prep'
const STEPS: Step[] = ['s', 'm', 'how', 'a', 'r', 't', 'prep']
const LETTER: Record<Step, Letter> = { s: 'S', m: 'M', how: 'M', a: 'A', r: 'R', t: 'T', prep: '+' }
const LINE: Record<Letter, string> = {
  S: 'One clear thing, not a wish.',
  M: 'Decide now what counts, so you never wonder later if you really did it.',
  A: 'Nobody hits 100%. Choose what still counts as on track.',
  R: 'Tie it to something you care about.',
  T: 'A date gives you urgency and focus.',
  '+': 'Make the next try easier.',
}
const FIELDS: Record<Step, (keyof GoalDraft)[]> = {
  s: ['title'],
  m: ['doneWhen', 'measurementDefinition', 'label'],
  how: ['times', 'checkinType', 'targetValue', 'targetTime'],
  a: ['graceDays', 'tolerancePct'],
  r: [],
  t: ['startDate', 'targetDate'],
  prep: ['preps'],
}

const KINDS: { kind: 'outcome' | Shape; title: string; d: string }[] = [
  { kind: 'outcome', title: 'Finish line', d: 'Done once, by a date' },
  { kind: 'rhythm', title: 'Rhythm', d: 'A number of times a week' },
  { kind: 'threshold', title: 'Threshold', d: 'Over or under a line' },
  { kind: 'standard', title: 'Standard', d: 'A rule for when it comes up' },
]

/** The normal form's rules, minus the reason: value and why are optional here. */
function introErrors(d: GoalDraft): Errors<GoalDraft> {
  const outcome = d.goalKind === 'outcome'
  const e: Errors<GoalDraft> = outcome ? {} : { ...validateCommitment(d) }
  if (!d.title.trim()) e.title = 'Name what you want.'
  if (outcome) {
    const m = doneWhenProblem(d.doneWhen)
    if (m) e.doneWhen = m
    if (!d.targetDate) e.targetDate = 'A finish line needs a deadline.'
  }
  if (d.targetDate && d.targetDate <= d.startDate) e.targetDate = 'Must be after the start date.'
  if (d.preps.some((p) => Object.keys(validatePrep(p)).length)) e.preps = 'Finish or remove the prep.'
  return e
}

/** An example from their areas of the same kind, for placeholders. */
function placeholderFor(areas: Area[], d: GoalDraft): Example | undefined {
  const outcome = d.goalKind === 'outcome'
  return EXAMPLES.find((e) => areas.includes(e.area) && (outcome ? e.draft.goalKind === 'outcome' : e.draft.goalKind !== 'outcome' && e.draft.shape === d.shape))
}

function IntroGoal({ step }: { step: Step }) {
  const s = useIntro()
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [other, setOther] = useState(false)

  if (s.goalId) return <IntroPlan />

  const d = s.draft ?? emptyGoalDraft(today)
  const current = () => state.draft ?? emptyGoalDraft(today)
  const set: SetField = (k, v) => setIntro({ draft: { ...current(), [k]: v } })
  const patch = (p: Partial<GoalDraft>) => setIntro({ draft: { ...current(), ...p } })
  const outcome = d.goalKind === 'outcome'
  const steps = STEPS.filter((x) => !(outcome && (x === 'how' || x === 'prep')))
  const at = Math.max(0, steps.indexOf(step))
  const here = steps[at]
  const last = at === steps.length - 1
  const letter = LETTER[here]

  const all = introErrors(d)
  const stepErrors = FIELDS[here].filter((f) => all[f])
  const err = (k: keyof GoalDraft) => (tried ? all[k] : undefined)

  const firstArea = s.areas.length ? areaInfo(AREAS.find((a) => s.areas.includes(a.key))!.key) : null
  const example = s.example ? exampleByKey(s.example) : undefined
  const whyArea = example ? areaInfo(example.area) : firstArea

  const create = async () => {
    if (busy) return
    setBusy(true)
    try {
      const draft = current()
      const valueId = state.valueName.trim() ? await ensureValue(state.valueName) : ''
      const goal = await createGoal({ ...draft, whyValueId: valueId }, { start: true })
      const st = await getSettings()
      if (!st.onboarded) await setSettings({ onboarded: true, gettingStarted: true })
      setIntro({ goalId: goal.id })
      navigate('/welcome/plan', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (stepErrors.length || (last && Object.keys(all).length)) return setTried(true)
    if (last) return create()
    navigate(`/welcome/goal/${steps[at + 1]}`)
  }

  const pick = (e: Example) => {
    if (s.example === e.key) return setIntro({ example: null, draft: emptyGoalDraft(d.startDate), valueName: '' })
    setIntro({ example: e.key, draft: draftFromExample(e, d.startDate), valueName: areaInfo(e.area).value })
  }

  const fit = placeholderFor(s.areas, d)
  let q: string
  let body: ReactNode
  let hint: ReactNode = null
  let label = last ? 'Create goal' : 'Next'

  if (here === 's') {
    q = 'What do you want to achieve?'
    body = (
      <>
        <Field label="Goal" htmlFor="title" error={err('title')}>
          <input id="title" value={d.title} placeholder={firstArea?.title ?? 'Exercise regularly'} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div className="intro-examples">
          <div className="intro-label">Or start from an example</div>
          <div className="chips">
            {examplesFor(s.areas).map((e) => <Chip key={e.key} selected={s.example === e.key} onClick={() => pick(e)}>{e.title}</Chip>)}
          </div>
        </div>
      </>
    )
  } else if (here === 'm') {
    q = 'How will you know?'
    body = (
      <>
        <div className="kind-grid intro-kinds" role="radiogroup" aria-label="Kind">
          {KINDS.map((k) => {
            const on = k.kind === 'outcome' ? outcome : !outcome && d.shape === k.kind
            return (
              <button type="button" key={k.kind} role="radio" aria-checked={on} className={`choice ${on ? 'on' : ''}`}
                onClick={() => patch(k.kind === 'outcome' ? { goalKind: 'outcome' } : {
                  goalKind: 'habit', shape: k.kind, checkinType: CHECKIN_TYPES[k.kind][0], period: k.kind === 'threshold' ? 'day' : 'week',
                })}>
                <div className="t">{k.title}</div>
                <div className="d">{k.d}</div>
              </button>
            )
          })}
        </div>
        <p className="intro-hint">Not sure? Pick one, you can change it later.</p>
        <div style={{ marginTop: 18 }}>
          {outcome
            ? <DoneWhenField d={d} set={set} error={err('doneWhen')} placeholder={fit?.draft.doneWhen ?? 'Signed an offer for a role I want'} />
            : <MeasurementFields d={d} set={patch} e={all} showErrors={tried}
              placeholders={fit ? { definition: fit.draft.measurementDefinition!, label: fit.draft.label! } : undefined} />}
        </div>
      </>
    )
  } else if (here === 'how') {
    q = d.shape === 'rhythm' ? 'How often?' : d.shape === 'threshold' ? 'Where’s the line?' : 'How will you check in?'
    if (d.shape !== 'standard') hint = <p className="intro-hint top">Pick a number you can really hit, not the ideal one.</p>
    body = <CadenceFields d={d} set={patch} e={all} showErrors={tried} />
  } else if (here === 'a') {
    q = 'How much slack?'
    body = outcome
      ? <GraceField value={d.graceDays} onChange={(n) => set('graceDays', n)} />
      : <>
        <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} />
        <p className="intro-hint">{toleranceLine(d.tolerancePct)}</p>
      </>
  } else if (here === 'r') {
    q = 'Why does it matter?'
    const existing = snap?.values.map((v) => v.name) ?? []
    const suggested = [...s.areas.map((a) => areaInfo(a).value), ...(example ? [areaInfo(example.area).value] : [])]
    const names: string[] = []
    for (const n of [...existing, ...suggested, s.valueName]) {
      if (n.trim() && !names.some((x) => x.toLowerCase() === n.trim().toLowerCase())) names.push(n.trim())
    }
    const chosen = (n: string) => s.valueName.trim().toLowerCase() === n.toLowerCase()
    body = (
      <>
        <Field label="Value">
          <div className="chips">
            {names.map((n) => (
              <Chip key={n} selected={chosen(n) && !other} onClick={() => { setOther(false); setIntro({ valueName: chosen(n) ? '' : n }) }}>{n}</Chip>
            ))}
            <Chip selected={other} onClick={() => { setOther(!other); setIntro({ valueName: '' }) }}>Other…</Chip>
          </div>
          {other && (
            <input style={{ marginTop: 10 }} autoFocus aria-label="Your value" placeholder="Freedom" value={s.valueName}
              onChange={(e) => setIntro({ valueName: e.target.value })} />
          )}
        </Field>
        <Field label="Why" htmlFor="why">
          <textarea id="why" rows={2} value={d.whyText} placeholder={whyArea?.why ?? AREAS[0].why} onChange={(e) => set('whyText', e.target.value)} />
        </Field>
        <p className="intro-hint">You’ll see this on Today, right when it’s hard.</p>
      </>
    )
    if (!s.valueName.trim() && !d.whyText.trim()) label = 'Skip'
  } else if (here === 't') {
    q = 'When?'
    const from = d.startDate
    body = (
      <>
        <DateFields d={d} set={set} err={err} />
        <div className="chips" style={{ marginTop: 4 }}>
          {[1, 3, 6].map((n) => {
            const date = addMonths(from, n)
            return (
              <Chip key={n} selected={d.targetDate === date} onClick={() => set('targetDate', d.targetDate === date ? '' : date)}>
                {n === 1 ? 'In 1 month' : `${n} months`}
              </Chip>
            )
          })}
        </div>
      </>
    )
  } else {
    q = 'What usually gets in the way?'
    const has = (title: string) => d.preps.some((p) => p.title === title)
    body = (
      <>
        <div className="chips">
          {OBSTACLE_PREPS.map((o) => (
            <Chip key={o.reason} selected={has(o.prep.title)}
              onClick={() => set('preps', has(o.prep.title) ? d.preps.filter((p) => p.title !== o.prep.title) : [...d.preps, { ...o.prep }].slice(0, 3))}>
              {o.label}
            </Chip>
          ))}
        </div>
        <p className="intro-hint">A prep is a small step beforehand. It’s never scored, and Insights will show whether it helps.</p>
        <div style={{ marginTop: 14 }}>
          <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
        </div>
        {tried && all.preps && <p className="field-error" style={{ marginTop: 10 }}>{all.preps}</p>}
      </>
    )
  }

  const prev = at === 0 ? (s.short ? '/' : '/welcome/areas') : `/welcome/goal/${steps[at - 1]}`
  return (
    <Frame back={prev}
      nav={<button className="btn primary" disabled={busy} onClick={next}>{label}</button>}>
      <div className="eyebrow">Your first goal</div>
      <h1 className="intro-title">Let’s make it SMART.</h1>
      <SmartBar current={letter} />
      <p className="smart-line">{LINE[letter]}</p>
      <div className="card pad smart-card">
        <h2 className="wizard-q">{q}</h2>
        {hint}
        {body}
      </div>
    </Frame>
  )
}

// ——— 11 · plan ———

/** The goal's card as Today will draw it. Ticks here are a demo; nothing is saved. */
function GoalPreview({ goal, snap, demo }: { goal: Goal; snap: Snapshot; demo?: boolean }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const date = goal.startDate > today ? goal.startDate : today
  const view = buildDay(snap, date, { today: date, rolloverHour: settings.rolloverHour })
  const group = view.groups.find((g) => g.goalId === goal.id)
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const eyebrow = goal.whyText ? (value ? `${value.name} · ${goal.title}` : goal.title) : value?.name
  const toggle = (k: string) => {
    if (!demo) return
    const next = new Set(ticked)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setTicked(next)
  }

  return (
    <div className="card group tint-goal preview">
      <div className="group-head">
        <div className="text">
          {eyebrow && <div className="group-eyebrow">{eyebrow}</div>}
          <div className="group-why">{goal.whyText || goal.title}</div>
        </div>
      </div>
      <ul className="items">
        {group ? group.items.map((i) => (
          <li key={i.key}>
            <div className={`item kind-${i.kind} ${ticked.has(i.key) ? 'done' : ''}`}>
              {i.kind === 'log'
                ? <span className="check"><span className="check-box log-box">+</span></span>
                : <CheckButton shape={i.kind === 'commitment' ? 'circle' : 'square'} checked={ticked.has(i.key)} label={i.title} onClick={() => toggle(i.key)} />}
              <div className="item-main">
                <div className="item-title">{i.title}</div>
                {i.detail && <div className="item-detail">{i.detail}</div>}
              </div>
              <div className="item-side"><Badge kind={i.kind === 'prep' ? 'prep' : 'goal'}>{i.kind === 'prep' ? 'Prep' : i.kind === 'log' ? 'Log' : 'Goal'}</Badge></div>
            </div>
          </li>
        )) : (
          <li>
            <div className="item">
              <div className="item-main">
                <div className="item-title">{goal.doneWhen ?? goal.title}</div>
                {goal.targetDate && <div className="item-detail">Deadline {dayMonth(goal.targetDate)}</div>}
              </div>
              <div className="item-side"><Badge kind="goal">Finish line</Badge></div>
            </div>
          </li>
        )}
      </ul>
    </div>
  )
}

function useIntroGoal(): { goal: Goal | undefined; snap: Snapshot | undefined } {
  const s = useIntro()
  const snap = useSnapshot()
  return { goal: snap?.goals.find((g) => g.id === s.goalId), snap }
}

function Lost() {
  // A reload after the session ended: the goal is saved, the tour isn't worth restarting.
  useEffect(() => { leaveIntro() }, [])
  return null
}

function IntroPlan() {
  const s = useIntro()
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const { goal, snap } = useIntroGoal()
  if (!snap) return null
  if (!goal) return <Lost />
  const waiting = goal.state === 'backlog'
  const when = goal.startDate <= today ? 'today' : relativeDay(goal.startDate, today) === 'tomorrow' ? 'tomorrow' : `on ${dayMonth(goal.startDate)}`
  const line = s.draft ? projection(s.draft, today) : ''
  return (
    <Frame nav={<button className="btn primary" onClick={() => (s.short ? leaveIntro() : navigate('/welcome/week/1'))}>
      {s.short ? 'Go to Today' : 'Continue'}
    </button>}>
      <div className="eyebrow">Your plan</div>
      <h1 className="intro-title">{waiting ? `${goal.title} is in your backlog` : `${goal.title} starts ${when}`}</h1>
      {waiting && <p className="intro-sub">You already have {settings.goalCap} active goals. Start it from Plan when there’s room.</p>}
      <GoalPreview goal={goal} snap={snap} />
      {line && <p className="intro-projection">{line}</p>}
    </Frame>
  )
}

// ——— 12 · how a week works ———

function IntroWeek({ n }: { n: number }) {
  const { goal, snap } = useIntroGoal()
  const [reason, setReason] = useState<string | null>(null)
  const touch = useRef<number | null>(null)
  if (!snap) return null
  if (!goal) return <Lost />
  const label = snap.commitments.find((c) => c.goalId === goal.id)?.label ?? goal.title.toLowerCase()
  const outcome = goal.kind === 'outcome'
  const forward = () => (n >= 3 ? leaveIntro() : navigate(`/welcome/week/${n + 1}`))
  const backTo = n === 1 ? '/welcome/plan' : `/welcome/week/${n - 1}`

  let title: string
  let text: ReactNode
  let demo: ReactNode
  if (n === 1) {
    title = 'Every day, one tap'
    text = outcome
      ? <>Break <i>{goal.title}</i> into steps and tasks. They show up on Today, one tap to tick.</>
      : <>Open Today and tick <i>{goal.title}</i> when you do it.</>
    demo = <GoalPreview goal={goal} snap={snap} demo />
  } else if (n === 2) {
    title = 'Missed? Say why'
    text = 'No guilt in missing. Just log it, and later you’ll discover why.'
    demo = (
      <div className="card prompt demo-prompt">
        <div className="prompt-q">What got in the way of {outcome ? 'it' : label}?</div>
        <div className="chips">
          {REASONS.map((r) => <Chip key={r.value} selected={reason === r.value} onClick={() => setReason(reason === r.value ? null : r.value)}>{r.label}</Chip>)}
        </div>
        {reason && <p className="small muted" style={{ marginTop: 12 }}>Later, Insights shows what gets in your way most.</p>}
      </div>
    )
  } else {
    title = 'Review your goals'
    text = 'Once a week, Review looks back at last week and suggests a fix, like a prep when you keep forgetting.'
    demo = (
      <div className="card pad demo-review">
        <div className="group-eyebrow">Last week</div>
        <div className="group-why">{goal.title}</div>
        <div className="demo-review-row">
          <span>Forgot 2 times</span>
          <span className="btn outline small-btn" aria-hidden="true">Add a prep</span>
        </div>
      </div>
    )
  }

  return (
    <div onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        const start = touch.current
        touch.current = null
        if (start == null) return
        const dx = e.changedTouches[0].clientX - start
        if (dx < -60) forward()
        else if (dx > 60) goBack(backTo)
      }}>
      <Frame back={backTo} nav={<button className="btn primary" onClick={forward}>{n >= 3 ? 'Go to Today' : 'Next'}</button>}>
        <div className="intro-dots" aria-label={`${n} of 3`}>{[1, 2, 3].map((i) => <i key={i} className={i === n ? 'on' : ''} />)}</div>
        <h1 className="intro-title">{title}</h1>
        <p className="intro-sub">{text}</p>
        {demo}
      </Frame>
    </div>
  )
}

// ——— 13 · Getting started, on Today ———

export function GettingStarted({ snap }: { snap: Snapshot }) {
  const settings = useSettings()
  const weekReviews = useWeekReviews()
  if (!settings.gettingStarted) return null
  const items = [
    { key: 'goal', done: snap.goals.length > 0, title: 'Create your first goal', action: () => { resetIntro({ short: true }); navigate('/welcome/goal/s') } },
    { key: 'check', done: snap.entries.some((e) => !e.deletedAt) || snap.occurrences.length > 0, title: 'Check in for the first time' },
    { key: 'review', done: (weekReviews ?? []).some((w) => !!w.doneAt), title: 'Do your first weekly review', sub: 'From Monday', action: () => navigate('/review') },
    {
      key: 'backup', done: !!settings.lastExportAt, title: 'Back up your data', sub: 'Your goals live only on this phone',
      action: async () => {
        const r = await shareOrDownload(await exportData())
        if (r !== 'cancelled') {
          await setSettings({ lastExportAt: new Date().toISOString() })
          toast('Exported. Keep it somewhere that isn’t this phone.')
        }
      },
    },
  ]
  if (items.every((i) => i.done)) return null
  return (
    <div className="card getting-started">
      <div className="gs-head">
        <h2>Getting started</h2>
        <button className="icon-btn" aria-label="Hide Getting started" onClick={() => setSettings({ gettingStarted: false })}><IconClose width={18} height={18} /></button>
      </div>
      <ul>
        {items.map((i) => {
          const inner = (
            <>
              <span className={`gs-mark ${i.done ? 'on' : ''}`}>{i.done && <IconCheck width={13} height={13} />}</span>
              <span className="gs-text">
                <span className="gs-title">{i.title}</span>
                {i.sub && !i.done && <span className="gs-sub">{i.sub}</span>}
              </span>
            </>
          )
          return (
            <li key={i.key} className={i.done ? 'done' : ''}>
              {i.action && !i.done ? <button className="gs-row" onClick={i.action}>{inner}</button> : <div className="gs-row">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
