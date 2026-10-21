import { useEffect, useRef, useState } from 'react'
import { exportData, importData, parseBackup, shareOrDownload } from '../db/backup'
import { deleteValue, restoreValue, saveValues, setValueLook } from '../db/repo'
import { setSettings } from '../db/settings'
import { langSetting, setLangSetting, t, tlist, tn, type LangSetting } from '../i18n'
import { formatTime } from '../lib/dates'
import { loadSampleData } from '../dev/sample'
import { loadWorstCaseData } from '../dev/worst'
import { eraseAllData, signIn, signOut, syncNow, useSyncStatus } from '../sync/controller'
import { DateField, Field, InfoTip, KEYBOARD_DELAYS, keyboardDelay, Screen, Section, Sheet, Stepper, Switch, toast, TypeToConfirm } from '../ui/components'
import { useSettings, useSnapshot, useToday } from '../ui/hooks'
import { IconChevronRight, IconChevronUpDown } from '../ui/icons'
import { useInstall } from '../ui/install'
import { deletedToast, putBack, SwipeToDelete } from '../ui/SwipeToDelete'
import { useIsDeveloper } from '../ui/developer'
import { RELEASES } from '../lib/releases'
import { ReleaseNotes } from './WhatsNew'
import { navigate, useLocation } from '../ui/router'
import { ValueLookSheet, ValueTile, valueLook } from '../ui/valueLook'
import type { Value } from '../lib/types'
import { resetIntro } from './Intro'

export function SettingsScreen() {
  const settings = useSettings()
  const snap = useSnapshot()
  const { query } = useLocation()
  const install = useInstall()
  const developer = useIsDeveloper()
  const [news, setNews] = useState(false)
  const values = snap?.values ?? []

  // From the intro's "Restore from a backup": only what restoring needs.
  if (query.get('view') === 'restore') {
    return (
      <Screen back="/" title={t('set.restoreTitle')}>
        <DataSection lastExportAt={settings.lastExportAt} />
        {developer && <DevSection devToday={settings.devToday} />}
      </Screen>
    )
  }

  const langs: { value: LangSetting; label: string }[] = [
    { value: 'auto', label: t('set.langAuto') }, { value: 'en', label: t('set.langEnglish') }, { value: 'pt-BR', label: t('set.langPortuguese') },
  ]
  return (
    <Screen back="/" title={t('set.title')}>
      <Section title={t('set.secGoals')}>
        <div className="card list settings">
          <LinkRow title={t('set.values')} sub={values.length ? values.map((v) => v.name).join(' · ') : t('set.noneYet')}
            onClick={() => navigate('/settings/values')} />
          <div className="list-row">
            <div className="text"><span className="title title-row">{t('set.activeGoals')}<InfoTip label={t('set.activeGoals')}>{t('set.activeGoalsInfo')}</InfoTip></span></div>
            <Stepper label={t('set.goalCap')} value={settings.goalCap} min={1} max={10} onChange={(goalCap) => setSettings({ goalCap })} />
          </div>
          <SelectRow id="creation" title={t('set.newGoals')} value={settings.creationMode}
            options={[{ value: 'wizard', label: t('form.guided') }, { value: 'compact', label: t('form.compact') }]}
            onChange={(creationMode) => setSettings({ creationMode })} />
        </div>
      </Section>

      <Section title={t('set.secApp')}>
        <div className="card list settings">
          <SelectRow id="lang" title={t('set.language')} value={langSetting()} options={langs} onChange={setLangSetting} />
          <SelectRow id="rollover" title={t('set.newDay')} info={t('set.newDayInfo')} value={String(settings.rolloverHour)}
            options={Array.from({ length: 9 }, (_, h) => ({ value: String(h), label: formatTime(h * 60) }))}
            onChange={(h) => setSettings({ rolloverHour: Number(h) })} />
          <LinkRow title={t('set.replay')} sub={t('set.replaySub')} onClick={() => { resetIntro(); navigate('/welcome') }} />
          {install && <LinkRow title={t('set.install')} sub={t('set.installSub')} onClick={install} />}
        </div>
      </Section>

      <SyncSection />
      <DataSection lastExportAt={settings.lastExportAt} />

      <Section title={t('set.secAbout')}>
        <div className="card list settings">
          <LinkRow title={t('news.title')} onClick={() => setNews(true)} />
          <div className="list-row">
            <div className="text"><span className="title">{t('set.version')}</span></div>
            <span className="row-value">{__APP_VERSION__}{__APP_COMMIT__ && <span className="muted"> · {__APP_COMMIT__}</span>}</span>
          </div>
        </div>
        <p className="settings-note">Smart Meta · {t('set.madeBy')}</p>
      </Section>

      <EraseSection />
      {developer && <DevSection devToday={settings.devToday} />}
      <ReleaseNotes open={news} releases={RELEASES} onClose={() => setNews(false)} />
    </Screen>
  )
}

