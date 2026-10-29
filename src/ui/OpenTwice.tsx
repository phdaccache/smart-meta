import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { log } from '../sync/log'

/**
 * Smart Meta open twice on one device, as the installed app and a browser tab (how Android installs it),
 * shares one database. A copy left in the background gets frozen by the phone, sometimes in the middle of
 * a write, and then blocks the other one until it's closed (S3: a 30-second blank screen, a missing
 * profile, a banner back after being hidden). So while another copy is open, this covers the app and
 * can't be dismissed; it goes away by itself once the other copy is closed.
 *
 * Each copy holds a lock of its own for as long as it's open, and the browser lists the locks every copy
 * holds, frozen ones included. On an iPhone, Safari and the Home Screen app keep separate data, so they
 * don't see each other, and there's nothing to warn about.
 */

const PREFIX = 'smart-meta-open:'
const mine = PREFIX + Math.random().toString(36).slice(2)

/** Held until this copy closes. */
export function holdOpenLock() {
  navigator.locks?.request(mine, () => new Promise<void>(() => {})).catch(() => {})
}

async function othersOpen(): Promise<boolean> {
  if (!navigator.locks?.query) return false
  try {
    const { held = [] } = await navigator.locks.query()
    return held.some((l) => l.name?.startsWith(PREFIX) && l.name !== mine)
  } catch {
    return false
  }
}

const standalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

export function OpenTwice() {
  const [twice, setTwice] = useState(false)
  useEffect(() => {
    let live = true
    const check = () => othersOpen().then((yes) => {
      if (!live) return
      setTwice((was) => {
        if (yes !== was) log(yes ? 'open twice on this device' : 'the other copy closed')
        return yes
      })
    })
    check()
    const id = setInterval(check, 3000)
    document.addEventListener('visibilitychange', check)
    return () => {
      live = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  if (!twice) return null
  const app = standalone()
  return (
    <div className="open-twice" role="alertdialog" aria-modal="true" aria-labelledby="open-twice-title">
      <div className="big-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="12" height="13" rx="2.5" /><path d="M8 7V6.5A2.5 2.5 0 0 1 10.5 4h8A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H15" /></svg>
      </div>
      <h1 id="open-twice-title" className="intro-title">{t('twice.title')}</h1>
      <p className="intro-sub">{t(app ? 'twice.app' : 'twice.tab')}</p>
      <p className="account-hint">{t('twice.goes')}</p>
    </div>
  )
}
