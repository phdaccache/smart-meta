import { useMemo, useState, type ReactNode } from 'react'
import { createGoal, ensureValue } from '../db/repo'
import { setSettings } from '../db/settings'
import { t, tk, tlist, tn, type Key } from '../i18n'
import {
  CHECKIN_TYPES, emptyGoalDraft, isValid, MAX_PREPS, validateCommitment, validateGoal, validatePrep,
  type CommitmentDraft, type Errors, type GoalDraft, type PrepDraft,
} from '../lib/draft'
import type { Period, Shape } from '../lib/types'
import { templateByKey, templatesFor, type Template } from '../lib/templates'
import { startTemplate, TemplateGoalScreen } from './TemplateGoal'
import { Chip, Field, InfoTip, Screen, Segmented, Sheet, Stepper, toast, WeekdayPicker } from '../ui/components'
import { IconChevronRight } from '../ui/icons'
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

function KindInfo() {
  return <><Term text={t('form.kindInfoFinish')} />{' '}<ShapeInfo /></>
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

/** For a goal: a finish line, or one of the three habit shapes. */
function KindField({ d, patch }: { d: GoalDraft; patch: (p: Partial<GoalDraft>) => void }) {
  const outcome = d.goalKind === 'outcome'
  return (
    <div className="kind-grid" role="radiogroup" aria-label={t('goal.kind')}>
      <button type="button" role="radio" aria-checked={outcome} className={`choice ${outcome ? 'on' : ''}`}
        onClick={() => patch({ goalKind: 'outcome' })}>
        <div className="t">{t('plan.finishLine')}</div>
      </button>
      {SHAPES.map((s) => {
        const on = !outcome && d.shape === s.value
        return (
          <button type="button" key={s.value} role="radio" aria-checked={on} className={`choice ${on ? 'on' : ''}`}
            onClick={() => patch({ goalKind: 'habit', shape: s.value, checkinType: CHECKIN_TYPES[s.value][0], period: s.value === 'threshold' ? 'day' : 'week' })}>
            <div className="t">{tk(s.title)}</div>
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

export function MeasurementFields({ d, set, e, showErrors, placeholders }: {
  d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void; e: Errors<CommitmentDraft>; showErrors: boolean
  placeholders?: { definition: string; label: string }
}) {
  return (
    <>
      <Field label={t('form.whatCounts')} htmlFor="m-def" error={showErrors ? e.measurementDefinition : undefined}
        info={t('form.whatCountsInfo')}>
        <textarea id="m-def" value={d.measurementDefinition} rows={2}
          placeholder={placeholders?.definition ?? t(d.shape === 'standard' ? 'form.phStandard' : d.shape === 'threshold' ? 'form.phThreshold' : 'form.phRhythm')}
          onChange={(ev) => set({ measurementDefinition: ev.target.value })} />
      </Field>
      <Field label={t('form.shortName')} htmlFor="m-label" error={showErrors ? e.label : undefined}>
        <input id="m-label" value={d.label} placeholder={placeholders?.label ?? t(d.shape === 'threshold' ? 'form.phShortThreshold' : d.shape === 'standard' ? 'form.phShortStandard' : 'form.phShortRhythm')}
          onChange={(ev) => set({ label: ev.target.value })} autoCapitalize="off" />
      </Field>
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

export function PrepEditor({ preps, onChange, showErrors }: { preps: PrepDraft[]; onChange: (p: PrepDraft[]) => void; showErrors: boolean }) {
  const update = (i: number, p: Partial<PrepDraft>) => onChange(preps.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="stack">
      {preps.map((p, i) => {
        const e = validatePrep(p)
        return (
          <div key={i} className="card pad">
            <Field label={t('form.prepN', { n: i + 1 })} htmlFor={`prep-${i}`} error={showErrors ? e.title : undefined}>
              <input id={`prep-${i}`} value={p.title} placeholder={t('form.phPrep')}
                onChange={(ev) => update(i, { title: ev.target.value })} />
            </Field>
            <Field label={t('common.days')} error={showErrors ? e.fireWeekdays : undefined}>
              <WeekdayPicker value={p.fireWeekdays} onChange={(fireWeekdays) => update(i, { fireWeekdays })} />
            </Field>
            <Field label={t('common.time')} htmlFor={`prep-t-${i}`} error={showErrors ? e.fireTime : undefined}>
              <div className="inline-fields">
                <input id={`prep-t-${i}`} type="time" value={p.fireTime} onChange={(ev) => update(i, { fireTime: ev.target.value })} />
                <button className="btn ghost" style={{ flex: 'none' }} onClick={() => onChange(preps.filter((_, j) => j !== i))}>{t('common.remove')}</button>
              </div>
            </Field>
          </div>
        )
      })}
      {preps.length < MAX_PREPS && (
        <button className="btn outline" onClick={() => onChange([...preps, { title: '', fireWeekdays: [], fireTime: '21:00' }])}>
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
    </Field>
  )
}

export function WhyFields({ valueId, text, onValue, onText, errors, showErrors, suggest }: {
  valueId: string; text: string; onValue: (id: string) => void; onText: (t: string) => void
  errors: { whyValueId?: string; whyText?: string }; showErrors: boolean
  /** A template's value that doesn't exist yet: picked while no other is ('' id), created on save. */
  suggest?: string
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
      <Field label={t('form.why')} htmlFor="why" error={showErrors ? errors.whyText : undefined} info={t('form.whyInfo')}>
        <textarea id="why" rows={2} value={text} placeholder={t('form.phWhy')}
          onChange={(ev) => onText(ev.target.value)} />
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

  if (tpl) return <TemplateGoalScreen tpl={tpl} edit={query.get('edit') === '1'} smart={query.get('smart') === '1'} />
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
const SMART = [
  { k: 'S', word: 'smart.specific' },
  { k: 'M', word: 'smart.measurable' },
  { k: 'A', word: 'smart.achievable' },
  { k: 'R', word: 'smart.relevant' },
  { k: 'T', word: 'smart.timeBound' },
] as const
export type Letter = (typeof SMART)[number]['k'] | '+'

/** S M A R T, with the current letter lit, so the method is visible without explaining it. */
export function SmartBar({ current }: { current: Letter }) {
  const idx = current === '+' ? SMART.length : SMART.findIndex((x) => x.k === current)
  const word = current === '+' ? t('smart.extraPrep') : t(SMART[idx].word)
  return (
    <div className="smart">
      <div className="smart-letters" aria-label={t('smart.label', { word })}>
        {SMART.map((x, j) => (
          <span key={x.k} aria-hidden="true" className={`smart-l ${j < idx ? 'done' : j === idx ? 'on' : ''}`}>{x.k}</span>
        ))}
      </div>
      <div className="smart-word title-row">{word}<InfoTip label="SMART">{t('smart.info')}</InfoTip></div>
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

interface Step {
  letter: Letter
  q: string
  info?: ReactNode
  fields: (keyof GoalDraft)[]
  body: ReactNode
}

export function Wizard({ d, set, patch, errors, onSave, top, suggest }: FormProps) {
  const [i, setI] = useState(0)
  const [tried, setTried] = useState(false)
  const outcome = d.goalKind === 'outcome'
  const err = (k: keyof GoalDraft) => (tried ? errors[k] : undefined)

  const all: (Step | false)[] = [
    {
      letter: 'S',
      q: t('form.qWhat'),
      fields: ['title'],
      body: (
        <Field label={t('form.goal')} htmlFor="title" error={err('title')}>
          <input id="title" value={d.title} placeholder={t('form.goalPlaceholder')} onChange={(e) => set('title', e.target.value)} />
        </Field>
      ),
    },
    {
      letter: 'M',
      q: t('form.qHowKnow'),
      info: <KindInfo />,
      fields: outcome ? ['doneWhen'] : ['measurementDefinition', 'label'],
      body: (
        <>
          <KindField d={d} patch={patch} />
          <div style={{ marginTop: 18 }}>
            {outcome
              ? <DoneWhenField d={d} set={set} error={err('doneWhen')} />
              : <MeasurementFields d={d} set={patch} e={errors} showErrors={tried} />}
          </div>
        </>
      ),
    },
    !outcome && {
      letter: 'M',
      q: t(d.shape === 'rhythm' ? 'form.qHowOften' : d.shape === 'threshold' ? 'form.qLine' : 'form.qCheckIn'),
      info: d.shape === 'rhythm' ? t('form.badWeek') : undefined,
      fields: ['times', 'checkinType', 'targetValue', 'targetTime'],
      body: <CadenceFields d={d} set={patch} e={errors} showErrors={tried} />,
    },
    {
      letter: 'A',
      q: t('form.qSlack'),
      fields: outcome ? ['graceDays'] : ['tolerancePct'],
      body: outcome
        ? <GraceField value={d.graceDays} onChange={(n) => set('graceDays', n)} />
        : <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={err('tolerancePct')} />,
    },
    {
      letter: 'R',
      q: t('form.qWhy'),
      fields: ['whyValueId', 'whyText'],
      body: <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(x) => set('whyText', x)} errors={errors} showErrors={tried} suggest={suggest} />,
    },
    {
      letter: 'T',
      q: t('form.qWhen'),
      fields: ['startDate', 'targetDate'],
      body: <DateFields d={d} set={set} err={err} />,
    },
    !outcome && {
      letter: '+',
      q: t('form.qStops'),
      info: t('form.prepInfo'),
      fields: ['preps'],
      body: <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />,
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

  return (
    <div>
      {at === 0 && top}
      <SmartBar current={step.letter} />
      <div className="card pad smart-card">
        <h2 className="wizard-q title-row">
          {step.q}
          {step.info && <InfoTip label={t('common.moreAboutStep')}>{step.info}</InfoTip>}
        </h2>
        {step.body}
      </div>
      <div className="wizard-nav">
        {at > 0 ? <button className="btn" onClick={() => { setTried(false); setI(at - 1) }}>{t('nav.back')}</button> : null}
        <button className="btn primary" onClick={next}>{last ? t('common.save') : t('common.next')}</button>
      </div>
    </div>
  )
}

export function DateFields({ d, set, err }: { d: GoalDraft; set: SetField; err: (k: keyof GoalDraft) => string | undefined }) {
  const outcome = d.goalKind === 'outcome'
  return (
    <div className="inline-fields top">
      <Field label={t('form.start')} htmlFor="start" error={err('startDate')}>
        <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
      </Field>
      <Field label={outcome ? t('form.deadline') : t('form.reviewOn')} htmlFor="target" error={err('targetDate')}
        info={outcome ? undefined : t('form.reviewOnInfo')}>
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
  const cErr = validateCommitment(d)
  return (
    <div>
      {top}
      <section className="card pad smart-section">
        <SmartHead k="S" />
        <Field label={t('form.goal')} htmlFor="title" error={err('title')}>
          <input id="title" value={d.title} placeholder={t('form.goalPlaceholder')} onChange={(e) => set('title', e.target.value)} />
        </Field>
      </section>
      <section className="card pad smart-section">
        <SmartHead k="M"><InfoTip label={t('form.aboutKinds')}><KindInfo /></InfoTip></SmartHead>
        <KindField d={d} patch={patch} />
        <div style={{ marginTop: 18 }}>
          {outcome ? (
            <DoneWhenField d={d} set={set} error={err('doneWhen')} />
          ) : (
            <>
              <MeasurementFields d={d} set={patch} e={cErr} showErrors={tried} />
              <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={cErr} showErrors={tried} /></div>
            </>
          )}
        </div>
      </section>
      <section className="card pad smart-section">
        <SmartHead k="A" />
        {outcome
          ? <GraceField value={d.graceDays} onChange={(n) => set('graceDays', n)} />
          : <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={err('tolerancePct')} />}
      </section>
      <section className="card pad smart-section">
        <SmartHead k="R" />
        <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(x) => set('whyText', x)} errors={errors} showErrors={tried} suggest={suggest} />
      </section>
      <section className="card pad smart-section">
        <SmartHead k="T" />
        <DateFields d={d} set={set} err={err} />
      </section>
      {!outcome && (
        <section className="card pad smart-section">
          <SmartHead k="+">
            <InfoTip label={t('form.aboutPreps')}>{t('form.prepInfoShort')}</InfoTip>
          </SmartHead>
          <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
        </section>
      )}
      {tried && !isValid(errors) && <p className="field-error" style={{ marginTop: 16 }}>{t('form.checkFields')}</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={submit}>{t('form.saveGoal')}</button>
      </div>
    </div>
  )
}
