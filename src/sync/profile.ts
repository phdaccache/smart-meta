import { useLiveQuery } from 'dexie-react-hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMeta, setMeta } from '../db/settings'
import { asAvatar, cleanName, type Avatar } from '../lib/avatar'

/**
 * Name and avatar (spec AC-11). Kept on the phone and sent to `profiles` once the account is a member:
 * while waiting for access nothing goes to the server (spec AC-4). Visible to the owner, like the email.
 */
export interface Profile {
  name: string
  avatar: Avatar | null
}

const KEY = 'profile'
/** Changed here and not on the server yet. */
const DIRTY = 'profileDirty'

export const useProfile = (): Profile | undefined =>
  useLiveQuery(async () => (await getMeta<Profile | null>(KEY, null)) ?? { name: '', avatar: null }, [])

/** Where to send it once it's saved here; set by sync for a member. */
let sender: (() => Promise<void>) | null = null

export async function saveProfile(p: Profile): Promise<void> {
  await setMeta(KEY, { name: cleanName(p.name), avatar: p.avatar } satisfies Profile)
  await setMeta(DIRTY, true)
  await sender?.().catch(() => {})
}

/**
 * For a member: sends a profile changed here, or, when this phone has none (a new phone), takes the one on the
 * server. Called when sync starts; failures wait for the next start or the next save.
 */
export function startProfileSync(client: SupabaseClient, userId: string) {
  sender = async () => {
    if (!(await getMeta(DIRTY, false))) return
    const p = await getMeta<Profile | null>(KEY, null)
    if (!p) return
    const { error } = await client.from('profiles').upsert({ user_id: userId, name: p.name, avatar: p.avatar, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    await setMeta(DIRTY, false)
  }
  return (async () => {
    if (await getMeta(DIRTY, false)) return sender!()
    if (await getMeta<Profile | null>(KEY, null)) return
    const { data } = await client.from('profiles').select('name, avatar').eq('user_id', userId).maybeSingle()
    if (data) await setMeta(KEY, { name: cleanName(String(data.name ?? '')), avatar: asAvatar(data.avatar) } satisfies Profile)
  })().catch(() => {})
}

export function stopProfileSync() {
  sender = null
}
