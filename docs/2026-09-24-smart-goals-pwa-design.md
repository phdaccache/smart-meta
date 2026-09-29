# SMART Goals PWA — Design

**Date:** 2026-09-24
**Status:** Approved design; v1 built. Decisions made while building are folded in and marked *(v1)*.

## 1. Purpose

A personal web app for tracking goals using the SMART method, used daily on an
iPhone as a home-screen PWA.

### The problem being solved

The user's goals fail in a consistent pattern. A vague intention ("go to the
gym") survives a few months, then loses — in the moment of decision — to
whatever feels more urgent: a test, work, friends, or the phone. Three real
examples:

- **Gym:** went for 3–4 months, then stopped. Sessions were displaced by
  studying, work, or lost time on Instagram. It never became a habit.
- **Punctuality:** improves briefly, then reverts. No immediate consequence, and
  the original reason — respecting other people's time — is forgotten.
- **Sleep:** intends 8 hours, stays on the phone instead, for no good reason.

The failure is not forgetting that the goal exists. It is that the goal is
*vague*, so nothing concrete is ever displaced, and the *reason* for the goal is
absent at the moment the decision is made.

### What the app must therefore do

1. **Force vague intentions into specific, scheduled commitments.** The app
   refuses to save a goal that has no concrete recurring action attached.
2. **Surface the reason at the moment of action.** Every item in the daily list
   carries the *why* of its parent goal.
3. **Remove friction before the decision point.** Prep actions (pack the gym bag
   tonight) make tomorrow's commitment concrete while judgment is still good.

### Success criteria

- The user opens the app daily and the whole daily interaction takes under a
  minute.
- A goal cannot be created without a measurable definition and a recurring
  action.
- Data survives loss of the phone.
- The app is fully usable with no network connection.

### Non-goals

- Multi-user, sharing, or social features.
- AI-generated goals or task suggestions. The user explicitly wants to do the
  thinking; the app enforces structure but never writes content.
- Multi-device sync as a launch requirement (the architecture allows it later).
- Google Calendar integration (possible future work, out of scope).

## 2. Core model

Five concepts. The separation between them is what makes the model work.

### Goal

A **behavior being changed**. Ongoing, with no natural end date. SMART-enforced,
scored, and carries a *why*. Capped at 4 active by default (configurable);
others wait in a backlog.

> "Exercise regularly."

