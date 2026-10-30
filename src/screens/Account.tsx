import { useEffect, useRef, useState, type ReactNode } from 'react'
import { setSettings, type Settings } from '../db/settings'
import { marked, t, tk, type Key } from '../i18n'
import { addDays, dayMonth, formatTime, toDateStr } from '../lib/dates'
import { MEMBERS_MAX } from '../numbers'
import type { DateStr } from '../lib/types'
import {
  approve, CODE_LENGTH, looksLikeEmail, members, OtherOwnerError, pendingRequests, rejectRequest, removeMember, RESEND_SECONDS,
  saveAndRemove, sendCode, verifyCode, type Member, type Request,
} from '../sync/account'
import { keysReady, syncStatus, useSyncStatus, type Access } from '../sync/controller'
import { WrongKeyError } from '../sync/crypto'
import type { KeyRow } from '../sync/crypto'
import { log } from '../sync/log'
import {
  localRow, NoPrfError, passkeysWork, setUpWithPasskey, setUpWithPassword, unlockWithPasskey, unlockWithPassword,
} from '../sync/keys'
import { useCaptcha } from '../ui/captcha'
import { holdKeyboard, PageText, passKeyboard, Screen, Section, Sheet, toast } from '../ui/components'
import { IconChevronLeft, IconChevronRight } from '../ui/icons'
import { goBack, navigate, openOver, useLocation } from '../ui/router'
import { SwipeToDelete } from '../ui/SwipeToDelete'
import { inIosBrowser } from './Intro'
import { DeveloperOnly } from '../ui/developer'
import { AvatarView } from '../ui/Avatar'

/**
 * Signing in (spec AC-1 to AC-10), the screens picked in S0: full screens like the intro, the bar's title
 * on the steps that ask for something. After the code, Face ID locks the data (spec PR-2, PR-3).
 */

export function accountRoute(path: string): ReactNode | null {
  if (path === '/account') return <ActivateScreen />
  // In Safari on an iPhone, the Home Screen app and Safari keep separate data, and push only works there.
  if (path === '/account/email') return inIosBrowser() ? <SafariScreen /> : <EmailScreen />
  if (path === '/account/code') return <CodeScreen />
  if (path === '/account/lock') return <LockScreen />
  if (path === '/account/password') return <PasswordScreen />
  if (path === '/account/unlock') return <UnlockScreen />
  if (path === '/account/waiting') return <WaitingScreen />
  if (path === '/settings/requests') return <DeveloperOnly><RequestsScreen /></DeveloperOnly>
  return null
}

/** Whether this sign-in began at Activate notifications: its dots then count that step too. */
let fromActivate = false
/** Whether the Face ID step is part of a sign-in (with dots), or shown on its own, as the app opens. */
let signingIn = false

/** Opens the email step, ready to type. Called in the tap, for the keyboard (see holdKeyboard). */
export function openSignIn(activate = false) {
  fromActivate = activate
  signingIn = true
  if (!inIosBrowser()) holdKeyboard()
  navigate('/account/email')
}

// ——— frame ———

