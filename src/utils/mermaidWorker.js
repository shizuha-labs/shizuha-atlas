import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'dark',
  fontFamily: 'sans-serif',
  htmlLabels: false,
  maxTextSize: 100000,
  maxEdges: 2000,
  flowchart: { htmlLabels: false },
  secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels', 'themeCSS', 'fontFamily'],
})

let used = false
function portableSvg(svg) {
  const container = document.createElement('div')
  container.innerHTML = svg
  document.body.appendChild(container)
  const root = container.querySelector('svg')
  if (!root) throw new Error('Renderer did not return an SVG')
  const allowed = new Set(['svg', 'g', 'rect', 'path', 'text', 'tspan', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'marker', 'clippath', 'title', 'desc', 'use', 'symbol', 'pattern', 'mask', 'lineargradient', 'radialgradient', 'stop', 'filter', 'fegaussianblur', 'feoffset', 'femerge', 'femergenode', 'fecolormatrix', 'feblend', 'fecomposite', 'feflood'])
  const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'marker-start', 'marker-end', 'marker-mid']
  const elements = [root, ...root.querySelectorAll('*')]
  const appearances = elements.map(element => {
    const style = getComputedStyle(element)
    return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]))
  })
  elements.forEach((element, offset) => {
    if (!allowed.has(element.localName.toLowerCase())) { element.remove(); return }
    for (const attribute of Array.from(element.attributes)) {
      const key = attribute.name.toLowerCase()
      if (key.startsWith('on') || key === 'style' || (/url\(/i.test(attribute.value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(attribute.value)) || ((key === 'href' || key === 'xlink:href') && !/^#[A-Za-z0-9_-]+$/.test(attribute.value))) element.removeAttribute(attribute.name)
    }
    for (const [property, raw] of Object.entries(appearances[offset])) {
      const value = raw.replace(/url\(["']?[^)#]*#([A-Za-z0-9_-]+)["']?\)/g, 'url(#$1)')
      if (value && (!/url\(/i.test(value) || /^url\(#[A-Za-z0-9_-]+\)$/.test(value))) element.setAttribute(property, value)
    }
  })
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(root)
}
window.addEventListener('message', async event => {
  if (event.source !== window.parent || used || event.data?.type !== 'atlas:mermaid:render') return
  used = true
  const { source, nonce } = event.data
  if (typeof source !== 'string' || source.length > 100000 || typeof nonce !== 'string') return
  try {
    if (/%%\s*\{/.test(source) || /^\s*---(?:\s|$)/.test(source)) throw new Error('Per-diagram configuration is disabled')
    const { svg } = await mermaid.render('atlas-mermaid', source)
    if (svg.length > 8 * 1024 * 1024) throw new Error('Rendered diagram is too large')
    window.parent.postMessage({ type: 'atlas:mermaid:result', nonce, svg: portableSvg(svg) }, '*')
  } catch (error) {
    window.parent.postMessage({ type: 'atlas:mermaid:result', nonce, error: String(error?.message || error).slice(0, 4000) }, '*')
  }
})
window.parent.postMessage({ type: 'atlas:mermaid:ready' }, '*')
