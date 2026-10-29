// S1 spike (throwaway, deleted when S1 ends). Tests passkey PRF, data-password autofill,
// web push and Turnstile inside the installed Home Screen app. Plain JS, no build step.
'use strict'

const VAPID_PUBLIC = 'BKPYA9Ft4W6XKivzfovN7qDBYh3Dzq2eSwWPNY1Thk1OcVv4bQsYMyuN40o1QrTuVxpKRO1mU2c0OUML9p2OO8A'
const TURNSTILE_SITE_KEY = '0x4AAAAAAFrfPqJiWrbNkis1'
const SAMPLE = 'Exercise regularly · 1 of 3 this week'
const STORE = 's1.state'

const $ = (id) => document.getElementById(id)
const enc = new TextEncoder()
const dec = new TextDecoder()
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
const mode = standalone ? 'app' : 'browser'

// ---------- state and log ----------

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {} } catch { return {} }
}
let state = load()
state.log = state.log || []
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)) } catch {}
}

function log(test, ok, detail) {
  state.log.push({ at: new Date().toISOString(), mode, test, ok, detail })
  state.log = state.log.slice(-60)
  save()
  render()
}

function setStatus(id, ok, text) {
  const el = $(id)
  el.textContent = text
  el.className = 'v ' + (ok === true ? 'pass' : ok === false ? 'fail' : 'wait')
}

function errText(e) {
  return (e && (e.name ? e.name + ': ' : '') + (e.message || String(e))) || 'unknown error'
}

// ---------- bytes ----------

const rand = (n) => crypto.getRandomValues(new Uint8Array(n))
function b64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
async function fingerprint(buf) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return Array.from(h.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('')
}
async function encrypt(key, text) {
  const iv = rand(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  return { iv: b64(iv), ct: b64(ct) }
}
async function decrypt(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))
  return dec.decode(pt)
}

// ---------- environment ----------

async function renderEnv() {
  const rows = []
  const add = (k, v, ok) => rows.push(`<div class="row"><span class="k">${k}</span><span class="v ${ok === true ? 'pass' : ok === false ? 'fail' : ''}">${v}</span></div>`)
  add('Opened as', standalone ? 'Home Screen app' : 'Browser tab', standalone)
  const ver = (navigator.userAgent.match(/Version\/([\d.]+)/) || [])[1]
  add('Safari version', ver || 'unknown')
  const hasPk = !!window.PublicKeyCredential
  let platform = false
  try { platform = hasPk && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) } catch {}
  add('Face ID passkeys', platform ? 'Available' : 'Not available', platform)
  let prf = 'unknown'
  try {
    if (hasPk && PublicKeyCredential.getClientCapabilities) {
      const caps = await PublicKeyCredential.getClientCapabilities()
      prf = caps['extension:prf'] === true ? 'Yes' : caps['extension:prf'] === false ? 'No' : 'Not reported'
    }
  } catch {}
  add('Browser says PRF works', prf, prf === 'Yes' ? true : prf === 'No' ? false : undefined)
  const push = 'PushManager' in window && 'Notification' in window
  add('Push available', push ? 'Yes' : standalone ? 'No' : 'Only in the Home Screen app', push)
  $('env').innerHTML = rows.join('')
  state.env = { standalone, ua: navigator.userAgent, platform, prf, push }
  save()
  render()
}

// ---------- 1. passkey with PRF ----------

let prfSalt
async function getSalt() {
  if (!prfSalt) prfSalt = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('smart-meta-s1-prf')))
  return prfSalt
}

