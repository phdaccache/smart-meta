import { describe, expect, it } from 'vitest'
import { inLang } from '../i18n'
import { isValid, validateCommitment, validateGoal } from './draft'
import { TEMPLATES, templatesFor } from './templates'

const start = '2026-10-02'

describe('templates', () => {
  for (const lang of ['en', 'pt-BR'] as const) {
    it(`are goals the form would accept, with valid habits and projects (${lang})`, () => {
      inLang(lang, () => {
        for (const x of TEMPLATES) {
          // The value and the why are the person's own: everything else comes ready.
          const errors = validateGoal({ ...x.draft(start), whyValueId: 'v', whyText: 'mine' })
          expect(errors, x.key).toEqual({})
          for (const h of x.habits) expect(isValid(validateCommitment(h.draft)), `${x.key} habit`).toBe(true)
          for (const p of x.projects) {
            expect(p.title, x.key).not.toBe('')
            expect(p.steps.length, `${x.key} steps`).toBeGreaterThan(1)
          }
          expect(x.why).not.toBe('')
          expect(x.summary).not.toBe('')
        }
      })
    })
  }

  it('reads numbers the way each language writes them', () => {
    const sleep = TEMPLATES.find((x) => x.key === 'sleep')!
    expect(inLang('en', () => sleep.draft(start).targetValue)).toBe('7.5')
    expect(inLang('pt-BR', () => sleep.draft(start).targetValue)).toBe('7,5')
  })

  it('puts the areas picked in the intro first, and every area somewhere', () => {
    const none = templatesFor([])
    expect(none.forYou).toEqual([])
    expect(none.more.flatMap((g) => g.templates)).toHaveLength(TEMPLATES.length)
    const some = templatesFor(['money', 'health'])
    expect(some.forYou.map((x) => x.area)).toEqual(['health', 'health', 'health', 'money', 'money'])
    expect(some.more.some((g) => g.area === 'health' || g.area === 'money')).toBe(false)
  })
})
