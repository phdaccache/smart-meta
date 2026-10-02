import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import creator from '../assets/creator.jpg'
import signature from '../assets/signature.png'
import { exportData, shareOrDownload } from '../db/backup'
import { db } from '../db/db'
import { commitmentFields, createGoal, ensureValue } from '../db/repo'
import { getSettings, setSettings } from '../db/settings'
import { getLang, setLangSetting, t, tk, type Key } from '../i18n'
import { dayMonth, diffDays } from '../lib/dates'
import { cadenceText } from '../lib/describe'
import { doneWhenProblem, emptyGoalDraft, validateCommitment, validatePrep, type Errors, type GoalDraft } from '../lib/draft'
import {
  AREAS, areaInfo, draftFromExample, EXAMPLES, exampleByKey, examplesFor, piecesFor, projection, type Area, type Example, type Pieces,
} from '../lib/intro'
import { MAINTENANCE_WEEKS } from '../lib/review'
import { buildDay, type Snapshot } from '../lib/today'
import type { Commitment, Goal } from '../lib/types'
import { Badge, CheckButton, Chip, Field, toast } from '../ui/components'
import { useSettings, useSnapshot, useToday, useWeekReviews } from '../ui/hooks'
import { FlagBR, FlagUS, IconCheck, IconChevronLeft, IconClose } from '../ui/icons'
import { goBack, match, navigate } from '../ui/router'
import {
  AchieveFields, KindField, MeasureFields, measureFields, PrepFields, PrepHead, SMART, SMART_LINE, SMART_Q, SmartBar, TimeFields, TitleFields, WhyText,
  type SetField, type SmartLetter,
} from './GoalForm'

/**
 * First run: what the app is for, a note from Pedro, a guided first goal that
 * teaches SMART as it's filled in (the same steps as New goal), a prep to make
 * it easier, then the plan, the weekly review and the other pieces. Every
 * screen can be skipped, and each is its own address so the back gesture
 * walks back.
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
  if (path === '/welcome/review') return <IntroReview />
  if (path === '/welcome/pieces') return <IntroPieces />
  return null
}

// ——— frame ———

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Frame(props: {
  back?: string; lead?: ReactNode; children: ReactNode; nav?: ReactNode; below?: ReactNode; className?: string
  /** A tap anywhere that isn't a control does what the main button does (the screens that play out step by step). */
  onTap?: () => void
}) {
  const tap = props.onTap && ((e: MouseEvent) => {
    // Controls, and the goal's preview (it can be ticked), keep their own taps.
    if (!(e.target as HTMLElement).closest('button, a, input, textarea, select, label, [role="radio"], .preview')) props.onTap!()
  })
  return (
    <div className={`screen intro ${props.className ?? ''}`} onClick={tap}>
      <div className="intro-top">
        {props.back ? (
          <button type="button" className="back" onClick={() => goBack(props.back!)}>
            <IconChevronLeft width={20} height={20} /> {t('nav.back')}
          </button>
        ) : props.lead ?? <span />}
        <button type="button" className="btn ghost" onClick={leaveIntro}>{t('common.skip')}</button>
      </div>
      <div className="intro-body">{props.children}</div>
      {props.nav && (
        <div className="wizard-nav intro-nav">
          {props.nav}
          {props.below}
        </div>
      )}
    </div>
  )
}

// ——— language ———

