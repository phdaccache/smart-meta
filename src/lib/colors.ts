/** Each goal and project gets one of these muted hues (see .hue-N in styles.css). */
export const PALETTE_SIZE = 12

/** The hue to show: the stored one, or a stable one derived from the id for older records. */
export function hueOf(e: { id: string; color?: number | null }): number {
  if (e.color != null) return e.color % PALETTE_SIZE
  let h = 0
  for (const ch of e.id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h) % PALETTE_SIZE
}

/** The least-used hue, so things side by side rarely share a color. */
export function pickColor(used: { id: string; color?: number | null }[]): number {
  const counts = Array(PALETTE_SIZE).fill(0)
  for (const e of used) counts[hueOf(e)]++
  return counts.indexOf(Math.min(...counts))
}
