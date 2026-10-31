// Makes a VAPID key pair for push notifications (docs/notifications, S5 setup). Run: node scripts/vapid-keys.mjs
// The public key goes to Vercel (VITE_VAPID_PUBLIC_KEY) and Supabase; the private key goes ONLY into
// Supabase → Edge Functions → Secrets. Never into the repo, a VITE_ variable or a chat.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d

console.log(`VAPID_PUBLIC_KEY  ${publicKey}`)
console.log(`VAPID_PRIVATE_KEY ${privateKey}`)
console.log('\nSave both in your password manager as "Smart Meta VAPID (staging)". Send Claude only the public one.')
