import { useMemo, useState, type ReactNode } from 'react'
import { createGoal } from '../db/repo'
import { setSettings } from '../db/settings'
import {
  CHECKIN_TYPES, emptyGoalDraft, isValid, MAX_PREPS, validateCommitment, validateGoal, validatePrep,
  type CommitmentDraft, type Errors, type GoalDraft, type PrepDraft,
} from '../lib/draft'
import type { Period, Shape } from '../lib/types'
import { Chip, Field, Screen, Segmented, Stepper, toast, WeekdayPicker } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { navigate } from '../ui/router'

const SHAPES: { value: Shape; title: string; body: string; example: string }[] = [
  { value: 'rhythm', title: 'Rhythm', body: 'Do it a number of times per week or month, on whichever days work.', example: 'Gym 3× per week' },
  { value: 'threshold', title: 'Threshold', body: 'Stay over or under a limit every day, week or month.', example: 'Sleep at least 8 hours a night' },
  { value: 'standard', title: 'Standard', body: 'A rule for when a situation comes up. You log it when it happens.', example: 'Arrive on time to anything agreed' },
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
          <div className="d">{s.body}</div>
          <div className="example">{s.example}</div>
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
      <Field label="The check-in sentence" htmlFor="m-def" error={showErrors ? e.measurementDefinition : undefined}
        hint="Written so you can answer yes or no without a judgment call. Include how much, how long, or by when.">
        <textarea id="m-def" value={d.measurementDefinition} rows={2}
          placeholder={d.shape === 'standard' ? 'Arrived at or before the agreed time' : d.shape === 'threshold' ? 'Slept at least 8 hours' : 'Did at least 45 minutes of exercise'}
          onChange={(ev) => set({ measurementDefinition: ev.target.value })} />
      </Field>
      <Field label="Short name" htmlFor="m-label" error={showErrors ? e.label : undefined}
        hint="Used in prompts: “You missed Tuesday’s gym”.">
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
        <Field label="How often" error={showErrors ? e.times : undefined}>
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
            <Field label={d.period === 'day' ? 'The limit' : `The limit, summed over the ${d.period}`} error={showErrors ? e.targetValue : undefined}>
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
            <Field label="The time" error={showErrors ? e.targetTime : undefined}
              hint="Times after midnight count as late, until your day rolls over.">
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

      {d.shape === 'standard' && (
        <p className="field-hint" style={{ marginTop: 14 }}>
          {d.checkinType === 'timestamp'
            ? 'Each time it comes up, you log the agreed time and when you actually arrived. On time or early is a hit.'
            : 'Each time it comes up, you log whether you kept it.'}{' '}
          Nothing shows on Today by default; log from the + button.
        </p>
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
            <Field label="On these evenings" error={showErrors ? e.fireWeekdays : undefined}>
              <WeekdayPicker value={p.fireWeekdays} onChange={(fireWeekdays) => update(i, { fireWeekdays })} />
            </Field>
            <Field label="At" htmlFor={`prep-t-${i}`} error={showErrors ? e.fireTime : undefined}>
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
          {preps.length ? 'Add another prep' : 'Add a prep'}
        </button>
      )}
    </div>
  )
}

