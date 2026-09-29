import { useMemo, useState, type ReactNode } from 'react'
import { createGoal } from '../db/repo'
import { setSettings } from '../db/settings'
import {
  CHECKIN_TYPES, emptyGoalDraft, isValid, MAX_PREPS, validateCommitment, validateGoal, validatePrep,
  type CommitmentDraft, type Errors, type GoalDraft, type PrepDraft,
} from '../lib/draft'
import type { Period, Shape } from '../lib/types'
import { Chip, Field, InfoTip, Screen, Segmented, Stepper, toast, WeekdayPicker } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { navigate } from '../ui/router'

const SHAPES: { value: Shape; title: string; example: string }[] = [
  { value: 'rhythm', title: 'Rhythm', example: 'Gym 3× per week' },
  { value: 'threshold', title: 'Threshold', example: 'Sleep at least 8 hours a night' },
  { value: 'standard', title: 'Standard', example: 'Arrive on time to anything agreed' },
]

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

type SetField = <K extends keyof GoalDraft>(k: K, v: GoalDraft[K]) => void

// ——— shared field groups (used by the wizard, the compact form and commitment editing) ———

export function ShapeField({ d, set }: { d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void }) {
  return (
    <div role="radiogroup" aria-label="Kind of commitment">
      {SHAPES.map((s) => (
        <button key={s.value} role="radio" aria-checked={d.shape === s.value} className={`choice ${d.shape === s.value ? 'on' : ''}`}
          onClick={() => set({ shape: s.value, checkinType: CHECKIN_TYPES[s.value][0], period: s.value === 'threshold' ? 'day' : 'week' })}>
          <div className="t">{s.title}</div>
          <div className="d">{s.example}</div>
        </button>
      ))}
    </div>
  )
}

export function MeasurementFields({ d, set, e, showErrors }: {
  d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void; e: Errors<CommitmentDraft>; showErrors: boolean
}) {
  return (
    <>
      <Field label="What counts" htmlFor="m-def" error={showErrors ? e.measurementDefinition : undefined}
        info={<>The sentence you’ll answer yes or no to, with no judgment call. “Go to the gym” can’t be checked; “At least 45 minutes of exercise” can.</>}>
        <textarea id="m-def" value={d.measurementDefinition} rows={2}
          placeholder={d.shape === 'standard' ? 'Arrived at or before the agreed time' : d.shape === 'threshold' ? 'Slept at least 8 hours' : 'Did at least 45 minutes of exercise'}
          onChange={(ev) => set({ measurementDefinition: ev.target.value })} />
      </Field>
      <Field label="Short name" htmlFor="m-label" error={showErrors ? e.label : undefined}>
        <input id="m-label" value={d.label} placeholder={d.shape === 'threshold' ? 'sleep' : d.shape === 'standard' ? 'punctuality' : 'gym'}
          onChange={(ev) => set({ label: ev.target.value })} autoCapitalize="off" />
      </Field>
    </>
  )
}

