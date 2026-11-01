import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { setPrefs } from '../db/repo'
import { t } from '../i18n'
import { DEFAULT_PREFS, type Prefs } from '../lib/planner'
import { useSyncStatus } from '../sync/controller'
import {
  pushAvailable, pushOnHere, pushStatusKey, refreshPushStatus, sendTestPush, turnOnPush, type PushStatus,
} from '../sync/push'
import { supabase } from '../sync/supabase'
import { Reveal, Screen, Section, Switch, toast } from '../ui/components'
import { useIsDeveloper } from '../ui/developer'
import { usePrefs } from '../ui/hooks'
import { IconBell, IconBellOff, IconChevronRight } from '../ui/icons'
import { TimeWheel } from '../ui/pickers'
import { openSignIn } from './Account'

/**
 * Settings → Notifications (spec NO-19; layout A from S0, with the S5 answers): a switch per type, and the
 * times under the ones that have them, opened like Quick Add's date and time. Above them, what stands in the
 * way, if anything: no account, the app not installed, permission not asked yet, or turned off.
 */

/** The account's place in the rollout (the app's beta flag), as the server last said. */
export function usePushStatus(userId: string | null): PushStatus | null | undefined {
  return useLiveQuery(async () => (userId ? db.meta.get(pushStatusKey(userId)).then((r) => (r?.value as PushStatus) ?? null) : null), [userId])
}

/**
 * Whether Settings shows the Notifications row: signed out (to offer sign-in, spec NO-18), or a member the
 * server sends to. During the shadow week everyone else doesn't see a feature that would send them nothing.
 */
export function useNotificationsShown(): boolean {
  const s = useSyncStatus()
  const status = usePushStatus(s.userId)
  const member = s.access === 'member' ? s.userId : null
  // Asked each time Settings opens: the owner may have just moved the rollout on.
  useEffect(() => {
    if (member) void refreshPushStatus(member)
  }, [member])
  if (!supabase) return false
  if (s.phase === 'signed-out') return true
  return s.access === 'member' && !!status?.live
}

const isAndroid = () => /Android/i.test(navigator.userAgent)

type Standing = 'loading' | 'signed-out' | 'no-app' | 'ask' | 'denied' | 'on'

export function NotificationsScreen() {
  const s = useSyncStatus()
  const prefs = usePrefs() ?? DEFAULT_PREFS
  const developer = useIsDeveloper()
  const [onHere, setOnHere] = useState<boolean | null>(null)
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'default' : Notification.permission))
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<'summary' | 'review' | 'quiet' | null>(null)
  const userId = s.access === 'member' ? s.userId : null

  useEffect(() => {
    if (!userId) return
    let live = true
    pushOnHere(userId).then((v) => live && setOnHere(v))
    void refreshPushStatus(userId)
    // Turned on or off in the phone's settings while the app was away.
    const back = () => document.visibilityState === 'visible' && typeof Notification !== 'undefined' && setPermission(Notification.permission)
    document.addEventListener('visibilitychange', back)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', back)
    }
  }, [userId])

  const standing: Standing = s.phase === 'signed-out' || !userId ? 'signed-out'
    : !pushAvailable() ? 'no-app'
    : onHere == null ? 'loading'
    : permission === 'denied' ? 'denied'
    : onHere && permission === 'granted' ? 'on' : 'ask'
  const on = standing === 'on'

  const turnOn = async () => {
    if (!userId || busy) return
    setBusy(true)
    try {
      const r = await turnOnPush(userId)
      setPermission(Notification.permission)
      setOnHere(r === 'on')
    } catch (e) {
      toast((e as Error).message || t('acct.errOther'))
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    if (!userId || busy) return
    setBusy(true)
    try {
      await sendTestPush(userId)
      toast(t('notif.testSent'))
    } catch (e) {
      toast((e as Error).message || t('acct.errOther'))
    } finally {
      setBusy(false)
    }
  }
  const change = (p: Partial<Prefs>) => void setPrefs(p)

  return (
    <Screen back="/settings" backLabel={t('set.title')} title={t('notif.title')}>
      {standing === 'signed-out' && <Banner icon={<IconUser />} text={t('notif.signIn')} onClick={() => openSignIn()} />}
      {standing === 'ask' && <Banner icon={<IconBell />} text={t('notif.ask')} onClick={turnOn} />}
      {standing === 'no-app' && <div className="card pad notif-note">{t('notif.needsApp')}</div>}
      {standing === 'denied' && <Denied />}

      <Section title={t('notif.what')}>
        <div className={`card list settings dt-rows ${on ? '' : 'dim'}`}>
          <OptionRow label={t('notif.summary')} on={on && prefs.summary} disabled={!on} open={open === 'summary'}
            value={prefs.weekdaysOnly ? t('notif.summaryWeekdays', { time: prefs.summaryTime }) : prefs.summaryTime}
            onSwitch={(v) => { change({ summary: v }); setOpen(v ? 'summary' : null) }}
            onOpen={() => setOpen(open === 'summary' ? null : 'summary')}>
            <TimeWheel value={prefs.summaryTime} onChange={(summaryTime) => change({ summaryTime })} />
            <div className="sub-switch">
              <span>{t('notif.weekdays')}</span>
              <Switch checked={prefs.weekdaysOnly} label={t('notif.weekdays')} onChange={(weekdaysOnly) => change({ weekdaysOnly })} />
            </div>
          </OptionRow>
          <div className="list-row">
            <div className="text"><span className="title">{t('notif.reminders')}</span></div>
            <Switch checked={on && prefs.reminders} disabled={!on} label={t('notif.reminders')} onChange={(reminders) => change({ reminders })} />
          </div>
          <OptionRow label={t('notif.review')} on={on && prefs.review} disabled={!on} open={open === 'review'}
            value={t('notif.reviewWhen', { time: prefs.reviewTime })}
            onSwitch={(v) => { change({ review: v }); setOpen(v ? 'review' : null) }}
            onOpen={() => setOpen(open === 'review' ? null : 'review')}>
            <TimeWheel value={prefs.reviewTime} onChange={(reviewTime) => change({ reviewTime })} />
          </OptionRow>
          <div className="list-row">
            <div className="text"><span className="title">{t('notif.goalReviews')}</span></div>
            <Switch checked={on && prefs.goalReviews} disabled={!on} label={t('notif.goalReviews')} onChange={(goalReviews) => change({ goalReviews })} />
          </div>
        </div>
      </Section>

      <Section title={t('notif.how')}>
        <div className={`card list settings dt-rows ${on ? '' : 'dim'}`}>
          <div className="list-row">
            <div className="text"><span className="title">{t('notif.badge')}</span></div>
            <Switch checked={on && prefs.badge} disabled={!on} label={t('notif.badge')} onChange={(badge) => change({ badge })} />
          </div>
          <div className="list-row">
            <div className="text"><span className="title">{t('notif.details')}</span></div>
            <Switch checked={on && prefs.details} disabled={!on} label={t('notif.details')} onChange={(details) => change({ details })} />
          </div>
          <OptionRow label={t('notif.quiet')} on={on && prefs.quiet} disabled={!on} open={open === 'quiet'}
            value={t('notif.quietWhen', { from: prefs.quietFrom, to: prefs.quietTo })}
            onSwitch={(v) => { change({ quiet: v }); setOpen(v ? 'quiet' : null) }}
            onOpen={() => setOpen(open === 'quiet' ? null : 'quiet')}>
            <div className="quiet-wheels">
              <div>
                <div className="quiet-label">{t('notif.from')}</div>
                <TimeWheel value={prefs.quietFrom} onChange={(quietFrom) => change({ quietFrom })} />
              </div>
              <div>
                <div className="quiet-label">{t('notif.to')}</div>
                <TimeWheel value={prefs.quietTo} onChange={(quietTo) => change({ quietTo })} />
              </div>
            </div>
          </OptionRow>
        </div>
      </Section>

      {developer && on && (
        <Section title={t('notif.dev')}>
          <div className="card list settings">
            <button className="list-row accent" onClick={test} disabled={busy}>
              <div className="text"><div className="title">{t('notif.test')}</div></div>
            </button>
          </div>
        </Section>
      )}
    </Screen>
  )
}

