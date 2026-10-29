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
| **Due date, with a time** | ✅ In the morning summary **and** its own push at the exact time. |
| **Custom reminder** | ✅ On **tasks, projects, project steps, preps and commitments** (not goals: no purpose). **Once only** for now, commitments included. **Always pushed** (never capped). Repeating reminders and **at-risk reminders for commitments** are the next feature after the MVP (§15). |
| **Weekly review** | ✅ Its own push on Monday morning, **with its own editable time** (default the same as the morning summary, 8:00). |
| Project steps | ✅ Same rules as due dates (steps have end dates). |
| Late items | Not pushed again after their time; only counted in the badge (confirmed). |
| Preps with a time | ✅ |
| Goal review date reached | ✅ |
| Goal completed / target hit | ✅ In-app celebration only, no push. |
| Test notification | ✅ Developer mode only (the owner). |
| Misses logging (evening) | ❌ Skipped for now. |
| Goal status change | ❌ Shown in Review. |
| Sync | ❌ In-app only. |
| Release notes | ❌ In-app only. |
| Plan tomorrow | ❌ |
| Stalled project | ❌ Already in Review. |

The owner's top three: custom reminder, due date, review ready.

**Daily limits:** pushes **the app starts by itself** (morning summary, weekly review, goal review
date) are **at most 3 a day**. Pushes the user asked for (custom reminders, timed due dates, preps
with a time) **always go out**, merged when close together. A server-side **safety fuse of 20 a day**
catches bugs. A time the user set on a task or prep counts as "asked for" (confirmed).

### Notification wording (picked in S0, 2026-10-21)

