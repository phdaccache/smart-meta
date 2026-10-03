/**
 * Edit the app's texts where they appear: with the tool on, hold any text
 * (right-click on a computer) to edit its English and Portuguese, mark it OK,
 * and follow progress in the list. Dev only; see README.md here.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { en } from '../../i18n/en'
import { getLang, useLang } from '../../i18n'
import { ptBR } from '../../i18n/pt-BR'
import { compile, findKeys, looseness, pluralPair, refill, type Compiled, type Hit } from './match'
import type { Catalog, CatalogItem } from './vite-plugin'

// ——— the texts in memory ———

type Table = Record<string, string>
const tables = { en: en as Table, 'pt-BR': ptBR as Table }
const otherLang = () => (getLang() === 'en' ? 'pt-BR' : 'en')

let compiled: Partial<Record<'en' | 'pt-BR', Compiled[]>> = {}
const compiledFor = (lang: 'en' | 'pt-BR') => (compiled[lang] ??= compile(tables[lang]))

// ——— finding texts on screen ———

/**
 * One place on screen a text was found: a text node, or an attribute like a placeholder.
 * `score` is how likely it's the real one (lower is likelier; see looseness).
 */
interface Spot { node: Text | Element; attr?: string; hit: Hit; score: number }

const ATTRS = ['placeholder', 'aria-label', 'title', 'alt']

function stringsIn(root: Element): { node: Text | Element; attr?: string; text: string }[] {
  const out: { node: Text | Element; attr?: string; text: string }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.trim()) out.push({ node: n as Text, text: (n as Text).data })
  }
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of ATTRS) {
      const v = el.getAttribute(attr)
      if (v?.trim()) out.push({ node: el, attr, text: v })
    }
  }
  return out
}

/** Every place on screen that shows `key`, as it reads now, so an edit can show everywhere at once. */
function spotsOf(key: string): Spot[] {
  const c = compiledFor(getLang()).find((x) => x.key === key)
  if (!c) return []
  const spots: Spot[] = []
  for (const s of stringsIn(document.body)) {
    if ((s.node instanceof Text ? s.node.parentElement : s.node)?.closest('.tt-ui')) continue
    const m = c.exact.exec(s.text)
    if (m) spots.push({ node: s.node, attr: s.attr, hit: { key, names: c.names, captures: m.slice(1), matched: s.text.trim(), exact: true }, score: 0 })
  }
  return spots
}

function spotsIn(root: Element): Spot[] {
  const spots: Spot[] = []
  for (const s of stringsIn(root)) {
    let hits = findKeys(s.text, compiledFor(getLang()))
    // The Developer section and a few names stay in English whatever the language.
    if (!hits.length) hits = findKeys(s.text, compiledFor(otherLang()))
    for (const hit of hits) {
      const score = looseness(hit)
      spots.push({ node: s.node, attr: s.attr, hit, score })
      // A blank filled with another text ("nesta semana"): that one is editable too.
      for (const filled of hit.captures) {
        const inners = findKeys(filled, compiledFor(getLang())).filter((h) => h.exact)
        // A plain text beats one with blanks of its own ("nesta semana" isn't "{n} semana").
        const fewest = Math.min(...inners.map((h) => h.names.length))
        for (const inner of inners.filter((h) => h.names.length === fewest)) {
          spots.push({ node: s.node, attr: s.attr, hit: { ...inner, matched: filled.trim(), exact: false }, score })
        }
      }
    }
  }
  return spots
}

/** The texts where something was held: the element itself, widening to its parents until something matches. */
function spotsAt(target: Element): Spot[] {
  let el: Element | null = target
  for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement) {
    const spots = spotsIn(el)
    if (spots.length) return spots
  }
  return []
}

/** Puts an edited text on screen right away; the app shows the same once it next renders. */
function repaint(spots: Spot[], key: string) {
  const template = tables[getLang()][key]
  for (const { node, attr, hit } of spots) {
    if (hit.key !== key) continue
    const now = refill(template, hit.names, hit.captures)
    if (attr) {
      const el = node as Element
      el.setAttribute(attr, (el.getAttribute(attr) ?? '').replace(hit.matched, now))
    } else {
      const text = node as Text
      text.data = text.data.replace(hit.matched, now)
    }
    hit.matched = now
  }
}

