import { useSyncExternalStore } from 'react'

/**
 * Android (Chrome, Edge, Samsung Internet) offers to install a web app through
 * this event; iPhone has no equivalent, it's Share → Add to Home Screen. Kept
 * from startup so Settings can show "Install the app" only where it works.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as InstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

/** A function that shows the browser's install dialog, or null where it isn't offered. */
export function useInstall(): (() => Promise<void>) | null {
  const available = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => deferred != null)
  if (!available) return null
  return async () => {
    const e = deferred
    if (!e) return
    await e.prompt()
    await e.userChoice.catch(() => null)
    deferred = null
    notify()
  }
}
