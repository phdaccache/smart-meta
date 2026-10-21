# Notifications, accounts and friends: plan

Started 2026-10-21 on branch `notifications`. This is the living record of the discussion between the
owner and Claude: what was decided, why, what is still open, and the risks and worries raised. **Nothing
here is implemented yet.** Any session working on notifications or accounts reads this first and keeps
it current (decisions, answers, new risks) instead of starting over.

It reverses the 2026-10-02 decision to leave notifications, accounts and friend sync out of the MVP.

---

## 0. Where the app stands today (checked in code, 2026-10-21)

- **Local-first.** IndexedDB (Dexie) is the source of truth. Sync copies changes out through an
  **outbox** and pulls newer rows in ([src/sync/engine.ts](../src/sync/engine.ts)), last write wins by
  `updatedAt`.
- **Supabase already exists.** One Postgres table `records` (user_id, collection, id, jsonb data,
  updated_at, deleted, data_version, seq), with row-level security "own records" and explicit grants
  ([supabase/migrations/0001_records.sql](../supabase/migrations/0001_records.sql)).
- **Accounts today:** email and password, sign-ups **off**. Accounts are made by hand in the Supabase
  dashboard. No email is ever sent ([src/sync/controller.ts](../src/sync/controller.ts)).
- **Core logic is pure TypeScript** (`src/lib/today.ts`, `scoring.ts`, `review.ts`; only i18n as a
  dependency), so it can plan notifications on the device.
- **PWA** with a Workbox service worker (vite-plugin-pwa, `registerType: 'autoUpdate'`). No push
  handler yet.
- **Hosting:** Vercel Hobby, at `https://smart-meta-h2ur.vercel.app`. Static site, no server code.
- **The GitHub repo is public.** Anything committed, any Actions log and any artifact can be seen by
  anyone. Secrets and backups never go there (see §7, §10).
- **Measured data size** (sample data, 7 months of heavy use, JSON per record): entries about 290 B
  each (446 of them, 74% of the bytes); goals about 410 B; commitments about 400 B; tasks about 250 B;
  projects about 245 B; preps about 270 B; occurrences about 310 B; week reviews about 195 B.
  Postgres adds about 250 B per row for columns, row header and the two indexes.

### Bug found while reading: a second person signing in on the same phone

The outbox and the local tables belong to the **device**, not to an account. If A signs out and B
signs in on the same phone:

- A's unsynced changes still in the outbox are uploaded **into B's account**.
- B's records are pulled **into the same local tables** as A's, so both people's data mix on screen,
  and later edits of A's items go to B's account.

Nothing is deleted outright, but data leaks across accounts and becomes hard to separate. The owner's
priority: **nobody may lose data.** Fix it in stage 1 (§8.6).

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Overall | Build notifications for the owner and friends. Accounts for friends are part of it. |
| Infrastructure | Stay on **Vercel Hobby + Supabase Free**. No new database now; plan B in §3.4. |
| Architecture | **Option A: the app plans, the server delivers.** |
| Push to | One device per account (the latest one that turned notifications on). Sync may still run on several devices. |
| No account | No notifications. Say so in a popup during onboarding. **No Supabase anonymous accounts.** |
| Sign-in | **Google** is the goal (friends look for it). Needs a spike on a real iPhone first (§6.2). |
| Who makes accounts | Friends make their own (Google), then wait for the owner's **approval** (hybrid, §6.1). |
| Sign-in moment | **After the user creates their first goal**, not at the end of the tutorial, so they already feel the app is theirs. |
| Profile | Name now. Picture later (social features later); avatars or Google's photo are fine, low storage. |
| Platforms | iPhone is the main target, Android a bonus. Friends are about 50/50 and have installed the app. |
| Money | **Not paying** for Supabase Pro now. Backups must be free (§10). |
| Domain | Undecided; keep the Vercel one for the MVP unless a reason appears (§9). |
| Rollout | Three stages (§11). Test in production behind a flag on the owner's account first (§12). |

### Notification types

| Type | Decision | Notes |
|---|---|---|
| Today's doings (morning summary) | ✅ | One push. Format for long lists in §5.1. |
| Due date | ✅ | Own push only for items with a time. Date-only items go in the morning summary. |
| Custom reminder | ✅ | On every kind of entry (task, goal, project; confirm which others, §13). **Once only** for now; repeating later. |
| Project steps | ✅ merged into due date | Steps already have end dates (`stepDeadlines`). |
| Review ready | ✅ weekly | |
| Preps with a time | ✅ | |
| Goal review date reached | ✅ | |
| Goal completed / target hit | ✅ **in-app celebration only**, no push | |
| Misses logging (evening) | ❌ skipped for now | Most likely to feel like nagging. |
| Goal status change | ❌ | Shown in Review instead. |
| Sync | ❌ no push | In-app only. |
| Release notes | ❌ no push | Already shown in-app. |
| Plan tomorrow | ❌ | |
| Stalled project | ❌ | Already in Review. |
| Test notification | ✅ **Developer mode only** (the owner) | |

