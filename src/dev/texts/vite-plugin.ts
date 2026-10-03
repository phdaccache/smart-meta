/**
 * The text tool's half on the dev server: hands the browser every text with its
 * group, and writes edits straight into src/i18n/en.ts and pt-BR.ts. Dev only
 * (`apply: 'serve'`); nothing here reaches a build. See README.md here.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const FILES = { en: 'src/i18n/en.ts', pt: 'src/i18n/pt-BR.ts' } as const
const REVIEWED = 'src/dev/texts/reviewed.json'

/** One text per line: `  'key': 'value',` (a heading comment above a run of them names the group). */
const LINE = /^(\s*)'([^']+)': '((?:[^'\\]|\\.)*)',(\r?)$/
const HEADING = /^\s*\/\/\s*(.+?)\s*$/

const unquote = (s: string) => s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c))
const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')
const blanks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(', ')

export interface CatalogItem { key: string; group: string; en: string; pt: string }
export interface Catalog { items: CatalogItem[]; reviewed: Record<string, string> }

export function textTool(): Plugin {
  let root = process.cwd()
  const path = (f: string) => resolve(root, f)
  /** Files we just wrote: their change isn't sent to the browser, which already shows it. */
  const quiet = new Map<string, number>()
  const same = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

  const parse = (file: string) => {
    const texts = new Map<string, { value: string; group: string }>()
    let group = ''
    for (const line of readFileSync(path(file), 'utf8').split('\n')) {
      const m = LINE.exec(line)
      if (m) texts.set(m[2], { value: unquote(m[3]), group })
      else if (HEADING.test(line)) group = HEADING.exec(line)![1]
    }
    return texts
  }

  const readReviewed = (): Record<string, string> =>
    existsSync(path(REVIEWED)) ? JSON.parse(readFileSync(path(REVIEWED), 'utf8')) : {}
  const writeReviewed = (r: Record<string, string>) => {
    const sorted = Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(path(REVIEWED), JSON.stringify(sorted, null, 2) + '\n')
  }

  const catalog = (): Catalog => {
    const en = parse(FILES.en)
    const pt = parse(FILES.pt)
    const items = [...en].map(([key, { value, group }]) => ({ key, group, en: value, pt: pt.get(key)?.value ?? '' }))
    return { items, reviewed: readReviewed() }
  }

  const writeText = (file: string, key: string, value: string) => {
    const text = readFileSync(path(file), 'utf8')
    let found = false
    const out = text.split('\n').map((line) => {
      const m = LINE.exec(line)
      if (!m || m[2] !== key) return line
      found = true
      return `${m[1]}'${key}': '${quote(value)}',${m[4]}`
    })
    if (!found) throw new Error(`${key} is not in ${file}`)
    quiet.set(path(file), Date.now())
    writeFileSync(path(file), out.join('\n'))
  }

  const save = ({ key, en, pt }: { key: string; en: string; pt: string }) => {
    const was = parse(FILES.en).get(key)
    if (!was) throw new Error(`No text called ${key}`)
    // The blanks are the app's to fill: changing them breaks the build.
    const need = blanks(was.value)
    if (blanks(en) !== need || blanks(pt) !== need) throw new Error(need ? `Keep exactly these blanks: ${need}` : 'This text has no {blanks}.')
    if (!en.trim() || !pt.trim()) throw new Error('A text can’t be empty.')
    writeText(FILES.en, key, en)
    writeText(FILES.pt, key, pt)
    const r = readReviewed()
    r[key] = new Date().toLocaleDateString('sv-SE')
    writeReviewed(r)
  }

  const review = ({ key, ok }: { key: string; ok: boolean }) => {
    const r = readReviewed()
    if (ok) r[key] = new Date().toLocaleDateString('sv-SE')
    else delete r[key]
    writeReviewed(r)
  }

  const body = (req: IncomingMessage) =>
    new Promise<any>((done, fail) => {
      let data = ''
      req.on('data', (c) => (data += c))
      req.on('end', () => {
        try {
          done(JSON.parse(data || '{}'))
        } catch (e) {
          fail(e)
        }
      })
    })

  const send = (res: ServerResponse, status: number, value: unknown) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(value))
  }

  return {
    name: 'smart-meta-text-tool',
    apply: 'serve',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      server.middlewares.use('/__texts', async (req, res) => {
        try {
          if (req.method === 'GET' && req.url === '/catalog') return send(res, 200, catalog())
          if (req.method === 'POST' && req.url === '/save') return (save(await body(req)), send(res, 200, { ok: true }))
          if (req.method === 'POST' && req.url === '/review') return (review(await body(req)), send(res, 200, { ok: true }))
          send(res, 404, { error: 'Not found' })
        } catch (e) {
          send(res, 400, { error: e instanceof Error ? e.message : String(e) })
        }
      })
    },
    hotUpdate({ file }) {
      for (const [f, at] of quiet) {
        if (same(f, file) && Date.now() - at < 3000) return []
      }
    },
  }
}
