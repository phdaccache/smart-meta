# Notifications and accounts

The project that adds friend accounts, end-to-end encrypted sync and web push notifications to Smart
Meta. It runs on branch `notifications` and merges to `main` only when notifications work nicely.

## Files

| File | What it holds | When to change it |
|---|---|---|
| [spec.md](spec.md) | **What** must be true: numbered, checkable requirements, and **Adjustable numbers** (every limit, time and threshold, N-1 to N-25) | Only when the owner changes a requirement or a number |
| [plan.md](plan.md) | **How and why**: facts, designs, trade-offs, the owner's worries (§0), decisions (§2), stages (§14), open questions (§16), change log | Whenever something is decided, learned or done |
| [mockups/](mockups/) | S0 mockups (HTML artifacts); the picks are recorded in plan §2 | When the owner asks for another round |
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
  (or data password) only unlocks that key. Each user also has a key pair for future sharing.
- **Tables** (all with RLS, explicit grants, nothing for `anon`; plan §8.2): `records` (exists),
  `members` (only the owner writes), `profiles`, `user_keys` (locked data key, public key),
  `push_subscriptions` (one row per user), `scheduled_notifications` (deterministic ids like
  `due:<taskId>:<fireAt>`), `send_log`.
- **Membership gates the server:** non-members can't read or write anything but their own profile and
  membership status.
- **One person per phone:** the phone records its owner; data of two people never mixes (plan §6.8).
- **Sync timing:** a few seconds after changes, on open, on reconnect, and a flush when the app goes to
  the background (plan §6.10).
- **Free plans only**; secrets never in the repo.
- **Testing:** Vercel preview of this branch + staging Supabase project; friends' data untouched.

## Stages

| Stage | Goal | Status |
|---|---|---|
| S0 | Mockups: notifications, avatars, sign-in screens, "Not synced yet" | In progress (notifications and sign-in picked) |
| S1 | Tests on the owner's iPhone (passkey, push, captcha) + staging setup | Not started |
| S2 | Accounts | Not started |
| S3 | Encryption | Not started |
| S4 | Safety and operations (backups, alarm, limits, sync timing, privacy note) | Not started |
| S5 | Core notifications | Not started |
| S6 | The rest, then merge to `main` | Not started |

Details and checkboxes: [plan.md §14](plan.md).
