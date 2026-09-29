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
