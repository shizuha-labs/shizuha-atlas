const MAX_EXPANDED = 160
const MAX_QUERY_LENGTH = 14000
const DOMAIN_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#818cf8', '#f472b6']

export function indexAtlas(model) {
  if (model?.schema_version !== 1 || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
    throw new Error('This architecture snapshot has an unsupported format.')
  }
  const byId = new Map(model.nodes.map(node => [node.id, node]))
  const children = new Map(model.nodes.map(node => [node.id, []]))
  const root = model.nodes.find(node => node.parent_id === null)
  if (!root || byId.size !== model.nodes.length) throw new Error('This architecture snapshot has invalid identities.')
  for (const node of model.nodes) {
    if (node.id === root.id) continue
    if (!children.has(node.parent_id)) throw new Error('This architecture snapshot has an unknown parent.')
    children.get(node.parent_id).push(node)
  }
  const visited = new Set()
  const visit = node => {
    if (visited.has(node.id)) throw new Error('This architecture snapshot has a containment cycle.')
    visited.add(node.id)
    children.get(node.id).forEach(visit)
  }
  visit(root)
  if (visited.size !== byId.size) throw new Error('This architecture snapshot has disconnected containment.')
  if (model.edges.some(edge => !byId.has(edge.source) || !byId.has(edge.target))) {
    throw new Error('This architecture snapshot has an unknown relationship endpoint.')
  }
  return { byId, children, root, domains: children.get(root.id) }
}

export function ancestorsOf(index, nodeId) {
  const ancestors = []
  let current = index.byId.get(nodeId)
  while (current?.parent_id) {
    current = index.byId.get(current.parent_id)
    if (current) ancestors.unshift(current.id)
  }
  return ancestors
}

export function revealNodes(index, expanded, nodeIds) {
  const next = new Set(expanded)
  for (const nodeId of nodeIds) {
    for (const ancestor of ancestorsOf(index, nodeId)) next.add(ancestor)
  }
  next.add(index.root.id)
  return next
}

export function collapseNode(index, expanded, nodeId) {
  const next = new Set(expanded)
  const remove = currentId => {
    next.delete(currentId)
    for (const child of index.children.get(currentId) || []) remove(child.id)
  }
  remove(nodeId)
  next.add(index.root.id)
  return next
}

export function visibleRepresentative(index, expanded, nodeId) {
  const path = [...ancestorsOf(index, nodeId), nodeId]
  for (const ancestor of path) {
    if (ancestor !== index.root.id && !expanded.has(ancestor)) return ancestor
  }
  return nodeId
}

export function projectAtlas(model, expanded, relationshipKind = '') {
  const index = indexAtlas(model)
  const visible = []
  const collect = node => {
    if (node.id !== index.root.id) visible.push(node)
    if (node.id === index.root.id || expanded.has(node.id)) index.children.get(node.id).forEach(collect)
  }
  collect(index.root)
  const visibleIds = new Set(visible.map(node => node.id))
  const grouped = new Map()
  const internalCounts = new Map()
  for (const edge of model.edges) {
    if (relationshipKind && edge.kind !== relationshipKind) continue
    const source = visibleRepresentative(index, expanded, edge.source)
    const target = visibleRepresentative(index, expanded, edge.target)
    if (!visibleIds.has(source) || !visibleIds.has(target)) continue
    if (source === target) {
      internalCounts.set(source, (internalCounts.get(source) || 0) + 1)
      continue
    }
    const key = JSON.stringify([source, target, edge.kind])
    if (!grouped.has(key)) grouped.set(key, { id: key, source, target, kind: edge.kind, members: [], labels: [] })
    const aggregate = grouped.get(key)
    aggregate.members.push(edge)
    if (edge.label && !aggregate.labels.includes(edge.label)) aggregate.labels.push(edge.label)
  }
  return { index, nodes: visible, edges: [...grouped.values()], internalCounts }
}

export function layoutAtlas(index, expanded, { spacious = false } = {}) {
  const positions = new Map()
  const columns = index.domains.length > 4 ? 3 : 2
  const columnOffsets = Array(columns).fill(0)
  const measure = (node, width, domainId, color, depth) => {
    const children = index.children.get(node.id)
    const isExpanded = expanded.has(node.id) && children.length > 0
    const entry = { width, height: depth === 0 ? 174 : 154, domainId, color, depth, isExpanded }
    positions.set(node.id, entry)
    if (!isExpanded) return entry
    const childColumns = width >= 460 && children.length > 1 && !children.some(child => expanded.has(child.id)) ? Math.min(children.length, width >= 900 ? 3 : 2) : 1
    const padding = depth === 0 ? 20 : 12
    const gap = 14
    const childWidth = (width - padding * 2 - gap * (childColumns - 1)) / childColumns
    let rowOffset = depth === 0 ? 88 : 100
    for (let offset = 0; offset < children.length; offset += childColumns) {
      const row = children.slice(offset, offset + childColumns)
      let rowHeight = 0
      row.forEach((child, column) => {
        const childEntry = measure(child, childWidth, domainId, color, depth + 1)
        childEntry.position = { x: padding + column * (childWidth + gap), y: rowOffset }
        childEntry.parentId = node.id
        rowHeight = Math.max(rowHeight, childEntry.height)
      })
      rowOffset += rowHeight + gap
    }
    entry.height = rowOffset + padding - gap
    return entry
  }
  index.domains.forEach((domain, order) => {
    const column = order % columns
    const width = spacious ? 1100 : 520
    const entry = measure(domain, width, domain.id, DOMAIN_COLORS[order % DOMAIN_COLORS.length], 0)
    entry.position = { x: column * (width + 120), y: columnOffsets[column] }
    columnOffsets[column] += entry.height + 120
  })
  const absolutePosition = nodeId => {
    const entry = positions.get(nodeId)
    if (!entry) return { x: 0, y: 0 }
    const parent = entry.parentId ? absolutePosition(entry.parentId) : { x: 0, y: 0 }
    return { x: parent.x + entry.position.x, y: parent.y + entry.position.y }
  }
  for (const [nodeId, entry] of positions) entry.absolutePosition = absolutePosition(nodeId)
  return positions
}

