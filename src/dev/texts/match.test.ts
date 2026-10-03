import { describe, expect, it } from 'vitest'
import { en } from '../../i18n/en'
import { ptBR } from '../../i18n/pt-BR'
import { compile, findKeys, looseness, pluralPair, refill } from './match'

const table = {
  'a.save': 'Save',
  'a.saveChanges': 'Save changes',
  'a.left': '{n} left today',
  'a.both': '{a}, {b}',
  'a.or': 'or',
  'a.weeks.one': '{n} week',
  'a.weeks.other': '{n} weeks',
}
const c = compile(table)

describe('text tool matching', () => {
  it('finds a whole string, with what filled its blanks', () => {
    expect(findKeys(' 3 left today ', c)).toEqual([{ key: 'a.left', names: ['n'], captures: ['3'], matched: '3 left today', exact: true }])
    expect(findKeys('Save', c).map((h) => h.key)).toEqual(['a.save'])
  })

  it('falls back to a text inside a longer string, but never a bare blank or a short word', () => {
    expect(findKeys('Gym · Save changes now', c).map((h) => h.key)).toEqual(['a.save', 'a.saveChanges'])
    expect(findKeys('this or that', c)).toEqual([])
    expect(findKeys('x, y', c)).toEqual([])
  })

  it('ranks the hit whose blanks hold single words first', () => {
    const t = compile({ 'b.of': '{n} de {total}', 'b.week': '{n} semana', 'b.times': '{n} de {times} {period}' })
    const hits = findKeys('1 de 3 nesta semana', t)
    expect(hits.map((h) => [h.key, looseness(h)])).toEqual([['b.of', 2], ['b.week', 3], ['b.times', 1]])
  })

  it('refills an edited text the way the screen had it', () => {
    const [hit] = findKeys('2 weeks', c)
    expect(refill('{n} semanas', hit.names, hit.captures)).toBe('2 semanas')
    expect(pluralPair('a.weeks.one')).toBe('a.weeks.other')
    expect(pluralPair('a.save')).toBe(null)
  })

  it('compiles every real text', () => {
    expect(() => compile(en)).not.toThrow()
    expect(() => compile(ptBR)).not.toThrow()
  })
})
