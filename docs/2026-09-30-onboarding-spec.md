# Onboarding — spec (approved and implemented 2026-09-30)

Goal: a friend opens the app for the first time, understands what it is for, and
leaves with one real, SMART goal running, knowing the daily check-in, why misses
are logged, and the weekly review. SMART is taught while they fill in their own
goal, one line at a time — no text to read up front. No AI: personalization is
plain lookup tables.

Next after this: a pt-br version of the whole app (string keys, good design).
Onboarding copy is English only for now.

## Rules

- **Skip** at the top right of every screen → straight to Today, onboarding
  marked done. A half-made goal is dropped. The Getting started card on Today
  (screen 13) still offers "Create your first goal".
- Each screen is its own address, so the back gesture walks back.
- Shown only on a device with **no goals** that has not finished or skipped it
  (`onboarded` false). A restored phone or Pedro's phone never sees it.
- **Settings → Replay intro** runs screens 1–13 again. It only adds a goal;
  nothing else changes (existing values and goals untouched).
- The **first goal starts today** (active, start date today), not in the backlog.
  If the active-goal cap is already reached (replay), it goes to the backlog.
- Values are no longer asked up front: they move into the R step. The separate
  values screen in first run goes away.
- **No value**: a goal can have no value (`whyValueId` empty, `whyText` may be
  empty). It shows no value tag on Today; Value balance puts it in a grey
  "No value" row. The value can be set later from Edit. This is an empty value,
  not a fake "None" value record.
- The SMART one-liners, tile descriptions, example chips, obstacle chips and
  quick date chips are **onboarding only**. The normal New goal form stays as it
  is today.

## Screens

### 0 · Home Screen first — only when opened in Safari (not standalone)

Comes before everything: on iPhone, Safari and the Home Screen app keep separate
data, so a goal made in Safari would not be in the installed app.

> **Put it on your Home Screen first**
> It opens like an app and keeps your goals saved on your phone.
> 1. Tap **Share** (share icon)
> 2. Tap **Add to Home Screen**
> 3. Open Smart Meta from your Home Screen
>
> link: *Continue in Safari*

### 0b · Install — only on Android, in the browser (not installed)

On Android the browser and the installed app share data, so this is a
suggestion, not a gate: continuing in the browser loses nothing. The app's icon
sits above the title.

When the browser offers to install (`beforeinstallprompt`, Chrome, Edge, Samsung
Internet):

