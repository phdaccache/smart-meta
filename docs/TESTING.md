# Testing Smart Meta: common workflows

Try each workflow and compare what you see with **Expect**.

**Setup:** go to Settings → Developer → **Load sample data** (this replaces everything).
**Moving through time:** Settings → Developer → **Pretend today is**. Tap the orange pill to go back to the real date.

## Daily

**1. Morning check-in**
Open Today and tick a gym session and a prep.
- **Expect:** the header count drops. The gym item shows "1 of 3 this week" → "2 of 3". A goal with everything ticked collapses to one line; tap it to reopen.

**2. Log a number**
Tap the circle next to *Slept at least 7.5 hours* and enter `7`.
- **Expect:** "7 h" appears in amber. Change it to `8` and it turns normal. History (🕘 on the goal page) shows the 7 crossed out (↺) and the 8 with a ✓.

**3. Answer a miss**
On a "Last week: … What happened?" card, tap **Chose something else**, type `gaming`, then **Save**.
- **Expect:** the card disappears. Next time, "gaming" is a one-tap option. History shows ✕ with "gaming" in amber.

**4. Not now**
Tap **Not now** on a miss card.
- **Expect:** it's gone for today. Pretend it's tomorrow and it's back.

**5. Log an appointment**
In *Be on time*, tap **Log punctuality**. Enter agreed `09:00` and arrived `09:10`, pick a reason, then save.
- **Expect:** "1 logged this week" under the row. The goal's status may drop.

**6. Quick task with a due date**
Tap **+**, type `Pay Ana back`, use 📅 to pick tomorrow, then **Add**.
- **Expect:** it's on Today right away with a yellow **due tomorrow**. Pretend it's two days later: red **overdue**.

**7. Add a project step from anywhere**
Tap **+**, pick a project with ☰, type a step, then **Add**.
- **Expect:** it's the project's last step. You only see it on Today once the steps before it are done.

**8. Focus**
On Today, switch between **Goals / Projects / Tasks**.
- **Expect:**
  - Goals: only goals, with their project steps inside, plus miss prompts.
  - Projects: only steps.
  - Tasks: only tasks.
  - Your choice is remembered.

## Forgot something

**9. Fill in a past day**
Either tap 📅 on Today, or open a goal → 🕘 → **Fill in a past day**, then pick a past date and tick things.
- **Expect:** the header says "past day". Going back to Today, that day's miss prompt is gone or smaller.

**10. Undo**
Untick something you ticked by mistake.
- **Expect:** it's unticked. History keeps it, crossed out with ↺.

## Weekly

**11. Weekly look**
Open **Plan**.
- **Expect:** each goal card shows **on track / behind / at risk**, a 4-week bar, its habits, and its projects with progress.

**12. Reorder**
Drag a goal card by ⠿.
- **Expect:** Today shows goals in the new order. Do the same in the backlog and in a project's steps.

**13. Swap a goal in**
Open an active goal → **Move to backlog**, then in Plan tap **Start** on a backlog goal.
- **Expect:** "5 of 5" stays within the limit, and the started goal appears on Today.

**14. Adjust after slipping**
On a goal page, go to Commitments → **Edit** and lower the target, e.g. 4× → 3×.
- **Expect:** 🕘 shows ✎ with the change.

## New things

**15. A habit goal**
Go to Plan → Goals → **+**, walk through S M A R T and add a prep.
- **Expect:** "Go to the gym" is rejected at M; "At least 45 minutes of exercise" is accepted. It saves to the **backlog**, and the goal page offers **Start**.

**16. A finish-line goal**
Create it with M = *Finish line*, done when `I get a job offer`, A = 2 months, T = a deadline.
- **Expect:** saving without a deadline is refused. The goal page shows the deadline, extra time and **I did it**.

**17. A habit that starts later**
On a finish-line goal, go to Supporting habits → **Add**, with **Starts** 2 weeks out.
- **Expect:** it's not on Today. The goal card says "(from …)". Pretend it's that date and it appears.

**18. Task → project**
Tap a task on Today → **Turn into project**, then add steps.
- **Expect:** the task becomes a project, and Today shows only its first step.

## Review

**R1. Ready on Monday**
Pretend it's a Monday.
- **Expect:** a dot on the **Review** tab and "Last week is ready to review" on Today.

**R2. One of each suggestion**
Load sample data, then open Review.
- **Expect:** gym → *Change it?* (phone ×2, despite the prep); reading → *Add a prep?* (forgot); big tech → *Lower the target* (LeetCode, no time); answer my friends → *Pause it?*; sleep → *Maintenance?*. Accept one (e.g. edit the gym prep and save) and it goes away.

**R3. Dismiss**
Tap **Dismiss** on a suggestion.
- **Expect:** gone. Pretend it's 4 weeks later and it can come back if the pattern is still there.

**R4. Stalled project**
With sample data, look at **Stalled projects** (license: idle for weeks; finances: past its date).
- **Expect:** **Move date**, **Put down** or **Dismiss** each turn the row into a ✓ line saying what happened (new date / put down / dismissed for 4 weeks). Put-down projects are under Plan → Projects → Done as *set aside*; reopen from their page.

