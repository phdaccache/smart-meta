import { useCallback, useEffect, useRef, useState } from 'react'
import { getLang } from '../i18n'

/**
 * Cloudflare Turnstile before every code is sent (spec AC-3). The widget stays invisible unless
 * Cloudflare wants a tap. Supabase checks each token with Cloudflare, and a token works once, so the
 * widget is reset after every send to have the next one ready for "Send a new code".
 */

/** Public by design; the secret half lives only in Supabase (Auth → Attack Protection). */
const SITE_KEY = '0x4AAAAAAFrfPqJiWrbNkis1'
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string
  reset(id: string): void
  remove(id: string): void
}
declare global {
  interface Window { turnstile?: Turnstile }
}

let loading: Promise<Turnstile> | null = null

function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => {
      loading = null
      s.remove()
      reject(new Error('turnstile'))
    }
    document.head.append(s)
  })
  return loading
}

/** Put `ref` on an empty element where Cloudflare may show its box; `take()` waits for a fresh token. */
export function useCaptcha() {
  const ref = useRef<HTMLDivElement>(null)
  const widget = useRef<{ id?: string; token?: string; waiting: ((token: string) => void)[] }>({ waiting: [] })
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const w = widget.current
    let gone = false
    load().then((ts) => {
      if (gone || !ref.current) return
      w.id = ts.render(ref.current, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        theme: 'auto',
        language: getLang() === 'pt-BR' ? 'pt-br' : 'en',
        callback: (token: string) => {
          w.token = token
          setFailed(false)
          w.waiting.splice(0).forEach((give) => give(token))
        },
        'expired-callback': () => { w.token = undefined },
        'error-callback': () => {
          setFailed(true)
          // Turnstile retries by itself.
          return false
        },
      })
    }).catch(() => !gone && setFailed(true))
    return () => {
      gone = true
      if (w.id) window.turnstile?.remove(w.id)
      w.id = undefined
    }
  }, [])

  /** Resolves with a token (waiting for Cloudflare if needed), or rejects after a while without one. */
  const take = useCallback((): Promise<string> => {
    const w = widget.current
    const handOut = (token: string) => {
      w.token = undefined
      if (w.id) window.turnstile?.reset(w.id)
      return token
    }
    if (w.token) return Promise.resolve(handOut(w.token))
    return new Promise<string>((resolve, reject) => {
      const give = (token: string) => {
        clearTimeout(timeout)
        resolve(handOut(token))
      }
      const timeout = setTimeout(() => {
        w.waiting = w.waiting.filter((g) => g !== give)
        reject(new Error('captcha'))
      }, 20_000)
      w.waiting.push(give)
    })
  }, [])

  return { ref, take, failed }
}
