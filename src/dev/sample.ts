// TEMPORARY: sample data for trying the app. Remove with the Developer section in Settings.
import { db } from '../db/db'
import {
  addCommitment, addDisplacement, addPrep, check, createGoal, createProject, createTask, explainMiss, logOccurrence,
  logValue, saveValues,
} from '../db/repo'
import { setSettings } from '../db/settings'
import { addDays, isoWeekday, parseTime, periodsBetween } from '../lib/dates'
import { emptyGoalDraft, type GoalDraft, type PrepDraft } from '../lib/draft'
import type { Commitment, DateStr, Goal, MissReason } from '../lib/types'
import { eraseAllData } from '../sync/controller'

/** Deterministic, so the sample looks the same every time. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function days(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

const prep = (title: string, fireWeekdays: number[], fireTime: string): PrepDraft => ({ title, fireWeekdays, fireTime })

async function commitmentsOf(g: Goal): Promise<Commitment[]> {
  return db.commitments.where('goalId').equals(g.id).toArray()
}

/**
 * Explains every short week except the most recent one, which is left open so
 * Today shows its miss prompt.
 */
async function explainOldWeeks(c: Commitment, today: DateStr, reasons: [MissReason, string | null][]) {
  const lastSunday = addDays(today, -isoWeekday(today))
  const weeks = periodsBetween(c.startDate, addDays(lastSunday, -7), 'week').filter((w) => w.start >= c.startDate)
  const hits = (await db.entries.toArray()).filter((e) => e.subjectId === c.id && e.outcome === 'hit')
  let i = 0
  for (const w of weeks) {
    const done = hits.filter((e) => e.date >= w.start && e.date <= w.end).length
    const short = c.cadence.times - done
    if (short <= 0) continue
    const [reason, label] = reasons[i++ % reasons.length]
    const displacementId = label ? (await addDisplacement(label)).id : null
    await explainMiss({ commitmentId: c.id, period: 'week', slots: [{ date: w.end, count: short }] }, { reason, displacementId })
  }
}

