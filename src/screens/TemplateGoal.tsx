import { useMemo, useState, useSyncExternalStore } from 'react'
import { addCommitment, addPrep, createGoal, createProject, ensureValue } from '../db/repo'
import { setSettings } from '../db/settings'
import { marked, t } from '../i18n'
import { addDays, dayMonth, diffDays, isDateStr, weekdaysLabel } from '../lib/dates'
import {
  emptyCommitmentDraft, isValid, validateCommitment, validateGoal, validatePrep,
  type CommitmentDraft, type GoalDraft, type PrepDraft,
} from '../lib/draft'
import { cadenceOf, type Template, type TemplateHabit, type TemplateProject } from '../lib/templates'
import type { DateStr, Value } from '../lib/types'
import { Field, PageText, Screen, Section, Sheet, toast } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconClose } from '../ui/icons'
import { goBack, navigate } from '../ui/router'
import { CadenceFields, Compact, graceLabel, MeasurementFields, PrepEditor, ShapeField, ShapeInfo, Wizard, type SetField } from './GoalForm'

/**
 * A goal from a template, before it exists. Picking a template opens it laid
 * out like a goal's page, ready to change: habits and projects right there,
 * the goal's own SMART fields through Edit. Nothing is written until Save
 * goal. Kept per tab, so a reload doesn't lose it; picking a template again
 * (or Back to the list) starts it over.
 *
 *   /goals/new?template=key          the draft    Edit · Save goal
 *   /goals/new?template=key&smart=1  SMART form on it (finishing keeps the changes, Back drops them)
 */
export interface TemplateDraft {
  key: string
  goal: GoalDraft
  /** The template's value, created on save if the goal still points at none (whyValueId ''). */
  valueName: string
  habits: TemplateHabit[]
  projects: TemplateProject[]
}

const STORE_KEY = 'template-draft'
const subs = new Set<() => void>()
let store: TemplateDraft | null = (() => {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    // An older shape ({ draft, working }) is dropped: the template just starts over.
    return parsed && 'key' in parsed ? (parsed as TemplateDraft) : null
  } catch {
    return null
  }
})()

function setStore(d: TemplateDraft | null) {
  store = d
  try {
    if (d) sessionStorage.setItem(STORE_KEY, JSON.stringify(d))
    else sessionStorage.removeItem(STORE_KEY)
  } catch {
    // private mode: a reload starts the template over
  }
  subs.forEach((f) => f())
}

const useStore = () => useSyncExternalStore((l) => (subs.add(l), () => subs.delete(l)), () => store)

function fromTemplate(tpl: Template, start: DateStr, values: Value[]): TemplateDraft {
  const value = values.find((v) => !v.deletedAt && v.name.trim().toLowerCase() === tpl.value.trim().toLowerCase())
  return { key: tpl.key, goal: { ...tpl.draft(start), whyValueId: value?.id ?? '' }, valueName: tpl.value, habits: tpl.habits, projects: tpl.projects }
}

/** Picking a template from the list starts it fresh. */
export function startTemplate(tpl: Template) {
  setStore(null)
  navigate(`/goals/new?template=${tpl.key}`)
}

async function saveDraft(d: TemplateDraft) {
  const start = d.goal.startDate
  const goal = await createGoal({ ...d.goal, whyValueId: d.goal.whyValueId || await ensureValue(d.valueName) })
  for (const h of d.habits) {
    const c = await addCommitment(goal, h.draft, addDays(start, h.startIn))
    for (const p of h.preps) await addPrep(c.id, p)
  }
  for (const p of d.projects) {
    await createProject({ title: p.title, targetDate: addDays(start, p.days), goalId: goal.id, steps: p.steps })
  }
}

// ——— screens ———

export function TemplateGoalScreen({ tpl, smart }: { tpl: Template; smart: boolean }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const snap = useSnapshot()
  const s = useStore()
  if (!snap) return null
  const draft = s?.key === tpl.key ? s : fromTemplate(tpl, today, snap.values)
  const base = `/goals/new?template=${tpl.key}`
  if (smart) return <TemplateSmartForm key={tpl.key} draft={draft} back={base} />
  return <TemplateEdit draft={draft} values={snap.values} back={base} />
}