const Icon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
)
const ICONS = {
  bell: <Icon d={<><path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.6 6.3 2.3 7H3.7c.7-.7 2.3-2.5 2.3-7z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>} />,
  hourglass: <Icon d={<path d="M6.5 3h11M6.5 21h11M7.5 3c0 4.5 4.5 6 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 6-4.5 9s4.5 4.5 4.5 9" />} />,
  people: <Icon d={<><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><circle cx="17" cy="9.5" r="2.7" /><path d="M17 14.5c2.4 0 4.2 1.6 4.6 4.3" /></>} />,
  lock: <Icon d={<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>} />,
  cloudLock: <Icon d={<><path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z" /><path d="M10 13.5v-1a2 2 0 0 1 4 0v1" /><rect x="9.2" y="13.5" width="5.6" height="3.6" rx="1" /></>} />,
  share: <Icon d={<><path d="M12 15V3.5M8 7.5l4-4 4 4" /><path d="M8.5 10.5H7A2.5 2.5 0 0 0 4.5 13v6A2.5 2.5 0 0 0 7 21.5h10a2.5 2.5 0 0 0 2.5-2.5v-6a2.5 2.5 0 0 0-2.5-2.5h-1.5" /></>} />,
  x: <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" /></svg>,
  check: <Icon d={<path d="m5 12.5 4.5 4.5L19 7.5" />} />,
  faceId: <Icon d={<><path d="M3 8V6a3 3 0 0 1 3-3h2M16 3h2a3 3 0 0 1 3 3v2M21 16v2a3 3 0 0 1-3 3h-2M8 21H6a3 3 0 0 1-3-3v-2" /><path d="M8.5 9v1.5M15.5 9v1.5M12 9v4.5h-1" /><path d="M9 16.2c1.7 1.3 4.3 1.3 6 0" /></>} />,
  cloud: <Icon d={<path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z" />} />,
  cloudOff: <Icon d={<><path d="M7 18a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7z" /><path d="m10 11 4 4M14 11l-4 4" /></>} />,
}

/** The sign-in steps, as dots under each: the one shown is long. */
const STEPS = ['activate', 'email', 'code', 'lock'] as const

function Page(props: {
  /** The bar's title, on the steps that ask for something. */
  bar?: string
  back?: string
  /** Instead of going back: where the screen's Back leads when it isn't the screen before. */
  onBack?: () => void
  right?: ReactNode
  icon?: ReactNode
  /** The app's own icon instead, where the person is asked to open the app. */
  appIcon?: boolean
  title: string
  sub?: ReactNode
  /** Typing screens sit at the top, the keyboard under them; the others are centered. */
  form?: boolean
  children?: ReactNode
  step?: (typeof STEPS)[number]
  foot?: ReactNode
  nav?: ReactNode
  /** A quieter choice under the main button, in the space kept for it (see .intro-below). */
  below?: ReactNode
  className?: string
}) {
  return (
    <div className={`screen intro account ${props.form ? 'form' : 'centered'} ${props.className ?? ''}`}>
      <div className="intro-top account-bar">
        {props.back || props.onBack ? (
          <button type="button" className="back" onClick={() => (props.onBack ? props.onBack() : goBack(props.back!))}>
            <IconChevronLeft width={20} height={20} /> {t('nav.back')}
          </button>
        ) : <span />}
        <span className="account-bar-title">{props.bar}</span>
        {props.right ?? <span />}
      </div>
      <div className="intro-body">
        {props.appIcon && <img className="intro-appicon" src="/icons/icon-192.png" alt="" />}
        {props.icon && <div className="big-icon">{props.icon}</div>}
        <h1 className="intro-title">{props.title}</h1>
        {props.sub && <p className="intro-sub">{props.sub}</p>}
        {props.children}
      </div>
      <div className="wizard-nav intro-nav">
        {props.step && (
          <div className="intro-dots" aria-hidden="true">
            {STEPS.filter((s) => s !== 'activate' || fromActivate || props.step === 'activate').map((s) => (
              <i key={s} className={s === props.step ? 'on' : ''} />
            ))}
          </div>
        )}
        {props.foot}
        {props.nav}
        {props.below && <div className="intro-below">{props.below}</div>}
      </div>
    </div>
  )
}

// ——— 1 · Activate notifications, after the intro's last screen ———

function ActivateScreen() {
  const [asking, setAsking] = useState(false)
  const later = () => navigate('/')
  return (
    <>
      {/* The last screen before Today: the button sits higher, and the encryption line and the policy under the text. */}
      <Page icon={ICONS.bell} title={t('acct.activateTitle')} sub={t('acct.activateSub')} step="activate" className="activate"
        right={<button type="button" className="btn ghost" onClick={() => setAsking(true)}>{t('common.skip')}</button>}
        nav={<button className="btn primary block" onClick={() => openSignIn(true)}>{t('acct.continueEmail')}</button>}
        below={<button className="quiet-link" onClick={() => setAsking(true)}>{t('acct.notNow')}</button>}>
        <div className="activate-privacy">
          <p className="account-lock">{ICONS.lock}<span>{t('acct.encrypted')}</span></p>
          <button type="button" className="link-btn policy-link" onClick={() => navigate('/privacy')}>{t('set.privacy')}</button>
        </div>
      </Page>
      {/* 2 · "Not now": no reminders and no backup without an account (spec AC-9). */}
      {asking && (
        <div className="action-sheet page" role="alertdialog" aria-label={t('acct.noAccountQ')}>
          <div className="action-sheet-shade" onClick={() => setAsking(false)} />
          <div className="action-sheet-group">
            <div className="action-sheet-msg"><b>{t('acct.noAccountQ')}</b>{t('acct.noAccountText')}</div>
            <button type="button" className="action-sheet-btn" onClick={() => { setAsking(false); openSignIn(true) }}>{t('acct.signIn')}</button>
            <button type="button" className="action-sheet-btn" onClick={later}>{t('acct.withoutAccount')}</button>
          </div>
          <button type="button" className="action-sheet-btn cancel" autoFocus onClick={() => setAsking(false)}>{t('common.cancel')}</button>
        </div>
      )}
    </>
  )
}

// ——— 12 · In Safari on an iPhone, instead of the email step ———

function SafariScreen() {
  return (
    <Page back="/" appIcon title={t('acct.safariTitle')} sub={t('acct.safariSub')}>
      <ol className="intro-steps">
        <li><span className="n">1</span>{t('acct.safari1')} <b className="share">{ICONS.share}</b></li>
        <li><span className="n">2</span>{t('acct.safari2')}</li>
        <li><span className="n">3</span>{t('acct.safari3')}</li>
      </ol>
    </Page>
  )
}

// ——— 3 · Email ———

/** The address typed, kept for the code step and for "Use a different email". */
let typedEmail = ''

function useResendTimer(): [number, () => void] {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000)))
  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft(Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000))), 1000)
    return () => clearTimeout(id)
  }, [left])
  return [left, () => { sentAt = Date.now(); setLeft(RESEND_SECONDS) }]
}
/** When the last code went out, so the wait for a new one survives going back to the email step. */
let sentAt = 0

