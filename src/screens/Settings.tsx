import { useEffect, useRef, useState } from 'react'
import { exportData, importData, parseBackup, shareOrDownload } from '../db/backup'
import { deleteValue, saveValues } from '../db/repo'
import { setSettings } from '../db/settings'
import { langSetting, setLangSetting, t, tlist, tn, type LangSetting } from '../i18n'
import { formatTime, isDateStr } from '../lib/dates'
import { loadSampleData } from '../dev/sample'
import { eraseAllData, signIn, signOut, syncNow, useSyncStatus } from '../sync/controller'
import { Field, Screen, Section, Segmented, Stepper, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconClose } from '../ui/icons'
import { navigate, useLocation } from '../ui/router'
import { resetIntro } from './Intro'

export function SettingsScreen() {
  const settings = useSettings()
  const snap = useSnapshot()
  const { query } = useLocation()
  const values = snap?.values ?? []

  // From the intro's "Restore from a backup": only what restoring needs.
  if (query.get('view') === 'restore') {
    return (
      <Screen back="/" title={t('set.restoreTitle')}>
        <DataSection lastExportAt={settings.lastExportAt} />
        <DevSection devToday={settings.devToday} />
      </Screen>
    )
  }

  return (
    <Screen back="/" title={t('set.title')}>
      <Section>
        <div className="card list">
          <button className="list-row" onClick={() => navigate('/settings/values')}>
            <div className="text">
              <div className="title">{t('set.values')}</div>
              <div className="sub">{values.length ? values.map((v) => v.name).join(' · ') : t('set.noneYet')}</div>
            </div>
            <IconChevronRight className="chev" width={18} />
          </button>
          <button className="list-row" onClick={() => { resetIntro(); navigate('/welcome') }}>
            <div className="text">
              <div className="title">{t('set.replay')}</div>
              <div className="sub">{t('set.replaySub')}</div>
            </div>
            <IconChevronRight className="chev" width={18} />
          </button>
        </div>
      </Section>

      <Section>
        <div className="card pad">
          <Field label={t('set.language')}>
            <Segmented<LangSetting> label={t('set.language')} value={langSetting()} onChange={setLangSetting}
              options={[{ value: 'auto', label: t('set.langAuto') }, { value: 'en', label: t('set.langEnglish') }, { value: 'pt-BR', label: t('set.langPortuguese') }]} />
          </Field>
          <Field label={t('set.newDay')} htmlFor="rollover" info={t('set.newDayInfo')}>
            <select id="rollover" value={settings.rolloverHour} onChange={(e) => setSettings({ rolloverHour: Number(e.target.value) })}>
              {Array.from({ length: 9 }, (_, h) => <option key={h} value={h}>{formatTime(h * 60)}</option>)}
            </select>
          </Field>
          <Field label={t('set.activeGoals')} info={t('set.activeGoalsInfo')}>
            <Stepper label={t('set.goalCap')} value={settings.goalCap} min={1} max={10} onChange={(goalCap) => setSettings({ goalCap })} />
          </Field>
          <Field label={t('set.newGoals')}>
            <Segmented label={t('set.creationMode')} value={settings.creationMode} onChange={(creationMode) => setSettings({ creationMode })}
              options={[{ value: 'wizard', label: t('form.guided') }, { value: 'compact', label: t('form.compact') }]} />
          </Field>
        </div>
      </Section>

      <SyncSection />
      <DataSection lastExportAt={settings.lastExportAt} />
      <EraseSection />
      <DevSection devToday={settings.devToday} />
    </Screen>
  )
}

function ago(iso: string | null): string {
  if (!iso) return t('set.never')
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return t('set.justNow')
  if (mins < 60) return t('set.minAgo', { n: mins })
  const h = Math.round(mins / 60)
  if (h < 48) return t('set.hAgo', { n: h })
  return t('set.daysAgo', { n: Math.round(h / 24) })
}

function SyncSection() {
  const s = useSyncStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!s.configured) {
    return (
      <Section title={t('set.sync')}>
        <div className="card pad small muted">{t('set.syncOff')}</div>
      </Section>
    )
  }

  if (s.phase === 'signed-out') {
    return (
      <Section title={t('set.sync')}>
        <div className="card pad">
          <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)) }}>
            <Field label={t('set.email')} htmlFor="email" info={t('set.emailInfo')}>
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('set.password')} htmlFor="password">
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !email.includes('@') || !password}>{t('set.signIn')}</button>
          </form>
          {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}
        </div>
      </Section>
    )
  }

  return (
    <Section title={t('set.sync')}>
      <div className="card pad">
        <dl className="kv">
          <dt>{t('set.account')}</dt><dd>{s.email}</dd>
          <dt>{t('set.synced')}</dt>
          <dd>{s.phase === 'syncing' ? t('set.syncing') : s.phase === 'error' ? t('set.offlineRetry', { when: ago(s.lastSyncedAt) }) : ago(s.lastSyncedAt)}</dd>
          {s.pending > 0 && <><dt>{t('set.waiting')}</dt><dd>{s.pending}</dd></>}
        </dl>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={syncNow} disabled={s.phase === 'syncing'}>{t('set.syncNow')}</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => signOut()}>{t('set.signOut')}</button>
        </div>
      </div>
    </Section>
  )
}

async function doExport() {
  const r = await shareOrDownload(await exportData())
  if (r !== 'cancelled') {
    await setSettings({ lastExportAt: new Date().toISOString() })
    toast(t('set.exported'))
  }
}

