/**
 * Developer: with Debug colors on, a readout of what happens after a Back, to see why a swipe back holds
 * the screen still for a moment: when the page draws frames, when touches reach it and where, and when
 * something scrolls. Times are in ms after the Back. Remove once that's understood.
 */
export function installNavProbe() {
  let t0 = 0
  let lines: string[] = []
  let box: HTMLDivElement | null = null
  let hide: ReturnType<typeof setTimeout> | undefined
  let touches = 0
  let scrolled = false

  const on = () => document.documentElement.classList.contains('debug-paint')
  const ms = () => Math.round(performance.now() - t0)
  const where = (el: EventTarget | null) => {
    if (!(el instanceof Element)) return String(el)
    const layers = [...document.querySelectorAll('.screen-layer')]
    const layer = el.closest('.screen-layer')
    if (!layer) return el.tagName.toLowerCase()
    const i = layers.indexOf(layer)
    return `layer ${i}/${layers.length - 1}${layer.classList.contains('leaving') ? ' leaving' : ''}`
  }
  const show = () => {
    if (!box) {
      box = document.createElement('div')
      box.style.cssText = 'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 4px);z-index:1000;'
        + 'pointer-events:none;font:11px/1.35 ui-monospace,monospace;color:#fff;background:rgb(0 0 0/0.75);'
        + 'padding:6px 8px;border-radius:8px;white-space:pre-wrap;'
      document.body.appendChild(box)
    }
    box.textContent = lines.join('\n')
    clearTimeout(hide)
    hide = setTimeout(() => { box?.remove(); box = null }, 8000)
  }
  const log = (line: string) => {
    if (!t0 || performance.now() - t0 > 4000 || lines.length > 16) return
    lines.push(`${ms()} ${line}`)
    show()
  }

  window.addEventListener('popstate', (e: PopStateEvent & { hasUAVisualTransition?: boolean }) => {
    if (!on()) return
    t0 = performance.now()
    touches = 0
    scrolled = false
    lines = [`back · browser slide: ${e.hasUAVisualTransition === undefined ? 'unknown' : e.hasUAVisualTransition}`]
    show()
    // Frames the page draws: a long gap means the page itself was busy.
    let last = performance.now()
    let biggest = 0
    const frame = () => {
      const now = performance.now()
      biggest = Math.max(biggest, now - last)
      last = now
      if (now - t0 < 1500) requestAnimationFrame(frame)
      else log(`longest frame gap in 1.5 s: ${Math.round(biggest)} ms`)
    }
    requestAnimationFrame(() => {
      log(`first frame · leaving layer: ${document.querySelector('.screen-layer.leaving') ? 'yes' : 'no'}`)
      requestAnimationFrame(frame)
    })
    // The app's own code: if it keeps running while no frame is drawn, the phone is holding the drawing back,
    // not the app being busy.
    setTimeout(() => log('first code after the Back'))
    let lastTick = performance.now()
    let busiest = 0
    let ticks = 0
    const tick = setInterval(() => {
      const now = performance.now()
      busiest = Math.max(busiest, now - lastTick)
      lastTick = now
      ticks++
      if (now - t0 < 1500) return
      clearInterval(tick)
      log(`code ran ${ticks} times in 1.5 s, longest pause ${Math.round(busiest)} ms`)
    }, 10)
  }, true)

  // The first three touches after the Back: where each starts, and its first move.
  let moved = true
  window.addEventListener('touchstart', (e) => {
    if (!t0 || ++touches > 3) return
    moved = false
    log(`touch ${touches} starts on ${where(e.target)}`)
  }, { capture: true, passive: true })
  window.addEventListener('touchmove', (e) => {
    if (!t0 || moved) return
    moved = true
    // Not cancelable: the phone is already scrolling something with this touch.
    log(`touch ${touches} moves${e.cancelable ? '' : ', scrolling'}`)
  }, { capture: true, passive: true })
  window.addEventListener('scroll', (e) => {
    if (!t0 || scrolled) return
    scrolled = true
    log(`first scroll: ${e.target === document ? 'page' : where(e.target)}`)
  }, { capture: true, passive: true })
}
