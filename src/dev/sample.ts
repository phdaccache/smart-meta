// TEMPORARY: sample data for trying the app. Remove with the Developer section in Settings.
//
// Ten weeks of history, shaped so every part of Review has something to show:
//   gym      "chose something else" (phone) despite a prep → change the prep
//   reading  "forgot", no prep                              → add a prep
//   LeetCode "no time"                                      → lower the target
//   replies  below tolerance every week, no reasons         → pause
//   sleep    on track every week                            → maintenance
//   sugar    past its review date                           → Dates
//   projects one idle for weeks, one past its date          → Stalled projects
//   7 of 8 slots active                                     → Open slot
// Last week is left unexplained (Loose ends) and unreviewed; so is one older week.
//
// And for Insights, seven months back:
//   a 10k finished in June, a journal abandoned in May, weekly calls in maintenance → timeline, year so far
//   sleep: phone out of the bedroom seven weeks ago    → trend jump; the prep works, skipped on Fridays
//   punctuality: a prep added five weeks ago           → no more late arrivals
//   gym bag packed or not, same result                 → prep with no clear difference
//   phone beats gym and replies                        → "might deserve a goal of its own"
//   no goal for Freedom                                → value balance
//   projects with steps spread over weeks, one done    → burn-up
import { db } from '../db/db'
import {
  addCommitment, addDisplacement, addPrep, check, createGoal, createProject, createTask, explainMiss, logOccurrence,
  logValue, markWeekReviewed, saveGoalReview, saveValues, setGoalState, updateProject,
} from '../db/repo'
import { setSettings } from '../db/settings'
import { addDays, isoWeekday, periodOf } from '../lib/dates'
import { emptyGoalDraft, type GoalDraft, type PrepDraft } from '../lib/draft'
import type { Commitment, DateStr, Goal, MissReason } from '../lib/types'
import { eraseAllData } from '../sync/controller'

const WEEKS = 10

