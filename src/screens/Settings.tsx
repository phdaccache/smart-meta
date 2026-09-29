import { useEffect, useRef, useState } from 'react'
import { exportData, importData, parseBackup, shareOrDownload } from '../db/backup'
import { deleteValue, saveValues } from '../db/repo'
import { setSettings } from '../db/settings'
import { formatTime } from '../lib/dates'
import type { Value } from '../lib/types'
import { Field, Screen, Section, Segmented, Stepper, toast } from '../ui/components'
import { useSettings, useSnapshot } from '../ui/hooks'
import { IconChevronRight } from '../ui/icons'
import { navigate } from '../ui/router'
import { sendLoginEmail, signOut, syncNow, useSyncStatus, verifyLoginCode } from '../sync/controller'

export function SettingsScreen() {
  const settings = useSettings()
  const snap = useSnapshot()
  const values = snap?.values ?? []

  return (
    <Screen back="/" title="Settings">
      <Section title="Values">
        <div className="card list">
          <button className="list-row" onClick={() => navigate('/settings/values')}>
            <div className="text">
              <div className="title">Your values</div>
              <div className="sub">{values.length ? values.map((v) => v.name).join(' · ') : 'None yet'}</div>
            </div>
            <IconChevronRight className="chev" width={18} />
          </button>
        </div>
      </Section>

      <Section title="Day">
        <div className="card pad">
          <Field label="A new day starts at" htmlFor="rollover"
            hint="A check-in before this time counts for the previous day, so a late night lands on the day you actually lived.">
            <select id="rollover" value={settings.rolloverHour} onChange={(e) => setSettings({ rolloverHour: Number(e.target.value) })}>
              {Array.from({ length: 9 }, (_, h) => <option key={h} value={h}>{formatTime(h * 60)}{h === 4 ? ' (default)' : ''}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Goals">
        <div className="card pad">
          <Field label="Active goals at once" hint="Beyond this, new goals wait in the backlog. Projects and tasks aren’t capped.">
            <Stepper label="Goal cap" value={settings.goalCap} min={1} max={10} onChange={(goalCap) => setSettings({ goalCap })} />
          </Field>
          <Field label="Creating goals">
            <Segmented label="Creation mode" value={settings.creationMode} onChange={(creationMode) => setSettings({ creationMode })}
              options={[{ value: 'wizard', label: 'Guided' }, { value: 'compact', label: 'Compact form' }]} />
          </Field>
        </div>
      </Section>

      <SyncSection />
      <DataSection lastExportAt={settings.lastExportAt} />

      <p className="small muted" style={{ margin: '28px 4px 0' }}>
        Smart Meta · everything is saved on this device first and works offline.
      </p>
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
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
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
      <Section title="Backup & sync">
        <div className="card pad small muted">
          Sync isn’t set up for this build, so this phone holds the only copy. Export regularly below, or add Supabase keys to enable sync.
        </div>
      </Section>
    )
  }

  if (s.phase === 'signed-out') {
    return (
      <Section title="Backup & sync">
        <div className="card pad">
          <p className="small muted" style={{ marginBottom: 14 }}>
            Sign in to copy everything to your private database, so losing this phone doesn’t lose your history.
          </p>
          {!sent ? (
            <form onSubmit={(e) => { e.preventDefault(); run(async () => { await sendLoginEmail(email); setSent(true) }) }}>
              <Field label="Email" htmlFor="email">
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy || !email.includes('@')}>Email me a sign-in code</button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); run(() => verifyLoginCode(email, code)) }}>
              <Field label="Code from the email" htmlFor="code" hint={`Sent to ${email}. Type the code here — the link would open in Safari, not this app.`}>
                <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setSent(false)}>Back</button>
                <span className="spacer" />
                <button className="btn primary" disabled={busy || code.trim().length < 6}>Sign in</button>
              </div>
            </form>
          )}
          {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}
        </div>
      </Section>
    )
  }

  return (
    <Section title="Backup & sync">
      <div className="card pad">
        <dl className="kv">
          <dt>Signed in</dt><dd>{s.email}</dd>
          <dt>Last synced</dt><dd>{s.phase === 'syncing' ? 'syncing…' : ago(s.lastSyncedAt)}</dd>
          {s.pending > 0 && <><dt>Waiting</dt><dd>{s.pending} change{s.pending === 1 ? '' : 's'}</dd></>}
        </dl>
        {s.phase === 'error' && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Couldn’t reach the server ({s.error}). Your data is safe here and will sync when it can.
          </p>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={syncNow} disabled={s.phase === 'syncing'}>Sync now</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    </Section>
  )
}

