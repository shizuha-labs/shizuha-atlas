import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { applyAtlasOperations, commitAtlasHistory, createAtlasDocument, createAtlasHistory, parseAtlasDocument, redoAtlasHistory, serializeAtlasDocument, undoAtlasHistory, validateAtlasDocument } from '../src/utils/atlasDocument.js'

const sample = JSON.parse(readFileSync(new URL('../examples/sample-model.json', import.meta.url), 'utf8'))
const document = () => createAtlasDocument(sample)
const apply = (current, ...operations) => applyAtlasOperations(current, { base_revision: current.revision, operations })
const node = (id = 'worker', parent_id = 'commerce') => ({ id, parent_id, label: 'Worker', kind: 'component' })
const error = code => failure => failure.name === 'AtlasDocumentError' && failure.code === code && failure.reason === failure.message

test('creates independent portable documents and upgrades legacy models', () => {
  const created = document()
  assert.equal(validateAtlasDocument(created), created)
  assert.notEqual(created.model, sample)
  assert.deepEqual(parseAtlasDocument(serializeAtlasDocument(created)), created)
  assert.deepEqual(parseAtlasDocument(JSON.stringify(sample)), created)
  const blank = createAtlasDocument()
  assert.equal(blank.model.nodes[0].id, blank.model.id)
  assert.equal(blank.model.nodes[0].parent_id, null)
  assert.equal(blank.revision, 0)
  assert.notEqual(createAtlasDocument().model.id, blank.model.id)
})

test('validates JSON, versions, identities, containment, references and coordinates', () => {
  const invalid = [
    current => { current.version = 2 },
    current => { current.revision = -1 },
    current => { current.model.schema_version = 2 },
    current => { current.model.nodes.push({ ...current.model.nodes[0] }) },
    current => { current.model.nodes[1].parent_id = null },
    current => { current.model.nodes[1].parent_id = 'absent' },
    current => { current.model.nodes[2].parent_id = 'validation' },
    current => { current.model.edges[0].source = 'absent' },
    current => { current.model.flows[0].steps[0].edge_ids = ['absent'] },
    current => { current.model.flows[0].steps[0].target = 'absent' },
    current => { current.layout.positions.absent = { x: 0, y: 0 } },
    current => { current.layout.positions.orders = { x: Infinity, y: 0 } },
    current => { current.layout.positions.orders = { x: 1e8, y: 0 } },
    current => { current.model.nodes[1].label = '' },
    current => { current.model.nodes[1].status = 'verified' },
    current => { current.extension = undefined },
    current => { current.extension = new Date() },
    current => { current.extension = current },
    current => { current.extension = BigInt(2) },
  ]
  for (const mutate of invalid) {
    const current = document()
    mutate(current)
    assert.throws(() => validateAtlasDocument(current), error('INVALID_DOCUMENT'))
  }
  assert.throws(() => parseAtlasDocument('{broken'), error('INVALID_DOCUMENT'))
})

test('rejects prototype pollution, hidden serializers, accessors and unsafe source URLs', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const current = document()
    current.extension = JSON.parse(`{"${key}":{}}`)
    assert.throws(() => validateAtlasDocument(current), error('INVALID_DOCUMENT'))
  }
  let invoked = false
  const current = document()
  Object.defineProperty(current, 'toJSON', { value: () => { invoked = true } })
  assert.throws(() => serializeAtlasDocument(current), error('INVALID_DOCUMENT'))
  assert.equal(invoked, false)
  const getter = document()
  Object.defineProperty(getter, 'extension', { enumerable: true, get() { invoked = true } })
  assert.throws(() => validateAtlasDocument(getter), error('INVALID_DOCUMENT'))
  assert.equal(invoked, false)
  for (const url of ['javascript:alert(1)', '//evil.example', 'https://user:pass@example.org', 'https://example.org/\nsecret']) {
    const unsafe = document()
    unsafe.model.nodes[0].sources = [{ label: 'Unsafe', type: 'link', url }]
    assert.throws(() => validateAtlasDocument(unsafe), error('INVALID_DOCUMENT'))
  }
})

test('enforces resource bounds without changing caller data', () => {
  const current = document()
  current.extension = { notes: 'x'.repeat(200001) }
  assert.throws(() => validateAtlasDocument(current), error('INVALID_DOCUMENT'))
  const deeplyNested = document()
  let child = deeplyNested
  for (let depth = 0; depth < 70; depth++) { child.extra = {}; child = child.extra }
  assert.throws(() => validateAtlasDocument(deeplyNested), error('INVALID_DOCUMENT'))
  assert.throws(() => applyAtlasOperations(document(), { base_revision: 0, operations: Array.from({ length: 1001 }, () => ({ type: 'document.update', changes: { title: 'Too many' } })) }), error('INVALID_DOCUMENT'))
})