function days(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

const prep = (title: string, fireWeekdays: number[], fireTime: string): PrepDraft => ({ title, fireWeekdays, fireTime })

async function commitmentsOf(g: Goal): Promise<Commitment[]> {
  return db.commitments.where('goalId').equals(g.id).toArray()
}

/** Moves a goal's state changes (and its end-of-goal review) back to the day they happened. */
async function backdateState(goalId: string, day: DateStr) {
  const at = `${day}T18:00:00.000Z`
  for (const r of await db.revisions.where('goalId').equals(goalId).toArray()) {
    if (r.field === 'state') await db.revisions.put({ ...r, timestamp: at, createdAt: at, updatedAt: at })
  }
  for (const r of await db.goalReviews.where('goalId').equals(goalId).toArray()) {
    await db.goalReviews.put({ ...r, timestamp: at, createdAt: at, updatedAt: at })
  }
}

type Reason = [MissReason, string | null]

/**
 * A rhythm commitment week by week, oldest first: hits on the first `n` of
 * `weekdays`, and the shortfall explained with the week's reason (null leaves
 * it for a miss prompt).
 */
async function rhythmHistory(
  c: Commitment, mondays: DateStr[], hits: number[], reasons: (Reason | null)[], weekdays: number[], today: DateStr,
) {
  for (const [i, monday] of mondays.entries()) {
    const n = hits[i] ?? 0
    for (const wd of weekdays.slice(0, n)) {
      const d = addDays(monday, wd - 1)
      if (d < today && d >= c.startDate) await check({ subjectType: 'commitment', subjectId: c.id }, d)
    }
    const short = c.cadence.times - n
    const r = reasons[i]
    const sunday = addDays(monday, 6)
    if (short > 0 && r && sunday < today) {
      const displacementId = r[1] ? (await addDisplacement(r[1])).id : null
      await explainMiss({ commitmentId: c.id, period: 'week', slots: [{ date: sunday, count: short }] }, { reason: r[0], displacementId })
    }
  }
}

export async function loadSampleData(today: DateStr): Promise<void> {
  await eraseAllData()
  await setSettings({ onboarded: true, goalCap: 8 })

  const thisMonday = periodOf(today, 'week').start
  const lastMonday = addDays(thisMonday, -7)
  // Closed weeks, oldest first, then the current one.
  const mondays = Array.from({ length: WEEKS }, (_, i) => addDays(thisMonday, -7 * (WEEKS - i)))
  const withThisWeek = [...mondays, thisMonday]
  const weeksAgo = (n: number) => addDays(thisMonday, -7 * n)
  const yesterday = addDays(today, -1)

  await saveValues([
    { name: 'Health', description: 'Energy to do the things I care about' },
    { name: 'People', description: 'Being someone friends can count on' },
    { name: 'Growth', description: 'Always learning something' },
    { name: 'Career', description: 'Work I’m proud of, paid well' },
    { name: 'Freedom', description: 'Money and time under control' },
  ])
  const values = await db.values.toArray()
  const v = (name: string) => values.find((x) => x.name === name)!.id

  const goal = (d: Partial<GoalDraft>, start = false) => createGoal({ ...emptyGoalDraft(today), ...d } as GoalDraft, { start })
  const rhythm = { checkinType: 'binary' as const, period: 'week' as const, targetValue: '', targetTime: '', comparator: 'gte' as const, unit: '' }
  const noTime: Reason = ['no_time', null]

  // ——— past goals, made first while every slot is free ———

  // A 10k: three runs a week from March, raced in June.
  const tenK = await goal({
    goalKind: 'outcome', title: 'Run a 10k', whyValueId: v('Health'), whyText: 'To prove I can train for something and finish it.',
    doneWhen: 'Finished a 10k race', graceDays: 14, tolerancePct: 75, startDate: weeksAgo(30), targetDate: addDays(weeksAgo(15), 5),
  }, true)
  const runs = await addCommitment((await db.goals.get(tenK.id))!, {
    ...rhythm, shape: 'rhythm', label: 'runs', measurementDefinition: 'Ran at least 3 km', times: 3,
  }, weeksAgo(30))
  const training = Array.from({ length: 16 }, (_, i) => weeksAgo(30 - i))
  await rhythmHistory(runs, training,
    [2, 3, 3, 2, 3, 3, 3, 1, 3, 3, 3, 3, 2, 3, 3, 3],
    [['too_tired', null], null, null, noTime, null, null, null, ['chose_other', 'going out with friends'], null, null, null, null, noTime],
    [2, 4, 6], today)
  const raceDay = addDays(weeksAgo(15), 5)
  await saveGoalReview((await db.goals.get(tenK.id))!, {
    hit: true, whatHappened: 'Ran it in 58 minutes without walking.', journalNote: 'Three runs a week was enough. Sign up for the race first next time.',
  }, 'completed')
  await backdateState(tenK.id, raceDay)

  // A journal that never stuck: abandoned after six weeks.
  const journal = await goal({
    title: 'Journal every evening', whyValueId: v('Growth'), whyText: 'To notice what my days are actually made of.',
    shape: 'threshold', label: 'journal', measurementDefinition: 'Wrote at least three lines before bed', checkinType: 'binary',
    period: 'day', tolerancePct: 80, startDate: weeksAgo(26),
  }, true)
  const [journalC] = await commitmentsOf(journal)
  const quit = addDays(weeksAgo(20), 3)
  for (const d of days(journalC.startDate, addDays(quit, -1))) {
    const wd = isoWeekday(d)
    if ([1, 2, 4].includes(wd) || (d < weeksAgo(24) && wd === 3)) await check({ subjectType: 'commitment', subjectId: journalC.id }, d)
    else if (wd === 5 || wd === 3) await explainMiss({ commitmentId: journalC.id, period: 'day', slots: [{ date: d, count: 1 }] }, { reason: 'too_tired' })
  }
  await setGoalState((await db.goals.get(journal.id))!, 'abandoned', 'Felt like homework. A few notes on my phone are enough.')
  await backdateState(journal.id, quit)

  // Weekly calls home: steady, so moved to maintenance twelve weeks ago.
  const parents = await goal({
    title: 'Call my parents every week', whyValueId: v('People'), whyText: 'They won’t be around forever.',
    shape: 'rhythm', label: 'call', measurementDefinition: 'A real call with my parents, not just texts', times: 1, period: 'week',
    tolerancePct: 80, startDate: weeksAgo(24),
  }, true)
  const [callC] = await commitmentsOf(parents)
  const callWeeks = Array.from({ length: 25 }, (_, i) => weeksAgo(24 - i))
  await rhythmHistory(callC, callWeeks, callWeeks.map((_, i) => (i === 2 || i === 5 ? 0 : 1)),
    [null, null, ['chose_other', 'going out with friends'], null, null, noTime], [7], today)
  await setGoalState((await db.goals.get(parents.id))!, 'maintenance')
  await backdateState(parents.id, weeksAgo(12))

  // ——— active goals (7 of 8 slots) ———

  const gym = await goal({
    title: 'Exercise regularly', whyValueId: v('Health'), whyText: 'So my back stops hurting and I have energy after work.',
    shape: 'rhythm', label: 'gym', measurementDefinition: 'At least 45 minutes of exercise', times: 3, period: 'week',
    tolerancePct: 80, startDate: weeksAgo(10),
    preps: [prep('Pack the gym bag and pick tomorrow’s routine', [7, 2, 4], '21:00')],
  }, true)
  const sleep = await goal({
    title: 'Sleep well', whyValueId: v('Health'), whyText: 'So I stop losing mornings.',
    shape: 'threshold', label: 'sleep', measurementDefinition: 'Slept at least 7.5 hours', checkinType: 'quantity',
    period: 'day', targetValue: '7.5', comparator: 'gte', unit: 'h', tolerancePct: 70, startDate: weeksAgo(10),
  }, true)
  const onTime = await goal({
    title: 'Be on time', whyValueId: v('People'), whyText: 'Because other people’s time matters as much as mine.',
    shape: 'standard', label: 'punctuality', measurementDefinition: 'Arrived at or before the agreed time',
    checkinType: 'timestamp', tolerancePct: 90, startDate: weeksAgo(8),
  }, true)
  const sugar = await goal({
    title: '30 days without sugar', whyValueId: v('Health'), whyText: 'To prove to myself cravings pass.',
    shape: 'threshold', label: 'no sugar', measurementDefinition: 'No added sugar all day', checkinType: 'binary',
    period: 'day', tolerancePct: 90, startDate: addDays(today, -33), targetDate: addDays(today, -3),
    preps: [prep('Buy fruit for the week', [7], '18:00')],
  }, true)
  // The worked example in docs/GUIDE.md: a finish line, supporting habits (one
  // starting later), and projects for the finite work.
  const bigTech = await goal({
    goalKind: 'outcome', title: 'Work at a big tech, earning 10k+', whyValueId: v('Career'),
    whyText: 'Work on things millions use, and never worry about money again.',
    doneWhen: 'Signed an offer from a big tech company paying at least 10k a month', graceDays: 61,
    tolerancePct: 70, startDate: weeksAgo(6), targetDate: addDays(weeksAgo(6), 365),
  }, true)
  const bigTechGoal = (await db.goals.get(bigTech.id))!
  const leetcode = await addCommitment(bigTechGoal, {
    ...rhythm, shape: 'rhythm', label: 'LeetCode', measurementDefinition: 'Solved at least 2 LeetCode problems', times: 4,
  }, weeksAgo(6))
  const mock = await addCommitment(bigTechGoal, {
    ...rhythm, shape: 'rhythm', label: 'mock interview', measurementDefinition: 'Did a mock interview with a friend', times: 1,
  }, weeksAgo(6))
  await addPrep(mock.id, prep('Book a friend for this week’s mock interview', [1], '21:00'))
  // Applications start in about six weeks, once the CV and stories are ready.
  const applications = await addCommitment(bigTechGoal, {
    ...rhythm, shape: 'rhythm', label: 'applications', measurementDefinition: 'Sent at least one tailored application', times: 3,
  }, addDays(today, 40))
  await addPrep(applications.id, prep('Pick this week’s 3 companies', [7], '20:00'))
  const reading = await goal({
    title: 'Read 10 books a year', whyValueId: v('Growth'), whyText: 'To think with better ideas than my own.',
    shape: 'rhythm', label: 'reading', measurementDefinition: 'Read at least 20 pages', times: 4, period: 'week',
    tolerancePct: 75, startDate: weeksAgo(5), targetDate: `${today.slice(0, 4)}-12-31`,
  }, true)
  const friends = await goal({
    title: 'Answer my friends', whyValueId: v('People'), whyText: 'So friends don’t feel ignored.',
    shape: 'threshold', label: 'replies', measurementDefinition: 'Replied to every friend’s message by the end of the day',
    checkinType: 'binary', period: 'day', tolerancePct: 80, startDate: weeksAgo(5),
  }, true)

  // ——— backlog ———

  await goal({
    title: 'Eat well', whyValueId: v('Health'), whyText: 'Food as fuel, not comfort.',
    shape: 'rhythm', label: 'home meals', measurementDefinition: 'Cooked a home meal with vegetables', times: 5, period: 'week',
    tolerancePct: 70,
  })
  await goal({
    title: 'Keep up with tech', whyValueId: v('Career'), whyText: 'So I stay good at this job after I get it.',
    shape: 'rhythm', label: 'tech study', measurementDefinition: 'At least 30 minutes of tech study: articles, talks or docs',
    times: 2, period: 'week', tolerancePct: 70,
  })
  await goal({
    title: 'Learn X', whyValueId: v('Growth'), whyText: 'Because I keep wishing I knew it.',
    shape: 'rhythm', label: 'study', measurementDefinition: 'Studied X for at least 30 minutes', times: 3, period: 'week',
    tolerancePct: 75,
  })

  // ——— history ———

  // Gym: the phone keeps winning, prep or not. Last week is left for a miss prompt.
  const [gymC] = await commitmentsOf(gym)
  const phone: Reason = ['chose_other', 'phone']
  await rhythmHistory(gymC, withThisWeek,
    [3, 3, 2, 3, 2, 3, 2, 2, 3, 2, 1],
    [null, null, ['too_tired', null], null, ['chose_other', 'going out with friends'], null, phone, phone, null, null],
    [1, 3, 5, 6], today)

  // Sleep: short on weeknights until the phone left the bedroom seven weeks ago; since then only on
  // Saturdays after a Friday the prep was skipped. On track every week of the last eight.
  const [sleepC] = await commitmentsOf(sleep)
  const phoneOut = await addPrep(sleepC.id, prep('Phone charging outside the bedroom', [1, 2, 3, 4, 5, 6, 7], '23:00'))
  const phoneOutFrom = weeksAgo(7)
  const skippedFriday = (d: DateStr) => isoWeekday(d) === 5 && Number(d.slice(8)) % 4 !== 0
  for (const d of days(sleepC.startDate, yesterday)) {
    const wd = isoWeekday(d)
    if (d >= phoneOutFrom && !skippedFriday(d)) await check({ subjectType: 'prep', subjectId: phoneOut.id }, d)
    if (d === addDays(today, -2)) continue // one unlogged night → a prompt on Today
    const short = d < phoneOutFrom
      ? wd === 6 || wd === 3 || (d < weeksAgo(8) && wd === 4)
      : wd === 6 && skippedFriday(addDays(d, -1))
    await logValue(sleepC, d, short ? (wd === 6 ? 7 : 6.2) : 7.5 + (Number(d.slice(8)) % 3) * 0.5)
  }

  // Punctuality: two appointments a week, late twice, until a prep five weeks ago (always done since).
  const [onTimeC] = await commitmentsOf(onTime)
  const checkFirst = await addPrep(onTimeC.id, prep('Check tomorrow’s first appointment and when to leave', [7, 1, 2, 3, 4], '22:00'))
  for (const d of days(weeksAgo(5), yesterday)) {
    if (checkFirst.fireWeekdays.includes(isoWeekday(d))) await check({ subjectType: 'prep', subjectId: checkFirst.id }, d)
  }
  const lateDays = [addDays(weeksAgo(7), 1), addDays(weeksAgo(6), 3)]
  for (const monday of withThisWeek.slice(WEEKS - 8)) {
    for (const [offset, agreed, onTimeAt, lateAt] of [[1, '09:00', '08:55', '09:12'], [3, '19:30', '19:28', '19:45']] as const) {
      const d = addDays(monday, offset)
      if (d >= today) continue
      const late = lateDays.includes(d)
      await logOccurrence(onTimeC, {
        date: d, scheduledTime: agreed, actualTime: late ? lateAt : onTimeAt,
        miss: late ? { reason: 'no_time', note: 'Left at the last minute' } : undefined,
      })
    }
  }

  // Sugar: one birthday party in 30 days (still ticked while it waits for its review).
  const [sugarC] = await commitmentsOf(sugar)
  const party = addDays(today, -20)
  for (const d of days(sugarC.startDate, yesterday)) {
    if (d === party) {
      const cake = await addDisplacement('birthday party')
      await explainMiss({ commitmentId: sugarC.id, period: 'day', slots: [{ date: d, count: 1 }] }, { reason: 'chose_other', displacementId: cake.id })
    } else {
      await check({ subjectType: 'commitment', subjectId: sugarC.id }, d)
    }
  }

  // LeetCode: no time, again and again. Mock interviews: every week but the last.
  const recent = (n: number) => withThisWeek.slice(-n)
  await rhythmHistory(leetcode, recent(7), [4, 3, 4, 2, 3, 2, 1], [null, noTime, null, noTime, noTime, null, null], [1, 2, 4, 6], today)
  await rhythmHistory(mock, recent(7), [1, 1, 1, 1, 1, 0, 0], [], [6], today)

  // Reading: forgot, with nothing to remind me.
  const [readingC] = await commitmentsOf(reading)
  const forgot: Reason = ['forgot', null]
  await rhythmHistory(readingC, recent(6), [4, 2, 3, 2, 3, 1], [null, forgot, forgot, forgot, null, null], [1, 2, 3, 4], today)

  // Replies: 4 days a week, one miss explained (the phone again) → failing.
  const [repliesC] = await commitmentsOf(friends)
  for (const d of days(repliesC.startDate, yesterday)) {
    if ([1, 2, 4, 6].includes(isoWeekday(d))) await check({ subjectType: 'commitment', subjectId: repliesC.id }, d)
  }
  const phoneId = (await addDisplacement('phone')).id
  await explainMiss({ commitmentId: repliesC.id, period: 'day', slots: [{ date: addDays(weeksAgo(3), 2), count: 1 }] }, { reason: 'chose_other', displacementId: phoneId })

  // Other preps done on most evenings they fired (the past goals had none). The gym bag is
  // skipped only on Sundays, before the one gym day that happens anyway: no clear effect.
  for (const p of await db.preps.toArray()) {
    if (p.id === phoneOut.id || p.id === checkFirst.id) continue
    const c = await db.commitments.get(p.commitmentId)
    for (const d of days(c!.startDate, yesterday)) {
      const [wd, n] = [isoWeekday(d), Number(d.slice(8))]
      const skipped = c!.id === gymC.id ? wd === 7 && n % 2 === 0 : n % 5 === 0
      if (p.fireWeekdays.includes(wd) && !skipped) {
        await check({ subjectType: 'prep', subjectId: p.id }, d)
      }
    }
  }

  // ——— projects ———

  const license = await createProject({
    title: 'Get my driver’s license', targetDate: addDays(today, 120),
    steps: ['Schedule the theory exam', 'Study the theory book', 'Sit the theory exam', 'Book practical lessons', 'Pass the practical test'],
  })
  const finances = await createProject({
    title: 'Organize my finances', targetDate: addDays(today, -5),
    steps: ['Download 3 months of bank statements', 'Put them in one spreadsheet', 'Categorize spending', 'Set a monthly budget'],
  })
  await createProject({
    title: 'Try a new hobby', targetDate: addDays(today, 45),
    steps: ['List 3 hobbies to try', 'Try the first one', 'Try the second one', 'Pick one to keep'],
  })
  const app = await createProject({
    title: 'Build my app', targetDate: addDays(today, 90),
    steps: ['Write a one-page idea', 'Sketch the main screens', 'Build a first version', 'Show it to 5 friends'],
  })
  const bike = await createProject({
    title: 'Buy a bike', targetDate: addDays(weeksAgo(16), 4),
    steps: ['Pick a budget', 'Test ride three bikes', 'Buy one'],
  })
  const cv = await createProject({
    title: 'CV & LinkedIn', targetDate: addDays(today, 10), goalId: bigTech.id,
    steps: ['Update CV', 'Get CV reviewed by a friend', 'Update LinkedIn', 'List 20 target companies'],
  })
  const systemDesign = await createProject({
    title: 'System design prep', targetDate: addDays(today, 60), goalId: bigTech.id,
    steps: ['Read a system design primer', 'Design a URL shortener', 'Design a chat app', 'Design a news feed', 'Do 2 timed practice designs'],
  })
  await createProject({
    title: 'Interview stories', targetDate: addDays(today, 30), goalId: bigTech.id,
    steps: ['List 8 situations from past work', 'Write each as a STAR story', 'Rehearse them out loud', 'Record one and review it'],
  })
  // Steps done on these days, in order.
  const doSteps = async (projectId: string, dates: DateStr[]) => {
    const steps = (await db.tasks.where('projectId').equals(projectId).toArray()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const [i, d] of dates.entries()) await check({ subjectType: 'task', subjectId: steps[i].id }, d)
  }
  // The license stalled after its first step, five weeks ago.
  await doSteps(license.id, [weeksAgo(5)])
  for (const p of [finances, cv]) await doSteps(p.id, [addDays(today, -3)])
  await doSteps(systemDesign.id, [addDays(weeksAgo(5), 2), addDays(weeksAgo(3), 4), addDays(weeksAgo(1), 1)])
  await doSteps(app.id, [addDays(weeksAgo(8), 5), addDays(weeksAgo(2), 6)])
  await doSteps(bike.id, [addDays(weeksAgo(19), 1), addDays(weeksAgo(18), 3), addDays(weeksAgo(16), 6)])
  await updateProject(bike, { state: 'done' })

  // Backdate the plan to when it would have been set up: commitments and preps
  // to their start dates (Review only counts prep edits made after that), the
  // two later preps to when they were added, "commitment added" revisions to
  // their goal's start, and projects to when they were begun.
  await db.transaction('rw', [db.commitments, db.preps, db.projects, db.revisions, db.goals], async () => {
    for (const c of await db.commitments.toArray()) {
      const at = `${c.startDate}T08:00:00.000Z`
      await db.commitments.put({ ...c, createdAt: at, updatedAt: at })
      for (const p of await db.preps.where('commitmentId').equals(c.id).toArray()) {
        await db.preps.put({ ...p, createdAt: at, updatedAt: at })
      }
    }
    for (const [p, day] of [[phoneOut, phoneOutFrom], [checkFirst, weeksAgo(5)]] as const) {
      const at = `${day}T21:00:00.000Z`
      await db.preps.update(p.id, { createdAt: at, updatedAt: at })
    }
    for (const r of await db.revisions.toArray()) {
      if (r.field !== 'commitment') continue
      const g = await db.goals.get(r.goalId)
      const at = `${g!.startDate}T08:00:00.000Z`
      await db.revisions.put({ ...r, timestamp: at, createdAt: at, updatedAt: at })
    }
    const started: [string, DateStr][] = [
      [license.id, weeksAgo(7)], [systemDesign.id, weeksAgo(6)], [app.id, weeksAgo(9)], [bike.id, weeksAgo(20)], [cv.id, weeksAgo(2)],
    ]
    for (const [id, day] of started) {
      const at = `${day}T08:00:00.000Z`
      await db.projects.update(id, { createdAt: at, updatedAt: at })
    }
  })

  // ——— weekly reviews: all done except last week, the one four weeks back, and two in the spring ———

  for (let monday = weeksAgo(30); monday < thisMonday; monday = addDays(monday, 7)) {
    if ([lastMonday, weeksAgo(4), weeksAgo(17), weeksAgo(25)].includes(monday)) continue
    await markWeekReviewed(monday)
  }

  // ——— tasks ———

  await createTask({ title: 'Pay Ana back', date: addDays(today, 1) })
  await createTask({ title: 'Clean shoes' })
  await createTask({ title: 'Message Lucas', date: today, goalId: friends.id })
  await createTask({ title: 'Ask Ana for a referral', date: addDays(today, 1), goalId: bigTech.id })
  await createTask({ title: 'Read “Deep Work”', goalId: reading.id })
  await createTask({ title: 'Renew gym membership', date: addDays(today, -1), goalId: gym.id })
}
