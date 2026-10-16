/**
 * Tapping into a text field puts the cursor at the end of what's there, not
 * wherever the tap landed (often the start, on short values like "30"). Only
 * the tap that brings the field into focus: once it's focused, taps place the
 * cursor as usual.
 */

const TEXT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password'])

type Field = HTMLInputElement | HTMLTextAreaElement

const caretField = (el: EventTarget | null): Field | null => {
  if (el instanceof HTMLTextAreaElement) return el
  if (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) return el
  return null
}

const toEnd = (el: Field) => {
  // A selection made on purpose (a double tap, select-all on focus) stays.
  if (document.activeElement !== el || el.selectionStart !== el.selectionEnd) return
  const end = el.value.length
  try {
    el.setSelectionRange(end, end)
  } catch {
    // email inputs can refuse a selection in some browsers
  }
}

export function installCaretAtEnd() {
  let focused: { el: Field; at: number } | null = null
  document.addEventListener('focusin', (e) => {
    const el = caretField(e.target)
    if (!el) return
    focused = { el, at: Date.now() }
    // After the browser has placed the cursor for this tap.
    setTimeout(() => toEnd(el), 0)
  })
  // Some browsers (iOS) place the cursor only when the finger lifts, after focus.
  for (const type of ['mouseup', 'touchend', 'click'] as const) {
    document.addEventListener(type, (e) => {
      if (!focused || e.target !== focused.el || Date.now() - focused.at > 600) return
      const el = focused.el
      setTimeout(() => toEnd(el), 0)
      if (type === 'click') focused = null
    }, true)
  }
}
