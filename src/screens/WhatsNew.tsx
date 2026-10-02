import { useEffect, useState, type ReactNode } from 'react'
import { t, tk } from '../i18n'
import { RELEASES, unseen, type Release, type ReleaseIcon } from '../lib/releases'
import { Sheet } from '../ui/components'
import { FlagBR, IconHistory, IconSteps, IconTemplate } from '../ui/icons'
import { navigate } from '../ui/router'

const STORE = 'seen-release'
const ICONS: Record<ReleaseIcon, ReactNode> = {
  'flag-br': <FlagBR />,
  template: <IconTemplate width={22} height={22} />,
  journal: <IconHistory width={22} height={22} />,
  pace: <IconSteps width={22} height={22} />,
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(STORE)
  } catch {
    return null
  }
}

function markSeen() {
  try {
    if (RELEASES[0]) localStorage.setItem(STORE, RELEASES[0].id)
  } catch {
    // Storage blocked: it shows again next time, which is harmless.
  }
}

/**
 * What changed since the last version this phone saw, the first thing after an
 * update. Someone on their first run has nothing to compare with: everything
 * so far counts as seen.
 */
export function WhatsNew({ firstRun }: { firstRun: boolean }) {
  const [news, setNews] = useState(() => unseen(readSeen()))
  useEffect(() => {
    if (firstRun) markSeen()
  }, [firstRun])
  if (firstRun || news.length === 0) return null

  const close = () => {
    markSeen()
    setNews([])
  }
  return <ReleaseNotes open releases={news} onClose={close} />
}

/** The notes of some releases, newest first; an item's button closes the sheet and goes to its feature. */
export function ReleaseNotes({ open, releases, onClose }: { open: boolean; releases: Release[]; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={t('news.title')}>
      <ul className="news">
        {releases.flatMap((r) => r.items.map((item, i) => (
          <li key={`${r.id}-${i}`}>
            {item.icon && <span className="news-icon">{ICONS[item.icon]}</span>}
            <div className="news-text">
              <div className="news-title">{tk(item.title)}</div>
              <p>{tk(item.text)}</p>
              {item.action && (
                <button className="btn outline" onClick={() => { onClose(); navigate(item.action!.to) }}>{tk(item.action.label)}</button>
              )}
            </div>
          </li>
        )))}
      </ul>
      <div className="sheet-actions"><button className="btn primary" onClick={onClose}>{t('news.ok')}</button></div>
    </Sheet>
  )
}
