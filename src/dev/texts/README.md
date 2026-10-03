# Text tool (temporary, dev only)

Edit the app's English and Portuguese texts where they appear, and keep track
of which ones you've checked. It runs only with `npm run dev`; nothing of it is
in the built app.

## Use

1. `npm run dev`. To use it on your phone, run `npm run dev -- --host` instead
   and open the **Network** address it prints (phone and computer on the same
   Wi-Fi). The phone's data there is separate from the real app: skip the intro
   and use Settings → Developer → Load sample data.
2. The small tab on the right edge: **Aa** turns editing on (orange when on);
   the **%** below opens the list.
3. With editing on, **hold any text** (on a computer: **right-click** it). A
   panel shows that text in English and Portuguese:
   - Edit either and **Save**. It's written into `src/i18n/en.ts` and
     `pt-BR.ts` at once, shows on screen right away, and counts as OK.
   - Or **Mark OK as is**.
   - `{blanks}` are filled in by the app: keep the same ones (any order). The
     tool refuses a save that changes them.
   - If the text is built from pieces, each piece is listed. Unlikely matches
     sit under *Maybe instead*.
4. Taps work normally while editing is on; only a hold opens the editor. Turn
   it off to drag and drop or to select text.
5. **The list** (the %) has every text, grouped by screen, with OK counts per
   group. Filter *To do / OK / All*, or search English, Portuguese or the key.
   Tap a row to edit it. Use it for texts you can't hold on screen: errors,
   empty states, plurals, texts that only flash by in an animation.
   **Find** opens the screens that use the text, one by one, until it shows,
   then scrolls to it and outlines it. Texts inside a panel, an error or a
   rare state can't be shown that way; it says so, and which file uses them.

Your OKs are saved in `src/dev/texts/reviewed.json`. Commit it if you want the
progress kept on another computer or branch.

Review edits as a normal diff: `git diff src/i18n`.

## Remove

When you're done:

1. Delete this folder, `src/dev/texts/`.
2. In `src/main.tsx`, delete the two lines under `// Text tool, dev server only`.
3. In `vite.config.ts`, delete `import { textTool } from './src/dev/texts/vite-plugin'`
   and `textTool(),` in `plugins`.

Then `npm run build` to confirm.
