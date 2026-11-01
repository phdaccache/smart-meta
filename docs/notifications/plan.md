# Notifications, accounts and friends: plan

Started 2026-10-21 on branch `notifications`. The living record of the discussion between the owner
and Claude: decisions, why, what is open, and every worry the owner raised. **Nothing here is
implemented yet.** Any session working on notifications, accounts, encryption or avatars reads this
first and keeps it current instead of starting over. When a decision changes, update it here and add
a line to the change log at the end.

It reverses the 2026-10-02 decision to leave notifications, accounts and friend sync out of the MVP.

**Start at [README.md](README.md)** (how sessions work, shared decisions, stage status). The checkable
requirements are in [spec.md](spec.md); this plan holds the how and why behind them.

---

## 0. The owner's requirements and worries (keep these in view)

These are the owner's own priorities, collected across the conversation. They outrank convenience.

1. **The owner must not be able to see any user's data.** "A big deal." Wants the **simplest**
   solution that really achieves it, and **users must not be made responsible for a key** ("that
   can't be okay"). See §7.
2. **Nobody may lose data**, including when two people use the same phone (§6.8).
3. **Notifications can't be wrong.** A wrong or late reminder costs trust (§4.4).
4. **No surprise costs.** Free plans only for now (Supabase Free, Vercel Hobby, GitHub Free). No Pro,
   no custom domain. Wants usage tracked so growth never catches them off guard (§3).
5. **Be realistic about attackers.** Many bad actors exist who could damage users' data or cause
   costs. **Never trust any user input** (§8).
6. **Control who gets in:** a waitlist and a cap (100 for now) (§6.1).
7. **See before building:** mockups with 2 to 3 options per notification type (fake examples), and
   avatar mockups, approved before implementation (§12).
8. **Merge only when notifications work nicely:** everything is tested on a Vercel preview at a
   fixed branch address first (§13).
9. **Stable over shiny:** skip Google sign-in because it isn't reliable in the installed iPhone app.
   It's an MVP.
10. **Social features later** (sharing chosen entries, maybe shared goals and projects): today's
    choices must not block them (§7.5, §15).
11. **Feel ownership before signing in:** sign-in comes after the first goal is created (§6.5).
12. Doesn't want the sign-in emails sent from their **personal** address if avoidable (§6.2).
13. **Face ID / passkeys might not work in the installed web app**, and not everyone has iCloud
    Keychain. Needs a fallback that still doesn't make users responsible for a key (§7.2).
14. **Check-ins grow the data a lot.** Toggling a checkbox on and off, or checking in often, adds rows
    every time (§3.5).
15. **Sync must not lose data**, and the user should see when edits are not synced yet (like Google
    Docs) (§6.9).
16. **Is it OK with GitHub's rules** to keep backups there? (§10)
17. **Approving people should be quick**, ideally one tap (§6.1).
18. **Reminders should arrive on time**, not just "within 15 minutes" (§4.4).
19. **Work in stages that fit a session:** small enough that Claude doesn't get confused, big enough
    that it keeps the context (§14).

---

## 1. Where the app stands today (checked in code, 2026-10-21)

- **Local-first.** IndexedDB (Dexie) is the source of truth. Sync copies changes out through an
  **outbox** and pulls newer rows in ([src/sync/engine.ts](../../src/sync/engine.ts)), last write wins by
  `updatedAt`.
- **Supabase already exists**, region **South America (São Paulo)**. One Postgres table `records`
  (user_id, collection, id, jsonb data, updated_at, deleted, data_version, seq) with row-level security
  and explicit grants ([supabase/migrations/0001_records.sql](../../supabase/migrations/0001_records.sql)).
- **Usage on 2026-10-21** (dashboard): database **25.8 MB** (this is what counts toward the 500 MB
  free limit; most of it is Supabase's own tables), WAL 96 MB and system 167 MB (disk, not the quota),
  disk 15%, memory 59% (normal for the free instance), CPU 5%, disk IO balance 99%.
- **Accounts today:** email and password, sign-ups **off**, accounts made by hand in the dashboard.
  No email is ever sent ([src/sync/controller.ts](../../src/sync/controller.ts)).
- **Core logic is pure TypeScript** (`src/lib/today.ts`, `scoring.ts`, `review.ts`), so the phone can
  plan notifications.
- **PWA** with a Workbox service worker (vite-plugin-pwa). No push handler yet.
- **Hosting:** Vercel Hobby at `https://smart-meta-h2ur.vercel.app`. Static site.
- **The GitHub repo is public.** Commits, Actions logs and artifacts are visible to anyone. Secrets
  and backups never go there.
- **Measured record sizes** (sample data, 7 months of heavy use, JSON per record): check-ins
  ("entries") about 290 B (74% of the bytes), goals 410 B, commitments 400 B, tasks 250 B, projects
  245 B, preps 270 B, occurrences 310 B, week reviews 195 B. Postgres adds about 250 B per row.

### Bug found while reading: a second person on the same phone

The outbox and local tables belong to the **device**, not the account. If A signs out and B signs in
on the same phone, A's unsynced changes upload **into B's account**, and B's records are pulled into
the same local tables as A's, so both people's data mix. Fix in S2 (§6.8).

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Overall | Notifications for the owner and friends; accounts for friends are part of it. |
| Infrastructure | **Vercel Hobby + Supabase Free**, no new database now. Plan B in §3.4. |
| Architecture | **The app plans, the server delivers** (§4). |
| Privacy | **The owner must not see user data** → end-to-end encryption, key held by the user's **passkey (PRF)** (§7). **Chosen in S1 (2026-10-29)** after it passed inside the installed app on iPhone and Android (§14 S1 results). The data password stays as the fallback. |
| Sign-in | **Email with a 6-digit code.** No Google for now (unreliable in the installed iPhone app). |
| Sign-in email sender | A **dedicated Gmail account** for the app (not the owner's personal one), through Gmail SMTP (§6.2). |
| Sign-up | Open, with **Cloudflare Turnstile captcha**, then **owner approval**. Waiting screen. **Cap 100.** |
| No account | No notifications; a popup says so in onboarding. **No anonymous accounts.** |
| Sign-in moment | **After the first goal is created.** |
| Profile | Name + **built-in avatars with many options** (no photo uploads for now). Mockups first. |
| Devices | Several devices are fine for sync (cheap). Push goes to one device, the latest that turned it on. |
| Domain | **No custom domain for now.** Keep the Vercel address. |
| Money | Free plans only. Backups through a private GitHub repo. |
| Platforms | iPhone first, Android as a bonus. Friends are about 50/50 and have installed the app. |
| Testing | Vercel preview at the fixed branch address + a staging Supabase project; merge only when notifications work nicely. |
| Rollout | Seven stages, S0 to S6, one session each (§14). Merge after S6. |

### Notification types

| Type | Decision |
|---|---|
| **Morning summary** | ✅ 8:00 by default, editable; weekdays-only option; skipped on empty days. Format chosen from mockups. |
| **Due date, no time** | ✅ Mentioned in the morning summary. |
| **Due date, with a time** | ✅ In the morning summary. **Changed 2026-10-31 (S5, answer 1a):** no push of its own any more; the item's Notification card decides (custom reminder below). |
| **Custom reminder** | ✅ On **tasks, projects, project steps and preps** (not goals: no purpose). **Not on commitments** for now (owner, 2026-10-31: they have no date; repeating reminders come later, §15). **Once only** (a prep's reminder follows each of its times). **Always pushed** (never capped). Set with the **Notification card** (owner's design, 2026-10-31, §14 S5). Repeating reminders and **at-risk reminders for commitments** are the next feature after the MVP (§15). |
| **Weekly review** | ✅ Its own push on Monday morning, **with its own editable time** (default the same as the morning summary, 8:00). |
| Project steps | ✅ Same rules as due dates (steps have end dates). |
| Late items | Not pushed again after their time; only counted in the badge (confirmed). |
| Preps with a time | ✅ **Changed 2026-10-31 (S5, answer 3a):** no push by itself; the prep's Notification card, like any item. |
| Goal review date reached | ✅ At the morning summary's time, even with the summary off; once only (owner, 2026-11-01, S6). |
| Goal completed / target hit | ✅ In-app celebration only, no push. Plays on a goal review saved with "Yes" (renew, maintenance or close) and on "Close it out" (owner, 2026-11-01, S6). |
| Test notification | ✅ Developer mode only (the owner). |
| Misses logging (evening) | ❌ Skipped for now. |
| Goal status change | ❌ Shown in Review. |
| Sync | ❌ In-app only. |
| Release notes | ❌ In-app only. |
| Plan tomorrow | ❌ |
| Stalled project | ❌ Already in Review. |

The owner's top three: custom reminder, due date, review ready.

**Daily limits:** pushes **the app starts by itself** (morning summary, weekly review, goal review
date) are **at most 3 a day**. Pushes the user asked for (reminders set on a Notification card; before
2026-10-31 also timed due dates and preps with a time) **always go out**, merged when close together. A server-side **safety fuse of 20 a day**
catches bugs. A time the user set on a task or prep counts as "asked for" (confirmed).

### Notification wording (picked in S0, 2026-10-21)

Picked from the [notifications mockup](mockups/notifications.html) (artifact:
[Smart Meta Notifications](https://claude.ai/artifact/AkC6PcpN3kvGXDBSi54c87)). Every push has the app's
icon and name; the title is one line on the lock screen (cut with "…"), the body up to four lines.

| Type | Pick | Title | Body |
|---|---|---|---|
| Morning summary | A, **changed 2026-10-31** | "Today: 6 things" / "Hoje: 6 itens" | How many of each kind, none left out: "Tasks: 5, Commitments: 1" / "Tarefas: 5, Compromissos: 1" (owner's idea after testing). ~~At most 3 names, timed first: "Dentist appointment at 14:30, Renew gym membership (late), Gym and 3 more"~~ |
| Due at a time | A | The item's name | Single: replaced on 2026-10-31 by the task reminder text below ("Today, 14:30"), since items no longer push at their time by themselves. ~~**Merged** (within N-10): "2 things at 11:00"~~: dropped 2026-10-31, each reminder is its own push (owner) |
| Custom reminder | C, adjusted; **changed in S5 (2026-10-31)** | The item's name | **Task and project** (S5 pick A, times only): only when it's due, said from the day the push arrives: "Today, 14:30" / "Hoje, 14:30", "Tomorrow, 23:35" / "Amanhã, 23:35", the weekday within a week ("Thursday, 14:30" / "Quinta-feira, 14:30"), then the date ("June 1" / "1 de junho"); no time, the day alone ("Tomorrow"). **Project step** (owner's text): "CV & LinkedIn · step 1 of 4" / "Currículo e LinkedIn · etapa 1 de 4". **Prep:** the "Prep with a time" text below. ~~Goal item (habit)~~: not used while commitments have no reminder ("Exercise regularly · 1 of 3 this week", kept for later) |
| Weekly review | B | "Weekly review" / "Revisão da semana" | "Look back at last week and plan this one." / "Confira a semana passada e planeje esta." Same text every week, no numbers |
| Prep with a time | A | The prep | "Prep · Exercise regularly" / "Preparo · Fazer exercício com frequência" |
| Goal review date | B | "Review date reached" / "Chegou a data de revisão" | The goal's name |

| New access request (owner only, S5) | Owner, 2026-10-31 | "New request" / "Novo pedido" | The email ("ana.souza@gmail.com"). Tapping it opens Requests |

Settled in S5 (2026-10-31): a prep's reminder keeps the prep text, a project's uses the task text, and a
task with no due date can't have a reminder (the Notification card needs a date).

### Sign-in flow (picked in S0, 2026-10-23)

Picked from the [sign-in mockup](mockups/sign-in.html) (artifact:
[Smart Meta Sign-in](https://claude.ai/artifact/9PVnMWvUbiqxLbjPRZzqnf)), which now shows only the
picked flow. Style: **full screens like the intro** (option B) with the bar's title ("Sign in", "Your
data") on the sign-in and data steps; the "Not now" popup is an iOS action sheet; "You're in" is only a
toast on Today; Requests is a Settings-style list. Numbers are the owner's screen numbers.

| # | Screen | Wording (EN / PT) |
|---|---|---|
| 1 | **Activate notifications**, full screen right after "Not only goals", bell icon | "Activate notifications" / "Ative as notificações"; "Sign in with your email to back up your goals and get reminders."; above the button "Your goals are end-to-end encrypted." / "Suas metas são criptografadas de ponta a ponta."; "Continue with email", "Not now" |
| 1 | **Banner on Today** until the person syncs: cloud icon, no subtitle | "Sync and get notifications" / "Sincronize e receba notificações". **Tapping** opens the email step (screen 3; screen 12 in Safari). **Swipe left** uncovers a grey "Hide" pill (like deleting a task). Hidden, it comes back after **a day**, then **a week**, then **a month**, then never (Settings still offers sign-in) |
| 2 | "Not now": action sheet over screen 1 | "Continue without an account?"; "You get no reminders and no backup. You can sign in later in Settings." / "Você fica sem lembretes e sem backup. Pode entrar depois em Ajustes."; Sign in, Continue without an account, Cancel |
| 12 | **In Safari on iPhone**, instead of screen 3 | "Sign in from the app"; "Open Smart Meta from your Home Screen to sign in there."; a card with 1 Tap Share (with the share icon), 2 Add to Home Screen, 3 Open Smart Meta and sign in |
| 3 | Email, bar "Sign in" | Title only: "What's your email?"; "Send code" |
| 4 | Code, bar "Sign in" | "Enter the code"; sent to + check spam; iOS offers the code from Mail; resend timer; "Use a different email" |
| 5 | Face ID, bar "Your data" | "Lock your data with Face ID"; "Face ID keeps your goals encrypted when they sync. Without it, they can't be synced safely." (Claude's wording for the owner's idea); "Face ID isn't working?" |
| 6 | iOS passkey sheet | Drawn by iOS |
| 7 | Data password, bar "Your data" | "Couldn't use Face ID. Set up a password with your password manager to encrypt your data."; email field above the password field; no warning line |
| 8 | Waiting for access | "Smart Meta is invite-only for now. We'll let you know when you're accepted."; above the button "Meanwhile you can still use the app."; "Go to Today". Approval then shows only screen 10 |
| 9 | List is full | "Smart Meta is invite-only for now. You're on the waiting list and get in when a spot opens."; same line and button as 8 |
| 10 | You're in | Toast on Today: "You're in. Your goals are backed up." |
| 11 | New phone | "Use Face ID to open your goals. Your passkey came along with your iCloud Keychain." |
| 13 | Requests (owner) | Settings style; "Approving lets them sync and turn on reminders." |

### UI decisions

- **No bell icon, no inbox.** Today is the inbox; any history stays on the server.
- **Settings → Notifications** with a toggle per type, plus morning summary time and weekdays-only.
  **Picked in S0 (2026-10-29), layout A:** one page, rows without subtitles. "What you get": Morning
  summary, Items with a time, Reminders you set, Preps with a time, Weekly review, Goal review dates.
  **Changed in S5 (2026-10-31):** "Items with a time" and "Preps with a time" are gone (answers 1a and
  3a), and an open picker gets a line under it too (the owner asked for one under "Weekdays only").
  The Notifications row is the first row of Settings → App, above Language (S5 answer 6a). After the
  owner's test (2026-10-31): "Reminders you set" is "Reminders" / "Lembretes", and the line under
  "Weekdays only" is gone.
  "On this phone": App icon badge, Details on the lock screen, Quiet hours. "Developer": Send a test
  notification. **Switches with options work like Quick Add:** turning one on opens its options under
  the row (summary: time wheel and Weekdays only; weekly review: time; quiet hours: from and to); its
  value shows in blue under the label ("8:00, weekdays only", "Monday, 8:00", "22:00 to 7:00"), and
  tapping the label opens or closes the options. No status section and no "one phone" note. Not
  allowed yet: a "Turn on notifications" card like the sync banner (not dismissable), switches greyed
  behind it; tapping it asks iOS. Turned off in iPhone Settings: a card with the four steps to turn
  them back on. No account: a "Sign in to get notifications" card like the sync banner, opening the
  email step. Mockup: [notification settings](mockups/notification-settings.html), artifact
  [Smart Meta Notification Settings](https://claude.ai/artifact/4gN8wJzt7pzg5sXiKGzXTU).
- **App icon badge:** toggle, **off by default**, counts **late + left today**. **Review not included.**
- **Lock-screen details:** shown by default, can be turned off. Off, a push says only its kind: "Reminder",
  "Morning summary", "Weekly review", "Goal review date" (S6 pick B).
- **Quiet hours:** available, off by default. **Everything waits** until they end, reminders too (owner, S6).
- **The "On this phone" rows follow the account** (owner, S6): any phone can plan the pushes, so per-phone
  values would overwrite each other's plan. The section is "How they arrive" / "Como chegam".
- **Deep links:** tapping opens that task, goal or project.
- **Cancel on done.** **No snooze.** **Time zone** stored with the plan. **Language** from app settings.
- **Denied permission:** instructions to turn it back on.
- **Diagnostics are logs, not a row** (owner, 2026-10-29): permission, subscription and delivery results
  go to the send log and the subscription row (spec NO-23); users don't see them.

---

## 3. Infrastructure and costs

### 3.1 Limits (checked 2026-10-21)

**Supabase** ([pricing](https://supabase.com/pricing),
[database size](https://supabase.com/docs/guides/platform/database-size)):

| | Free | Pro ($25/month) |
|---|---|---|
| Database | **500 MB**; above it the project goes **read-only** | 8 GB, then $0.125/GB |
| Egress | 5 GB / month | 250 GB, then $0.09/GB |
| File storage | 1 GB | 100 GB |
| Monthly active users | 50,000 | 100,000 |
| Edge Function calls | 500,000 / month | 2 million |
| Backups | **None** | Daily, 7 days |
| Pausing | After 1 week with no activity | Never |
| Billing | Can't be charged; limits restrict the project | Spend cap on by default |
| Projects | 2 active free projects | |

**Vercel Hobby** ([limits](https://vercel.com/docs/limits/fair-use-guidelines),
[analytics](https://vercel.com/docs/analytics/limits-and-pricing)): 100 GB transfer, 1M function
calls, **50,000 Web Analytics events / month** (collection pauses; never billed). Non-commercial use
only. Hobby cron runs at most once a day, so it's **not usable for reminders**.

**Others:** Cloudflare Turnstile: free. Resend free: 3,000 emails/month, needs a domain. Cloudflare D1
free: 5 GB, 5M rows read/day, 100k written/day. GitHub Free private repos: 2,000 Actions minutes and
500 MB artifact storage a month.

### 3.2 What it will cost

At 50 to 200 users: **$0**. Heavy use is about 0.6 to 0.7 MB per user per year, so 200 heavy users fill
about 140 MB a year; starting from 25.8 MB, 500 MB lasts a few years. Encryption (§7) makes records
somewhat bigger (base64 ciphertext, about +35%); the simulator's bloat factor covers it.

The **simulator** is a private artifact: [Smart Meta Runway](https://claude.ai/artifact/6xvMmYEUDBiKkGsgkfLWhq).
Inputs: users now and later, years, records per user per year, pushes, backup schedule, real database
size.

**Hidden cost: backups count as egress.** A full dump reads the whole database out of Supabase. A full
dump every night of a 200 MB database is 6 GB a month, over the free 5 GB by itself. Hence §10's
schedule.

### 3.3 Watching usage

- **Supabase → Organization → Usage**: database size, egress, monthly users.
- **Vercel → Usage**; Vercel emails near limits. Hobby is never billed.
- **Our alarm, free:** the backup job runs a few SQL queries (database size, rows per user, pushes sent
  per day, members and waiting users). It **fails on purpose** past 60% (300 MB), on a user with an
  unusual number of rows, or on a jump in pushes. GitHub emails the owner.

### 3.4 When the free tier runs out

1. **Alarm at 60%.** Time to act.
2. **Trim:** delete old tombstones (`deleted = true`, older than 90 days), prune revision history,
   `VACUUM`, cap rows per user, close the waitlist, compact quick undos (§3.5).
3. **Friends chip in for Pro** ($25/month, about R$7 each for 20 people).
4. **Plan B, still free:** move the data to **Cloudflare D1** (5 GB) behind a small Worker; keep
   Supabase only for sign-in, so nobody signs in again. A new `SyncTarget`; about 1 to 2 weeks.
   Encrypted data moves as-is.

### 3.5 Check-ins and toggling (owner's worry)

How it works today (checked in [src/db/repo.ts](../../src/db/repo.ts)): records are **append-only**.
Checking adds an entry; unchecking adds a **second** entry (`outcome: 'void'`) that cancels the first
("Undo never deletes"). Correcting a value adds a new entry that supersedes the old one. Goal History
shows undone check-ins as struck-through rows ([src/lib/history.ts](../../src/lib/history.ts)).

So toggling a checkbox on and off 5 times adds 10 rows. One person doing 5 extra toggles a day adds
about 1 MB a year, roughly doubling heavy use. Fixes, in order:

1. **Quick undo erases instead of appending (decided: 30 minutes):** if a check-in is undone within
   30 minutes (a misclick or a change of mind), it becomes a tombstone (one empty row, purged after 90
   days) instead of gaining a second "void" row (built in S4; a full erase could bring a check-in that
   already synced back on the next pull). Older undos keep today's behavior, so History still shows real
   "undone" events. Misclicks no longer appear struck through in History.
2. **Server limits per user** against bugs, scripts and stolen accounts (confirmed by the owner;
   the numbers live in [spec Adjustable numbers](spec.md#adjustable-numbers), N-2 to N-5). A **row** is one saved
   record: a check-in, a task, a goal, a review. Editing a record doesn't add a row; it changes the
   same one. For scale, a heavy user adds about **1,200 rows a year**, about 3 to 30 on a busy day.
   - **Total: at most 30,000 rows per user** (about 25 years of heavy use, about 25 MB at worst).
     It keeps one runaway account to about 25 MB. Several accounts at the limit could still fill
     the 500 MB, which is what the 60% alarm is for.
   - **Burst: at most 5,000 new rows per user per day.** High on purpose, because two legitimate
     moments upload a lot at once: the first upload after approval (months of local use) and the
     encryption migration (which re-uploads everything). A bug or script stops there.
   - **Planned notifications:** at most 300 pending rows per user.
   - Hitting a limit never loses data: the rows stay on the phone, sync reports an error, and the
     alarm tells the owner.
3. **Purge old tombstones** (deleted rows older than 90 days, once every device has synced).
4. Sync already waits 1.5 s after a write and sends each record once per batch, so fast toggles don't
   multiply network calls; they only multiply rows, which 1 and 2 address.

---

## 4. Architecture: the app plans, the server delivers

### 4.1 Pieces

- **Planner (on the phone, pure TypeScript):** after each sync pull, computes every notification for the
  next **14 days** from local data and the settings, reusing `today.ts` and `review.ts`.
- **`scheduled_notifications`:** one row per planned push: `user_id, id, fire_at, payload, sent_at,
  status`. **Deterministic ids** (`due:<taskId>:<fireAt>`) so replanning updates instead of
  duplicating, from any device. With encryption (§7), `payload` is **already encrypted by the phone**
  for that device's subscription; the server can't read it.
- **Upload only the difference** (hash the plan).
- **`push_subscriptions`:** one row per user: endpoint, keys, time zone, last success, last error.
- **Dispatcher:** `pg_cron` every minute calls a `dispatch` Edge Function (secret header, so nobody
  else can trigger it). Sends due rows, marks them, deletes dead subscriptions.

### 4.2 Cost of planning

Planning runs **on the phone** (milliseconds, the same kind of work Today does). Replan only when
something relevant changes (notification data, settings, the date, the time zone). The server does a
tiny query each minute plus a few HTTP calls.

### 4.3 Trade-offs

- An offline "done" can't cancel its push until the phone syncs. Accepted.
- Nobody opens the app for 14 days → notifications stop at the horizon. Arguably right.
- Plans always happen after a pull, so they use the newest data from any device.
- With encrypted payloads, the server can't merge or rewrite pushes; all merging happens in the
  planner.

### 4.4 Safeguards (notifications can't be wrong)

1. **Planner unit tests:** time zones, daylight saving and travel, midnight, all-day vs timed, done,
   deleted, paused projects, goals in the backlog, language.
2. **Drop stale pushes:** a push more than **15 minutes** late (owner's choice, for every type) is
   marked `skipped`, never sent late. **Normally it arrives on time:** the dispatcher runs every
   minute, so a 9:00 reminder leaves between 9:00 and 9:01; Apple delivers in seconds; Android may
   hold it a few minutes in battery saving, which the `Urgency: high` header reduces. The 15 minutes
   only covers outages.
3. **Fuse:** at most 20 pushes per user per day, logged.
4. **Server checks** on every planned row: `fire_at` within 15 days, payload byte size, at most N
   pending rows per user.
5. **Kill switch:** one setting stops all sending.
6. **Shadow week** before friends: the dispatcher logs what it would send, nothing is sent.
7. **Send log** (`sent`, `skipped`, `failed`, reason), 30 days, no content.

---

## 5. Web push facts

**Flow.** The user taps "Turn on notifications"; the browser creates a *subscription* (an endpoint at
Apple/Google/Mozilla plus keys `p256dh` and `auth`); the app saves it. To notify, a payload encrypted
with those keys (RFC 8291) is POSTed to the endpoint with a **VAPID** signature. The service worker
shows it.

| | iPhone | Android |
|---|---|---|
| Minimum | iOS 16.4 | Chrome, Samsung Internet, Firefox |
| Must be on the Home Screen | **Yes** | No, but recommended |
| Permission prompt | Only after a tap, in the installed app | After a tap |
| Numeric badge | Yes | Launcher-dependent, often a dot |
| Silent push | **Not allowed** (must show a notification) | Allowed, but don't |

- **No offline scheduled notifications.** Every reminder comes from the server.
- **Payload size:** RFC 8030 §7.2: push services must accept **4,096 bytes or less**; about 3,900 bytes
  of content after encryption. We cut text short. Oversize rows are rejected.
- **Exploits:** only someone with a subscription **and** the **VAPID private key** can send. A leaked
  VAPID key would let someone send phishing pushes to everyone, so it lives only in Supabase Edge
  Function secrets. Deep links are relative paths only.
- **Expired subscriptions:** the push service answers 404/410 → the server deletes the row. Each app
  open checks the subscription and quietly re-subscribes if needed.
- **Revoked permission** (Chrome can do it; users can): pushes stop; the app shows "Notifications are
  off" with instructions; if the state is back to `default`, one tap asks again.
- **Grouping:** iPhone stacks notifications from one app; Android bundles them. Each reminder is its own
  push (owner, 2026-10-31), so the phone's stack does the grouping; the planner no longer merges items close
  in time ("3 things at 9:00").
- **Badge can be stale:** no silent pushes on iPhone, so the number updates only on app open or with
  a real push.
- **Measured in S1 (2026-10-29):** pushes from a local script reached the installed app in about
  **5 seconds** on iPhone (Apple) and **5 to 7 seconds** on Android (FCM). A VAPID subject of
  `https://smart-meta-h2ur.vercel.app` is accepted by Apple.
- **Tapping a push on Android:** the service worker must call `clients.openWindow()` or `focus()`
  **first**, while the tap still allows it, and do any other work (logging, storage) after. The first
  S1 version logged first and Android didn't open the app; iPhone didn't mind.
- **No banner on Android is a phone setting:** whether a push pops up over the screen depends on the
  phone's per-app and system settings (Samsung's "Brief" vs "Detailed" pop-up style, "Pop on screen"
  per app). On the owner's Android no app showed banners, email included. The site can't change it;
  Settings → Notifications on Android should mention where to turn it on (S5).

---

## 6. Accounts

### 6.1 The whole sign-up and sign-in flow

Sign-up and sign-in are **the same screen**: the user types an email and gets a code. If the email has
no account yet, Supabase creates one; that is the sign-up.

1. Onboarding as today → the user creates their **first goal**.
2. After the last onboarding screen ("Not only goals"): a full screen, "Activate notifications", with
   "Continue with email" or "Not now" (popup: no reminders and no backup without an account). Until the
   person syncs, Today shows a **"Sync and get notifications" banner** they can swipe away. Screens and
   wording: §2 "Sign-in flow".
3. **Captcha** (Cloudflare Turnstile, usually invisible) checks it's a person.
4. Supabase sends a **6-digit code** from the app's Gmail account. The user types it in the app (no
   link, so nothing opens Safari).
5. New account → **set up the passkey** (Face ID) that protects their data (§7). Existing account on a
   new phone → unlock with the passkey.
6. The app checks **membership** (a `members` table only the owner can write):
   - **Not a member** → **"Waiting for access"** screen. The app keeps working on the phone; nothing
     is stored on the server. The owner gets a push: "New request", with the email as its body (S5). If there are already 100
     members: "The list is full for now", still waiting.
   - **Member** → sync starts; notifications can be turned on.
7. **The owner approves with one tap:** the "New request" push opens a **Requests** list in Developer
   mode showing each email with an **Approve** button. Behind it, a database function checks that the
   caller is the owner, adds the person to `members` and refuses past the cap of 100. Until that
   screen exists (it comes in S2), approving means adding a row in the Supabase dashboard, about a
   minute.
8. On the next open, the app notices, uploads everything, and says "You're in".

What protects what:
- **Captcha + rate limits** stop bots from making the app send emails (which would burn the Gmail
  limit and get the account flagged).
- **Row-level security with the `members` check** stops non-members from reading or writing anything.
  Strangers cost nothing.
- The existing accounts (owner and current friends) are added to `members` in the migration.

### 6.2 Sign-in method and email sender

- **Method:** email + 6-digit code (Supabase email OTP). Typed in the app, so it works in the installed
  iPhone app. **No Google** for now: in the installed iPhone app it often finishes in a Safari window
  and the app stays signed out
  ([report](https://github.com/warren-wyn-dev/wynteam/pull/663),
  [Apple forum](https://developer.apple.com/forums/thread/649699)). Can be revisited later.
- **Sender:** a **new Gmail account just for the app** (for example "Smart Meta"), with 2-Step
  Verification and an **app password**, configured as Supabase's custom SMTP. Free, no domain, about
  500 emails a day.
  - Deliverability: Gmail-to-Gmail is reliable; other providers are usually fine at this volume.
  - Spam or phishing risk: low. The email is short ("Your Smart Meta code: 123456"), in the user's
    language, and friends expect it. A brand-new account that suddenly sends many identical emails can
    be flagged or locked by Google; the captcha and low volume keep it calm.
  - Why not send "from a Gmail address" through Resend or Brevo: Gmail's anti-spoofing rules make such
    mail land in spam. Sending through Gmail's own servers avoids that.
  - Later, with a domain, Resend is the cleaner option.
  - The owner creates the account and pastes the app password straight into Supabase. Never in chat or
    the repo.
- Supabase's built-in email can't be used (it only sends to the project's team, about 2 an hour).

### 6.3 Password accounts (the "backup" question)

Today the owner creates email + password accounts by hand. Options once email codes work:

| | Keep passwords as a fallback | Drop them (recommended) |
|---|---|---|
| Pro | A way in if the code email lands in spam | One sign-in path; nothing to forget; less code |
| Con | **The owner chose those passwords**, so the owner could sign in as that friend; contradicts §0.1. Resets need email anyway | If email fails, the user waits or checks spam |

**Decided: drop the password accounts the owner made**; everyone, the owner included, signs in with
email codes. (Not to be confused with the optional *data password* in §7.2, which the user's own
password manager creates and the owner never sees.)

### 6.4 Profile and avatars

- **Name** (editable).
- **Built-in avatars**, no photo uploads for now, with **many options** so friends are easy to tell
  apart. **Picked in S0 (2026-10-29), style C:** a circle with **any emoji** on one of Apple's 12
  system colors (the values' palette), a **look** (gradient, solid or soft) and a light **pattern**
  (none, dots, stripes, grid, waves, sunburst). **No ring, no initials.** The editor ("Name and avatar"
  in Settings) has a field that takes any emoji from the emoji keyboard, plus 30 suggestions. Stored as
  `{ emoji, color, look, pattern }`, about 60 bytes, so **no storage worry**. The server checks it
  like any input (§8.5): the emoji is one grapheme that is a pictograph or flag, the rest come from
  fixed lists. Mockup: [avatars](mockups/avatars.html), artifact
  [Smart Meta Avatars](https://claude.ai/artifact/Hoae5axi2rXjnCm2a97XCm).
- **Mockups first** for the owner to pick a style (§12): done.
- The profile lives in its own table, separate from data, ready for social features.
- **Name and avatar are visible to the owner** (decided), like the email.

### 6.5 Onboarding

1. Tutorial as today, including the install screen.
2. First goal.
3. "Activate notifications" (after "Not only goals") → email code → passkey → waiting or in.
4. Notifications permission asked later, at a useful moment (first time a time or reminder is set, or
   from Settings).
5. In Safari on iPhone (not installed), "Continue with email" opens "Sign in from the app" instead of the
   email step: open Smart Meta from the Home Screen (push only works there, and Safari and the Home
   Screen app keep separate data).

### 6.6 Recovery after losing the phone

New phone → install → email code → **Face ID with the passkey** (synced by iCloud Keychain or Google
Password Manager) → data unlocks and syncs back. Only as safe as the backups (§10).

### 6.7 Delete account

Settings → Delete account → confirm → an Edge Function deletes the Supabase user; `on delete cascade`
removes records, keys, subscriptions, planned pushes and the profile. The phone wipes itself.

### 6.8 One person per phone, nobody loses data

- The phone remembers its **owner** (user id) in the local `meta` table.
- Signing in with local data that has no owner → it becomes this account's and uploads (normal
  onboarding).
- **Sign-out** only when online with the outbox empty; offers a JSON export first; then the phone is
  wiped (data safe on the server).
- Local data belonging to someone else → **sign-in refused** until that person signs in and syncs, or
  an automatic JSON export is saved first. Two people's data are never merged.
- The outbox drains only for the owner it was written under.

### 6.9 Several devices and sync conflicts

Allowing several devices is cheap (blocking would cost more and hurt recovery).
- **Push** goes to one device: turning notifications on somewhere replaces the previous subscription.
- **Sync conflicts:** today each record is last-write-wins by `updatedAt`. A conflict only happens when
  the **same item** is edited on two devices before either syncs; the later edit wins and the other is
  lost. For one person this is rare, and check-ins are mostly new rows, not edits.
- Planned improvements, cheap to expensive:
  1. **Clock guard:** `updatedAt` comes from the phone's clock, so a phone with a wrong clock could
     always win. The server rejects timestamps far in the future.
  2. **Sync on open and before planning** (already mostly true), so edits rarely overlap.
  3. **Field-level merge** (each field keeps its own timestamp), so edits to different fields of the
     same item both survive. More work; only if real conflicts show up.
- Encryption doesn't change this: the server compares timestamps, not content.
- **Not synced yet indicator** (owner's idea, like Google Docs): when there are changes the server
  hasn't received (offline, or sync failing), a small quiet status shows "Not synced yet", for example
  near the screen title or in a toast after an edit made offline, and clears once sync catches up.
  Settings already shows pending changes. Mockup first; keep it subtle (few badges).
  **Picked in S0 (2026-10-29), option A:** at the right end of Today's date line ("21 October · 3
  items"), a small cloud and "Not synced yet" (grey, offline) or "Couldn't sync" (orange, server
  failing); a brief "Synced" only when coming back from offline or a failing server, not after every
  normal sync. Nothing shows during the normal 2-second wait (N-15), so it never flickers.
  **Settings → Sync** gets shorter: the "Synced" row shows only the last sync time and a status icon
  (synced, syncing, offline, failing); tapping the icon explains: "Everything is synced"; offline "1
  change waiting. You're offline. It syncs automatically when you're back online."; failing "Couldn't
  sync 1 change. Trying again soon." Mockup: [not synced](mockups/not-synced.html), artifact
  [Smart Meta Sync Status](https://claude.ai/artifact/2HvhRdmFx4b1cyUEH565is).
- The owner's rule: **the user must never lose data.** Every conflict keeps the newest version, the
  phone never deletes local data on its own, and backups cover the rest.

### 6.10 When sync runs

Today ([src/sync/controller.ts](../../src/sync/controller.ts)): **1.5 seconds after a change**
(debounced, so a burst of taps becomes one sync), when the app becomes visible, when the connection
returns, and every 5 minutes.

**Does it need to run on every action?** Not one sync per tap, but **soon after changes, yes**:
- **Notifications depend on it.** "Cancel on done" only works once the server knows. Mark a 9:00 task
  done at 8:55 and keep the app open: if sync waited for the app to close, the push would still fire.
- **Other devices** see changes sooner, and data is off the phone sooner if the phone breaks.
- **Cost is not a concern:** Supabase doesn't limit API requests, and each sync is a few small
  requests.

**Is "sync only when the app closes" a good idea?** No, as the only trigger:
- On iPhone, "closing" isn't reliable. When the user leaves the app, iOS suspends it within seconds;
  swiping it away from the app switcher later sends **no event at all**. A sync started at that moment
  often never finishes.
- Notifications would be wrong in the meantime (above).

**But flushing when leaving is a good addition.** The plan:
1. **After changes:** keep the debounce, about **2 seconds**, with a cap of about **10 seconds**
   during continuous editing (so a long session still syncs).
2. **When the app goes to the background** (`visibilitychange` → hidden): push pending changes
   immediately, with `keepalive` requests that the browser may finish after the page is hidden.
   Small batches only (browsers cap `keepalive` bodies at about 64 KB).
3. **On open, on reconnect,** as today. The 5-minute timer only while the app is visible.
4. **Android bonus:** Background Sync lets Chrome send offline edits later even with the app closed.
   iPhone doesn't support it.
5. **Plan notifications after each successful pull**, so plans always use the newest data.
6. The **"Not synced yet"** indicator (§6.9) shows whenever changes are still pending.

---

## 7. Privacy: the owner must not see user data

### 7.1 Why the owner can see everything today

Row-level security limits what **users** see through the API. The project owner (dashboard,
service-role key) bypasses it and can read every row, every backup and every planned notification.
Policies and promises can't change that; only **end-to-end encryption** does: data is encrypted on the
phone with a key the server never has, so the server (and the owner) only stores unreadable bytes.

### 7.2 The simplest version where users don't manage a key

**The key lives in the user's passkey.** A passkey is what Face ID / Touch ID sign-ins use. Apple
syncs it through **iCloud Keychain** and Google through **Google Password Manager**, so it follows the
user to a new phone, and they never see or keep a key. Passkeys have a feature called **PRF** that
gives the app a secret only that passkey can produce: the app's encryption key comes from it.

- **iPhone:** supported on iOS/Safari 18 and later with iCloud Keychain (bugs in 18.0 to 18.3; 18.4+
  fine) ([WebKit](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/),
  [guide](https://www.corbado.com/blog/passkeys-prf-webauthn)).
- **Android:** supported by Chrome with Google Password Manager passkeys (verify on a device).
- **Inside the installed Home Screen app: works** (S1 spike, 2026-10-29). iPhone on iOS 26.6 (Safari
  26.6, iCloud Keychain on) and Android 10 (Chrome 156, Google Password Manager): PRF is returned already
  at creation, and every unlock gives the same secret, including after fully closing the app and when
  the user picks the passkey from a list. Details in §14 S1.

How it works:
1. On first sign-in the phone generates a random **data key** and encrypts every record with it
   (AES-GCM, built into browsers).
2. The data key is stored on the server **locked by the passkey's PRF secret**. Unreadable without the
   user's Face ID.
3. A new phone: email code → Face ID → the passkey unlocks the data key → data decrypts.
4. Encryption sits **inside the sync layer only**, as a wrapper around the Supabase target. The phone
   keeps plain data locally as today; the rest of the app doesn't change.

**When the passkey is used:**
- **Once when the account is created** (Face ID makes the passkey).
- **Once on each new phone, or after signing out** (Face ID unlocks the data key).
- **Never in daily use:** after unlocking, the phone keeps the data key in its own storage, marked so
  it can't be copied out, and opening the app asks nothing.

**What it's linked to:** the passkey belongs to the user's **Apple ID** (iCloud Keychain) or **Google
account** (Google Password Manager), **not to the phone**. Every device signed in to that account has
it.

**Losing the phone:** on a new iPhone signed in to the same Apple ID, the passkey is already there.
Install, email code, Face ID, and the data is back.

**Does everyone have iCloud Keychain?** Most iPhone users signed in to iCloud do (iPhone setup turns it
on), but not all: some turn it off, some use another password manager (Google, 1Password). Android
uses Google Password Manager by default. The app checks during setup and falls back when needed.

**If Face ID / passkeys don't work in the installed web app** (or the user has no synced keychain),
the options, in order of preference:

1. **A data password saved by the password manager.** On the setup screen, Safari (or Chrome) offers a
   strong generated password and saves it in iCloud Keychain or Google Password Manager. The data key
   is derived from it. On a new phone, autofill fills it; the user never types or remembers it. Sign-in
   itself stays the email code. If the user refuses to save it, they'd have to remember it, which is
   the "responsible for a key" case, so the app insists on saving and explains why.
   **S1 found it works but is rough** (build these in S3): on Android autofill didn't offer the password
   by itself (the owner had to tap the key icon and pick it); on iPhone the first run failed twice
   after one good unlock, with only one saved entry, so autofill apparently filled a different value
   than the one used to lock. Guards: say "tap the key icon" on the unlock screen; put the email in a
   `username` field above the password so the manager matches the entry; and **right after saving,
   ask for the password again by autofill and only lock data once it matches**.
2. **Move from the old phone:** the old phone shows a code or QR that the new phone scans to receive the
   key. Works only while the old phone still exists; useful as an extra, not alone.
3. **A recovery code** to keep somewhere: optional extra only, never required.

**Is there another solution?** Every end-to-end encrypted product faces the same three-way limit:
*the operator can't read it*, *the user keeps no key*, and *recovery after losing every device*. The
only way to get all three is to lean on Apple's or Google's synced keychain, as WhatsApp's encrypted
backups do. Anything else either lets the operator read (key on the server) or puts the key on the
user.

What could still go wrong, and the answer:
- **iCloud Keychain off** → the passkey stays on that phone only; losing the phone loses the server
  copy. The app checks and explains. Optional extra: a second passkey on another device, or an
  optional recovery code (offered, never required).
- **User loses their Apple/Google account entirely** → the server copy is unreadable (as with
  WhatsApp's encrypted backups). The phone's local copy and JSON export still exist.
- **A bug in encryption could make data unreadable** → the biggest new risk. Answers: tests first,
  local data stays plain on the phone, JSON export stays plain, and the data key is locked twice
  (passkey + optional second passkey).

### 7.3 What the owner can still see (accepted)

- **Email**, **name and avatar** (needed to send codes and approve people).
- **Metadata:** how many records each user has, of which type, when they change, sizes, and when
  pushes are scheduled. Not what they say.

The owner accepted both on 2026-10-21. **Encryption is decided**, pending only the iPhone test that
picks passkey or data password.

### 7.4 Encrypted notifications (the trade-off the owner asked for)

If records are encrypted, planned notifications **must** be encrypted too, or their text ("Call the
doctor at 9:00") would sit readable in `scheduled_notifications`. The phone encrypts each push
**itself** for its own subscription (it knows the subscription's public keys), so the server only adds
the VAPID signature and forwards bytes.

| | Encrypt on the phone | Leave readable on the server |
|---|---|---|
| Privacy | The owner can't read pushes | The owner can read every planned push |
| Work | About 1 to 2 days (standard RFC 8291, browser crypto) plus tests | None |
| Debugging | Harder: logs show only that a push was sent, not what | Easy |
| Flexibility | The server can't merge or edit; the planner does everything (already planned) | The server could edit |
| Fit with §0.1 | ✅ Required | ❌ Breaks it |

Conclusion: with the owner's privacy requirement, it isn't optional. It comes in S5 together with
push.

### 7.5 Encryption and social features (correction)

Earlier Claude said encryption "conflicts" with social features. That was too strong: **it makes them
harder, not impossible.** Signal, WhatsApp and Proton are encrypted end to end and social. How sharing
works with encryption:
- Each user also gets a **key pair**: a public key others can see, a private key locked like the data
  key.
- To share an entry with Ana, the phone encrypts it with a new **share key** and locks that share key
  with **Ana's public key**. Only Ana's phone can open it. The server only carries bytes.
- What's harder: un-sharing (needs a new key), edits to shared items (re-encrypt for each friend),
  shared projects with several people, and no server-side features on shared content (search,
  previews).
- To keep the door open, the encryption stage creates the key pair from day one (cheap).
- **Owner's decision:** social features come later; keep the path clear now (key pair, profiles in
  their own table, stable ids) without building any of it.

---

## 8. Security

### 8.1 RLS

**Row-level security** is a Postgres feature: rules on each table say which rows a signed-in user may
read or change, checked by the database on every query. The app's connection key is public by design,
so anyone can send queries; RLS is what stops them reading others' rows. A table without RLS is open to
the internet; most Supabase leaks come from that.

### 8.2 The Supabase email (change on 2026-10-30)

New tables in `public` are **not reachable through the API until granted explicitly**
([changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).
`records` keeps its grants, and `0001` already grants explicitly. **Every new migration** (members,
profiles, keys, push_subscriptions, scheduled_notifications, send log) must enable RLS, add policies,
grant to `authenticated` only what the app needs, grant to `service_role` where Edge Functions use the
table through supabase-js, and **never grant to `anon`**. Check Supabase's Security Advisor after each
migration.

### 8.3 Realistic threat model

Assume bad actors exist and know everything public:
- **Bots scan every Supabase project and site constantly**, trying the public key on every table,
  sign-up endpoints and known mistakes.
- **The code, the connection key and this repo are public.** Design so knowing them doesn't help.
- **A friend's email account gets stolen** → the attacker can get codes and sign in as them. With
  encryption they still need the passkey (Face ID) to read data. They could still delete that user's
  server data → backups.
- **A curious member** calls the API directly with their own token.
- **The most likely damage is our own mistake:** a table without RLS, a key committed by accident, a
  sync or encryption bug that destroys data, a planner bug that spams.

| Threat | Effect | Mitigation |
|---|---|---|
| Read others' data | Privacy breach | RLS everywhere + tests that B can't read A + Security Advisor; and data is encrypted anyway |
| Fill the database with junk | Read-only mode, outage | Only members write; size limit on `data` (for example 64 KB); row cap per user; alarm |
| Make us send emails (code spam) | Gmail account flagged, sign-in breaks | Turnstile captcha; Supabase rate limits |
| Spam pushes | Annoyed users, Apple revokes | Server checks + 20/day fuse; one subscription per user |
| Hammer the API | Free limits hit, outage | Rate limits; non-members can't write; Vercel CDN |
| Steal sessions (XSS) | Account takeover | Never render user text as HTML; Content-Security-Policy; few dependencies |
| Leaked service-role or VAPID key | Database access, phishing pushes | Only in Supabase secrets; never `VITE_`; GitHub secret scanning; rotate |
| Bug wipes data | Data loss | Backups with restore tests; tombstones, not hard deletes; staged rollout |

**Money:** on Free and Hobby an attack can't produce a bill; worst case is an outage or read-only mode.

### 8.4 Sign-up abuse options (chosen: 3 + 4 + 5)

1. Closed (today): only the owner creates accounts.
2. Allowlist: only listed emails can sign up.
3. **Open + approval:** anyone signs up, only members can write.
4. **Captcha:** Cloudflare Turnstile, free, built into Supabase Auth. **Little trouble:** create a
   Turnstile site in Cloudflare (free account), paste its secret into Supabase (Auth → Bot and Abuse
   Protection), add the widget to the email screen and pass its token with the code request. About
   half a day, including the Content-Security-Policy entry for Cloudflare's script and resetting the
   widget after each use (tokens are single-use, including "resend code")
   ([Supabase docs](https://supabase.com/docs/guides/auth/auth-captcha)).
5. **Rate limits** in Supabase Auth.

### 8.5 Never trust any user input

Anything a client sends is untrusted, our own app included:
- `records`: size limits in the database; the app validates the shape after decrypting on pull.
- Planned notifications: byte size, time window, count per user.
- Profile: lengths and allowed values (avatar options from a fixed list).
- Later, social content from other people: never rendered as HTML, length caps.

### 8.6 Checklist

RLS + explicit grants on every table; no `anon` grants; service and VAPID keys only in Supabase
secrets; GitHub push protection for secrets; 2FA on GitHub, Supabase, Vercel, Cloudflare and the app's
Gmail; CSP header; dependency audit; backups + restore tests; delete account; privacy note; logs
without personal data; Security Advisor after each migration.

---

## 9. Domain

**No custom domain for now** (owner's decision). Keep `smart-meta-h2ur.vercel.app`: free, works for
push. A domain would cost about US$10 to 15 a year (.com) or R$40 (.com.br), every year.

**Correction (2026-10-29, S3):** moving later is **not** just "sign in at the new address". Passkeys
belong to the address they were made on, so at a new address nobody's passkey opens their data key, and
sync can't read the server copy. It's fixable, but it needs planning before any move:
- **Related origins** (WebAuthn): the new address publishes a `/.well-known/webauthn` file listing the old
  one, and the app keeps using `smart-meta-h2ur.vercel.app` as the passkeys' address. Supported by Safari
  18+ and Chrome; check Android and every browser in use first.
- Or, while still on the old address, each phone adds a second lock for a new passkey made at the new
  one. Needs every person to open the app once before the switch.
Push subscriptions and the Home Screen icon change with the address too (as already noted).

---

## 10. Backups

**What:** a scheduled job copies the database into a file that can be restored into any Postgres.

**Where:** a **separate private GitHub repository** (`smart-meta-backups`). Its scheduled workflow
connects to Supabase through the **pooler** connection string (GitHub runners have no IPv6), makes the
copy, **encrypts it** (with `age`; key only in the owner's password manager), and keeps it as a
workflow artifact (up to 90 days) or a commit, about the last 30 days. Free: 2,000 minutes and 500 MB
a month. **Not in the public app repo** (others could see logs and artifacts; scheduled workflows in
public repos are disabled after 60 idle days). With §7, the data inside is already ciphertext.

**Is this OK with GitHub's rules?** A gray area, but defensible. GitHub's Actions terms say Actions
shouldn't be used for activity "unrelated to the production, testing, deployment, or publication" of
the project. Backing up this project's own production database is part of running it, so it's
arguably related, and it's common practice. The realistic worst case is GitHub stopping the workflow,
not losing the account. To stay well inside the rules: keep it small (weekly full + nightly changes),
in a private repo, with encrypted files, using a fraction of the free 500 MB.
- **If GitHub ever objects, or the files grow:** keep the job but store the files in the **Google
  Drive of the app's Gmail account** (15 GB free, made for files), or run the job as a Supabase Edge
  Function that uploads to that Drive (the project's own server, clearly allowed). Cloudflare R2
  (10 GB free) asks for a payment method, so it's not the first choice.
- With end-to-end encryption, the backups hold ciphertext anyway.

**Schedule (egress, §3.2):** full copy **once a week** + **every night only changed rows** (the
`records.seq` cursor gives exactly the change set). Restore = latest full copy + the nightly files
after it.

**Restore drill:** restore into the staging project once, then every few months.

**When:** before friends' data starts syncing under the new system (stage S4). Not needed today.

---

## 11. Other risks

1. Wrong notifications lose the permission for good (§4.4).
2. One user → many: the shared-phone bug (§6.8) and conflicts (§6.9).
3. **Encryption bug or lost passkey → unreadable server data** (§7.2). Now the biggest risk.
4. **Passkey PRF may not work in the installed iPhone app** → spike before building (§14).
5. Support load ("it doesn't notify me") → diagnostics logs (send log, subscription checks; spec NO-23).
6. The owner becomes the operator → alarm, backups, kill switch.
7. Free projects pause after 7 idle days (staging only).
8. Public repo: no secrets, no backups there.
9. The app's Gmail account gets flagged or locked → captcha, low volume, Resend + domain as an exit.
10. A long-lived `notifications` branch drifts from `main` (other sessions keep shipping) → merge
    `origin/main` into it regularly.

---

## 12. Mockups before building (owner's requirement)

Before implementing each visible piece, Claude builds mockups with fake examples, and the owner picks:
- **Notifications:** 2 to 3 options per type (morning summary, due at a time, custom reminder, weekly
  review, prep, goal review date) shown as they'd look on an iPhone lock screen and in the stack:
  title and body wording, what's listed, how "+N more" reads, English and Portuguese.
- **Settings → Notifications** screen layout.
- **Avatars:** several styles with many customization options, shown side by side as a friend list
  would look.
- **Sign-in, waiting for access, passkey setup** screens.

Mockups are HTML pages (artifacts) or a preview build; nothing reaches `main`.

---

## 13. Testing

- **All work on branch `notifications`** with its **Vercel preview at the fixed branch address**
  (`smart-meta-git-notifications-….vercel.app`; stable per branch). Push works there: the owner adds
  that preview to the iPhone Home Screen as a separate app and tests real notifications.
- **Vercel turns on login protection for previews by default**
  ([docs](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)).
  A Home Screen app can't pass a Vercel login page, so protection must be **off for previews** (they
  become public; they only hold test data).
- **The preview talks to a staging Supabase project** (the second free project), set through Vercel's
  Preview environment variables for this branch. Friends' data is never touched; migrations are tried
  there first.
  - **Set up in S1 (2026-10-29):** project `smart-meta-staging` (São Paulo, Free), URL
    `https://gveqbekpnczaejxnmfmp.supabase.co`. Vercel project `smart-meta-h2ur` has
    `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key) as **Preview variables scoped to
    the branches `notifications` and `notifications-s1`**. They override `.env.production`, which
    every build reads. **Each new stage branch needs the same two variables added for its name**
    (Vercel only accepts a branch that exists on GitHub, so push it first). Other branches' previews
    (UI experiments) keep using production, as before.
  - Vercel Authentication (preview protection) was turned off for the project on 2026-10-29.
  - Cloudflare Turnstile widget "Smart Meta" (Managed) exists with site key
    `0x4AAAAAAFrfPqJiWrbNkis1` (public) and hostnames: the production address, the `notifications`
    and `notifications-s1` previews, and `localhost`. **Each new stage branch's preview hostname must
    be added to the widget** if Turnstile is tested there. The secret key is in the owner's password
    manager.
- **Merge to `main` only when the owner is sure notifications work nicely.** Merging means: apply the
  migrations to production Supabase, deploy, then enable for friends gradually (beta flag, then
  everyone).
- **Planner unit tests** and the **shadow week** (§4.4). Developer test button.

---

## 14. Backlog and stages

### How the stages are sized

The owner's concern: if everything comes at once, Claude gets confused; if it's split too finely,
Claude loses the context. The balance used here:

- **One stage = one session**, with one clear goal and an end state the owner can **try on the
  preview** (or, for design stages, pick from).
- **About 5 to 10 backlog items per stage**, touching one area of the app.
- **Context lives in this doc, not in the chat.** Each stage's session starts by reading §0, §2 and
  its own stage below, and ends by updating the doc (decisions, change log, ticked items). A fresh
  session per stage then loses nothing.
- If a stage turns into more than a day or two of back-and-forth, split it at that point.

Three stages, as first proposed, were too big: the first one alone held accounts, encryption and
operations. **Seven stages** (S0 to S6) fit the rule. Each stage runs on **its own branch**
`notifications-s<N>`, cut from the latest `notifications` and merged back into it when the stage is
done (owner's rule, 2026-10-21). The merge to `main` comes after S6 (§13).

### S0. Mockups (design only, no app code)
- [x] Notification options: 2 to 3 per type (morning summary, due at a time, custom reminder, weekly
      review, prep, goal review date), on an iPhone lock screen and in a stack, English and Portuguese.
      Picked 2026-10-21, see §2 "Notification wording".
- [x] Settings → Notifications screen. Picked 2026-10-29, see §2 "UI decisions".
- [x] Avatars: several styles with many options, shown as a friend list. Picked 2026-10-29, see §6.4.
- [x] Sign-in (email, code), passkey or data-password setup, Waiting for access, Requests (approve).
      Picked 2026-10-23, see §2 "Sign-in flow".
- [x] "Not synced yet" indicator. Picked 2026-10-29, see §6.9.
- **Done when:** the owner has picked an option for each. **Done 2026-10-29.**

### S1. Spikes and test setup
- [x] Owner: create the staging Supabase project; turn off Vercel preview protection; Claude adds the
      Preview environment variables for this branch. Done 2026-10-29, see §13.
- [x] Throwaway test page on the preview: **passkey + PRF inside the installed iPhone app** (and
      Android); **data-password autofill** as the fallback.
- [x] A test web push arrives on the installed preview (iPhone and Android).
- [x] Turnstile renders and passes in the installed app.
- **Done when:** the encryption method is chosen (passkey or data password) and push is proven on the
  owner's phone. Throwaway code is deleted. **Done 2026-10-29: passkey chosen.**

**S1 results (2026-10-29).** A throwaway page at `/s1/index.html` with its own manifest and service
worker, installed as a separate Home Screen app from the `notifications-s1` preview. Push was sent
from a local script with throwaway VAPID keys (deleted afterwards; S5 makes the real ones).

| Test | iPhone (iOS 26.6, installed) | Android 10 (Chrome 156, installed) |
|---|---|---|
| Passkey + PRF | ✅ Secret at creation; 4 of 4 unlocks with the same secret, including after a full close and picking from the list | ✅ Same; 3 of 3 |
| Data password autofill | ⚠️ First run: 1 good unlock, then 2 failures; redo: 5 of 5 | ⚠️ Works, but only after tapping the key icon by hand |
| Server push arrives | ✅ About 5 s | ✅ 5 to 7 s; no banner (phone setting, §5) |
| Tapping a push opens the app | ✅ | ✅ After moving `openWindow` first (§5) |
| Turnstile, real key | ✅ Every time, including a second token | ✅ Same |

Decision: **passkey with PRF** is the encryption method; the data password stays as the fallback with
the guards in §7.2. The certificate trust setting on iPhone isn't needed (the preview has a real
certificate).

### S2. Accounts
- [x] Owner: create the app Gmail (2-Step Verification, app password); paste the SMTP app password and
      the Turnstile secret into Supabase (staging first). The Cloudflare account and Turnstile widget
      already exist (made in S1, §13). Done 2026-10-29: the app Gmail is `smartmeta.codes@gmail.com`;
      staging has custom SMTP (smtp.gmail.com:465), sign-ups on, anonymous sign-ins off, confirm email
      on, 6-digit codes valid 1 hour, Turnstile captcha, 30 emails an hour, and the "Confirm signup"
      and "Magic Link" templates show only the code, in English and Portuguese together. Cloudflare
      flags "siteverify isn't being called" and Supabase flags Gmail as a personal provider: both
      expected (Supabase calls siteverify once the app sends tokens; Gmail is the §6.2 choice).
- [x] Claude: add the staging Preview variables for `notifications-s2` (done 2026-10-29). Owner: add
      the S2 preview hostname `smart-meta-h2ur-git-notifications-s2-daccache.vercel.app` to the
      Turnstile widget. S2 is tested on its own preview (§16.2).
Built on 2026-10-29; the owner tested everything on two phones on the preview the same day:
- [x] Email-code sign-in with Turnstile; drop password sign-in. `src/sync/account.ts` (send and check
      the code), `src/ui/captcha.ts` (Turnstile, invisible unless Cloudflare wants a tap, reset after
      every send so "Send a new code" has a fresh token), screens in `src/screens/Account.tsx`.
- [x] `members` (cap 100) and `profiles` (name, avatar) with RLS and explicit grants; existing users
      migrated as members: `supabase/migrations/0002_accounts.sql`. Claude writes the SQL; **the owner
      pastes it into the staging SQL editor** (Claude has no Supabase access, owner's choice
      2026-10-29). The owner is recognized by the same email hash as the Developer section, so the
      address isn't in the public repo, and gets in by themselves on the first sign-in. The file is
      safe to run again: the existing-users backfill only runs when `members` is created. Tested
      before pasting on a local Postgres with a stand-in for Supabase's auth (48 checks: who can read
      and write what, the cap, approving, deleting).
- [x] Waiting for access screen; Requests screen with Approve (Settings → Developer → Requests, with
      the number waiting). **No push to the owner in S2:** it needs S5's pieces (see S5).
- [x] Sign-in after the first goal; "Not now" popup; Safari hint on iPhone; the "Sync and get
      notifications" banner on Today (swipe left to Hide, back after a day, a week, a month, then never).
- [x] One person per phone (§6.8); sign-out rules; delete account. The phone's owner is
      `meta.phoneOwner` ({ id, email }), set at the first sign-in; everything already on the phone is
      queued for the first upload then. Sending a code to another email is refused while the phone
      holds someone's data. A member's sign-out syncs first and refuses with anything left, then
      wipes the phone; a waiting account's sign-out keeps the data on the phone (it was never
      uploaded). Delete account calls `delete_my_account()` (no Edge Function), then wipes the phone.
- [x] Name and avatar: the row at the top of Settings opens Account, whose card has a pencil for the editor
      picked in S0. Kept on the phone, with or without an account, and sent to `profiles` only once the
      account is a member (spec AC-4: nothing on the server while waiting).
- [x] Someone else's data on the phone (spec AC-13): sending a code to another email is refused before the
      captcha, with "Save a copy and remove it" (the share sheet with the JSON export, then the phone is
      emptied) so the new person can sign in.

Choices made while building (tell the owner; change if they disagree):
- "Your goals are end-to-end encrypted." is **hidden until S3** (`ENCRYPTED` in `Account.tsx`): in S2 it
  wouldn't be true yet. S3 turns it on.
- The sign-in dots show three steps (activate, email, code); S3 adds the Face ID step.
- Avatar colors are the values' 12 colors (gray, not cyan) and the sunburst pattern is stored as
  `sunburst`; the server checks the same lists.
- Security Advisor on staging (2026-10-29) flagged the app's functions as "SECURITY DEFINER callable by
  signed-in users" and the policies as re-reading the user per row. Fixed: the functions' bodies live in
  `private` (not in the API) behind thin `public` wrappers that run as the caller, the policies read
  `(select auth.uid())` once, and `members` has an explicit deny-all policy. "Unused index" on
  `records` stays: staging has no rows yet. **Never run 0001 again on its own after 0002**: it would add
  back the old policy without the membership check (0002 removes it every time it runs).
- A non-member can't write their profile either (stricter than the README's "their own profile"),
  following spec AC-4.
- Owner's first round of feedback (2026-10-29), done: the sign-in dots count Activate only when the flow
  began there; the intro's last button says Next when sign-in follows; "Go to [Today]" on Waiting as in the
  intro; one height for the main button on every onboarding and sign-in screen (a link under it sits in
  the space kept below, see `.intro-below`); six equal code boxes; a long email no longer squeezes its
  label; "erases the phone" reworded; Turnstile runs only when a code is sent (`execution: 'execute'`),
  so its box shows only when it's needed and the code goes once it's ticked; "You're in" became a green
  banner on Today ("You've been accepted! Your goals are now backed up."), swiped away like the sync
  banner; the sync banner's day count follows "Pretend today is"; Requests rows swipe to Approve and
  Delete (Notes style, no full swipe) and open a sheet with the whole email; deleting a request deletes
  that sign-up (`reject_request()`, never a member); the waiting count is read again on returning.
- Settings, as the owner asked: a profile row at the top (avatar, name, and the email or "Not signed in")
  opens **Account**: "Edit name and avatar", Sync, Backup, and one card with Erase all data and Delete
  account, each confirmed in a sheet. Name and avatar exist without an account too (kept on the phone).
  Developer is its own page (Settings → Developer, developers only), with Requests in it.
- Owner's second round (2026-10-29), done: the Developer page and Requests send anyone who isn't a developer
  back to Settings (`DeveloperOnly`; the server refuses them anyway); the green banner has a ✕; name and
  avatar are edited from a pencil at the top right of Account, and the profile row there opens a sheet with
  the whole email and the day the account was made; a sheet's ✕ now asks before throwing typing away, as
  pulling it down does (Quick add and the task sheet too); **the owner can remove a member** (swipe in
  Requests, or from their sheet): `remove_member()` deletes the account and its synced data, the person's
  phone keeps everything and works on without sync, and Today shows a red "You were removed from sync"
  banner (`my_access()` answers `removed` for a session whose account is gone). Signing in again with the
  same email takes the data on the phone back as theirs.
- Third round (2026-10-29): the pencil moved into the profile card on Account (no chevron there), the
  green banner shows a cloud, and both banners close only by swiping (no ✕).
- Security Advisor's remaining warning, "Leaked Password Protection Disabled", is accepted: that check
  (HaveIBeenPwned) needs a paid Supabase plan, and the app uses no passwords at all.
- Mockup leftovers, by stage: Face ID, data password and new-phone unlock (sign-in screens 5, 6, 7, 11)
  are S3; "Not synced yet" and the Sync row's status are S4; the friend list is for social, later. The
  avatars mockup shows names and avatars in Requests: approved members show theirs (owner's choice;
  `members_overview()` returns them, visible to the owner as spec PR-7 says); people waiting show the
  email's initial, since their profile stays on their phone (AC-4).
- After S2 (2026-10-29): the avatar editor has no suggestion panel, only the emoji field, starting as 🙂
  (owner); a removed member's phone keeps its owner, so a different person signing in there is asked to
  save a copy and remove the data first instead of taking it into their account (AC-13).
- Local testing against staging: `npm run dev -- --mode staging` with `.env.staging.local` (ignored by
  git), or the `dev-staging` entry in `.claude/launch.json`. `.env.local` points at production.
- **Done when:** a test friend can sign up on the preview, wait, get approved with one tap, and sync.

### S3. Encryption
Started 2026-10-29 on branch `notifications-s3` (staging Preview variables added). Owner's answers at the
start: Face ID right after the code, also while waiting; only the owner has data on production, test
data anywhere can be deleted; old-phone transfer and recovery code later (§15); staging test accounts are
temporary and can be deleted whenever a stage needs it.

Built on 2026-10-29; the owner tested every step below on the iPhone and Android the same day:
- [x] Data key + key pair (for social later); passkey or data-password unlock (from S1). `src/sync/crypto.ts`
      (pure browser crypto), `src/sync/keys.ts` (passkeys, the phone's copy, the server's copy).
- [x] Encrypting wrapper around the sync target; decrypt on pull; validate shape: `src/sync/encrypted.ts`.
- [x] Migration: the app re-uploads existing plaintext rows encrypted, then plaintext is gone from the
      server. Runs by itself at the start of each sync session, one cheap query when there's nothing left.
- [x] New-phone flow (screen 11), Face ID (screen 5) and data password (screen 7). iCloud Keychain can't
      be checked from a web page (see below). Optional extras moved to §15 (owner).
- [x] Tests: round trip, wrong key, lost key, migration (`crypto.test.ts`, `encrypted.test.ts`), and the
      SQL on a local Postgres (37 checks: who can read and write keys, lock shapes, readable records refused).
- [x] Owner: paste `supabase/migrations/0003_keys.sql` into the staging SQL editor; add the S3 preview
      hostname `smart-meta-h2ur-git-notifications-s3-daccache.vercel.app` to the Turnstile widget.
- [x] Owner: test on the S3 preview (below). All six steps passed, after the Android fixes below.
- [x] **Open twice** warning (owner, after the Android finding below): a screen over the app that can't be
      dismissed while another copy is open on the device, gone by itself once it closes.
      `src/ui/OpenTwice.tsx`.
- **Done when:** on staging, the dashboard shows only ciphertext and a second phone unlocks with Face ID
  (or autofill). **Done 2026-10-29.**

How it works (details for later stages):
- **Keys.** A random 256-bit data key (AES-GCM) per account, made on the phone. Each way to open it is a
  **lock**: the data key sealed with a key from the passkey's PRF secret (HKDF), or from the data password
  (PBKDF2-SHA256, 600,000 rounds). A lock is bound to its key's id. The sharing key pair (ECDH P-256) has
  its private half sealed with the data key. On the phone the data key is stored so it can't be read back
  out (non-extractable `CryptoKey` in IndexedDB), plus the locked row (`meta` keys `dataKey:<user>` and
  `keys:<user>`).
- **`user_keys`** (0003): one row per account, `key_id`, `public_key`, `private_key`, `locks`. Members
  insert it once and read it; **nobody can change or delete it through the API**, so a stolen session
  can't swap the key or lock the owner out. It goes with the account (cascade).
- **Records.** `data` becomes `{ e: 1, iv, ct }`, sealed with the data key and bound to its user,
  collection and id, so the server can't move one record's content into another. Collection, id, times,
  deleted flag and data version stay readable (spec PR-7). 0003 adds a check (`not valid`) that refuses
  readable data in every new write while leaving old rows until the app seals them. Pulled records that
  don't open, don't match their row, or are still readable are skipped and logged; the phone's copy stays.
- **When Face ID is asked.** Right after the code (screen 5, a fourth sign-in dot), also while waiting for
  access: the locked row then waits on the phone and goes up with the first sync after approval. A member
  without the key on this phone (new phone, signed out, or an account from before S3) gets screen 5 or 11
  once each time the app opens, over Today; Back leaves it for later, sync waits, and Settings → Account
  shows "Unlock your data · Sync paused". Never in daily use (spec PR-3). Signing out forgets the key; a
  waiting account keeps its locked row so it can unlock again. Erase all data keeps the keys.
- **Passkeys** are made with a random user id, so a second set-up never replaces a passkey that already
  locks something. If two phones set up while waiting, the first to upload wins and the other asks to
  unlock with the first one's passkey (synced by the keychain).
- **Data password** (screen 7): the email in a `username` field above it; anything under 12 characters is
  refused ("use the strong password your password manager suggests"); after saving, it's asked for again
  by autofill and only locks the data once it matches. On Android a line says to tap the key icon.
- **Android wording:** "Face ID" only on iPhone; elsewhere "screen lock" and "your Google account".
  Claude's wording, not in the mockup: change if the owner prefers.

**Android: the app open twice (found while testing, 2026-10-29).** Installing on Android starts from a
Chrome tab, and the tab stays open. The tab and the installed app share one database, and Android
freezes the tab in the background, sometimes in the middle of a write; the app then waits on that
database until the tab is closed. Seen as: a frozen sign-in that went back to the intro, a 30-second
blank screen, no profile row in Settings, the green banner back after being hidden. Closing the Chrome
tab fixed all of it at once. What changed:
- **The warning**: each copy holds a browser lock (Web Locks) while it's open; the browser lists every
  copy's lock, frozen ones too, so the app sees the other copy and covers itself with "Smart Meta is
  open twice" until it's closed. It's drawn outside the rest of the app, so it shows even while the
  database is blocked. iPhone Safari and the Home Screen app keep separate data and don't see each other.
- Supabase repeats "signed in" on every return to the front and relays other tabs' events: the same
  account is now handled once, access checks share one run, and the stored access is swapped in one
  transaction, so the green banner can only come once.
- **Diagnostics log** (Settings → Developer → Diagnostics log, with Copy): sign-in, access, keys, sync
  and uncaught errors on that device, in localStorage so it works when the database doesn't. Ids
  shortened, no content or keys. A drawing error now shows a screen with Reload and Copy log instead of
  a blank page.

What a web page can't check: whether **iCloud Keychain** is on. It can only see whether passkeys with PRF
work; when they don't, the app goes to the data password. If unlocking fails, the message says to check
iCloud Keychain with the Apple ID used at set-up.

**Passkeys belong to one web address** (the WebAuthn "relying party"). Consequences:
- Each stage's preview is a different address: staging accounts locked on the S3 preview can't unlock on
  the S4 or S5 previews. Owner's answer: delete the staging test accounts when a stage needs it.
- A **custom domain later** needs care (§9).

To test on the S3 preview (installed as its own Home Screen app; staging has 0003):
1. Sign up a new email on the iPhone: code, then "Lock your data with Face ID" makes a passkey. Waiting
   for access appears. Approve it from the owner's account: Today, then sync.
2. In the staging Table Editor: `records.data` shows only `{"e":1,"iv":…,"ct":…}`; `user_keys` has one row.
3. Same email on the Android phone: code, then "Unlock your data" asks for the passkey (from the list, or
   via the iPhone's QR if Google doesn't have it); the goals arrive.
4. Sign out and in again on one phone: Face ID once, nothing else.
5. "Face ID isn't working?" with another new email: the password manager makes the password, it's asked
   for again, then everything as above.
6. The owner's own staging account, if it has data from S2: Face ID once on next open, then
   `records` has no readable rows left.

### S4. Safety and operations
Started 2026-10-29 on branch `notifications-s4` (staging Preview variables added). Owner's answers at the
start: backups run against **staging** until S6, then production (only the secret changes, so no double
work); Claude creates the backups repo (private, not production yet); the privacy note is a **legal
document** (a privacy policy under Brazil's LGPD), researched by Claude.

Built on 2026-10-29; the owner set it up and tested every step below on 2026-10-30:
- [x] Private repo [phdaccache/smart-meta-backups](https://github.com/phdaccache/smart-meta-backups) (made by
      Claude): **Backup** workflow (Sundays full, other nights the changes since the last full copy, `age`
      encrypted, kept 37/30 days as artifacts) and **Restore** workflow (by hand; only puts missing rows back).
      Nightly schedule on since 2026-10-30 (03:00 São Paulo); `AGE_RECIPIENT` is a repository variable,
      `DATABASE_URL` and `RESTORE_DATABASE_URL` are secrets (staging's session pooler URI). Restore SQL tested on a local Postgres
      (11 checks: one account back, changes win over the full copy, new pull order, a second run adds
      nothing, the whole project back with accounts).
- [x] Usage alarm in the backup job (N-20): database over 300 MB, an account over 10,000 rows or 2,000 new in
      a day. The push check waits for S5's send log. A "test alarm" switch makes it fire.
- [x] `0004_limits.sql`: record size (N-4), rows per user in total (N-2) and per day (N-3, counted per
      write in `private.daily_rows`), clock guard (N-18), purge of tombstones older than 90 days (N-19) by
      `pg_cron` every night. Tested on a local Postgres (18 checks). N-5 (pending notifications) comes with
      S5's table.
- [x] Quick undo (N-14): a check-in undone within 30 minutes becomes a tombstone instead of a void row.
- [x] Sync timing (N-15 to N-17): 2 s after the last change, at most 10 s during continuous editing; a
      flush of up to 40 rows with `keepalive` when the app goes to the background; the 5-minute timer only
      while visible.
- [x] "Not synced yet" on Today's date line and the shorter Settings → Sync row (S0 mockup, option A).
- [x] Content-Security-Policy and other security headers in `vercel.json`.
- [x] Privacy policy (Settings → About → Privacy policy, and a link on Activate notifications), in
      Portuguese (the one that counts) and English: `src/lib/privacy.ts`.
- [x] Phone numbers in one module, `src/numbers.ts` (spec RE-5).
- [x] `0005_daily_rows_policy.sql`: the policy Security Advisor asked for on `private.daily_rows` (an INFO note).
- [x] Activate notifications (owner, while testing): the encryption line and the privacy link halfway
      between the text and the button, the button higher than the intro's.
- [x] Owner: setup and every test below, including the restore drill on Android; `AGE_IDENTITY` deleted after.
- **Done when:** a restore into staging works and the alarm fires on a test threshold. **Done 2026-10-30.**

Choices made while building (the owner may change any):
- **Quick undo leaves one tombstone** rather than erasing outright: if the check-in already reached the
  server, erasing only on the phone would let it come back on the next pull. One empty marker, purged after
  90 days, instead of two rows forever. History doesn't show it.
- **A refused write refuses the whole upload** (limits, clock guard). Nothing is lost: the rows stay on the
  phone, Today says "Couldn't sync", the diagnostics log says why. A phone with its clock over 5 minutes
  ahead syncs again once its clock is fixed and the stamps are no longer in the future.
- **Restore needs the backup's secret key in GitHub for a moment:** the owner adds it as a secret, runs the
  restore, then deletes it. Restored records get new `seq` values so phones pull them again.
- **Security headers name both Supabase projects** (production and staging). A new project needs a new entry.
- **Privacy policy:** names the owner in full as controller, with `smartmeta.codes@gmail.com` as contact;
  says no DPO is appointed (ANPD Resolution 2/2022 for small agents); legal bases are contract (art. 7 V)
  and legitimate interest (art. 7 IX); transfers abroad under art. 33 IX; minimum age 18. **The owner
  confirmed the name, the contact, the minimum age and no DPO on 2026-10-30.** Claude isn't a lawyer: a
  lawyer's review before friends use it is recommended.

**Owner's setup, in order** (Claude can't do these: they need the owner's accounts or secrets):
1. **Migration:** Supabase → `smart-meta-staging` → SQL Editor → paste `supabase/migrations/0004_limits.sql` →
   Run, then the same with `0005_daily_rows_policy.sql` (it clears the Advisor's "RLS enabled, no policy"
   note on `private.daily_rows`). Then Integrations → Cron should list `smart-meta-purge`; Advisors →
   Security Advisor should show nothing new (send Claude anything it shows).
2. **Turnstile:** Cloudflare → Turnstile → widget "Smart Meta" → Settings → add the hostname
   `smart-meta-h2ur-git-notifications-s4-daccache.vercel.app`.
3. **Backup key:** in PowerShell, `winget install FiloSottile.age`, then `age-keygen`. Save both lines (public
   `age1…`, secret `AGE-SECRET-KEY-…`) in the password manager as "Smart Meta backup key". Send Claude only
   the public `age1…` line, or add it yourself as the variable below.
4. **Backups repo secrets:** github.com/phdaccache/smart-meta-backups → Settings → Secrets and variables →
   Actions. Variables → `AGE_RECIPIENT` = the `age1…` key (**set by Claude on 2026-10-30**). Secrets → New
   repository secret → `DATABASE_URL` = Supabase → staging → **Connect** → **Session pooler** URI with
   `[YOUR-PASSWORD]` replaced by staging's database password (from S1; if lost, Database → Settings → Reset
   database password, which nothing else uses).
5. **Email on failures:** github.com → Settings → Notifications → Actions → "Notify me only for failed
   workflows", with Email ticked.
6. Tell Claude; Claude turns the nightly schedule on and runs the first full copy.

**To test on the S4 preview** (a new Home Screen app; passkeys from the S3 preview don't open here, so use
a new email or delete the old staging test accounts first):
1. **Sign up and sync:** sign up on the iPhone, Face ID, approve from the owner's account. Add a goal and
   check something: within about 2 seconds the staging `records` table has the rows.
2. **Not synced yet:** turn on Airplane Mode and check something in. After about 2 s Today's date line shows
   a grey cloud and "Not synced yet". Settings → Sync: a grey cloud next to the time; tapping it says "1 change
   waiting. You're offline…". Turn Airplane Mode off: a green "Synced" shows briefly, then nothing.
3. **Flush on leaving:** check something in and leave the app within a second (swipe home). In the staging
   `records` table the row is there anyway.
4. **Quick undo:** check something in, uncheck it right away: Goal History shows nothing struck through;
   in `records` that entry has `deleted = true` and no second row. Uncheck something checked over 30 minutes
   ago: History shows it struck through, as before.
5. **Security headers:** sign out and in again (Turnstile, email code, Face ID), open Settings, export a
   backup: everything works as before. (A blocked request would show as a broken step.)
6. **Privacy policy:** Settings → About → Privacy policy, in both languages; the link on "Activate
   notifications". Read the text: anything wrong or missing goes to Claude.
7. **Limits** (SQL Editor, as the owner; each should fail with the message shown):
   `update public.records set updated_at = now() + interval '1 hour' where id = (select id from public.records limit 1);`
   → `clock: stamped … ahead`. Then `select private.purge();` runs without error.
8. **Backup:** Actions → Backup → Run workflow (kind: full) → green, "Saved full-…". Run it again with kind
   "changes" → "Saved changes-…".
9. **Alarm:** Run workflow with "Make the alarm fire" ticked → the run fails with "ALARM: …" and an email
   arrives. Without the tick it stays green and the summary shows the counts.
10. **Restore drill** (with a fresh test account, on the Android phone): sign up a new email, approve it,
    add a goal and a few check-ins. **Run Backup** (Actions → Backup → Run workflow, kind "full"): a backup
    only holds what existed when it ran. Then in the SQL Editor
    `select u.id, u.email, (select count(*) from public.records r where r.user_id = u.id) from auth.users u order by u.created_at desc;`
    and note that account's id and count. Delete them: `delete from public.records where user_id = '<id>';`.
    The phone still shows everything and stays green: a delete made directly in the database is never sent
    to phones, and phones never delete their own data. Add secrets `RESTORE_DATABASE_URL` (the same staging
    URI) and `AGE_IDENTITY` (the `AGE-SECRET-KEY-…` line). Actions → Restore → Run workflow with the id in
    "user_id": the run's summary says how many rows went back, and the count matches again. On the phone,
    sign out and in again (it wipes and downloads from the server): every goal is back. **Then delete the
    `AGE_IDENTITY` secret**: backups and their key must never sit in the same place.
    (First try, 2026-10-30: the restore put back 0 rows because the drill had no backup step and the newest
    backup was older than the test account. Step added.)

### S5. Push, core
Started 2026-10-30 on branch `notifications-s5` (cut from `notifications` after S4, pushed). The owner split
it into **three parts, with a session compaction after parts 1 and 2**, so this section holds what the next
part needs:
1. **Mockups** (in progress): one consolidated mockup, [mockups/s5.html](mockups/s5.html) (artifact
   [Smart Meta S5 Mockups](https://claude.ai/artifact/Uw7Tho8s1fzcL7m8ennMWB)). Round 1 (2026-10-30):
   layouts A, B, C, push texts, Settings, three questions; answered 2026-10-31 (below). Round 2
   (2026-10-31): the owner's Notification card, the picked texts, where the Settings row sits, questions
   4 to 6, answered the same day. **Done 2026-10-31.** Round 3 (2026-10-31, during part 3): the card on
   project steps and preps, tab "Steps and preps", questions 7 to 10, answered the same day (below).
2. **Plumbing:** VAPID keys, service worker push and click, subscriptions, the tables, the dispatcher, the
   test button, the push on a new access request. Ends with the owner's setup and one test push on both
   phones. **Done 2026-10-31:** built (below, "Part 2: what was built"), set up and tested by the owner on
   both phones (test push, tapping it, the "New request" push).
3. **The rest:** planner, the four types, Settings → Notifications, the Notification card, the kill switch
   row in Developer, the app's beta flag. Then the owner tests, and the week on the preview starts.
   **Built 2026-10-31** and checked in the dev app (below, "Part 3: what was built"), including the card on
   project steps and preps after the round 3 answers. **Tested by the owner on both phones 2026-10-31**,
   in five rounds, each fixed the same day (below, "Owner's test of part 3" and the rounds after it); 0009
   and 0010 pasted. **S5 done 2026-11-01** (owner): merged into `notifications` without a shadow week on
   the preview.

**Owner's first idea for custom reminders (2026-10-30), replacing "a reminder at any date and time"; superseded
on 2026-10-31 by the Notification card below:** a
**Notification switch on the item, off by default**, usable only when the item has a date or a time, with
choices counted from it ("At the time", "15 minutes before", …). Once only, as before. In the mockup: with a
time, At the time / 5, 15, 30 minutes / 1 hour / 1 day before; with a date only, On the day / 1, 2 days /
1 week before, at a time picked (9:00 to start). Turning the date off turns the switch off; a task with no
date has no reminder, which settles the open wording for "a task with no goal and no due date".

**The Notification card (owner's design, 2026-10-31, replacing layouts A to C), as in Reminders:**
- An item with a date gets a **card of its own under Date and Time, holding one row, "Notification"**
  (bell tile). No date, no card. The "Set a date to get a notification." note is gone.
- The row's value sits on the right with up and down chevrons, **"None" to start**. Tapping it opens an
  **iOS-style menu**: None, then a divider, the choices, a divider, Custom. The chosen one has a check.
- **Date and time:** At the time (answer 4a), 5, 15, 30 minutes, 1 hour, 2 hours, 1 day, 2 days, 1 week, 1 month before.
  **Date only:** On the day (4a), 1 day, 2 days, 1 week, 2 weeks, 1 month, 3 months, 6 months before. **Only choices still
  ahead of now** are listed (a task due in 6 days has nothing from 1 week up). A date-only reminder fires
  at the morning summary's time (answer 5).
- **Custom** opens two wheels under the row: a number from 1 to 200 and a unit (Minutes, Hours, Days,
  Weeks, Months). Between the row and the wheels, in red, what's set: "23 hours before". Claude's choice,
  for the owner to check: with a date only, Custom offers days, weeks and months only.
- The push: title the item's name, body when it's due (texts in §2 "Notification wording").
- Projects use the same card (target date and optional time); steps (date only) and preps (always timed,
  repeating: the reminder follows each of the prep's times) get it in their own editors.

**Round 1 answers (owner, 2026-10-31):**
- Q1 **a**: the Notification card decides; items with a time no longer push by themselves; Settings drops
  "Items with a time"; the morning summary still lists everything (spec NO-2 changed).
- Q2 **a, adjusted**: no reminder on commitments for now; repeating reminders come later, kept as an
  open feature (§15).
- Q3 **a**: preps get the same card, None until set; Settings drops "Preps with a time" (spec NO-5).
- Texts: task and project reminders A, as times only ("Today, 14:30"); project step "CV & LinkedIn · step
  1 of 4"; access request title "New request", body the email. The rest of the approved texts: OK.
- Settings: a line under "Weekdays only" in the morning summary's options. The owner asked where the
  Notifications row goes on the Settings page: question 6.

**Round 2 answers (owner, 2026-10-31):**
- Q4 **a**: "At the time" (date and time) and "On the day" (date only) come first under None.
- Q5 **adjusted**: a date-only reminder fires at the **morning summary's time** (8:00 by default, its
  setting) on the day it falls. Note for part 3: "On the day" and the summary then arrive together; both
  are kept as the owner chose (the reminder is "asked for", the summary isn't).
- Q6 **a**: the Notifications row is the first row of Settings → App, above Language.

**Facts for part 3** (after part 2, 2026-10-31; details in "Part 2: what was built" below):
- **What exists to build on:** `src/sync/push.ts` (turn on/off, the check on each open, `sendTestPush`, which
  shows how to encrypt and upload one row: `encryptPush(encodeMessage(message), keysOf(sub))`, base64url, with
  `sub_key` = the subscription's p256dh); `supabase/functions/_shared/webpush.ts` (`PushMessage` is
  `{ title, body, url, tag? }`; `MESSAGE_BYTES_MAX` is the text budget); `public/push-sw.js` shows it.
- **What the server accepts in `scheduled_notifications`** (0006): `kind` in reminder, summary, review,
  goal-review, test (a new kind needs a migration); `id` up to 200 characters of `[A-Za-z0-9:._-]`;
  `fire_at` from 15 minutes ago to 15 days ahead; at most 300 pending per user (N-5) or the whole upload is
  refused; `tag` (up to 64 of `[A-Za-z0-9_-]`, optional) is free for the planner's diff. Upserts on
  `(user_id, id)`; a row already sent is never changed by an upsert; only pending rows can be deleted.
- **A new subscription** (another phone, or the browser renewing it) deletes every pending row on the server:
  the planner must replan when the endpoint it last planned for changes.
- **Only one phone holds the subscription**, but any of the account's phones can read its keys
  (`push_subscriptions` is readable by its owner), so planning from any phone works (plan §4.1).
- **Timing:** cron fires at second 0, so a push due at hh:mm:00 leaves with that run; check `at` against
  `fire_at` in `private.send_log` with the first real reminders.
- **The Developer switch and test button are temporary**: Settings → Notifications replaces the switch
  (the test button stays, NO-25). The kill switch row (owner only) needs a small migration: a get/set
  function checked with `private.is_owner()`, as `approve_member` is.
- **N-9 lives twice on the server**: `private.stale_after()` and the dispatch function's `TTL_SECONDS`.
  Change both (spec RE-5).
- **Deploying the function:** `npx supabase login`, deploy, `npx supabase logout`, delete the token
  (owner only; Claude has no Supabase access). The owner pastes SQL and sets secrets.
- **Testing modules in the dev browser:** after an edit, Vite serves the app's modules with `?t=`; a test
  that imports `/src/...` without it gets a second copy with its own state (2026-10-31).
- Item fields: tasks `date` + optional `time`; project steps are tasks with `projectId`, date only; projects
  `targetDate` + optional `time`; preps `fireWeekdays` + `fireTime` (always timed, weekly); commitments
  have no date or time (`src/lib/types.ts`). The card belongs under `DateTimeRows` (`src/screens/TaskSheet.tsx`),
  which tasks and projects share; steps and preps have their own editors.
- The S5 preview has its Vercel Preview variables (Supabase URL and key, `VITE_VAPID_PUBLIC_KEY`) and its
  Turnstile hostname; staging has 0006, 0007, the secrets, the dispatcher, and mode `on`.

**Part 2: what was built (2026-10-31), set up and tested by the owner the same day:**
- `supabase/functions/_shared/webpush.ts`: RFC 8291 encryption and RFC 8292 VAPID signing with only
  WebCrypto, one copy for the phone (Vite) and the server (Deno). Tests in `src/sync/webpush.test.ts`
  match RFC 8291's worked example byte for byte, round-trip through an independent decryption, and verify
  the VAPID signature.
- `supabase/migrations/0006_push.sql`: `push_subscriptions` (one per account; endpoints only at Apple,
  Google, Mozilla or Microsoft push hosts, so the server can't be made to post elsewhere),
  `scheduled_notifications` (encrypted payload at most 4 KB, `sub_key` = the p256dh it was encrypted for,
  15 days ahead at most, 300 pending at most, sent rows kept two days and never re-armed by a late upload,
  only waiting rows deletable by the app), `private.send_log` (no content), `private.push_config` (mode
  `off` = kill switch, `shadow` = only the owner and `private.push_beta` get real pushes, `on`), the
  dispatcher's functions, the purge extended, and the `smart-meta-dispatch` cron job (every minute,
  `pg_net`, its secret made in Vault by the migration itself). Tested on PGlite (Postgres in WebAssembly)
  with stand-ins for Supabase's auth, Vault, cron and pg_net: 47 checks, including running it twice.
- `supabase/functions/dispatch/index.ts`: checks the secret (constant time, against Vault), claims what's
  due, signs and forwards it (`TTL` 15 minutes, `Urgency: high`), encrypts and sends the owner's "New
  request", and reports back. Run end to end on Deno against PGlite: a missing or wrong secret is refused;
  Apple answered 400 to a fake device (logged as failed); Google answered 404 (subscription deleted).
- `public/push-sw.js` (loaded by `workbox.importScripts`): shows the push (a plain "Smart Meta" if the
  payload can't be read, since iPhone allows no silent push) and, on a tap, focuses or opens the app first,
  then goes to the push's path (only paths inside the app).
- `src/sync/push.ts`: turn on (permission from a tap, subscribe, save), turn off, the check on each open
  (renews a dropped subscription, stops here if another phone took over, renews `checked_at` about once a
  day), and the test push, encrypted on the phone. Signing out turns pushes off for the phone.
- Settings → Developer: "Notifications on this phone" and "Send a test notification" (members only), until
  Settings → Notifications comes in part 3.
- Vercel Preview variables for `notifications-s5` (Supabase URL and key) added by Claude;
  `VITE_VAPID_PUBLIC_KEY` waits for the owner's public key. The usage alarm (backups repo) now checks
  pushes: over twice the previous week's daily average, and over 30 in a day.

**Choices made while building (the owner may change any):**
- **The new-request push counts toward the owner's fuse** (20 a day), so a flood of sign-ups can't push
  without end; captcha and email codes make that unlikely. A request the dispatcher sees over 15 minutes
  late (an outage) gets no push, as with every type.
- **The kill switch keeps planned pushes waiting**; turned back on, whatever is over 15 minutes late is
  dropped. New requests while it's off get no push.
- **The default mode is `shadow`**, so a new project (production in S6) pushes only to the owner until
  it's turned `on`. Staging is set to `on` in the setup below, so both test accounts get pushes.
- **Functions are deployed with the Supabase CLI through `npx`** (no install, no Docker): the dashboard's
  editor can't take the shared `_shared/webpush.ts` file.
- **The test push says** "Test notification" / "Sent at 14:32. Push works on this phone." (English only, like
  the rest of Developer) and opens Developer.

**Owner's setup for part 2, in order** (Claude can't do these: they need the owner's accounts or secrets):
1. **Update the folder:** in PowerShell, in `Documents\smart-meta`: `git checkout notifications-s5`, then
   `git pull`.
2. **VAPID keys:** `node scripts/vapid-keys.mjs`. Save both lines in the password manager as "Smart Meta
   VAPID (staging)". **Send Claude only the `VAPID_PUBLIC_KEY` line** (it's public; Claude adds it to Vercel
   as `VITE_VAPID_PUBLIC_KEY` and the preview rebuilds). **Done 2026-10-31**: the owner sent it, Claude added it.
3. **Supabase secrets:** Supabase → `smart-meta-staging` → Edge Functions → Secrets → add
   `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` with the two values.
4. **Migration:** SQL Editor → paste `supabase/migrations/0006_push.sql` → Run. Then, in a new query:
   `select vault.create_secret('https://gveqbekpnczaejxnmfmp.supabase.co/functions/v1/dispatch', 'dispatch_url');`
   and `update private.push_config set mode = 'on';` → Run. Then paste
   `supabase/migrations/0007_pg_net_schema.sql` → Run (staging ran 0006 before it put `pg_net` in
   `extensions`: Security Advisor's "Extension in Public" warning; a new project gets it right from 0006).
5. **Deploy the dispatcher:** in PowerShell, in the repo folder: `npx supabase login` (a browser page asks
   to allow it), then
   `npx supabase functions deploy dispatch --project-ref gveqbekpnczaejxnmfmp --no-verify-jwt --use-api`,
   then **`npx supabase logout`** right away, and delete the token in Supabase → Account → Access Tokens.
   Why: while it's on this computer, Claude's shell could use it (the management API runs SQL), which would
   break "Claude gets no Supabase access" (owner's question, 2026-10-31). Repeat for each change to the
   function; a GitHub Action holding the token as a secret is the alternative if this gets tiresome.
6. **Check:** Integrations → Cron → `smart-meta-dispatch` succeeds each minute; Edge Functions → `dispatch`
   → Invocations shows a 200 each minute. Advisors → Security Advisor: anything new goes to Claude.
   Seen on 2026-10-31 after 0006: "Extension in Public" (`pg_net`), fixed by 0007; "Leaked Password
   Protection Disabled", which doesn't apply (the app has no passwords, only email codes, spec AC-1; and
   the check is a paid-plan feature), so it stays as it is.
7. **Turnstile:** Cloudflare → Turnstile → "Smart Meta" → Settings → add the hostname
   `smart-meta-h2ur-git-notifications-s5-daccache.vercel.app`.

**Owner's test, 2026-10-31:** the test push arrives on iPhone and Android and opens Developer; "New
request" arrives with the email and opens Requests. Found and fixed: a push tapped on Android while
Developer was open added Developer twice to Back (a tapped push for the screen already shown now leaves
it); Developer's subtitle was cut at two lines (shortened); and signing in from the intro's "Restore from
a backup" with nothing on the server (or while waiting) led back to the intro, "Go to Today" included.
Fixed with the owner's OK: a phone with an owner skips the intro, and Today shows Getting started until
the first goal. The test push comes at the start of the next minute (the dispatcher's run); a real
reminder is due at the exact minute, so it leaves with that run and arrives seconds later. Part 3 checks
this against the send log (`at` against `fire_at`). The S4 account had to be deleted on staging first: its
passkey belongs to the S4 address (README, "Passkeys belong to one web address").

**To test part 2 on the S5 preview** (a new Home Screen app; the S4 passkeys don't open here):
1. **iPhone:** open the S5 preview in Safari, Share → Add to Home Screen, open it from there, sign in.
   Settings → Developer → turn on "Notifications on this phone" → Allow. Tap "Send a test notification" and
   lock the phone: within a minute "Test notification" arrives. Tapping it opens Developer.
2. **Android:** the same with the other test account (close the Chrome tab after installing).
3. **New request:** on any browser, sign up with a new email and type the code. Within a minute the owner's
   phone gets "New request" (or "Novo pedido") with that email; tapping it opens Requests.
4. **One phone per account** (optional): sign in with the same account on the second phone and turn
   notifications on there; reopen the app on the first phone: its switch is off, and only the second gets
   the test.
5. **The log and the kill switch:** SQL Editor →
   `select at, kind, status, reason from private.send_log order by at desc limit 20;` shows each push (no
   text). `update private.push_config set mode = 'off';`, send a test: nothing comes;
   `update private.push_config set mode = 'on';`, send another: it comes.

**Round 3 answers (owner, 2026-10-31): 7 b, 8 b, 9 a, 10 a, and preps written while creating a goal (the
new goal, Edit goal, the intro, a template's habit) take the new rows too, without the card.** Built the same
day: a bell beside each step's date (`ReminderChip`), the one prep editor (`PrepEditor`) redone as rows, the
card in the prep sheet only. The questions as asked:
- Q7, the card on project steps: **a** a step opens a sheet like a task (name, notes, End date, the card;
  renaming moves into it; a set reminder shows a small bell after the step's date), Claude's suggestion;
  **b** a bell button beside each step's date opens the menu on the project page (Custom in a small sheet).
- Q8, the card on preps: **a** the prep sheet as it is, with the card under it (Claude's suggestion); **b**
  the prep sheet redone as rows like a task. Either way, choices up to 1 day before (a prep repeats weekly):
  At the time, 5, 15, 30 minutes, 1 hour, 2 hours, 1 day before; Custom in minutes, hours and days.
- Q9, steps whose end date is spread from the project's (not set by hand): **a** they can remind too,
  following the date shown (Claude's suggestion); **b** only steps with an end date set by hand.
- Q10, preps written while creating a goal: **a** the card only in the prep sheet on the goal's page
  (Claude's suggestion); **b** in the new-goal steps and Edit goal too.

**Part 3 answers (owner, 2026-10-31):**
- **Settings → Notifications follow the account:** saved as one synced, encrypted record (collection
  `prefs`, id `notifications`), so any of the account's phones plans the same pushes, and a task finished on
  any device takes its push back once that device syncs (spec NO-19 updated).
- **Quick Add shows the Notification card** too, once a date is set.
- **The app's beta flag:** Settings → Notifications shows only to accounts the server sends to: the owner and
  `private.push_beta` in Shadow mode, every member when the mode is On (or Off: the kill switch doesn't hide
  it). Signed out, it shows to offer sign-in (spec NO-18).

**Part 3: what was built (2026-10-31):**
- `src/lib/planner.ts` (pure, tests first in `src/lib/planner.test.ts`, 24 tests): every push for the next 14
  days. The morning summary per day (built with Today's own `buildDay`, as if that day were today: timed items
  with their time, then late ones, then the rest, 3 names and "and 3 more"; empty days and, with Weekdays only,
  weekends skipped; a summary set before the day's rollover hour belongs to the day before). The weekly
  review on Mondays while a week waits (`reviewPending`). Reminders on tasks, a project's own tasks, projects,
  steps (by each step's end date, as Today spreads them) and preps (before each of their times, skipping a
  day already done); nothing for done, deleted or paused items. Reminders within 15 minutes merge ("2 things
  at 11:00"). Ids are deterministic (`sum:<day>`, `rev:<day>`, `rem:<fire ms>`).
- `src/lib/reminders.ts`: the menu's choices, when a reminder fires (minutes and hours back from the moment;
  days, weeks and months back on the calendar at the same time of day, so daylight saving doesn't move it;
  31 March less a month is 28 February), the labels, and the push's "when" text. `src/lib/zoned.ts`: wall
  clocks in any time zone with Intl (a skipped time moves forward; a doubled one takes the first).
- `src/sync/planner.ts`: after every sync, plans, hashes each row (its content and the subscription's key),
  and when anything changed reads the server's waiting rows, deletes what's gone, and encrypts and upserts
  only what's new or different. Nothing changed: one small read (the subscription) and nothing else.
- The Notification card (`src/ui/ReminderCard.tsx`) in the task sheet, Quick Add, a new project and a
  project's details: None to start, an iOS pull-down menu (None, the choices still ahead, Custom), Custom's
  two wheels with the red line. Taking the date off takes the reminder with it.
- Settings → Notifications (`src/screens/Notifications.tsx`), first row of Settings → App: Morning summary
  (time, Weekdays only with its line), Reminders you set, Weekly review (time); the cards for signed out,
  not installed, not allowed yet, and turned off (iPhone or Android steps); on Android, a line about pop-ups
  (§5); Developer: Send a test notification. The Developer switch from part 2 is gone.
- Developer → Pushes (owner only): On / Shadow / Off. `supabase/migrations/0008_push_controls.sql`:
  `push_status()` (mode, in the rollout, owner) and `set_push_mode()` (owner only). Tested on PGlite: 18
  checks, run twice.
- A reminder's push opens its task over Today (`/?task=<id>`); a project's or step's opens the project; a
  prep's its goal; the summary Today; the review Review.

**Choices made while building (the owner may change any):**
- Times show as the app shows them elsewhere ("08:00", "1 June"), not "8:00" / "June 1" as in the mockup.
- Custom starts from the choice already made ("15 minutes before"), or 1 hour (1 day with a date only).
- A reminder whose time has gone by stays in the menu, ticked, until changed; it just sends nothing.
- At most 290 waiting pushes (the server takes 300), so a test push always fits.

**Owner's setup for part 3:**
1. **Migration:** Supabase → `smart-meta-staging` → SQL Editor → paste
   `supabase/migrations/0008_push_controls.sql` → Run. Then Advisors → Security Advisor: anything new goes to
   Claude. (The dispatcher didn't change: no deploy.)

**To test part 3 on the S5 preview** (after Vercel rebuilds; reopen the app twice so it updates):
1. **Settings → Notifications** (first row under App): the switches are on if "Notifications on this phone"
   was on in part 2; otherwise tap "Turn on notifications" → Allow.
2. **A reminder:** add a task for today with a time 10 minutes ahead; Notification → "5 minutes before".
   Five minutes before, "the task's name / Today, HH:MM" arrives; tapping it opens the task.
3. **Done takes it back:** another task like it, ticked off before its push: nothing comes.
4. **Two at once:** two tasks with "At the time" at the same minute: two pushes, stacked; tapping one
   opens Today with "Now" (those two), the tapped one lit. *(Changed 2026-10-31: no more "2 things at …".)*
5. **Morning summary:** set its time 3 minutes ahead (with something on Today): "Today: N things" arrives.
   Then put it back.
6. **Other phone:** on the second phone (same account), tick off a task whose reminder is still ahead: the
   first phone gets nothing for it.
7. **Kill switch:** Developer → Pushes → Off, send a test: nothing comes; On again, another: it comes.
8. **Beta flag:** Pushes → Shadow: the friend account's Settings has no Notifications row (reopen
   Settings); On again: it's back.
9. **Timing:** `select at, kind, fire_at, status, reason from private.send_log order by at desc limit 20;`
   `at` should be within a few seconds of `fire_at`.

**Owner's test of part 3, 2026-10-31, and the fixes the same day** (answers in chat):
- **D** (two tasks 5 minutes apart) came as a single reminder once, and right the next try: the phone planned only
  after each sync (2 seconds after a change), so locking it right after saving could skip the plan. Now it
  also plans 0.8 s after a change and when the app goes to the background.
- **Developer → Pushes** couldn't change the mode: "UPDATE requires a WHERE clause" (Supabase's API refuses
  an UPDATE with none, even on one row; PGlite doesn't). Fixed by `0009_push_mode_where.sql`.
- "from Meta" under each push: iPhone adds it (the Home Screen app's name, `short_name`); a web app can't
  remove it or move it beside the title. Renamed "Smart Meta" (owner): the Home Screen name is set when the
  app is added, so it shows once the app is added again.
- New decisions (owner): **each reminder is its own push**, never "2 things" (NO-9); **the summary counts
  kinds** (NO-1); **a reminder opens Today on its row**, lit a moment, with "Now" in the filter when others
  came within 15 minutes, only the tapped one lit (NO-13; steps and preps too when on Today); **a task's date
  changed the same day it was set, or within 30 minutes, isn't struck as put off** (a change of mind).
- UI fixes: a drag that starts on a wheel no longer pulls the sheet down (every sheet); the Notification
  card and the step's bell open the **phone's own picker**, as a task's goal does, with lines between None,
  the choices and Custom where the phone draws them (the custom menu is gone); Custom's wheels offer only
  what's still ahead (minutes up to the time left, no unit with none); tapping the red line folds the wheels
  and keeps the choice; the summary's time no longer has a line under "Weekdays only"; "Reminders you set"
  is now "Reminders" / "Lembretes"; preps in the new-goal form, Edit goal, the intro and templates take the
  form's grey cards and grey day buttons (as Frequency and the chips), not black.
- Asked: Settings → Notifications in the mockup also had **Goal review dates** and **On this phone** (badge,
  details, quiet hours): those come in S6, as planned.

**Owner's setup for the fixes:** Supabase → `smart-meta-staging` → SQL Editor → paste
`supabase/migrations/0009_push_mode_where.sql` → Run.

**Second round, the same evening (answers in chat):**
- **Shadow beta from the app:** Developer → Requests → a member → "Shadow beta" switch; the list says
  "Shadow beta" beside them. `0010_owner_push_tools.sql`: `push_beta_members()` and `set_push_beta()`,
  owner only, members only. Tested on PGlite (12 checks, run twice).
- **No fuse for the owner** (owner, to test): the same migration takes the owner's account out of N-8 in
  `dispatch_claim` and `dispatch_requests` (0006's, with only that changed). Whether the fuse was hit shows
  in the send log: `select at, kind, reason from private.send_log where reason = 'fuse' order by at desc;`
- **A notification whose time has passed** warns on saving (task sheet, Quick Add, a new project, and
  Done editing on a project's details), as an iOS action sheet: Save anyway, or Change it. A step's bell
  only offers what's ahead; a step whose date moves closer isn't warned about (it has no save).
- **The white page on Back:** the app updates itself as soon as it opens after a deploy, reloading on
  whatever screen it was. The Back entries under that screen belonged to the page from before the reload,
  and going back into them showed a blank white page on the iPhone. A freshly loaded page now counts as the
  bottom of the stack (Back goes to the screen's parent), and the log notes "fresh page at depth N". The
  iPhone's own swipe from the edge can still reach those old entries.
- **Signing out offline** left the phone's push subscription in place, so pushes could still come. The
  phone now drops its own subscription first; the server's copy goes when the push service answers "gone".
- Renamed the Home Screen app "Smart Meta" (`short_name`, `apple-mobile-web-app-title`).
- **Known limit, travel (NO-14):** pushes are planned for the phone's time zone when it last planned. After
  landing, the first open (or sync) plans again for the new zone; until then they come at the old zone's
  wall time.

**Third round (owner's test on the iPhone, Android fine):**
- **A single reminder didn't light its row** (two at once did): the row sat below the screen, and the smooth
  scroll to it didn't happen as the app came to the front from the push, so the glow played out of sight.
  Now it waits until the app shows, jumps to the row at once (as Reminders does), and each tap lights it
  again, the same row included. The log says "remind open task found" (or "missing") for each tap.
- **The morning summary didn't come:** not a bug. Each day has one summary (`sum:<day>`), and the server
  keeps a push that's already gone out as it is (0006, `scheduled_guard`), so it can't be sent twice. Today's
  had come in the first test; moving its time to test again changed nothing. The step's reminder is its own
  push, so it came. Test the summary on another day; `select id, status, fire_at from
  public.scheduled_notifications where id like 'sum:%' order by fire_at desc limit 3;` shows it.

**Fourth round (iPhone, after the third):** neither the single row nor "Now" (two at once) showed any
more. Likely cause: a new build before each test, and the app installs it with a reload as soon as it comes
to the front, so opening it by tapping a push reloaded it mid-way: the link was read, the address cleaned,
then the page reloaded and the link was gone. The link is now kept (this session's storage, 2 minutes at
most) until its row has been shown with the app on screen; a row not there yet (still syncing) waits for
it. The log has "push tapped / remind" for each tap, then "remind link" and "remind open task found". The
Android line about pop-ups is gone (owner).

**Fifth round (iPhone, from the owner's log):** it worked only when the iPhone had closed the app, so the
tap opened a new window at the push's address. With the app still open in the background, the iPhone
brought it to the front but the service worker's message never arrived (no "push tapped" line at all), or
it reloaded the app at plain `/`. The service worker now also leaves the tap in a cache (`smart-meta-tap`,
read once, a minute at most); the app reads it on start and each time it comes to the front (again 0.6 s
and 2 s later, in case the worker is still writing it). The message and the cache carry the tap's time, so
only one acts. The log says "push tapped message" or "push tapped kept".

**Owner's setup for the second round:** paste `supabase/migrations/0010_owner_push_tools.sql` → Run (after
0009). To see the new name, remove the app from the Home Screen and add it again (sign in again after).

- [x] VAPID keys; service worker push and click handlers (deep links). *(Part 2.)*
- [x] One subscription per user; re-subscribe on open; diagnostics logged (spec NO-23). *(Part 2.)*
- [x] Planner (tests first) with phone-encrypted payloads; upload only the difference. *(Part 3.)*
- [x] Dispatcher: every minute, stale drop at 15 min, fuse 20/day, kill switch, send log. *(Part 2.)*
- [x] Types: morning summary (lists due items), custom reminders from the Notification card (once; tasks,
      projects, steps, preps), weekly review (own time). *(Part 3: the card on tasks, Quick Add and
      projects; the bell beside a step's date; the card in the prep sheet.)*
- [x] Settings → Notifications (Morning summary with time and weekdays only, Reminders, Weekly
      review with time; Goal review dates and the "On this phone" rows come in S6, as the mockup says).
      *(Part 3.)*
- [x] **Kill switch in the app** (owner, 2026-10-31): an owner-only row in Developer, On / Shadow / Off,
      checked on the server like approving a request (`private.is_owner()`), so pushes can be stopped from
      the phone. The SQL Editor still works: `update private.push_config set mode = 'off'`. *(Part 3,
      `0008_push_controls.sql`.)*
- [x] Developer test button *(part 2, tested)*. Beta flag for the owner *(part 3, tested: Shadow hides the
      row from accounts not in the beta; the beta list is switched from Developer → Requests, 0010)*.
- [x] ~~Shadow week on the preview~~ (owner, 2026-11-01): skipped; S5 merges as tested. The shadow
      feature stays: after S6, on production, the owner picks who gets pushes from Developer → Requests
      and sets Pushes to On when ready (spec NO-17).
- [x] **Push to the owner on each new access request** (spec AC-5), moved here from S2 on
      2026-10-29: title "New request", body the email (owner, 2026-10-31); tapping it opens Requests. Sent by the server when someone
      signs up, so it needs this stage's VAPID keys, server sender and the owner's subscription.
      Not planned by the phone, and encrypted by the server rather than the phone (it holds only an
      email, which the owner sees anyway). Doesn't count toward the owner's cap of 3. *(Part 2, tested.)*
- **Done when:** the owner gets correct pushes for a week on the preview. **Done 2026-11-01** by the
  owner's call after testing on both phones (the week moved to production, after S6).

### S6. The rest, then merge

Started 2026-11-01 on branch `notifications-s6`. The owner's split: **part A** (the features, tested on the
preview), then a compaction, then **part B** (production and the merge, with a step-by-step for every
setting). Mockups: [Smart Meta S6 Mockups](https://claude.ai/artifact/JGqJ6CnYgTeRYFAcDSbcZv).

**Part A answers (owner, 2026-11-01):**
- **Celebration:** option A (a full screen, a ring in the goal's value color closes, a tick, Done), with more
  motion, "not too much". If the motion doesn't please, keep plain A: drop the sparks, glow and pulse in
  `src/styles.css` (`.cele-spark`, `.cele-glow`, `cele-pulse`).
- **It plays** on a goal review saved with "Yes", whatever comes next, and on "Close it out". "Goal completed"
  when the goal ends, "You hit it" when it goes on. A review answered "No" gets the usual "Saved" toast.
- **Goal review date push:** at the morning summary's time (even with the summary off), no time of its own.
- **Details off:** the push's kind only (option B), no name or count, and it still opens the same place.
- **Quiet hours:** everything waits until they end, reminders too. Nothing is skipped.
- **Those three rows follow the account**, as "How they arrive" (see §2).

**Part A: what was built (2026-11-01):**
- `src/lib/planner.ts` (tests first, 15 new): the goal review push (`gol:<day>:<goal>`, kind `goal-review`, which
  0006 already allows; a habit goal on its review date, an outcome goal when its extra days end, as the goal's
  page; it counts toward N-7). Quiet hours move a push's `fire_at` and keep its id, so a push already sent
  stays sent if they're turned on later (the server keeps those rows as they are), and a push held overnight
  stays planned when the phone plans again at night. A reminder arriving the day after it was due says
  "Yesterday, 23:00". "Now" on Today uses the time it arrived.
- **Badge:** each push carries its day's number (`badge` in `PushMessage`, encrypted like the rest), the service
  worker sets it (`public/push-sw.js`), and `src/ui/AppBadge.tsx` keeps it right while the app is open.
- Settings → Notifications: "Goal review dates"; the section "How they arrive" (App icon badge, Details on the
  lock screen, Quiet hours with From and To wheels). Prefs are in the synced `prefs` record, no migration.
- `src/ui/Celebration.tsx`, `.cele` in `src/styles.css`: CSS animations only, two taps of the phone as the ring
  closes, reduced motion just fades. Developer → Goal celebration → Play it shows it again.

- **The owner's "New request" waits too** (owner's question, 2026-11-01). It's the one push the server starts by
  itself, and the settings are encrypted, so the owner's phone tells the server the owner's own quiet hours
  (`0011_request_quiet.sql`, `private.push_config`, owner only; nobody else's hours reach the server). During them
  nothing goes out and `requests_seen_at` stays; when they end, what came in goes out, unless already approved.
  Tested on PGlite with stand-ins: 30 checks, run twice. No dispatcher deploy: only the SQL changed.

**Choices made while building (the owner may change any):**
- **The badge counts less than Today's total:** commitments and preps of the day, and tasks and steps due today
  or late (as Today's "Today" filter). Today also lists tasks due later and tasks with no date; counting those
  would keep the number up for good ("late + left today", NO-20). The morning summary still counts everything.
- More than 3 goal review dates on one day (with the cap of 3): the rest get no push; their pages still ask.

The S6 preview has its Vercel Preview variables (Supabase URL and key, `VITE_VAPID_PUBLIC_KEY`, all staging's).

**Set up for the test (owner):**
1. Supabase → `smart-meta-staging` → SQL Editor → paste `supabase/migrations/0011_request_quiet.sql` → Run. Advisors →
   Security Advisor: anything new goes to Claude.
2. Cloudflare → Turnstile → "Smart Meta" → Settings → add `smart-meta-h2ur-git-notifications-s6-daccache.vercel.app`.
3. On the iPhone, open that address in Safari, add it to the Home Screen, open it from there. Sign in with the
   owner's staging account (code, Face ID). Settings → Notifications → "Turn on notifications" → Allow. Same on
   Android if wanted; pushes go to whichever phone turned them on last, so finish on the iPhone.

**To test part A** (on the phone that turned notifications on; the test account needs a goal and a task):
- **A. Settings.** Settings → Notifications. "What you get" has "Goal review dates"; below it, "How they arrive" has App
  icon badge (off), Details on the lock screen (on), Quiet hours (off). Quiet hours on: From and To wheels open, the
  blue line says "22:00 to 07:00" and follows the wheels. Close and reopen the app: all still there. On the other
  phone, after it syncs: the same. Turn Quiet hours back off.
- **B. The celebration's motion.** Settings → Developer → Goal celebration → Play it, a few times. The ring closes, the
  phone taps twice, the words come in. Pronto closes it. Too much, too little, or right?
- **C. A real celebration.** On a goal that started before today: Edit → "Review on" today → save. The page shows
  "Review date reached" → Review → Yes → Close it out → Save. The ring plays with "Goal completed"; Pronto shows the
  goal's page; Back goes to the goals. Then on another goal, the same with Yes → Renew: "You hit it". Another with
  No: only the "Saved" toast. A maintenance goal → Close it out: it plays.
- **D. The goal review push.** A goal that started before today: Edit → "Review on" today. Settings → Notifications →
  Morning summary → time 3 minutes ahead. Wait with the app closed: "Review date reached" with the goal's name. Tap it:
  the goal opens. Then Goal review dates off, and repeat on another goal: nothing comes. Put both back.
- **E. Details off.** Details on the lock screen off. A task for today, with a time 10 minutes ahead and Notification
  "5 minutes before". Lock the phone: "Reminder", with no name. Tap it: Today, on that task. Details back on.
- **F. Quiet hours hold a reminder.** Quiet hours on, From the current time, To 5 minutes ahead. A task with a reminder
  arriving 2 minutes from now. Nothing comes at 2 minutes; it arrives within a minute after they end, with its name.
- **G. A held reminder can be cancelled.** The same again, and tick the task off before they end: nothing comes.
- **H. "New request" waits.** Quiet hours on, From now, To 5 minutes ahead. In another browser (or a private tab), sign up
  on the same preview with a new email. No push yet; Developer → Requests already lists them. Within a minute after
  quiet hours end: "New request" with that email. Quiet hours off, and sign up again with another email: it comes
  at once. Reject the test requests.
- **I. The badge.** App icon badge on. Leave the app: the icon shows what's late or left today (tasks due today or
  late, plus today's commitments and preps). Open it, tick one off, leave: one less. Leave the app with a reminder
  coming: the push sets the number for its day. Badge off, open and leave: the number is gone.
- **J. Send anything odd to Claude.** Settings → Developer → Diagnostics log has the details.

**Owner's test of part A, first round (2026-11-01), iPhone:**
- **A tap lit its row only when the app had been closed.** The log showed the tap arriving and the row found both
  ways, and in the dev app the row lights from Today and from inner screens. Likely cause, not proven on the phone:
  with the app in the background the row lit up behind the iPhone's own animation and had faded by the time the app
  showed. It now waits until the app has been at the front for 0.7 s (`FRONT_SETTLE_MS` in `src/screens/Today.tsx`).
- **The goal review push may not have come.** Open: the log suggests it was planned. To find out: `select at, kind,
  fire_at, status, reason from private.send_log where kind in ('goal-review', 'summary') order by at desc limit 10;`
  To test again: each goal has its own push a day, not tied to the summary (another habit goal with "Review on" today, the
  summary's time 3 minutes ahead; an outcome goal waits for its extra days). To reset the day's rows on staging: `delete
  from public.scheduled_notifications where id like 'sum:%' or id like 'gol:%';`, then change the summary's time.
- **White screens, in Safari and the app.** Cause not known. The log has no crash lines, and one reload at an inner screen
  (the S5 "white page on Back" case, which each new build can bring). `public/boot-guard.js` now notes each open
  ("boot open in the app") and any file that failed to load, and if nothing is drawn after 8 s it logs that and offers a reload.
  The next white screen's log, from the same place (Safari and the app keep separate logs), should say which it is.

**Second round (same day):**
- **The goal review push works** (a habit goal; the owner's first try was an outcome goal, which waits for its extra
  days). It comes once per goal per day, by design: moving the summary's time again doesn't send it again.
- **White screen and stuck app on fast Back, in the installed app.** The owner: "navigating back very fast"; closing the
  app was the only way out. Two bugs found and reproduced in the dev app. (1) A quick second Back counted the same screen
  twice and went one too far, onto entries from before a reload: from depth 2, three quick Backs landed under the bottom
  of the stack; those entries are what showed a blank white page on the iPhone in S5. Now one Back at a time, what's
  asked meanwhile waits (`backing` in `src/ui/router.ts`). (2) Opening a screen while Back was still sliding reused its
  layer with the slide's end still applied: the new screen stayed off to the side, everything under it inert. The slide is
  now cancelled when it ends. **Not proven on the iPhone;** the iPhone's own edge swipe doesn't go through this code.
- **A tap with the app in the background still didn't work.** One bug found: a tap to the address the app was first
  opened at was ignored for as long as the app stayed open (`launchedAt`), so a goal's push tapped a second time did nothing.
  Also: the row waits for a real frame as well; the app looks for the tap for 10 s, not 2; a page in the background
  doesn't animate. The log now says "app came to the front" and how long after the tap it read it, for the next round.

**Third round (same day):** a goal's push and a reminder's, tapped with the app in the background, both work now (owner).
**What the white screen is:** the owner's screenshot from before these fixes shows the iPhone's own browser bar inside the
installed app ("Search or enter website name", no address, back, share, reload). So it isn't our page: it's the empty entry
under the app's first screen, reached by going back too far, and none of our code runs there, which is why the log and the
guard saw nothing. That fits the first Back bug above. No white screen since that fix, but not many tries yet. **Open:** the
iPhone's own edge swipe doesn't go through `goBack`, so a swipe on the bottom screen might reach that entry too. If it does,
the fix is a spare entry at the bottom of the stack that a swipe lands on, in `src/ui/router.ts`.

**Fourth round (same day):** the owner reproduced the white screen with a quick swipe from the edge, not every time; not
with Back taps since the fix. Every other test passed. So the installed iPhone app now keeps two spare entries under its first
screen (`SPARE_ENTRIES`, `src/ui/router.ts`): a swipe lands there and the same screen goes back on at once, with the spare
entries under it again. Only with `navigator.standalone`: in a browser Back has to be able to leave, and on Android it closes
the app. The log says "swipe stopped at the first screen". What the swipe looks like on the phone isn't known yet; a
swipe on the first screen slides and comes back to the same screen.

### S6 part B: production and the merge (step by step)

Written in part A so it survives the compaction; check each against the code as you go. Claude can't do the
**Owner** steps (accounts and secrets; Claude gets no Supabase access) and gives them one at a time, waiting
for each. **Secrets never go in chat.** Production is project ref `oqhwkjhuuaeopahhcxac` (`.env.production`).

**Before any of it (Claude):** part A tested by the owner; `notifications-s6` merged into `notifications` (S6's
docs up to date); `origin/main` merged in if it has anything new; tests and build pass; a release note in
`src/lib/releases.ts` (ask the owner for its text; `package.json` version up); privacy policy date still right.

1. **Owner, a copy first:** on each phone with data, Settings → export the JSON backup, and keep it.
2. **Owner, backups to production (`smart-meta-backups`):** github.com/phdaccache/smart-meta-backups → Settings
   → Secrets and variables → Actions: replace `DATABASE_URL` and `RESTORE_DATABASE_URL` with production's session
   pooler URI (Supabase → production project → **Connect** → **Session pooler**, with `[YOUR-PASSWORD]` replaced
   by production's database password; if lost, Database → Settings → Reset database password, which nothing else
   uses). **Claude:** updates the repo's README ("staging only") and runs a full backup, so there's a copy of
   production **from before the migrations**. Checks the run passed.
3. **Owner, email (production → Authentication):** custom SMTP on: host `smtp.gmail.com`, port 465, user and sender
   `smartmeta.codes@gmail.com`, the Gmail app password from the password manager, sender name "Smart Meta". Rate
   limit: 30 emails an hour. Email provider: confirm email **on**, code length **6**, expiry 1 hour (3600 s).
4. **Owner, templates:** Authentication → Emails → "Confirm signup" and "Magic Link": paste what staging has (the
   code only, English and Portuguese together; copy them from `smart-meta-staging`).
5. **Owner, sign-ups and captcha:** Authentication → sign-ups **on**, anonymous sign-ins **off**. Attack
   Protection → Turnstile captcha **on**, with the secret key from the password manager. Cloudflare → Turnstile →
   "Smart Meta": check the production address `smart-meta-h2ur.vercel.app` is among its hostnames. Supabase's "personal
   provider" warning about Gmail is expected (§14 S2).
6. **Owner, VAPID (production's own pair):** in `Documents\smart-meta`: `node scripts/vapid-keys.mjs`. Save both
   lines in the password manager as "Smart Meta VAPID (production)". Supabase → production → Edge Functions →
   Secrets: add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. **Send Claude only the public line**; Claude adds it to
   Vercel as `VITE_VAPID_PUBLIC_KEY`, Production only.
7. **Owner, migrations, right before the merge** (0003 refuses unencrypted writes, §16.3: from here to step 10 should
   take minutes, and every phone's writes just wait until it updates). Supabase → production → SQL Editor, each
   file pasted and Run, in order, one at a time; Claude waits for each:
   `0002_accounts.sql` (existing accounts become members), `0003_keys.sql`, `0004_limits.sql`,
   `0005_daily_rows_policy.sql`, `0006_push.sql` (mode starts at `shadow`: leave it), then in a new query
   `select vault.create_secret('https://oqhwkjhuuaeopahhcxac.supabase.co/functions/v1/dispatch', 'dispatch_url');`,
   then `0007_pg_net_schema.sql`, `0008_push_controls.sql`, `0009_push_mode_where.sql`, `0010_owner_push_tools.sql`, `0011_request_quiet.sql`.
8. **Owner, the dispatcher:** in PowerShell, in the repo folder: `npx supabase login`, then
   `npx supabase functions deploy dispatch --project-ref oqhwkjhuuaeopahhcxac --no-verify-jwt --use-api`, then
   **`npx supabase logout`** right away, and delete the token in Supabase → Account → Access Tokens.
9. **Owner, checks:** Integrations → Cron: `smart-meta-dispatch` and `smart-meta-purge` listed, the first succeeding
   each minute. Edge Functions → `dispatch` → Invocations: a 200 each minute. Advisors → Security Advisor: anything
   new goes to Claude ("Leaked Password Protection" doesn't apply; see §14 S5).
10. **Claude, the merge (only on the owner's go):** `notifications` into `main`, push; checks the Production deployment
    on Vercel is ready and the site answers.
11. **Owner, the first phone:** open the installed app (reopen it so it updates). Sign in with an email code, Face ID
    (a new passkey: the address is new). The phone's data seals and uploads. In the SQL Editor, this should
    say 0: `select count(*) from public.records where not (data ? 'e');`. Second phone: same account, Face ID opens
    the data; the data matches. Settings → Notifications → turn on; Developer → Pushes shows Shadow; send a test.
12. **Owner, the restore drill:** with a test account on production, as in §14 S4 (Claude runs the workflow); then
    delete the test account.
13. **Owner, a week of real use** in Shadow (spec NO-17): only the owner gets pushes. Nothing scheduled.
14. **Friends (spec NO-28):** each opens the app and signs in once with a code (the password sign-in is gone,
    spec AC-14) and Face ID. Developer → Requests → a member → "Shadow beta" for the first ones; when ready, Developer
    → Pushes → On.

**Rollback:** the kill switch (Developer → Pushes → Off, or `update private.push_config set mode = 'off';`) stops
pushes at once. App: Vercel → Deployments → promote the last good one; 0003's check would refuse an older app's
writes, so they'd wait on the phones until the app is forward again. Nothing on the phones is lost.

- [ ] Goal review date, in-app celebration. *(Built in part A, waiting for the owner's test.)*
- [ ] App icon badge, quiet hours, lock-screen details toggle. *(Built in part A, waiting for the owner's test.)*
- [ ] Part B: production set up, migrations, backups, merge, the owner first, then friends.
- **Done when:** merged to `main` and friends have it.

### What the owner needs to set up, and when

- **Staging Supabase project:** in S1 (**done 2026-10-29**). Supabase → New project → name
  `smart-meta-staging`, region São Paulo, Free; save the database password in a password manager.
  Claude needs only the project URL and the publishable (anon) key, which are public by design.
- **Private backups repo:** in S4. GitHub → New repository → `smart-meta-backups`,
  **Private**, empty. Secrets (database connection string, encryption key) are pasted into its
  settings by the owner, never into chat.
- **App Gmail account:** in S2. New Gmail, 2-Step Verification on, create an app password,
  paste it into Supabase's SMTP settings yourself.
- **Cloudflare account** (free) for Turnstile: **done in S1** (2026-10-29), widget "Smart Meta".
- **Vercel:** turn off preview protection and add Preview environment variables: **done in S1**.
- **VAPID keys** (push): in S5, `node scripts/vapid-keys.mjs`; the private key only in Supabase → Edge
  Functions → Secrets, the public one to Claude for Vercel. **Done for staging 2026-10-31**; production
  gets its own pair in S6.
- **Supabase CLI** (deploying Edge Functions): `npx supabase login`, deploy, then `npx supabase logout` and
  delete the token in Account → Access Tokens, so no token stays on the computer Claude works on.

---

## 15. Later (not now)

- **Social:** share chosen entries; maybe shared goals and projects. Keep: profiles in their own
  table, stable user ids, a key pair per user from S3, push infrastructure reusable for "Ana
  shared a goal".
- **Next feature after the MVP: smarter commitment reminders.** The owner's idea: remind at the last
  possible moment, when the commitment is at risk (for example on Saturday with "2× a week" still
  open, remind Saturday and Sunday; with 3 open, start on Friday). Claude's notes for when we design
  it:
  - At the very last moment there's no room left: one skip and the week is lost. Reminding **one day
    before the last possible day** leaves a margin (2 open with 3 days left → start reminding).
  - Put these **inside the morning summary** ("Gym: 2 left this week, today or tomorrow") instead of
    separate pushes, so they don't use the cap of 3.
  - The app already computes pace and "at risk" in `scoring.ts`; reuse it so the reminder and the
    screen agree.
  - Let the user choose per commitment: off, at-risk only, or every planned day.
- **Repeating custom reminders**, and with them **reminders on commitments** (open feature, owner
  2026-10-31: no reminder on commitments in the MVP, since they have no date; add repeat after).
- **More ways to unlock** (moved from S3 by the owner, 2026-10-29): move the key from the old phone with a
  QR code, an optional recovery code, a second passkey. `user_keys.locks` already holds several locks;
  adding one needs an update grant on that column only.
- Google sign-in (if iPhone support improves), photo avatars, snooze, Android actions, evening
  logging reminder, custom domain + Resend.

---

## 16. Open questions

1. **Privacy policy** (S4): whether a lawyer reviews it before friends use it (recommended), and the "what
   changed" notice in the app when a new version comes (promised in its section 12, not built yet; needed
   only once there is a version 2).
2. **Locked out of the server copy** (S3): someone who loses every way to unlock (iCloud Keychain off and
   the phone gone, or the Apple ID lost) can't read the server copy; the phone's own data and JSON export
   still work, and sync stays paused. A "start over with this phone's data" choice (new keys, the server
   copy replaced) would let sync resume, but it erases whatever only the server had. Build it, and when?
3. **Merging to `main` after S3** (for S6): once the owner's production data is sealed, any device still
   on an older app version would pull ciphertext it can't read. Before the production migration, every
   device should be on the new version (the PWA updates on open). And 0003 refuses readable writes, so it
   goes to production together with the app that encrypts; an older app's writes then wait on its phone
   until it updates.

Answered on 2026-10-31 (S5, after testing): app updates keep reloading at once when the app comes to the
front (owner: leave it as it is); the app keeps a tapped push until it's shown and its own Back stays
inside the app, which covered what this broke during the tests. The shadow week is the owner's to run by
hand, nothing scheduled.

Answered on 2026-10-31 (S5): the kill switch goes in the app too, as an owner-only Developer row (part 3).
The privacy policy now lists the app's language among the notification data (the push subscription keeps it
for the owner's "New request" text), with the owner's OK. Version 1 was corrected in place and dated
31 October 2026: it has never reached `main`, so nobody needs a "what changed" notice yet.
"Restore from a backup" signs in existing accounts only; a new email gets the usual "Something went wrong.
Try again." and no code (Supabase's `shouldCreateUser: false`), so the screen doesn't say who has an
account. The owner's first idea, saying so only after a correct code, was dropped: Supabase makes the
account when it sends the code, so it would need deleting at once, with a ghost "New request" push and
the phone's owner to guard against. Spec AC-1 updated; built the same day.

Answered on 2026-10-30 (S4): the privacy policy's choices stand as drafted: the owner's full name (Pedro
Henrique Antoine Cortez Daccache) as controller, `smartmeta.codes@gmail.com` as the contact, minimum age
18, and no DPO appointed (ANPD Resolution 2/2022, art. 11, small processing agents).

Answered on 2026-10-29 at the start of S3: Face ID right after the code, also while waiting; only the owner
has data on production (everyone else's first sync happens after S6); staging test data can be deleted;
old-phone transfer and recovery code later; staging test accounts are temporary.

Answered on 2026-10-29: **every stage is tested on its own branch's preview** (owner's choice), so
each stage needs its staging Preview variables in Vercel (Claude adds them) and its preview hostname
in the Turnstile widget (the owner adds it); a new Home Screen icon per stage. Supabase changes are
pasted into the staging SQL editor by the owner; Claude gets no Supabase access. The push to the
owner on a new request moves to S5.

Answered on 2026-10-21 (kept for the record): push the branch (done); a time set on a task or prep
counts as asked for; commitments get once-only reminders for now; late items aren't re-sent; weekly
review is its own push with its own time; name and avatar visible; metadata acceptable; drop the
owner-made password accounts; stale window 15 minutes for everything; seven stages. S0 mockup order:
notifications, sign-in, avatars, Settings → Notifications, "Not synced yet".

---

## Change log

- **2026-10-21 (1):** plan started. Notifications and friend accounts back in scope. App plans, server
  delivers. Three stages.
- **2026-10-21 (2):** owner's answers: no Google sign-in (unstable on installed iPhone app); email codes
  from a dedicated app Gmail; captcha; approval with waiting screen and cap 100; built-in avatars with
  many options, mockups first; several devices allowed; no custom domain; stale window 30 minutes; at
  most 3 app-started pushes a day, custom reminders always pushed; due dates: no time → morning
  summary, with a time → also at that time; weekly review its own push on Monday morning; custom
  reminders on tasks, projects, steps, preps and commitments (not goals); badge without the review;
  morning summary 8:00 with weekdays-only option; **the owner must not see user data** → passkey-based
  end-to-end encryption (pending iPhone spike), phone-encrypted notifications; prototypes/mockups before
  implementation; test on the fixed branch preview with a staging project and merge only when
  notifications work nicely. Database 25.8 MB, region São Paulo.
- **2026-10-21 (3):** branch pushed. Encryption decided (passkey, or a password-manager-saved data
  password if passkeys fail in the installed app); email, name, avatar and metadata visible to the
  owner is accepted. Approve with one tap from a Requests screen. Stale window 15 minutes for every
  type. Weekly review with its own editable time. Commitments: once-only reminders now; at-risk
  reminders are the next feature. Drop owner-made password accounts. Several devices allowed; "Not
  synced yet" indicator. Check-in growth from toggling documented with fixes (§3.5). GitHub backup
  rules analyzed (§10). Work split into seven stages, S0 to S6, one session each (§14).
- **2026-10-21 (4):** docs moved to `docs/notifications/` with a README (how sessions work, shared
  decisions, stage status) and a checkable [spec](spec.md). Quick undo window 30 minutes. Row limits
  proposed (§3.5). Sync timing decided (§6.10): soon after changes, plus a flush when leaving the app;
  not "only on close". The privacy note must state that email and metadata are visible.
- **2026-10-21 (5):** row limits confirmed. Spec checked against the whole conversation; missing items
  added (see its coverage note). All numbers moved to one table, spec "Adjustable numbers" (N-1 to
  N-25), defined in one place in code (RE-5). Clarified: syncing more often adds requests, not rows.
- **2026-10-21 (6):** S0 started on branch `notifications-s0`. Owner's rule: one branch per stage,
  cut from `notifications` and merged back. Mockup order set (notifications, sign-in, avatars,
  Settings → Notifications, "Not synced yet"). Notification wording picked (§2): summary A, due A,
  reminder C with the goal for goal items and no why, weekly review B, prep A, goal review B.
- **2026-10-23 (1):** sign-in flow picked (§2 "Sign-in flow"): full screens like the intro, starting
  with "Activate notifications" after "Not only goals", plus a swipe-away "Sync and get notifications"
  banner on Today (back after a day, a week, a month, then never). In Safari, "Sign in from the app"
  replaces the email step. Spec AC-8 and AC-9 updated with the owner's changes. `origin/main` merged in.
  Then: tapping the banner goes straight to the email step; "Go to Today" on screen 9 too; no bar title
  on screens 8, 9 and 11. The mockup is final for S0; smaller changes happen while building.
- **2026-10-29 (1):** avatar picked (§6.4): any emoji on a system color, gradient, solid or soft, with
  a light pattern; no ring, no initials.
- **2026-10-29 (2):** Settings → Notifications picked (§2 "UI decisions"): one page, switches that open
  their options like Quick Add, banner-style cards for "not allowed yet" and "no account". The owner
  removed the status rows. Diagnostics become logs users don't see (spec NO-23 changed).
- **2026-10-29 (3):** "Not synced yet" picked (§6.9): a quiet status at the right of Today's date line;
  Settings → Sync shows the last sync time and an icon that explains. **S0 done:** every mockup
  picked; the mockups live in `docs/notifications/mockups/` and the picks in §2, §6.4 and §6.9.
- **2026-10-29 (4):** **S1 done** on branch `notifications-s1`. Staging Supabase, Vercel preview
  variables (per branch), preview protection off and the Turnstile widget set up (§13). A throwaway
  test page proved on the owner's iPhone (iOS 26.6) and Android (Chrome 156), inside the installed
  app: passkey PRF works, push arrives in about 5 s and a tap opens the app, Turnstile passes.
  **Encryption method chosen: passkey with PRF**, data password as fallback with guards (§7.2).
  Learned: open the window first on a push tap (Android); no banner on Android is a phone setting
  (§5). S1 tested on its own preview; from S2 on, ask whether to merge first (§16.2). Test page and
  test VAPID keys deleted.
- **2026-10-29 (5):** **S2 started** on branch `notifications-s2`, with its staging Preview variables
  in Vercel. Owner's answers: every stage is tested on its own preview (§16.2 closed); Claude gets no
  Supabase access, so the owner pastes SQL into the staging SQL editor; the owner's account is
  `pedrodaccache@gmail.com`. The push to the owner on a new request moves from S2 to S5 (spec AC-5):
  S1 sent its push by hand from a local script, but this one must go out by itself whenever someone
  signs up, which needs S5's server sender.
- **2026-10-29 (6):** S2 built on `notifications-s2`, waiting for the owner's test on the preview:
  email-code sign-in with Turnstile (password sign-in removed), the accounts migration (members,
  profiles, approve, requests, delete account), Activate notifications after the intro, "Not now",
  the Safari hint, Waiting for access and List is full, the Today banner, Requests, name and avatar,
  one owner per phone, sign-out and delete account. Choices made while building are listed under S2.
- **2026-10-29 (7):** **S2 done.** The owner tested sign-up, waiting, approval, sync, sign-out, delete
  account, deleting requests and removing members on two phones. Last additions: "Save a copy and remove
  it" when the phone holds someone else's data (AC-13), spec AC-7 to the green banner, new AC-17 (delete a
  request) and AC-18 (remove a member), README's membership line made stricter (profiles too), and the
  production setup listed under S6. `notifications-s2` merged into `notifications`.
- **2026-10-29 (8):** **S3 started** on branch `notifications-s3`, with its staging Preview variables in
  Vercel. Built the same day, waiting for the owner's test: data key and sharing key pair, passkey and
  data-password locks, encrypting sync wrapper with the migration of readable rows, `user_keys` and the
  readable-record check (0003), screens 5, 7 and 11, the "end-to-end encrypted" line on. Old-phone
  transfer and recovery code moved to §15. §9 corrected: passkeys tie the data key to the app's address.
  New open questions 16.2 (locked out) and 16.3 (merging after S3).
- **2026-10-29 (9):** S3 tested by the owner on both phones; all six steps pass. Found on Android: the
  Chrome tab left open after installing shares the database with the app and, frozen in the background,
  blocks it. Added the "open twice" warning (can't be dismissed, owner's choice), one access check at a
  time, and a diagnostics log in Developer.
- **2026-10-29 (10):** **S3 done.** The owner confirmed it; `notifications-s3` merged into `notifications`.
- **2026-10-29 (11):** **S4 started** on branch `notifications-s4`, with its staging Preview variables in
  Vercel. Owner's answers: backups against staging until S6 (then only the secret changes); Claude creates
  the backups repo; the privacy note is a legal privacy policy under the LGPD. Built the same day, waiting
  for the owner's setup and test: the private backups repo (backup, alarm, restore), `0004_limits.sql`
  (limits, clock guard, purge), quick undo as a tombstone, the new sync timing with a flush on leaving,
  "Not synced yet", security headers, the privacy policy, `src/numbers.ts`. Choices listed under S4.
- **2026-10-30 (1):** S4 set up and tested by the owner: 0004 and 0005 on staging, the backup key (public half
  as a repository variable), the secrets, nightly backups on, the alarm's test email, the phone tests and the
  restore drill on Android (the first try restored nothing: the drill had no "back up first" step, now added).
  Activate notifications reworked on the owner's request. Staging accounts from S3 deleted where needed
  (passkeys belong to each preview's address). **S4 done**; `notifications-s4` merged into `notifications`.
  Still open for the owner: the privacy policy's choices (§16.1).
- **2026-10-30 (2):** the owner confirmed the privacy policy's four choices: full name as controller,
  `smartmeta.codes@gmail.com` as contact, minimum age 18, no DPO. §16.1 keeps only the lawyer's review and
  the change notice.
- **2026-10-30 (3):** S5 started on `notifications-s5`, in three parts (mockups, plumbing, the rest). The
  owner proposed custom reminders as a switch on the item, off by default, counted from its date or time.
  Consolidated S5 mockup published (`mockups/s5.html`) with three layouts, the push texts and three questions
  (§14 S5); waiting for the picks.
- **2026-10-31:** owner's round 1 answers on the S5 mockup. Custom reminders become a **Notification card**
  as in Reminders (None to start, a menu of choices still ahead, Custom with two wheels). Items with a time
  and preps no longer push by themselves (answers 1a, 3a); no reminder on commitments, repeating reminders
  later (2a). Task and project reminder text: when it's due, as times only ("Today, 14:30"); step text
  "CV & LinkedIn · step 1 of 4"; access request "New request" + email. Spec NO-2, NO-3, NO-5, NO-9, NO-19
  and AC-5 updated. Round 2 of the mockup published with questions 4 to 6.
- **2026-10-31 (2):** round 2 answers: "At the time" / "On the day" first in the menu (4a); date-only
  reminders at the morning summary's time (5); the Notifications row first in Settings → App (6a). S5 part 1
  (mockups) done; next, part 2 (plumbing).
- **2026-10-31 (3):** S5 part 2 (plumbing) built: the shared Web Push module (matches RFC 8291's example),
  `0006_push.sql` (47 checks on PGlite), the `dispatch` Edge Function (run end to end on Deno), the service
  worker's push and tap handlers, subscriptions on the phone, Developer's switch and test push, the alarm's
  push check. Vercel Preview variables for `notifications-s5` added. Waiting for the owner's setup and test.
- **2026-10-31 (4):** owner's VAPID public key added to Vercel (Preview, `notifications-s5`). Security
  Advisor after 0006: `pg_net` in `public` → `0007_pg_net_schema.sql` moves it to `extensions` (0006 now
  installs it there); leaked-password protection doesn't apply (no passwords). The CLI token is removed
  right after each deploy, so Claude still has no Supabase access.
- **2026-10-31 (5):** S5 part 2 done: the owner set it up and tested it on both phones. Fixed from the
  test: a tapped push no longer adds the screen already shown to Back; shorter Developer subtitle; a phone
  that signed in with no goals goes to Today with Getting started instead of the intro (owner's OK). New
  open questions 4 (sign-up from Restore) and 5 (kill switch in the app).
- **2026-10-31 (6):** owner: the kill switch goes in the app (owner-only Developer row, part 3); for
  Restore, only existing accounts sign in, with how and when to say so still being discussed (§16 question 4).
- **2026-10-31 (7):** "Restore from a backup" signs in existing accounts only (spec AC-1, owner's OK);
  a new email gets the generic error and no code.
- **2026-10-31 (8):** sign-in navigation audited from every way in (Activate, Today's banner, Settings, the
  Restore page, Settings → Sync's Face ID row, the prompt as the app opens), walked in the dev app. Fixed:
  the data password's Back returns to Face ID; leaving Face ID or Unlock goes back where sign-in began
  (Today after Activate); Getting started's close button works on a phone that skipped the intro. Finishing
  a sign-in still goes to Today (or Waiting for access over Today) from everywhere.
- **2026-10-31 (9):** docs checked before compacting: README's tables (the `private` push tables), plan's
  facts rewritten for part 3, the owner's setup list (VAPID keys, the CLI), new open question 4 (the
  language in the privacy policy). Next: S5 part 3.
- **2026-10-31 (10):** privacy policy: "the app's language" added to the notification data, in both
  languages (owner's OK); version 1 corrected in place, dated 31 October 2026 (not on `main` yet).
- **2026-10-31 (11):** S5 part 3 built: the planner (24 tests: time zones, daylight saving, midnight, done,
  deleted, paused projects, language, merging), the upload of only what changed, the Notification card on
  tasks, Quick Add and projects, Settings → Notifications, the owner's kill switch and the app's beta flag
  (`0008_push_controls.sql`, 18 checks on PGlite). Owner's answers: the settings sync with the account
  (spec NO-19), the card in Quick Add, Settings → Notifications only for accounts in the rollout. Next: the
  owner pastes 0008 and tests; a round 3 mockup for the card on steps and preps.
- **2026-10-31 (12):** S5 mockup round 3 published (same artifact, tab "Steps and preps"): the Notification
  card on project steps and preps, two layouts each, questions 7 to 10 in §14 S5. The planner already handles
  both; only their editors wait for the answers.
- **2026-10-31 (13):** round 3 answered (7 b, 8 b, 9 a, 10 a) and built: a bell beside each step's date
  (spread dates too), its menu on the project page, Custom in a small sheet; preps as rows like a task
  everywhere they're written (prep sheet, new goal, Edit goal, intro, template habits), the Notification card
  only in the prep sheet (up to 1 day before; Custom up to 24 hours or 6 days). Spec NO-3 updated. A planner
  test for a spread step's reminder (25 planner tests).
- **2026-10-31 (14):** the owner's test of part 3 and the fixes: each reminder its own push (no merging;
  N-10 now the window for Today's "Now"); a reminder opens Today on its row, lit, with "Now" when several
  came together; the summary counts kinds (N-13 dropped); planning 0.8 s after a change and on going to the
  background; `0009_push_mode_where.sql` for the kill switch; a task's date changed the same day or within 30
  minutes isn't put off (`dateSetAt`); the phone's own picker for the Notification card and the step bell;
  Custom only what's still ahead, its red line folds the wheels; no drag-to-close from a wheel; prep rows'
  colors in forms; "Lembretes". Spec NO-1, NO-3, NO-9, NO-13, N-10, N-13 updated (owner's decisions).
- **2026-10-31 (15):** second round from the owner: the shadow beta switched from Developer → Requests and
  no fuse for the owner (`0010_owner_push_tools.sql`, spec NO-16, NO-17); a warning when saving a
  notification whose time has passed (spec NO-3); Back after the app reloads itself stays in the app (the
  white page); signing out offline drops the phone's subscription first; the app renamed "Smart Meta".
- **2026-10-31 (16):** iPhone: a single reminder's row is jumped to and lit once the app shows (it lit out of
  sight); the summary not coming again the same day explained (one a day, sent ones are kept).
- **2026-10-31 (17):** a push's link to Today is kept until shown with the app on screen, surviving the
  reload of an update; taps logged; the Android pop-ups line removed (owner).
- **2026-10-31 (18):** owner's test: the highlight and "Now" work on the iPhone. "Now" leaves out what's due
  another day (a step due tomorrow with "1 day before" had joined it); spec NO-13.
- **2026-10-31 (19):** a tapped push reaches an app the iPhone only brought to the front: the service worker
  leaves the tap in a cache the app reads on start and on coming to the front.
- **2026-10-31 (20):** S5 tested and fixed; what's left is the shadow week (from 1 November). Docs brought
  up to date (the S5 header and checklist, "Reminders", no merged pushes, the push ids in the README's
  shared decisions); open question 4, app updates reloading at once.
- **2026-10-31 (21):** open question 4 answered (updates keep reloading at once); the shadow week is run by
  the owner by hand.
- **2026-11-01 (22):** **S5 done** (owner): no shadow week on the preview; the shadow feature stays for
  production after S6, where the owner sets the beta list. `notifications-s5` merged into `notifications`.
- **2026-11-01 (23):** S6 started. Part A built on `notifications-s6`: goal review push, quiet hours (everything
  waits), details off (the kind only), badge, Settings' "How they arrive" (follows the account), the goal
  celebration (option A with more motion). Part B's step-by-step written in §14. Waiting for the owner's test.
