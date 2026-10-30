import { useEffect, useState } from 'react'
import { t, tn } from '../i18n'
import { useSyncStatus } from '../sync/controller'
import { syncState } from '../sync/state'
import { InfoTip } from './components'
import { IconCloudAlert, IconCloudCheck, IconCloudOff, IconSyncing } from './icons'

const FLASH_MS = 1800

/**
 * The quiet status at the right end of Today's date line. Nothing during the normal wait after a
 * change (N-15), so it never flickers; "Synced" only when catching up after being stuck.
 */
export function SyncNote() {
  const s = useSyncStatus()
  const state = syncState(s)
  const [, redraw] = useState(0)
  const flashLeft = s.recoveredAt ? s.recoveredAt + FLASH_MS - Date.now() : 0
  useEffect(() => {
    if (flashLeft <= 0) return
    const id = setTimeout(() => redraw((n) => n + 1), flashLeft)
    return () => clearTimeout(id)
  }, [flashLeft])

  if (state === 'error') return <span className="sync-note err"><IconCloudAlert />{t('sync.cant')}</span>
  if (state === 'offline') return <span className="sync-note"><IconCloudOff />{t('sync.notSynced')}</span>
  if (state === 'synced' && flashLeft > 0) return <span className="sync-note ok"><IconCloudCheck />{t('sync.synced')}</span>
  return null
}

/** Settings → Sync: an icon after the last sync time that says, when tapped, what's going on. */
export function SyncIcon() {
  const s = useSyncStatus()
  const state = syncState(s) ?? 'synced'
  const n = s.pending
  const [title, text] = {
    synced: [t('sync.allSynced'), null],
    pending: [t('sync.soon'), `${tn('sync.waiting', n)}.`],
    syncing: [t('sync.syncingNow'), n ? tn('sync.onTheWay', n) : null],
    offline: [tn('sync.waiting', n), t('sync.offlineText')],
    error: [tn('sync.cantN', n), t('sync.retrySoon')],
  }[state]
  const Icon = { synced: IconCloudCheck, pending: IconCloudCheck, syncing: IconSyncing, offline: IconCloudOff, error: IconCloudAlert }[state]
  const tone = { synced: '', pending: '', syncing: 'busy', offline: 'off', error: 'err' }[state]
  return (
    <InfoTip label={`${t('sync.status')}: ${title}`} className={`sync-ic ${tone}`} icon={<Icon width={22} height={22} />}>
      <b className="sync-pop-title">{title}</b>
      {text && <span className="muted">{text}</span>}
    </InfoTip>
  )
}