async function keyFromSecret(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('smart-meta data key wrap') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function useSecret(secret, how) {
  const pk = state.pk
  const fp = await fingerprint(secret)
  const key = await keyFromSecret(secret)
  if (!pk.lock) {
    pk.lock = await encrypt(key, SAMPLE)
    pk.fp = fp
    pk.unlocks = 0
    save()
    setStatus('pk-status', true, 'Secret received, sample locked')
    log('passkey', true, `${how}: PRF secret received (${fp}), sample locked`)
    return
  }
  try {
    const text = await decrypt(key, pk.lock)
    if (text !== SAMPLE) throw new Error('wrong text')
    pk.unlocks = (pk.unlocks || 0) + 1
    save()
    setStatus('pk-status', true, `Unlocked (${pk.unlocks}x, same secret)`)
    log('passkey', true, `${how}: same secret (${fp}), sample unlocked, unlock #${pk.unlocks}`)
  } catch (e) {
    setStatus('pk-status', false, 'Secret changed, could not unlock')
    log('passkey', false, `${how}: secret ${fp} differs from ${pk.fp}, decrypt failed (${errText(e)})`)
  }
}

$('pk-create').onclick = async () => {
  if (state.pk && state.pk.credId && !confirm('A test passkey already exists. Make a new one? The old sample is dropped.')) return
  setStatus('pk-status', undefined, 'Waiting for Face ID')
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { id: location.hostname, name: 'Smart Meta S1 test' },
        user: { id: rand(16), name: 's1-test-' + new Date().toISOString().slice(0, 16), displayName: 'Smart Meta S1 test' },
        challenge: rand(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        timeout: 120000,
        extensions: { prf: { eval: { first: await getSalt() } } },
      },
    })
    const ext = cred.getClientExtensionResults().prf || {}
    state.pk = { credId: b64(cred.rawId) }
    save()
    const first = ext.results && ext.results.first
    log('passkey', ext.enabled === true || !!first,
      `created; prf.enabled=${ext.enabled}; secret at creation=${first ? 'yes' : 'no'}; attachment=${cred.authenticatorAttachment || '?'}`)
    if (first) await useSecret(first, 'create')
    else setStatus('pk-status', ext.enabled === true ? undefined : false, ext.enabled === true ? 'Created. Now tap Unlock' : 'Created, but PRF not enabled')
  } catch (e) {
    setStatus('pk-status', false, 'Failed: ' + (e.name || 'error'))
    log('passkey', false, 'create failed: ' + errText(e))
  }
}

async function unlock(chooseYourself) {
  if (!state.pk || !state.pk.credId) {
    setStatus('pk-status', false, 'Create the test passkey first')
    return
  }
  setStatus('pk-status', undefined, 'Waiting for Face ID')
  const how = chooseYourself ? 'unlock (chosen)' : 'unlock'
  try {
    const a = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId: location.hostname,
        userVerification: 'required',
        timeout: 120000,
        allowCredentials: chooseYourself ? [] : [{ type: 'public-key', id: unb64(state.pk.credId) }],
        extensions: { prf: { eval: { first: await getSalt() } } },
      },
    })
    const prf = a.getClientExtensionResults().prf || {}
    const secret = prf.results && prf.results.first
    if (b64(a.rawId) !== state.pk.credId) log('passkey', undefined, `${how}: a different passkey was used`)
    if (!secret) {
      setStatus('pk-status', false, 'Face ID worked, but no secret came back')
      log('passkey', false, `${how}: signed in but no PRF secret returned`)
      return
    }
    await useSecret(secret, how)
  } catch (e) {
    setStatus('pk-status', false, 'Failed: ' + (e.name || 'error'))
    log('passkey', false, `${how} failed: ${errText(e)}`)
  }
}
$('pk-unlock').onclick = () => unlock(false)
$('pk-choose').onclick = () => unlock(true)

// ---------- 2. data password ----------