test('adds and edits nodes and edges atomically with stable IDs and safe defaults', () => {
  const current = document()
  const untouched = serializeAtlasDocument(current)
  const next = apply(current,
    { type: 'node.add', node: node() },
    { type: 'edge.add', edge: { id: 'dispatch', source: 'orders', target: 'worker', kind: 'event' } },
    { type: 'node.update', id: 'worker', changes: { label: 'Dispatch worker', extension: { owner: 'Example' } } },
    { type: 'edge.update', id: 'dispatch', changes: { label: 'Dispatch' } },
    { type: 'document.update', changes: { title: 'Edited system', description: 'Edited description' } },
  )
  assert.equal(next.revision, 1)
  assert.equal(next.model.model_revision, '1')
  assert.equal(next.model.id, current.model.id)
  assert.equal(next.model.nodes.at(-1).status, 'declared')
  assert.deepEqual(next.model.nodes.at(-1).sources, [])
  assert.equal(next.model.nodes.at(-1).extension.owner, 'Example')
  assert.equal(serializeAtlasDocument(current), untouched)
  for (const operation of [
    { type: 'node.update', id: 'orders', changes: { id: 'changed' } },
    { type: 'node.update', id: 'orders', changes: { parent_id: 'experience' } },
    { type: 'document.update', changes: { id: 'changed' } },
    { type: 'edge.update', id: 'submit-order', changes: { id: 'changed' } },
  ]) assert.throws(() => apply(current, operation), error('INVALID_OPERATION'))
})

test('rejects stale agents and failed transactions without partial mutation', () => {
  const current = document()
  const before = serializeAtlasDocument(current)
  assert.throws(() => applyAtlasOperations(current, { base_revision: 1, operations: [{ type: 'node.add', node: node() }] }), error('REVISION_CONFLICT'))
  assert.throws(() => apply(current, { type: 'node.add', node: node() }, { type: 'edge.add', edge: { id: 'bad', source: 'worker', target: 'absent', kind: 'event' } }), error('INVALID_DOCUMENT'))
  assert.throws(() => apply(current, { type: 'invented' }), error('INVALID_OPERATION'))
  assert.throws(() => apply(current, { type: 'node.remove', id: 'absent' }), error('NOT_FOUND'))
  assert.throws(() => apply(current), error('INVALID_OPERATION'))
  assert.equal(serializeAtlasDocument(current), before)
})

test('reparents safely and clears coordinates relative to the old parent', () => {
  const positioned = apply(document(), { type: 'layout.set', positions: { orders: { x: 12, y: -3 } } })
  const moved = apply(positioned, { type: 'node.reparent', id: 'orders', parent_id: 'experience' })
  assert.equal(moved.model.nodes.find(item => item.id === 'orders').parent_id, 'experience')
  assert.equal(moved.layout.positions.orders, undefined)
  assert.throws(() => apply(positioned, { type: 'node.reparent', id: 'orders', parent_id: 'validation' }), error('INVALID_DOCUMENT'))
  assert.throws(() => apply(positioned, { type: 'node.reparent', id: 'example-store', parent_id: 'commerce' }), error('INVALID_OPERATION'))
  assert.throws(() => apply(positioned, { type: 'node.reparent', id: 'orders', parent_id: null }), error('INVALID_OPERATION'))
})

test('explicit cascade removal cleans descendants, edges, flow steps, layout and views', () => {
  const current = apply(document(),
    { type: 'layout.set', positions: { validation: { x: 5, y: 8 }, storefront: { x: 10, y: 20 } } },
    { type: 'view.upsert', view: { id: 'saved', label: 'Saved', state: { selected: 'orders', zen: 'validation', expanded: ['orders', 'experience'], flow: 'order-journey' }, viewport: { x: 0, y: 0, zoom: 1 } } },
  )
  assert.throws(() => apply(current, { type: 'node.remove', id: 'orders' }), error('DEPENDENCY_CONFLICT'))
  const next = apply(current, { type: 'node.remove', id: 'orders', cascade: true })
  assert.equal(next.model.nodes.some(item => ['orders', 'validation'].includes(item.id)), false)
  assert.equal(next.model.edges.length, 0)
  assert.equal(next.model.flows[0].steps.length, 0)
  assert.deepEqual(next.layout.positions, { storefront: { x: 10, y: 20 } })
  assert.deepEqual(next.views[0].state.expanded, ['experience'])
  assert.equal(next.views[0].state.selected, '')
  assert.equal(next.views[0].state.zen, '')
  assert.throws(() => apply(next, { type: 'node.remove', id: 'example-store', cascade: true }), error('INVALID_OPERATION'))
})

