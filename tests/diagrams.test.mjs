import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAtlasOperations, createAtlasDocument, parseAtlasDocument, serializeAtlasDocument, createAtlasHistory, commitAtlasHistory, undoAtlasHistory, redoAtlasHistory } from '../src/utils/atlasDocument.js'
import { assertSafeMermaidSource, exportMermaidSource, MERMAID_TEMPLATES } from '../src/utils/atlasDiagrams.js'
import { exportAtlasCodeBlock, importAtlasCodeBlock } from '../src/utils/atlasPortable.js'

const apply = (document, ...operations) => applyAtlasOperations(document, { base_revision: document.revision, operations })
const diagram = { id: 'request-sequence', title: 'Request lifecycle', source: 'sequenceDiagram\n  Client->>API: Request' }

test('optional native diagrams preserve legacy documents and exact source through every text export', () => {
  const legacy = createAtlasDocument()
  assert.equal(Object.hasOwn(parseAtlasDocument(serializeAtlasDocument(legacy)), 'diagrams'), false)
  const current = apply(legacy, { type: 'diagram.add', diagram: { ...diagram, node_id: legacy.model.nodes[0].id } })
  assert.equal(exportMermaidSource(current.diagrams[0]), diagram.source)
  assert.deepEqual(parseAtlasDocument(serializeAtlasDocument(current)).diagrams, current.diagrams)
  assert.deepEqual(importAtlasCodeBlock(exportAtlasCodeBlock(current)).diagrams, current.diagrams)
  assert.equal(legacy.diagrams, undefined)
})

test('diagram operations are atomic, revision checked, and undoable', () => {
  let history = createAtlasHistory()
  history = commitAtlasHistory(history, { base_revision: 0, operations: [{ type: 'diagram.add', diagram }] })
  history = commitAtlasHistory(history, { base_revision: 1, operations: [{ type: 'diagram.update', id: diagram.id, changes: { source: 'stateDiagram-v2\n  [*] --> Ready' } }] })
  history = undoAtlasHistory(history)
  assert.equal(history.document.diagrams[0].source, diagram.source)
  history = redoAtlasHistory(history)
  assert.match(history.document.diagrams[0].source, /stateDiagram/)
  assert.throws(() => applyAtlasOperations(history.document, { base_revision: 0, operations: [{ type: 'diagram.remove', id: diagram.id }] }), /Revision conflict/)
  assert.throws(() => apply(history.document, { type: 'diagram.update', id: diagram.id, changes: { title: 'Changed' } }, { type: 'diagram.add', diagram }), /Duplicate diagram/)
  assert.equal(history.document.diagrams[0].title, diagram.title)
  const removed = apply(history.document, { type: 'diagram.remove', id: diagram.id })
  assert.deepEqual(removed.diagrams, [])
})

test('invalid metadata and dangling references are rejected while invalid Mermaid syntax is preserved as an editable draft', () => {
  for (const changes of [{ id: '__proto__' }, { title: '' }, { source: null }, { source: 'x'.repeat(100001) }, { node_id: 'missing' }]) {
    assert.throws(() => apply(createAtlasDocument(), { type: 'diagram.add', diagram: { ...diagram, ...changes } }))
  }
  const draft = apply(createAtlasDocument(), { type: 'diagram.add', diagram: { ...diagram, source: 'sequenceDiagram\n unfinished [' } })
  assert.equal(draft.diagrams[0].source, 'sequenceDiagram\n unfinished [')
})

test('node removal requires explicit cascade and detaches rather than destroys diagram source', () => {
  let current = createAtlasDocument()
  current = apply(current, { type: 'node.add', node: { id: 'api', label: 'API', kind: 'service', parent_id: current.model.nodes[0].id } }, { type: 'diagram.add', diagram: { ...diagram, node_id: 'api' } })
  assert.throws(() => apply(current, { type: 'node.remove', id: 'api' }), /dependents/)
  current = apply(current, { type: 'node.remove', id: 'api', cascade: true })
  assert.equal(current.diagrams[0].node_id, null)
  assert.equal(current.diagrams[0].source, diagram.source)
})

test('render policy rejects config overrides but does not rewrite stored source', () => {
  for (const source of ['', 'x'.repeat(100001), '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A --> B', '\n---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A --> B']) assert.throws(() => assertSafeMermaidSource(source))
  for (const entry of MERMAID_TEMPLATES) assert.equal(assertSafeMermaidSource(entry.source), entry.source)
  const source = '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A --> B'
  const current = apply(createAtlasDocument(), { type: 'diagram.add', diagram: { ...diagram, source } })
  assert.equal(exportMermaidSource(current.diagrams[0]), source)
})
