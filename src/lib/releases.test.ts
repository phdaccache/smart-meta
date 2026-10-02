import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { RELEASES, unseen, type Release } from './releases'

const r = (id: string): Release => ({ id, items: [] })
const list = [r('c'), r('b'), r('a')]

describe('release notes', () => {
  it('shows what came after the last one seen', () => {
    expect(unseen('a', list).map((x) => x.id)).toEqual(['c', 'b'])
    expect(unseen('c', list)).toEqual([])
  })

  it('shows only the newest to someone who never saw any, or saw one since removed', () => {
    expect(unseen(null, list).map((x) => x.id)).toEqual(['c'])
    expect(unseen('gone', list).map((x) => x.id)).toEqual(['c'])
  })

  it('every note has its texts and a unique id', () => {
    expect(new Set(RELEASES.map((x) => x.id)).size).toBe(RELEASES.length)
    for (const item of RELEASES.flatMap((x) => x.items)) {
      for (const k of [item.title, item.text, item.action?.label].filter(Boolean)) expect(en).toHaveProperty([k!])
    }
  })
})