test('edge removal explicitly cleans flow references; flow and view lifecycle is validated', () => {
  const current = document()
  assert.throws(() => apply(current, { type: 'edge.remove', id: 'submit-order' }), error('DEPENDENCY_CONFLICT'))
  const removed = apply(current, { type: 'edge.remove', id: 'submit-order', cascade: true })
  assert.deepEqual(removed.model.flows[0].steps[0].edge_ids, [])
  const next = apply(removed,
    { type: 'flow.upsert', flow: { id: 'order-journey', label: 'Updated flow', description: '', steps: [] } },
    { type: 'view.upsert', view: { id: 'saved', label: 'Saved', state: { flow: 'order-journey', step: 0 } } },
  )
  const deleted = apply(next, { type: 'flow.remove', id: 'order-journey' })
  assert.equal(deleted.views[0].state.flow, '')
  assert.equal(apply(deleted, { type: 'view.remove', id: 'saved' }).views.length, 0)
  assert.throws(() => apply(current, { type: 'view.upsert', view: { id: 'bad', label: 'Bad', state: { selected: 'absent' } } }), error('INVALID_DOCUMENT'))
  assert.throws(() => apply(current, { type: 'view.upsert', view: { id: 'bad', label: 'Bad', viewport: { x: 0, y: 0, zoom: 0 } } }), error('INVALID_DOCUMENT'))
})

test('manual layout merges and clears without dropping unrelated positions', () => {
  const current = apply(document(), { type: 'layout.set', positions: { orders: { x: 0, y: 1 }, storefront: { x: 4, y: 5 } } })
  const next = apply(current, { type: 'layout.set', positions: { orders: null } })
  assert.deepEqual(next.layout.positions, { storefront: { x: 4, y: 5 } })
})

test('replacement is guarded, identity-preserving and detached from caller values', () => {
  const current = document()
  const replacement = document()
  replacement.model.title = 'Imported revision'
  replacement.extension = { renderer: 'custom' }
  replacement.revision = 900
  const next = apply(current, { type: 'document.replace', document: replacement })
  assert.equal(next.revision, 1)
  assert.equal(next.model.title, replacement.model.title)
  assert.notEqual(next.model, replacement.model)
  assert.deepEqual(next.extension, replacement.extension)
  assert.throws(() => apply(current, { type: 'document.replace', document: createAtlasDocument() }), error('INVALID_OPERATION'))
})

test('undo and redo preserve monotonic revisions and invalidate stale agent envelopes', () => {
  const initial = createAtlasHistory(document())
  const edited = commitAtlasHistory(initial, { base_revision: 0, operations: [{ type: 'node.add', node: node() }] })
  const undone = undoAtlasHistory(edited)
  const redone = redoAtlasHistory(undone)
  assert.deepEqual([initial.document.revision, edited.document.revision, undone.document.revision, redone.document.revision], [0, 1, 2, 3])
  assert.equal(undone.document.model.nodes.length, sample.nodes.length)
  assert.equal(redone.document.model.nodes.length, sample.nodes.length + 1)
  assert.throws(() => applyAtlasOperations(undone.document, { base_revision: 0, operations: [{ type: 'node.add', node: node() }] }), error('REVISION_CONFLICT'))
  assert.equal(undoAtlasHistory(initial), initial)
  assert.equal(redoAtlasHistory(initial), initial)
  const branched = commitAtlasHistory(undone, { base_revision: 2, operations: [{ type: 'document.update', changes: { title: 'Different edit' } }] })
  assert.equal(branched.future.length, 0)
})

test('history is bounded to one hundred commits', () => {
  let history = createAtlasHistory(document())
  for (let revision = 0; revision < 110; revision++) {
    history = commitAtlasHistory(history, { base_revision: revision, operations: [{ type: 'document.update', changes: { title: `Edit ${revision}` } }] })
  }
  assert.equal(history.document.revision, 110)
  assert.equal(history.past.length, 100)
  assert.equal(history.past[0].revision, 10)
})
