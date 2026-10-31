import { describe, expect, it } from 'vitest'
import {
  encodeMessage, encryptPush, fromB64u, MESSAGE_BYTES_MAX, PUSH_HOSTS, pushResult, toB64u, vapidAuthorization,
} from '../../supabase/functions/_shared/webpush'

const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const

async function keyPair(publicKey: string, privateKey: string): Promise<CryptoKeyPair> {
  const pub = fromB64u(publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', x: toB64u(pub.slice(1, 33)), y: toB64u(pub.slice(33)), d: privateKey }
  return {
    publicKey: await crypto.subtle.importKey('raw', pub as BufferSource, P256, true, []),
    privateKey: await crypto.subtle.importKey('jwk', jwk, P256, true, ['deriveBits']),
  }
}

/** What a browser does with a push body (RFC 8291 §3.4 from the receiving side), written apart from the code under test. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array): Promise<Uint8Array> {
  const hmac = async (key: Uint8Array, data: Uint8Array) => {
    const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
  }
  const join = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]))
  const text = (s: string) => new TextEncoder().encode(s)
  const salt = body.slice(0, 16)
  expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic as BufferSource, P256, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const prkKey = await hmac(auth, ecdh)
  const ikm = await hmac(prkKey, join(text('WebPush: info\0'), uaPublic, asPublic, Uint8Array.of(1)))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, join(text('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16)
  const nonce = (await hmac(prk, join(text('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12)
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aes, body.slice(21 + idlen) as BufferSource))
  expect(padded.at(-1)).toBe(2)
  return padded.slice(0, -1)
}

describe('encryptPush (RFC 8291)', () => {
  it('matches the worked example in RFC 8291 Appendix A', async () => {
    const as = await keyPair(
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
      'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    )
    const body = await encryptPush(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { keys: as, salt: fromB64u('DGv6ra1nlYgDCS1FRnbzlw') },
    )
    expect(toB64u(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    )
  })

  it('round-trips through what a browser would do, with a new key and salt each time', async () => {
    const ua = await crypto.subtle.generateKey(P256, true, ['deriveBits'])
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const to = { p256dh: toB64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: toB64u(auth) }
    const message = encodeMessage({ title: 'Ligar para o médico', body: 'Hoje, 14:30', url: '/projects/abc', tag: 'r1' })
    const a = await encryptPush(message, to)
    const b = await encryptPush(message, to)
    expect(toB64u(a)).not.toBe(toB64u(b))
    expect(a.length).toBe(86 + message.length + 1 + 16)
    expect(JSON.parse(new TextDecoder().decode(await decrypt(a, ua, auth)))).toEqual({
      title: 'Ligar para o médico', body: 'Hoje, 14:30', url: '/projects/abc', tag: 'r1',
    })
  })

  it("refuses a message too long for a push service, and keys that aren't a subscription", async () => {
    const ua = await crypto.subtle.generateKey(P256, true, ['deriveBits'])
    const to = { p256dh: toB64u(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: toB64u(new Uint8Array(16)) }
    expect((await encryptPush(new Uint8Array(MESSAGE_BYTES_MAX), to)).length).toBe(4096)
    await expect(encryptPush(new Uint8Array(MESSAGE_BYTES_MAX + 1), to)).rejects.toThrow(/4096/)
    await expect(encryptPush(new Uint8Array(4), { p256dh: 'AAAA', auth: to.auth })).rejects.toThrow(/key/)
  })
})

describe('vapidAuthorization (RFC 8292)', () => {
  it('signs a JWT for the push service origin that the public key verifies', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publicKey = toB64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!
    const now = Date.UTC(2026, 9, 31, 12)
    const header = await vapidAuthorization('https://web.push.apple.com/QK2x/abc?x=1', { publicKey, privateKey }, now)
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    expect(k).toBe(publicKey)
    const [head, claims, sig] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64u(head)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(fromB64u(claims)))).toEqual({
      aud: 'https://web.push.apple.com', exp: now / 1000 + 12 * 3600, sub: 'https://smart-meta-h2ur.vercel.app',
    })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64u(sig) as BufferSource,
      new TextEncoder().encode(`${head}.${claims}`) as BufferSource)
    expect(ok).toBe(true)
  })
})

describe('push endpoints and answers', () => {
  it("only lets pushes go to the browsers' own push services", () => {
    for (const ok of ['https://web.push.apple.com/QK2x', 'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=1']) {
      expect(PUSH_HOSTS.test(ok)).toBe(true)
    }
    for (const bad of ['http://web.push.apple.com/x', 'https://web.push.apple.com.evil.example/x', 'https://evil.example/web.push.apple.com/',
      'https://user@web.push.apple.com/x', 'https://fcm.googleapis.com', 'https://localhost/x']) {
      expect(PUSH_HOSTS.test(bad)).toBe(false)
    }
  })

  it('sorts the push service answers', () => {
    expect([201, 200, 404, 410, 413, 429, 500].map(pushResult)).toEqual(['sent', 'sent', 'gone', 'gone', 'failed', 'failed', 'failed'])
  })
})
