import test from 'node:test'
import assert from 'node:assert/strict'
import { descendantIds, scopedNodes, automaticPositions, copySelection, pasteOperations, isTypingTarget, installAtlasLeaveGuard } from '../src/components/editor/editorGraph.js'
import { createAtlasDocument, createAtlasHistory, commitAtlasHistory, undoAtlasHistory, redoAtlasHistory, serializeAtlasDocument, parseAtlasDocument } from '../src/utils/atlasDocument.js'
import { exportAtlasCodeBlock, importAtlasCodeBlock } from '../src/utils/atlasPortable.js'

const document = {
  model: { nodes: [
    { id: 'root', parent_id: null, label: 'Root' },
    { id: 'service', parent_id: 'root', label: 'Service' },
    { id: 'child', parent_id: 'service', label: 'Child' },
    { id: 'other', parent_id: 'root', label: 'Other' },
  ], edges: [{ id: 'internal', source: 'service', target: 'child' }, { id: 'external', source: 'child', target: 'other' }] },
  layout: { positions: { service: { x: 10, y: 20 } } },
}

test('scope defaults to direct children and optionally includes descendants', () => {
  assert.deepEqual(scopedNodes(document.model, 'root', false).map(node => node.id), ['service', 'other'])
  assert.deepEqual(scopedNodes(document.model, 'service', true).map(node => node.id), ['child'])
  assert.deepEqual([...descendantIds(document.model, 'service')], ['service', 'child'])
})

test('copy includes selected subtrees and only internal relationships without mutating source', () => {
  const selection = copySelection(document, ['service', 'child'])
  assert.equal(selection.nodes.length, 2)
  assert.deepEqual(selection.edges.map(edge => edge.id), ['internal'])
  selection.nodes[0].label = 'Changed'
  assert.equal(document.model.nodes[1].label, 'Service')
  assert.deepEqual(copySelection(document, ['root']).nodes, [])
})

test('paste remaps nested parents, edge endpoints and offset positions atomically', () => {
  let counter = 0
  const result = pasteOperations(copySelection(document, ['service']), 'other', prefix => `${prefix}-${++counter}`)
  assert.equal(result.operations[0].node.parent_id, 'other')
  assert.equal(result.operations[1].node.parent_id, 'node-1')
  assert.equal(result.operations[2].edge.source, 'node-1')
  assert.equal(result.operations[2].edge.target, 'node-2')
  assert.deepEqual(result.operations[3].positions['node-1'], { x: 50, y: 60 })
})

test('auto layout assigns distinct finite positions and handles empty views', () => {
  const positions = automaticPositions(document.model.nodes)
  assert.equal(new Set(Object.values(positions).map(position => JSON.stringify(position))).size, 4)
  assert.deepEqual(automaticPositions([]), {})
})

test('shortcuts respect editable targets', () => {
  assert.equal(isTypingTarget({ closest: selector => selector.includes('textarea') ? {} : null }), true)
  assert.equal(isTypingTarget({ closest: () => null }), false)
  assert.equal(isTypingTarget({ isContentEditable: true }), true)
  assert.equal(isTypingTarget(null), false)
})

test('portable round trips and editor history preserve extension fields and revision fencing', () => {
  const original = createAtlasDocument()
  original.extension = { adapter: 'custom', payload: { values: [true, null, 42] } }
  original.model.nodes[0].extension = { owner: 'Example team', diagram: { style: 'box' } }
  original.layout.extension = { algorithm: 'manual' }
  const roundTrip = importAtlasCodeBlock(exportAtlasCodeBlock(parseAtlasDocument(serializeAtlasDocument(original))))
  assert.deepEqual(roundTrip, original)
  const first = commitAtlasHistory(createAtlasHistory(original), { base_revision: 0, operations: [{ type: 'node.update', id: original.model.nodes[0].id, changes: { label: 'Renamed' } }] })
  const undone = undoAtlasHistory(first)
  const redone = redoAtlasHistory(undone)
  assert.deepEqual(redone.document.extension, original.extension)
  assert.deepEqual(redone.document.model.nodes[0].extension, original.model.nodes[0].extension)
  assert.deepEqual(redone.document.layout.extension, original.layout.extension)
  assert.equal(redone.document.revision, 3)
  assert.throws(() => commitAtlasHistory(redone, { base_revision: 1, operations: [{ type: 'document.update', changes: { title: 'Stale' } }] }), /Revision conflict/)
})

test('foreign content import preserves host identity and undo restores the entire prior document', () => {
  const original = createAtlasDocument()
  original.extension = { receipt: 'original' }
  const imported = createAtlasDocument()
  imported.model.title = 'Imported graph'
  imported.extension = { receipt: 'imported' }
  imported.model.id = original.model.id
  const importedHistory = commitAtlasHistory(createAtlasHistory(original), { base_revision: 0, operations: [{ type: 'document.replace', document: imported }] })
  assert.equal(importedHistory.document.model.id, original.model.id)
  assert.equal(importedHistory.document.model.nodes[0].id, imported.model.nodes[0].id)
  assert.deepEqual(importedHistory.document.extension, imported.extension)
  const undone = undoAtlasHistory(importedHistory)
  assert.equal(undone.document.model.nodes[0].id, original.model.nodes[0].id)
  assert.deepEqual(undone.document.extension, original.extension)
  assert.equal(undone.document.revision, 2)
})

test('unsaved leave guard survives permission changes and cleans up after save or unmount', () => {
  const listeners = new Map()
  const browser = { addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: type => listeners.delete(type) }
  assert.equal(installAtlasLeaveGuard(browser, false), undefined)
  assert.equal(listeners.size, 0)
  const cleanup = installAtlasLeaveGuard(browser, true)
  for (const readOnly of [false, true]) {
    const event = { readOnly, prevented: false, returnValue: undefined, preventDefault() { this.prevented = true } }
    listeners.get('beforeunload')(event)
    assert.equal(event.prevented, true)
    assert.equal(event.returnValue, '')
  }
  cleanup()
  assert.equal(listeners.size, 0)
})
