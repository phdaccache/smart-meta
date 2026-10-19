# Smart Meta: notes for Claude

## Start from GitHub's latest

Work happens in more than one place (this computer, cloud sessions, other branches), so this
checkout's `main` is often behind GitHub. Before reading code or starting any change:

1. `git fetch origin`
2. If `main` is behind `origin/main`, bring it up to date (`git fetch origin main:main` when on another
   branch, or `git pull --ff-only` on `main`).
3. New branches start from `origin/main`. On an existing branch, check `git log HEAD..origin/main`
   and merge `origin/main` in when it has commits, before building on it.

Never work from a stale `main`: a branch cut from it silently drops other sessions' work.

## UI changes

People use the app day to day. UI experiments go on a branch with a Vercel preview, and reach `main`
only after the owner has tried them. When something about a change is unclear, ask instead of guessing.