function EmailScreen() {
  const [email, setEmail] = useState(typedEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Someone else's data is on this phone: offer to save a copy and remove it (spec AC-13). */
  const [blocked, setBlocked] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const captcha = useCaptcha()
  useEffect(() => passKeyboard(() => field.current), [])

  const clearOut = async () => {
    // Emptying the phone redraws the app from scratch; the address typed stays for the next try.
    typedEmail = email.trim().toLowerCase()
    if (!(await saveAndRemove())) return
    setBlocked(false)
    setError(null)
    toast(t('acct.savedRemoved'))
  }

  const send = async () => {
    if (busy || !looksLikeEmail(email)) return
    setBusy(true)
    setError(null)
    try {
      const address = email.trim().toLowerCase()
      // The same address within the minute: the code already sent still works.
      if (address !== typedEmail || Date.now() - sentAt > RESEND_SECONDS * 1000) {
        await sendCode(address, captcha.take)
        sentAt = Date.now()
      }
      typedEmail = address
      holdKeyboard()
      navigate('/account/code')
    } catch (e) {
      log('sign-in: sending the code failed', e)
      setError((e as Error).message)
      setBlocked(e instanceof OtherOwnerError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page form back="/" bar={t('acct.signIn')} title={t('acct.emailTitle')} step="email"
      nav={<button className="btn primary block" disabled={busy || !looksLikeEmail(email)} onClick={send}>
        {busy ? t('acct.sending') : t('acct.sendCode')}
      </button>}>
      <form className="account-form" onSubmit={(e) => { e.preventDefault(); send() }}>
        <label className="field-label" htmlFor="account-email">{t('acct.email')}</label>
        <input ref={field} id="account-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} enterKeyHint="send" value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); setBlocked(false) }} />
        {error && <p className="field-error">{error}</p>}
        {blocked && <button type="button" className="btn danger block" onClick={clearOut}>{t('acct.saveRemove')}</button>}
        <div ref={captcha.ref} className="captcha" />
      </form>
    </Page>
  )
}

// ——— 4 · Code ———

function CodeScreen() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [left, restart] = useResendTimer()
  const field = useRef<HTMLInputElement>(null)
  const captcha = useCaptcha()
  useEffect(() => passKeyboard(() => field.current), [])
  // Reached without an email (a reload, an old link): start over.
  useEffect(() => {
    if (!typedEmail) navigate('/account/email', { replace: true })
  }, [])

  const check = async (value = code) => {
    if (busy || value.length !== CODE_LENGTH) return
    setBusy(true)
    setError(null)
    try {
      field.current?.blur()
      log('sign-in: checking the code')
      done(await verifyCode(typedEmail, value))
    } catch (e) {
      log('sign-in: the code failed', e)
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    try {
      await sendCode(typedEmail, captcha.take)
      restart()
      setCode('')
      toast(t('acct.resent'))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const digits = code.padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('')
  return (
    <Page form back="/account/email" bar={t('acct.signIn')} title={t('acct.codeTitle')}
      sub={t('acct.codeSub', { email: typedEmail })} step="code"
      nav={<button className="btn primary block" disabled={busy || code.length !== CODE_LENGTH} onClick={() => check()}>
        {busy ? t('acct.checking') : t('common.continue')}
      </button>}
      below={<button className="quiet-link" onClick={() => { holdKeyboard(); goBack('/account/email') }}>{t('acct.otherEmail')}</button>}>
      <div className="account-form">
        {/* One real field under six boxes: iOS offers the code from Mail above the keyboard. */}
        <label className="codes" onClick={() => field.current?.focus()}>
          <input ref={field} className="codes-input" aria-label={t('acct.code')} inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]*" maxLength={CODE_LENGTH} value={code} disabled={busy}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)
              setCode(next)
              setError(null)
              if (next.length === CODE_LENGTH) check(next)
            }} />
          {digits.map((d, i) => (
            <span key={i} className={i === Math.min(code.length, CODE_LENGTH - 1) && !busy ? 'focus' : ''} aria-hidden="true">{d.trim()}</span>
          ))}
        </label>
        {error && <p className="field-error">{error}</p>}
        <p className="account-hint">
          {left > 0
            ? t('acct.resendIn', { time: `0:${String(left).padStart(2, '0')}` })
            : <button type="button" className="link-btn" onClick={resend}>{t('acct.resend')}</button>}
        </p>
        <div ref={captcha.ref} className="captcha" />
      </div>
    </Page>
  )
}

/**
 * After the code: first the data key, made with Face ID or opened with it (on a new phone); then a member
 * goes on to Today (sync brings their data) and anyone else waits.
 */
function done(access: Access | null) {
  typedEmail = ''
  sentAt = 0
  const lock = syncStatus().lock
  log('sign-in: code accepted;', 'access', access, 'key', lock ?? 'ready')
  if (lock) navigate(lock === 'setup' ? '/account/lock' : '/account/unlock', { replace: true })
  else finish(access)
}

function finish(access: Access | null) {
  signingIn = false
  if (access === 'waiting' || access === 'full') openOver('/', '/account/waiting')
  else navigate('/')
}

/** With the data key on this phone: sync starts (for a member), and the sign-in goes on. */
async function keysDone() {
  log('keys: on this phone')
  await keysReady()
  finish(syncStatus().access)
}

// ——— 5, 7 and 11 · Face ID, the data password, a new phone ———

/** Face ID on an iPhone; Android's passkeys open with the screen lock. */
const iphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const byPhone = (ios: Key, other: Key, vars?: Record<string, string>) => tk(iphone() ? ios : other, vars)

/** Shown once each time the app opens while sync waits for the key (see KeysPrompt). */
let prompted = false

/**
 * Sync is waiting for Face ID: the screen for it opens once when the app opens, over Today. Back leaves it
 * for now; Settings → Account keeps a row for it.
 */
export function KeysPrompt() {
  const s = useSyncStatus()
  const { path } = useLocation()
  useEffect(() => {
    if (!s.lock || prompted || path.startsWith('/account') || path.startsWith('/welcome')) return
    prompted = true
    log('opening the', s.lock, 'screen')
    openOver('/', s.lock === 'setup' ? '/account/lock' : '/account/unlock')
  }, [s.lock, path])
  return null
}

/** Leaves the key for later: sync waits, and the app goes on. */
const later = () => {
  signingIn = false
  navigate('/')
}

function passkeyError(e: unknown): string {
  const name = (e as Error)?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return t('acct.errNotFinished')
  return t('acct.errOther')
}

// 5 · Lock your data with Face ID: makes the passkey and, with it, the keys.
function LockScreen() {
  const s = useSyncStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Asked before the tap: Safari only allows a passkey right after one, with nothing slow in between. */
  const works = useRef<boolean | null>(null)
  useEffect(() => {
    prompted = true
    passkeysWork().then((w) => { works.current = w })
  }, [])

  const go = async () => {
    if (busy || !s.userId) return
    setError(null)
    if (works.current === false) return navigate('/account/password', { replace: true })
    setBusy(true)
    try {
      await setUpWithPasskey(s.userId, s.email ?? '')
      await keysDone()
    } catch (e) {
      log('keys: Face ID set-up failed', e)
      setBusy(false)
      if (e instanceof NoPrfError) navigate('/account/password', { replace: true })
      else setError(passkeyError(e))
    }
  }

  return (
    <Page onBack={later} bar={t('acct.yourData')} icon={ICONS.faceId} title={byPhone('acct.lockTitle', 'acct.lockTitleOther')}
      sub={byPhone('acct.lockSub', 'acct.lockSubOther')} step={signingIn ? 'lock' : undefined}
      foot={error && <p className="field-error account-hint">{error}</p>}
      nav={<button className="btn primary block" disabled={busy} onClick={go}>{byPhone('acct.lockGo', 'acct.lockGoOther')}</button>}
      below={<button className="quiet-link" onClick={() => navigate('/account/password')}>{byPhone('acct.lockTrouble', 'acct.lockTroubleOther')}</button>} />
  )
}

/** Generated passwords are long (iPhone 20, Google 15): anything short was typed, and isn't the point. */
const MIN_PASSWORD = 12

/** The email above the password, so the password manager files and finds the password under it (S1). */
function UsernameField({ email }: { email: string }) {
  return (
    <>
      <label className="field-label" htmlFor="data-email">{t('acct.email')}</label>
      <input id="data-email" name="email" type="email" autoComplete="username" value={email} readOnly />
    </>
  )
}

function PasswordField({ value, onChange, isNew }: { value: string; onChange: (v: string) => void; isNew: boolean }) {
  return (
    <>
      <label className="field-label" htmlFor="data-password">{t('acct.pwLabel')}</label>
      <input id="data-password" name="password" type="password" autoComplete={isNew ? 'new-password' : 'current-password'}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={value}
        onChange={(e) => onChange(e.target.value)} />
    </>
  )
}

/**
 * 7 · The data password, when passkeys can't be used (spec PR-2). The password manager makes it and saves
 * it; then it's asked for again, by autofill, and only locks the data once it matches what was saved (S1:
 * on one try the phone filled a different value than the one used to lock).
 */
function PasswordScreen() {
  const s = useSyncStatus()
  const email = s.email ?? ''
  const [phase, setPhase] = useState<'save' | 'check'>('save')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef('')
  useEffect(() => { prompted = true }, [])

  const submit = async () => {
    if (busy || !s.userId) return
    setError(null)
    if (phase === 'save') {
      if (password.length < MIN_PASSWORD) return setError(t('acct.pwShort'))
      saved.current = password
      // A moment for the password manager to see the form sent and offer to save it, before the form changes.
      setBusy(true)
      setTimeout(() => { setBusy(false); setPassword(''); setPhase('check') }, 400)
      return
    }
    if (password !== saved.current) return setError(t('acct.pwMismatch', { email }))
    setBusy(true)
    try {
      await setUpWithPassword(s.userId, password)
      await keysDone()
    } catch (e) {
      log('keys: password set-up failed', e)
      setBusy(false)
      setError(t('acct.errOther'))
    }
  }

  const check = phase === 'check'
  return (
    <Page form onBack={later} bar={t('acct.yourData')} title={t(check ? 'acct.pwCheckTitle' : 'acct.pwTitle')}
      sub={check ? t('acct.pwCheckSub', { email }) : byPhone('acct.pwSub', 'acct.pwSubOther')} step={signingIn ? 'lock' : undefined}
      nav={<button className="btn primary block" disabled={busy || !password} onClick={submit}>
        {t(check ? 'common.continue' : 'acct.pwSave')}
      </button>}
      below={check && <button className="quiet-link" onClick={() => { setPhase('save'); setPassword(''); setError(null) }}>{t('acct.pwAgain')}</button>}>
      <form key={phase} className="account-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <UsernameField email={email} />
        <PasswordField value={password} isNew={!check} onChange={(v) => { setPassword(v); setError(null) }} />
        {error && <p className="field-error">{error}</p>}
        {!iphone() && <p className="account-hint">{t('acct.pwKeyIcon')}</p>}
      </form>
    </Page>
  )
}

/** 11 · A new phone, or after signing out: Face ID opens the data key; the data password if that's what locked it. */
function UnlockScreen() {
  const s = useSyncStatus()
  const email = s.email ?? ''
  /** Undefined while it's read; null if this phone has none (it shouldn't happen: sync saves it first). */
  const [row, setRow] = useState<KeyRow | null | undefined>(undefined)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { prompted = true }, [])
  // Read before the tap (see unlockWithPasskey).
  useEffect(() => {
    if (!s.userId) return
    localRow(s.userId).then((r) => {
      if (!r) log('unlock: no keys on this phone')
      setRow(r)
      if (r && !r.locks.some((l) => l.kind === 'passkey')) setUsePassword(true)
    }, (e) => {
      log('unlock: reading the keys failed', e)
      setRow(null)
    })
  }, [s.userId])
  const kinds = row && { passkey: row.locks.some((l) => l.kind === 'passkey'), password: row.locks.some((l) => l.kind === 'password') }

  const open = async (how: 'passkey' | 'password') => {
    if (busy || !s.userId || (how === 'password' && !password)) return
    setError(null)
    setBusy(true)
    try {
      if (how === 'passkey') await unlockWithPasskey(s.userId, row!)
      else await unlockWithPassword(s.userId, password)
      await keysDone()
    } catch (e) {
      log('unlock failed:', how, e)
      setBusy(false)
      if (how === 'password') setError(e instanceof WrongKeyError ? t('acct.pwWrong', { email }) : t('acct.errOther'))
      else setError(e instanceof WrongKeyError || e instanceof NoPrfError ? byPhone('acct.unlockFailed', 'acct.unlockFailedOther') : passkeyError(e))
    }
  }

  if (kinds && usePassword) {
    return (
      <Page form onBack={kinds.passkey ? () => { setUsePassword(false); setError(null) } : later} bar={t('acct.yourData')}
        title={t('acct.unlockTitle')} sub={t('acct.unlockPwSub', { email })}
        nav={<button className="btn primary block" disabled={busy || !password} onClick={() => open('password')}>{t('acct.unlockGoOther')}</button>}>
        <form className="account-form" onSubmit={(e) => { e.preventDefault(); open('password') }}>
          <UsernameField email={email} />
          <PasswordField value={password} isNew={false} onChange={(v) => { setPassword(v); setError(null) }} />
          {error && <p className="field-error">{error}</p>}
          {!iphone() && <p className="account-hint">{t('acct.pwKeyIcon')}</p>}
        </form>
      </Page>
    )
  }
  return (
    <Page onBack={later} icon={ICONS.faceId} title={t('acct.unlockTitle')} sub={byPhone('acct.unlockSub', 'acct.unlockSubOther')}
      foot={(error || row === null) && <p className="field-error account-hint">{error ?? t('acct.errOther')}</p>}
      nav={<button className="btn primary block" disabled={busy || !row} onClick={() => open('passkey')}>{byPhone('acct.unlockGo', 'acct.unlockGoOther')}</button>}
      below={kinds?.password && <button className="quiet-link" onClick={() => { setUsePassword(true); setError(null) }}>{t('acct.unlockUsePw')}</button>} />
  )
}

// ——— 8 and 9 · Waiting for access, the list is full ———

/** The whole date and time, for a request opened in its sheet. */
function askedFull(iso: string): string {
  const d = new Date(iso)
  return `${dayMonth(toDateStr(d))} ${d.getFullYear()}, ${formatTime(d.getHours() * 60 + d.getMinutes())}`
}

function askedText(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const time = formatTime(d.getHours() * 60 + d.getMinutes())
  const day = toDateStr(d)
  return day === toDateStr(new Date()) ? t('acct.todayAt', { time }) : dayMonth(day)
}

function WaitingScreen() {
  const s = useSyncStatus()
  // Approved while looking at it: on to Today, where "You're in" shows.
  useEffect(() => {
    if (s.access === 'member') navigate('/')
  }, [s.access])
  const full = s.access === 'full'
  const rows: [Key, string][] = [
    ['acct.email', s.email ?? ''],
    ['acct.asked', askedText(s.requestedAt)],
    ['acct.status', t(full ? 'acct.statusFull' : 'acct.statusWaiting')],
  ]
  return (
    <Page icon={full ? ICONS.people : ICONS.hourglass} title={t(full ? 'acct.fullTitle' : 'acct.waitingTitle')}
      sub={t(full ? 'acct.fullSub' : 'acct.waitingSub')}
      foot={<p className="account-hint">{t('acct.meanwhile')}</p>}
      nav={<button className="btn primary block" onClick={() => navigate('/')}><PageText text={marked('intro.goToday')} /></button>}>
      <div className="card list account-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="list-row"><div className="text"><span className="title">{tk(k)}</span></div><span className="row-value">{v}</span></div>
        ))}
      </div>
    </Page>
  )
}