/** Brazil and USA flags on the first screen: the language can be picked before anything else. */
function LanguageFlags() {
  const lang = getLang()
  return (
    <div className="lang-flags" role="radiogroup" aria-label={t('set.language')}>
      <button type="button" role="radio" aria-checked={lang === 'pt-BR'} aria-label={t('intro.langPortuguese')}
        className={lang === 'pt-BR' ? 'on' : ''} onClick={() => setLangSetting('pt-BR')}><FlagBR /></button>
      <button type="button" role="radio" aria-checked={lang === 'en'} aria-label={t('intro.langEnglish')}
        className={lang === 'en' ? 'on' : ''} onClick={() => setLangSetting('en')}><FlagUS /></button>
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
    <Frame className="centered" lead={<LanguageFlags />}>
      <h1 className="intro-title">{t('intro.homeTitle')}</h1>
      <p className="intro-sub">{t('intro.homeSub')}</p>
      <ol className="intro-steps">
        <li><span className="n">1</span>{t('intro.homeTap')} <b className="share">{t('intro.homeShare')} <IconShare /></b></li>
        <li><span className="n">2</span>{t('intro.homeTap')} <b>{t('intro.homeAdd')}</b></li>
        <li><span className="n">3</span>{t('intro.homeOpen')}</li>
      </ol>
      <p className="intro-center">
        <button className="quiet-link" onClick={() => navigate('/welcome')}>{t('intro.continueSafari')}</button>
      </p>
    </Frame>
  )
}

// ——— 1 · Welcome ———

/** Loose goals, scattered: where each one floats (left as a share of the width, top in px) and its tilt. */
const MESS: { x: number; y: number; r: number }[] = [
  { x: 6, y: 18, r: -7 },
  { x: 48, y: 4, r: 5 },
  { x: 26, y: 78, r: -3 },
  { x: 54, y: 122, r: 8 },
  { x: 2, y: 160, r: 4 },
]
const MESS_WORDS: Key[] = ['intro.mess.1', 'intro.mess.2', 'intro.mess.3', 'intro.mess.4', 'intro.mess.5']
/** Steps of 600 ms: floating, then a list, then each one ticked, a long look, then back to floating. */
const SNAP_AT = 4
const TICKS_AT = [8, 9, 10, 11, 12]
const LOOP = 21

/**
 * Goals floating around loose, tilted and overlapping, then snapping into a
 * plan: a list, with the first ones ticked. The app's promise, before any
 * words to read.
 */
