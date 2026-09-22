import { safeSourceUrl } from './atlasGraph.js'

const LIMITS = { bytes: 8 * 1024 * 1024, depth: 64, nodes: 5000, edges: 20000, operations: 1000, history: 100 }
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
const EVIDENCE = new Set(['declared', 'documented', 'inferred'])

function fail(reason, code = 'INVALID_DOCUMENT') {
  const error = new Error(reason)
  error.name = 'AtlasDocumentError'
  error.code = code
  error.reason = reason
  throw error
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function checkJson(value) {
  let size = 0
  let entries = 0
  const seen = new Set()
  const visit = (current, depth) => {
    if (depth > LIMITS.depth || ++entries > 300000) fail('Document nesting or entry limit exceeded')
    if (current === null || typeof current === 'boolean') size += 5
    else if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail('Numbers must be finite')
      size += 24
    } else if (typeof current === 'string') {
      if (current.length > 200000) fail('Text field limit exceeded')
      size += current.length * 3 + 2
    } else {
      if (!Array.isArray(current) && !plain(current)) fail('Only plain JSON values are supported')
      if (Array.isArray(current) && Object.getPrototypeOf(current) !== Array.prototype) fail('Only plain JSON arrays are supported')
      if (seen.has(current)) fail('JSON must not contain cycles')
      seen.add(current)
      if (Array.isArray(current) && current.length > LIMITS.edges) fail('Array limit exceeded')
      if (Object.getOwnPropertySymbols(current).length) fail('Symbol properties are not supported')
      for (const key of Object.getOwnPropertyNames(current)) {
        if (Array.isArray(current) && key === 'length') continue
        if (Array.isArray(current) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length)) fail('Array extension properties are not supported')
        if (FORBIDDEN.has(key)) fail('Reserved object property is not allowed')
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('Only enumerable data properties are supported')
        size += key.length * 3 + 4
        visit(descriptor.value, depth + 1)
      }
      if (Array.isArray(current) && Object.keys(current).length !== current.length) fail('Sparse or extended arrays are not supported')
      seen.delete(current)
    }
    if (size > LIMITS.bytes) fail('Document size limit exceeded')
  }
  visit(value, 0)
}

function record(value, label) {
  if (!plain(value)) fail(`${label} must be an object`)
}

function text(value, label, { empty = true, max = 200000 } = {}) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(`${label} must be ${empty ? 'a' : 'a non-empty'} string`)
}

function identity(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) || FORBIDDEN.has(value)) fail(`${label} is invalid`)
}

function unique(items, label) {
  const identifiers = new Set()
  for (const item of items) {
    record(item, label)
    identity(item.id, `${label} ID`)
    if (identifiers.has(item.id)) fail(`Duplicate ${label} ID: ${item.id}`)
    identifiers.add(item.id)
  }
  return identifiers
}

function array(value, label, limit = LIMITS.edges) {
  if (!Array.isArray(value) || value.length > limit) fail(`${label} must be an array of at most ${limit} entries`)
}

function sources(value) {
  array(value, 'Sources', 100)
  for (const source of value) {
    record(source, 'Source')
    text(source.label, 'Source label', { max: 1000 })
    text(source.type, 'Source type', { max: 100 })
    if (!safeSourceUrl(source.url)) fail('Source URL is not allowed')
  }
}

function position(value, label) {
  record(value, label)
  if (![value.x, value.y].every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1e7)) fail(`${label} coordinates are invalid`)
}

function reference(value, identifiers, label, optional = false) {
  if (optional && (value === undefined || value === '')) return
  if (!identifiers.has(value)) fail(`${label} references an unknown ID: ${value}`)
}

function validateViews(views, nodes, flows) {
  array(views, 'Views', 1000)
  unique(views, 'view')
  for (const view of views) {
    text(view.label, 'View label', { empty: false, max: 1000 })
    if (view.state !== undefined) {
      record(view.state, 'View state')
      for (const field of ['selected', 'zen']) reference(view.state[field], nodes, `View ${field}`, true)
      reference(view.state.flow, flows, 'View flow', true)
      if (view.state.expanded !== undefined) {
        array(view.state.expanded, 'Expanded nodes', LIMITS.nodes)
        for (const nodeId of view.state.expanded) reference(nodeId, nodes, 'Expanded node')
      }
    }
    if (view.viewport !== undefined) {
      position(view.viewport, 'Viewport')
      if (typeof view.viewport.zoom !== 'number' || view.viewport.zoom <= 0 || view.viewport.zoom > 100) fail('Viewport zoom is invalid')
    }
  }
}