> **Put it on your Home Screen first**
> It opens like an app and keeps your goals saved on your phone.
> (the same title and line as on iPhone)
>
> **[Install]** (the browser's own install dialog)
> link: *Continue in the browser*

When it doesn't offer it within 1.5 s (Firefox, or Chrome deciding not to), the
steps through the menu instead:

> 1. Tap ⋮ at the top of the browser
> 2. Tap **Install app** or **Add to Home screen**
> 3. Open Smart Meta from your home screen
>
> link: *Continue in the browser*

Once installed from this screen: **It's on your home screen**, *Open it from
there or keep going here. Your goals are the same in both.* **[Continue]**

### 1 · Welcome

Visual: an animated Today goal card — "Exercise 3× a week" with its why line;
ticks fill Mon, Wed, Fri, then the week turns green, "3 of 3". This is the one
complete example; it is only watched, never saved.

> **Stop dropping goals you never really defined.**
> Turn them into a weekly plan and start improving now.
>
> **[Get started]**
> small, quiet link under it: *Restore from a backup* (opens Settings with only
> Backup and Developer)

Text on the intro's screens is centered; cards and form fields stay left-aligned.

### 2 · A note from the creator

> (round photo of Pedro)
>
> **A note from the creator**
>
> **Thank you for using the app.**
>
> I'm always dreaming up goals, projects and new habits, but I never turn them
> into a real plan.
>
> I get lost in my own ideas, and by morning I've forgotten what I dreamed of
> the night before.
>
> I built this app to help me become the person I want to be. I hope it helps
> you too.
>
> Thanks again and all the best,
>
> *(signature, small)*
>
> The note and signature are left-aligned; the photo and title stay centered.
>
> **[Continue]**

Signature: `docs/assets/signature-pedro.jpg` (photo of the handwritten
signature). At build time, turn it into a transparent SVG/PNG of the strokes
only, tinted with the text colour so it works in dark mode.

pt-br version, for later:
"Vivo idealizando metas, projetos e hábitos novos, mas nunca transformo isso num
plano de verdade. Me perco nas minhas próprias ideias e, na manhã seguinte, já
esqueci o que sonhei na noite anterior. Criei este app para me ajudar a me
tornar a pessoa que quero ser. Espero que ajude você também."

### 3 · Areas

> **What do you want to work on?**
> Pick any. We'll suggest goals to match.
>
> Chips (multi-select): Health & fitness · Work & career · Studies · Money ·
> Family & friends · Creativity · Peace of mind · Home
>
> **[Continue]**

Used only as suggestions: example goals on screen 4, suggested values on
screen 8. Not stored as data.

### 4–10 · Your first goal

The Guided form, with a header **"Your first goal"**, the subtitle
**"Let's make it SMART."**, the S·M·A·R·T bar, and one short line under the bar
explaining the current letter.

**4 · S — Specific** · *One clear thing, not a wish.*
> **What do you want to achieve?**
> Goal: [placeholder from their first area, e.g. "Exercise regularly"]
> Or start from an example: 3 chips (see table below). Tapping one fills every
> step (kind, what counts, short name, cadence, tolerance, value, why
> placeholder, prep suggestion); all editable. Typing their own starts blank.

**5 · M — Measurable** · *Decide now what counts, so you never wonder later if you really did it.*
> **How will you know?**
> Tiles with a short description:
> - **Finish line** — done once, by a date
> - **Rhythm** — a number of times a week
> - **Threshold** — over or under a line
> - **Standard** — a rule for when it comes up
>
> *Not sure? Pick one, you can change it later.*
> Then *What counts* and *Short name*, as today, with placeholders matched to
> their area.

**6 · M — How often / Where's the line** (as today)
> Visible line (not in the (i)): *Pick a number you can really hit, not the ideal one.*

**7 · A — Achievable** · *Nobody hits 100%. Choose what still counts as on track.*
> **How much slack?**
> Tolerance slider (80%) with a live line under it, e.g.
> "At 80%, missing 1 in 5 still counts as on track."
> Finish line: the Extra time picker, as today.

**8 · R — Relevant** · *Tie it to something you care about.*
> **Why does it matter?**
> Value: chips suggested from their areas, plus **Other…** to type one. The
> chosen value is created on save.
> Why: [placeholder per area, e.g. "So I have energy to play with my kids."]
> *You'll see this on Today, right when it's hard.*
> Both optional: with nothing filled in, the button reads **Skip** and the goal
> gets no value.

**9 · T — Time-bound** · *A date gives you urgency and focus.*
> **When?**
> Start: today. *Review on* (required, here and in the normal form) with quick
> chips `In 1 month` `3 months` `6 months`. Finish line: *Deadline*.

**10 · Prep** (habits only) · *Make the next try easier.*
> **What usually gets in the way?**
> Chips: `Forgot` `No time` `Too tired` `Chose something else` (the same four
> miss reasons used on Today). Tapping one fills in an editable prep:
> - Forgot → "Leave a reminder where I'll see it"
> - No time → "Block the time in my calendar"
> - Too tired → "Get it ready the night before"
> - Chose something else → "Decide the day and time in advance"
>
> *A prep is a small step beforehand. It's never scored, and Insights will show
> whether it helps.*
> Button: **Create goal** (reads **Skip** when no prep is added; skipping still
> creates the goal).

### 11 · Your plan

> **[Goal title] starts today**
> The goal card exactly as it will look on Today.
> Projection line (plain arithmetic):
> - Rhythm: "3× a week, 80% of the time: about 31 times by 30 December."
> - Threshold: "About 73 days by 30 December."
> - Standard: "Each time it comes up, you'll log yes or no."
> - Finish line: "12 weeks to your deadline, 30 December."
>
> The date is the review date.
>
> **[Continue]**

### 12 · How your week works (3 screens, swipe or Next; uses their goal)

> **Every day, one tap**
> Open Today and tick *[goal]* when you do it.
> (the goal card with ✓ ✕)

> **Missed? Say why**
> No guilt in missing. Just log it, and later you'll discover why.
> (the four reason chips, tappable as a demo; nothing saved)

> **Review your goals**
> Once a week, Review looks back at last week and suggests a fix, like a prep
> when you keep forgetting.
> (mock suggestion: "Forgot 2 times → Add a prep")
>
> **[Go to Today]**

### 13 · Today, with a Getting started card

> **Getting started** ×
> ✓ Create your first goal
> ○ Check in for the first time
> ○ Do your first weekly review (from Monday)
> ○ Back up your data — *your goals live only on this phone*

Items tick themselves when they happen. The card disappears once all are done,
or when × is tapped. If onboarding was skipped, "Create your first goal" opens
the goal part of onboarding (screens 4–11).

## Example goals

Two per area. Screen 4 shows 3 chips: the first example of each picked area (up
to 3); with one area, its two plus Exercise; with none, Exercise, Sleep, Read.

| Area | Example | Kind | What counts |
|---|---|---|---|
| Health & fitness | Exercise 3× a week | Rhythm 3/week | At least 30 minutes of exercise |
| Health & fitness | Sleep 7.5 hours | Threshold, daily, ≥ 7.5 h | Slept at least 7.5 hours |
| Work & career | Get a new job | Finish line, 6 months | Signed an offer for a role I want |
| Work & career | Focused work | Rhythm 4/week | 90 minutes of work with the phone away |
| Studies | Study 4× a week | Rhythm 4/week | At least 45 minutes of study |
| Studies | Finish a course | Finish line, 3 months | Got the certificate |
| Money | Emergency fund | Finish line, 12 months | 3 months of expenses saved |
| Money | Check my spending | Rhythm 1/week | Went through the week's spending |
| Family & friends | Call family | Rhythm 1/week | A call of at least 15 minutes |
| Family & friends | Be on time | Standard | Arrived at or before the agreed time |
| Creativity | Practise 4× a week | Rhythm 4/week | At least 20 minutes of practice |
| Creativity | Finish a project | Finish line, 3 months | Shown to someone |
| Peace of mind | Phone away at night | Threshold, daily, by 23:00 | Phone away by 23:00 |
| Peace of mind | Meditate | Rhythm 5/week | At least 10 minutes |
| Home | Tidy up weekly | Rhythm 1/week | 30 minutes tidying |
| Home | Cook at home | Rhythm 4/week | Cooked dinner at home |
| (none picked) | Read | Rhythm 3/week | At least 20 pages |

Tolerance 80% for all habits. Values suggested per area: Health, Career,
Growth, Money, Relationships, Creativity, Peace of mind, Home.
