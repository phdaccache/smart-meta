// Draws the app icon (a check on deep blue) into PNGs with no dependencies.
// Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [44, 93, 143]
const FG = [252, 251, 248]

function crc32(buf) {
  let c
  const table = crc32.t ??= Array.from({ length: 256 }, (_, n) => {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Signed distance to a segment.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Coverage of the mark at unit coordinates (0..1), with 4×4 supersampling. */
function coverage(x, y, size) {
  let hit = 0
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const u = (x + (sx + 0.5) / 4) / size
      const v = (y + (sy + 0.5) / 4) / size
      const check = Math.min(segDist(u, v, 0.29, 0.52, 0.43, 0.66), segDist(u, v, 0.43, 0.66, 0.72, 0.36)) < 0.052
      if (check) hit++
    }
  }
  return hit / 16
}

function icon(size) {
  return png(size, (x, y) => {
    const a = coverage(x, y, size)
    return BG.map((c, i) => Math.round(c * (1 - a) + FG[i] * a))
  })
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', icon(192))
writeFileSync('public/icons/icon-512.png', icon(512))
writeFileSync('public/icons/apple-touch-icon.png', icon(180))
writeFileSync('public/icons/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="rgb(${BG})"/>
<path d="M29 52l14 14 29-30" fill="none" stroke="rgb(${FG})" stroke-width="10.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`)
console.log('icons written to public/icons')
