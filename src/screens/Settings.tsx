import { useEffect, useRef, useState } from 'react'
import { exportData, importData, parseBackup, shareOrDownload } from '../db/backup'
import { deleteValue, saveValues } from '../db/repo'
import { setSettings } from '../db/settings'
import { formatTime, isDateStr } from '../lib/dates'
import { loadSampleData } from '../dev/sample'
import { eraseAllData, signIn, signOut, syncNow, useSyncStatus } from '../sync/controller'
import { Field, Screen, Section, Segmented, Stepper, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconClose } from '../ui/icons'
import { navigate } from '../ui/router'

export function SettingsScreen() {
  const settings = useSettings()
  const snap = useSnapshot()
  const values = snap?.values ?? []

  return (
    <Screen back="/" title="Settings">
      <Section>
        <div className="card list">
          <button className="list-row" onClick={() => navigate('/settings/values')}>
            <div className="text">
              <div className="title">Values</div>
              <div className="sub">{values.length ? values.map((v) => v.name).join(' · ') : 'None yet'}</div>
            </div>
            <IconChevronRight className="chev" width={18} />
          </button>
        </div>
      </Section>

      <Section>
        <div className="card pad">
          <Field label="New day starts at" htmlFor="rollover"
            info="Anything logged before this time counts for the previous day, so a late night lands on the day you lived.">
            <select id="rollover" value={settings.rolloverHour} onChange={(e) => setSettings({ rolloverHour: Number(e.target.value) })}>
              {Array.from({ length: 9 }, (_, h) => <option key={h} value={h}>{formatTime(h * 60)}</option>)}
            </select>
          </Field>
          <Field label="Active goals" info="More than this and new goals wait in the backlog. Projects and tasks aren’t limited.">
            <Stepper label="Goal cap" value={settings.goalCap} min={1} max={10} onChange={(goalCap) => setSettings({ goalCap })} />
          </Field>
          <Field label="New goals">
            <Segmented label="Creation mode" value={settings.creationMode} onChange={(creationMode) => setSettings({ creationMode })}
              options={[{ value: 'wizard', label: 'Guided' }, { value: 'compact', label: 'Compact' }]} />
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
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
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
      <Section title="Sync">
        <div className="card pad small muted">Off — data is only on this phone.</div>
      </Section>
    )
  }

  if (s.phase === 'signed-out') {
    return (
      <Section title="Sync">
        <div className="card pad">
          <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)) }}>
            <Field label="Email" htmlFor="email" info="Signing in copies your data to your private database, so losing this phone loses nothing.">
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !email.includes('@') || !password}>Sign in</button>
          </form>
          {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}
        </div>
      </Section>
    )
  }

  return (
    <Section title="Sync">
      <div className="card pad">
        <dl className="kv">
          <dt>Account</dt><dd>{s.email}</dd>
          <dt>Synced</dt><dd>{s.phase === 'syncing' ? 'syncing…' : s.phase === 'error' ? `${ago(s.lastSyncedAt)} · offline, will retry` : ago(s.lastSyncedAt)}</dd>
          {s.pending > 0 && <><dt>Waiting</dt><dd>{s.pending}</dd></>}
        </dl>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={syncNow} disabled={s.phase === 'syncing'}>Sync now</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    </Section>
  )
}

async function doExport() {
  const r = await shareOrDownload(await exportData())
  if (r !== 'cancelled') {
    await setSettings({ lastExportAt: new Date().toISOString() })
    toast('Exported.')
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
      if (!confirm(`Merge the export from ${backup.exportedAt.slice(0, 10)}? Newer records win.`)) return
      const n = await importData(backup)
      toast(n ? `Imported ${n} record${n === 1 ? '' : 's'}.` : 'Nothing new in that file.')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Section title="Backup">
      <div className="card pad">
        <div className="row">
          <button className="btn primary" onClick={doExport}>Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
          <span className="spacer" />
          <span className="small muted">Last: {ago(lastExportAt)}</span>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {persisted === false && (
          <p className="small muted" style={{ marginTop: 12 }}>Add to Home Screen so the browser keeps your data.</p>
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
        <button className="btn danger block" onClick={() => setOpen(true)}>Erase all data…</button>
      ) : (
        <div className="card pad">
          <p style={{ fontWeight: 650, marginBottom: 6 }}>Erase everything?</p>
          <p className="small muted" style={{ marginBottom: 14 }}>
            Every goal, check-in, project, task and value{synced ? ', on this phone and in sync' : ''}. This can’t be undone.{' '}
            <button className="link-btn" style={{ minHeight: 0 }} onClick={doExport}>Export first</button>
          </p>
          <TypeToConfirm phrase="erase" action="Erase all data" onConfirm={erase} />
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => setOpen(false)}>Cancel</button>
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

export function ValuesEditor(props: { onboarding?: boolean; onSaved?: () => void }) {
  const snap = useSnapshot()
  const [drafts, setDrafts] = useState<ValueDraft[] | null>(null)
  const [tried, setTried] = useState(false)
  if (snap && !drafts) {
    const existing: ValueDraft[] = snap.values.map((v) => ({ id: v.id, name: v.name, description: v.description }))
    setDrafts(existing.length ? existing : [{ name: '', description: '' }, { name: '', description: '' }, { name: '', description: '' }])
  }
  if (!snap || !drafts) return null

  const filled = drafts.filter((d) => d.name.trim())
  const min = props.onboarding ? 3 : 1
  const max = props.onboarding ? 5 : 12
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
              <input value={d.name} aria-label={`Value ${i + 1}`}
                placeholder={['Health', 'Family', 'Craft', 'Kindness', 'Freedom'][i % 5]}
                onChange={(e) => update(i, { name: e.target.value })} />
              <input value={d.description} aria-label={`What value ${i + 1} means`} placeholder="What it means (optional)"
                style={{ minHeight: 38, fontSize: 14 }} onChange={(e) => update(i, { description: e.target.value })} />
            </div>
            {drafts.length > 1 && !inUse(d.id) && (
              <button className="icon-btn" aria-label={`Remove value ${i + 1}`} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                <IconClose width={18} height={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {drafts.length < max && (
        <button className="link-btn" style={{ marginTop: 6 }} onClick={() => setDrafts([...drafts, { name: '', description: '' }])}>
          + Add value
        </button>
      )}
      {tried && !ok && <p className="field-error" style={{ marginTop: 12 }}>Write {min} to {max}.</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={save}>{props.onboarding ? 'Continue' : 'Save'}</button>
      </div>
    </div>
  )
}

export function ValuesScreen() {
  return (
    <Screen back="/settings" title="Values">
      <ValuesEditor onSaved={() => { toast('Saved.'); navigate('/settings', { replace: true }) }} />
    </Screen>
  )
}