/** A row that opens something: a title, an optional line under it, and a chevron. Toned rows are actions. */
function LinkRow({ title, sub, tone, onClick }: { title: string; sub?: string; tone?: 'accent' | 'danger'; onClick: () => void }) {
  return (
    <button className={`list-row ${tone ?? ''}`} onClick={onClick}>
      <div className="text">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {!tone && <IconChevronRight className="chev" width={18} />}
    </button>
  )
}

/**
 * A setting with a few choices: the current one at the right, and the phone's
 * own picker when tapped (an invisible native select covers the row).
 */
function SelectRow<V extends string>({ id, title, info, value, options, onChange }: {
  id: string; title: string; info?: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void
}) {
  return (
    <div className="list-row select-row">
      <div className="text">
        <span className="title title-row">
          <label htmlFor={id}>{title}</label>
          {info && <InfoTip label={title}>{info}</InfoTip>}
        </span>
      </div>
      <span className="row-value">{options.find((o) => o.value === value)?.label}</span>
      <IconChevronUpDown className="chev" width={16} height={16} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
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
  const [signingIn, setSigningIn] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setSigningIn(false)
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
        <div className="card list settings">
          <LinkRow title={t('set.signInRow')} sub={t('set.signInSub')} onClick={() => setSigningIn(true)} />
        </div>
        <Sheet open={signingIn} onClose={() => setSigningIn(false)} title={t('set.signIn')}>
          <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)) }}>
            <Field label={t('set.email')} htmlFor="email" info={t('set.emailInfo')}>
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('set.password')} htmlFor="password">
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}
            <div className="sheet-actions">
              <button className="btn primary" disabled={busy || !email.includes('@') || !password}>{t('set.signIn')}</button>
            </div>
          </form>
        </Sheet>
      </Section>
    )
  }

  return (
    <Section title={t('set.sync')}>
      <div className="card list settings">
        <div className="list-row">
          <div className="text"><span className="title">{t('set.account')}</span></div>
          <span className="row-value">{s.email}</span>
        </div>
        <div className="list-row">
          <div className="text"><span className="title">{t('set.synced')}</span></div>
          <span className="row-value">
            {s.phase === 'syncing' ? t('set.syncing') : s.phase === 'error' ? t('set.offlineRetry', { when: ago(s.lastSyncedAt) }) : ago(s.lastSyncedAt)}
            {s.pending > 0 && ` · ${t('set.waiting')} ${s.pending}`}
          </span>
        </div>
        <button className="list-row accent" onClick={syncNow} disabled={s.phase === 'syncing'}>
          <div className="text"><div className="title">{t('set.syncNow')}</div></div>
        </button>
        <button className="list-row accent" onClick={() => signOut()}>
          <div className="text"><div className="title">{t('set.signOut')}</div></div>
        </button>
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
      <div className="card list settings">
        <LinkRow title={t('set.exportRow')} sub={t('set.last', { when: ago(lastExportAt) })} onClick={doExport} />
        <LinkRow title={t('set.importRow')} sub={t('set.importSub')} onClick={() => fileRef.current?.click()} />
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
      {persisted === false && <p className="settings-note">{t('set.addHome')}</p>}
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
        <div className="card list settings">
          <LinkRow title={t('set.eraseAll')} tone="danger" onClick={() => setOpen(true)} />
        </div>
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
  const [debugPaint, setDebugPaint] = useState(() => document.documentElement.classList.contains('debug-paint'))
  const [kbDelay, setKbDelay] = useState(() => String(keyboardDelay()))
  const { email } = useSyncStatus()
  const load = async (fill: (today: string) => Promise<void>) => {
    // Signed in, the erase would reach the synced copy and every device using it.
    if (email) return toast('Sign out of sync first. Sample data then stays on this device only.')
    if (busy || !confirm('Replace ALL data on this device with sample data? Your current data here is erased.')) return
    setBusy(true)
    try {
      await fill(today)
      window.location.replace('/')
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Section title={<span className="title-row">Developer<InfoTip label="About Developer">Just for testing the app. Nothing here is needed day to day.</InfoTip></span>}>
      <div className="card list settings">
        <div className="list-row">
          <div className="text">
            <span className="title title-row">
              <label htmlFor="dev-today">Pretend today is</label>
              <InfoTip label="Pretend today is">For testing. The app acts as if it’s this date: Today, miss prompts, due badges and scores all follow it. Clear it to go back to the real date.</InfoTip>
            </span>
            {devToday && <button className="link-btn" style={{ minHeight: 0, padding: 0 }} onClick={() => setSettings({ devToday: null })}>Real date</button>}
          </div>
          <DateField id="dev-today" className="row-date" value={devToday ?? ''} onChange={(v) => setSettings({ devToday: v })} />
        </div>
        <div className="list-row">
          <div className="text">
            <span className="title title-row">Debug colors<InfoTip label="Debug colors">Tints layers that are normally invisible, to see what shows where (red: the sheet's own cover under it; green: the cover in the page). Only on this device.</InfoTip></span>
          </div>
          <Switch checked={debugPaint} label="Debug colors" onChange={(on) => {
            setDebugPaint(on)
            try { if (on) localStorage.setItem('debugPaint', '1'); else localStorage.removeItem('debugPaint') } catch { /* private mode */ }
            document.documentElement.classList.toggle('debug-paint', on)
          }} />
        </div>
        <SelectRow id="dev-kb-delay" title="Keyboard delay" value={kbDelay}
          info="How long into Quick add's slide up the keyboard starts. Sooner feels faster; too soon and the page may show around the sheet. Only on this device."
          options={KEYBOARD_DELAYS.map((ms) => ({ value: String(ms), label: `${ms} ms` }))}
          onChange={(v) => {
            setKbDelay(v)
            try { localStorage.setItem('keyboardDelay', v) } catch { /* private mode */ }
          }} />
        <LinkRow title={busy ? 'Loading…' : 'Load sample data…'}
          sub={email ? 'Sign out of sync first, so your real data stays safe.' : 'Replaces everything on this device with a worked example and months of history.'} onClick={() => load(loadSampleData)} />
        <LinkRow title={busy ? 'Loading…' : 'Load worst-case data…'}
          sub={email ? 'Sign out of sync first, so your real data stays safe.' : 'Long names, a one-letter value, emoji, links and counts of 1, for checking layouts.'} onClick={() => load(loadWorstCaseData)} />
      </div>
    </Section>
  )
}

// ——— values ———

interface ValueDraft {
  /** Keeps a row's place while rows above it are removed. */
  key: string
  id?: string
  name: string
  /** No longer written here; one written before is kept. */
  description: string
}

let draftKeys = 0
const blankValue = (): ValueDraft => ({ key: `new-${draftKeys++}`, name: '', description: '' })

export function ValuesEditor(props: { onSaved?: () => void }) {
  const snap = useSnapshot()
  const [drafts, setDrafts] = useState<ValueDraft[] | null>(null)
  const [tried, setTried] = useState(false)
  const [picking, setPicking] = useState<Value | null>(null)
  if (snap && !drafts) {
    const existing: ValueDraft[] = snap.values.map((v) => ({ key: v.id, id: v.id, name: v.name, description: v.description }))
    setDrafts(existing.length ? existing : [blankValue(), blankValue(), blankValue()])
  }
  if (!snap || !drafts) return null

  const filled = drafts.filter((d) => d.name.trim())
  const min = 1
  const max = 12
  const ok = filled.length >= min && filled.length <= max
  const uses = (id: string) => snap.goals.filter((g) => g.whyValueId === id).length
  const update = (i: number, p: Partial<ValueDraft>) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, ...p } : x)))

  // A color left unpicked comes from the value's place in the list: the ones after a removed value keep theirs.
  const keepColors = async (removed: Value[]) => {
    const kept = snap.values.filter((v) => !removed.includes(v))
    for (const v of kept) {
      const color = valueLook(v, snap.values).color
      if (removed.length && valueLook(v, kept).color !== color) await setValueLook(v, { color })
    }
  }

  // A saved value goes as soon as it's swiped away, as anything deleted on the iPhone does; Undo brings it back.
  // One not saved yet only leaves the list.
  const remove = async (d: ValueDraft, at: number) => {
    setDrafts((all) => all && all.filter((x) => x.key !== d.key))
    const saved = d.id ? snap.values.find((v) => v.id === d.id) : undefined
    if (saved) {
      await keepColors([saved])
      await deleteValue(saved)
    }
    deletedToast(() => {
      if (saved) restoreValue(saved.id)
      setDrafts((all) => all && putBack(all, at, d))
    })
  }
  // A goal whose value goes keeps going without one, like a goal that skipped it.
  const confirmUsed = (d: ValueDraft) => {
    const goals = d.id ? uses(d.id) : 0
    return !goals || confirm(tn('set.removeUsedValueQ', goals, { name: d.name.trim() || snap.values.find((v) => v.id === d.id)?.name || '' }))
  }

  const save = async () => {
    if (!ok) return setTried(true)
    const removed = snap.values.filter((v) => !filled.some((d) => d.id === v.id))
    // A goal whose value goes keeps going without one, like a goal that skipped it.
    for (const v of removed) {
      const goals = uses(v.id)
      if (goals && !confirm(tn('set.removeUsedValueQ', goals, { name: v.name }))) return
    }
    await keepColors(removed)
    await saveValues(filled.map((d) => ({ id: d.id, name: d.name.trim(), description: d.description.trim() })))
    for (const v of removed) await deleteValue(v)
    props.onSaved?.()
  }

  return (
    <div>
      <div className="card list">
        {drafts.map((d, i) => (
          // Removed by swiping it left, as in the iPhone's lists; the last one stays.
          <SwipeToDelete key={d.key} className="list-row has-tile" label={t('set.removeValueN', { n: i + 1 })}
            disabled={drafts.length < 2} confirm={() => confirmUsed(d)} onDelete={() => remove(d, i)}>
            <ValueTile value={snap.values.find((v) => v.id === d.id)} values={snap.values} onPick={setPicking} />
            <div className="text">
              <input value={d.name} aria-label={t('set.valueN', { n: i + 1 })}
                placeholder={tlist('set.valuePlaceholders')[i % 5]}
                onChange={(e) => update(i, { name: e.target.value })} />
            </div>
          </SwipeToDelete>
        ))}
      </div>
      {drafts.length < max && (
        <button className="link-btn" style={{ marginTop: 6 }} onClick={() => setDrafts([...drafts, blankValue()])}>
          {t('set.addValue')}
        </button>
      )}
      {tried && !ok && <p className="field-error" style={{ marginTop: 12 }}>{t('set.writeN', { min, max })}</p>}
      <ValueLookSheet value={picking} values={snap.values} onClose={() => setPicking(null)} />
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