function DataSection({ lastExportAt }: { lastExportAt: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  const doImport = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      if (!confirm(t('set.mergeQ', { date: backup.exportedAt.slice(0, 10) }))) return
      const n = await importData(backup)
      toast(n ? tn('set.imported', n) : t('set.nothingNew'))
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Section title={t('set.backup')}>
      <div className="card pad">
        <div className="row">
          <button className="btn primary" onClick={doExport}>{t('set.export')}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>{t('set.import')}</button>
          <span className="spacer" />
          <span className="small muted">{t('set.last', { when: ago(lastExportAt) })}</span>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {persisted === false && (
          <p className="small muted" style={{ marginTop: 12 }}>{t('set.addHome')}</p>
        )}
      </div>
    </Section>
  )
}

function EraseSection() {
  const sync = useSyncStatus()
  const [open, setOpen] = useState(false)
  const synced = sync.configured && sync.phase !== 'signed-out'

  const erase = async () => {
    try {
      await eraseAllData()
      window.location.replace('/')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Section>
      {!open ? (
        <button className="btn danger block" onClick={() => setOpen(true)}>{t('set.eraseAll')}</button>
      ) : (
        <div className="card pad">
          <p style={{ fontWeight: 650, marginBottom: 6 }}>{t('set.eraseQ')}</p>
          <p className="small muted" style={{ marginBottom: 14 }}>
            {synced ? t('set.eraseTextSync') : t('set.eraseText')}{' '}
            <button className="link-btn" style={{ minHeight: 0 }} onClick={doExport}>{t('set.exportFirst')}</button>
          </p>
          <TypeToConfirm phrase={t('set.erasePhrase')} action={t('set.eraseButton')} onConfirm={erase} />
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
        </div>
      )}
    </Section>
  )
}

// ——— developer (temporary) ———

function DevSection({ devToday }: { devToday: string | null }) {
  const settings = useSettings()
  const today = useToday(settings.rolloverHour)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    if (!confirm('Replace ALL data with sample data? Your current data is erased (including the synced copy).')) return
    setBusy(true)
    try {
      await loadSampleData(today)
      window.location.replace('/')
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Section title="Developer">
      <div className="card pad">
        <Field label="Pretend today is" htmlFor="dev-today"
          info="For testing. The app acts as if it’s this date: Today, miss prompts, due badges and scores all follow it. Clear it to go back to the real date.">
          <div className="inline-fields">
            <input id="dev-today" type="date" value={devToday ?? ''}
              onChange={(e) => setSettings({ devToday: isDateStr(e.target.value) ? e.target.value : null })} />
            {devToday && <button className="btn" style={{ flex: 'none' }} onClick={() => setSettings({ devToday: null })}>Real date</button>}
          </div>
        </Field>
        <button className="btn outline block" style={{ marginTop: 16 }} disabled={busy} onClick={load}>
          {busy ? 'Loading…' : 'Load sample data…'}
        </button>
      </div>
    </Section>
  )
}

// ——— values ———

interface ValueDraft {
  id?: string
  name: string
  description: string
}

export function ValuesEditor(props: { onSaved?: () => void }) {
  const snap = useSnapshot()
  const [drafts, setDrafts] = useState<ValueDraft[] | null>(null)
  const [tried, setTried] = useState(false)
  if (snap && !drafts) {
    const existing: ValueDraft[] = snap.values.map((v) => ({ id: v.id, name: v.name, description: v.description }))
    setDrafts(existing.length ? existing : [{ name: '', description: '' }, { name: '', description: '' }, { name: '', description: '' }])
  }
  if (!snap || !drafts) return null

  const filled = drafts.filter((d) => d.name.trim())
  const min = 1
  const max = 12
  const ok = filled.length >= min && filled.length <= max
  const inUse = (id?: string) => !!id && snap.goals.some((g) => g.whyValueId === id)
  const update = (i: number, p: Partial<ValueDraft>) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const save = async () => {
    if (!ok) return setTried(true)
    await saveValues(filled.map((d) => ({ id: d.id, name: d.name.trim(), description: d.description.trim() })))
    const removed = snap.values.filter((v) => !filled.some((d) => d.id === v.id))
    for (const v of removed) if (!inUse(v.id)) await deleteValue(v)
    props.onSaved?.()
  }

  return (
    <div>
      <div className="card list">
        {drafts.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="text stack" style={{ gap: 6 }}>
              <input value={d.name} aria-label={t('set.valueN', { n: i + 1 })}
                placeholder={tlist('set.valuePlaceholders')[i % 5]}
                onChange={(e) => update(i, { name: e.target.value })} />
              <input value={d.description} aria-label={t('set.valueMeansN', { n: i + 1 })} placeholder={t('set.valueMeans')}
                style={{ minHeight: 38, fontSize: 14 }} onChange={(e) => update(i, { description: e.target.value })} />
            </div>
            {drafts.length > 1 && !inUse(d.id) && (
              <button className="icon-btn" aria-label={t('set.removeValueN', { n: i + 1 })} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                <IconClose width={18} height={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {drafts.length < max && (
        <button className="link-btn" style={{ marginTop: 6 }} onClick={() => setDrafts([...drafts, { name: '', description: '' }])}>
          {t('set.addValue')}
        </button>
      )}
      {tried && !ok && <p className="field-error" style={{ marginTop: 12 }}>{t('set.writeN', { min, max })}</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  )
}

export function ValuesScreen() {
  return (
    <Screen back="/settings" title={t('set.values')}>
      <ValuesEditor onSaved={() => { toast(t('common.saved')); navigate('/settings', { replace: true }) }} />
    </Screen>
  )
}