function WelcomeDemo() {
  const [step, setStep] = useState(() => (reducedMotion() ? TICKS_AT[TICKS_AT.length - 1] : 0))
  useEffect(() => {
    if (reducedMotion()) return
    const timer = setInterval(() => setStep((s) => (s + 1) % LOOP), 600)
    return () => clearInterval(timer)
  }, [])
  const plan = step >= SNAP_AT
  return (
    <div className={`mess ${plan ? 'plan' : ''}`} aria-hidden="true">
      {MESS_WORDS.map((k, i) => {
        const m = MESS[i]
        const ticked = plan && step >= TICKS_AT[i]
        return (
          <div key={k} className="mess-item" style={plan
            ? { left: '16px', top: `${16 + i * 40}px`, transform: 'rotate(0deg)', transitionDelay: `${i * 150}ms` }
            : { left: `${m.x}%`, top: `${m.y}px`, transform: `rotate(${m.r}deg)`, transitionDelay: `${(4 - i) * 120}ms` }}>
            <span className="mess-float" style={{ animationDelay: `${-i * 0.7}s` }}>
              <span className={`mess-check ${ticked ? 'on' : ''}`}>{ticked && <IconCheck width={12} height={12} />}</span>
              {tk(k)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function IntroWelcome() {
  return (
    <Frame className="centered welcome" lead={<LanguageFlags />}
      nav={<button className="btn primary" onClick={() => { resetIntro(); navigate('/welcome/note') }}>{t('intro.getStarted')}</button>}
      below={<button className="quiet-link" onClick={() => navigate('/settings?view=restore')}>{t('intro.restore')}</button>}>
      <WelcomeDemo />
      <h1 className="intro-title">{t('intro.headline')}</h1>
      <p className="intro-sub">{t('intro.sub')}</p>
    </Frame>
  )
}

// ——— 2 · Note ———

function IntroNote() {
  return (
    <Frame className="centered note-page" back="/welcome" nav={<button className="btn primary" onClick={() => navigate('/welcome/areas')}>{t('common.continue')}</button>}>
      <img className="creator" src={creator} alt="Pedro Daccache" width={76} height={76} />
      <h1 className="intro-title">{t('intro.noteTitle')}</h1>
      <div className="note">
        <p><b>{t('intro.noteThanks')}</b></p>
        <p>{t('intro.note1')}</p>
        <p>{t('intro.note2')}</p>
        <p>{t('intro.note3')}</p>
        <p>{t('intro.noteBye')}</p>
        <div className="signature" role="img" aria-label="Pedro Daccache" style={{ WebkitMaskImage: `url(${signature})`, maskImage: `url(${signature})` }} />
      </div>
    </Frame>
  )
}

// ——— 3 · Areas ———

function IntroAreas() {
  const s = useIntro()
  const toggle = (a: Area) => {
    const areas = s.areas.includes(a) ? s.areas.filter((x) => x !== a) : [...s.areas, a]
    setIntro({ areas })
    // Kept beyond the intro: New goal offers templates from these areas first.
    setSettings({ areas })
  }
  return (
    <Frame className="centered" back="/welcome/note" nav={<button className="btn primary" onClick={() => navigate('/welcome/goal/smart')}>{t('intro.createFirst')}</button>}>
      <h1 className="intro-title">{t('intro.areasTitle')}</h1>
      <p className="intro-sub">{t('intro.areasSub')}</p>
      <div className="chips intro-chips">
        {AREAS.map((a) => <Chip key={a.key} selected={s.areas.includes(a.key)} onClick={() => toggle(a.key)}>{a.label}</Chip>)}
      </div>
    </Frame>
  )
}

// ——— 4–9 · the first goal: S M A R T, then a prep ———

/** 'smart' first says what the letters stand for, then one step per letter, then a prep. */
type Step = 'smart' | 's' | 'm' | 'a' | 'r' | 't' | 'prep'
const STEPS: Step[] = ['smart', 's', 'm', 'a', 'r', 't', 'prep']
const LETTER: Record<Exclude<Step, 'smart' | 'prep'>, SmartLetter> = { s: 'S', m: 'M', a: 'A', r: 'R', t: 'T' }

function fieldsFor(step: Step, d: GoalDraft): (keyof GoalDraft)[] {
  if (step === 's') return ['title', 'label']
  if (step === 'm') return measureFields(d)
  if (step === 'a') return ['graceDays', 'tolerancePct']
  if (step === 't') return ['startDate', 'targetDate']
  if (step === 'prep') return ['preps']
  return []
}

/** The normal form's rules, minus the reason: value and why are optional here. */
function introErrors(d: GoalDraft): Errors<GoalDraft> {
  const outcome = d.goalKind === 'outcome'
  const e: Errors<GoalDraft> = outcome ? {} : { ...validateCommitment(d) }
  if (!d.title.trim()) e.title = t('err.nameWhat')
  if (outcome) {
    const m = doneWhenProblem(d.doneWhen)
    if (m) e.doneWhen = m
  }
  if (!d.targetDate) e.targetDate = outcome ? t('err.needsDeadline') : t('err.lookBack')
  if (d.targetDate && d.targetDate <= d.startDate) e.targetDate = t('err.afterStart')
  if (d.preps.some((p) => Object.keys(validatePrep(p)).length)) e.preps = t('err.finishPrep')
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
  // Adding a value of their own, as in New goal: a name, then Add.
  const [adding, setAdding] = useState(false)
  const [newValue, setNewValue] = useState('')

  if (s.goalId) return <IntroPlan />

  const d = s.draft ?? emptyGoalDraft(today)
  const current = () => state.draft ?? emptyGoalDraft(today)
  const set: SetField = (k, v) => setIntro({ draft: { ...current(), [k]: v } })
  const patch = (p: Partial<GoalDraft>) => setIntro({ draft: { ...current(), ...p } })
  const outcome = d.goalKind === 'outcome'
  const steps = STEPS.filter((x) => !(outcome && x === 'prep'))
  const at = Math.max(0, steps.indexOf(step))
  const here = steps[at]
  const last = at === steps.length - 1

  const all = introErrors(d)
  const stepErrors = fieldsFor(here, d).filter((f) => all[f])
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
    setTried(false)
    navigate(`/welcome/goal/${steps[at + 1]}`)
  }

  const pick = (e: Example) => {
    if (s.example === e.key) return setIntro({ example: null, draft: emptyGoalDraft(d.startDate), valueName: '' })
    setIntro({ example: e.key, draft: draftFromExample(e, d.startDate), valueName: areaInfo(e.area).value })
  }

  const fit = placeholderFor(s.areas, d)
  let body: ReactNode
  let extra: ReactNode = null
  let label = last ? t('intro.createGoal') : t('common.next')

  if (here === 's') {
    body = (
      <TitleFields d={d} set={set} err={err}>
        <div className="intro-examples">
          <div className="intro-label">{t('intro.orExample')}</div>
          <div className="chips">
            {examplesFor(s.areas).map((e) => <Chip key={e.key} selected={s.example === e.key} onClick={() => pick(e)}>{e.title}</Chip>)}
          </div>
        </div>
      </TitleFields>
    )
  } else if (here === 'm') {
    body = <KindField d={d} patch={patch} />
    extra = <MeasureFields d={d} set={set} patch={patch} errors={all} showErrors={tried}
      placeholders={{ doneWhen: fit?.draft.doneWhen ?? t('intro.phDoneWhen'), definition: fit?.draft.measurementDefinition }} />
  } else if (here === 'a') {
    body = <AchieveFields d={d} set={set} err={err} />
  } else if (here === 'r') {
    const existing = snap?.values.filter((v) => !v.deletedAt).map((v) => v.name) ?? []
    const suggested = [...s.areas.map((a) => areaInfo(a).value), ...(example ? [areaInfo(example.area).value] : [])]
    const names: string[] = []
    for (const n of [...existing, ...suggested, s.valueName]) {
      if (n.trim() && !names.some((x) => x.toLowerCase() === n.trim().toLowerCase())) names.push(n.trim())
    }
    const chosen = (n: string) => s.valueName.trim().toLowerCase() === n.toLowerCase()
    const open = adding || names.length === 0
    const add = () => {
      if (!newValue.trim()) return
      setIntro({ valueName: newValue.trim() })
      setNewValue('')
      setAdding(false)
    }
    body = (
      <>
        <WhyText text={d.whyText} onText={(x) => set('whyText', x)} placeholder={whyArea?.why ?? AREAS[0].why} labelled={false} />
        <Field label={t('form.value')}>
          {names.length > 0 && (
            <div className="chips">
              {names.map((n) => (
                <Chip key={n} selected={chosen(n)} onClick={() => setIntro({ valueName: chosen(n) ? '' : n })}>{n}</Chip>
              ))}
              {!open && <Chip selected={false} onClick={() => setAdding(true)}>{t('form.newValue')}</Chip>}
            </div>
          )}
          {open && (
            <>
              {names.length === 0 && <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('form.firstValueHint')}</p>}
              <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add() }} style={names.length ? { marginTop: 10 } : undefined}>
                <input value={newValue} aria-label={t('form.valueName')} placeholder={t('intro.phValue')} autoFocus={adding}
                  onChange={(e) => setNewValue(e.target.value)} />
                <button type="submit" className="btn outline" disabled={!newValue.trim()}>{t('common.add')}</button>
              </form>
            </>
          )}
        </Field>
      </>
    )
    if (!s.valueName.trim() && !d.whyText.trim()) label = t('common.skip')
  } else if (here === 't') {
    body = <TimeFields d={d} set={set} err={err} />
  } else {
    body = (
      <>
        <PrepFields preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
        {tried && all.preps && <p className="field-error" style={{ marginTop: 10 }}>{all.preps}</p>}
      </>
    )
  }

  const prev = at === 0 ? (s.short ? '/' : '/welcome/areas') : `/welcome/goal/${steps[at - 1]}`
  if (here === 'smart') {
    return (
      <Frame className="centered smart-intro" back={prev} nav={<button className="btn primary" onClick={next}>{t('common.next')}</button>}>
        <h1 className="intro-title">{t('intro.goalTitle')}</h1>
        <div className="smart-reveal">
          {SMART.map((x, i) => (
            <div key={x.k} className="smart-row" style={{ animationDelay: `${500 + i * 450}ms` }}>
              <span className="smart-l on">{x.k}</span>
              <span className="smart-row-word">{tk(x.word)}</span>
            </div>
          ))}
        </div>
      </Frame>
    )
  }
  const letter = LETTER[here as Exclude<Step, 'smart' | 'prep'>]
  return (
    <Frame back={prev} nav={<button className="btn primary" disabled={busy} onClick={next}>{label}</button>}>
      {here === 'prep' ? <PrepHead big /> : (
        <>
          <SmartBar current={letter} big />
          <p className="smart-line">{tk(SMART_LINE[letter])}</p>
        </>
      )}
      <div className="card pad smart-card">
        <h2 className="wizard-q">{here === 'prep' ? t('intro.qInTheWay') : tk(SMART_Q[letter])}</h2>
        {body}
      </div>
      {extra && <div className="card pad smart-card second">{extra}</div>}
    </Frame>
  )
}

// ——— 10 · plan ———

/** The goal's card as Today will draw it. Ticks here are a demo; nothing is saved. */
function GoalPreview({ goal, snap }: { goal: Goal; snap: Snapshot }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const date = goal.startDate > today ? goal.startDate : today
  // Drawn as it will be once it runs, even while it waits in the backlog.
  const running = { ...snap, goals: snap.goals.map((g) => (g.id === goal.id ? { ...g, state: 'active' as const } : g)) }
  const view = buildDay(running, date, { today: date, rolloverHour: settings.rolloverHour })
  const group = view.groups.find((g) => g.goalId === goal.id)
  const value = snap.values.find((v) => v.id === goal.whyValueId)
  const eyebrow = goal.whyText ? (value ? `${value.name} · ${goal.title}` : goal.title) : value?.name
  const toggle = (k: string) => {
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
              <div className="item-side">
                <Badge kind={i.kind === 'prep' ? 'prep' : 'goal'}>{t(i.kind === 'prep' ? 'common.prep' : i.kind === 'log' ? 'common.log' : 'common.goal')}</Badge>
              </div>
            </div>
          </li>
        )) : (
          <li>
            <div className="item">
              <div className="item-main">
                <div className="item-title">{goal.doneWhen ?? goal.title}</div>
                {goal.targetDate && <div className="item-detail">{t('goal.deadline')} {dayMonth(goal.targetDate)}</div>}
              </div>
              <div className="item-side"><Badge kind="goal">{t('plan.finishLine')}</Badge></div>
            </div>
          </li>
        )}
      </ul>
    </div>
  )
}