/** The draft, laid out like a goal's page: habits and projects changed here, the rest through Edit. Save goal writes it all. */
function TemplateEdit({ draft, values, back }: { draft: TemplateDraft; values: Value[]; back: string }) {
  const [habit, setHabit] = useState<number | 'new' | null>(null)
  const [project, setProject] = useState<number | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const update = (p: Partial<TemplateDraft>) => setStore({ ...draft, ...p })
  const save = async () => {
    setBusy(true)
    await saveDraft(draft)
    setStore(null)
    toast(draft.habits.length || draft.projects.length ? t('tpl.saved') : t('form.savedBacklog'))
    navigate('/')
  }
  return (
    <Screen back="/goals/new" title={t('form.newGoal')}>
      <DraftView draft={draft} values={values} edit={{
        addHabit: () => setHabit('new'),
        editHabit: setHabit,
        removeHabit: (i) => update({ habits: draft.habits.filter((_, j) => j !== i) }),
        addProject: () => setProject('new'),
        editProject: setProject,
        removeProject: (i) => update({ projects: draft.projects.filter((_, j) => j !== i) }),
      }} />
      <div className="wizard-nav">
        <button className="btn" disabled={busy} onClick={() => navigate(`${back}&smart=1`)}>{t('common.edit')}</button>
        <button className="btn primary" disabled={busy} onClick={save}>{t('form.saveGoal')}</button>
      </div>
      <HabitSheet editing={habit} draft={draft} onClose={() => setHabit(null)}
        onSave={(h) => update({ habits: habit === 'new' ? [...draft.habits, h] : draft.habits.map((x, j) => (j === habit ? h : x)) })} />
      <ProjectSheet editing={project} draft={draft} onClose={() => setProject(null)}
        onSave={(p) => update({ projects: project === 'new' ? [...draft.projects, p] : draft.projects.map((x, j) => (j === project ? p : x)) })} />
    </Screen>
  )
}

/** The goal's own SMART fields, in the draft. Finishing keeps them, Back drops them. */
function TemplateSmartForm({ draft, back }: { draft: TemplateDraft; back: string }) {
  const settings = useSettings()
  const [d, setD] = useState<GoalDraft>(draft.goal)
  const set: SetField = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const patch = (p: Partial<GoalDraft>) => setD((x) => ({ ...x, ...p }))
  // The template's value counts as picked: it's created when the goal is saved.
  const errors = useMemo(() => {
    const e = validateGoal(d)
    if (!d.whyValueId && draft.valueName) delete e.whyValueId
    return e
  }, [d, draft.valueName])
  const save = () => {
    setStore({ ...draft, goal: d })
    goBack(back)
  }
  const mode = settings.creationMode
  const Form = mode === 'wizard' ? Wizard : Compact
  // Guided or compact, as in New goal: the choice is the same setting.
  return (
    <Screen back={back} title={t('goal.editGoal')}
      actions={<button className="btn ghost" onClick={() => setSettings({ creationMode: mode === 'wizard' ? 'compact' : 'wizard' })}>
        {mode === 'wizard' ? t('form.compact') : t('form.guided')}
      </button>}>
      <Form d={d} set={set} patch={patch} errors={errors} onSave={save} suggest={draft.valueName} />
    </Screen>
  )
}

// ——— the draft, shown like a goal's page ———

interface EditActions {
  addHabit: () => void
  editHabit: (i: number) => void
  removeHabit: (i: number) => void
  addProject: () => void
  editProject: (i: number) => void
  removeProject: (i: number) => void
}

