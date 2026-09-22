export const NODE_KINDS = ['system', 'domain', 'service', 'component', 'process', 'database', 'queue', 'external']
export const EDGE_KINDS = ['http', 'event', 'data', 'call', 'dependency', 'control']

export function editorId(prefix = 'node') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`
}

export function descendantIds(model, parentId) {
  const found = new Set([parentId])
  for (let previous = -1; previous !== found.size;) {
    previous = found.size
    for (const node of model.nodes) if (found.has(node.parent_id)) found.add(node.id)
  }
  return found
}

export function scopedNodes(model, scope, deep) {
  const descendants = deep ? descendantIds(model, scope) : null
  return model.nodes.filter(node => node.id !== scope && (deep ? descendants.has(node.id) : node.parent_id === scope))
}

export function automaticPositions(nodes) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  return Object.fromEntries(nodes.map((node, index) => [node.id, { x: index % columns * 310, y: Math.floor(index / columns) * 180 }]))
}

export function copySelection(document, selected) {
  const rootId = document.model.nodes.find(node => node.parent_id === null)?.id
  const included = new Set()
  for (const id of selected) {
    if (id === rootId) continue
    for (const child of descendantIds(document.model, id)) included.add(child)
  }
  return {
    nodes: document.model.nodes.filter(node => included.has(node.id)).map(node => structuredClone(node)),
    edges: document.model.edges.filter(edge => included.has(edge.source) && included.has(edge.target)).map(edge => structuredClone(edge)),
    positions: Object.fromEntries(Object.entries(document.layout.positions).filter(([id]) => included.has(id))),
  }
}

export function pasteOperations(clipboard, parentId, makeId = editorId) {
  const identities = new Map(clipboard.nodes.map(node => [node.id, makeId('node')]))
  const operations = clipboard.nodes.map(node => ({ type: 'node.add', node: {
    ...node, id: identities.get(node.id), label: `${node.label} copy`, parent_id: identities.get(node.parent_id) || parentId,
  } }))
  operations.push(...clipboard.edges.map(edge => ({ type: 'edge.add', edge: {
    ...edge, id: makeId('edge'), source: identities.get(edge.source), target: identities.get(edge.target),
  } })))
  const positions = Object.fromEntries(Object.entries(clipboard.positions).map(([id, position]) => [identities.get(id), { x: position.x + 40, y: position.y + 40 }]))
  if (Object.keys(positions).length) operations.push({ type: 'layout.set', positions })
  return { operations, ids: [...identities.values()] }
}

export function isTypingTarget(target) {
  return Boolean(target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))
}

export function installAtlasLeaveGuard(browser, dirty) {
  if (!dirty) return undefined
  const warn = event => { event.preventDefault(); event.returnValue = '' }
  browser.addEventListener('beforeunload', warn)
  return () => browser.removeEventListener('beforeunload', warn)
}
