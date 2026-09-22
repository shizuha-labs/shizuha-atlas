import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { ancestorsOf, atlasFocus, collapseNode, expansionState, flowSelection, indexAtlas, keyboardPan, layoutAtlas, minimapSize, parseAtlasState, projectAtlas, revealNodes, safeSourceUrl, serializeAtlasState } from '../dist/core.mjs'

const sample = JSON.parse(readFileSync(new URL('../examples/sample-model.json', import.meta.url), 'utf8'))
const index = indexAtlas(sample)
const base = parseAtlasState('', sample)

test('synthetic model validates without private data or a hard-coded root', () => {
  assert.equal(index.root.id, 'example-store')
  assert.deepEqual(ancestorsOf(index, 'validation'), ['example-store', 'commerce', 'orders'])
  assert.equal(sample.nodes.every(node => node.sources.length === 0), true)
})

test('mixed-depth expansion preserves neighbors and rolls edges to visible endpoints', () => {
  const expanded = revealNodes(index, base.expanded, ['validation'])
  const result = projectAtlas(sample, expanded)
  assert.deepEqual(result.nodes.map(node => node.id), ['experience', 'commerce', 'orders', 'validation'])
  assert.deepEqual(result.edges.map(edge => [edge.source, edge.target, edge.kind]), [['experience', 'validation', 'http']])
  const collapsed = collapseNode(index, expanded, 'commerce')
  assert.deepEqual(projectAtlas(sample, collapsed).edges.map(edge => [edge.source, edge.target]), [['experience', 'commerce']])
})

test('edge aggregation preserves direction, kind, evidence and internal counts', () => {
  const model = structuredClone(sample)
  model.edges.push({ ...model.edges[0], id: 'submit-second', label: 'Submit another' })
  model.edges.push({ ...model.edges[0], id: 'response', source: 'validation', target: 'storefront' })
  model.edges.push({ ...model.edges[0], id: 'event', kind: 'event' })
  model.edges.push({ ...model.edges[0], id: 'internal', source: 'orders' })
  const result = projectAtlas(model, base.expanded)
  assert.equal(result.edges.length, 3)
  assert.equal(result.edges.find(edge => edge.source === 'experience' && edge.kind === 'http').members.length, 2)
  assert.equal(result.internalCounts.get('commerce'), 1)
  assert.equal(projectAtlas(model, base.expanded, 'event').edges.length, 1)
})

test('unrelated domain geometry stays stable and spacious focus gets room', () => {
  const initial = layoutAtlas(index, base.expanded)
  const expanded = layoutAtlas(index, revealNodes(index, base.expanded, ['validation']))
  assert.deepEqual(expanded.get('experience').position, initial.get('experience').position)
  assert.equal(layoutAtlas(index, base.expanded, { spacious: true }).get('commerce').width, 1100)
})

test('URL state reveals deep selections and preserves unrelated host scope', () => {
  const state = parseAtlasState('?node=validation&zen=orders&hops=2&direction=upstream&isolation=hide', sample)
  assert.equal(state.expanded.has('orders'), true)
  assert.equal(state.zen, 'orders')
  const query = serializeAtlasState(state, sample, '?tenant=example&host_tab=design')
  assert.equal(new URLSearchParams(query).get('tenant'), 'example')
  assert.equal(new URLSearchParams(query).get('host_tab'), 'design')
  assert.deepEqual(parseAtlasState(query, sample), state)
  assert.equal(parseAtlasState('?node=absent&hops=999&direction=invalid', sample).selected, '')
  assert.equal(parseAtlasState(`?node=validation&extra=${'x'.repeat(14000)}`, sample).selected, '')
})

test('flow selection clamps steps and reveals both endpoints', () => {
  const state = parseAtlasState('?flow=order-journey&step=999', sample)
  assert.equal(state.step, 0)
  assert.equal(state.expanded.has('experience'), true)
  assert.equal(state.expanded.has('orders'), true)
  assert.deepEqual(flowSelection(sample, 'order-journey').edgeIds, ['submit-order'])
  assert.equal(flowSelection(sample, 'absent').flow, null)
})

test('focus is directed, bounded, includes descendants and does not invent edges', () => {
  const upstream = atlasFocus(sample, 'orders', 1, 'upstream')
  assert.equal(upstream.relatedIds.has('storefront'), true)
  assert.equal(upstream.primaryIds.has('validation'), true)
  assert.equal(upstream.nodeIds.has('experience'), true)
  assert.deepEqual([...upstream.edgeIds], ['submit-order'])
  assert.equal(atlasFocus(sample, 'orders', 1, 'downstream').relatedIds.has('storefront'), false)
  assert.equal(atlasFocus(sample, 'orders', 0).relatedIds.has('storefront'), false)
  assert.equal(atlasFocus(sample, 'absent'), null)
})

test('navigation controls distinguish collapse, overview, expansion and keyboard pan', () => {
  const filtered = { ...base, kind: 'http' }
  assert.equal(expansionState(index, filtered, 'expand').expanded.has('orders'), true)
  assert.equal(expansionState(index, filtered, 'collapse').kind, 'http')
  assert.deepEqual([...expansionState(index, filtered, 'collapse').expanded], ['example-store'])
  assert.equal(expansionState(index, filtered, 'overview').kind, '')
  assert.deepEqual(keyboardPan({ x: 0, y: 0, zoom: 1 }, 'ArrowRight'), { x: -100, y: 0, zoom: 1 })
  assert.equal(keyboardPan({ x: 0, y: 0, zoom: 1 }, 'Tab'), null)
  assert.equal(minimapSize(true).width < minimapSize(false).width, true)
})

test('source links reject executable, credentialed and protocol-relative URLs', () => {
  for (const value of ['javascript:alert(1)', '//example.org', 'https://user:pass@example.org', 'https://example.org/\npath', '\\example.org']) assert.equal(safeSourceUrl(value), null)
  assert.equal(safeSourceUrl('/documentation/example'), '/documentation/example')
  assert.equal(safeSourceUrl('https://example.org/docs'), 'https://example.org/docs')
})

test('CommonJS utility exports match the ESM API', () => {
  const common = createRequire(import.meta.url)('../dist/core.cjs')
  assert.equal(common.indexAtlas(sample).root.id, index.root.id)
  assert.equal(typeof common.atlasFocus, 'function')
})