async function keyFromPassword(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

const looksGenerated = (p) => /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(p)
const autofilled = (el) => { try { return el.matches(':-webkit-autofill') || el.matches(':autofill') } catch { return false } }

function showPwForm() {
  const locked = !!(state.pw && state.pw.lock)
  $('pw-save').hidden = locked
  $('pw-unlock').hidden = !locked
}

$('pw-save').onsubmit = async (e) => {
  e.preventDefault()
  const password = $('pw-new').value
  setStatus('pw-status', undefined, 'Locking')
  try {
    const salt = rand(16)
    const key = await keyFromPassword(password, salt)
    state.pw = { salt: b64(salt), lock: await encrypt(key, SAMPLE), unlocks: 0 }
    save()
    setStatus('pw-status', true, 'Sample locked with the password')
    log('password', true, `locked; length ${password.length}; looks like an iOS strong password: ${looksGenerated(password) ? 'yes' : 'no'}; autofilled: ${autofilled($('pw-new'))}`)
    $('pw-email2').value = ''
    // Give iOS a moment to notice the submit before the form goes away, so it offers to save.
    setTimeout(showPwForm, 400)
  } catch (err) {
    setStatus('pw-status', false, 'Failed')
    log('password', false, 'lock failed: ' + errText(err))
  }
}

$('pw-unlock').onsubmit = async (e) => {
  e.preventDefault()
  const field = $('pw-cur')
  const filled = autofilled(field)
  setStatus('pw-status', undefined, 'Unlocking')
  try {
    const key = await keyFromPassword(field.value, unb64(state.pw.salt))
    const text = await decrypt(key, state.pw.lock)
    if (text !== SAMPLE) throw new Error('wrong text')
    state.pw.unlocks = (state.pw.unlocks || 0) + 1
    save()
    setStatus('pw-status', true, `Unlocked (${state.pw.unlocks}x)`)
    log('password', true, `unlocked #${state.pw.unlocks}; autofilled: ${filled}`)
  } catch (err) {
    setStatus('pw-status', false, 'Wrong password, could not unlock')
    log('password', false, `unlock failed; autofilled: ${filled}; ${errText(err)}`)
  }
  field.value = ''
}

$('pw-reset').onclick = () => {
  delete state.pw
  save()
  $('pw-new').value = ''
  $('pw-cur').value = ''
  setStatus('pw-status', undefined, 'Not run')
  showPwForm()
}

// ---------- 3. push ----------

function vapidKey() {
  return unb64(VAPID_PUBLIC)
}

let swReg = null
async function setupPush() {
  if (!('serviceWorker' in navigator)) return
  try {
    swReg = await navigator.serviceWorker.register('/s1/sw.js', { scope: '/s1/' })
  } catch (e) {
    log('push', false, 'service worker failed: ' + errText(e))
  }
  await renderPush()
  // The planned app re-checks the subscription on every open (spec NO-27); this mirrors it.
  if ('Notification' in window && Notification.permission === 'granted' && swReg) {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) log('push', false, 'permission granted but subscription is gone')
    else if (state.sub && sub.endpoint !== state.sub.endpoint) log('push', undefined, 'subscription changed since last open')
    if (sub) { state.sub = sub.toJSON(); save() }
    await renderPush()
  }
}

async function renderPush() {
  $('push-perm').textContent = 'Notification' in window ? Notification.permission : 'Not available here'
  $('push-perm').className = 'v ' + ('Notification' in window && Notification.permission === 'granted' ? 'pass' : '')
  $('push-sub').textContent = state.sub ? new URL(state.sub.endpoint).hostname : 'None'
  try {
    const res = await caches.open('s1-log').then((c) => c.match('/s1/__log'))
    const list = res ? await res.json() : []
    const pushes = list.filter((x) => x.type === 'push')
    const last = pushes[pushes.length - 1]
    let text = String(pushes.length)
    if (last) {
      text += ', last ' + new Date(last.at).toLocaleTimeString()
      if (last.sentAt) text += ` (${Math.round((last.at - last.sentAt) / 1000)} s after sending)`
    }
    $('push-log').textContent = text
    $('push-log').className = 'v ' + (pushes.length ? 'pass' : '')
    state.pushLog = list
    save()
  } catch {}
}