export function validateAtlasDocument(document) {
  checkJson(document)
  record(document, 'Document')
  if (document.format !== 'shizuha-atlas' || document.version !== 1) fail('Unsupported Atlas document format or version')
  if (!Number.isSafeInteger(document.revision) || document.revision < 0) fail('Document revision must be a non-negative safe integer')
  const model = document.model
  record(model, 'Model')
  if (model.schema_version !== 1) fail('Unsupported model schema version')
  identity(model.id, 'Model ID')
  text(model.title, 'Model title', { empty: false, max: 1000 })
  text(model.description, 'Model description')
  text(model.model_revision, 'Model revision', { max: 1000 })
  text(model.updated_at, 'Model updated_at', { max: 100 })
  record(model.coverage, 'Model coverage')
  array(model.nodes, 'Nodes', LIMITS.nodes)
  array(model.edges, 'Edges')
  array(model.flows, 'Flows', 1000)
  const nodeIds = unique(model.nodes, 'node')
  const edgeIds = unique(model.edges, 'edge')
  const flowIds = unique(model.flows, 'flow')
  const parents = new Map(model.nodes.map(node => [node.id, node.parent_id]))
  if (model.nodes.filter(node => node.parent_id === null).length !== 1) fail('The model must contain exactly one root node')
  for (const node of model.nodes) {
    text(node.label, 'Node label', { empty: false, max: 1000 })
    text(node.kind, 'Node kind', { empty: false, max: 100 })
    text(node.description, 'Node description')
    sources(node.sources)
    if (!EVIDENCE.has(node.status)) fail('Node evidence status is invalid')
    if (node.parent_id !== null) reference(node.parent_id, nodeIds, 'Parent')
    const visited = new Set([node.id])
    let parent = node.parent_id
    while (parent !== null) {
      if (visited.has(parent)) fail('Containment cycle detected')
      visited.add(parent)
      if (visited.size > LIMITS.depth) fail('Containment depth limit exceeded')
      parent = parents.get(parent)
    }
  }
  for (const edge of model.edges) {
    reference(edge.source, nodeIds, 'Edge source')
    reference(edge.target, nodeIds, 'Edge target')
    text(edge.kind, 'Edge kind', { empty: false, max: 100 })
    text(edge.label, 'Edge label', { max: 1000 })
    sources(edge.sources)
    if (!EVIDENCE.has(edge.status)) fail('Edge evidence status is invalid')
  }
  for (const flow of model.flows) {
    text(flow.label, 'Flow label', { empty: false, max: 1000 })
    text(flow.description, 'Flow description')
    array(flow.steps, 'Flow steps', 2000)
    unique(flow.steps, 'step')
    for (const step of flow.steps) {
      text(step.label, 'Step label', { max: 1000 })
      text(step.description, 'Step description')
      reference(step.source, nodeIds, 'Step source')
      reference(step.target, nodeIds, 'Step target')
      if (step.edge_ids !== undefined) {
        array(step.edge_ids, 'Step edges')
        for (const edgeId of step.edge_ids) reference(edgeId, edgeIds, 'Step edge')
      }
    }
  }
  record(document.layout, 'Layout')
  record(document.layout.positions, 'Layout positions')
  for (const [nodeId, coordinates] of Object.entries(document.layout.positions)) {
    reference(nodeId, nodeIds, 'Layout node')
    position(coordinates, 'Node position')
  }
  validateViews(document.views, nodeIds, flowIds)
  return document
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function createAtlasDocument(model) {
  if (model === undefined) {
    const identifier = `atlas-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
    model = {
      schema_version: 1, id: identifier, title: 'Untitled system', description: '', model_revision: '0',
      updated_at: new Date().toISOString(), coverage: {},
      nodes: [{ id: identifier, label: 'Untitled system', kind: 'system', parent_id: null, description: '', sources: [], status: 'declared' }],
      edges: [], flows: [],
    }
  }
  const document = { format: 'shizuha-atlas', version: 1, revision: 0, model, layout: { positions: {} }, views: [] }
  validateAtlasDocument(document)
  return clone(document)
}

export function parseAtlasDocument(input) {
  if (typeof input !== 'string' || input.length > LIMITS.bytes) fail('Document input must be a bounded JSON string')
  let parsed
  try { parsed = JSON.parse(input) } catch { fail('Document is not valid JSON') }
  if (parsed?.schema_version === 1 && parsed.format === undefined) return createAtlasDocument(parsed)
  validateAtlasDocument(parsed)
  return parsed
}

export function serializeAtlasDocument(document) {
  validateAtlasDocument(document)
  return `${JSON.stringify(document, null, 2)}\n`
}

function find(items, identifier, label) {
  const item = items.find(candidate => candidate.id === identifier)
  if (!item) fail(`${label} not found: ${identifier}`, 'NOT_FOUND')
  return item
}

function changes(target, updates, prohibited = ['id']) {
  record(updates, 'Changes')
  if (prohibited.some(key => Object.hasOwn(updates, key))) fail(`Cannot update immutable fields: ${prohibited.join(', ')}`, 'INVALID_OPERATION')
  Object.assign(target, updates)
}

function removeEdges(document, edgeIds) {
  document.model.edges = document.model.edges.filter(edge => !edgeIds.has(edge.id))
  for (const flow of document.model.flows) {
    for (const step of flow.steps) {
      if (step.edge_ids) step.edge_ids = step.edge_ids.filter(edgeId => !edgeIds.has(edgeId))
    }
  }
}

function removeNode(document, operation) {
  const node = find(document.model.nodes, operation.id, 'Node')
  if (node.parent_id === null) fail('The root node cannot be removed', 'INVALID_OPERATION')
  const removed = new Set([node.id])
  let changed = true
  while (changed) {
    changed = false
    for (const candidate of document.model.nodes) {
      if (removed.has(candidate.parent_id) && !removed.has(candidate.id)) {
        removed.add(candidate.id)
        changed = true
      }
    }
  }
  const incident = new Set(document.model.edges.filter(edge => removed.has(edge.source) || removed.has(edge.target)).map(edge => edge.id))
  const flowReferences = document.model.flows.some(flow => flow.steps.some(step => removed.has(step.source) || removed.has(step.target)))
  const viewReferences = document.views.some(view => removed.has(view.state?.selected) || removed.has(view.state?.zen) || view.state?.expanded?.some(nodeId => removed.has(nodeId)))
  if (operation.cascade !== true && (removed.size > 1 || incident.size || flowReferences || viewReferences)) fail('Node has dependents; specify cascade: true', 'DEPENDENCY_CONFLICT')
  document.model.nodes = document.model.nodes.filter(candidate => !removed.has(candidate.id))
  removeEdges(document, incident)
  for (const flow of document.model.flows) flow.steps = flow.steps.filter(step => !removed.has(step.source) && !removed.has(step.target))
  for (const nodeId of removed) delete document.layout.positions[nodeId]
  for (const view of document.views) {
    if (!view.state) continue
    for (const field of ['selected', 'zen']) if (removed.has(view.state[field])) view.state[field] = ''
    if (view.state.expanded) view.state.expanded = view.state.expanded.filter(nodeId => !removed.has(nodeId))
  }
}

function operate(document, operation) {
  record(operation, 'Operation')
  const model = document.model
  switch (operation.type) {
    case 'node.add':
      record(operation.node, 'Node')
      model.nodes.push({ description: '', sources: [], status: 'declared', ...operation.node })
      break
    case 'node.update':
      changes(find(model.nodes, operation.id, 'Node'), operation.changes, ['id', 'parent_id'])
      break
    case 'node.reparent': {
      const node = find(model.nodes, operation.id, 'Node')
      if (node.parent_id === null || operation.parent_id === null) fail('The root cannot be changed by reparenting', 'INVALID_OPERATION')
      node.parent_id = operation.parent_id
      delete document.layout.positions[node.id]
      break
    }
    case 'node.remove':
      removeNode(document, operation)
      break
    case 'edge.add':
      record(operation.edge, 'Edge')
      model.edges.push({ label: '', sources: [], status: 'declared', ...operation.edge })
      break
    case 'edge.update':
      changes(find(model.edges, operation.id, 'Edge'), operation.changes)
      break
    case 'edge.remove':
      find(model.edges, operation.id, 'Edge')
      if (operation.cascade !== true && model.flows.some(flow => flow.steps.some(step => step.edge_ids?.includes(operation.id)))) fail('Edge is used by a flow; specify cascade: true', 'DEPENDENCY_CONFLICT')
      removeEdges(document, new Set([operation.id]))
      break
    case 'layout.set':
      record(operation.positions, 'Positions')
      for (const [nodeId, coordinates] of Object.entries(operation.positions)) {
        if (coordinates === null) delete document.layout.positions[nodeId]
        else document.layout.positions[nodeId] = coordinates
      }
      break
    case 'document.update':
      record(operation.changes, 'Document changes')
      if (Object.keys(operation.changes).some(key => !['title', 'description'].includes(key))) fail('Document updates support title and description only', 'INVALID_OPERATION')
      Object.assign(model, operation.changes)
      break
    case 'flow.upsert': {
      record(operation.flow, 'Flow')
      const offset = model.flows.findIndex(flow => flow.id === operation.flow.id)
      if (offset < 0) model.flows.push(operation.flow)
      else model.flows[offset] = operation.flow
      break
    }
    case 'flow.remove':
      find(model.flows, operation.id, 'Flow')
      model.flows = model.flows.filter(flow => flow.id !== operation.id)
      for (const view of document.views) if (view.state?.flow === operation.id) { view.state.flow = ''; view.state.step = 0 }
      break
    case 'view.upsert': {
      record(operation.view, 'View')
      const offset = document.views.findIndex(view => view.id === operation.view.id)
      if (offset < 0) document.views.push(operation.view)
      else document.views[offset] = operation.view
      break
    }
    case 'view.remove':
      find(document.views, operation.id, 'View')
      document.views = document.views.filter(view => view.id !== operation.id)
      break
    case 'document.replace': {
      validateAtlasDocument(operation.document)
      if (operation.document.model.id !== model.id) fail('Replacement must preserve model identity', 'INVALID_OPERATION')
      const revision = document.revision
      for (const key of Object.keys(document)) delete document[key]
      Object.assign(document, operation.document, { revision })
      break
    }
    default:
      fail(`Unsupported operation: ${operation.type}`, 'INVALID_OPERATION')
  }
}

export function applyAtlasOperations(document, envelope) {
  validateAtlasDocument(document)
  checkJson(envelope)
  record(envelope, 'Operation envelope')
  if (envelope.base_revision !== document.revision) fail(`Revision conflict: expected ${document.revision}`, 'REVISION_CONFLICT')
  array(envelope.operations, 'Operations', LIMITS.operations)
  if (!envelope.operations.length) fail('At least one operation is required', 'INVALID_OPERATION')
  if (document.revision === Number.MAX_SAFE_INTEGER) fail('Revision limit reached', 'REVISION_CONFLICT')
  const next = clone(document)
  for (const operation of clone(envelope.operations)) operate(next, operation)
  next.revision = document.revision + 1
  next.model.model_revision = String(next.revision)
  next.model.updated_at = new Date().toISOString()
  validateAtlasDocument(next)
  return next
}

export function createAtlasHistory(document = createAtlasDocument()) {
  validateAtlasDocument(document)
  return { document: clone(document), past: [], future: [] }
}

export function commitAtlasHistory(history, envelope) {
  const document = applyAtlasOperations(history.document, envelope)
  return { document, past: [...history.past, clone(history.document)].slice(-LIMITS.history), future: [] }
}

export function undoAtlasHistory(history) {
  if (!history.past.length) return history
  const previous = history.past[history.past.length - 1]
  const document = applyAtlasOperations(history.document, { base_revision: history.document.revision, operations: [{ type: 'document.replace', document: previous }] })
  return { document, past: history.past.slice(0, -1), future: [clone(history.document), ...history.future].slice(0, LIMITS.history) }
}

export function redoAtlasHistory(history) {
  if (!history.future.length) return history
  const document = applyAtlasOperations(history.document, { base_revision: history.document.revision, operations: [{ type: 'document.replace', document: history.future[0] }] })
  return { document, past: [...history.past, clone(history.document)].slice(-LIMITS.history), future: history.future.slice(1) }
}