/** A switch with options (the morning summary's time, the review's): its value in blue under the label, which opens them. */
function OptionRow(props: {
  label: string; value: string; on: boolean; disabled: boolean; open: boolean
  onSwitch: (on: boolean) => void; onOpen: () => void; children: ReactNode
}) {
  return (
    <>
      <div className="list-row">
        <button type="button" className="dt-text" disabled={!props.on} aria-expanded={props.on ? props.open : undefined} onClick={props.onOpen}>
          <span className="title">{props.label}</span>
          {props.on && <span className="dt-value">{props.value}</span>}
        </button>
        <Switch checked={props.on} disabled={props.disabled} label={props.label} onChange={props.onSwitch} />
      </div>
      <Reveal open={props.on && props.open}>
        {props.on && <div className="dt-picker">{props.children}</div>}
      </Reveal>
    </>
  )
}

function Banner({ icon, text, onClick }: { icon: ReactNode; text: string; onClick: () => void }) {
  return (
    <div className="card list sync-banner-card">
      <div className="sync-banner">
        <button type="button" className="sync-banner-btn" onClick={onClick}>
          <span className="sync-banner-icon">{icon}</span>
          <span className="sync-banner-text">{text}</span>
          <IconChevronRight className="chev" width={18} />
        </button>
      </div>
    </div>
  )
}

/** Turned off in the phone's settings (or "Don't Allow" was tapped): the steps to turn them back on (spec NO-24). */
function Denied() {
  const android = isAndroid()
  const step = (key: 'notif.stepOpen' | 'notif.stepTap' | 'notif.stepTurnOn', b: string) => {
    const [before, after] = t(key, { b: '\u0001' }).split('\u0001')
    return <li key={key + b}>{before}<b>{b}</b>{after}</li>
  }
  const steps = android
    ? [step('notif.stepOpen', t('notif.androidSettings')), step('notif.stepTap', t('notif.androidApps')), step('notif.stepTap', 'Smart Meta'),
      step('notif.stepTap', t('notif.androidNotifications'))]
    : [step('notif.stepOpen', t('notif.iosSettings')), step('notif.stepTap', t('notif.iosNotifications')), step('notif.stepTap', 'Smart Meta'),
      step('notif.stepTurnOn', t('notif.iosAllow'))]
  return (
    <div className="card pad notif-denied">
      <span className="notif-denied-icon"><IconBellOff width={22} height={22} /></span>
      <h3>{t('notif.deniedTitle')}</h3>
      <p>{android ? t('notif.deniedAndroid') : t('notif.deniedIos')}</p>
      <ol>{steps}</ol>
    </div>
  )
}

const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" /></svg>
)