$('push-allow').onclick = async () => {
  if (!('Notification' in window) || !('PushManager' in window)) {
    log('push', false, `not available (opened as ${standalone ? 'app' : 'browser tab'})`)
    return
  }
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      log('push', false, 'permission: ' + perm)
      await renderPush()
      return
    }
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() }))
    state.sub = sub.toJSON()
    save()
    log('push', true, 'subscribed at ' + new URL(sub.endpoint).hostname)
  } catch (e) {
    log('push', false, 'subscribe failed: ' + errText(e))
  }
  await renderPush()
}

$('push-local').onclick = async () => {
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification('Local test', { body: 'Shown by the phone, no server involved.', icon: '/icons/icon-192.png' })
    log('push', true, 'local notification shown')
  } catch (e) {
    log('push', false, 'local notification failed: ' + errText(e))
  }
}

if (new URLSearchParams(location.search).get('from') === 'push') {
  log('push', true, 'opened by tapping a push')
  history.replaceState(null, '', '/s1/index.html')
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderPush() })

// ---------- 4. Turnstile ----------

let tsWidget = null
let tsTokens = 0
window.s1TurnstileReady = () => {
  try {
    tsWidget = window.turnstile.render('#ts', {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      callback: (token) => {
        tsTokens++
        setStatus('ts-status', true, `Passed (${tsTokens} token${tsTokens > 1 ? 's' : ''})`)
        log('turnstile', true, `token #${tsTokens} received (${token.length} chars)`)
      },
      'error-callback': (code) => {
        setStatus('ts-status', false, 'Error ' + code)
        log('turnstile', false, 'error ' + code)
        return true
      },
      'expired-callback': () => setStatus('ts-status', undefined, 'Token expired, tap below'),
      'unsupported-callback': () => {
        setStatus('ts-status', false, 'Browser not supported')
        log('turnstile', false, 'unsupported')
      },
    })
    setStatus('ts-status', undefined, 'Checking (tap the box if it asks)')
  } catch (e) {
    setStatus('ts-status', false, 'Render failed')
    log('turnstile', false, 'render failed: ' + errText(e))
  }
}
setTimeout(() => {
  if (!window.turnstile) {
    setStatus('ts-status', false, 'Script did not load')
    log('turnstile', false, 'script did not load within 15 s')
  }
}, 15000)

$('ts-again').onclick = () => {
  if (!window.turnstile || tsWidget === null) return
  setStatus('ts-status', undefined, 'Checking (tap the box if it asks)')
  window.turnstile.reset(tsWidget)
}

// ---------- results ----------

function resultsText() {
  const lines = ['Smart Meta S1 results', 'Page: ' + location.href, 'Now: ' + new Date().toISOString(), '']
  lines.push('Phone: ' + JSON.stringify(state.env || {}))
  lines.push('')
  for (const r of state.log) {
    const mark = r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'NOTE'
    lines.push(`${r.at.slice(5, 19).replace('T', ' ')} [${r.mode}] ${mark} ${r.test}: ${r.detail}`)
  }
  if (state.pushLog && state.pushLog.length) lines.push('', 'Push log: ' + JSON.stringify(state.pushLog))
  if (state.sub) lines.push('', 'Subscription:', JSON.stringify(state.sub))
  return lines.join('\n')
}

function render() {
  $('out').textContent = resultsText()
}

$('copy').onclick = async () => {
  const text = resultsText()
  try {
    await navigator.clipboard.writeText(text)
    $('copy').textContent = 'Copied'
  } catch {
    const range = document.createRange()
    range.selectNodeContents($('out'))
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    $('copy').textContent = 'Select and copy the text below'
  }
  setTimeout(() => { $('copy').textContent = 'Copy results' }, 2000)
}

$('clear').onclick = async () => {
  if (!confirm('Clear all results and test data on this page?')) return
  state = { log: [] }
  save()
  try { await caches.delete('s1-log') } catch {}
  location.reload()
}

// ---------- start ----------

if (state.pk && state.pk.lock) setStatus('pk-status', undefined, 'Passkey exists. Tap Unlock')
if (state.pw && state.pw.lock) setStatus('pw-status', undefined, 'Password saved. Unlock it')
showPwForm()
render()
renderEnv()
setupPush()