/** Today on this device, YYYY-MM-DD: when a text was marked OK. */
const localDay = () => new Date().toLocaleDateString('sv-SE')

// ——— server ———

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/__texts/${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json as T
}

// ——— the tool ———

const STORE = 'textTool.on'
const HOLD_MS = 500
const MOVE_PX = 10

function readOn(): boolean {
  try {
    return localStorage.getItem(STORE) === '1'
  } catch {
    return false
  }
}

export function TextTool() {
  useLang() // matches against the language on screen
  const [on, setOn] = useState(readOn)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [here, setHere] = useState<Spot[] | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const refresh = () => call<Catalog>('catalog').then(setCatalog).catch(() => setCatalog(null))
  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORE, on ? '1' : '0')
    } catch {
      // Stays on for this visit.
    }
    document.documentElement.classList.toggle('tt-on', on)
  }, [on])

  // Hold (touch) or right-click (mouse) anywhere outside the tool.
  useEffect(() => {
    if (!on) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let start: { x: number; y: number } | null = null
    let mouse = false
    let swallowUntil = 0
    const open = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target.closest('.tt-ui')) return
      setHere(spotsAt(target))
      swallowUntil = Date.now() + 800
    }
    const down = (e: PointerEvent) => {
      mouse = e.pointerType === 'mouse'
      clearTimeout(timer)
      if (mouse || (e.target as Element).closest?.('.tt-ui')) return
      start = { x: e.clientX, y: e.clientY }
      const target = e.target
      timer = setTimeout(() => open(target), HOLD_MS)
    }
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) clearTimeout(timer)
    }
    const up = () => {
      clearTimeout(timer)
      start = null
    }
    const menu = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('.tt-ui')) return
      e.preventDefault()
      if (mouse) open(e.target)
    }
    // The tap that ends a hold mustn't also press the button under it.
    const click = (e: MouseEvent) => {
      if (Date.now() < swallowUntil && !(e.target as Element).closest?.('.tt-ui')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
    document.addEventListener('contextmenu', menu, true)
    document.addEventListener('click', click, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
      document.removeEventListener('contextmenu', menu, true)
      document.removeEventListener('click', click, true)
    }
  }, [on])

  const byKey = useMemo(() => new Map(catalog?.items.map((i) => [i.key, i])), [catalog])
  const reviewed = catalog?.reviewed ?? {}
  const total = catalog?.items.length ?? 0
  const done = catalog ? catalog.items.filter((i) => reviewed[i.key]).length : 0
  const pct = total ? Math.floor((done / total) * 100) : 0
  const pctText = done > 0 && pct === 0 ? '<1%' : `${pct}%`

  const saved = (key: string, enText: string, ptText: string) => {
    // Found with the old wording, then repainted with the new one.
    const elsewhere = spotsOf(key).filter((s) => !here?.some((h) => h.node === s.node && h.attr === s.attr))
    tables.en[key] = enText
    tables['pt-BR'][key] = ptText
    compiled = {}
    repaint([...(here ?? []), ...elsewhere], key)
    setCatalog((c) => c && {
      items: c.items.map((i) => (i.key === key ? { ...i, en: enText, pt: ptText } : i)),
      reviewed: { ...c.reviewed, [key]: localDay() },
    })
  }
  const marked = (key: string, ok: boolean) => {
    setCatalog((c) => {
      if (!c) return c
      const r = { ...c.reviewed }
      if (ok) r[key] = localDay()
      else delete r[key]
      return { ...c, reviewed: r }
    })
  }

  // The keys found where the text was held, likeliest first, each with its plural's other form.
  const hereKeys = useMemo(() => {
    const best: string[] = []
    const maybe: string[] = []
    if (!here?.length) return { best, maybe }
    const top = Math.min(...here.map((s) => s.score))
    for (const s of [...here].sort((a, b) => a.score - b.score)) {
      const list = s.score === top ? best : maybe
      for (const k of [s.hit.key, pluralPair(s.hit.key)]) {
        if (k && byKey.has(k) && !best.includes(k) && !maybe.includes(k)) list.push(k)
      }
    }
    return { best, maybe }
  }, [here, byKey])
  const [openMaybe, setOpenMaybe] = useState<string | null>(null)

  return (
    <div className="tt-ui">
      <div className="tt-pill">
        <button type="button" className={on ? 'on' : ''} onClick={() => setOn(!on)} aria-pressed={on}
          title={on ? 'Text editing on: hold any text (right-click on a computer). Tap to turn off.' : 'Turn on text editing'}>
          Aa
        </button>
        <button type="button" onClick={() => setListOpen(true)} disabled={!catalog}>{catalog ? pctText : '…'}</button>
      </div>

      {here && (
        <Panel title={hereKeys.best.length ? 'Text here' : 'No app text here'} onClose={() => { setHere(null); setOpenMaybe(null) }}>
          {!hereKeys.best.length && <p className="tt-muted">This is probably your own data (a goal’s name, a value), or a text built in a way the tool can’t trace. Find it in the list.</p>}
          {hereKeys.best.map((k) => (
            <KeyCard key={k} item={byKey.get(k)!} ok={!!reviewed[k]} onSaved={saved} onMarked={marked} />
          ))}
          {hereKeys.maybe.length > 0 && <h3 className="tt-sub">Maybe instead</h3>}
          {hereKeys.maybe.map((k) => openMaybe === k ? (
            <KeyCard key={k} item={byKey.get(k)!} ok={!!reviewed[k]} onSaved={saved} onMarked={marked} />
          ) : (
            <Row key={k} item={byKey.get(k)!} ok={!!reviewed[k]} onOpen={() => setOpenMaybe(k)} />
          ))}
        </Panel>
      )}

      {listOpen && catalog && (
        <TextList catalog={catalog} done={done} pct={pct} pctText={pctText} onClose={() => setListOpen(false)} onSaved={saved} onMarked={marked} />
      )}
    </div>
  )
}

