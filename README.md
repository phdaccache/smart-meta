# Smart Meta

A personal SMART-goals PWA for daily use on an iPhone.

- **How to use it:** [docs/GUIDE.md](docs/GUIDE.md)
- **Workflows to test:** [docs/TESTING.md](docs/TESTING.md)
- Design spec: [docs/2026-09-24-smart-goals-pwa-design.md](docs/2026-09-24-smart-goals-pwa-design.md)

Local-first: IndexedDB on the device is the source of truth, the app works fully
offline, and an optional Supabase sync copies everything off the phone.

## What's in v1

- **Today**: one list assembled from goals, preps, project steps and tasks, each
  with its goal's *why*. Finished groups collapse. Miss prompts with one-tap
  reasons and a user-grown "what took its place?" list. Quantity and time
  check-ins inline. Backfill any past day from the calendar button.
- **Plan**: goals (active, capped at 4 by default; maintenance; backlog;
  archive) and projects. Goals are habits or finish lines.
  History, revisions and reviews live on each goal.
  Status words plus a last-4-weeks bar. Goal detail with commitments, preps,
  full check-in history (corrections visible), revisions, edit, abandon,
  deliberately awkward delete, and the end-of-goal review.
- **First run**: a skippable intro that builds the first goal one SMART letter
  at a time, with examples picked from what the person wants to work on (plain
  lookup tables in `src/lib/intro.ts`), then a Getting started card on Today.
  Replayable from Settings. Spec: `docs/2026-09-30-onboarding-spec.md`.
- **Goal creation**: guided wizard or compact form. A goal cannot be saved
  without a checkable measurement sentence, a value and a why (except the
  intro's goal, where value and why are optional).
- **Projects** with ordered steps (Today shows only the current step), and
  **tasks** via quick-add from anywhere; a task can be turned into a project.
- **Standard commitments** (e.g. punctuality) are logged from a "Log" row on
  Today or the goal page.
- **Settings**: values, replay intro, day rollover (default 04:00), goal cap,
  creation mode, JSON export/import, sync sign-in.

- **Review**: the weekly ritual: loose ends, last week per goal with reasons,
  one evidence-backed suggestion per goal, dates, stalled projects, an open
  slot. Rules in `src/lib/review.ts`, design in spec §16.

- **Insights**: the long run, in three tabs. *Goals*: weekly trend per goal
  with plan changes marked and their before/after, and tolerance vs actual.
  *Patterns*: what gets in the way, prep effect, weekdays, how far off the
  misses are. *Big picture*: year so far, value balance, goals timeline,
  project pace. Logic in `src/lib/insights.ts`, charts in `src/ui/charts.tsx`.

## Develop

```bash
npm install
npm run dev
npm test          # scoring, dates/rollover, Today assembly, sync queue, backup
npm run build     # typecheck + production build with service worker
```

`npm run icons` regenerates `public/icons` from `scripts/make-icons.mjs`.

## Layout

| Path | What |
|---|---|
| `src/lib/` | Pure logic: dates and rollover, scoring, Today assembly, validation. No IO. |
| `src/db/` | Dexie schema, every write (`repo.ts`), settings, export/import. |
| `src/sync/` | `SyncTarget` interface, Supabase implementation, sync engine and scheduler. |
| `src/screens/`, `src/ui/` | React screens and shared components. |
| `supabase/migrations/` | Postgres schema. |

Entries are append-only: an undo is a `void` entry and a correction supersedes
the old one, so history is never rewritten. Only commitment entries are scored.

## Sync (optional)

Without Supabase keys the app runs local-only and Settings says so. To enable:

1. Create a Supabase project. In the SQL editor, run
   `supabase/migrations/0001_records.sql`.
2. **Authentication → Sign In / Providers**: turn off **Allow new users to sign
   up**, then **Authentication → Users → Add user → Create new user** with your
   email, a strong password (keep it in your password manager) and **Auto
   Confirm User**. Do this before the app knows the keys, so there is never a
   moment when a stranger could make an account. The app itself never creates
   accounts.
3. Put the project URL and publishable key in `.env.production` (committed; both
   are public by design) and in `.env.local` for development.

The app signs in with email and password, not a magic link: on iOS a link opens
in Safari, which doesn't share storage with the Home Screen app, and Supabase's
default email can't carry a code without custom SMTP. No email is ever sent.

Everything in a `VITE_` variable ships to every visitor's browser. The anon key
is meant to be public (row-level security limits each user to their own rows);
the `service_role` key must never go in one.

Don't change the app's domain once real data is in: the phone's data belongs to
the address it was saved under. Export first, then import at the new address.

Sync is last-write-wins by `updatedAt` (single user, single device). Moving off
Supabase means one new `SyncTarget` implementation in `src/sync/`.

## Deploy (Vercel)

Framework preset **Vite**, build command `npm run build`, output `dist`.
`vercel.json` adds the SPA rewrite and cache headers for the service worker.

```bash
npx vercel login
npx vercel --prod
```

## Install on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. Open it from
the Home Screen icon from then on: that copy keeps its data, works offline, and
is the one iOS lets keep storage long-term.

## Schema changes

Never edit a published Dexie version or an applied SQL file. Add
`this.version(n + 1)` in `src/db/db.ts`, bump `DATA_VERSION` with a step in
`src/lib/migrations.ts` (applied to synced and imported records), and add a new
numbered SQL file if Postgres needs it.
