# Notifications and accounts: spec

**What** the feature must do, as short, checkable requirements. **How** and **why** (research,
trade-offs, designs) live in [plan.md](plan.md); each requirement points to its section there. If the
two disagree, this spec wins until the owner decides otherwise; then both are updated.

Status: agreed with the owner on 2026-10-21. Nothing implemented yet. Requirement IDs never change
meaning; a dropped requirement is struck through, not reused.

How to check: every requirement is either true or false on the preview (or in code review). The
stage that delivers it is in brackets, see [plan.md §14](plan.md).

---

## Scope

**In:** accounts for the owner and friends, end-to-end encrypted sync, web push notifications, the
settings and screens around them.

**Out (for now):** Google sign-in, photo uploads, social features, repeating reminders, at-risk
reminders for commitments, snooze, evening logging reminder, custom domain, calendar integration,
paid plans. See [plan.md §15](plan.md).

---

## Functional requirements

### Accounts (AC)

- **AC-1** [S2] Sign-in and sign-up are one flow: the user types an email, receives a **6-digit code**
  and types it in the app. No link opens Safari. No password.
- **AC-2** [S2] Codes are sent from a **dedicated app Gmail account**, not the owner's personal one.
- **AC-3** [S2] A **captcha** (Cloudflare Turnstile) runs before a code is sent, including "resend".
- **AC-4** [S2] Without approval, a signed-in user sees **"Waiting for access"**, keeps using the app on
  the phone, and stores **nothing** on the server.
- **AC-5** [S2] The owner gets a **push for each new request** and approves it with **one tap** from a
  Requests screen in Developer mode. Only the owner can approve.
- **AC-6** [S2] At most **100 members**. Past that, new users see that the list is full and keep
  waiting.
- **AC-7** [S2] On approval, everything the user created locally uploads, and "You're in" shows once.
- **AC-8** [S2] The sign-in card appears **after the user creates their first goal**, with "Not now".
- **AC-9** [S2] "Not now" shows a popup: without an account there are **no notifications** and data
  stays only on this phone. Sign-in stays available in Settings.
- **AC-10** [S2] In Safari on iPhone (not installed), sign-in asks to open the app from the Home Screen.
- **AC-11** [S2] Profile: **name** and a **built-in avatar** with many options (chosen from S0
  mockups). No photo uploads.
- **AC-12** [S2] **Delete account** in Settings removes the account and all its server data, then wipes
  the phone.
- **AC-13** [S2] **One person per phone:** another person's data is never uploaded into an account and
  two people's data never mix on a phone. Sign-out only when everything is synced, after offering a
  JSON export. ([plan §6.8](plan.md))
- **AC-14** [S2] The owner-made password accounts are removed; the owner signs in with codes too.
- **AC-15** [S2] No anonymous accounts.

### Privacy and encryption (PR)

- **PR-1** [S3] **The owner cannot read any user's content**: records, planned notifications and
  backups are end-to-end encrypted on the phone. ([plan §7](plan.md))
- **PR-2** [S3] **Users never manage a key.** The key comes from their passkey, or, if passkeys don't
  work in the installed app, from a data password their password manager generates and saves.
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
  visible.

### Sync (SY)

- **SY-1** [S2] **The user never loses data**, in conflicts, sign-out, account switches or migrations.
- **SY-2** [S4] Changes reach the server **within a few seconds** while online (not on every tap
  individually; see [plan §6.10](plan.md)).
- **SY-3** [S4] Pending changes are **flushed when the app goes to the background**, and sync runs when
  the app opens and when the connection returns.
- **SY-4** [S4] A subtle **"Not synced yet"** indicator shows while changes haven't reached the server,
  and clears when they have.
- **SY-5** [S4] Several devices may sync one account. A phone with a wrong clock cannot overwrite newer
  edits.
- **SY-6** [S4] A check-in **undone within 30 minutes** is erased instead of kept as "undone" history.
- **SY-7** [S4] Server limits per user stop runaway writes (bugs, scripts) without affecting normal
  use or the first upload. ([plan §3.5](plan.md))

### Notifications (NO)

Types:
- **NO-1** [S5] **Morning summary**: one push, default **8:00**, editable, optional **weekdays only**,
  skipped on empty days; lists timed items first, then late, then the rest, at most 3 names and
  "+N more".
- **NO-2** [S5] **Due dates:** items without a time appear in the morning summary; items **with a
  time** also get a push **at that time**. Project steps follow the same rule.
- **NO-3** [S5] **Custom reminders**, once only, on **tasks, projects, project steps, preps and
  commitments** (not goals). Always sent.
- **NO-4** [S5] **Weekly review**: its own push on **Monday**, with its **own editable time** (default
  8:00).
