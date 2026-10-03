import 'fake-indexeddb/auto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { createGoal, draftFromCommitment, updateCommitment } from '../db/repo'
import { dayMonth, relativeDay, untilText, weekdaysLabel } from '../lib/dates'
import { cadenceText, promptQuestion } from '../lib/describe'
import { emptyGoalDraft, measurementProblem } from '../lib/draft'
import { isTargetChange, revisionField, revisionValue } from '../lib/revisions'
import { commitment, goal } from '../lib/testkit'
import type { Revision } from '../lib/types'
import { en } from './en'
import { getLang, inLang, marked, num, setLangSetting, t, tn } from '.'
import { ptBR } from './pt-BR'

const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const pt = <T>(fn: () => T) => inLang('pt-BR', fn)

afterEach(() => setLangSetting('en'))

describe('language files', () => {
  it('pt-BR fills the same blanks as English', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect([k, blanks(ptBR[k])]).toEqual([k, blanks(en[k])])
  })

  it('has no empty texts', () => {
    for (const [k, v] of Object.entries(ptBR)) expect([k, v.trim().length > 0]).toEqual([k, true])
  })

  it('every plural has both forms', () => {
    for (const k of Object.keys(en)) {
      if (k.endsWith('.one')) expect(Object.keys(en)).toContain(k.replace(/one$/, 'other'))
    }
  })

  it('marks only page names with [ ], and plain text drops the marks', () => {
    const pages = ['nav.today', 'nav.plan', 'nav.review', 'nav.insights', 'nav.settings'] as const
    for (const [table, l] of [[en, 'en'], [ptBR, 'pt-BR']] as const) {
      const names = inLang(l, () => pages.map((p) => t(p).toLowerCase()))
      for (const [k, v] of Object.entries(table)) {
        for (const m of v.matchAll(/\[([^\]]+)\]/g)) expect([l, k, names.includes(m[1].toLowerCase())]).toEqual([l, k, true])
      }
    }
    expect(t('intro.goToday')).toBe('Go to Today')
    expect(marked('intro.goToday')).toBe('Go to [Today]')
  })

  it('tests and anything before startup run in English', () => {
    expect(getLang()).toBe('en')
    expect(t('nav.today')).toBe('Today')
  })
})

describe('Portuguese formatting', () => {
  it('writes dates, numbers and plurals the Brazilian way', () => {
    pt(() => {
      expect(dayMonth('2026-10-03')).toBe('3 de outubro')
      expect(relativeDay('2026-10-01', '2026-09-30')).toBe('amanhã')
      expect(relativeDay('2026-10-02', '2026-09-30')).toBe('sex')
      expect(relativeDay('2026-10-20', '2026-09-30')).toBe('20 out')
      expect(untilText('2026-10-05', '2026-09-30')).toBe('daqui 5 dias')
      expect(untilText('2026-09-29', '2026-09-30')).toBe('há 1 dia')
      expect(weekdaysLabel([1, 3])).toBe('seg, qua')
      expect(num(7.5)).toBe('7,5')
      expect(tn('today.pendingSafe', 1)).toBe('1 alteração está guardada aqui, em segurança.')
      expect(tn('today.pendingSafe', 3)).toBe('3 alterações estão guardadas aqui, em segurança.')
    })
  })

  it('describes habits and misses', () => {
    const g = goal()
    const gym = commitment(g, { label: 'academia', cadence: { period: 'week', times: 3 } })
    const sleep = commitment(g, {
      shape: 'threshold', checkinType: 'quantity', comparator: 'gte', targetValue: 7.5, unit: 'h', cadence: { period: 'day', times: 1 },
    })
    pt(() => {
      expect(cadenceText(gym)).toBe('3× por semana')
      expect(cadenceText(sleep)).toBe('diário · ≥ 7,5 h')
      const prompt = { commitmentId: gym.id, period: 'day' as const, slots: [{ date: '2026-09-29' }] }
      expect(promptQuestion(prompt as never, gym, '2026-09-30')).toBe('Ontem: você não fez academia. O que aconteceu?')
    })
  })
})

describe('the checkable rule', () => {
  it('accepts either language whatever the app is set to', () => {
    expect(measurementProblem('Pelo menos 30 minutos de exercício')).toBeNull()
    expect(measurementProblem('Dormi antes da meia-noite sempre')).toBeNull()
    expect(pt(() => measurementProblem('At least 45 minutes of exercise'))).toBeNull()
    expect(pt(() => measurementProblem('Ir para a academia'))).toBe(ptBR['err.notCheckable'])
  })
})

describe('switching language never changes stored data', () => {
  it('commitment edits store English text plus neutral fields, in any language', async () => {
    await db.delete()
    await db.open()
    setLangSetting('pt-BR')
    const g = await createGoal({ ...emptyGoalDraft('2026-09-07'), title: 'Treinar', whyValueId: 'v', whyText: 'saúde', targetDate: '2026-12-01', label: 'academia', measurementDefinition: 'Pelo menos 30 minutos de treino', times: 4 })
    const [c] = await db.commitments.where('goalId').equals(g.id).toArray()
    await updateCommitment(c, { ...draftFromCommitment(c), times: 3 })
    const [r] = await db.revisions.where('goalId').equals(g.id).toArray()
    expect(r).toMatchObject({
      field: 'academia how often', oldValue: '4× per week', newValue: '3× per week', commitmentId: c.id, part: 'cadence',
    })
    // Read back in either language.
    expect(pt(() => `${revisionField(r)}: ${revisionValue(r, 'old')} → ${revisionValue(r, 'new')}`))
      .toBe('academia frequência: 4× por semana → 3× por semana')
    setLangSetting('en')
    expect(`${revisionField(r)}: ${revisionValue(r, 'old')} → ${revisionValue(r, 'new')}`).toBe('academia how often: 4× per week → 3× per week')
  })

  it('reads revisions written before Portuguese existed', () => {
    const g = goal()
    const c = commitment(g, { label: 'gym' })
    const old: Revision = {
      id: 'r', createdAt: '', updatedAt: '', goalId: g.id, field: 'gym how often', oldValue: '4× per week', newValue: 'once a week',
      timestamp: '2026-09-20T12:00:00.000Z',
    }
    expect(isTargetChange(old, c)).toBe(true)
    expect(pt(() => [revisionValue(old, 'old'), revisionValue(old, 'new')])).toEqual(['4× por semana', 'uma vez por semana'])
    // A renamed commitment still finds its own neutral revisions.
    expect(isTargetChange({ ...old, field: 'old name how often', commitmentId: c.id, part: 'cadence' }, c)).toBe(true)
  })
})

describe('screens', () => {
  it('have no English typed straight into them', () => {
    const dirs = [join(__dirname, '../screens'), join(__dirname, '../ui')]
    const found: string[] = []
    for (const dir of dirs) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
        let text = readFileSync(join(dir, f), 'utf8')
        // The Developer section of Settings stays in English on purpose.
        const dev = text.indexOf('// ——— developer')
        const after = text.indexOf('// ——— values')
        if (dev >= 0 && after > dev) text = text.slice(0, dev) + text.slice(after)
        const jsxText = text.match(/>\s*[A-Z][a-z]+(?: [a-z’']+)+[.…]?\s*</g) ?? []
        const props = text.match(/\b(?:label|placeholder|aria-label|title)="[^"]*[a-z]{3,}[^"]*"/g) ?? []
        // A name is the same in every language.
        found.push(...[...jsxText, ...props].filter((m) => !m.includes('"Pedro')).map((m) => `${f}: ${m}`))
      }
    }
    expect(found).toEqual([])
  })
})
