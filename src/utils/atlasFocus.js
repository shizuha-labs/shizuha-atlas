import { ancestorsOf, indexAtlas } from './atlasGraph.js'

export function atlasFocus(model, focusId, hops = 1, direction = 'both') {
  const index = indexAtlas(model)
  if (!index.byId.has(focusId) || focusId === index.root.id) return null
  const depth = Math.max(0, Math.min(3, Number.isInteger(hops) ? hops : 1))
  const descendants = nodeId => {
    const collected = new Set([nodeId])
    const visit = current => {
      for (const child of index.children.get(current) || []) {
        collected.add(child.id)
        visit(child.id)
      }
    }
    visit(nodeId)
    return collected
  }
  const primaryIds = descendants(focusId)
  const relatedIds = new Set(primaryIds)
  const edgeIds = new Set(model.edges.filter(edge => primaryIds.has(edge.source) && primaryIds.has(edge.target)).map(edge => edge.id))
  let frontier = new Set(primaryIds)
  for (let distance = 0; distance < depth; distance += 1) {
    const next = new Set()
    for (const edge of model.edges) {
      const outgoing = direction !== 'upstream' && frontier.has(edge.source)
      const incoming = direction !== 'downstream' && frontier.has(edge.target)
      if (!outgoing && !incoming) continue
      edgeIds.add(edge.id)
      for (const endpoint of [edge.source, edge.target]) {
        for (const nodeId of descendants(endpoint)) {
          if (!relatedIds.has(nodeId)) next.add(nodeId)
          relatedIds.add(nodeId)
        }
      }
    }
    frontier = next
  }
  const nodeIds = new Set(relatedIds)
  for (const nodeId of relatedIds) {
    for (const ancestor of ancestorsOf(index, nodeId)) nodeIds.add(ancestor)
  }
  return { focusId, primaryIds, relatedIds, nodeIds, edgeIds }
}
