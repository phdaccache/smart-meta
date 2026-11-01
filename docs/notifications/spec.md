# Notifications and accounts: spec

**What** the feature must do, as short, checkable requirements. **How** and **why** (research,
trade-offs, designs) live in [plan.md](plan.md); requirements point to its sections. If the two
disagree, this spec wins until the owner decides otherwise; then both are updated.

Status: agreed with the owner on 2026-10-21 and checked against the whole planning conversation (see
the coverage note at the end). Nothing implemented yet. Requirement IDs never change meaning; a
dropped requirement is struck through, not reused; new ones get the next number.

How to check: every requirement is either true or false on the preview (or in code review). The
stage that delivers it is in brackets; see [plan.md §14](plan.md). Every number lives in
**[Adjustable numbers](#adjustable-numbers)** at the end, referenced here as `N-…`.

---

## Scope

**In:** accounts for the owner and friends, end-to-end encrypted sync, web push notifications, and the
settings and screens around them, for about **50 daily users, up to 200**.

**Out for now:** Google sign-in, photo uploads, social features, snooze, evening logging reminder,
custom domain, calendar integration, paid plans.

**Next after this project** (keep the path clear, don't build): repeating custom reminders; at-risk
reminders for commitments ([plan §15](plan.md)); social sharing of chosen entries, maybe shared goals
and projects; photo avatars; Google sign-in if it becomes reliable on iPhone.

---

## Functional requirements

### Accounts (AC)

- **AC-1** [S2] Sign-in and sign-up are one flow: the user types an email, receives a **6-digit code**
  and types it in the app. No link opens Safari. No password. Friends create their own accounts.
  [S5] Except from the intro's **"Restore from a backup"**: there only an existing account signs in; a new
  email gets the usual "Something went wrong. Try again." and no code, so the screen doesn't tell who
  uses the app. (Owner, 2026-10-31.)
- **AC-2** [S2] Codes are sent from a **dedicated app Gmail account**, not the owner's personal one.
- **AC-3** [S2] A **captcha** (Cloudflare Turnstile) runs before a code is sent, including "resend".
- **AC-4** [S2] Without approval, a signed-in user sees **"Waiting for access"**, keeps using the app on
  the phone, and stores **nothing** on the server.
- **AC-5** [S2] The owner approves each new request with **one tap** from a Requests screen in
  Developer mode. Only the owner can approve. [S5] The owner gets a **push for each new request**: "New request", with the email as its body.
  (Push moved to S5 by the owner 2026-10-29.)
- **AC-6** [S2] At most `N-1` members. Past that, new users see that the list is full and keep waiting.
- **AC-7** [S2] On approval, everything the user created locally uploads, and a green banner on Today
  says so ("You've been accepted! Your goals are now backed up.") until swiped away. (Changed by the
  owner 2026-10-29: a banner, not a toast.)
- **AC-8** [S2] An **"Activate notifications"** screen appears **after the last onboarding screen**
  (after the first goal), with "Not now". Until the person syncs, Today shows a **"Sync and get
  notifications"** banner; swiping it away hides it for a day, then a week, then a month, then for good
  (sign-in stays in Settings). ([plan §2](plan.md), changed by the owner 2026-10-23)
- **AC-9** [S2] "Not now" shows a popup: without an account there are **no reminders and no backup**,
  and data stays only on this phone. Sign-in stays available in Settings.
- **AC-10** [S2] In Safari on iPhone (not installed), sign-in asks to open the app from the Home Screen.
- **AC-11** [S2] Profile: **name** and a **built-in avatar** with many options, enough to tell friends
  apart (style chosen from S0 mockups). No photo uploads.
- **AC-12** [S2] **Delete account** in Settings removes the account and all its server data, then wipes
  the phone.
- **AC-13** [S2] **One person per phone:** another person's data is never uploaded into an account and
  two people's data never mix on a phone. Sign-out only when everything is synced, after offering a
  JSON export. ([plan §6.8](plan.md))
- **AC-14** [S2] The owner-made password accounts are removed; the owner signs in with codes too.
- **AC-15** [S2] No anonymous accounts.
- **AC-16** [S2] The app stays **fully usable without an account** (local only), as today.
- **AC-17** [S2] The owner can **delete a request** (swipe in Requests, or its sheet): that sign-up is
  deleted and the person can sign up again. (Owner, 2026-10-29.)
- **AC-18** [S2] The owner can **remove a member**: their account and synced data are deleted, their phone
  keeps everything and works without sync, and Today shows a red "removed from sync" banner. The owner
  can't remove themselves. (Owner, 2026-10-29.)

### Privacy and encryption (PR)

- **PR-1** [S3] **The owner cannot read any user's content**: records, planned notifications and
  backups are end-to-end encrypted on the phone. ([plan §7](plan.md))
- **PR-2** [S3] **Users never manage a key.** The key comes from their passkey; if passkeys don't work
  in the installed app, or the user has no synced keychain, from a data password their password
  manager generates, saves and autofills. The app checks which one works and explains.
- **PR-3** [S3] Face ID (or autofill) is asked **once at account creation** and **once per new phone or
  after sign-out**, never in daily use.
- **PR-4** [S3] Losing the phone doesn't lose data when the user still has their Apple ID or Google
  account.
- **PR-5** [S3] Each user gets a **key pair** from the start, so sharing can be added later without
  redoing encryption.
- **PR-6** [S3] Existing plaintext data on the server is replaced by encrypted data; afterwards the
  dashboard shows only ciphertext.
- **PR-7** [S4] Visible to the owner, and stated in the privacy note: **email, name, avatar, and
  metadata** (number and type of records, when they change, sizes, when pushes are scheduled).
- **PR-8** [S4] A **privacy note** in Settings, written with the owner, says what is and isn't
  visible. Built as a privacy policy under the LGPD (`src/lib/privacy.ts`), confirmed by the owner on
  2026-10-30.

### Sync (SY)

- **SY-1** [S2] **The user never loses data**, in conflicts, sign-out, account switches, limits or
  migrations.
- **SY-2** [S4] Changes reach the server **within a few seconds** while online: `N-15` after the last
  change, at most `N-16` during continuous editing. Not one sync per tap. ([plan §6.10](plan.md))
- **SY-3** [S4] Pending changes are **flushed when the app goes to the background**; sync also runs when
  the app opens and when the connection returns; the periodic timer (`N-17`) runs only while the app
  is visible.
- **SY-4** [S4] A subtle **"Not synced yet"** indicator shows while changes haven't reached the server,
  and clears when they have.
- **SY-5** [S4] Several devices may sync one account. A phone with a wrong clock cannot overwrite newer
  edits (`N-18`).
- **SY-6** [S4] A check-in **undone within `N-14`** is erased instead of kept as "undone" history.
- **SY-7** [S4] Server limits per user (`N-2`, `N-3`, `N-4`, `N-5`) stop runaway writes (bugs,
  scripts, stolen accounts) without affecting normal use, the first upload after approval, or the
  encryption migration. Hitting one keeps the data on the phone, shows a sync error and alerts the
  owner. ([plan §3.5](plan.md))
- **SY-8** [S4] **Syncing more often adds requests, not rows.** Rows come only from user actions;
  editing an item updates its existing row. Conflicts stay rare because sync runs on open and before
  planning notifications.
- **SY-9** [S4] Deleted rows are purged after `N-19`.

### Notifications (NO)

Types:
- **NO-1** [S5] **Morning summary**: one push, default time `N-11`, editable, optional **weekdays
  only**, skipped on empty days. Title "Today: N things"; body how many of each kind, a kind with none left
  out: "Tasks: 4, Preps: 2, Commitments: 2, Projects: 3" (a project's current step counts for Projects).
  [S5, owner, 2026-10-31: replaced the list of up to `N-13` names.]
- **NO-2** [S5] **Due dates:** items with a due date appear in the morning summary. An item pushes only
  through its Notification card (NO-3), with or without a time (owner, 2026-10-31; before, items with a
  time pushed at that time by themselves). Project steps follow the same rule.
- **NO-3** [S5] **Custom reminders**, once only, on **tasks, projects, project steps and preps** (not
  goals; not commitments for now, repeating reminders come later). Set on a **Notification card** that
  appears when the item has a date: "None" to start; a menu of choices counted back from the due date and
  time ("At the time" or "On the day" first), listing only those still ahead; and Custom (1 to 200
  minutes, hours, days, weeks or months). With a date only, it fires at the morning summary's time. A
  prep's reminder follows each of its times. Always sent. [S5, owner, 2026-10-31] A **project step** sets it
  from a bell beside its end date on the project's page, whether that date was set or spread; a **prep** in
  its sheet on the goal's page (laid out as rows like a task), up to 1 day before. [S5, owner, 2026-10-31]
  The choices open in the phone's own picker (as a task's goal or project does); Custom's wheels offer only
  what's still ahead of now; tapping Custom's red line folds the wheels and keeps the choice. Saving with
  a notification whose time has passed (the date moved closer, or the screen stayed open past it) asks
  first: "This notification's time has passed. Nothing will be sent for it." Save anyway, or Change it.
- **NO-4** [S5] **Weekly review**: its own push on Monday, with its **own editable time** (default
  `N-12`).
- **NO-5** [S5] **Preps** don't push by themselves; their Notification card does (NO-3). (Owner,
  2026-10-31; before, every prep with a time pushed at that time in S6.)
- **NO-6** [S6] **Goal review date reached**: a push, once, at the morning summary's time (even with the summary
  off), with its own switch. For an outcome goal, the day its extra days end. [Owner, 2026-11-01]
