import { useEffect, useState } from 'react'
import { useSyncStatus } from '../sync/controller'

/**
 * The Developer section is for the app's author only: shown when running
 * locally, or when signed in to sync with the author's account. Only a hash of
 * that email is here, since everything in the app's code is public.
 */
const DEVELOPER_EMAIL_SHA256 = 'b62a4c356a22ce19fe9b1e10ad382e3d37e1dde10d0543546e709729e90eae17'

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function useIsDeveloper(): boolean {
  const { email } = useSyncStatus()
  const [match, setMatch] = useState(false)
  useEffect(() => {
    let live = true
    if (!email) setMatch(false)
    else sha256(email.trim().toLowerCase()).then((h) => live && setMatch(h === DEVELOPER_EMAIL_SHA256)).catch(() => live && setMatch(false))
    return () => {
      live = false
    }
  }, [email])
  return import.meta.env.DEV || match
}
