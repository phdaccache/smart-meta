import { describe, expect, it } from 'vitest'
import { asAvatar, cleanName, lastEmoji, NAME_MAX } from './avatar'

describe('avatar emoji', () => {
  it('takes the last emoji typed, whole', () => {
    expect(lastEmoji('🦊')).toBe('🦊')
    expect(lastEmoji('🦊🐢')).toBe('🐢')
    expect(lastEmoji('👩‍👩‍👧')).toBe('👩‍👩‍👧')
    expect(lastEmoji('🇧🇷')).toBe('🇧🇷')
    expect(lastEmoji('🏔️')).toBe('🏔️')
    expect(lastEmoji('👍🏽')).toBe('👍🏽')
  })

  it('refuses letters, digits and markup', () => {
    expect(lastEmoji('a')).toBeNull()
    expect(lastEmoji('')).toBeNull()
    expect(lastEmoji('<b>')).toBeNull()
    expect(lastEmoji('1️⃣')).toBeNull()
  })
})

describe('stored avatars', () => {
  it('keeps a valid one and drops anything else', () => {
    const ok = { emoji: '🐢', color: 'green', look: 'soft', pattern: 'waves' }
    expect(asAvatar(ok)).toEqual(ok)
    expect(asAvatar({ ...ok, color: 'black' })).toBeNull()
    expect(asAvatar({ ...ok, emoji: 'x' })).toBeNull()
    expect(asAvatar({ ...ok, extra: 1 })).toBeNull()
    expect(asAvatar(null)).toBeNull()
    expect(asAvatar('🐢')).toBeNull()
  })
})

describe('names', () => {
  it('trims, cleans and caps', () => {
    expect(cleanName('  Ana  ')).toBe('Ana')
    expect(cleanName('Ana <b>Lu</b>')).toBe('Ana bLu/b')
    expect([...cleanName('🐢'.repeat(60))].length).toBe(NAME_MAX)
  })
})