**R5. Done**
**Skip** one loose end, then tap **Done for this week**.
- **Expect:** suggestions, loose ends and stalled projects left open all disappear; Today stops asking about those misses. The dot and the Today line are gone until next Monday.

**R5b. Dates and slot**
- **Expect:** *30 days without sugar* reads "Review date was … (3 days ago)" with a **Review** button. Open slot shows the top backlog goal; **Choose another** lists the rest, each with **Start**.

**R5c. Manual maintenance or pause**
In Plan, tap **⋯** on an active goal → **Move to maintenance**; on that goal → **Make active**; on any → **Pause**.
- **Expect:** it moves between Active, Maintenance and Backlog. The same buttons are under Manage on the goal page.

**R6. Older weeks**
Tap 📅 on Review.
- **Expect:** weeks listed newest first, ✓ on reviewed ones; in the sample, last week and the week of 4 weeks ago aren't (nor two in the spring). Open the unreviewed old one: its results and loose ends (dated, e.g. "on 5 Sep"), no suggestions. **Mark reviewed** adds its ✓.

## Insights

**I1. Goal trends**
Load sample data, open **Insights → Goals** (3 months).
- **Expect:** one row per running goal with its average and a line of weekly results. *Sleep well* says "Prep added: Phone charging outside the bedroom (…): 62% → 93%"; *Be on time* the same for its prep. **Tolerance vs actual**: *Call my parents* far right of its tick, *Answer my friends* far left; tapping *Answer my friends* reads "tolerance 80% · actual 57%", and tapping anywhere else clears it. **Ended goals**: *Run a 10k* with a green *Completed*, *Journal every evening* with a red *Abandoned*. Switch to **All**: the lines get longer and the averages change.

**I2. One goal**
Tap *Sleep well* (or 📊 on its goal page). Tap or drag across the chart.
- **Expect:** the line above the chart follows your finger ("Week of 3 August · 71%"), with the status colour. A legend explains the dots and the dashed tolerance. **Plan changes** lists the prep with 62% → 93%. Then its prep (*Earns its place*), weekdays and how far off. Back returns to the same place in the list, fully drawn.

**I3. Patterns**
Open **Patterns**.
- **Expect:** reasons as bars, with *phone*, *going out with friends* and *birthday party* under *Something else*; tapping *phone* shows "Exercise regularly ×2 · Answer my friends ×1". Preps: gym bag *No clear effect*, phone *Earns its place*, the others *Always done*. Weekdays: tapping sleep's Saturday says "missed 8 of 10"; a legend reads never → always. How far off: sleep with red columns left of the dashed 7.5 h, green right; tapping a column says its range and count.

**I4. Big picture**
Open **Big picture**.
- **Expect:** *2026 so far* with three numbers (tap *finished* to see *Run a 10k*; tap elsewhere to hide it) and a short list (best month, most kept, weeks reviewed 26 of 30…). Value balance: tapping a month lists it by value. Timeline: one list by start date; *Call my parents* turns green (habit) in July; the 10k ends with ✓, the journal with ✕; tapping the journal reads "Started 30 March · Abandoned 14 May" with **Open**. Projects: *CV & LinkedIn* **Behind**, *Organize my finances* **Overdue**, *System design prep* **On pace**; *Buy a bike* under Done projects.

**I5. Too new**
Create and start a new goal.
- **Expect:** it isn't charted; a line under Trends says charts come after 4 weeks of data.

## Ends

**19. Achieve a finish line**
On its goal page, tap **I did it** → **Close it out**.
- **Expect:** it moves to Plan → Archive.

**20. Deadline passes**
Pretend it's after a finish line's deadline.
- **Expect:** status is **behind**. After the extra time it's **at risk** and asks for a review.

**21. Review date**
Pretend it's *30 days without sugar*'s review date.
- **Expect:** Plan shows **Review due**. Go through the review and pick **Renew**, **Maintenance** or **Close it out**.

## Safety

**22. Export, erase, import**
Go to Settings → **Export** (save the file), then **Erase all data** (type `erase`), then **Import** the file.
- **Expect:** everything comes back.

**23. Offline**
Turn on airplane mode, open the installed app, and tick things.
- **Expect:** it all works, with nothing lost.

**24. Installed on iPhone**
In Safari, go to Share → **Add to Home Screen**, then open the app from the icon.
- **Expect:** full screen, the check icon, and your data kept between opens.

## Sync

**25. It uploads**
Tick something on the phone, wait a few seconds, then open Settings.
- **Expect:** "Synced: just now", nothing waiting. In Supabase → Table Editor → `records`, the row count grows.

**26. Restore on a fresh browser**
On the computer, open the app in a **private window**, go to Settings → Sync and sign in.
- **Expect:** your goals, history and projects appear. Close the window afterwards. Don't erase anything there: an erase while signed in empties the synced copy too.

**27. Offline, then back**
Turn on airplane mode, tick two things, then turn it off.
- **Expect:** Settings shows "Waiting 2" while offline, then syncs by itself once back online.