// ——— the banners on Today ———

/** Swiped away, it comes back after a day, then a week, then a month, then never (spec AC-8). */
const BANNER_BACK_DAYS = [1, 7, 30]

/**
 * Until the person syncs. Days count from the app's today, so "Pretend today is" in Developer brings it
 * back as a later day would.
 */
export function SyncBanner({ settings, today }: { settings: Settings; today: DateStr }) {
  const s = useSyncStatus()
  const [gone, setGone] = useState(false)
  if (!s.configured || s.phase !== 'signed-out' || gone) return null
  if (settings.syncBannerHides > BANNER_BACK_DAYS.length) return null
  if (settings.syncBannerUntil && today < settings.syncBannerUntil.slice(0, 10)) return null
  const hide = () => {
    setGone(true)
    const days = BANNER_BACK_DAYS[settings.syncBannerHides]
    setSettings({ syncBannerHides: settings.syncBannerHides + 1, syncBannerUntil: days ? addDays(today, days) : null })
  }
  return (
    <div className="card list sync-banner-card">
      <SwipeToDelete className="sync-banner" label={t('acct.hideBanner')} onDelete={hide}
        verb={{ label: t('acct.hide'), icon: ICONS.x }}>
        <button type="button" className="sync-banner-btn" onClick={() => openSignIn()}>
          <span className="sync-banner-icon">{ICONS.cloudLock}</span>
          <span className="sync-banner-text">{t('acct.banner')}</span>
          <IconChevronRight className="chev" width={18} />
        </button>
      </SwipeToDelete>
    </div>
  )
}