/**
 * The goal the intro just saved. Right after saving, the snapshot can still be
 * the one from before (it's kept while the new one loads): only a goal that
 * isn't in the database at all means the session was lost.
 */
function useIntroGoal(): { goal: Goal | undefined; snap: Snapshot | undefined; lost: boolean } {
  const s = useIntro()
  const snap = useSnapshot()
  const saved = useLiveQuery(async () => (s.goalId ? !!(await db.goals.get(s.goalId)) : false), [s.goalId])
  const goal = snap?.goals.find((g) => g.id === s.goalId)
  return { goal, snap, lost: !goal && saved === false }
}

function Lost() {
  // A reload after the session ended: the goal is saved, the tour isn't worth restarting.
  useEffect(() => { leaveIntro() }, [])
  return null
}

/** Counts up to the number at the start of `text` ("42×", "74 days"), the rest as it is. */
function CountUp({ text, run }: { text: string; run: boolean }) {
  const m = /^(\d+)(.*)$/s.exec(text)
  const target = m ? Number(m[1]) : 0
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run || !m) return
    if (reducedMotion()) return setN(target)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700)
      setN(Math.round(target * (1 - (1 - p) ** 3)))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [run, target])
  return <>{m ? `${run ? n : target}${m[2]}` : text}</>
}

