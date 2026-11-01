import { useEffect } from 'react'
import { openCount } from '../lib/planner'
import { usePrefs, useSettings, useSnapshot, useToday } from './hooks'

/**
 * The number on the app's icon (spec NO-20), kept right while the app is open. With the app closed, each push
 * brings the number for its day (public/push-sw.js); the iPhone has no silent push to change it otherwise.
 */
export function AppBadge() {
  const prefs = usePrefs()
  const supported = 'setAppBadge' in navigator
  useEffect(() => {
    if (supported && prefs && !prefs.badge) navigator.clearAppBadge().catch(() => {})
  }, [supported, prefs?.badge]) // eslint-disable-line react-hooks/exhaustive-deps
  return supported && prefs?.badge ? <BadgeCount /> : null
}

function BadgeCount() {
  const { rolloverHour } = useSettings()
  const today = useToday(rolloverHour)
  const snap = useSnapshot()
  const count = snap ? openCount(snap, today, rolloverHour) : null
  useEffect(() => {
    // Refused without the permission to notify: the icon just stays as it is.
    if (count != null) navigator.setAppBadge(count).catch(() => {})
  }, [count])
  return null
}