- **NO-7** [S6] **Goal completed / target hit**: an in-app celebration, no push. It plays on a goal review saved
  with "Yes" (whatever comes next) and on "Close it out". [Owner, 2026-11-01]
- **NO-8** No pushes for: missed logging, goal status changes, sync, release notes, plan tomorrow,
  stalled projects.

Rules:
- **NO-9** [S5] Pushes **the app starts by itself** (summary, weekly review, goal review date): at most
  `N-7` a day. Pushes the user asked for (reminders set on a Notification card) **always** go
  out, **each as its own push**, as in Reminders: the phone stacks those that come together. ~~Items within
  `N-10` of each other are merged into one push.~~ (Owner, 2026-10-31.)
- **NO-10** [S5] Pushes arrive **on time** (normally within a minute). A push more than `N-9` late is
  dropped, never sent late.
- **NO-11** [S5] **Finishing or deleting an item cancels** its pending push (once the phone has synced).
- **NO-12** [S5] Late items are not pushed again.
- **NO-13** [S5] Tapping a push **opens that item** (task, project, goal) or Today. [S5, owner, 2026-10-31]
  A reminder for something on Today (a task, the current step, today's prep) opens **Today**, scrolled to its
  row, which lights up a moment, as in Reminders. When others reminded within `N-10` of it, Today's filter
  shows "Now": those rows only, the tapped one lit; of the others, only those due today or late (an early
  reminder for something due another day isn't "now"). Anything else opens its page.
- **NO-14** [S5] Pushes use the **app's language** and the user's **time zone**, including travel and
  daylight saving.
- **NO-15** [S5] Pushes go to **one device per account**: the latest that turned notifications on.
- **NO-16** [S5] A server-side **fuse** (`N-8` pushes per user per day), a **kill switch**, and a send
  log without content (kept `N-21`). [S5, owner, 2026-10-31] The owner's own account has no fuse, for
  testing.
- **NO-17** [S5] Before friends: a **shadow period** (`N-22`) that logs what would be sent without
  sending. [S5, owner, 2026-10-31] The owner adds members to it and takes them out in Developer →
  Requests (a member's sheet).
- **NO-18** [S5] Notifications require an account; without one, Settings explains why and offers
  sign-in.
- **NO-27** [S5] **Subscriptions are kept alive:** each app open checks the push subscription and
  quietly renews it; the server deletes subscriptions the push service reports as gone.
- **NO-28** [S6] **Rollout after merge:** the owner first, then friends.
- **NO-29** [S5] Notifications are **planned on the phone** for the next `N-6` and uploaded already
  encrypted; the server only delivers.

Settings and indicators:
- **NO-19** [S5] **Settings → Notifications:** a toggle per type (morning summary, reminders,
  weekly review, goal review dates), summary time, weekdays only, review time. Reached from the first
  row of Settings → App. The settings follow the account: synced and encrypted like the rest, so every
  phone of the account plans the same pushes (owner, 2026-10-31).
- **NO-20** [S6] **App icon badge:** toggle, **off by default**, counts **late + left today** (not the
  review): the day's commitments and preps, and tasks and steps due that day or late.
- **NO-21** [S6] **Lock-screen details:** on by default; off, a push says only its kind, no names or counts.
- **NO-22** [S6] **Quiet hours:** off by default (`N-26` once on). **Everything waits** until they end, reminders
  too, the owner's "New request" included; nothing is skipped. [Owner, 2026-11-01] These three follow the account,
  like the rest of NO-19.
- **NO-23** [S5] **Diagnostics are logged, not shown:** the send log (NO-16) keeps each push's result
  (delivered, failed, subscription gone), and the push subscription keeps when the phone last checked
  its permission and subscription. Users never see this. (Changed by the owner 2026-10-29: no
  diagnostics row in Settings.)
- **NO-24** [S5] **Denied or revoked permission:** instructions to turn it back on.
- **NO-25** [S5] **Send a test notification**, Developer mode only.
- **NO-26** No bell icon and no in-app inbox.

---

## Non-functional requirements

### Cost (CO)
- **CO-1** Free plans only: Supabase Free, Vercel Hobby, GitHub Free, Cloudflare free, Gmail.
  **$0 a month.** No custom domain. No move away from Vercel or Supabase.
- **CO-2** [S4] A usage **alarm** emails the owner (`N-20`). The Supabase and Vercel usage pages are the
  other places to watch.
- **CO-3** A documented plan for running out of free tier exists ([plan §3.4](plan.md)).
- **CO-4** The **runway simulator** ([runway-simulator.html](runway-simulator.html)) is kept up to date
  when limits or record sizes change.
- **CO-5** Designed for 50 daily users, up to 200 (the member cap `N-1` can grow).

### Security (SE)
- **SE-1** Every table has row-level security and explicit grants (required by Supabase from
  2026-10-30); nothing is granted to `anon`. Security Advisor is clean after each migration.
- **SE-2** **No user input is trusted**, our own app included: sizes, counts, time windows and allowed
  values are checked on the server; user text is never rendered as HTML; push payloads stay under
  4 KB.
- **SE-3** Secrets (service role, VAPID, SMTP, backup keys) live only in Supabase, GitHub or Vercel
  secret settings: never in the repo (it's public), a `VITE_` variable or chat.
- **SE-4** [S4] A Content-Security-Policy header is in place.
- **SE-5** Non-members can't write anything to the server.
- **SE-6** The dispatcher can't be triggered from outside.
- **SE-7** An attack can cause an outage at worst, **never a bill** (free plans; if a paid plan ever
  comes, its spend cap stays on).

### Reliability (RE)
- **RE-1** [S4] **Encrypted backups** (`N-23`) in a private repo, with a restore tested on staging.
- **RE-2** [S5] The notification planner has unit tests for time zones, daylight saving, midnight,
  done and deleted items, paused projects and language.
- **RE-3** [S3] Encryption has tests for round trip, wrong key, lost key and migration.
- **RE-4** There is always a second copy: the phone keeps its local data unencrypted, and JSON export
  keeps working.
- **RE-5** Every adjustable number below is defined **in one place** in code (one config module for
  the phone, one settings table or function for the server), so changing it means editing that place
  and this table.

### Platforms (PL)
- **PL-1** iPhone first (installed Home Screen app; iOS 16.4+ for push, 18+ for passkeys); Android is a
  bonus, lightly tested.

### Experience (UX)
- **UX-1** Apple-native look and behavior, few badges (the owner's UI direction).
- **UX-2** [S0] **Mockups first:** 2 to 3 options with fake examples for each notification type, plus
  Settings → Notifications, avatars, sign-in, waiting for access, Requests, passkey or data-password
  setup, and "Not synced yet". The owner picks before anything is built.
- **UX-3** All new text in English and Portuguese; no em dashes in app copy; Portuguese approved by the
  owner.

### Process (PC)
- **PC-1** All work on branch `notifications`, tested on its **Vercel preview** (fixed branch address,
  protection off) against a **staging Supabase project**. Friends' data is never touched by tests.
  Each stage works on its own branch `notifications-s<N>`, cut from `notifications` and merged back
  into it when the stage is done.
- **PC-2** **Merge to `main` only when notifications work nicely** on the preview (end of S6).
- **PC-3** `origin/main` is merged into the branch regularly.
- **PC-4** Each stage is one session; it starts by reading [README.md](README.md), this spec and its
  stage, and ends by updating the docs.
- **PC-5** The **shared decisions** in the README are changed only with the owner's OK, never quietly
  by one stage.

---

## Adjustable numbers

One table for every number the feature depends on. To change one: edit it here, in the one place in
code (RE-5), and add a line to the plan's change log. "Where" says what enforces it.

| ID | Value | Meaning | Where |
|---|---|---|---|
| N-1 | **100** | Members (approved users) at most | Server, approval function |
| N-2 | **30,000** | Rows per user in total. A row is one saved item (check-in, task, goal, review); edits don't add rows. Heavy use is about 1,200 a year | Server |
| N-3 | **5,000** | New rows per user per day (high on purpose for the first upload and the encryption migration) | Server |
| N-4 | **64 KB** | Size of one record | Server |
| N-5 | **300** | Pending planned notifications per user | Server |
| N-6 | **14 days** | How far ahead the phone plans notifications (server accepts up to 15 days) | Phone, server |
| N-7 | **3** | Pushes per day the app starts by itself | Phone planner |
| N-8 | **20** | Pushes per user per day, safety fuse | Server |
| N-9 | **15 minutes** | A push later than this is dropped | Server |
| N-10 | **15 minutes** | Reminders this close before the one tapped show with it under Today's "Now" (until 2026-10-31: merged into one push) | Phone |
| N-11 | **8:00** | Morning summary default time (user can change) | Phone |
| N-12 | **Monday 8:00** | Weekly review push default (user can change the time) | Phone |
| ~~N-13~~ | ~~3~~ | ~~Item names listed in the morning summary before "+N more"~~ (the summary counts kinds since 2026-10-31) | |
| N-14 | **30 minutes** | An undo within this erases the check-in instead of keeping it as history | Phone |
| N-15 | **2 seconds** | Sync waits this long after the last change | Phone |
| N-16 | **10 seconds** | Longest wait during continuous editing | Phone |
| N-17 | **5 minutes** | Periodic sync while the app is visible | Phone |
| N-18 | **5 minutes** | Edits stamped further than this in the future are rejected (clock guard) | Server |
| N-19 | **90 days** | Deleted rows are purged after this | Server job |
| N-20 | **300 MB (60% of 500)**; a user over 10,000 rows or 2,000 new in a day; pushes over twice last week's daily average | Usage alarm thresholds | Backup job |
| N-21 | **30 days** | Send log kept | Server |
| N-22 | **7 days** | Shadow period before friends get pushes | Process |
| N-23 | **Weekly full + nightly changes, 30 days kept** | Backup schedule and retention | Backup job |
| N-24 | **6 digits** | Sign-in code length | Supabase setting |
| N-25 | **30 per hour** | Sign-in emails Supabase may send (default with custom SMTP; Gmail allows about 500 a day) | Supabase setting |
| N-26 | **22:00 to 7:00** | Quiet hours to start with, once turned on (user can change) | Phone |
| N-27 | **15 seconds** | The app coming to the front this soon after a push counts as tapping it, since the iPhone doesn't always report the tap (`ANSWERED_MS`, plan §15) | Phone |

Free-plan limits of Supabase, Vercel and GitHub are not ours to set; they're in
[plan §3.1](plan.md) with the date they were checked.

---

## Coverage note (2026-10-21)

Checked against everything the owner asked or agreed in the planning session. Added in that check:
AC-16 (usable without an account), SY-8 (sync frequency vs rows), SY-9 (purge), NO-27 (subscription
upkeep), NO-28 (owner-first rollout), NO-29 (planned on the phone), CO-4 (simulator), CO-5 (scale),
SE-7 (no bills), RE-5 (numbers in one place), PC-5 (shared decisions), the wider UX-2 mockup list,
the "Next after this project" list, and the Adjustable numbers table.
