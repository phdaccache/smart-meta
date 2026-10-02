import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createGoal, ensureValue } from '../db/repo'
import { setSettings } from '../db/settings'
import { getLang, t, tk, tlist, tn, type Key } from '../i18n'
import {
  CHECKIN_TYPES, emptyGoalDraft, isValid, MAX_PREPS, validateGoal, validatePrep,
  type CommitmentDraft, type Errors, type GoalDraft, type PrepDraft,
} from '../lib/draft'
import { addMonths, OBSTACLE_PREPS, toleranceLine } from '../lib/intro'
import type { Period, Shape } from '../lib/types'
import { templateByKey, templatesFor, type Template } from '../lib/templates'
import { startTemplate, TemplateGoalScreen } from './TemplateGoal'
import { Chip, Field, InfoTip, Screen, Segmented, Sheet, Stepper, toast, WeekdayPicker } from '../ui/components'
import { IconChevronRight, IconClose } from '../ui/icons'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { goBack, navigate, useLocation } from '../ui/router'

const SHAPES: { value: Shape; title: Key }[] = [
  { value: 'rhythm', title: 'shape.rhythm' },
  { value: 'threshold', title: 'shape.threshold' },
  { value: 'standard', title: 'shape.standard' },
]

/** "Rhythm: a number of times…" with the name in bold. */
function Term({ text }: { text: string }) {
  const i = text.indexOf(':')
  return i < 0 ? <>{text}</> : <><b>{text.slice(0, i)}</b>{text.slice(i)}</>
}

export function ShapeInfo() {
  return (
    <>
      <Term text={t('form.kindInfoRhythm')} />{' '}
      <Term text={t('form.kindInfoThreshold')} />{' '}
      <Term text={t('form.kindInfoStandard')} />
    </>
  )
}


const periods = (): { value: Period; label: string }[] => [
  { value: 'day', label: t('common.day') },
  { value: 'week', label: t('common.week') },
  { value: 'month', label: t('common.month') },
]

export type SetField = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => void

// ——— shared field groups (used by the wizard, the compact form and commitment editing) ———

/** Tiles, titles only: the (i) next to the question explains them. */
export function ShapeField({ d, set }: { d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void }) {
  return (
    <div className="kind-grid three" role="radiogroup" aria-label={t('goal.kind')}>
      {SHAPES.map((s) => (
        <button type="button" key={s.value} role="radio" aria-checked={d.shape === s.value}
          className={`choice ${d.shape === s.value ? 'on' : ''}`}
          onClick={() => set({ shape: s.value, checkinType: CHECKIN_TYPES[s.value][0], period: s.value === 'threshold' ? 'day' : 'week' })}>
          <div className="t">{tk(s.title)}</div>
        </button>
      ))}
    </div>
  )
}

const KINDS: { kind: 'outcome' | Shape; title: Key; d: Key }[] = [
  { kind: 'outcome', title: 'plan.finishLine', d: 'intro.kindFinish' },
  { kind: 'rhythm', title: 'shape.rhythm', d: 'intro.kindRhythm' },
  { kind: 'threshold', title: 'shape.threshold', d: 'intro.kindThreshold' },
  { kind: 'standard', title: 'shape.standard', d: 'intro.kindStandard' },
]

/** For a goal: a finish line, or one of the three habit shapes, each with a few words on what it is. */
export function KindField({ d, patch }: { d: GoalDraft; patch: (p: Partial<GoalDraft>) => void }) {
  const outcome = d.goalKind === 'outcome'
  return (
    <div className="kind-grid described" role="radiogroup" aria-label={t('goal.kind')}>
      {KINDS.map((k) => {
        const on = k.kind === 'outcome' ? outcome : !outcome && d.shape === k.kind
        return (
          <button type="button" key={k.kind} role="radio" aria-checked={on} className={`choice ${on ? 'on' : ''}`}
            onClick={() => patch(k.kind === 'outcome' ? { goalKind: 'outcome' } : {
              goalKind: 'habit', shape: k.kind, checkinType: CHECKIN_TYPES[k.kind][0], period: k.kind === 'threshold' ? 'day' : 'week',
            })}>
            <div className="t">{tk(k.title)}</div>
            <div className="d">{tk(k.d)}</div>
          </button>
        )
      })}
    </div>
  )
}