- **NO-5** [S6] **Preps with a time**: a push at that time.
- **NO-6** [S6] **Goal review date reached**: a push.
- **NO-7** [S6] **Goal completed / target hit**: an in-app celebration, no push.
- **NO-8** No pushes for: missed logging, goal status changes, sync, release notes, plan tomorrow,
  stalled projects.

Rules:
- **NO-9** [S5] Pushes **the app starts by itself** (summary, weekly review, goal review date): **at
  most 3 a day**. Pushes the user asked for (custom reminders, items or preps with a time) **always**
  go out. Items close in time are merged into one push.
- **NO-10** [S5] Pushes arrive **on time** (normally within a minute). A push more than **15 minutes**
  late is dropped, never sent late.
- **NO-11** [S5] **Finishing or deleting an item cancels** its pending push (once the phone has synced).
- **NO-12** [S5] Late items are not pushed again.
- **NO-13** [S5] Tapping a push **opens that item** (task, project, goal) or Today.
- **NO-14** [S5] Pushes use the **app's language** and the user's **time zone**, including travel and
  daylight saving.
- **NO-15** [S5] Pushes go to **one device per account**: the latest that turned notifications on.
- **NO-16** [S5] A server-side **fuse** of 20 pushes per user per day, a **kill switch**, and a send log
  without content.
- **NO-17** [S5] Before friends: a **shadow week** that logs what would be sent without sending.
- **NO-18** [S5] Notifications require an account; without one, Settings explains why and offers
  sign-in.

Settings and indicators:
- **NO-19** [S5] **Settings → Notifications:** a toggle per type, summary time, weekdays only, review
  time.
- **NO-20** [S6] **App icon badge:** toggle, **off by default**, counts **late + left today** (not the
  review).
- **NO-21** [S6] **Lock-screen details:** on by default; off sends generic text.
- **NO-22** [S6] **Quiet hours:** off by default.
- **NO-23** [S5] **Diagnostics row:** permission, subscription, last push delivered.
- **NO-24** [S5] **Denied permission:** instructions to turn it back on.
- **NO-25** [S5] **Send a test notification**, Developer mode only.
- **NO-26** No bell icon and no in-app inbox.

---

## Non-functional requirements

### Cost (CO)
- **CO-1** Free plans only: Supabase Free, Vercel Hobby, GitHub Free, Cloudflare free, Gmail.
  **$0 a month.** No custom domain.
- **CO-2** [S4] A usage **alarm** emails the owner when the database passes 60% (300 MB), a user writes
  unusually much, or pushes jump.
- **CO-3** A documented plan for running out of free tier exists ([plan §3.4](plan.md)).

### Security (SE)
- **SE-1** Every table has row-level security and explicit grants; nothing is granted to `anon`.
  Security Advisor is clean after each migration.
- **SE-2** **No user input is trusted**, our own app included: sizes, counts, time windows and allowed
  values are checked on the server; user text is never rendered as HTML.
- **SE-3** Secrets (service role, VAPID, SMTP, backup keys) live only in Supabase, GitHub or Vercel
  secret settings: never in the repo, a `VITE_` variable or chat.
- **SE-4** [S4] A Content-Security-Policy header is in place.
- **SE-5** Non-members can't write anything to the server.
- **SE-6** The dispatcher can't be triggered from outside.

### Reliability (RE)
- **RE-1** [S4] **Encrypted backups**: weekly full plus nightly changes, in a private repo, with a
  restore tested on staging.
- **RE-2** [S5] The notification planner has unit tests for time zones, daylight saving, midnight,
  done and deleted items, paused projects and language.
- **RE-3** Encryption has tests for round trip, wrong key, lost key and migration.
- **RE-4** There is always a second copy: the phone keeps its local data unencrypted, and JSON export
  keeps working.

### Platforms (PL)
- **PL-1** iPhone first (installed Home Screen app; iOS 16.4+ for push, 18+ for passkeys); Android is a
  bonus, lightly tested.

### Experience (UX)
- **UX-1** Apple-native look and behavior, few badges (the owner's UI direction).
- **UX-2** [S0] **Mockups first:** 2 to 3 options per notification type, avatars, sign-in and waiting
  screens, and the "Not synced yet" indicator, picked by the owner before building.
- **UX-3** All new text in English and Portuguese; no em dashes in app copy; Portuguese approved by the
  owner.

### Process (PC)
- **PC-1** All work on branch `notifications`, tested on its **Vercel preview** (fixed branch address,
  protection off) against a **staging Supabase project**. Friends' data is never touched by tests.
- **PC-2** **Merge to `main` only when notifications work nicely** on the preview (end of S6).
- **PC-3** `origin/main` is merged into the branch regularly.
- **PC-4** Each stage is one session; it starts by reading [README.md](README.md), this spec and its
  stage, and ends by updating the docs.
