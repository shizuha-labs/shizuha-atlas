import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createAtlasDocument, applyAtlasOperations } from '../src/utils/atlasDocument.js'
import { encodeAtlasDocument, importAtlasCodeBlock, exportAtlasCodeBlock, createAtlasPortableHtml, createAtlasEmbedAdapter } from '../src/utils/atlasPortable.js'

const run = promisify(execFile)
const cli = fileURLToPath(new URL('../scripts/atlas-cli.mjs', import.meta.url))
const nextTurn = () => new Promise(resolve => setImmediate(resolve))
const update = (document, title = 'Changed') => applyAtlasOperations(document, { base_revision: document.revision, operations: [{ type: 'document.update', changes: { title } }] })

test('portable JSON and Markdown cannot terminate their containers', () => {
  const document = createAtlasDocument()
  document.model.description = '</script><script>alert(1)</script> & \u2028\u2029\n```\n'
  const encoded = encodeAtlasDocument(document)
  assert.equal(/[<>&\u2028\u2029]/u.test(encoded), false)
  assert.deepEqual(JSON.parse(encoded), document)
  const block = exportAtlasCodeBlock(document)
  assert.equal(block.match(/```/g).length, 2)
  assert.deepEqual(importAtlasCodeBlock(block), document)
  assert.throws(() => importAtlasCodeBlock(JSON.stringify(document)), /fenced/)
  assert.throws(() => importAtlasCodeBlock('```json\n{}\n```'), /fenced/)
  assert.throws(() => importAtlasCodeBlock('```atlas\n' + JSON.stringify({ ...document, version: 2 }) + '\n```'), /version/)
  assert.throws(() => importAtlasCodeBlock('```atlas\n' + JSON.stringify(document.model) + '\n```'), /version/)
})

test('HTML includes validated inert data, trusted inline runtime and restrictive offline policy', () => {
  const document = createAtlasDocument()
  document.model.description = '</script><script>bad()</script>'
  const html = createAtlasPortableHtml(document, { script: 'window.label="</script>";', style: 'body{margin:0}', title: '<img src=x>' })
  assert.match(html, /connect-src 'none'/)
  assert.match(html, /<title>&lt;img src=x&gt;<\/title>/)
  assert.equal(html.match(/<script/g).length, 2)
  assert.deepEqual(JSON.parse(html.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]), document)
  assert.throws(() => createAtlasPortableHtml(document), /runtime bundle/)
  document.model.nodes[0].sources = [{ label: 'Bad', type: 'web', url: 'javascript:alert(1)' }]
  assert.throws(() => encodeAtlasDocument(document), /URL/)
})

function embed() {
  let document = createAtlasDocument()
  let listener
  const sent = []
  const saves = []
  const errors = []
  const hostWindow = { postMessage: (message, origin) => sent.push({ message, origin }) }
  const localWindow = { addEventListener: (type, callback) => { listener = callback }, removeEventListener: () => { listener = null } }
  const options = { window: localWindow, hostWindow, origin: 'https://wiki.example', nonce: '0123456789abcdef0123456789abcdef', getDocument: () => document, onLoad: loaded => { document = loaded }, onSaveAck: saved => saves.push(saved), onError: error => errors.push(error) }
  const adapter = createAtlasEmbedAdapter(options)
  const message = (payload, event = {}) => listener?.({ source: hostWindow, origin: options.origin, data: { channel: 'shizuha-atlas.v1', nonce: options.nonce, request_id: 'host-1', ...payload }, ...event })
  return { options, adapter, sent, saves, errors, message, current: () => document, edit: () => { document = update(document) } }
}

test('embed trust is exact origin, source and nonce; insecure configurations fail closed', async () => {
  const fixture = embed()
  const load = { type: 'atlas:load', base_revision: 0, document: update(fixture.current()) }
  fixture.message(load, { origin: 'https://evil.example' })
  fixture.message(load, { source: {} })
  fixture.message({ ...load, nonce: 'wrong' })
  await nextTurn()
  assert.equal(fixture.current().revision, 0)
  assert.equal(fixture.sent.length, 0)
  for (const origin of ['*', 'null', 'file://', 'https://wiki.example/path', 'https://wiki.example/']) assert.throws(() => createAtlasEmbedAdapter({ ...fixture.options, origin }))
  assert.throws(() => createAtlasEmbedAdapter({ ...fixture.options, nonce: 'short' }), /nonce/)
  fixture.message(load)
  await nextTurn()
  assert.equal(fixture.current().revision, 1)
  assert.equal(fixture.sent[0].origin, 'https://wiki.example')
  assert.equal(fixture.sent[0].message.type, 'atlas:loaded')
  fixture.message(load)
  await nextTurn()
  assert.equal(fixture.sent.length, 1)
  fixture.adapter.dispose()
  assert.throws(() => fixture.adapter.requestSave(), /disposed/)
})

test('embed edits enforce revision CAS and process queued operations in order', async () => {
  const fixture = embed()
  const operations = [{ type: 'document.update', changes: { title: 'Host edit' } }]
  fixture.message({ type: 'atlas:change', request_id: 'host-1', base_revision: 0, operations })
  fixture.message({ type: 'atlas:change', request_id: 'host-2', base_revision: 1, operations })
  fixture.message({ type: 'atlas:change', request_id: 'host-3', base_revision: 0, operations })
  await nextTurn()
  assert.equal(fixture.current().revision, 2)
  assert.equal(fixture.errors.length, 1)
  assert.match(fixture.errors[0].message, /revision conflict/)
  fixture.edit()
  fixture.adapter.notifyChange()
  const notice = fixture.sent.at(-1).message
  assert.equal(notice.base_revision, 2)
  assert.equal(notice.revision, 3)
  assert.throws(() => fixture.adapter.notifyChange(), /advance/)
  fixture.adapter.dispose()
})

test('save acknowledgements match the exact snapshot and malformed ACK does not poison retries', async () => {
  const fixture = embed()
  const requestId = fixture.adapter.requestSave()
  assert.throws(() => fixture.adapter.requestSave(), /pending/)
  fixture.message({ type: 'atlas:saved', request_id: requestId, revision: 99 })
  await nextTurn()
  assert.equal(fixture.saves.length, 0)
  fixture.edit()
  fixture.message({ type: 'atlas:saved', request_id: requestId, revision: 0 })
  await nextTurn()
  assert.equal(fixture.saves.length, 1)
  assert.equal(fixture.saves[0].revision, 0)
  assert.equal(fixture.current().revision, 1)
  const second = fixture.adapter.requestSave()
  fixture.message({ type: 'atlas:save-error', request_id: second, revision: 1 })
  await nextTurn()
  assert.doesNotThrow(() => fixture.adapter.requestSave())
  fixture.adapter.dispose()
})

test('CLI validates and atomically applies without clobbering input or existing output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-cli-'))
  try {
    const input = join(directory, 'input.json')
    const output = join(directory, 'output.json')
    const operations = join(directory, 'ops.json')
    const document = createAtlasDocument()
    await writeFile(input, JSON.stringify(document))
    await writeFile(operations, JSON.stringify({ base_revision: 0, operations: [{ type: 'document.update', changes: { title: 'Agent edit' } }] }))
    const valid = await run(process.execPath, [cli, 'validate', input])
    assert.equal(JSON.parse(valid.stdout).valid, true)
    await run(process.execPath, [cli, 'apply', input, operations, '--output', output])
    assert.equal(JSON.parse(await readFile(output, 'utf8')).revision, 1)
    assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), document)
    await assert.rejects(run(process.execPath, [cli, 'apply', input, operations, '--output', output]), /already exists/)
    await assert.rejects(run(process.execPath, [cli, 'apply', input, operations, '--output', input]), /overwrite/)
    await assert.rejects(run(process.execPath, [cli, 'apply', input, operations, '--in-place']), /expected-revision/)
    await assert.rejects(run(process.execPath, [cli, 'apply', input, operations, '--in-place', '--expected-revision', '1']), /Revision conflict/)
    await run(process.execPath, [cli, 'apply', input, operations, '--in-place', '--expected-revision', '0'])
    assert.equal(JSON.parse(await readFile(input, 'utf8')).model.title, 'Agent edit')
    await assert.rejects(run(process.execPath, [cli, 'apply', input, operations, '--output', join(directory, 'stale.json')]), /Revision conflict/)
    await symlink(input, join(directory, 'link.json'))
    await assert.rejects(run(process.execPath, [cli, 'apply', join(directory, 'link.json'), operations, '--in-place', '--expected-revision', '1']), /non-symlink/)
    assert.equal((await readdir(directory)).some(name => name.endsWith('.atlas-lock') || name.endsWith('.tmp')), false)
    assert.equal(JSON.parse((await run(process.execPath, [cli, 'example'])).stdout).format, 'shizuha-atlas')
    assert.equal(JSON.parse((await run(process.execPath, [cli, 'schema'])).stdout).properties.version.const, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('concurrent CLI writers cannot both commit the same revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-cas-'))
  try {
    const input = join(directory, 'input.json')
    const operations = join(directory, 'ops.json')
    await writeFile(input, JSON.stringify(createAtlasDocument()))
    await writeFile(operations, JSON.stringify({ base_revision: 0, operations: [{ type: 'document.update', changes: { title: 'Winner' } }] }))
    const command = [cli, 'apply', input, operations, '--in-place', '--expected-revision', '0']
    const results = await Promise.allSettled([run(process.execPath, command), run(process.execPath, command)])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(JSON.parse(await readFile(input, 'utf8')).revision, 1)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