export function DoneWhenField({ d, set, error, placeholder }: { d: GoalDraft; set: SetField; error?: string; placeholder?: string }) {
  return (
    <Field label={t('form.doneWhen')} htmlFor="done-when" error={error} info={t('form.doneWhenInfo')}>
      <textarea id="done-when" rows={2} value={d.doneWhen} placeholder={placeholder ?? t('form.doneWhenPlaceholder')}
        onChange={(e) => set('doneWhen', e.target.value)} />
    </Field>
  )
}

const GRACE: { days: number; label: Key }[] = [
  { days: 0, label: 'form.grace.none' },
  { days: 14, label: 'form.grace.2w' },
  { days: 30, label: 'form.grace.1m' },
  { days: 61, label: 'form.grace.2m' },
  { days: 91, label: 'form.grace.3m' },
  { days: 183, label: 'form.grace.6m' },
]

export const graceLabel = (days: number) => {
  const g = GRACE.find((x) => x.days === days)
  return g ? tk(g.label) : tn('dates.day', days)
}

export function GraceField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Field label={t('form.extraTime')} htmlFor="grace" info={t('form.extraTimeInfo')}>
      <select id="grace" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {GRACE.map((g) => <option key={g.days} value={g.days}>{tk(g.label)}</option>)}
      </select>
    </Field>
  )
}

export function MeasurementFields({ d, set, e, showErrors, placeholders, withLabel = true }: {
  d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void; e: Errors<CommitmentDraft>; showErrors: boolean
  placeholders?: { definition: string; label?: string }
  /** A goal's own habit asks for its short name next to the goal's name instead (TitleFields). */
  withLabel?: boolean
}) {
  return (
    <>
      <Field label={t('form.whatCounts')} htmlFor="m-def" error={showErrors ? e.measurementDefinition : undefined}
        info={t('form.whatCountsInfo')}>
        <textarea id="m-def" value={d.measurementDefinition} rows={2}
          placeholder={placeholders?.definition ?? t(d.shape === 'standard' ? 'form.phStandard' : d.shape === 'threshold' ? 'form.phThreshold' : 'form.phRhythm')}
          onChange={(ev) => set({ measurementDefinition: ev.target.value })} />
      </Field>
      {withLabel && (
        <Field label={t('form.shortName')} htmlFor="m-label" error={showErrors ? e.label : undefined}>
          <input id="m-label" value={d.label} placeholder={placeholders?.label ?? t(d.shape === 'threshold' ? 'form.phShortThreshold' : d.shape === 'standard' ? 'form.phShortStandard' : 'form.phShortRhythm')}
            onChange={(ev) => set({ label: ev.target.value })} autoCapitalize="off" />
        </Field>
      )}
    </>
  )
}

