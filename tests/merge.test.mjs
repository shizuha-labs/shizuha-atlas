import test from 'node:test'
import assert from 'node:assert/strict'
import { createAtlasDocument, applyAtlasOperations } from '../src/utils/atlasDocument.js'
import { mergeAtlasDocuments } from '../src/utils/atlasMerge.js'

const apply = (document, ...operations) => applyAtlasOperations(document, { base_revision: document.revision, operations })
function example() {
  const empty = createAtlasDocument()
  return apply(empty, ...['api', 'database'].map(id => ({ type: 'node.add', node: { id, label: id, kind: 'service', parent_id: empty.model.nodes[0].id } })))
}

test('merges independent fields, layout coordinates, entity additions, diagrams and views without mutating inputs', () => {
  const base = example()
  const local = apply(base, { type: 'node.update', id: 'api', changes: { label: 'Public API' } }, { type: 'layout.set', positions: { api: { x: 100, y: 20 } } }, { type: 'diagram.add', diagram: { id: 'sequence', title: 'Request', source: 'sequenceDiagram' } })
  const remote = apply(base, { type: 'node.update', id: 'api', changes: { description: 'Handles requests' } }, { type: 'layout.set', positions: { database: { x: 300, y: 20 } } }, { type: 'diagram.add', diagram: { id: 'state', title: 'State', source: 'stateDiagram-v2' } }, { type: 'view.upsert', view: { id: 'overview', label: 'Overview' } })
  const originals = JSON.stringify({ base, local, remote })
  const result = mergeAtlasDocuments({ base, local, remote })
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.document.revision, 3)
  assert.equal(result.document.model.model_revision, '3')
  assert.equal(result.document.model.nodes.find(node => node.id === 'api').label, 'Public API')
  assert.equal(result.document.model.nodes.find(node => node.id === 'api').description, 'Handles requests')
  assert.deepEqual(result.document.layout.positions, { database: { x: 300, y: 20 }, api: { x: 100, y: 20 } })
  assert.deepEqual(result.document.diagrams.map(diagram => diagram.id), ['state', 'sequence'])
  assert.equal(result.document.views.length, 1)
  assert.equal(JSON.stringify({ base, local, remote }), originals)
})

test('same-field divergences return structured conflicts and never a partially merged document', () => {
  const base = example()
  const local = apply(base, { type: 'node.update', id: 'api', changes: { label: 'Ours' } })
  const remote = apply(base, { type: 'node.update', id: 'api', changes: { label: 'Theirs', description: 'Independent' } })
  const result = mergeAtlasDocuments({ base, local, remote })
  assert.equal(result.document, null)
  assert.equal(result.conflicts[0].path, '/model/nodes/api/label')
  assert.equal(result.conflicts[0].kind, 'field')
  assert.equal(result.conflicts[0].base, 'api')
  assert.equal(result.conflicts[0].local, 'Ours')
  assert.equal(result.conflicts[0].remote, 'Theirs')
})

test('deletion versus editing conflicts, while independent cascade deletion and another node edit merge', () => {
  let base = example()
  base = apply(base, { type: 'node.add', node: { id: 'worker', label: 'Worker', kind: 'component', parent_id: 'api' } }, { type: 'edge.add', edge: { id: 'job', source: 'api', target: 'worker', kind: 'event' } })
  const local = apply(base, { type: 'node.remove', id: 'api', cascade: true })
  const remote = apply(base, { type: 'node.update', id: 'worker', changes: { description: 'Edited' } })
  const conflict = mergeAtlasDocuments({ base, local, remote })
  assert.equal(conflict.document, null)
  assert.equal(conflict.conflicts[0].kind, 'delete_edit')
  const independent = apply(base, { type: 'node.update', id: 'database', changes: { description: 'Durable' } })
  const merged = mergeAtlasDocuments({ base, local, remote: independent })
  assert.deepEqual(merged.conflicts, [])
  assert.deepEqual(merged.document.model.edges, [])
  assert.equal(merged.document.model.nodes.length, 2)
})

test('concurrent same-ID additions differ from independent additions and identical additions coalesce', () => {
  const base = example()
  const root = base.model.nodes[0].id
  const local = apply(base, { type: 'node.add', node: { id: 'new', label: 'Ours', kind: 'service', parent_id: root } })
  const remote = apply(base, { type: 'node.add', node: { id: 'new', label: 'Theirs', kind: 'service', parent_id: root } })
  assert.equal(mergeAtlasDocuments({ base, local, remote }).conflicts[0].kind, 'concurrent_add')
  assert.equal(mergeAtlasDocuments({ base, local, remote: local }).document.model.nodes.filter(node => node.id === 'new').length, 1)
})

test('merged reparent cycles and dangling edges fail final graph validation', () => {
  const base = example()
  const local = apply(base, { type: 'node.reparent', id: 'api', parent_id: 'database' })
  const remote = apply(base, { type: 'node.reparent', id: 'database', parent_id: 'api' })
  assert.equal(mergeAtlasDocuments({ base, local, remote }).conflicts[0].kind, 'invalid_merge')
  const removed = apply(base, { type: 'node.remove', id: 'api' })
  const connected = apply(base, { type: 'edge.add', edge: { id: 'data', source: 'api', target: 'database', kind: 'data' } })
  assert.equal(mergeAtlasDocuments({ base, local: removed, remote: connected }).conflicts[0].kind, 'invalid_merge')
})

test('ordered journey steps and source edits conflict rather than silently reorder or concatenate', () => {
  let base = example()
  base = apply(base, { type: 'diagram.add', diagram: { id: 'diagram', title: 'Source', source: 'sequenceDiagram' } })
  const local = apply(base, { type: 'diagram.update', id: 'diagram', changes: { source: 'sequenceDiagram\n A->>B: Ours' } })
  const remote = apply(base, { type: 'diagram.update', id: 'diagram', changes: { source: 'sequenceDiagram\n A->>B: Theirs' } })
  assert.equal(mergeAtlasDocuments({ base, local, remote }).conflicts[0].path, '/diagrams/diagram/source')
})

test('invalid inputs, duplicate IDs, prototype keys, identity mismatch and revision overflow fail safely', () => {
  const base = example()
  const duplicate = structuredClone(base)
  duplicate.model.nodes.push(duplicate.model.nodes[0])
  assert.equal(mergeAtlasDocuments({ base, local: duplicate, remote: base }).conflicts[0].kind, 'invalid_document')
  const unsafe = structuredClone(base)
  unsafe.extension = JSON.parse('{"__proto__":{"polluted":true}}')
  assert.equal(mergeAtlasDocuments({ base, local: unsafe, remote: base }).conflicts[0].kind, 'invalid_document')
  assert.equal({}.polluted, undefined)
  assert.equal(mergeAtlasDocuments({ base, local: createAtlasDocument(), remote: base }).conflicts[0].kind, 'identity')
  const exhausted = { ...base, revision: Number.MAX_SAFE_INTEGER }
  assert.equal(mergeAtlasDocuments({ base, local: exhausted, remote: base }).conflicts[0].kind, 'revision')
  assert.equal(mergeAtlasDocuments().conflicts.length, 3)
})