function DraftView({ draft, values, edit }: { draft: TemplateDraft; values: Value[]; edit?: EditActions }) {
  const d = draft.goal
  const outcome = d.goalKind === 'outcome'
  const start = d.startDate
  const value = values.find((v) => v.id === d.whyValueId)?.name ?? draft.valueName
  const date = (s: DateStr) => `${dayMonth(s)} ${s.slice(0, 4)}`
  const buttons = (onEdit: () => void, onRemove: () => void) => edit && (
    <div className="row" style={{ marginTop: 10, gap: 4 }}>
      <button className="btn" onClick={onEdit}>{t('common.edit')}</button>
      <button className="btn ghost" onClick={onRemove}>{t('common.remove')}</button>
    </div>
  )
  const add = (onClick: () => void) => edit && <button className="link-btn" onClick={onClick}>{t('common.add')}</button>

  return (
    <div>
      <div className="eyebrow">{t('tpl.from')} · {value}</div>
      <h2 className="template-title">{d.title}</h2>

      <div className="card tint-goal">
        {d.whyText && <div className="pad card-head"><div className="group-why">{d.whyText}</div></div>}
        <div className="pad">
          <dl className="kv">
            {outcome && <><dt>{t('goal.doneWhen')}</dt><dd>{d.doneWhen}</dd></>}
            {outcome && d.targetDate && <><dt>{t('goal.deadline')}</dt><dd>{date(d.targetDate)}</dd></>}
            {outcome && <><dt>{t('goal.extraTime')}</dt><dd>{graceLabel(d.graceDays)}</dd></>}
            <dt>{t('goal.since')}</dt><dd>{date(start)}</dd>
            {!outcome && <><dt>{t('goal.tolerance')}</dt><dd>{d.tolerancePct}%</dd></>}
            {!outcome && d.targetDate && <><dt>{t('goal.reviewOn')}</dt><dd>{date(d.targetDate)}</dd></>}
          </dl>
        </div>
      </div>

      {(!outcome || draft.habits.length > 0 || edit) && (
        <Section title={outcome ? t('goal.supportingHabits') : t('goal.commitments')} aside={edit && add(edit.addHabit)}>
          <div className="stack">
            {!outcome && (
              <div className="card commitment-card">
                <div className="pad">
                  <div className="group-eyebrow">{d.label} · {cadenceOf(d)}</div>
                  <div style={{ fontWeight: 600 }}>{d.measurementDefinition}</div>
                </div>
                <PrepList preps={d.preps} />
              </div>
            )}
            {draft.habits.map((h, i) => (
              <div key={i} className="card commitment-card">
                <div className="pad">
                  <div className="group-eyebrow">
                    {h.draft.label} · {cadenceOf(h.draft)}
                    {h.startIn > 0 && <> · <b>{t('goal.startsOn', { when: dayMonth(addDays(start, h.startIn)) })}</b></>}
                  </div>
                  <div style={{ fontWeight: 600 }}>{h.draft.measurementDefinition}</div>
                  {edit && buttons(() => edit.editHabit(i), () => edit.removeHabit(i))}
                </div>
                <PrepList preps={h.preps} />
              </div>
            ))}
            {outcome && !draft.habits.length && <div className="card list-empty">{t('common.noneYet')}</div>}
          </div>
        </Section>
      )}

      {(draft.projects.length > 0 || edit) && (
        <Section title={t('goal.projects')} aside={edit && add(edit.addProject)}>
          <div className="stack">
            {draft.projects.map((p, i) => (
              <div key={i} className="card pad tint-project">
                <div style={{ fontWeight: 650 }}>{p.title}</div>
                <div className="small muted">{t('today.due', { when: dayMonth(addDays(start, p.days)) })}</div>
                <ol className="template-steps">{p.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                {edit && buttons(() => edit.editProject(i), () => edit.removeProject(i))}
              </div>
            ))}
            {!draft.projects.length && <div className="card list-empty">{t('common.noneYet')}</div>}
          </div>
        </Section>
      )}
    </div>
  )
}

/** Preps under a habit, the way the goal page lists them. */
function PrepList({ preps }: { preps: PrepDraft[] }) {
  if (!preps.length) return null
  return (
    <div className="prep-block">
      <div className="prep-block-head">{t('ins.preps')}</div>
      <div className="list">
        {preps.map((p, i) => (
          <div key={i} className="list-row">
            <div className="text">
              <div className="title" style={{ fontSize: 15 }}>{p.title}</div>
              <div className="sub">{t('goal.prepWhen', { days: weekdaysLabel(p.fireWeekdays), time: p.fireTime })}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ——— sheets ———

function HabitSheet({ editing, draft, onSave, onClose }: {
  editing: number | 'new' | null; draft: TemplateDraft; onSave: (h: TemplateHabit) => void; onClose: () => void
}) {
  const start = draft.goal.startDate
  const [d, setD] = useState<CommitmentDraft>(emptyCommitmentDraft)
  const [preps, setPreps] = useState<PrepDraft[]>([])
  const [from, setFrom] = useState(start)
  const [tried, setTried] = useState(false)
  const [key, setKey] = useState<unknown>(null)
  if (editing !== key) {
    const h = typeof editing === 'number' ? draft.habits[editing] : null
    setKey(editing)
    setTried(false)
    setD(h ? h.draft : emptyCommitmentDraft())
    setPreps(h ? h.preps : [])
    setFrom(addDays(start, h?.startIn ?? 0))
  }
  if (editing == null) return null
  const e = validateCommitment(d)
  const ok = isValid(e) && preps.every((p) => isValid(validatePrep(p))) && isDateStr(from)
  const save = () => {
    if (!ok) return setTried(true)
    onSave({ draft: d, preps, startIn: Math.max(0, diffDays(start, from)) })
    onClose()
  }
  const patch = (p: Partial<CommitmentDraft>) => setD((x) => ({ ...x, ...p }))
  return (
    <Sheet open onClose={onClose} title={editing === 'new' ? t('goal.newCommitment') : t('goal.editCommitment')}>
      {editing === 'new' && <Field label={t('goal.kind')} info={<ShapeInfo />}><ShapeField d={d} set={patch} /></Field>}
      <div style={{ height: 18 }} />
      <MeasurementFields d={d} set={patch} e={e} showErrors={tried} />
      <div style={{ marginTop: 18 }}><CadenceFields d={d} set={patch} e={e} showErrors={tried} /></div>
      <Field label={t('goal.starts')} htmlFor="h-start" info={<PageText text={marked('goal.startsInfo')} />}>
        <input id="h-start" type="date" min={start} value={from} onChange={(ev) => setFrom(ev.target.value)} />
      </Field>
      <Field label={t('ins.preps')}>
        <PrepEditor preps={preps} onChange={setPreps} showErrors={tried} />
      </Field>
      <div className="sheet-actions"><button className="btn primary" onClick={save}>{t('common.save')}</button></div>
    </Sheet>
  )
}

function ProjectSheet({ editing, draft, onSave, onClose }: {
  editing: number | 'new' | null; draft: TemplateDraft; onSave: (p: TemplateProject) => void; onClose: () => void
}) {
  const start = draft.goal.startDate
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(start)
  const [steps, setSteps] = useState<string[]>([''])
  const [tried, setTried] = useState(false)
  const [key, setKey] = useState<unknown>(null)
  if (editing !== key) {
    const p = typeof editing === 'number' ? draft.projects[editing] : null
    setKey(editing)
    setTried(false)
    setTitle(p?.title ?? '')
    setDate(addDays(start, p?.days ?? 30))
    setSteps(p ? [...p.steps] : [''])
  }
  if (editing == null) return null
  const errors = {
    title: title.trim() ? undefined : t('project.nameOutcome'),
    date: isDateStr(date) && date >= start ? undefined : t('project.dateFromToday'),
  }
  const save = () => {
    if (errors.title || errors.date) return setTried(true)
    onSave({ title: title.trim(), days: diffDays(start, date), steps: steps.map((s) => s.trim()).filter(Boolean) })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={editing === 'new' ? t('project.new') : t('tpl.editProject')}>
      <Field label={t('project.outcome')} htmlFor="tp-title" error={tried ? errors.title : undefined}>
        <input id="tp-title" value={title} placeholder={t('project.phOutcome')} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('project.targetDate')} htmlFor="tp-date" error={tried ? errors.date : undefined}>
        <input id="tp-date" type="date" min={start} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={t('project.steps')}>
        <ol className="steps-editor">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="num">{i + 1}</span>
              <input value={s} aria-label={t('project.stepN', { n: i + 1 })} placeholder={i === 0 ? t('project.phStep') : ''}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} />
              {steps.length > 1 && (
                <button type="button" className="icon-btn step-remove" aria-label={t('project.removeStepN', { n: i + 1 })}
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                  <IconClose width={16} height={16} />
                </button>
              )}
            </li>
          ))}
        </ol>
        <button className="link-btn" onClick={() => setSteps([...steps, ''])}>{t('project.addStepPlus')}</button>
      </Field>
      <div className="sheet-actions"><button className="btn primary" onClick={save}>{t('common.save')}</button></div>
    </Sheet>
  )
}