/** A notice on Today that stays until it's swiped away, like the sync banner. */
function Notice({ tone, icon, text, onClose }: { tone: 'green' | 'red'; icon: ReactNode; text: string; onClose: () => void }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  const close = () => {
    setGone(true)
    onClose()
  }
  return (
    <div className="card list sync-banner-card">
      <SwipeToDelete className={`sync-banner ${tone}`} label={t('acct.hideBanner')} onDelete={close} verb={{ label: t('acct.hide'), icon: ICONS.x }}>
        <div className="sync-banner-btn">
          <span className="sync-banner-icon">{icon}</span>
          <span className="sync-banner-text">{text}</span>
        </div>
      </SwipeToDelete>
    </div>
  )
}

/** After the owner approves (spec AC-7). */
export function AcceptedBanner({ settings }: { settings: Settings }) {
  if (!settings.acceptedBanner) return null
  return <Notice tone="green" icon={ICONS.cloud} text={t('acct.accepted')} onClose={() => setSettings({ acceptedBanner: false })} />
}

/** After the owner removed this account: the data is still all here, only sync stopped. */
export function RemovedBanner({ settings }: { settings: Settings }) {
  if (!settings.removedBanner) return null
  return <Notice tone="red" icon={ICONS.cloudOff} text={t('acct.removed')} onClose={() => setSettings({ removedBanner: false })} />
}

