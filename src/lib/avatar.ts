/**
 * A built-in avatar (picked in S0, docs/notifications/plan.md §6.4): any emoji on one of Apple's system colors,
 * in a look and with a light pattern. About 60 bytes, so storage is no worry. The server checks the same rules
 * (supabase/migrations/0002_accounts.sql, profiles_avatar).
 */

export const AVATAR_COLORS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'indigo', 'yellow', 'mint', 'brown', 'gray'] as const
export const AVATAR_LOOKS = ['gradient', 'solid', 'soft'] as const
export const AVATAR_PATTERNS = ['none', 'dots', 'stripes', 'grid', 'waves', 'sunburst'] as const

export interface Avatar {
  emoji: string
  color: (typeof AVATAR_COLORS)[number]
  look: (typeof AVATAR_LOOKS)[number]
  pattern: (typeof AVATAR_PATTERNS)[number]
}

/** Suggested under the emoji field; any other emoji works too. */
export const AVATAR_SUGGESTIONS = [
  '🦊', '🐻', '🐼', '🐸', '🐙', '🦉', '🐢', '🦋', '🐝', '🌵', '🌻', '🍄', '🌊', '🔥', '⭐',
  '🌙', '🍉', '🥑', '🍩', '☕', '🎸', '🎨', '📚', '🚲', '⚽', '🏔️', '🚀', '🎧', '🪴', '🧩',
]

export const DEFAULT_AVATAR: Avatar = { emoji: '🦊', color: 'orange', look: 'gradient', pattern: 'dots' }

/** Longest name, as the server allows. */
export const NAME_MAX = 40

const isEmoji = (g: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g) && !/[\p{L}\p{N}\s<>&"'\\]/u.test(g)

/**
 * The last emoji typed into the field: one grapheme that is a pictograph or a flag, as the server checks.
 * Typing a second one replaces the first. Null when there's none.
 */
export function lastEmoji(text: string): string | null {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)
  const found = parts.reverse().find(isEmoji)
  return found && [...found].length <= 16 ? found : null
}

/** A stored or received avatar, if it's one this app can draw; anything else is dropped. */
export function asAvatar(v: unknown): Avatar | null {
  if (!v || typeof v !== 'object') return null
  const a = v as Record<string, unknown>
  if (Object.keys(a).length !== 4) return null
  if (typeof a.emoji !== 'string' || lastEmoji(a.emoji) !== a.emoji) return null
  if (!(AVATAR_COLORS as readonly unknown[]).includes(a.color)) return null
  if (!(AVATAR_LOOKS as readonly unknown[]).includes(a.look)) return null
  if (!(AVATAR_PATTERNS as readonly unknown[]).includes(a.pattern)) return null
  return { emoji: a.emoji, color: a.color as Avatar['color'], look: a.look as Avatar['look'], pattern: a.pattern as Avatar['pattern'] }
}

/** A name as stored: trimmed, no control characters or angle brackets, at most NAME_MAX characters. */
export function cleanName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return [...s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, NAME_MAX).join('').trim()
}
