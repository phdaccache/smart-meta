/** Starts the text tool in its own corner of the page, apart from the app. Loaded only by the dev server. */
import { createRoot } from 'react-dom/client'
import { TextTool } from './TextTool'
import './text-tool.css'

// On the phone over Wi-Fi (http://192.168.…) the browser withholds randomUUID, which the app
// uses for every new record. getRandomValues is still there, so build one from it.
if (!window.isSecureContext && typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
  }
}

const host = document.createElement('div')
host.id = 'text-tool'
document.body.appendChild(host)
createRoot(host).render(<TextTool />)
