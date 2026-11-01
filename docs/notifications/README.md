# Notifications and accounts

The project that adds friend accounts, end-to-end encrypted sync and web push notifications to Smart
Meta. It runs on branch `notifications` and merges to `main` only when notifications work nicely.

## Files

| File | What it holds | When to change it |
|---|---|---|
| [spec.md](spec.md) | **What** must be true: numbered, checkable requirements, and **Adjustable numbers** (every limit, time and threshold, N-1 to N-25) | Only when the owner changes a requirement or a number |
| [plan.md](plan.md) | **How and why**: facts, designs, trade-offs, the owner's worries (§0), decisions (§2), stages (§14), open questions (§16), change log | Whenever something is decided, learned or done |
| [mockups/](mockups/) | S0 mockups and the S5 mockup `s5.html` (HTML artifacts); the picks are recorded in plan §2 and §14 | When the owner asks for another round |
| [runway-simulator.html](runway-simulator.html) | Storage and cost simulator (also a private artifact: [Smart Meta Runway](https://claude.ai/artifact/6xvMmYEUDBiKkGsgkfLWhq)) | When limits or record sizes change |

## For every session working on this

Each stage gets its own session, and sessions don't share a chat. To keep them from drifting apart:

1. **Read before working:** this README, the whole [spec](spec.md), plan **§0** (the owner's
   worries), **§2** (decisions), **§14** (stages, your stage in detail) and **§16** (open questions).
   Skim the rest; read the sections your stage points to.
2. **Respect the shared decisions below.** If your stage needs to change one, stop and ask the owner;
   don't quietly redesign something another stage depends on.
3. **Don't decide for the owner.** Anything unclear goes to the owner (and into plan §16), not into a
   guess.
4. **End by updating the docs:** tick your stage's checkboxes in plan §14, add a change-log line,
   move answered questions out of §16, and update the spec only if a requirement changed (with the
   owner's OK).
5. **Start from GitHub's latest** (see CLAUDE.md) and merge `origin/main` into the branch when it has
   new commits.
6. **One branch per stage**, cut from the latest `origin/notifications` and named
   `notifications-s<N>` (for example `notifications-s0`). It merges back into `notifications` when the
   stage is done; `notifications` merges to `main` only after S6.

## Shared decisions every stage depends on

These are the contracts between stages. Changing one affects others.

- **Privacy:** the owner can't read content (spec PR-1). The server never needs plaintext: anything
  computed from content happens on the phone. Visible to the owner: email, name, avatar, metadata.
- **The app plans, the server delivers:** the phone computes notifications for the next 14 days after
  each pull and uploads them **already encrypted** for its push subscription. The server only sends
  rows whose time has come (plan §4).
- **Encryption sits only in the sync layer:** a wrapper around the Supabase `SyncTarget`. Local data on
  the phone stays plain; the rest of the app doesn't know about encryption (plan §7.2).
- **Data key, not passkey, encrypts data:** a random data key per user encrypts records; the passkey
  (or data password) only unlocks that key. Each user also has a key pair for future sharing. Formats
  are in `src/sync/crypto.ts` and plan §14 S3; they're stored on the server, so change them only by
  adding a version.
- **Passkeys belong to one web address:** each stage's preview is its own, and a custom domain needs
  planning first (plan §9).
- **One copy of the app per device:** on Android, close the Chrome tab after installing; the app covers
  itself while another copy is open (plan §14 S3). For problems on a phone, Settings → Developer →
  Diagnostics log.
- **Tables** (all with RLS, explicit grants, nothing for `anon`; plan §8.2): `records` (exists),
  `members` (only the owner writes), `profiles`, `user_keys` (locked data key, public key),
  `push_subscriptions` (one row per user), `scheduled_notifications` (deterministic ids: `sum:<day>`,
  `rev:<day>`, `rem:<fire ms>:<item>`, `test:<ms>`; payload encrypted by the phone), and, out of the API's reach, `private.send_log`
  (no content), `private.push_config` (kill switch and shadow mode) and `private.push_beta` (S5, `0006_push.sql`). S4 adds `private.daily_rows` (new rows per user per day, for the
  limits and the alarm; not reachable through the API). Backups: private repo `phdaccache/smart-meta-backups`.
- **Membership gates the server:** non-members can't read or write anything on the server, their own
  profile included; they can only ask for their membership status (`my_access()`). Their name, avatar and
  data wait on the phone until approval (spec AC-4; made stricter by S2 with the owner's OK).
- **One person per phone:** the phone records its owner; data of two people never mixes (plan §6.8).
- **Sync timing:** a few seconds after changes, on open, on reconnect, and a flush when the app goes to
  the background (plan §6.10).
- **Free plans only**; secrets never in the repo.
- **Testing:** Vercel preview of this branch + staging Supabase project; friends' data untouched.

## Stages

| Stage | Goal | Status |
|---|---|---|
| S0 | Mockups: notifications, avatars, sign-in screens, "Not synced yet" | Done 2026-10-29 (every mockup picked) |
| S1 | Tests on the owner's iPhone (passkey, push, captcha) + staging setup | Done 2026-10-29 (passkey chosen; push and captcha proven on iPhone and Android) |
| S2 | Accounts | Done 2026-10-29 (tested on two phones; members, requests, profile, one person per phone) |
| S3 | Encryption | Done 2026-10-29 (tested on both phones; data encrypted on staging; "open twice" warning) |
| S4 | Safety and operations (backups, alarm, limits, sync timing, privacy note) | Done 2026-10-30 (backups and restore drill on staging, alarm email, limits; privacy policy confirmed by the owner) |
| S5 | Core notifications | Done 2026-11-01 (planner, the four types, Settings → Notifications, the Notification card, kill switch, shadow beta from Requests; tested on both phones, 0006 to 0010 on staging). The shadow week moved to production, after S6 |
| S6 | The rest, then merge to `main` | Not started |

Details and checkboxes: [plan.md §14](plan.md).