function Panel(props: { title: string; onClose: () => void; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`tt-layer ${props.full ? 'full' : ''}`}>
      <div className="tt-backdrop" onClick={props.onClose} />
      <div className="tt-panel">
        <div className="tt-head">
          <h2>{props.title}</h2>
          <button type="button" className="tt-x" onClick={props.onClose} aria-label="Close">✕</button>
        </div>
        <div className="tt-body">{props.children}</div>
      </div>
    </div>
  )
}

// ——— one text ———

function blanksOf(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`))]
}

function AutoText(props: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [props.value])
  return (
    <label className="tt-field">
      <span>{props.label}</span>
      <textarea ref={ref} rows={1} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

function KeyCard(props: {
  item: CatalogItem; ok: boolean
  onSaved: (key: string, en: string, pt: string) => void
  onMarked: (key: string, ok: boolean) => void
}) {
  const { item } = props
  const [enText, setEn] = useState(item.en)
  const [ptText, setPt] = useState(item.pt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setEn(item.en)
    setPt(item.pt)
  }, [item.en, item.pt])
  const dirty = enText !== item.en || ptText !== item.pt
  const blanks = blanksOf(item.en)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await call('save', { key: item.key, en: enText, pt: ptText })
      props.onSaved(item.key, enText, ptText)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const mark = async () => {
    setBusy(true)
    setError(null)
    try {
      await call('review', { key: item.key, ok: !props.ok })
      props.onMarked(item.key, !props.ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`tt-card ${props.ok ? 'ok' : ''}`}>
      <div className="tt-where">
        <span>{item.group || 'Other'}</span>
        <code>{item.key}</code>
      </div>
      <AutoText label="English" value={enText} onChange={setEn} />
      <AutoText label="Português" value={ptText} onChange={setPt} />
      {blanks.length > 0 && <p className="tt-muted">The app fills in {blanks.join(' ')}. Keep them, in any order.</p>}
      {error && <p className="tt-error">{error}</p>}
      <div className="tt-actions">
        {dirty ? (
          <>
            <button type="button" className="tt-btn primary" disabled={busy} onClick={save}>Save (and mark OK)</button>
            <button type="button" className="tt-btn" disabled={busy} onClick={() => { setEn(item.en); setPt(item.pt); setError(null) }}>Undo</button>
          </>
        ) : (
          <button type="button" className={`tt-btn ${props.ok ? 'done' : 'primary'}`} disabled={busy} onClick={mark}>
            {props.ok ? '✓ OK (tap to undo)' : 'Mark OK as is'}
          </button>
        )}
      </div>
    </div>
  )
}

/** A text folded to one line; tap to edit it. */
function Row(props: { item: CatalogItem; ok: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`tt-row ${props.ok ? 'ok' : ''}`} onClick={props.onOpen}>
      <span className="tt-check">{props.ok ? '✓' : ''}</span>
      <span className="tt-row-text">
        <span>{props.item.en}</span>
        <span className="tt-muted">{props.item.pt}</span>
      </span>
    </button>
  )
}

// ——— the list ———

type Filter = 'todo' | 'ok' | 'all'

function TextList(props: {
  catalog: Catalog; done: number; pct: number; pctText: string; onClose: () => void
  onSaved: (key: string, en: string, pt: string) => void
  onMarked: (key: string, ok: boolean) => void
}) {
  const { items, reviewed } = props.catalog
  const [filter, setFilter] = useState<Filter>('todo')
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [openKey, setOpenKey] = useState<string | null>(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, { all: CatalogItem[]; shown: CatalogItem[] }>()
    for (const i of items) {
      const g = map.get(i.group) ?? { all: [], shown: [] }
      g.all.push(i)
      const passes = filter === 'all' || (filter === 'ok') === !!reviewed[i.key]
      const found = !q || i.key.toLowerCase().includes(q) || i.en.toLowerCase().includes(q) || i.pt.toLowerCase().includes(q)
      if (passes && found) g.shown.push(i)
      map.set(i.group, g)
    }
    return [...map].filter(([, g]) => g.shown.length > 0)
  }, [items, reviewed, filter, query])

  const toggle = (g: string) => setOpenGroups((s) => {
    const n = new Set(s)
    if (n.has(g)) n.delete(g)
    else n.add(g)
    return n
  })

  return (
    <Panel full title="Texts" onClose={props.onClose}>
      <div className="tt-progress">
        <div><b>{props.done}</b> of {items.length} OK · {props.pctText}</div>
        <div className="tt-bar"><i style={{ width: `${props.pct}%` }} /></div>
      </div>
      <input className="tt-search" type="search" placeholder="Search English, Portuguese or key" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="tt-filter">
        {(['todo', 'ok', 'all'] as Filter[]).map((f) => (
          <button type="button" key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'todo' ? 'To do' : f === 'ok' ? 'OK' : 'All'}
          </button>
        ))}
      </div>
      {groups.length === 0 && <p className="tt-muted">Nothing here.</p>}
      {groups.map(([name, g]) => {
        const open = openGroups.has(name) || query.trim() !== ''
        const ok = g.all.filter((i) => reviewed[i.key]).length
        return (
          <section key={name} className="tt-group">
            <button type="button" className="tt-group-head" onClick={() => toggle(name)}>
              <span>{open ? '▾' : '▸'} {name || 'Other'}</span>
              <span className={ok === g.all.length ? 'tt-all' : ''}>{ok}/{g.all.length}</span>
            </button>
            {open && g.shown.map((i) => openKey === i.key ? (
              <KeyCard key={i.key} item={i} ok={!!reviewed[i.key]} onSaved={props.onSaved} onMarked={props.onMarked} />
            ) : (
              <Row key={i.key} item={i} ok={!!reviewed[i.key]} onOpen={() => setOpenKey(i.key)} />
            ))}
          </section>
        )
      })}
    </Panel>
  )
}
