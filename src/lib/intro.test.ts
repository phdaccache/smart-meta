import { describe, expect, it } from 'vitest'
import { doneWhenProblem, validateCommitment } from './draft'
import { addMonths, draftFromExample, EXAMPLES, examplesFor, projection, toleranceLine } from './intro'

describe('intro examples', () => {
  it('every example is a goal the form would accept', () => {
    for (const e of EXAMPLES) {
      const d = draftFromExample(e, '2026-09-30')
      const problems = d.goalKind === 'outcome' ? doneWhenProblem(d.doneWhen) : Object.values(validateCommitment(d))[0]
      expect(problems ?? null, e.key).toBe(null)
      if (d.goalKind === 'outcome') expect(d.targetDate > d.startDate).toBe(true)
    }
  })

  it('offers the first example of each picked area, then fills to three', () => {
    expect(examplesFor([]).map((e) => e.key)).toEqual(['exercise', 'sleep', 'read'])
    expect(examplesFor(['create']).map((e) => e.key)).toEqual(['practise', 'project', 'exercise'])
    expect(examplesFor(['create', 'health']).map((e) => e.key)).toEqual(['exercise', 'practise', 'sleep'])
    expect(examplesFor(['health']).map((e) => e.key)).toEqual(['exercise', 'sleep', 'read'])
  })
})

describe('intro arithmetic', () => {
  it('adds months without spilling into the next one', () => {
    expect(addMonths('2026-09-30', 3)).toBe('2026-12-30')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15')
  })

  it('says tolerance as misses you can afford', () => {
    expect(toleranceLine(80)).toBe('At 80%, missing 1 in 5 still counts as on track.')
    expect(toleranceLine(70)).toBe('At 70%, missing 3 in 10 still counts as on track.')
    expect(toleranceLine(100)).toBe('At 100%, every miss puts you off track.')
  })

  it('projects what keeping the plan adds up to', () => {
    const practise = { ...draftFromExample(EXAMPLES.find((e) => e.key === 'practise')!, '2026-09-30'), targetDate: '2026-12-30' }
    expect(projection(practise, '2026-09-30')).toBe('4× a week, 80% of the time: about 42 times by 30 December.')
    const sleep = draftFromExample(EXAMPLES.find((e) => e.key === 'sleep')!, '2026-09-30')
    expect(projection(sleep, '2026-09-30')).toBe('About 74 days on track by 30 December.')
    const ontime = draftFromExample(EXAMPLES.find((e) => e.key === 'ontime')!, '2026-09-30')
    expect(projection(ontime, '2026-09-30')).toBe('Each time it comes up, you’ll log yes or no.')
    const job = draftFromExample(EXAMPLES.find((e) => e.key === 'job')!, '2026-09-30')
    expect(projection(job, '2026-09-30')).toBe('26 weeks to your deadline, 30 March.')
  })
})