export function ToleranceField({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <Field label="Tolerance" error={error}
      hint="The share of check-ins you need to hit to be on track. A miss is always recorded; tolerance only decides the status. Most people start at 70–80% and raise it later.">
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
      <Field label="Which of your values does it serve?" error={showErrors ? errors.whyValueId : undefined}>
        {values.length ? (
          <div className="chips">
            {values.map((v) => <Chip key={v.id} selected={valueId === v.id} onClick={() => onValue(v.id)}>{v.name}</Chip>)}
          </div>
        ) : (
          <button className="btn outline" onClick={() => navigate('/settings/values')}>Write your values first</button>
        )}
      </Field>
      <Field label="How does this goal serve it?" htmlFor="why" error={showErrors ? errors.whyText : undefined}
        hint="This sentence sits beside every item this goal puts on Today, at the moment you decide.">
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
    toast(goal.state === 'active' ? 'Goal saved. It’s on Today.' : `Saved to the backlog — you have ${settings.goalCap} active goals.`)
    navigate(first ? '/' : `/goals/${goal.id}`, { replace: true })
  }

  return (
    <Screen back={first ? undefined : '/goals'} eyebrow={first ? 'Your first goal' : 'New goal'} title={mode === 'wizard' ? 'One step at a time' : 'New goal'}
      actions={<button className="btn ghost" onClick={() => setSettings({ creationMode: mode === 'wizard' ? 'compact' : 'wizard' })}>
        {mode === 'wizard' ? 'Compact form' : 'Guided'}
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

interface Step {
  q: string
  lead: ReactNode
  fields: (keyof GoalDraft)[]
  body: ReactNode
}

function Wizard({ d, set, patch, errors, onSave, first }: FormProps) {
  const [i, setI] = useState(0)
  const [tried, setTried] = useState(false)

  const steps: Step[] = [
    {
      q: 'What behavior are you changing?',
      lead: 'Name it plainly. The next steps turn it into something you can check.',
      fields: ['title'],
      body: (
        <Field label="Goal" htmlFor="title" error={tried ? errors.title : undefined}>
          <input id="title" autoFocus value={d.title} placeholder="Exercise regularly" onChange={(e) => set('title', e.target.value)} />
        </Field>
      ),
    },
    {
      q: 'What shape does it take?',
      lead: 'This decides how it shows up on Today and how it’s scored.',
      fields: ['shape'],
      body: <ShapeField d={d} set={patch} />,
    },
    {
      q: 'What exactly counts?',
      lead: <>What’s the smallest version of this you’d still be proud of? “Go to the gym” can’t be checked. “Did at least 45 minutes of exercise” can.</>,
      fields: ['measurementDefinition', 'label'],
      body: <MeasurementFields d={d} set={patch} e={errors} showErrors={tried} />,
    },
    {
      q: d.shape === 'rhythm' ? 'How often?' : d.shape === 'threshold' ? 'Where’s the line?' : 'How will you check in?',
      lead: d.shape === 'rhythm' ? 'Pick a number you could hit in a bad week, not a good one.' : 'Make the check-in something you can answer in five seconds.',
      fields: ['times', 'checkinType', 'targetValue', 'targetTime'],
      body: <CadenceFields d={d} set={patch} e={errors} showErrors={tried} />,
    },
    {
      q: 'How much slack do you need?',
      lead: 'There are no skip days. Tolerance is the room you give real life.',
      fields: ['tolerancePct'],
      body: <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={tried ? errors.tolerancePct : undefined} />,
    },
    {
      q: 'Why does it matter?',
      lead: 'Goals fail when the reason isn’t there at the moment of choice. This is what you’ll see then.',
      fields: ['whyValueId', 'whyText'],
      body: <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(t) => set('whyText', t)} errors={errors} showErrors={tried} />,
    },
    {
      q: 'When?',
      lead: 'Ongoing behaviors don’t need an end date. Add one if you want a review point.',
      fields: ['startDate', 'targetDate'],
      body: (
        <>
          <Field label="Start" htmlFor="start" error={tried ? errors.startDate : undefined}>
            <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Review on (optional)" htmlFor="target" error={tried ? errors.targetDate : undefined}
            hint="On this date the goal asks: did you hit it, what happened, what next.">
            <input id="target" type="date" value={d.targetDate} min={d.startDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
        </>
      ),
    },
    {
      q: 'What usually stops you?',
      lead: <>A prep removes friction the evening before, while your judgment is still good. Optional — add one now, or later when a miss shows you what gets in the way.</>,
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
      <div className="wizard-progress" aria-label={`Step ${i + 1} of ${steps.length}`}>
        {steps.map((_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}
      </div>
      <h2 className="wizard-q">{step.q}</h2>
      <p className="wizard-lead">{step.lead}</p>
      {step.body}
      <div className="wizard-nav">
        {i > 0 ? <button className="btn" onClick={() => { setTried(false); setI(i - 1) }}>Back</button>
          : first ? <button className="btn" onClick={() => navigate('/', { replace: true })}>Later</button> : null}
        <button className="btn primary" onClick={next}>
          {last ? (d.preps.length ? 'Save goal' : 'Save without a prep') : 'Next'}
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
      <Field label="Goal" htmlFor="title" error={tried ? errors.title : undefined}>
        <input id="title" value={d.title} placeholder="Exercise regularly" onChange={(e) => set('title', e.target.value)} />
      </Field>
      <div className="section"><div className="section-head"><h2>Commitment</h2></div>
        <ShapeField d={d} set={patch} />
      </div>
      <div className="section">
        <MeasurementFields d={d} set={patch} e={cErr} showErrors={tried} />
        <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={cErr} showErrors={tried} /></div>
      </div>
      <div className="section">
        <ToleranceField value={d.tolerancePct} onChange={(n) => set('tolerancePct', n)} error={tried ? errors.tolerancePct : undefined} />
      </div>
      <div className="section">
        <WhyFields valueId={d.whyValueId} text={d.whyText} onValue={(v) => set('whyValueId', v)} onText={(t) => set('whyText', t)} errors={errors} showErrors={tried} />
      </div>
      <div className="section">
        <div className="inline-fields">
          <Field label="Start" htmlFor="start" error={tried ? errors.startDate : undefined}>
            <input id="start" type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Review on" htmlFor="target" error={tried ? errors.targetDate : undefined}>
            <input id="target" type="date" value={d.targetDate} min={d.startDate} onChange={(e) => set('targetDate', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="section"><div className="section-head"><h2>Preps</h2><span>optional</span></div>
        <PrepEditor preps={d.preps} onChange={(p) => set('preps', p)} showErrors={tried} />
      </div>
      {tried && !isValid(errors) && <p className="field-error" style={{ marginTop: 16 }}>Some fields need attention above.</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={submit}>Save goal</button>
      </div>
    </div>
  )
}