export function CadenceFields({ d, set, e, showErrors }: {
  d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void; e: Errors<CommitmentDraft>; showErrors: boolean
}) {
  const types = CHECKIN_TYPES[d.shape]
  const typeLabel = { binary: 'form.checkYesNo', quantity: 'form.checkNumber', timestamp: 'form.checkTime' } as const
  const PERIODS = periods()
  return (
    <>
      {d.shape === 'rhythm' && (
        <Field label={t('form.target')} error={showErrors ? e.times : undefined}>
          <div className="inline-fields">
            <Stepper label={t('form.times')} value={d.times} min={1} max={31} onChange={(times) => set({ times })} />
            <span className="muted" style={{ flex: 'none' }}>{t('form.timesPer')}</span>
            <Segmented label={t('form.period')} value={d.period} options={PERIODS.slice(1)} onChange={(period) => set({ period })} />
          </div>
        </Field>
      )}

      {types.length > 1 && (
        <Field label={t('form.checkInWith')} error={showErrors ? e.checkinType : undefined}>
          <Segmented label={t('form.checkInType')} value={d.checkinType} onChange={(checkinType) => set({ checkinType })}
            options={types.map((x) => ({ value: x, label: t(typeLabel[x]) }))} />
        </Field>
      )}

      {d.shape === 'threshold' && (
        <>
          <Field label={t('form.judgedPer')}>
            <Segmented label={t('form.period')} value={d.period} options={d.checkinType === 'timestamp' ? PERIODS.slice(0, 1) : PERIODS} onChange={(period) => set({ period })} />
          </Field>
          {d.checkinType === 'quantity' && (
            <Field label={t('form.theLimit')} error={showErrors ? e.targetValue : undefined}
              info={d.period === 'day' ? undefined : t(d.period === 'week' ? 'form.limitInfo.week' : 'form.limitInfo.month')}>
              <div className="inline-fields wrap">
                <Segmented label={t('form.direction')} value={d.comparator} onChange={(comparator) => set({ comparator })}
                  options={[{ value: 'gte', label: t('form.atLeast') }, { value: 'lte', label: t('form.atMost') }]} />
                <input className="narrow" inputMode="decimal" value={d.targetValue} placeholder="8" aria-label={t('form.limit')}
                  onChange={(ev) => set({ targetValue: ev.target.value })} />
                <input className="narrow" value={d.unit} placeholder={t('form.phUnit')} aria-label={t('form.unit')} autoCapitalize="off"
                  onChange={(ev) => set({ unit: ev.target.value })} />
              </div>
            </Field>
          )}
          {d.checkinType === 'timestamp' && (
            <Field label={t('form.theTime')} error={showErrors ? e.targetTime : undefined}>
              <div className="inline-fields wrap">
                <Segmented label={t('form.direction')} value={d.comparator} onChange={(comparator) => set({ comparator })}
                  options={[{ value: 'lte', label: t('form.by') }, { value: 'gte', label: t('form.notBefore') }]} />
                <input type="time" className="narrow" style={{ flexBasis: 120 }} value={d.targetTime} aria-label={t('common.time')}
                  onChange={(ev) => set({ targetTime: ev.target.value })} />
              </div>
            </Field>
          )}
        </>
      )}

    </>
  )
}

/** One line of text that wraps onto more lines instead of cutting off (a suggested prep can be long). */
function GrowingText({ id, value, placeholder, onChange }: { id: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])
  return (
    <textarea ref={ref} id={id} rows={1} className="growing" value={value} placeholder={placeholder}
      onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()} onChange={(ev) => onChange(ev.target.value.replace(/\n/g, ' '))} />
  )
}

export function PrepEditor({ preps, onChange, showErrors, removable = true }: {
  preps: PrepDraft[]; onChange: (p: PrepDraft[]) => void; showErrors: boolean
  /** Editing one saved prep in a sheet: that sheet has its own Delete. */
  removable?: boolean
}) {
  const update = (i: number, p: Partial<PrepDraft>) => onChange(preps.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="stack">
      {preps.map((p, i) => {
        const e = validatePrep(p)
        return (
          <div key={i} className="card pad prep-card">
            {removable && (
              <button type="button" className="icon-btn prep-remove" aria-label={t('common.remove')}
                onClick={() => onChange(preps.filter((_, j) => j !== i))}><IconClose width={18} height={18} /></button>
            )}
            <Field label={t('form.prepN', { n: i + 1 })} htmlFor={`prep-${i}`} error={showErrors ? e.title : undefined}>
              <GrowingText id={`prep-${i}`} value={p.title} placeholder={t('form.phPrep')} onChange={(title) => update(i, { title })} />
            </Field>
            <Field label={t('common.days')} error={showErrors ? e.fireWeekdays : undefined}>
              <WeekdayPicker value={p.fireWeekdays} onChange={(fireWeekdays) => update(i, { fireWeekdays })} />
            </Field>
            <Field label={t('common.time')} htmlFor={`prep-t-${i}`} error={showErrors ? e.fireTime : undefined}>
              <input id={`prep-t-${i}`} type="time" value={p.fireTime} onChange={(ev) => update(i, { fireTime: ev.target.value })} />
            </Field>
          </div>
        )
      })}
      {preps.length < MAX_PREPS && (
        <button type="button" className="btn outline" onClick={() => onChange([...preps, { title: '', fireWeekdays: [], fireTime: '21:00' }])}>
          {t('form.addPrep')}
        </button>
      )}
    </div>
  )
}

