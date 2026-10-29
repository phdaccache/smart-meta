// comp.src.html → comp-en.html and comp-pt.html, with each language's screen rects baked in.
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('comp.src.html', 'utf8')
for (const lang of ['en', 'pt']) {
  const rects = readFileSync(`assets/rects-${lang}.json`, 'utf8')
  writeFileSync(`comp-${lang}.html`, src.replace('LANG_JSON', JSON.stringify(lang)).replace('RECTS_JSON', rects))
}
console.log('built comp-en.html, comp-pt.html')
