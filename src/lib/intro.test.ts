import { describe, expect, it } from 'vitest'
import { doneWhenProblem, validateCommitment } from './draft'
import { addMonths, draftFromExample, EXAMPLES, examplesFor, projection, spanText, toleranceLine } from './intro'

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
    const at = (key: string) => draftFromExample(EXAMPLES.find((e) => e.key === key)!, '2026-09-30')
    expect(projection({ ...at('practise'), targetDate: '2026-12-30' }, '2026-09-30')).toEqual({
      line: 'In 3 months, at 80%, you’ll have done at least…', big: '42×', caption: 'practice',
    })
    expect(projection(at('sleep'), '2026-09-30')).toEqual({
      line: 'In 3 months, at 80%, you’ll have at least…', big: '74 days', caption: 'sleep on track',
    })
    expect(projection(at('ontime'), '2026-09-30')?.big).toBe('13 weeks')
    expect(projection(at('job'), '2026-09-30')).toEqual({
      line: 'Your deadline is 30 March. That gives you…', big: '181 days', caption: 'to make it happen',
    })
    expect(spanText(10)).toBe('10 days')
    expect(spanText(42)).toBe('6 weeks')
    expect(spanText(800)).toBe('2 years')
  })
})