Owner's top three: **custom reminder, due date, review ready.**

### UI decisions

- **No bell icon and no inbox.** Today is the inbox. Any history is server-only.
- **Settings → Notifications** with toggles per type.
- **App icon badge:** toggle, **off by default**. Counts **late + left today**. Whether the review
  counts too is open (§5.4).
- **Lock-screen details:** shown by default, can be turned off (then generic text like "3 things
  due today").
- **Quiet hours:** available, **off by default**.
- **Deep links:** tapping a notification opens that task, goal or project.
- **Cancel on done:** finishing an item removes its pending notification.
- **No snooze.**
- **Time zone:** stored with the plan; handles travel and daylight saving.
- **Language of the push:** from the app's language setting.
- **Denied permission:** show instructions to turn it back on.
- **Diagnostics row** in Settings (permission state, subscription present, last push delivered).

---

## 2. How web push works (facts to rely on)

**Flow.** The user taps "Turn on notifications". The browser asks permission and creates a
*subscription*: an endpoint URL at the push service (Apple, Google/FCM, Mozilla) plus two keys
(`p256dh`, `auth`). The app saves it to Supabase. To notify, the server encrypts the payload with those
keys (RFC 8291, aes128gcm), signs a token with its **VAPID** private key and POSTs to the endpoint.
The phone wakes the service worker, which shows the notification.

| | iPhone | Android |
|---|---|---|
| Minimum | iOS 16.4 | Chrome, Samsung Internet, Firefox |
| Must be installed to the Home Screen | **Yes**. A Safari tab never gets push. | No, but recommended |
| Permission prompt | Only after a tap, inside the installed app | After a tap |
| Action buttons | Unconfirmed; not needed since there is no snooze | Yes |
| Numeric icon badge | Yes (Badging API) | Depends on the launcher; often a dot |
| Silent push | **Not allowed**: every push must show a notification, or Apple may revoke the subscription | Allowed, but don't |
| Timing | Usually seconds | Doze can delay by minutes |

**Limits on both:**
- **No offline scheduled notifications.** Browsers dropped Notification Triggers, so every reminder,
  even "9:00 tomorrow", must come from the server.
- **Payload size.** RFC 8030 §7.2: push services must accept a body of **4096 bytes or less**; larger
  ones *may* be rejected with 413. After encryption overhead that leaves about **3,993 bytes** of
  content. Some services accept more, but we can't rely on it. In practice, title plus body stay
  under about 200 characters anyway (iPhone shows about 4 lines).
- Each device and browser has its own subscription. On iPhone, Safari and the Home Screen app are
  separate.
- In-app browsers (Instagram, WhatsApp) get nothing.
- Denied permission cannot be asked again from the app; only system settings can undo it.

### 2.1 Can the payload be exploited?

- **Size:** a user typing a huge title could push a payload over 4 KB and make the push fail
  silently. **We truncate** titles and bodies when planning, and the server rejects oversize rows.
- **Who can send to a subscription:** only someone holding **both** the subscription (endpoint and
  keys) **and the VAPID private key**. Apple and FCM require VAPID.
- **The real danger is the VAPID private key leaking.** With it plus the subscriptions table, an
  attacker could send any text to every user (for example phishing: "Your account is locked, sign in
  here"). So: the key lives only in Supabase Edge Function secrets, never in the repo or a `VITE_`
  variable. If it leaks, rotate it; every user then has to turn notifications on again.
- **Deep link URLs come from user-planned rows.** The server only accepts relative paths inside the
  app (like `/task/…`), never full URLs, so a notification can't open another site.

### 2.2 When subscriptions expire, or Chrome revokes permission

- The push service answers **404 or 410** for a dead subscription. The dispatcher **deletes** that row
  and logs it. We have to handle it, and it is cheap.
- **On every app open**, the app checks `Notification.permission` and
  `pushManager.getSubscription()`. If permission is still granted but the subscription changed or
  disappeared, it re-subscribes silently (no prompt needed) and uploads the new one.
- **If permission was revoked** (Chrome can do this for sites with low engagement; the user can do it
  in system settings): the app shows "Notifications are off for Smart Meta" with instructions in
  Settings. If the state is back to `default`, one tap can ask again.
- The diagnostics row shows all of this, so "it doesn't notify me" can be answered from a screenshot.

### 2.3 Who can read notification content ("your server can see it")

Push is encrypted between **our server and the phone**: Apple and Google carry it but can't read it.
But **our server writes the text**, so the text sits in our database, and so does all the data it
comes from (the `records` table). Anyone with dashboard or service-role access, **the owner
included**, can read every friend's goals, tasks and planned notifications. Row-level security only
limits what *users* see through the API; it doesn't limit the project owner.

Options, from cheapest to strongest:

1. **Policy (MVP):** say it plainly to friends, never look, keep dashboard access to the owner only
   with 2FA, build no admin screens that show content.
2. **Generic lock-screen text** reduces what shows on a locked phone, but not what the server holds.
3. **Encrypted push payloads:** the device knows its own subscription's public keys, so **the app can
   encrypt the notification text itself** when planning. The server then stores only ciphertext and
   only adds the VAPID header. The owner can't read planned notifications. Moderate work; the records
   themselves are still readable.
4. **End-to-end encrypted records:** the app encrypts all data with a key the server never sees. The
   owner can't read anything. Costs: a key or passphrase the user must not lose (Google sign-in
   doesn't provide one; passkeys might), no recovery if it's lost, harder debugging and migrations,
   and **it conflicts with the planned social features** (sharing chosen entries needs key sharing).
   A big project.

Recommendation: 1 now, 3 as an optional later step, 4 only if privacy becomes a core promise.
**Open:** does the owner want 3 in stage 2? (§13)

---

## 3. Infrastructure and costs

### 3.1 Limits (checked 2026-10-21)

**Supabase** ([pricing](https://supabase.com/pricing),
[database size](https://supabase.com/docs/guides/platform/database-size)):

| | Free | Pro ($25/month) |
|---|---|---|
| Database | **500 MB**; above it the project goes **read-only** | 8 GB, then $0.125/GB |
| Egress | 5 GB | 250 GB, then $0.09/GB |
| File storage | 1 GB | 100 GB |
| Monthly active users | 50,000 | 100,000 |
| Edge Function calls | 500,000 / month | 2 million |
| Backups | **None** | Daily, 7 days |
| Pausing | After 1 week with no activity | Never |
| Billing | Can't be charged; limits restrict the project | Spend cap on by default |
| Projects | 2 active free projects | |

**Vercel Hobby** ([limits](https://vercel.com/docs/limits/fair-use-guidelines),
[analytics](https://vercel.com/docs/analytics/limits-and-pricing)): 100 GB data transfer, 1M function
calls, **50,000 Web Analytics events / month** (collection pauses after a 3-day grace; Hobby is never
charged). Non-commercial use only (donations are fine). Hobby cron runs at most once a day, so it's
**not usable for reminders**.

**Others:** Resend free: 3,000 emails/month, 100/day, one domain. Cloudflare D1 free: 5 GB storage,
5M rows read/day, 100k rows written/day; since 2026-09-01 queries fail past the daily limits.

### 3.2 What it will cost

At 50 to 200 users: **$0**. Pushes, cron and auth are far below the limits. The only limit within reach
is **database size**, and the only real loss on Free is **no backups** (solved for free in §10).

Rough storage: heavy use (similar to the sample data) is about 1,200 records a year, so about
**0.6 to 0.7 MB per user per year** including Postgres overhead and some bloat. 200 heavy users fill
about 140 MB a year, so 500 MB lasts a few years. Lighter users stretch it further. The
**simulator** (private artifact, [Smart Meta Runway](https://claude.ai/artifact/6xvMmYEUDBiKkGsgkfLWhq))
does this math with your own inputs: users now and later, years, records per user per year, pushes,
backup schedule, and your real database size for calibration.

**Hidden cost found with the simulator: backups count as egress.** A full `pg_dump` reads the whole
database out of Supabase, which counts toward the 5 GB a month. A full dump every night of a 200 MB
database is 6 GB a month, **over the free egress by itself**. Hence the backup schedule in §10: a
weekly full dump plus daily changes only.

Web Analytics: 200 users × 4 opens a day × 30 days = 24,000 events. Fine; above about 400 daily users
it would pause (free, just no stats).

### 3.3 Watching usage so nothing surprises you

- **Supabase dashboard → Organization → Usage** shows database size, egress and monthly active users
  against the limits.
- **Vercel dashboard → Usage**; Vercel emails as you near limits. Hobby is never billed.
- **Our own alarm, free:** the nightly backup job (§10) also runs a few SQL queries (database size,
  rows per user, pushes sent per day, users approved and waiting). It **fails on purpose** when the
  database passes 60% (300 MB), when one user has an unusual number of rows, or when push sends jump.
  GitHub then emails the owner. Optionally it also sends the owner a push.

### 3.4 When the free tier runs out: the plan

In order, each step only if the previous one isn't enough:

1. **Alarm at 60%** (above). Time to act, not panic.
2. **Trim:** delete tombstones (`deleted = true`) older than 90 days, prune revision history, run
   `VACUUM`. Cap rows per user. Stop approving new people (waitlist).
3. **Friends chip in for Pro** ($25/month, about R$140; 20 people pay about R$7 each). Brings 8 GB and
   daily backups.
4. **Plan B, still free: move the data to Cloudflare D1** (5 GB) behind a small Cloudflare Worker,
   and **keep Supabase only for sign-in** (50k free users). Users don't sign in again. Work: a new
   `SyncTarget` (the README already plans for it), the Worker verifying Supabase tokens, a one-time
   copy. About 1 to 2 weeks.

Read-only mode is the failure to avoid: the app keeps working locally, but sync and notification
plans stop until it's fixed.

---

## 4. Architecture: the app plans, the server delivers

### 4.1 Pieces

- **Planner (on the device, pure TypeScript):** after each sync **pull** finishes (so it plans from
  the newest data), it computes every notification for the next **14 days** from local data and the
  notification settings. It reuses `today.ts` and `review.ts`.
- **`scheduled_notifications` table:** one row per planned notification:
  `user_id, id, fire_at, kind, title, body, url, tag, sent_at, status`.
  **Deterministic ids** (for example `due:<taskId>:<fireAt>`), so replanning updates the same row
  instead of creating a duplicate, from any device.
- **Upload only the difference:** the app hashes the plan and only sends rows that changed or
  disappeared. A normal day changes a handful of rows.
- **`push_subscriptions` table:** one row per user (one push device): endpoint, keys, locale, time zone,
  last success, last error.
- **Dispatcher:** `pg_cron` every minute calls a `dispatch` Edge Function (with a secret header, so
  it can't be triggered from outside). It sends rows whose time has come, marks them sent, and deletes
  dead subscriptions.

### 4.2 "Isn't computing on every sync costly?"

No. The planning runs **on the phone**, not on the server, and it's the same kind of work Today
already does each time it renders: milliseconds for 14 days. To keep it light:

- Replan only when something relevant changed: data that affects notifications, notification
  settings, the date, or the time zone. Debounced, like sync.
- Upload only the difference.

The server's work is a tiny query every minute plus a few HTTP calls. Well inside the free tier.

### 4.3 Known trade-offs of option A

- A change made **offline** (marking done) can't cancel its push until the phone syncs. Accepted.
- If nobody opens the app for 14 days, notifications stop at the end of the horizon. Arguably right.
- The plan is only as fresh as the last sync of **any** device. Planning always happens after a pull.

### 4.4 Safeguards, because notifications can't be wrong

The owner's rule: *we can't get notifications wrong.*

1. **Planner unit tests** covering time zones, daylight saving changes (Brazil currently has none, but
   travel does), midnight, all-day vs timed items, done items, deleted items, paused projects, goals
   in the backlog, and language.
2. **Drop stale pushes:** a row more than 15 minutes late (dispatcher down, phone offline) is marked
   `skipped`, never sent late. No burst of old reminders.
3. **Fuse:** the server refuses to send more than 20 pushes per user per day, and logs it. A bug can
   never spam someone.
4. **Server-side checks** on every planned row: `fire_at` within the next 15 days, text lengths, a
   relative URL, at most N pending rows per user.
5. **Kill switch:** one database setting stops all sending at once.
6. **Shadow mode** before turning it on for friends: for a week the dispatcher records what it *would*
   send for everyone; compare against expectations.
7. **Send log** (`sent`, `skipped`, `failed`, reason), kept 30 days, never shown in the app.

---

## 5. Notification details

### 5.1 Morning summary with a long list

One push. Title: count. Body: timed items first (by time), then late, then the rest; at most 3 names,
then "+N more". Example:

> **6 things today**
> 7:00 Gym · Send report · Call mom · +3 more

- Skipped when there is nothing for today.
- Tapping opens Today.
- Default time: **8:00**, editable. More ideas in §13 (Q6).
- Optionally the weekly review rides inside Monday's summary ("…and your weekly review is ready")
  instead of its own push. That saves a push. **Open** (§13).

### 5.2 Due dates

- **Items with a time** get their own push **at that time** (lead time "15 min before" is open, §13).
- **Date-only items** appear in the morning summary, not as their own push.
- **Late items** are not pushed again; they count in the badge (if on).
- Several items at the **same time** (within 15 min) are **merged** into one push: "3 things at 9:00".

### 5.3 Grouping

- iPhone stacks notifications from the same app; Android bundles them after a few. That's automatic.
- The web `tag` field makes a newer notification **replace** an older one with the same tag (used for
  the morning summary).
- Our own merging happens at planning time (§5.2), which is what really keeps it calm.

### 5.4 Daily cap: is 3 right?

App-initiated pushes (summary, review, goal review date) are already at most about 2 a day. A hard
cap of 3 would mainly hit **pushes the user asked for** (custom reminders, timed due items), and
dropping something you explicitly asked to be reminded about is the worst kind of wrong. Proposal:

- **No cap on what the user asked for**, but merge items that are close together.
- **App-initiated pushes at most 2 a day.**
- **Safety fuse of 20 a day** on the server (§4.4) only to catch bugs.

### 5.5 App icon badge

- Counts **late + left today**, like Things. Off by default.
- **Review in the badge:** not recommended. A mixed number ("why 5?") is confusing; the review has its
  own push. **Open** (§13).
- **It can be stale:** iPhone forbids silent pushes, so the number only updates when the app runs or
  a real push arrives (each push carries the current count). After midnight it may be wrong until the
  morning summary or the next open. Acceptable, but known.

### 5.6 Settings → Notifications (proposed)

- Main switch (needs an account; otherwise it explains why and offers sign-in).
- Morning summary (time), Due dates, Custom reminders, Weekly review, Goal review date, Preps.
- Lock-screen details (on), Quiet hours (off; from/to), App icon badge (off).
- Diagnostics row.
- Developer only: Send a test notification.

---

## 6. Accounts

### 6.1 Who creates them: hybrid with approval

The owner's idea: people sign up themselves, can use the app while waiting, and the owner approves
them by hand. It works well:

- Anyone can **sign in with Google**. That creates a Supabase user, which costs nothing.
- A small `members` table, writable **only by the owner** (dashboard or service role), holds who is
  approved and their flags (for example `push_beta`).
- **Row-level security** on `records`, `scheduled_notifications` and `push_subscriptions` requires
  being in `members`. A waiting user **can't write a single byte** to the server, so bots and strangers
  cost nothing and can't fill the database.
- While waiting, the app works **local-only** as today and shows "Waiting for access". The outbox keeps
  everything; once approved, it all uploads.
- **The owner is told about sign-ups:** a database trigger sends the owner a push (or the nightly job
  lists them). Approving means inserting a row, from the dashboard now, maybe from Developer mode later.
- A **cap** is easy: the trigger or the approval refuses past N members. Everyone else waits.
- Existing dashboard-made accounts (the owner, current friends) are inserted as members in the
  migration.

### 6.2 Sign-in methods, honestly

| Method | Works in an installed iPhone app? | Cost and setup | Notes |
|---|---|---|---|
| **Google, ID-token flow** (Google Identity Services button → `supabase.auth.signInWithIdToken`) | **Unknown, must test**: the button uses a popup, and popups in standalone iPhone apps are flaky | Free; Google Cloud project, OAuth client, consent screen | Consent shows the app's own name and address, not `….supabase.co` |
| **Google, redirect flow** (`signInWithOAuth`) | **Known problem**: login often finishes in a Safari sheet whose storage isn't the app's, so the app stays signed out ([report](https://github.com/warren-wyn-dev/wynteam/pull/663), [Apple forum](https://developer.apple.com/forums/thread/649699)). Workarounds exist and need testing | Free | Consent screen shows the `supabase.co` address, which looks suspicious; hiding it needs a paid custom domain |
| **Email code (6 digits)** | Yes: typed inside the app, nothing opens Safari | Needs **custom SMTP**: Supabase's built-in email only sends to the project's team and about 2 an hour. Resend free needs **a domain you own**; Gmail SMTP with an app password works without one (about 500/day, sent from a personal Gmail) | Most robust on iPhone |
| Magic link | **No**: the link opens Safari, not the app | Same SMTP need | Ruled out |
| **Email + password, made by the owner** (today) | Yes | Free | Fine as a fallback for anyone without Google; resets need the owner |
| SMS code | Yes | **Paid** per message | Ruled out |

Why I wasn't confident about Google: on Android and desktop it just works; on an **installed iPhone
app** it's the most reported failure in this area, and there is no official fix. It can still work;
it needs proof on a real iPhone.

**Plan:** stage 1 starts with a **1 to 2 day spike** on a real iPhone, both Google flows, installed
app, iOS current version. If one works reliably: Google is the sign-in. If neither does: email code
with Gmail SMTP (no domain needed), Google later. The owner-made password accounts stay as a fallback
either way.

Google side notes: only basic scopes (`openid email profile`), which need **no Google verification**.
The consent screen must be set to "In production"; in "Testing" mode only 100 listed test users can
sign in. Showing a logo on the consent screen needs brand verification (optional).

### 6.3 Profile

- **Name:** now (from Google, editable).
- **Picture (later, for social features):** Google already gives a photo URL hosted by Google (zero
  storage). Or a set of built-in avatars (zero storage). Uploads, if ever: resized on the phone to
  128 px WebP, about 10 KB each; 200 users is 2 MB of the 1 GB free file storage. **Storage is not the
  worry; moderation is** (once friends see each other's pictures).
- The profile lives in its own table, not in `records`, so social features can read names and
  pictures without touching anyone's data.

### 6.4 Recovery after losing the phone

Yes: install on the new phone, sign in, and sync pulls everything. Caveats:
- It's only as safe as the database. Free has no backups, so §10 is required, not optional.
- The user needs their Google account (or their password).
- They must be an approved member (they already are).

### 6.5 Onboarding

1. Tutorial as today, including the install screen.
2. The user creates their **first goal** (they already own something).
3. Then a "Keep your goals safe" card: sign in with Google, or "Not now".
4. "Not now" shows the popup: without an account there are **no notifications**, and data lives
   only on this phone. Settings keeps the sign-in row for later.
5. Notifications permission is asked **later, at a useful moment** (first time they set a time or a
   reminder, or from Settings), never at launch. iPhone allows the prompt only after a tap.

### 6.6 The Safari "rescue" point, explained

On iPhone, **Safari and the Home Screen app keep separate storage**. Someone who tries the app in
Safari, creates goals, then installs it, finds the installed app empty. With an account, signing in on
both would bring the data across. It's avoidable rather than something to rescue:
- Friends have already installed, so it barely applies.
- In Safari on iPhone (not installed), the sign-in card says "Open Smart Meta from your Home Screen to
  sign in", so accounts only start inside the installed app.

### 6.7 Delete account

Required (fairness, and Brazil's data protection law). Settings → Delete account: confirm, then an Edge
Function (with the service key) deletes the Supabase user. `on delete cascade` removes records,
subscriptions, planned notifications and the profile. Then the device wipes itself. Today's "Erase all
data" clears records but leaves the account.

### 6.8 One person per phone, nobody loses data (fix for §0's bug)

- On first sign-in the device remembers its **owner** (user id) in the local `meta` table.
- **Sign-in with local data that has no owner** (used without an account): the data becomes this
  account's and uploads. This is the normal onboarding path.
- **Sign-out:** only when online and the outbox is empty ("Connect to sign out, so nothing is lost").
  Offers a JSON export first. Then the device is **wiped**; the data is safe on the server.
- **Sign-in when local data belongs to someone else** (shouldn't happen after the rule above, but
  could after a crash): **refuse**, and explain that the other person must sign in and sync first. Or
  save an automatic JSON export of the local data, then wipe. Never merge two people's data.
- The outbox drains only for the owner it was written under.

### 6.9 Several devices

The owner said multiple devices aren't supported for now. Blocking them would be **more** work than
allowing them (device registry, kicking sessions out) and would hurt recovery after losing a phone.
So:
- **Sync keeps working on several devices**, as today (last write wins; conflicts are rare for one
  person).
- **Push goes to one device:** turning notifications on somewhere replaces the previous subscription.
- Plans written from different devices don't duplicate (deterministic ids), and each device plans
  after pulling.

Small work, mostly the single-row subscription and the ids.

---

## 7. Security

### 7.1 What RLS is

**Row-level security** is a Postgres feature: each table has rules saying which rows a signed-in user
may read or change, checked by the database itself on every query. The anon key in the app is public
by design. Anyone can use it to send queries, and RLS is the only thing that stops them from reading
others' rows. A table **without RLS is readable by the whole internet**. Many leaks of Supabase apps
come from exactly that.

### 7.2 The Supabase email (2026-10-30 change)

From 2026-10-30, new tables in `public` are **not reachable from the Data API until granted
explicitly** ([changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).
Effect on us:
- `records` keeps its grants. `0001` already grants explicitly, so a fresh project or
  `supabase db reset` still works.
- **Every new migration** (members, profiles, push_subscriptions, scheduled_notifications, send log)
  must: enable RLS, add policies, and `grant` to `authenticated` only what the app needs. Also grant to
  `service_role` if an Edge Function reaches the table through supabase-js. Never grant to `anon`.
- It's a safer default for us: a forgotten grant fails loudly ("permission denied") instead of
  exposing a table.
- Supabase's Security Advisor flags tables without RLS or grants; check it after each migration.

### 7.3 Realistic threat model

Nobody targets a 50-person friends app on purpose. But:

- **Automated bots and scanners** hit every public site and every Supabase project all day. They try
  the anon key against every table, sign-up endpoints, and common mistakes.
- **The anon key and the whole frontend are public**, and so is this repo. Assume an attacker knows
  every table name, every policy and every endpoint, and design so that knowing doesn't help.
- **A friend's Google account gets compromised.** The attacker is then a "real" member.
- **A curious member** opens the browser console and calls the API directly with their own token.
- **The most likely damage is our own mistake:** a migration without RLS, a key committed by
  accident, a sync bug in a release that deletes or overwrites everyone's data, a planner bug that
  spams. Most mitigations below are about this.

What they could do, and what limits it:

| Threat | Effect | Mitigation |
|---|---|---|
| Read others' data | Privacy breach | RLS on every table, tests that B can't read A, Security Advisor |
| Fill the database with junk | Read-only mode, outage for everyone | Only approved members can write; size check on `data` (for example 64 KB); row cap per user; alarm |
| Spam pushes | Annoyed users, Apple may revoke | Server checks plus the 20/day fuse; only the owner's own subscription |
| Hammer the API | Free limits hit, outage | Supabase rate limits; waiting users can't write; Vercel CDN for the site |
| Steal sessions (XSS) | Account takeover | Never render user text as HTML; Content-Security-Policy in `vercel.json`; few dependencies |
| Leaked service-role or VAPID key | Full database access, or phishing pushes | Only in Supabase secrets; never `VITE_`; secret scanning; rotate if leaked |
| Sync bug wipes data | Data loss for everyone | Nightly backups with restore tests; tombstones instead of hard deletes; staged rollout |
| Sign-up spam | Many fake users | Google-only reduces bots; approval means they can't write; optional Turnstile captcha (free) on email sign-up |

**Money:** on Supabase Free and Vercel Hobby, **an attack cannot produce a bill**. The worst case is
an outage or read-only mode. This changes if we ever move to Pro: keep Supabase's spend cap **on**.

### 7.4 Sign-up abuse: the options

1. **Closed** (today): only the owner creates accounts. Safest, most manual.
2. **Allowlist:** a Supabase "before user created" hook only lets listed emails create an account.
3. **Open + approval** (chosen, §6.1): anyone signs in, only members can write. Strangers cost nothing.
4. **Captcha** (Cloudflare Turnstile, free, built into Supabase Auth) on any email-based sign-up.
5. **Rate limits:** Supabase Auth limits per IP; tighten them in the dashboard.
6. **Google "Testing" mode** as an allowlist (only listed test users, max 100). Possible, but hacky.

### 7.5 Never trust any user input (owner's rule)

Anything a client sends is untrusted, including from our own app (a member can send anything with
their token):
- `records.data`: size limit in the database; the app validates the shape when it **pulls** too (it
  already migrates by `data_version`).
- Planned notifications: lengths, time window, relative URLs, row count, all checked by the server.
- Profile name and picture: length, allowed characters, image type and size. Rendered as text.
- Later, social sharing brings **other people's** text into the app. From then on, every place that
  renders shared content needs care (no HTML, length caps).

### 7.6 Checklist

RLS + explicit grants on every table; no `anon` grants; service and VAPID keys only in Supabase
secrets; secret scanning on the public repo (GitHub's push protection); 2FA on GitHub, Supabase,
Vercel and Google Cloud; CSP header; dependency audit; backups with restore tests; delete-account
flow; a short privacy note for friends; logs without personal data; Security Advisor after each
migration.

---

## 8. Other risks raised

1. **Wrong notifications lose the permission for good.** Safeguards in §4.4.
2. **One user → many users.** The shared-phone bug (§0) and multi-device (§6.9) are the known
   cases.
3. **Support:** "it doesn't notify me" (not installed, old iOS, Focus mode, revoked). Diagnostics row.
4. **The owner becomes the operator:** a full or broken database is everyone's problem. Alarm (§3.3),
   backups (§10), kill switch (§4.4).
5. **The iPhone install gate:** friends have installed already. New friends must install before
   signing in.
6. **Google sign-in on iPhone** may not work in the installed app (§6.2). Spike first.
7. **Free tier pausing** after 7 idle days: not a risk with daily users; a risk on a staging project.
8. **Public repo:** backups, logs and secrets must never land in it (§10).
9. **Privacy expectations:** friends may assume their goals are private from the owner (§2.3).

---

## 9. Domain

- **Keep `smart-meta-h2ur.vercel.app` for the MVP.** Free, works for push and for Google sign-in.
- A domain costs about US$10 to 15 a year for `.com` (Cloudflare Registrar sells at cost), about R$40
  a year for `.com.br` (registro.br), **renewed every year**. Not needed unless we want email codes
  through Resend, a nicer address, or independence from the Vercel name.
- **Changing it later is a migration:** local data, the Home Screen install and push subscriptions all
  belong to the address. With accounts, it becomes manageable: everyone signs in at the new address,
  sync brings the data back, they add it to the Home Screen again and turn notifications on again.
  The old address shows a "we moved" page.
- So: **if** a domain ever happens, do it **after stage 1** (accounts make moving painless), and
  before many more friends join. The current few users (the owner included) would sign in first, then
  move. Fine for an MVP.

---

## 10. Backups: the nightly database dump

**What it is:** a scheduled job runs `pg_dump`, which writes the whole database (tables and rows)
into one file that can be restored into any Postgres.

**Schedule (because of egress, §3.2):** a **full dump once a week**, plus **every night only the rows
that changed**. The `records` table already has a `seq` cursor that moves on every write, so "rows
with `seq` above last night's" is exactly the change set, the same way sync pulls. Restoring means the
latest full dump plus the nightly change files after it. Full dumps every night only while the
database is small (under about 100 MB).

**Where it goes (free), given the public repo:**
- A **separate private GitHub repository** (for example `smart-meta-backups`) holds a scheduled
  workflow (private repos get 2,000 free Actions minutes a month; a dump takes about a minute).
- The dump is **encrypted** (with `age`, key only in the owner's password manager) before it's saved,
  because it holds friends' data.
- Kept as workflow artifacts (up to 90 days) or committed to that private repo, keeping the last 30
  days.
- **Not in the public app repo:** its logs and artifacts can be seen by others, and GitHub disables
  scheduled workflows in public repos after 60 days without activity.
- It connects through Supabase's **pooler** connection string (GitHub runners have no IPv6; the
  direct connection needs it), stored as a secret in the private repo.
- **Restore drill:** once, then every few months, restore a dump into the second free Supabase
  project (§12) and open the app against it. A backup that was never restored doesn't count.
- The same job runs the usage alarm queries (§3.3).

---

## 11. Rollout in three stages

**Stage 1: accounts that are safe for friends**
- Google sign-in spike on iPhone (decides the method).
- `members` (approval, flags) and `profiles` (name), with RLS and grants; existing accounts migrated.
- Approval gate on writes; "Waiting for access" state; the owner is told about sign-ups.
- Sign-in after the first goal; "Not now" popup about notifications.
- One-person-per-phone fix (§6.8); sign-out rules; delete account.
- Database size limits; nightly encrypted backup + alarm; restore drill; CSP; Security Advisor.

**Stage 2: push, core**
- VAPID keys; service worker push and click handlers (deep links).
- `push_subscriptions` (one device), re-subscribe on open, diagnostics row.
- Planner (tests first), `scheduled_notifications`, dispatcher with stale-drop, fuse and kill switch,
  send log.
- Types: morning summary, timed due dates, custom reminders (once), weekly review.
- Settings → Notifications; lock-screen details toggle; permission instructions.
- Behind `push_beta` for the owner only, then shadow mode, then friends.

**Stage 3: the rest**
- Preps with a time, goal review date, in-app celebration, app icon badge, quiet hours.

---

## 12. Testing push

- **The owner's idea, adopted:** test in production behind a `push_beta` flag on the owner's account
  only. Friends see nothing until it's on for them.
- **Second free Supabase project as staging,** for migrations and restore drills, so friends' data is
  never at risk while testing. (It pauses after 7 idle days; fine.)
- **Vercel preview** for the branch: push works on any HTTPS address, but each address is a different
  "app" (own subscription, own Home Screen icon). Use the branch's fixed alias, not per-commit URLs,
  and add that address to the Google OAuth settings (no wildcards there).
- **Planner unit tests** (pure function: data + settings + now + time zone → plan).
- **Shadow mode** for a week before friends (§4.4).
- **Developer test button** sends a push to the owner's device right away.

---

## 13. Open questions

1. Lead time for timed due items: at the time, or 5/10/15 minutes before (and a setting)?
2. Morning summary: default 8:00? Skip weekends? Include the weekly review on Mondays instead of its
   own push?
3. When should the weekly review push come (for example Sunday 18:00, or Monday morning)?
4. Custom reminders: which entry types exactly (task, goal, project, step, prep, commitment)?
5. Badge: include the review or not (recommendation: not)?
6. Encrypted push payloads (§2.3 option 3) in stage 2, or later?
7. Sign-up cap: what number? Should waiting users see a message with an estimated wait?
8. Is the owner fine with the owner-made password accounts staying as a fallback?
9. Privacy note for friends: who writes it, and where does it show (sign-in screen, Settings)?
10. Domain: confirm "no domain for the MVP".

### Ideas for the morning summary (owner asked for some)

- Fixed 8:00 by default; the user can change it.
- "Only on days with something" (default) vs "every day, even if empty" (no).
- Weekdays only (option).
- One line of encouragement when the list is short ("Just one thing today: Gym 7:00").
- Monday's summary includes the weekly review.
- Later: learn the time the user usually opens the app and send 15 minutes before.

---

## 14. Later (not now)

- **Social:** share chosen entries with friends; maybe shared goals and projects. What it changes now:
  profiles in their own table (done in stage 1), stable user ids, no end-to-end encryption that would
  block sharing, push infrastructure reusable for "Ana shared a goal with you".
- Repeating custom reminders.
- Profile pictures (avatars or uploads).
- Snooze, actions on Android notifications.
- Evening logging reminder (misses), if wanted after living with the rest.