export async function loadSampleData(today: DateStr): Promise<void> {
  await eraseAllData()
  await setSettings({ onboarded: true, goalCap: 5 })
  const r = rng(42)

  await saveValues([
    { name: 'Health', description: 'Energy to do the things I care about' },
    { name: 'People', description: 'Being someone friends can count on' },
    { name: 'Growth', description: 'Always learning something' },
    { name: 'Career', description: 'Work I’m proud of, paid well' },
    { name: 'Freedom', description: 'Money and time under control' },
  ])
  const values = await db.values.toArray()
  const v = (name: string) => values.find((x) => x.name === name)!.id

  const goal = (d: Partial<GoalDraft>) => createGoal({ ...emptyGoalDraft(today), ...d } as GoalDraft)

  // ——— active goals (created first, so they take the 5 active slots) ———

  const gym = await goal({
    title: 'Exercise regularly', whyValueId: v('Health'), whyText: 'So my back stops hurting and I have energy after work.',
    shape: 'rhythm', label: 'gym', measurementDefinition: 'At least 45 minutes of exercise', times: 3, period: 'week',
    tolerancePct: 80, startDate: addDays(today, -24),
    preps: [prep('Pack the gym bag and pick tomorrow’s routine', [7, 2, 4], '21:00')],
  })
  const sleep = await goal({
    title: 'Sleep well', whyValueId: v('Health'), whyText: 'So I stop losing mornings.',
    shape: 'threshold', label: 'sleep', measurementDefinition: 'Slept at least 7.5 hours', checkinType: 'quantity',
    period: 'day', targetValue: '7.5', comparator: 'gte', unit: 'h', tolerancePct: 70, startDate: addDays(today, -20),
    preps: [prep('Phone charging outside the bedroom', [1, 2, 3, 4, 5, 6, 7], '23:00')],
  })
  const onTime = await goal({
    title: 'Be on time', whyValueId: v('People'), whyText: 'Because other people’s time matters as much as mine.',
    shape: 'standard', label: 'punctuality', measurementDefinition: 'Arrived at or before the agreed time',
    checkinType: 'timestamp', tolerancePct: 90, startDate: addDays(today, -21),
    preps: [prep('Check tomorrow’s first appointment and when to leave', [7, 1, 2, 3, 4], '22:00')],
  })
  const sugar = await goal({
    title: '30 days without sugar', whyValueId: v('Health'), whyText: 'To prove to myself cravings pass.',
    shape: 'threshold', label: 'no sugar', measurementDefinition: 'No added sugar all day', checkinType: 'binary',
    period: 'day', tolerancePct: 90, startDate: addDays(today, -12), targetDate: addDays(today, 18),
    preps: [prep('Buy fruit for the week', [7], '18:00')],
  })
  // The worked example in docs/GUIDE.md: one outcome, three behaviors, three projects.
  const bigTech = await goal({
    title: 'Work at a big tech, earning 10k+', whyValueId: v('Career'),
    whyText: 'Work on things millions use, and never worry about money again.',
    shape: 'rhythm', label: 'applications', measurementDefinition: 'Sent at least one tailored application', times: 3, period: 'week',
    tolerancePct: 70, startDate: addDays(today, -17), targetDate: addDays(today, 348),
    preps: [prep('Pick this week’s 3 companies', [7], '20:00')],
  })
  const bigTechGoal = (await db.goals.get(bigTech.id))!
  const rhythm = { checkinType: 'binary' as const, period: 'week' as const, targetValue: '', targetTime: '', comparator: 'gte' as const, unit: '' }
  await addCommitment(bigTechGoal, {
    ...rhythm, shape: 'rhythm', label: 'LeetCode', measurementDefinition: 'Solved at least 2 LeetCode problems', times: 4,
  }, addDays(today, -17))
  const mock = await addCommitment(bigTechGoal, {
    ...rhythm, shape: 'rhythm', label: 'mock interview', measurementDefinition: 'Did a mock interview with a friend', times: 1,
  }, addDays(today, -17))
  await addPrep(mock.id, prep('Book a friend for this week’s mock interview', [1], '21:00'))

  // ——— backlog (over the limit of 5) ———

  const friends = await goal({
    title: 'Answer my friends', whyValueId: v('People'), whyText: 'So friends don’t feel ignored.',
    shape: 'threshold', label: 'replies', measurementDefinition: 'Replied to every friend’s message by the end of the day',
    checkinType: 'binary', period: 'day', tolerancePct: 80,
  })
  await goal({
    title: 'Eat well', whyValueId: v('Health'), whyText: 'Food as fuel, not comfort.',
    shape: 'rhythm', label: 'home meals', measurementDefinition: 'Cooked a home meal with vegetables', times: 5, period: 'week',
    tolerancePct: 70,
  })
  const reading = await goal({
    title: 'Read 10 books a year', whyValueId: v('Growth'), whyText: 'To think with better ideas than my own.',
    shape: 'rhythm', label: 'reading', measurementDefinition: 'Read at least 20 pages', times: 4, period: 'week',
    tolerancePct: 75, targetDate: `${today.slice(0, 4)}-12-31`,
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

  // ——— history: the last few weeks ———

  const yesterday = addDays(today, -1)
  const [gymC] = await commitmentsOf(gym)
  const lastWeekFriday = addDays(today, -isoWeekday(today) - 2)
  for (const d of days(gymC.startDate, yesterday)) {
    if (![1, 3, 5].includes(isoWeekday(d))) continue
    if (d === lastWeekFriday || r() < 0.2) continue
    await check({ subjectType: 'commitment', subjectId: gymC.id }, d)
  }
  await explainOldWeeks(gymC, today, [['chose_other', 'phone'], ['too_tired', null], ['chose_other', 'going out with friends']])

  const [sleepC] = await commitmentsOf(sleep)
  for (const d of days(sleepC.startDate, yesterday)) {
    if (d === addDays(today, -2)) continue // one unlogged night → a prompt
    await logValue(sleepC, d, Math.round((7 + r() * 1.8) * 2) / 2)
  }

  const [sugarC] = await commitmentsOf(sugar)
  for (const d of days(sugarC.startDate, yesterday)) {
    if (d === addDays(today, -6)) {
      const party = await addDisplacement('birthday party')
      await explainMiss({ commitmentId: sugarC.id, period: 'day', slots: [{ date: d, count: 1 }] }, { reason: 'chose_other', displacementId: party.id })
      continue
    }
    await check({ subjectType: 'commitment', subjectId: sugarC.id }, d)
  }

  const [onTimeC] = await commitmentsOf(onTime)
  const meetings: [number, string, string][] = [[-19, '09:00', '08:55'], [-15, '14:00', '13:58'], [-12, '19:30', '19:42'], [-8, '09:00', '08:50'], [-5, '10:00', '09:57'], [-2, '18:00', '18:00']]
  for (const [offset, agreed, actual] of meetings) {
    const late = (parseTime(actual) ?? 0) > (parseTime(agreed) ?? 0)
    await logOccurrence(onTimeC, {
      date: addDays(today, offset), scheduledTime: agreed, actualTime: actual,
      miss: late ? { reason: 'no_time', note: 'Left after the last minute' } : undefined,
    })
  }

  const bigTechCs = await commitmentsOf(bigTech)
  for (const c of bigTechCs) {
    for (const d of days(c.startDate, yesterday)) {
      const wd = isoWeekday(d)
      if (c.label === 'mock interview') {
        if (wd === 6 && d !== addDays(today, -isoWeekday(today) - 1)) await check({ subjectType: 'commitment', subjectId: c.id }, d)
      } else if (wd !== 7 && r() < (c.label === 'LeetCode' ? 0.6 : 0.45)) {
        await check({ subjectType: 'commitment', subjectId: c.id }, d)
      }
    }
    await explainOldWeeks(c, today, [['chose_other', 'gaming'], ['no_time', null], ['too_tired', null]])
  }

  // Some preps done on the evenings they fired.
  const preps = await db.preps.toArray()
  for (const p of preps) {
    const c = await db.commitments.get(p.commitmentId)
    for (const d of days(c!.startDate, yesterday)) {
      if (p.fireWeekdays.includes(isoWeekday(d)) && r() < 0.6) await check({ subjectType: 'prep', subjectId: p.id }, d)
    }
  }

  // ——— projects ———

  await createProject({
    title: 'Get my driver’s license', targetDate: addDays(today, 120),
    steps: ['Schedule the theory exam', 'Study the theory book', 'Sit the theory exam', 'Book practical lessons', 'Pass the practical test'],
  })
  const finances = await createProject({
    title: 'Organize my finances', targetDate: addDays(today, 21),
    steps: ['Download 3 months of bank statements', 'Put them in one spreadsheet', 'Categorize spending', 'Set a monthly budget'],
  })
  await createProject({
    title: 'Try a new hobby', targetDate: addDays(today, 45),
    steps: ['List 3 hobbies to try', 'Try the first one', 'Try the second one', 'Pick one to keep'],
  })
  await createProject({
    title: 'Build my app', targetDate: addDays(today, 90),
    steps: ['Write a one-page idea', 'Sketch the main screens', 'Build a first version', 'Show it to 5 friends'],
  })
  const cv = await createProject({
    title: 'CV & LinkedIn', targetDate: addDays(today, 10), goalId: bigTech.id,
    steps: ['Update CV', 'Get CV reviewed by a friend', 'Update LinkedIn', 'List 20 target companies'],
  })
  await createProject({
    title: 'System design prep', targetDate: addDays(today, 60), goalId: bigTech.id,
    steps: ['Read a system design primer', 'Design a URL shortener', 'Design a chat app', 'Design a news feed', 'Do 2 timed practice designs'],
  })
  await createProject({
    title: 'Interview stories', targetDate: addDays(today, 30), goalId: bigTech.id,
    steps: ['List 8 situations from past work', 'Write each as a STAR story', 'Rehearse them out loud', 'Record one and review it'],
  })
  for (const p of [finances, cv]) {
    const first = (await db.tasks.where('projectId').equals(p.id).toArray()).find((t) => t.order === 0)!
    await check({ subjectType: 'task', subjectId: first.id }, addDays(today, -3))
  }

  // ——— tasks ———

  await createTask({ title: 'Pay Ana back', date: addDays(today, 1) })
  await createTask({ title: 'Clean shoes' })
  await createTask({ title: 'Message Lucas', date: today, goalId: friends.id })
  await createTask({ title: 'Ask Ana for a referral', date: addDays(today, 1), goalId: bigTech.id })
  await createTask({ title: 'Read “Deep Work”', goalId: reading.id })
  await createTask({ title: 'Renew gym membership', date: addDays(today, -1), goalId: gym.id })
}
