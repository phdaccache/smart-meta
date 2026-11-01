// Smart Meta: what happens before the app's own code has run (S6 test: white screens that left no trace).
// A plain script, so it still runs when the app's code fails to load. It writes to the same log as
// src/sync/log.ts, and if nothing has been drawn after a while it says so and offers a reload.
;(function () {
  var started = Date.now()
  var DRAWN_BY_MS = 8000

  function note(text) {
    try {
      var line = new Date().toISOString().slice(5, 23).replace('T', ' ') + ' boot ' + text
      var lines = JSON.parse(localStorage.getItem('syncLog') || '[]')
      lines.push(line)
      localStorage.setItem('syncLog', JSON.stringify(lines.slice(-300)))
    } catch (e) {
      // Private mode or full: nothing to keep it in.
    }
  }

  var installed = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
  note('open in the ' + (installed ? 'app' : 'browser') + ' ' + location.pathname.split('/').slice(0, 2).join('/'))

  // A file that didn't load: these events don't bubble, so they're caught on the way down.
  addEventListener('error', function (e) {
    var el = e.target
    if (el && (el.tagName === 'SCRIPT' || el.tagName === 'LINK')) note('failed to load ' + String(el.src || el.href).split('/').pop())
  }, true)
  addEventListener('pageshow', function (e) {
    if (e.persisted) note('page came back from the browser\'s cache')
  })

  var drawn = function () {
    var root = document.getElementById('root')
    return !!root && root.childElementCount > 0
  }

  function offerReload() {
    var pt = /^pt/i.test(navigator.language || '')
    var box = document.createElement('div')
    box.id = 'boot-guard'
    box.setAttribute('role', 'alert')
    box.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center;background:Canvas;color:CanvasText;font:17px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif'
    var text = document.createElement('div')
    text.textContent = pt ? 'O Smart Meta está demorando para abrir.' : 'Smart Meta is taking a while to open.'
    var button = document.createElement('button')
    button.textContent = pt ? 'Recarregar' : 'Reload'
    button.style.cssText = 'min-height:44px;padding:0 24px;border:0;border-radius:12px;background:#007aff;color:#fff;font:600 17px -apple-system,BlinkMacSystemFont,system-ui,sans-serif'
    button.onclick = function () {
      note('reload tapped')
      location.reload()
    }
    box.appendChild(text)
    box.appendChild(button)
    document.body.appendChild(box)
    return box
  }

  setTimeout(function () {
    if (drawn()) return
    note('nothing drawn after ' + DRAWN_BY_MS / 1000 + ' s, visibility ' + document.visibilityState)
    var box = offerReload()
    // It may still come (a slow first load): then this goes away by itself.
    var id = setInterval(function () {
      if (!drawn()) return
      clearInterval(id)
      box.remove()
      note('drawn after ' + Math.round((Date.now() - started) / 1000) + ' s')
    }, 500)
  }, DRAWN_BY_MS)
})()
