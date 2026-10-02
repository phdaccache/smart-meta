import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'
import { RELEASES, unseen, type Release } from './releases'

const r = (id: string, date = '2026-10-01'): Release => ({ id, date, items: [] })
const day = '2026-10-02'
const list = [r('c'), r('b'), r('a')]

describe('release notes', () => {
  it('shows what came after the last one seen, oldest first', () => {
    expect(unseen('a', day, list).map((x) => x.id)).toEqual(['b', 'c'])
    expect(unseen('c', day, list)).toEqual([])
  })

  it('shows everything to someone who never saw any, or saw one since removed', () => {
    expect(unseen(null, day, list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(unseen('gone', day, list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops a note 10 days after it shipped, seen or not', () => {
    const notes = [r('new', '2026-10-20'), r('old', '2026-10-01')]
    expect(unseen(null, '2026-10-10', notes).map((x) => x.id)).toEqual(['old', 'new'])
    expect(unseen(null, '2026-10-11', notes).map((x) => x.id)).toEqual(['new'])
    expect(unseen('old', '2026-10-31', notes)).toEqual([])
  })

  it('skips a note about the intro for someone who went through it since', () => {
    const notes = [{ ...r('intro', '2026-10-02'), aboutIntro: true }, r('other')]
    expect(unseen(null, day, notes, null).map((x) => x.id)).toEqual(['other', 'intro'])
    expect(unseen(null, day, notes, '2026-09-30').map((x) => x.id)).toEqual(['other', 'intro'])
    expect(unseen(null, day, notes, '2026-10-02').map((x) => x.id)).toEqual(['other'])
  })

  it('every note has its texts and a unique id', () => {
    expect(new Set(RELEASES.map((x) => x.id)).size).toBe(RELEASES.length)
    for (const item of RELEASES.flatMap((x) => x.items)) {
      for (const k of [item.title, item.text, item.action?.label].filter(Boolean)) expect(en).toHaveProperty([k!])
    }
  })
})