Picked from the [notifications mockup](mockups/notifications.html) (artifact:
[Smart Meta Notifications](https://claude.ai/artifact/AkC6PcpN3kvGXDBSi54c87)). Every push has the app's
icon and name; the title is one line on the lock screen (cut with "…"), the body up to four lines.

| Type | Pick | Title | Body |
|---|---|---|---|
| Morning summary | A | "Today: 6 things" / "Hoje: 6 itens" | One sentence, at most 3 names (N-13): timed items with their time, then late ones marked, then the rest, then the count left. "Dentist appointment at 14:30, Renew gym membership (late), Gym and 3 more" / "Consulta no dentista às 14:30, Renovar a academia (atrasada), Academia e mais 3" |
| Due at a time | A | The item's name | "Due at 14:30" / "Vence às 14:30". **Merged** (within N-10): title "2 things at 11:00" / "2 itens às 11:00", body one item per line, later ones with their time ("Send the invoice, 11:10") |
| Custom reminder | C, adjusted | The item's name | Context, no why. **Project step:** "Step 1 of 4 in CV & LinkedIn." / "Etapa 1 de 4 em Currículo e LinkedIn." **Goal item** (habit): the goal, then the week so far: "Exercise regularly · 1 of 3 this week" / "Fazer exercício com frequência · 1 de 3 nesta semana". **Task without a goal:** its due date when it has one ("Due today." / "Vence hoje.") |
| Weekly review | B | "Weekly review" / "Revisão da semana" | "Look back at last week and plan this one." / "Confira a semana passada e planeje esta." Same text every week, no numbers |
| Prep with a time | A | The prep | "Prep · Exercise regularly" / "Preparo · Fazer exercício com frequência" |
| Goal review date | B | "Review date reached" / "Chegou a data de revisão" | The goal's name |

Not settled by the mockup (decide in S5, ask the owner if unclear): the reminder body for a prep,
a project as a whole, and a task with no goal and no due date.

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
- **Lock-screen details:** shown by default, can be turned off.
- **Quiet hours:** available, off by default.
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
   30 minutes (a misclick or a change of mind), both rows are removed; if they never synced, they
   never leave the phone. Older undos keep today's behavior, so History still shows real "undone"
   events. Misclicks no longer appear struck through in History.
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
- **Grouping:** iPhone stacks notifications from one app; Android bundles them. The planner also merges
  items close in time ("3 things at 9:00").
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
     is stored on the server. The owner gets a push: "New request: ana@…". If there are already 100
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
  (or autofill).

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
- [ ] Private backups repo (owner creates it); weekly full + nightly changes, encrypted; restore drill.
- [ ] Usage alarm in the backup job.
- [ ] Database rules: size limit on `data`, row limits per user (§3.5), clock guard.
- [ ] Quick undo within 30 minutes erases (§3.5); tombstone purge.
- [ ] Sync timing (§6.10): debounce with a cap, flush on background, timer only while visible.
- [ ] "Not synced yet" indicator.
- [ ] Content-Security-Policy; Security Advisor clean.
- [ ] Privacy note in Settings, written together; it states that email, name, avatar and metadata
      are visible to the owner and content isn't (spec PR-7, PR-8).
- **Done when:** a restore into staging works and the alarm fires on a test threshold.

### S5. Push, core
- [ ] VAPID keys; service worker push and click handlers (deep links).
- [ ] One subscription per user; re-subscribe on open; diagnostics logged (spec NO-23).
- [ ] Planner (tests first) with phone-encrypted payloads; upload only the difference.
- [ ] Dispatcher: every minute, stale drop at 15 min, fuse 20/day, kill switch, send log.
- [ ] Types: morning summary, due dates (no time → summary; with time → also at that time), custom
      reminders (once), weekly review (own time).
- [ ] Settings → Notifications (per type, summary time, weekdays only, review time).
- [ ] Developer test button. Beta flag for the owner → shadow week.
- [ ] **Push to the owner on each new access request** (spec AC-5), moved here from S2 on
      2026-10-29: "New request: ana@…", tapping it opens Requests. Sent by the server when someone
      signs up, so it needs this stage's VAPID keys, server sender and the owner's subscription.
      Not planned by the phone and not encrypted (it holds only an email, which the owner sees
      anyway). Doesn't count toward the owner's cap of 3.
- **Done when:** the owner gets correct pushes for a week on the preview.

### S6. The rest, then merge
- [ ] Preps with a time, goal review date, in-app celebration.
- [ ] App icon badge (late + today), quiet hours, lock-screen details toggle.
- [ ] Merge plan: apply migrations to production, deploy, enable for the owner, then friends.
- [ ] Production Supabase set up like staging was in S2, before deploying: custom SMTP with the app Gmail
      (`smartmeta.codes@gmail.com`, its app password pasted by the owner), the code-only "Confirm signup"
      and "Magic Link" templates, sign-ups on, anonymous sign-ins off, confirm email on, 6-digit codes,
      Turnstile captcha with its secret, 30 emails an hour; then `0002_accounts.sql` in the SQL editor
      (existing users become members), and Security Advisor checked. Friends sign in once with a code:
      the password sign-in is gone from the app (spec AC-14).
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
- Repeating custom reminders.
- **More ways to unlock** (moved from S3 by the owner, 2026-10-29): move the key from the old phone with a
  QR code, an optional recovery code, a second passkey. `user_keys.locks` already holds several locks;
  adding one needs an update grant on that column only.
- Google sign-in (if iPhone support improves), photo avatars, snooze, Android actions, evening
  logging reminder, custom domain + Resend.

---

## 16. Open questions

1. **Privacy note:** written together in S4 (owner's ideas, Claude drafts), shown in Settings.
2. **Locked out of the server copy** (S3): someone who loses every way to unlock (iCloud Keychain off and
   the phone gone, or the Apple ID lost) can't read the server copy; the phone's own data and JSON export
   still work, and sync stays paused. A "start over with this phone's data" choice (new keys, the server
   copy replaced) would let sync resume, but it erases whatever only the server had. Build it, and when?
3. **Merging to `main` after S3** (for S6): once the owner's production data is sealed, any device still
   on an older app version would pull ciphertext it can't read. Before the production migration, every
   device should be on the new version (the PWA updates on open). And 0003 refuses readable writes, so it
   goes to production together with the app that encrypts; an older app's writes then wait on its phone
   until it updates.

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
