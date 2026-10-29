import { useEffect, useState, type ReactNode } from 'react'
import { navigate } from './router'
import { useSyncStatus } from '../sync/controller'

/**
 * The Developer section is for the app's author only: shown when running
 * locally, on a preview deployment of a branch, or when signed in to sync with the author's account. Only a hash of
 * that email is here, since everything in the app's code is public.
 */
const DEVELOPER_EMAIL_SHA256 = 'b62a4c356a22ce19fe9b1e10ad382e3d37e1dde10d0543546e709729e90eae17'

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** True or false, or null while the email is still being checked. */
export function useDeveloper(): boolean | null {
  const { email } = useSyncStatus()
  const [checked, setChecked] = useState<{ email: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (!email) return
    let live = true
    sha256(email.trim().toLowerCase())
      .then((h) => live && setChecked({ email, ok: h === DEVELOPER_EMAIL_SHA256 }))
      .catch(() => live && setChecked({ email, ok: false }))
    return () => {
      live = false
    }
  }, [email])
  if (import.meta.env.DEV || __APP_PREVIEW__) return true
  if (!email) return false
  return checked?.email === email ? checked.ok : null
}

export const useIsDeveloper = (): boolean => useDeveloper() === true

/** A developer page: anyone else who reaches its address (typed, or an old link) is sent to Settings. */
export function DeveloperOnly({ children }: { children: ReactNode }): ReactNode {
  const developer = useDeveloper()
  useEffect(() => {
    if (developer === false) navigate('/settings', { replace: true })
  }, [developer])
  return developer ? children : null
}