function IntroPlan() {
  const s = useIntro()
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const { goal, snap, lost } = useIntroGoal()
  // Continue first shows what the plan adds up to, then moves on.
  const [shown, setShown] = useState(false)
  if (lost) return <Lost />
  if (!snap || !goal) return null
  const waiting = goal.state === 'backlog'
  const name = goal.title
  const starts = goal.startDate <= today ? t('intro.startsToday', { name })
    : diffDays(today, goal.startDate) === 1 ? t('intro.startsTomorrow', { name })
    : t('intro.startsOn', { name, date: dayMonth(goal.startDate) })
  const p = s.draft ? projection(s.draft, today) : null
  const forward = () => {
    if (p && !shown) return setShown(true)
    if (s.short) return leaveIntro()
    navigate('/welcome/review')
  }
  return (
    <Frame onTap={forward} nav={<button className="btn primary" onClick={forward}>
      {s.short && (shown || !p) ? t('intro.goToday') : t('common.continue')}
    </button>}>
      <div className="intro-head">
        <div className="eyebrow">{t('intro.planEyebrow')}</div>
        <h1 className="intro-title">{waiting ? t('intro.inBacklog', { name }) : starts}</h1>
        {waiting && <p className="intro-sub">{t('intro.inBacklogSub', { n: settings.goalCap })}</p>}
      </div>
      <GoalPreview goal={goal} snap={snap} />
      {!waiting && <p className="intro-hint center">{t(goal.kind === 'outcome' ? 'intro.tickHintFinish' : 'intro.tickHint')}</p>}
      {p && (
        <div className={`intro-projection ${shown ? 'shown' : ''}`}>
          <p className="proj-line">{p.line}</p>
          <div className="proj-reveal" aria-hidden={!shown}>
            <div>
              <div className="proj-big"><CountUp text={p.big} run={shown} /></div>
              <div className="proj-caption">{p.caption}</div>
            </div>
          </div>
        </div>
      )}
    </Frame>
  )
}