*(v1)* A goal can instead be a **finish line**: a result reached once ("Work at
a big tech, earning 10k+"). It has a *done when* sentence and a deadline, and
its tolerance is **extra time** after the deadline rather than a percentage.
Its commitments are optional *supporting habits*, each of which may start
later than the goal. Status follows the habits until the deadline, is
**behind** during the extra time, and **at risk** after it, when the goal asks
for its review.

### Commitment

The **recurring action that is the goal**, and the only thing that is scored. A
goal has one or more (a finish-line goal may have none). Each has a cadence, a
measurement definition, a check-in type and *(v1)* its own start date.

> "45+ minutes of exercise, 3× per week."

### Prep

An action that **removes friction from an upcoming commitment**. Attaches to a
commitment and fires on chosen weekdays at a chosen time. Checked off, recorded
in history, but **never scored** — missing a prep must not double-punish a
missed commitment. Zero to three per commitment.

> "Pack the gym bag and pick tomorrow's routine — Wednesdays and Fridays, 21:00."

**Why weekdays rather than an offset from the commitment:** a rhythm commitment
("3× per week") has no specific scheduled days, so a relative offset has nothing
to anchor to. Choosing the evenings the reminder should appear is concrete and
needs no scheduling engine. If per-day scheduling is added to rhythm commitments
later, the firing days become derived rather than chosen.

### Project

A **finite outcome** with ordered steps and a target date. Done when done, then
archived. May optionally link to a goal.

> "Get driver's license."

### Task

A **single action**. Ten seconds to create. Optionally dated, optionally linked
to a goal or project.

> "Book the theory exam."

### Relationships

```
Goal ──has 1+──> Commitment ──has 0-3──> Prep
  │                    │
  │                    └──generates──> Today items (scored)
  ├──may have──> Project ──has ordered──> Task
  └──may have──> Task

Project ──standalone──> Task        (no goal required)
Task ──standalone──> (nothing)      (no goal or project required)
```

Two invariants:

1. **Only commitments are scored.** Preps, project steps, and tasks are checked
   off and appear in history, but never move a goal's score. This means prep
   actions can be added freely without distorting the numbers.
2. **Every child can stand alone.** A task needs no project; a project needs no
   goal. Linkage is optional and additive.

### Creation effort is deliberately unequal

| Concept | Created via | Effort |
|---|---|---|
| Goal + commitment | Wizard, or compact form once fluent | ~2 min, deliberately |
| Prep | Wizard prompt, or after a miss | ~15 sec |
| Project | Short form | ~1 min |
| Task | Quick-add from anywhere | ~10 sec |

Heavy ceremony for behavior change; near-zero for a two-minute errand. A task
that turns out to need subtasks is **promoted to a project** in one tap.

## 3. Commitment shapes

The shape is a property of the *commitment*, not the goal, so one goal may hold
commitments of different shapes.

| Shape | Definition | Example | Scoring |
|---|---|---|---|
| **Rhythm** | N times per period | Gym 3×/week | hits ÷ target |
| **Standard** | A rule applying when a situation occurs | Never be late | compliance ÷ occurrences |
| **Threshold** | Stay under/over a limit per period | Sleep ≥ 8h; sugar ≤ limit | periods within limit |

**Standard commitments are user-triggered.** Unlike Rhythm and Threshold, they
have no schedule, so the app cannot know when they apply — punctuality only
matters when there is somewhere to be. The user logs an occurrence when it
happens ("I had a meeting; I arrived at 08:57"), and each logged occurrence
counts as a hit or a miss. Standard commitments therefore never generate
unprompted to-dos; they are logged reactively. *(v1)* Logging lives with the
goal, not in quick-add: Today shows a "Log punctuality" row under the goal (not
a to-do and not counted), and the goal page has the same button.

**Occurrences come from a pluggable source.** Manual logging is the v1
implementation, and it is the weakest part of this design: it depends on the
user remembering to log after the fact. A calendar feed would supply occurrences
automatically — every event becomes a potential occurrence with a real start
time, which also lets preps fire against it ("leave 15 minutes before this
meeting"). Calendar integration is out of scope for v1, but the occurrence
source is defined as an interface so that adding it later does not restructure
the model. See §15.

Projects have no shape; they score as steps completed ÷ total, against the
target date.

### Check-in types

Chosen per commitment at creation:

- **Binary** — did it / didn't. ("Did you exercise 45+ min?")
- **Quantity** — a number. ("Hours slept: 7.5")
- **Timestamp** — a time. ("Arrival time: 08:57")

### Measurement definition is mandatory

Each commitment requires a **sentence that makes the check-in unambiguous**, not
just a number. "Go to the gym" is rejected; "did at least 45 minutes of
exercise" is accepted. This field is what makes a check-in answerable without
judgment calls.

## 4. Scoring

### Tolerance

Every commitment carries a **tolerance percentage, set per goal by the user**
(e.g. 70% for one goal, 90% for another). A miss is always recorded as a miss —
there are no skip days, because skip days make the data misleading. Tolerance
affects *status*, not the record.

### Status

Computed **cumulatively, from the goal's start date to today**, and displayed as
one of three words:

- **on track** — cumulative performance at or above the goal's tolerance
- **behind** — below tolerance, but within 15 percentage points of it
- **at risk** — more than 15 percentage points below tolerance

The 15-point band is a default constant, not per-goal configuration; it exists
only to split "slipping" from "failing" and can be tuned once the app is in real
use.

A percentage is never the primary display; percentages belong in Insights.

### Recent-window signal

Cumulative scoring is forgiving by design, but it hides recent slippage: six
months at 85% barely moves after one bad week. Therefore each goal also shows a
**last-4-weeks indicator** as a secondary signal, so a bad fortnight is visible
before it becomes a trend.

### No streaks

Streaks are deliberately excluded. Tolerance already provides the motivational
signal, and a broken streak creates a cliff-edge failure that kills goals — the
exact pattern this app exists to prevent.

## 5. Missing, and recovery

When a commitment is missed, the next Today screen shows a prompt:

> "You missed Tuesday's gym — what happened?"

with one-tap reasons and an optional note:

- no time
- chose something else
- too tired
- forgot

Five seconds to answer. Reason data is the app's highest-value signal, because
the user's failure mode is a pattern invisible from the inside.

### The reason list grows with use

"Chose something else" opens a **second-level list that starts empty**. The user
types what displaced the commitment — "phone", "going out with friends",
"studying" — and each entry becomes a reusable one-tap option for next time.
Over time this builds a personal taxonomy of the user's own excuses, which is
far more useful at review than generic buckets.

A free-text note is available at every step, alongside the tapped reason rather
than instead of it.

**Suggestions are deferred to the weekly review, never shown in the moment.**
At review, suggestions are targeted by the tagged reasons:

> "4 of your 6 gym misses were 'chose something else,' and this commitment has
> no prep. Add one?"

Suggestions may propose: adding a prep, lowering the target, changing the
cadence, or pausing the goal. Preps are expected to accumulate over time as the
user learns their real friction by failing at it — this is the intended
lifecycle, not a defect.

## 6. Goal lifecycle

### States

`backlog → active → (maintenance | abandoned | completed)`

- **Edit** — change target, date, or wording. The goal and its history are
  retained; a **Revision** record is written. The app can later surface "you
  lowered this target twice," which is honest and useful.
- **Abandon** — the goal leaves the daily view but remains in history with a
  reason. A decision, not a failure.
- **Delete** — genuinely removed. Rare, deliberately awkward to reach, for
  genuine mistakes only (e.g. created twice).

### End-of-goal review

When a target date arrives, the goal enters **review** and asks three questions:

1. Did you hit it?
2. What happened?
3. What next?

A **free-text journal note** is stored with the review and kept in history. This
is the only place the app captures narrative rather than numbers, and it is what
makes a year-old goal comprehensible when looking back.

"What next" offers three outcomes:

- **Renew** — set a new target and continue.
- **Convert to maintenance** — the **same goal record**, kept in place with all
  its history and commitments intact, with `target_date` cleared and state set
  to `maintenance`. Not a new goal and not a flag on a new entity. Maintenance
  goals still generate Today items and are still scored, but they **do not count
  against the active-goal cap** and they appear less prominently in Review. This
  is the natural endgame for the gym goal: no longer being achieved, simply
  being done.
- **Close it out** — state becomes `completed`; the goal leaves the daily view
  and lives in history.

### Goal cap

Four active goals by default, configurable. Remaining goals sit in the
**backlog** and are pulled forward when one completes. Projects and tasks are
**not capped** — they represent workload, not willpower.

## 7. Screens

Five screens, deliberately few.

### Today (default)

The screen opened daily. One unified list assembled automatically from all
sources:

> **Today — Tuesday**
> ☐ Sleep by 23:30 · *so I stop losing mornings*
> ☐ 45 min exercise · *3rd this week — 2 done*
> ☐ **Prep:** pack gym bag + pick tomorrow's routine
> ☐ **Step 2/6:** set up the assignment repo · *due Friday*
> ☐ Message Ana

Requirements:

- **Item types are visually distinguishable** (commitment, prep, project step,
  task) while remaining in one list.
- **Each item shows its parent's why** in secondary text.
- **Tapping an item opens its parent** goal or project.
- Checking off is a single tap.
- Miss prompts appear here when there are misses to log.

Standalone tasks appear identically to goal-linked items. There is **one list
and one habit of checking it** — no tab-switching, no ambiguity about where
something lives.

### Goals

Management, visited weekly rather than daily. Active goals with status, the
backlog below, and the projects list. Creation and editing happen here.
*(v1)* The tab is called **Plan**, with a Goals / Projects switch. Today has an
All / Goals / Projects / Tasks filter.

### Review

The weekly ritual: last week's results, misses with their reasons, suggested
adjustments, and end-of-goal reviews when dates arrive. Detailed in §16.

### Insights

Deeper reporting, visited rarely. Trends, miss-reason breakdowns, history,
percentages. Detailed in §16.

### Settings

Day rollover, goal cap, export, sync status, notifications.

Navigation is a four-item tab bar (Today / Plan / Review / Insights), with
**Settings as an icon in the top bar**, reachable from any screen. A quick-add
task button is available from anywhere.

## 8. Goal creation

Two modes, toggleable:

- **Guided wizard** — one screen per SMART element, with examples and prompts
  ("What's the smallest version of this you'd still be proud of?"). The default
  for early use.
- **Compact form** — all fields on one screen, for when the user is fluent.

Both enforce the same required fields. The app never generates content; it
enforces structure only.

### Required fields

- **Specific** — title and a measurement definition sentence
- **Measurable** — check-in type, target value, cadence
- **Achievable** — tolerance percentage, with guidance on first use
- **Relevant** — the *why*: a personal value selected from those declared at
  first run, plus a sentence linking this goal to it
- **Time-bound** — start date; target date optional for ongoing behaviors
  *(v1: required for a finish line, as its deadline)*

A goal with no measurable definition **cannot be saved**. "Be more kind" is
correctly rejected until converted into something like "message one friend I
haven't spoken to in a month, weekly" (Rhythm) or "when someone annoys me, pause
before replying" (Standard). A goal that cannot be made SMART is not yet a goal.

### Values

**Declared during first-run setup.** Before the first goal can be created, the
app asks the user to write **3–5 personal values** — short statements of what
matters to them. They are editable afterwards from Settings, and new ones can be
added at any time.

Each goal's *why* then selects one value and adds a sentence explaining how the
goal serves it. This supplies the SMART "relevant" dimension, and that sentence
is the text shown beside every Today item generated by the goal. This is the
mechanism that puts the reason in front of the user at the moment of the
decision — the app's central purpose.

### Prep prompting

The wizard asks once — "What usually stops you from doing this?" — and offers to
add a prep. **Prompted, not required**; forcing a prep on every commitment
generates filler. Soft cap of three per commitment; needing more means the
commitment itself is too big.

## 9. Data model

```
Value       — id, name, description
Goal        — id, title, why_value_id (→ Value), why_text,
              state (backlog|active|maintenance|abandoned|completed),
              tolerance_pct, start_date, target_date?, priority,
              kind (habit|outcome), done_when?, grace_days?      (v1)
Commitment  — id, goal_id, shape (rhythm|standard|threshold), cadence,
              measurement_definition, target_value, checkin_type,
              start_date                                         (v1)
Prep        — id, commitment_id, title, fire_weekdays[], fire_time
Project     — id, title, target_date, goal_id?, state
Task        — id, title, date?, goal_id?, project_id?, order?
Entry       — id, subject_type, subject_id, timestamp, value, hit|miss,
              miss_reason?, displacement_id?, note?
Revision    — id, goal_id, field, old_value, new_value, timestamp
Occurrence  — id, commitment_id, scheduled_at, source (manual|calendar),
              external_ref?, entry_id?     (Standard commitments; see §15)
Displacement— id, label          (user-grown list: "phone", "friends", ...)
GoalReview  — id, goal_id, timestamp, hit (bool), journal_note, outcome
              (renewed|maintenance|completed)
```

`Entry.subject_type` is one of `commitment | prep | task`, with `subject_id`
pointing at that record. Project steps are tasks, so they need no separate type.
Only entries with `subject_type = commitment` contribute to scoring.

**`Entry` is the append-only heart of the app.** Every check-in, backfill, and
correction writes one. History, backfill, undo, and all reporting derive from
this single source.

### Editing history

- **Backfill** — entries may be created for past dates. Required: forgetting to
  log is guaranteed, and un-fixable data destroys trust in the tracker.
- **Undo / edit** — entries may be corrected.
- Corrections are visible in history rather than silently overwriting.

## 10. Architecture

### Local-first

**IndexedDB on the device is the source of truth.** The app reads and renders
from local storage and never waits on the network. Writes are local and
synchronous from the user's perspective.

### Sync

A background queue pushes changes to **Supabase** (managed Postgres, free tier)
and drains when online. Single-user, single-device means **last-write-wins is
sufficient**; no conflict-resolution machinery is needed.

The sync target sits behind a **clean, swappable interface** — a single module.
This is deliberate: the risk with any hosted service is not that terms change,
but that data becomes trapped when they do. Postgres is a portable open format,
so migrating to Neon, Railway, Fly, or self-hosting is a data dump and restore,
touching one module. Firebase was rejected for exactly this reason: a
proprietary store with no equivalent off-ramp, and the user has already been
burned by its free-tier changes.

**Known caveat:** Supabase free projects pause after ~1 week of inactivity and
need a click to wake. Daily use prevents this; after a long gap the first sync
may lag. Because the app is local-first, no data is lost and the user is
unaffected.

### Export

One-tap JSON export for an iCloud copy, plus a gentle monthly nudge. This
provides **portability** (data the user owns in a format they control), distinct
from backup, which sync handles automatically.

Note on automation: iOS Shortcuts cannot read a PWA's IndexedDB — the browser
sandbox forbids it. Automated iCloud backup is therefore not viable as a primary
mechanism, which is why sync carries that responsibility.

### Auth

Magic-link email login. No password to manage; signed in for months at a time.
This provides the "only I can access it" requirement via a real auth boundary.
*(v1)* The app signs in with **email and password** instead: on iOS a link
opens in Safari, which doesn't share storage with the Home Screen app, and
Supabase's default email can't carry a code. The password manager fills it in,
once. Sign-ups are off in Supabase and the app never creates accounts; each
user is added in the dashboard.

### Day rollover

A **configurable day-start offset, defaulting to 04:00**. The day runs 04:00 →
04:00 rather than midnight → midnight, so a check-in logged at 01:00 after a late
night lands on the day actually being lived. Implemented by subtracting the
offset before taking the date.

"Day ends when I sleep" was rejected: it requires declaring bedtime, and if that
is forgotten the day never closes. A fixed offset achieves nearly the same result
without the fragility. This matters particularly for the sleep goal.

### PWA and iOS constraints

- Installed to the Home Screen; fully functional offline.
- **Persistent storage is requested** — Safari can evict a PWA's local data after
  weeks of disuse. iOS grants persistence to Home Screen PWAs. Sync is the real
  mitigation: the phone must not be the only copy.
- **Notifications** require Home Screen installation and are limited on iOS.
  Treated as best-effort enhancement, not a load-bearing feature (see §15).

### Performance

Startup latency is a functional requirement, not polish: an app that opens in
three seconds gets used daily; one that takes eight does not. Local-first
rendering satisfies this — no network request blocks the first paint.

### Schema migration

The app will be used for years and the model will change. Stored data must
survive app updates; a versioned migration path for IndexedDB and Postgres is
required from the start.

## 11. Error handling

**The app must never lose a check-in.** Writes land locally first and are
acknowledged immediately. Network failure is invisible to the user. If Supabase
is unreachable for days, the app works normally and Settings shows a quiet "last
synced X days ago." A failed sync never blocks the UI.

## 12. Testing

- **Scoring engine** — thorough unit tests. Three shapes × tolerance ×
  cumulative × recent-window is pure logic and is where correctness actually
  matters.
- **Date and rollover handling** — thorough unit tests. The 04:00 offset,
  period boundaries, and timezones are a classic source of silent bugs.
- **Sync queue** — tested against offline, failure, and resume.
- **UI** — lighter coverage.

## 13. Worked examples

These validate the model against the user's real goals, and they are the
**acceptance criteria for implementation**: each becomes a test case, and the
full set runs as the regression suite on every change.

### Gym — Rhythm

- **Goal:** Exercise regularly. *Why:* health and energy.
- **Commitment:** "Did at least 45 minutes of exercise" — binary, 3× per week,
  tolerance 80%.
- **Prep:** "Pack bag, pick tomorrow's routine" — chosen evenings, 21:00.
- **Today shows:** the commitment each day (a rhythm goal has no fixed training
  days), and the prep on its chosen evenings.
- **On miss:** reason logged. If "chose something else" recurs, the review
  suggests an earlier prep or a lower target.

### Punctuality — Standard

- **Goal:** Be on time. *Why:* respecting other people's time.
- **Commitment:** "Arrived at or before the agreed time" — timestamp,
  per-event, tolerance 90%.
- **Prep:** "Leave 15 minutes before required departure."
- **Today shows:** no to-do — occurrences are logged reactively after an
  appointment, from the goal's "Log" row *(v1)*. Only the prep appears on
  schedule.
- **Scoring:** compliance ÷ occurrences, cumulative.

### Sleep — Threshold

- **Goal:** Sleep well. *Why:* not losing mornings.
- **Commitment:** "Slept at least 8 hours" — quantity, nightly, tolerance 70%.
- **Prep:** "Phone out of the bedroom at 23:00."
- **Note:** the 04:00 rollover makes late-night logging land correctly.

### Driver's license — Project

- **Project:** Get driver's license, target date set.
- **Steps (ordered tasks):** book theory exam → study → sit theory → book
  practical lessons → ...
- **Today shows:** the current step only, not the whole chain.

### Pay a friend — Task

- Quick-add, ten seconds, no goal, no why. Appears in Today, checked off, gone.

### "Be more kind" — rejected

Cannot be saved: no measurement definition. The wizard blocks it until it becomes
a Rhythm ("message one friend I haven't spoken to in a month, weekly") or a
Standard ("when someone annoys me, pause before replying"). This rejection is the
app working as intended.

## 14. Key workflows

### Daily (target: under one minute)

1. Open app → Today.
2. Check off completed items.
3. Log any miss reasons (one tap each).
4. Quick-add any new task.

### Weekly review

1. Open Review.
2. Answer any misses still without a reason.
3. See last week's results per goal, with miss reasons grouped.
4. Accept or dismiss suggested adjustments; look at stalled projects.
5. Pull a backlog goal forward if a slot opened.
6. Mark the week reviewed.

### Creating a goal

1. Goals → new.
2. Wizard (or compact form): title → measurement definition → check-in type and
   cadence → tolerance → why (value) → dates.
3. Prompted: "What usually stops you?" → optionally add a prep.
4. Saved to the backlog *(v1: always, even the first goal)*. Starting it is a
   separate, deliberate tap, which also checks the cap.

### Miss and recover

1. Miss appears on Today with the reason prompt.
2. One tap to tag, optional note.
3. At the weekly review, patterns in the reasons drive a targeted suggestion.
4. Accepting a suggestion may add a prep, adjust the target, or pause the goal.

### Backfill

1. Navigate to the past date (or use the item's history).
2. Add or correct the entry.
3. Correction is visible in history; scores recompute.

### First run

1. Write 3–5 personal values.
2. Create the first goal via the guided wizard.
3. Land on Today.

## 15. Planned future work

Out of scope for v1, recorded so the architecture accommodates them.

### Calendar integration

Feed calendar events into the app as **occurrences** for Standard commitments,
and as anchors for preps. This would properly solve the punctuality case:
recurring events (work, church) and one-off appointments each become an
occurrence with a real start time, so the app can prompt "did you arrive on
time?" instead of relying on the user to remember to log it, and a prep can fire
"leave 15 minutes before this."

**Requirement on v1.** Occurrences must be a first-class record produced behind
an interface, not implied by the act of logging. Concretely:

```
Occurrence  — id, commitment_id, scheduled_at, source (manual|calendar),
              external_ref?, entry_id?
```

```
interface OccurrenceSource {
  occurrencesFor(commitmentId, dateRange): Occurrence[]
}
```

`ManualOccurrenceSource` (v1) returns occurrences the user created by hand.
`CalendarOccurrenceSource` (later) maps calendar events to the same shape, using
`external_ref` to hold the event id so repeated syncs are idempotent and an
occurrence is never duplicated.

Because scoring reads `Occurrence` rather than `Entry`, adding the calendar
source changes no scoring code: compliance stays `entries where hit ÷
occurrences`. An occurrence with no linked entry is an unanswered prompt, which
is what lets the app ask "did you arrive on time?" for a calendar event it knows
about — the behavior manual logging cannot provide.

### Notifications

iOS web push requires Home Screen installation and is limited. Treated as
best-effort enhancement, never load-bearing: the app must be fully usable by a
person who opens it out of habit rather than in response to a prompt.

### Multi-device

The local-first + Supabase architecture permits it. Would require replacing
last-write-wins with real conflict resolution.
## 16. Review and Insights (designed after v1)

One test for every element on both screens: **what decision does it lead to?**
Anything that is only interesting belongs in the optional charts at the end of
Insights, and never in Review.

### Review — "what should I change about next week?"

Weekly, three to five minutes. Its output is changes to the plan, not
information; every accepted change is written as a Revision.

In order:

1. **Loose ends.** Last week's misses that still have no reason, answerable
   inline. Today only asks within 7 days; Review is the catch-all. Suggestions
   are only as good as the reasons, so this comes first.
2. **One card per active goal.** Last week's result in plain counts ("gym 2 of
   3", "sleep 5 of 7 nights"), the status word and whether it changed ("on track
   → behind"), and the reasons grouped ("chose something else ×2 · phone ×2").
   No percentages.
3. **At most one suggestion per goal**, stating its evidence. Accept opens the
   relevant editor; dismiss hides that suggestion for 4 weeks.
4. **Finish lines.** Deadline approaching, extra time running, reviews due.
5. **Stalled projects.** An active project with no step done in 3 weeks, or
   past its target date: open it, move the date, or put it down.
6. **Open slot.** "1 of 4 free" with the top backlog goal and **Start**. A goal
   paused by a suggestion opens the slot right there.
7. **Done for this week.** Records the week as reviewed. Until then, Today shows
   a quiet "Weekly review ready" from Monday.

Maintenance goals appear only when slipping.

#### Suggestion rules

Patterns use the last 4 weeks (one week is too small a sample) and need at
least 2 misses with the same reason.

| Main reason | Suggestion | Logic |
|---|---|---|
| forgot | add a prep | Forgetting means there was no cue. |
| chose something else, no prep | add a prep, naming the top displacement ("phone took 3 of 4") | The moment was lost; remove friction beforehand. |
| chose something else, prep exists | change the prep (earlier, or a different one) | The prep isn't working. |
| no time / too tired | lower the target or change the cadence | The commitment is too big for the real week. |
| below tolerance in 3 of the last 4 weeks, any reason | pause (back to backlog) or lower the target | It is failing and holding a slot. |
| comfortably on track for 8+ weeks | convert to maintenance | Frees a slot without losing the habit. |

The app never writes the content: "Add a prep?" opens an empty prep editor with
the evidence beside it. Suggestions are honest about past revisions: if the
target has already been lowered twice, it says so and offers a pause instead.

Prep completion is not shown as a statistic; it appears only as evidence inside
a suggestion.

### Insights — "what have I learned, and is this working?"

Visited rarely; spans months. It shows only what Review's 4-week window cannot.
A goal's charts stay hidden until it has 4 weeks of data.

1. **Goal trend with markers.** Weekly percentage over time, with markers where
   the target changed or a prep was added. Shows whether an intervention
   worked ("gym bag prep added → 55% to 80%"). Without it, Review's suggestions
   are guesses.
2. **What gets in the way.** Miss reasons and displacements across all goals
   over time. A displacement beating several goals ("phone": gym and sleep) may
   deserve a goal of its own.
3. **Near-miss distribution** for quantity and timestamp commitments: average
   hours slept, typical minutes late. 7.4 h and 5 h are both misses but need
   different fixes.
4. **Prep effect.** Hit rate after a prep was done versus not done ("when you
   pack the bag you go 80% of the time; when you don't, 30%"). Shows which preps
   earn their place.

Also wanted — more interesting than decision-making, so they sit below the four
above:

- **Goals timeline:** every goal as a bar from start to end, coloured by state,
  with revisions as ticks. A year of goals on one screen.
- **Value balance:** share of hits per value over time. Is anything being done
  for "People"?
- **Weekday pattern** for daily commitments: which days the misses fall on.
- **Tolerance vs actual** across goals: are tolerances set realistically?
- **Project burn-up:** steps done over time against the target date.
- **Year in review:** at year end, one card: goals finished, best month, most
  common displacement, longest-kept habit.

Deliberately excluded: an overall "life score" across goals, streaks, charts of
tasks completed (workload, not willpower), badges.