export function ToleranceField({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <Field label={t('form.tolerance')} error={error} info={t('form.toleranceInfo')}>
      <div className="tol-readout" aria-hidden="true">{value}%</div>
      <input type="range" min={50} max={100} step={5} value={value} aria-label={t('form.tolerancePercent')}
        onChange={(ev) => onChange(Number(ev.target.value))} />
      <p className="field-hint after">{toleranceLine(value)}</p>
    </Field>
  )
}

/**
 * The reason, in their words. `labelled` false when the card's question
 * ("What is the reason for this goal?") already says what it's for.
 */
export function WhyText({ text, onText, error, placeholder, labelled = true }: {
  text: string; onText: (t: string) => void; error?: string; placeholder?: string; labelled?: boolean
}) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {labelled && <div className="field-label-row"><label className="field-label" htmlFor="why">{t('form.qWhy')}</label></div>}
      <textarea id="why" rows={2} value={text} placeholder={placeholder ?? t('form.phWhy')} aria-label={labelled ? undefined : t('form.qWhy')}
        onChange={(ev) => onText(ev.target.value)} />
      <div className="field-hint after">{t('intro.seeOnToday')}</div>
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  )
}

export function WhyFields({ valueId, text, onValue, onText, errors, showErrors, suggest, labelled = true }: {
  valueId: string; text: string; onValue: (id: string) => void; onText: (t: string) => void
  errors: { whyValueId?: string; whyText?: string }; showErrors: boolean
  /** A template's value that doesn't exist yet: picked while no other is ('' id), created on save. */
  suggest?: string
  labelled?: boolean
}) {
  const snap = useSnapshot()
  const values = (snap?.values ?? []).filter((v) => !v.deletedAt)
  // Values are added right here: leaving for Settings would lose the goal being written.
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    onValue(await ensureValue(name))
    setName('')
    setAdding(false)
  }
  const pending = suggest && !values.some((v) => v.name.trim().toLowerCase() === suggest.trim().toLowerCase()) ? suggest : null
  const open = adding || (snap != null && !values.length && !pending)
  return (
    <>
      <WhyText text={text} onText={onText} error={showErrors ? errors.whyText : undefined} labelled={labelled} />
      <Field label={t('form.value')} error={showErrors ? errors.whyValueId : undefined}>
        {(values.length > 0 || pending) && (
          <div className="chips">
            {pending && <Chip selected={!valueId} onClick={() => onValue('')}>{pending}</Chip>}
            {values.map((v) => <Chip key={v.id} selected={valueId === v.id} onClick={() => onValue(v.id)}>{v.name}</Chip>)}
            {!open && values.length < 12 && <Chip selected={false} onClick={() => setAdding(true)}>{t('form.newValue')}</Chip>}
          </div>
        )}
        {open && (
          <>
            {!values.length && <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('form.firstValueHint')}</p>}
            <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add() }} style={values.length ? { marginTop: 10 } : undefined}>
              <input value={name} aria-label={t('form.valueName')} placeholder={tlist('set.valuePlaceholders')[0]} autoFocus={adding}
                onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="btn outline" disabled={!name.trim()}>{t('common.add')}</button>
            </form>
          </>
        )}
      </Field>
    </>
  )
}

// ——— new goal screen ———

