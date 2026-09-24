import runtime from 'atlas:mermaid-runtime'
import { assertSafeMermaidSource } from './atlasDiagrams.js'

export function mermaidSandboxHtml() {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script>${runtime.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}

export function renderMermaidSource(source, { signal } = {}) {
  assertSafeMermaidSource(source)
  if (signal?.aborted) return Promise.reject(new Error('Diagram render cancelled'))
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    const nonce = globalThis.crypto.randomUUID()
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('title', 'Isolated diagram renderer')
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1200px;visibility:hidden;pointer-events:none'
    let finished = false
    const finish = (error, svg) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      window.removeEventListener('message', receive)
      signal?.removeEventListener('abort', cancel)
      frame.remove()
      if (error) reject(error)
      else resolve(svg)
    }
    const cancel = () => finish(new Error('Diagram render cancelled'))
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return
      if (event.data?.type === 'atlas:mermaid:ready') frame.contentWindow.postMessage({ type: 'atlas:mermaid:render', nonce, source }, '*')
      if (event.data?.type !== 'atlas:mermaid:result' || event.data.nonce !== nonce) return
      if (event.data.error) finish(new Error(String(event.data.error)))
      else if (typeof event.data.svg !== 'string' || event.data.svg.length > 8 * 1024 * 1024) finish(new Error('Invalid renderer response'))
      else finish(null, event.data.svg)
    }
    const timeout = setTimeout(() => finish(new Error('Diagram preview timed out; simplify this diagram')), 20000)
    window.addEventListener('message', receive)
    signal?.addEventListener('abort', cancel, { once: true })
    frame.srcdoc = mermaidSandboxHtml()
    document.body.appendChild(frame)
  })
}
