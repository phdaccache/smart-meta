# Smart Meta

A personal SMART-goals PWA for daily use on an iPhone.

- **How to use it:** [docs/GUIDE.md](docs/GUIDE.md)
- Design spec: [docs/2026-09-24-smart-goals-pwa-design.md](docs/2026-09-24-smart-goals-pwa-design.md)

Local-first: IndexedDB on the device is the source of truth, the app works fully
offline, and an optional Supabase sync copies everything off the phone.

## What's in v1

- **Today**: one list assembled from goals, preps, project steps and tasks, each
  with its goal's *why*. Finished groups collapse. Miss prompts with one-tap
  reasons and a user-grown "what took its place?" list. Quantity and time
  check-ins inline. Backfill any past day from the calendar button.
- **Goals**: active (capped, default 4), maintenance, backlog, projects, history.
  Status words plus a last-4-weeks bar. Goal detail with commitments, preps,
  full check-in history (corrections visible), revisions, edit, abandon,
  deliberately awkward delete, and the end-of-goal review.
- **Goal creation**: guided wizard or compact form. A goal cannot be saved
  without a checkable measurement sentence, a value and a why.
- **Projects** with ordered steps (Today shows only the current step), and
  **tasks** via quick-add from anywhere; a task can be turned into a project.
- **Standard commitments** (e.g. punctuality) are logged as occurrences from
  quick-add.
- **Settings**: values, day rollover (default 04:00), goal cap, creation mode,
  JSON export/import, sync sign-in.

Review and Insights are placeholders for now; the data they need (entries, miss
reasons, displacements, revisions) is already being recorded.

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
2. **Authentication → Email**: keep email sign-in on. Edit the *Magic Link*
   email template to include the code, e.g. `Your code: {{ .Token }}`. On iOS a
   magic link opens in Safari, which doesn't share storage with the Home Screen
   app, so the app signs in with the typed code.
3. **Authentication → URL configuration**: set the Site URL to your deployed URL.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`)
   locally in `.env.local` and in Vercel's project environment variables.
5. Sign in once from the app, then turn off **Allow new users to sign up** in
   Supabase so the database stays yours alone.

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