function DataSection({ lastExportAt }: { lastExportAt: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  const doExport = async () => {
    const r = await shareOrDownload(await exportData())
    if (r !== 'cancelled') {
      await setSettings({ lastExportAt: new Date().toISOString() })
      toast('Exported.')
    }
  }

  const doImport = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      if (!confirm(`Merge the export from ${backup.exportedAt.slice(0, 10)} into this device? Newer records win; nothing newer here is overwritten.`)) return
      const n = await importData(backup)
      toast(n ? `Imported ${n} record${n === 1 ? '' : 's'}.` : 'Nothing new in that file.')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Section title="Your data">
      <div className="card pad">
        <p className="small muted" style={{ marginBottom: 14 }}>
          A JSON copy you own, in a format any tool can read. Save it to iCloud Drive from the share sheet.
          {' '}Last export: {lastExportAt ? ago(lastExportAt) : 'never'}.
        </p>
        <div className="row">
          <button className="btn primary" onClick={doExport}>Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {persisted === false && (
          <p className="small muted" style={{ marginTop: 14 }}>
            This browser may clear local data after weeks of disuse. Add the app to your Home Screen so it’s kept.
          </p>
        )}
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

  const save = async () => {
    if (!ok) return setTried(true)
    await saveValues(filled.map((d) => ({ id: d.id, name: d.name.trim(), description: d.description.trim() })))
    const removed = snap.values.filter((v: Value) => !filled.some((d) => d.id === v.id))
    for (const v of removed) if (!inUse(v.id)) await deleteValue(v)
    props.onSaved?.()
  }

  return (
    <div>
      <div className="stack">
        {drafts.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="card pad">
            <Field label={`Value ${i + 1}`} htmlFor={`val-${i}`}>
              <input id={`val-${i}`} value={d.name} placeholder={['Health', 'Family', 'Craft', 'Kindness', 'Freedom'][i % 5]}
                onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </Field>
            <Field label="What it means to you (optional)" htmlFor={`vald-${i}`}>
              <input id={`vald-${i}`} value={d.description}
                onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            </Field>
            {drafts.length > 1 && !inUse(d.id) && (
              <button className="btn ghost" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>Remove</button>
            )}
            {inUse(d.id) && <p className="small muted" style={{ marginTop: 8 }}>Used by a goal, so it can be renamed but not removed.</p>}
          </div>
        ))}
      </div>
      {drafts.length < max && (
        <button className="btn outline block" style={{ marginTop: 12 }} onClick={() => setDrafts([...drafts, { name: '', description: '' }])}>
          Add a value
        </button>
      )}
      {tried && !ok && <p className="field-error" style={{ marginTop: 12 }}>Write between {min} and {max}.</p>}
      <div className="wizard-nav">
        <button className="btn primary" onClick={save}>{props.onboarding ? 'Continue' : 'Save values'}</button>
      </div>
    </div>
  )
}

export function ValuesScreen() {
  return (
    <Screen back="/settings" title="Values">
      <p className="wizard-lead">Short statements of what matters to you. Every goal names one of these as its reason.</p>
      <ValuesEditor onSaved={() => { toast('Values saved.'); navigate('/settings', { replace: true }) }} />
    </Screen>
  )
}
