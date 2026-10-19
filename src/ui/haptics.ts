/**
 * A light tap of the phone's motor: when a held card lifts, when it lands.
 * Android has navigator.vibrate. iPhones (iOS 18+) don't, but toggling a
 * `switch` checkbox through its label plays the system's haptic.
 */
let label: HTMLLabelElement | null = null

export function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
    return
  }
  if (!label) {
    label = document.createElement('label')
    label.setAttribute('aria-hidden', 'true')
    label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-10px;top:-10px'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    label.appendChild(input)
    document.body.appendChild(label)
  }
  label.click()
}
