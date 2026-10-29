import type { AuthError } from '@supabase/supabase-js'
import { t } from '../i18n'
import { phoneOwner, sessionReady, type Access } from './controller'
import { supabase } from './supabase'

/**
 * Sign-in and sign-up are one flow (spec AC-1): an email, a 6-digit code sent to it, typed in the app.
 * No link, so nothing opens Safari, which on an iPhone doesn't share storage with the Home Screen app.
 */

export const CODE_LENGTH = 6
/** Supabase sends at most one code a minute to an address. */
export const RESEND_SECONDS = 60

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

function message(e: AuthError | Error): string {
  const text = e.message ?? ''
  const status = (e as AuthError).status
  if (/captcha/i.test(text)) return t('acct.errCaptcha')
  if (status === 429 || /rate limit|security purposes|only request this/i.test(text)) return t('acct.errTooSoon')
  if (/expired|invalid|otp/i.test(text) && status !== 500) return t('acct.errCode')
  if (/fetch|network|load failed/i.test(text) || !navigator.onLine) return t('acct.errOffline')
  return t('acct.errOther')
}

/**
 * Sends a code, making the account if the email has none. A phone holding someone else's data says
 * so here, before any email goes out (spec AC-13). `captchaToken` comes from Turnstile (spec AC-3).
 */
export async function sendCode(email: string, captchaToken: string): Promise<void> {
  if (!supabase) throw new Error(t('err.syncNotConfigured'))
  const address = email.trim().toLowerCase()
  const owner = await phoneOwner()
  if (owner && owner.email.toLowerCase() !== address) throw new Error(t('acct.otherOwner', { email: owner.email }))
  const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true, captchaToken } })
  if (error) throw new Error(message(error))
}

/** Checks the code. Resolves with where the account stands, once sync knows (null if it couldn't tell). */
export async function verifyCode(email: string, code: string): Promise<Access | null> {
  if (!supabase) throw new Error(t('err.syncNotConfigured'))
  let result
  try {
    result = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' })
  } catch (e) {
    throw new Error(message(e as Error))
  }
  if (result.error) throw new Error(message(result.error))
  const user = result.data.user
  return user ? sessionReady(user.id) : null
}

// ——— the owner's Requests ———

export interface Request {
  userId: string
  email: string
  requestedAt: string
}

export async function pendingRequests(): Promise<Request[]> {
  const { data, error } = await supabase!.rpc('pending_requests')
  if (error) throw new Error(message(error as unknown as AuthError))
  return (data as { user_id: string; email: string; requested_at: string }[]).map((r) => ({
    userId: r.user_id, email: r.email, requestedAt: r.requested_at,
  }))
}

export async function members(): Promise<{ email: string; approvedAt: string }[]> {
  const { data, error } = await supabase!.rpc('members_overview')
  if (error) throw new Error(message(error as unknown as AuthError))
  return (data as { email: string; approved_at: string }[]).map((r) => ({ email: r.email, approvedAt: r.approved_at }))
}

export async function approve(userId: string): Promise<void> {
  const { error } = await supabase!.rpc('approve_member', { member: userId })
  if (error) throw new Error(/full/i.test(error.message) ? t('acct.errFull') : message(error as unknown as AuthError))
}

/** Swiped away in Requests: that sign-up is deleted; they can sign up again. */
export async function rejectRequest(userId: string): Promise<void> {
  const { error } = await supabase!.rpc('reject_request', { member: userId })
  if (error) throw new Error(message(error as unknown as AuthError))
}