export function flowSelection(model, flowId, stepIndex = 0) {
  const flow = (model.flows || []).find(item => item.id === flowId)
  if (!flow || !flow.steps?.length) return { flow: null, step: null, stepIndex: 0, nodeIds: [], edgeIds: [] }
  const boundedStep = Math.max(0, Math.min(flow.steps.length - 1, Number.isSafeInteger(stepIndex) ? stepIndex : 0))
  const step = flow.steps[boundedStep]
  const edgeIds = step.edge_ids?.length ? step.edge_ids : model.edges.filter(edge => edge.source === step.source && edge.target === step.target).map(edge => edge.id)
  return { flow, step, stepIndex: boundedStep, nodeIds: [step.source, step.target], edgeIds }
}

export function parseAtlasState(search, model) {
  const index = indexAtlas(model)
  const params = new URLSearchParams(typeof search === 'string' && search.length <= MAX_QUERY_LENGTH ? search : '')
  const expanded = new Set([index.root.id])
  const requested = (params.get('expanded') || '').split(',').slice(0, MAX_EXPANDED)
  for (const nodeId of requested) {
    if (index.children.get(nodeId)?.length) {
      for (const ancestor of ancestorsOf(index, nodeId)) expanded.add(ancestor)
      expanded.add(nodeId)
    }
  }
  const selected = params.get('node') !== index.root.id && index.byId.has(params.get('node')) ? params.get('node') : ''
  const zen = params.get('zen') !== index.root.id && index.byId.has(params.get('zen')) ? params.get('zen') : ''
  const hops = /^[0-3]$/.test(params.get('hops') || '') ? Number(params.get('hops')) : 1
  const direction = ['upstream', 'downstream'].includes(params.get('direction')) ? params.get('direction') : 'both'
  const isolation = params.get('isolation') === 'hide' ? 'hide' : 'fade'
  const selection = flowSelection(model, params.get('flow'), Number(params.get('step') || 0))
  const revealed = revealNodes(index, expanded, [...selection.nodeIds, ...(selected ? [selected] : []), ...(zen ? [zen] : [])])
  const kind = !selection.flow && model.edges.some(edge => edge.kind === params.get('kind')) ? params.get('kind') : ''
  return { expanded: revealed, selected, flow: selection.flow?.id || '', step: selection.stepIndex, kind, zen: selection.flow ? '' : zen, hops, direction, isolation }
}

export function serializeAtlasState(state, model, existingSearch = '') {
  const params = new URLSearchParams(existingSearch.length <= MAX_QUERY_LENGTH ? existingSearch : '')
  for (const key of ['expanded', 'node', 'flow', 'step', 'kind', 'zen', 'hops', 'direction', 'isolation']) params.delete(key)
  const index = indexAtlas(model)
  const expanded = [...state.expanded].filter(nodeId => nodeId !== index.root.id && index.children.get(nodeId)?.length).sort().slice(0, MAX_EXPANDED)
  if (expanded.length) params.set('expanded', expanded.join(','))
  if (state.selected && index.byId.has(state.selected)) params.set('node', state.selected)
  const selection = flowSelection(model, state.flow, state.step)
  if (selection.flow) {
    params.set('flow', selection.flow.id)
    if (selection.stepIndex) params.set('step', String(selection.stepIndex))
  }
  if (state.kind && model.edges.some(edge => edge.kind === state.kind)) params.set('kind', state.kind)
  if (!selection.flow && state.zen && state.zen !== index.root.id && index.byId.has(state.zen)) {
    params.set('zen', state.zen)
    params.set('hops', String(Number.isInteger(state.hops) ? Math.max(0, Math.min(3, state.hops)) : 1))
    if (['upstream', 'downstream'].includes(state.direction)) params.set('direction', state.direction)
    if (state.isolation === 'hide') params.set('isolation', 'hide')
  }
  return params.toString()
}

export function safeSourceUrl(value) {
  if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) <= 32 || character === '\\')) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