/**
 * New goal, blank or from a template. Each step is its own address, so Back
 * walks back through them: the form, the template list (?pick=1), then the
 * template's screens (TemplateGoal.tsx), where nothing is saved until Save goal.
 */
export function NewGoalScreen() {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const { query } = useLocation()
  const tpl = templateByKey(query.get('template') ?? '') ?? null
  if (!snap) return null

  if (tpl) return <TemplateGoalScreen tpl={tpl} smart={query.get('smart') === '1'} />
  return <GoalFormScreen initial={emptyGoalDraft(today)} picking={query.get('pick') === '1'} />
}

function GoalFormScreen({ initial, picking = false }: { initial: GoalDraft; picking?: boolean }) {
  const settings = useSettings()
  const [d, setD] = useState<GoalDraft>(initial)
  const set: SetField = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const patch = (p: Partial<GoalDraft>) => setD((x) => ({ ...x, ...p }))
  const errors = useMemo(() => validateGoal(d), [d])
  const mode = settings.creationMode

  const save = async () => {
    // Every new goal waits in the backlog; starting it is its own decision, on the goal's page.
    const goal = await createGoal(d)
    toast(t('form.savedBacklog'))
    navigate(`/goals/${goal.id}`, { replace: true })
  }

  const top = (
    <button className="card list-row template-btn" onClick={() => navigate('/goals/new?pick=1')}>
      <div className="text">
        <div className="title">{t('tpl.button')}</div>
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
  return (
    <Screen back="/goals" title={t('form.newGoal')}
      actions={<button className="btn ghost" onClick={() => setSettings({ creationMode: mode === 'wizard' ? 'compact' : 'wizard' })}>
        {mode === 'wizard' ? t('form.compact') : t('form.guided')}
      </button>}>
      {mode === 'wizard'
        ? <Wizard d={d} set={set} patch={patch} errors={errors} onSave={save} top={top} />
        : <Compact d={d} set={set} patch={patch} errors={errors} onSave={save} top={top} />}
      <TemplateSheet open={picking} areas={settings.areas}
        onPick={startTemplate} onClose={() => goBack('/goals/new')} />
    </Screen>
  )
}

export interface FormProps {
  d: GoalDraft
  set: SetField
  patch: (p: Partial<GoalDraft>) => void
  errors: Errors<GoalDraft>
  onSave: () => void
  /** Shown above the form (the wizard: on its first step only). */
  top?: ReactNode
  /** From a template: its value, picked until another is chosen, and created when the goal is saved. */
  suggest?: string
}

// ——— templates ———

function TemplateSheet({ open, areas, onPick, onClose }: { open: boolean; areas: string[]; onPick: (x: Template) => void; onClose: () => void }) {
  const { forYou, more } = templatesFor(areas)
  const row = (x: Template) => (
    <button key={x.key} className="list-row" onClick={() => onPick(x)}>
      <div className="text">
        <div className="title">{x.title}</div>
        <div className="sub">{x.summary}</div>
      </div>
      <IconChevronRight className="chev" width={18} />
    </button>
  )
  return (
    <Sheet open={open} onClose={onClose} title={t('tpl.title')}>
      {forYou.length > 0 && (
        <>
          <div className="tpl-group">{t('tpl.forYou')}</div>
          <div className="card list">{forYou.map(row)}</div>
        </>
      )}
      {more.map((g) => (
        <div key={g.area}>
          <div className="tpl-group">{g.label}</div>
          <div className="card list">{g.templates.map(row)}</div>
        </div>
      ))}
    </Sheet>
  )
}

/** The letters stay S M A R T in every language; the words are translated. */
export const SMART = [
  { k: 'S', word: 'smart.specific' },
  { k: 'M', word: 'smart.measurable' },
  { k: 'A', word: 'smart.achievable' },
  { k: 'R', word: 'smart.relevant' },
  { k: 'T', word: 'smart.timeBound' },
] as const
export type SmartLetter = (typeof SMART)[number]['k']
export type Letter = SmartLetter | '+'

/**
 * "Let's make it S M A R T": the current letter lit and its word under the
 * letters, so the method is visible without explaining it. In the intro
 * (`big`), "Let's make it" was its own screen, so the word is the title, above
 * the letters. In Portuguese the S gets a note that the letters come from English.
 */
export function SmartBar({ current, big = false }: { current: SmartLetter; big?: boolean }) {
  const idx = SMART.findIndex((x) => x.k === current)
  const word = t(SMART[idx].word)
  const info = current === 'S' && getLang() === 'pt-BR' && <InfoTip label="SMART">{t('smart.info')}</InfoTip>
  return (
    <div className="smart">
      {big
        ? <h1 className="intro-title smart-lead title-row">{word}{info}</h1>
        : <div className="smart-lead">{t('intro.goalTitle')}</div>}
      <div className="smart-letters" aria-label={t('smart.label', { word })}>
        {SMART.map((x, j) => (
          <span key={x.k} aria-hidden="true" className={`smart-l ${j < idx ? 'done' : j === idx ? 'on' : ''}`}>{x.k}</span>
        ))}
      </div>
      {!big && <div className="smart-word title-row">{word}{info}</div>}
    </div>
  )
}

export function SmartHead({ k, children }: { k: Letter; children?: ReactNode }) {
  const word = k === '+' ? t('smart.prepOptional') : t(SMART.find((x) => x.k === k)!.word)
  return (
    <div className="smart-head">
      <span className="smart-l on small-l">{k}</span>
      <h2>{word}</h2>
      {children}
    </div>
  )
}

// ——— the steps, shared by the wizard, the compact form and the first-run intro ———

/** A line under the letters: what the step asks for. */
export const SMART_LINE: Record<SmartLetter, Key> = {
  S: 'intro.lineS',
  M: 'intro.lineM',
  A: 'intro.lineA',
  R: 'intro.lineR',
  T: 'intro.lineT',
}

/** Each step's question, on its card. */
export const SMART_Q: Record<SmartLetter, Key> = {
  S: 'intro.qAchieve',
  M: 'form.qHowKnow',
  A: 'form.qSlack',
  R: 'form.qWhy',
  T: 'form.qWhen',
}

type Err = (k: keyof GoalDraft) => string | undefined

/** S: the goal's name, then (for a habit) the short name Today and check-ins call it by. `children` go in between. */
export function TitleFields({ d, set, err, placeholder, children }: {
  d: GoalDraft; set: SetField; err: Err; placeholder?: string; children?: ReactNode
}) {
  return (
    <>
      <Field label={t('form.goal')} htmlFor="title" error={err('title')}>
        <input id="title" value={d.title} placeholder={placeholder} onChange={(e) => set('title', e.target.value)} />
      </Field>
      {children}
      {d.goalKind !== 'outcome' && (
        <Field label={t('form.shortName')} htmlFor="m-label" hint={t('form.shortNameHint')} error={err('label')}>
          <input id="m-label" value={d.label} onChange={(e) => set('label', e.target.value)} autoCapitalize="off" />
        </Field>
      )}
    </>
  )
}

/** The fields M checks once the kind is picked: a finish line, or what counts and how often. */
export const measureFields = (d: GoalDraft): (keyof GoalDraft)[] =>
  d.goalKind === 'outcome' ? ['doneWhen'] : ['measurementDefinition', 'times', 'checkinType', 'targetValue', 'targetTime']

/** M, below the kinds: that kind's own fields. */
export function MeasureFields({ d, set, patch, errors, showErrors, placeholders }: {
  d: GoalDraft; set: SetField; patch: (p: Partial<GoalDraft>) => void; errors: Errors<GoalDraft>; showErrors: boolean
  placeholders?: { doneWhen?: string; definition?: string }
}) {
  if (d.goalKind === 'outcome') {
    return <DoneWhenField d={d} set={set} error={showErrors ? errors.doneWhen : undefined} placeholder={placeholders?.doneWhen} />
  }
  return (
    <>
      <MeasurementFields d={d} set={patch} e={errors} showErrors={showErrors} withLabel={false}
        placeholders={placeholders?.definition ? { definition: placeholders.definition } : undefined} />
      <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={errors} showErrors={showErrors} /></div>
    </>
  )
}

/** A: room for a finish line to run late, or the share of check-ins a habit needs. */
export function AchieveFields({ d, set, err }: { d: GoalDraft; set: SetField; err: Err }) {
  return d.goalKind === 'outcome'
    ? <GraceField value={d.graceDays} onChange={(n) => set('graceDays', n)} />
    : <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={err('tolerancePct')} />
}

/** T: the dates, with a few lengths one tap away. */
export function TimeFields({ d, set, err }: { d: GoalDraft; set: SetField; err: Err }) {
  return (
    <>
      <DateFields d={d} set={set} err={err} />
      <div className="chips" style={{ marginTop: 4 }}>
        {[1, 3, 6].map((n) => {
          const date = addMonths(d.startDate, n)
          return (
            <Chip key={n} selected={d.targetDate === date} onClick={() => set('targetDate', d.targetDate === date ? '' : date)}>
              {n === 1 ? t('intro.in1Month') : t('intro.nMonths', { n })}
            </Chip>
          )
        })}
      </div>
    </>
  )
}

/** Above the prep step: it's no longer the SMART goal, but what makes it easier. */
export function PrepHead({ big = false }: { big?: boolean }) {
  return big ? (
    <div className="intro-head">
      <h1 className="intro-title">{t('intro.prepTitle')}</h1>
      <p className="intro-sub">{t('intro.prepSub')}</p>
    </div>
  ) : (
    <div className="prep-head">
      <h2 className="wizard-q">{t('intro.prepTitle')}</h2>
      <p className="wizard-lead">{t('intro.prepSub')}</p>
    </div>
  )
}

/**
 * A goal's preps. Picking what usually gets in the way fills in one prep that
 * helps (another pick swaps it); more are added by hand.
 */
export function PrepFields({ preps, onChange, showErrors }: { preps: PrepDraft[]; onChange: (p: PrepDraft[]) => void; showErrors: boolean }) {
  const suggested = OBSTACLE_PREPS.map((o) => o.prep.title)
  const has = (title: string) => preps.some((p) => p.title === title)
  const pick = (o: (typeof OBSTACLE_PREPS)[number]) => {
    const own = preps.filter((p) => !suggested.includes(p.title))
    onChange(has(o.prep.title) ? own : [{ ...o.prep }, ...own].slice(0, MAX_PREPS))
  }
  return (
    <>
      <div className="chips">
        {OBSTACLE_PREPS.map((o) => <Chip key={o.reason} selected={has(o.prep.title)} onClick={() => pick(o)}>{o.label}</Chip>)}
      </div>
      <p className="field-hint after">{t('intro.prepHint')}</p>
      <div style={{ marginTop: 14 }}>
        <PrepEditor preps={preps} onChange={onChange} showErrors={showErrors} />
      </div>
    </>
  )
}

interface Step {
  letter: Letter
  fields: (keyof GoalDraft)[]
  body: ReactNode
  /** A second card under the first (M: the kind's own fields). */
  extra?: ReactNode
}

export function Wizard({ d, set, patch, errors, onSave, top, suggest }: FormProps) {
  const [i, setI] = useState(0)
  const [tried, setTried] = useState(false)
  const outcome = d.goalKind === 'outcome'
  const err = (k: keyof GoalDraft) => (tried ? errors[k] : undefined)

  const all: (Step | false)[] = [
    {
      letter: 'S',
      fields: ['title', 'label'],
      body: <TitleFields d={d} set={set} err={err} placeholder={t('form.goalPlaceholder')} />,
    },
    {
      letter: 'M',
      fields: measureFields(d),
      body: <KindField d={d} patch={patch} />,
      extra: <MeasureFields d={d} set={set} patch={patch} errors={errors} showErrors={tried} />,
    },
    {
      letter: 'A',
      fields: outcome ? ['graceDays'] : ['tolerancePct'],
      body: <AchieveFields d={d} set={set} err={err} />,
    },
    {
      letter: 'R',
      fields: ['whyValueId', 'whyText'],
      body: <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(x) => set('whyText', x)}
        errors={errors} showErrors={tried} suggest={suggest} labelled={false} />,
    },
    {
      letter: 'T',
      fields: ['startDate', 'targetDate'],
      body: <TimeFields d={d} set={set} err={err} />,
    },
    !outcome && {
      letter: '+',
      fields: ['preps'],
      body: <PrepFields preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />,
    },
  ]
  const steps = all.filter((x): x is Step => !!x)
  const at = Math.min(i, steps.length - 1)
  const step = steps[at]
  const last = at === steps.length - 1

  const next = () => {
    if (step.fields.some((f) => errors[f])) return setTried(true)
    setTried(false)
    if (last) {
      if (isValid(errors)) onSave()
      else setTried(true)
      return
    }
    setI(at + 1)
    window.scrollTo(0, 0)
  }

  const letter = step.letter
  return (
    <div>
      {at === 0 && top}
      {letter === '+' ? <PrepHead /> : (
        <>
          <SmartBar current={letter} />
          <p className="smart-line">{tk(SMART_LINE[letter])}</p>
        </>
      )}
      <div className="card pad smart-card">
        <h2 className="wizard-q">{letter === '+' ? t('intro.qInTheWay') : tk(SMART_Q[letter])}</h2>
        {step.body}
      </div>
      {step.extra && <div className="card pad smart-card second">{step.extra}</div>}
      <div className="wizard-nav">
        {at > 0 ? <button className="btn" onClick={() => { setTried(false); setI(at - 1) }}>{t('nav.back')}</button> : null}
        <button className="btn primary" onClick={next}>{last ? t('common.save') : t('common.next')}</button>
      </div>
    </div>
  )
}

