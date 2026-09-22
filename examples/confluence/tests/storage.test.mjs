import test from 'node:test'
import assert from 'node:assert/strict'
import { createAtlasDocument, applyAtlasOperations } from '@shizuha/atlas/core'
import { createConfluenceStore } from '../src/storage.mjs'

const key = 'shizuha-atlas:11111111-1111-4111-8111-111111111111'
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const edit = document => applyAtlasOperations(document, { base_revision: document.revision, operations: [{ type: 'document.update', changes: { title: 'Edited system' } }] })

function server() {
  const state = { property: null, attachments: new Map(), deleted: [], calls: [], failCommit: null, permission: true, next: 100 }
  async function requestConfluence(path, options = {}) {
    state.calls.push({ path, options })
    if (!state.permission) return json({}, 403)
    if (path.includes('/properties?')) return json({ results: state.property ? [structuredClone(state.property)] : [] })
    if (path.endsWith('/child/attachment') && options.method === 'POST') {
      const file = options.body.get('file')
      const id = String(++state.next)
      state.attachments.set(id, await file.text())
      return json({ results: [{ id, title: file.name, version: { number: 1 } }] })
    }
    if (path.endsWith('/download')) {
      const attachment = path.split('/').at(-2)
      return state.attachments.has(attachment) ? new Response(state.attachments.get(attachment)) : json({}, 404)
    }
    if (options.method === 'DELETE') {
      const attachment = path.split('/').at(-1)
      state.deleted.push(attachment)
      state.attachments.delete(attachment)
      return new Response(null, { status: 204 })
    }
    if (options.method === 'POST' || options.method === 'PUT') {
      if (state.failCommit === 'denied') return json({}, 409)
      if (state.failCommit === 'unknown') throw new Error('Connection lost')
      const body = JSON.parse(options.body)
      if (options.method === 'POST' && state.property || options.method === 'PUT' && body.version.number !== state.property.version.number + 1) return json({}, 409)
      state.property = { id: '99', key: body.key, value: body.value, version: { number: body.version?.number || 1 } }
      if (state.failCommit === 'lost-ack') throw new Error('Connection lost after commit')
      return json(state.property)
    }
    throw new Error('Unexpected API call: ' + path)
  }
  return { state, store: createConfluenceStore({ requestConfluence, pageId: '42' }) }
}

test('full graph uses immutable attachments, bounded index and integrity-checked reads', async () => {
  const { state, store } = server()
  const document = createAtlasDocument()
  document.model.description = 'System documentation '.repeat(5000)
  const baseline = await store.save({ key, baseline: null, document })
  assert.ok(state.attachments.get(baseline.property.value.attachment_id).length > 32768)
  assert.ok(JSON.stringify(state.property).length < 1024)
  assert.deepEqual((await store.load(key)).document, document)
  const next = await store.save({ key, baseline, document: edit(document) })
  assert.equal(next.property.version.number, 2)
  assert.equal(state.attachments.size, 2)
  assert.notEqual(next.property.value.attachment_id, baseline.property.value.attachment_id)
  assert.equal(state.deleted.length, 0)
  state.attachments.set(next.property.value.attachment_id, '{}')
  await assert.rejects(store.load(key), /integrity/)
})

test('stale writers fail before upload and cannot overwrite accepted revisions', async () => {
  const { state, store } = server()
  const baseline = await store.save({ key, baseline: null, document: createAtlasDocument() })
  await store.save({ key, baseline, document: edit(baseline.document) })
  await assert.rejects(store.save({ key, baseline, document: edit(baseline.document) }), /Revision conflict/)
  assert.equal(state.attachments.size, 2)
  assert.equal(state.deleted.length, 0)
})

test('definite CAS refusal removes only this unpublished upload', async () => {
  const { state, store } = server()
  const baseline = await store.save({ key, baseline: null, document: createAtlasDocument() })
  state.failCommit = 'denied'
  await assert.rejects(store.save({ key, baseline, document: edit(baseline.document) }), /409/)
  assert.equal(state.attachments.size, 1)
  assert.equal(state.deleted.length, 1)
  assert.ok(state.attachments.has(baseline.property.value.attachment_id))
})

test('racing initial saves publish one winner and clean up only the loser', async () => {
  const { state, store } = server()
  const results = await Promise.allSettled([
    store.save({ key, baseline: null, document: createAtlasDocument() }),
    store.save({ key, baseline: null, document: createAtlasDocument() }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(state.attachments.size, 1)
  assert.equal(state.deleted.length, 1)
  assert.ok(state.attachments.has(state.property.value.attachment_id))
})

test('ambiguous commits reconcile accepted data and never delete uncertain uploads', async () => {
  const { state, store } = server()
  state.failCommit = 'lost-ack'
  const baseline = await store.save({ key, baseline: null, document: createAtlasDocument() })
  assert.equal(baseline.property.version.number, 1)
  state.failCommit = 'unknown'
  await assert.rejects(store.save({ key, baseline, document: edit(baseline.document) }), /preserve staged attachment/)
  assert.equal(state.attachments.size, 2)
  assert.equal(state.deleted.length, 0)
})

test('permissions, document bounds, IDs and revision invariants fail closed', async () => {
  const { state, store } = server()
  assert.throws(() => createConfluenceStore({ requestConfluence: () => {}, pageId: '../../42' }), /ID/)
  await assert.rejects(store.load('foreign-key'), /property key/)
  state.permission = false
  await assert.rejects(store.load(key), /403/)
  state.permission = true
  await assert.rejects(store.load(key), /missing/)
  const baseline = await store.save({ key, baseline: null, document: createAtlasDocument() })
  const tampered = structuredClone(baseline.document)
  tampered.model.title = 'Changed without advancing revision'
  await assert.rejects(store.save({ key, baseline, document: tampered }), /advance/)
  const oversized = edit(baseline.document)
  oversized.model.description = 'a'.repeat(9 * 1024 * 1024)
  await assert.rejects(store.save({ key, baseline, document: oversized }), /limit/)
})