// ——— 13 · Requests, for the owner ———

function RequestsScreen() {
  const { query } = useLocation()
  const [waiting, setWaiting] = useState<Request[] | null>(null)
  const [approved, setApproved] = useState<Member[]>([])
  const me = useSyncStatus().userId
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The person tapped, shown whole in a sheet (a long email is cut short in the list). */
  const [open, setOpen] = useState<{ email: string; at: string; request?: Request; member?: Member } | null>(null)
  const load = async () => {
    try {
      const [w, m] = await Promise.all([pendingRequests(), members()])
      setWaiting(w)
      setApproved(m)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    load()
  }, [query.toString()])

  const yes = async (r: Request) => {
    setBusy(true)
    try {
      await approve(r.userId)
      toast(t('acct.approvedToast', { email: r.email }))
      setOpen(null)
      await load()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const no = async (r: Request) => {
    setWaiting((all) => all && all.filter((x) => x.userId !== r.userId))
    setOpen(null)
    try {
      await rejectRequest(r.userId)
      toast(t('acct.deletedReq'))
    } catch (e) {
      toast((e as Error).message)
    }
    await load()
  }
  const sure = (r: Request) => confirm(t('acct.deleteReqQ', { email: r.email }))
  const out = async (m: Member) => {
    setApproved((all) => all.filter((x) => x.userId !== m.userId))
    setOpen(null)
    try {
      await removeMember(m.userId)
      toast(t('acct.removedToast', { email: m.email }))
    } catch (e) {
      toast((e as Error).message)
    }
    await load()
  }
  const sureOut = (m: Member) => confirm(t('acct.removeQ', { email: m.email }))

  const initial = (email: string) => <span className="initial" aria-hidden="true">{email.charAt(0).toUpperCase()}</span>
  return (
    <Screen back="/settings/developer" backLabel="Developer" title={t('set.requests')}>
      {error && <p className="field-error">{error}</p>}
      {waiting && (
        <>
          <Section title={`${t('acct.waitingRow')} · ${waiting.length}`}>
            <div className="card list settings">
              {waiting.length === 0 && <div className="list-row"><div className="text"><span className="sub">{t('acct.reqNone')}</span></div></div>}
              {/* Swiped left: Approve, then Delete, as Notes offers more than one action. */}
              {waiting.map((r) => (
                <SwipeToDelete key={r.userId} className="list-row request-row" label={t('acct.deleteReq')}
                  confirm={() => sure(r)} onDelete={() => no(r)}
                  extra={{ label: t('acct.approve'), icon: ICONS.check, run: () => yes(r) }}>
                  <button type="button" className="request-open" onClick={() => setOpen({ email: r.email, at: r.requestedAt, request: r })}>
                    {initial(r.email)}
                    <div className="text"><div className="title ellipsis">{r.email}</div><div className="sub">{askedText(r.requestedAt)}</div></div>
                  </button>
                </SwipeToDelete>
              ))}
            </div>
          </Section>
          <Section title={t('acct.approvedRow')} aside={t('acct.ofMembers', { n: approved.length, max: MEMBERS_MAX })}>
            <div className="card list settings">
              {approved.map((m) => {
                const row = (
                  <button type="button" className="request-open" onClick={() => setOpen({ email: m.email, at: m.approvedAt, member: m })}>
                    {m.avatar ? <AvatarView avatar={m.avatar} size={32} /> : initial(m.email)}
                    <div className="text">
                      <div className="title ellipsis">{m.name || m.email}</div>
                      <div className="sub ellipsis">{m.name ? `${m.email} · ${askedText(m.approvedAt)}` : askedText(m.approvedAt)}</div>
                    </div>
                  </button>
                )
                // Swiped left: Delete removes them from sync; their phone keeps everything. Not the owner.
                return m.userId === me ? <div key={m.userId} className="list-row request-row">{row}</div> : (
                  <SwipeToDelete key={m.userId} className="list-row request-row" label={t('acct.removeMember')}
                    confirm={() => sureOut(m)} onDelete={() => out(m)}>
                    {row}
                  </SwipeToDelete>
                )
              })}
            </div>
            <p className="settings-note">{t('acct.reqFoot')}</p>
          </Section>
        </>
      )}
      <Sheet open={open != null} onClose={() => setOpen(null)} title={t(open?.request ? 'acct.request' : 'acct.member')}>
        {open && (
          <>
            {open.member?.avatar && <div className="request-face"><AvatarView avatar={open.member.avatar} size={72} /></div>}
            <div className="card list request-detail">
              {open.member?.name && <div className="list-row"><div className="text"><div className="sub">{t('prof.name')}</div><div className="title">{open.member.name}</div></div></div>}
              <div className="list-row"><div className="text"><div className="sub">{t('acct.email')}</div><div className="title">{open.email}</div></div></div>
              <div className="list-row"><div className="text">
                <div className="sub">{t(open.request ? 'acct.asked' : 'acct.approvedOn')}</div><div className="title">{askedFull(open.at)}</div>
              </div></div>
            </div>
            {open.member && open.member.userId !== me && (
              <div className="sheet-actions column">
                <button className="btn danger block" onClick={() => sureOut(open.member!) && out(open.member!)}>{t('acct.removeMember')}</button>
              </div>
            )}
            {open.request && (
              <div className="sheet-actions column">
                <button className="btn primary block" disabled={busy} onClick={() => yes(open.request!)}>{t('acct.approve')}</button>
                <button className="btn danger block" disabled={busy} onClick={() => sure(open.request!) && no(open.request!)}>{t('acct.deleteReq')}</button>
              </div>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  )
}