export function DateFields({ d, set, err }: { d: GoalDraft; set: SetField; err: Err }) {
  const outcome = d.goalKind === 'outcome'
  return (
    <div className="inline-fields top">
      <Field label={t('form.start')} htmlFor="start" error={err('startDate')}>
        <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
      </Field>
      <Field label={outcome ? t('form.deadline') : t('form.reviewOn')} htmlFor="target" error={err('targetDate')}>
        <input id="target" type="date" value={d.targetDate} min={d.startDate} onChange={(e) => set('targetDate', e.target.value)} />
      </Field>
    </div>
  )
}

export function Compact({ d, set, patch, errors, onSave, top, suggest }: FormProps) {
  const [tried, setTried] = useState(false)
  const outcome = d.goalKind === 'outcome'
  const submit = () => (isValid(errors) ? onSave() : setTried(true))
  const err = (k: keyof GoalDraft) => (tried ? errors[k] : undefined)
  return (
    <div>
      {top}
      <section className="card pad smart-section">
        <SmartHead k="S" />
        <TitleFields d={d} set={set} err={err} placeholder={t('form.goalPlaceholder')} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="M" />
        <KindField d={d} patch={patch} />
        <div style={{ marginTop: 18 }}>
          <MeasureFields d={d} set={set} patch={patch} errors={errors} showErrors={tried} />
        </div>
      </section>
      <section className="card pad smart-section">
        <SmartHead k="A" />
        <AchieveFields d={d} set={set} err={err} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="R" />
        <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(x) => set('whyText', x)} errors={errors} showErrors={tried} suggest={suggest} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="T" />
        <TimeFields d={d} set={set} err={err} />
      </section>
      {!outcome && (
        <section className="card pad smart-section">
          <SmartHead k="+" />
          <PrepFields preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
        </section>
      )}
      {tried && !isValid(errors) && <p className="field-error" style={{ marginTop: 16 }}>{t('form.checkFields')}</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={submit}>{t('form.saveGoal')}</button>
      </div>
    </div>
  )
}