export function CadenceFields({ d, set, e, showErrors }: {
  d: CommitmentDraft; set: (p: Partial<CommitmentDraft>) => void; e: Errors<CommitmentDraft>; showErrors: boolean
}) {
  const types = CHECKIN_TYPES[d.shape]
  const typeLabel = { binary: 'Yes / no', quantity: 'A number', timestamp: 'A time' } as const
  return (
    <>
      {d.shape === 'rhythm' && (
        <Field label="Target" error={showErrors ? e.times : undefined}>
          <div className="inline-fields">
            <Stepper label="Times" value={d.times} min={1} max={31} onChange={(times) => set({ times })} />
            <span className="muted" style={{ flex: 'none' }}>times per</span>
            <Segmented label="Period" value={d.period} options={PERIODS.slice(1)} onChange={(period) => set({ period })} />
          </div>
        </Field>
      )}

      {types.length > 1 && (
        <Field label="You check in with" error={showErrors ? e.checkinType : undefined}>
          <Segmented label="Check-in type" value={d.checkinType} onChange={(checkinType) => set({ checkinType })}
            options={types.map((t) => ({ value: t, label: typeLabel[t] }))} />
        </Field>
      )}

      {d.shape === 'threshold' && (
        <>
          <Field label="Judged per">
            <Segmented label="Period" value={d.period} options={d.checkinType === 'timestamp' ? PERIODS.slice(0, 1) : PERIODS} onChange={(period) => set({ period })} />
          </Field>
          {d.checkinType === 'quantity' && (
            <Field label="The limit" error={showErrors ? e.targetValue : undefined}
              info={d.period === 'day' ? undefined : `Everything you log in a ${d.period} is added up and compared with this.`}>
              <div className="inline-fields">
                <Segmented label="Direction" value={d.comparator} onChange={(comparator) => set({ comparator })}
                  options={[{ value: 'gte', label: 'At least' }, { value: 'lte', label: 'At most' }]} />
                <input className="narrow" inputMode="decimal" value={d.targetValue} placeholder="8" aria-label="Limit"
                  onChange={(ev) => set({ targetValue: ev.target.value })} />
                <input className="narrow" value={d.unit} placeholder="hours" aria-label="Unit" autoCapitalize="off"
                  onChange={(ev) => set({ unit: ev.target.value })} />
              </div>
            </Field>
          )}
          {d.checkinType === 'timestamp' && (
            <Field label="The time" error={showErrors ? e.targetTime : undefined}>
              <div className="inline-fields">
                <Segmented label="Direction" value={d.comparator} onChange={(comparator) => set({ comparator })}
                  options={[{ value: 'lte', label: 'By' }, { value: 'gte', label: 'Not before' }]} />
                <input type="time" className="narrow" style={{ flexBasis: 120 }} value={d.targetTime} aria-label="Time"
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
            <Field label={`Prep ${i + 1}`} htmlFor={`prep-${i}`} error={showErrors ? e.title : undefined}>
              <input id={`prep-${i}`} value={p.title} placeholder="Pack the gym bag and pick tomorrow’s routine"
                onChange={(ev) => update(i, { title: ev.target.value })} />
            </Field>
            <Field label="Days" error={showErrors ? e.fireWeekdays : undefined}>
              <WeekdayPicker value={p.fireWeekdays} onChange={(fireWeekdays) => update(i, { fireWeekdays })} />
            </Field>
            <Field label="Time" htmlFor={`prep-t-${i}`} error={showErrors ? e.fireTime : undefined}>
              <div className="inline-fields">
                <input id={`prep-t-${i}`} type="time" value={p.fireTime} onChange={(ev) => update(i, { fireTime: ev.target.value })} />
                <button className="btn ghost" style={{ flex: 'none' }} onClick={() => onChange(preps.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </Field>
          </div>
        )
      })}
      {preps.length < MAX_PREPS && (
        <button className="btn outline" onClick={() => onChange([...preps, { title: '', fireWeekdays: [], fireTime: '21:00' }])}>
          Add prep
        </button>
      )}
    </div>
  )
}

export function ToleranceField({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <Field label="Tolerance" error={error}
      info="The share of check-ins you need to hit to count as on track. Misses are always recorded; tolerance only sets the status. 70–80% is a good start.">
      <div className="tol-readout" aria-hidden="true">{value}%</div>
      <input type="range" min={50} max={100} step={5} value={value} aria-label="Tolerance percent"
        onChange={(ev) => onChange(Number(ev.target.value))} />
    </Field>
  )
}

export function WhyFields({ valueId, text, onValue, onText, errors, showErrors }: {
  valueId: string; text: string; onValue: (id: string) => void; onText: (t: string) => void
  errors: { whyValueId?: string; whyText?: string }; showErrors: boolean
}) {
  const snap = useSnapshot()
  const values = snap?.values ?? []
  return (
    <>
      <Field label="Value" error={showErrors ? errors.whyValueId : undefined}>
        {values.length ? (
          <div className="chips">
            {values.map((v) => <Chip key={v.id} selected={valueId === v.id} onClick={() => onValue(v.id)}>{v.name}</Chip>)}
          </div>
        ) : (
          <button className="btn outline" onClick={() => navigate('/settings/values')}>Add values</button>
        )}
      </Field>
      <Field label="Why" htmlFor="why" error={showErrors ? errors.whyText : undefined}
        info="Shown above this goal’s items on Today, so the reason is there when you decide.">
        <textarea id="why" rows={2} value={text} placeholder="So I can carry Mia on my shoulders without my back giving out."
          onChange={(ev) => onText(ev.target.value)} />
      </Field>
    </>
  )
}

// ——— new goal screen ———

export function NewGoalScreen({ first }: { first?: boolean }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [d, setD] = useState<GoalDraft>(() => emptyGoalDraft(today))
  const set: SetField = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const patch = (p: Partial<GoalDraft>) => setD((x) => ({ ...x, ...p }))
  const errors = useMemo(() => validateGoal(d), [d])
  const mode = settings.creationMode

  const save = async () => {
    const goal = await createGoal(d)
    toast(goal.state === 'active' ? 'Goal saved.' : 'Saved to backlog (cap reached).')
    navigate(first ? '/' : `/goals/${goal.id}`, { replace: true })
  }

  return (
    <Screen back={first ? undefined : '/goals'} title="New goal"
      actions={<button className="btn ghost" onClick={() => setSettings({ creationMode: mode === 'wizard' ? 'compact' : 'wizard' })}>
        {mode === 'wizard' ? 'Compact' : 'Guided'}
      </button>}>
      {mode === 'wizard'
        ? <Wizard d={d} set={set} patch={patch} errors={errors} onSave={save} first={first} />
        : <Compact d={d} set={set} patch={patch} errors={errors} onSave={save} />}
    </Screen>
  )
}

interface FormProps {
  d: GoalDraft
  set: SetField
  patch: (p: Partial<GoalDraft>) => void
  errors: Errors<GoalDraft>
  onSave: () => void
  first?: boolean
}

const SMART = [
  { k: 'S', word: 'Specific' },
  { k: 'M', word: 'Measurable' },
  { k: 'A', word: 'Achievable' },
  { k: 'R', word: 'Relevant' },
  { k: 'T', word: 'Time-bound' },
] as const
type Letter = (typeof SMART)[number]['k'] | '+'

/** S M A R T, with the current letter lit, so the method is visible without explaining it. */
function SmartBar({ current }: { current: Letter }) {
  const idx = current === '+' ? SMART.length : SMART.findIndex((x) => x.k === current)
  const word = current === '+' ? 'Extra · Prep' : SMART[idx].word
  return (
    <div className="smart" aria-label={`SMART: ${word}`}>
      <div className="smart-letters" aria-hidden="true">
        {SMART.map((x, j) => (
          <span key={x.k} className={`smart-l ${j < idx ? 'done' : j === idx ? 'on' : ''}`}>{x.k}</span>
        ))}
      </div>
      <div className="smart-word">{word}</div>
    </div>
  )
}

function SmartHead({ k, children }: { k: Letter; children?: ReactNode }) {
  const word = k === '+' ? 'Prep · optional' : SMART.find((x) => x.k === k)!.word
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

function Wizard({ d, set, patch, errors, onSave, first }: FormProps) {
  const [i, setI] = useState(0)
  const [tried, setTried] = useState(false)

  const steps: Step[] = [
    {
      letter: 'S',
      q: 'What are you changing?',
      fields: ['title'],
      body: (
        <Field label="Goal" htmlFor="title" error={tried ? errors.title : undefined}>
          <input id="title" autoFocus value={d.title} placeholder="Exercise regularly" onChange={(e) => set('title', e.target.value)} />
        </Field>
      ),
    },
    {
      letter: 'S',
      q: 'What kind?',
      info: <><b>Rhythm</b>: a number of times per week or month, any days. <b>Threshold</b>: stay over or under a line every day, week or month. <b>Standard</b>: a rule for when something comes up — you log it when it happens.</>,
      fields: ['shape'],
      body: <ShapeField d={d} set={patch} />,
    },
    {
      letter: 'S',
      q: 'What exactly counts?',
      info: 'What’s the smallest version of this you’d still be proud of?',
      fields: ['measurementDefinition', 'label'],
      body: <MeasurementFields d={d} set={patch} e={errors} showErrors={tried} />,
    },
    {
      letter: 'M',
      q: d.shape === 'rhythm' ? 'How often?' : d.shape === 'threshold' ? 'Where’s the line?' : 'How will you check in?',
      info: d.shape === 'rhythm' ? 'Pick a number you could hit in a bad week, not a good one.' : undefined,
      fields: ['times', 'checkinType', 'targetValue', 'targetTime'],
      body: <CadenceFields d={d} set={patch} e={errors} showErrors={tried} />,
    },
    {
      letter: 'A',
      q: 'How much slack?',
      fields: ['tolerancePct'],
      body: <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={tried ? errors.tolerancePct : undefined} />,
    },
    {
      letter: 'R',
      q: 'Why does it matter?',
      fields: ['whyValueId', 'whyText'],
      body: <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(t) => set('whyText', t)} errors={errors} showErrors={tried} />,
    },
    {
      letter: 'T',
      q: 'When?',
      fields: ['startDate', 'targetDate'],
      body: (
        <>
          <Field label="Start" htmlFor="start" error={tried ? errors.startDate : undefined}>
            <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Review on (optional)" htmlFor="target" error={tried ? errors.targetDate : undefined}
            info="On this date the goal asks: did you hit it, what happened, what next. Ongoing habits can skip it.">
            <input id="target" type="date" value={d.targetDate} min={d.startDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
        </>
      ),
    },
    {
      letter: '+',
      q: 'What usually stops you?',
      info: 'A prep is a small step beforehand — like packing the gym bag the night before — that makes the real thing easier. Optional, and never scored.',
      fields: ['preps'],
      body: <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />,
    },
  ]

  const step = steps[i]
  const stepErrors = step.fields.filter((f) => errors[f])
  const last = i === steps.length - 1

  const next = () => {
    if (stepErrors.length) return setTried(true)
    setTried(false)
    if (last) {
      if (isValid(errors)) onSave()
      return
    }
    setI(i + 1)
    window.scrollTo(0, 0)
  }

  return (
    <div>
      <SmartBar current={step.letter} />
      <h2 className="wizard-q title-row">
        {step.q}
        {step.info && <InfoTip label="More about this step">{step.info}</InfoTip>}
      </h2>
      {step.body}
      <div className="wizard-nav">
        {i > 0 ? <button className="btn" onClick={() => { setTried(false); setI(i - 1) }}>Back</button>
          : first ? <button className="btn" onClick={() => navigate('/', { replace: true })}>Later</button> : null}
        <button className="btn primary" onClick={next}>
          {last ? 'Save' : 'Next'}
        </button>
      </div>
    </div>
  )
}

function Compact({ d, set, patch, errors, onSave }: FormProps) {
  const [tried, setTried] = useState(false)
  const submit = () => (isValid(errors) ? onSave() : setTried(true))
  const cErr = validateCommitment(d)
  return (
    <div>
      <section className="smart-section">
        <SmartHead k="S" />
        <Field label="Goal" htmlFor="title" error={tried ? errors.title : undefined}>
          <input id="title" value={d.title} placeholder="Exercise regularly" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Kind" info={<><b>Rhythm</b>: a number of times per week or month, any days. <b>Threshold</b>: stay over or under a line every day, week or month. <b>Standard</b>: a rule for when something comes up — you log it when it happens.</>}>
          <ShapeField d={d} set={patch} />
        </Field>
        <div style={{ marginTop: 18 }}><MeasurementFields d={d} set={patch} e={cErr} showErrors={tried} /></div>
      </section>
      <section className="smart-section">
        <SmartHead k="M" />
        <CadenceFields d={d} set={patch} e={cErr} showErrors={tried} />
      </section>
      <section className="smart-section">
        <SmartHead k="A" />
        <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={tried ? errors.tolerancePct : undefined} />
      </section>
      <section className="smart-section">
        <SmartHead k="R" />
        <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(t) => set('whyText', t)} errors={errors} showErrors={tried} />
      </section>
      <section className="smart-section">
        <SmartHead k="T" />
        <div className="inline-fields">
          <Field label="Start" htmlFor="start" error={tried ? errors.startDate : undefined}>
            <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Review on" htmlFor="target" error={tried ? errors.targetDate : undefined}>
            <input id="target" type="date" value={d.targetDate} min={d.startDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
        </div>
      </section>
      <section className="smart-section">
        <SmartHead k="+">
          <InfoTip label="About preps">A small step beforehand — like packing the gym bag the night before — that makes the real thing easier. Never scored.</InfoTip>
        </SmartHead>
        <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
      </section>
      {tried && !isValid(errors) && <p className="field-error" style={{ marginTop: 16 }}>Check the fields above.</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={submit}>Save goal</button>
      </div>
    </div>
  )
}