// ——— 11 · the weekly review ———

/** The goal the demos talk about: theirs if it's a habit, an example otherwise. */
function useDemoGoal(): { title: string; label: string } {
  const s = useIntro()
  const d = s.draft
  if (d && d.goalKind !== 'outcome' && d.title.trim()) return { title: d.title.trim(), label: d.label.trim() || d.title.trim() }
  const e = exampleByKey('exercise')!
  return { title: e.title, label: e.draft.label ?? e.title }
}

function IntroReview() {
  const { title, label } = useDemoGoal()
  // 0: the panel opens, blurred. 1–3: a week's suggestion each.
  const [stage, setStage] = useState(0)
  const forward = () => (stage < 3 ? setStage(stage + 1) : navigate('/welcome/pieces'))
  const cards: { week: number; evidence: string; q: Key; a: Key }[] = [
    { week: 2, evidence: t('intro.rev.forgot', { name: label }), q: 'review.q.addPrep', a: 'review.a.addPrep' },
    { week: 5, evidence: t('intro.rev.tired', { name: label }), q: 'review.q.lowerTarget', a: 'review.a.edit' },
    { week: 13, evidence: t('review.ev.onTrackAll', { n: MAINTENANCE_WEEKS }), q: 'review.q.maintenance', a: 'review.a.maintenance' },
  ]
  const shown = Math.max(stage, 1) - 1
  return (
    <Frame back="/welcome/plan" onTap={forward} nav={<button className="btn primary" onClick={forward}>{t('common.continue')}</button>}>
      <div className="intro-head">
        <h1 className="intro-title">{t('intro.weekThreeTitle')}</h1>
        <p className="intro-sub">{t('intro.reviewSub')}</p>
      </div>
      <div className={`rev-panel ${stage === 0 ? 'blurred' : ''}`}>
        <div className="rev-inner">
          {/* The goal stays; only its suggestion changes: each one hops, then drops away to show the next. */}
          <div className="card tint-goal rev-card">
            <div className="group-head">
              <div className="text">
                <div key={shown} className="group-eyebrow rev-week">{t('intro.rev.week', { n: cards[shown].week })}</div>
                <div className="goal-card-title">{title}</div>
              </div>
            </div>
            <div className="rev-stack">
              {cards.map((c, i) => (
                <div key={c.week} className={`suggestion rev-sugg ${i < shown ? 'gone' : ''}`} style={{ zIndex: cards.length - i }}
                  aria-hidden={i !== shown || stage === 0}>
                  <div className="suggestion-q">{tk(c.q)}</div>
                  <div className="small muted">{c.evidence}</div>
                  <div className="actions">
                    <span />
                    <span className="btn primary small-btn" aria-hidden="true">{tk(c.a)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="intro-dots rev-dots" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i === stage ? 'on' : ''} />)}</div>
    </Frame>
  )
}

// ——— 12 · not only goals ———

type PieceKey = keyof Pieces
const PIECES: { key: PieceKey; badge: 'task' | 'step' | 'prep' | 'goal'; name: Key; what: Key }[] = [
  { key: 'task', badge: 'task', name: 'common.task', what: 'intro.pieces.taskWhat' },
  { key: 'project', badge: 'step', name: 'common.project', what: 'intro.pieces.projectWhat' },
  { key: 'prep', badge: 'prep', name: 'common.prep', what: 'intro.pieces.prepWhat' },
  { key: 'habit', badge: 'goal', name: 'intro.pieces.habit', what: 'intro.pieces.habitWhat' },
]
/** The order they leave the row and join the goal. */
const JOIN: PieceKey[] = ['habit', 'prep', 'project', 'task']
const JOIN_START = 300
const JOIN_STEP = 750

/** The goal's own habit, as Today would describe it ("gym · 3× a week"). */
function habitText(d: GoalDraft | null): string | null {
  if (!d || d.goalKind === 'outcome' || !d.label.trim()) return null
  return `${d.label.trim()} · ${cadenceText(commitmentFields(d) as Commitment)}`
}

/**
 * The other pieces, about their goal, one at a time: each shows up large, then
 * shrinks into a row. With all four in the row, Join everything sends them into
 * the goal, one after another (habit, prep, project, task).
 */
function IntroPieces() {
  const s = useIntro()
  const { title } = useDemoGoal()
  const goalTitle = s.draft?.title.trim() || title
  const pieces = piecesFor(s.draft, s.example, habitText(s.draft))
  // 0–3: one piece large. 4: all four in the row. 5: inside the goal.
  const [stage, setStage] = useState(() => (reducedMotion() ? 5 : 0))
  const label = stage >= 5 ? t('intro.goToday') : stage === 4 ? t('intro.pieces.join') : t('common.continue')

  // Joining: each chip starts where it sat in the row and moves into the goal (FLIP).
  const chips = useRef(new Map<PieceKey, HTMLElement>())
  const rects = useRef(new Map<PieceKey, DOMRect>())
  const chipRef = (k: PieceKey) => (el: HTMLElement | null) => {
    if (el) chips.current.set(k, el)
    else chips.current.delete(k)
  }
  useLayoutEffect(() => {
    if (stage === 5 && !reducedMotion()) {
      JOIN.forEach((k, i) => {
        const el = chips.current.get(k)
        const from = rects.current.get(k)
        if (!el || !from) return
        const to = el.getBoundingClientRect()
        el.style.transition = 'none'
        el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`
        void el.offsetWidth
        el.style.transition = `transform 1.1s cubic-bezier(0.45, 0, 0.2, 1) ${JOIN_START + i * JOIN_STEP}ms`
        el.style.transform = ''
      })
    }
  }, [stage])
  const forward = () => {
    if (stage >= 5) return leaveIntro()
    // Where each chip is as Join everything is pressed: that's where it leaves from.
    if (stage === 4) rects.current = new Map([...chips.current].map(([k, el]) => [k, el.getBoundingClientRect()]))
    setStage(stage + 1)
  }

  const chip = (p: (typeof PIECES)[number]) => (
    <span key={p.key} ref={chipRef(p.key)} className="piece-chip"><Badge kind={p.badge}>{tk(p.name)}</Badge></span>
  )
  const piece = PIECES[stage]
  return (
    <Frame back="/welcome/review" onTap={forward} nav={<button className="btn primary" onClick={forward}>{label}</button>}>
      <div className="intro-head">
        <h1 className="intro-title">{t('intro.pieces.title')}</h1>
      </div>
      <div className="pieces">
        <div className="piece-tray" aria-hidden="true">{stage < 5 && PIECES.slice(0, stage).map(chip)}</div>
        {stage < 4 && (
          <div key={stage} className="card pad piece-card">
            <Badge kind={piece.badge}>{tk(piece.name)}</Badge>
            <div className="piece-what">{tk(piece.what)}</div>
            <div className="piece-eg">{pieces[piece.key]}</div>
          </div>
        )}
        {stage >= 4 && <p className="intro-sub pieces-end">{t('intro.pieces.end')}</p>}
        {stage === 5 && (
          <div className="card group tint-goal piece-goal">
            <div className="group-head">
              <div className="text">
                <div className="group-eyebrow">{t('common.goal')}</div>
                <div className="group-why">{goalTitle}</div>
              </div>
            </div>
            <div className="piece-inside">
              {JOIN.map((k, i) => (
                <div key={k} className="piece-row">
                  {chip(PIECES.find((p) => p.key === k)!)}
                  <span className="piece-text" style={{ animationDelay: `${JOIN_START + i * JOIN_STEP + 900}ms` }}>{pieces[k]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Frame>
  )
}

// ——— Getting started, on Today ———

export function GettingStarted({ snap }: { snap: Snapshot }) {
  const settings = useSettings()
  const weekReviews = useWeekReviews()
  if (!settings.gettingStarted) return null
  const items = [
    { key: 'goal', done: snap.goals.length > 0, title: t('gs.firstGoal'), action: () => { resetIntro({ short: true }); navigate('/welcome/goal/smart') } },
    { key: 'check', done: snap.entries.some((e) => !e.deletedAt) || snap.occurrences.length > 0, title: t('gs.firstCheckIn') },
    { key: 'review', done: (weekReviews ?? []).some((w) => !!w.doneAt), title: t('gs.firstReview'), sub: t('gs.fromMonday'), action: () => navigate('/review') },
    {
      key: 'backup', done: !!settings.lastExportAt, title: t('gs.backup'), sub: t('gs.backupSub'),
      action: async () => {
        const r = await shareOrDownload(await exportData())
        if (r !== 'cancelled') {
          await setSettings({ lastExportAt: new Date().toISOString() })
          toast(t('common.exportedKeep'))
        }
      },
    },
  ]
  if (items.every((i) => i.done)) return null
  return (
    <div className="card getting-started">
      <div className="gs-head">
        <h2>{t('gs.title')}</h2>
        <button className="icon-btn" aria-label={t('gs.hide')} onClick={() => setSettings({ gettingStarted: false })}><IconClose width={18} height={18} /></button>
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
