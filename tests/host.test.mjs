import assert from 'node:assert/strict'
import test from 'node:test'
import { openAtlasSource, shareAtlasView } from '../dist/core.mjs'

test('host source navigation intercepts only the allowed URL and awaits completion', async () => {
  let prevented = false
  let opened = ''
  const event = { preventDefault() { prevented = true } }
  assert.equal(await openAtlasSource(event, 'https://example.org/docs', async url => { opened = url }), true)
  assert.equal(prevented, true)
  assert.equal(opened, 'https://example.org/docs')
  prevented = false
  assert.equal(await openAtlasSource(event, 'https://example.org/docs'), false)
  assert.equal(prevented, false)
  await assert.rejects(openAtlasSource(event, 'javascript:alert(1)', () => assert.fail('unsafe callback')))
  await assert.rejects(openAtlasSource(event, 'https://example.org/docs', async () => { throw new Error('host denied') }))
})

test('host sharing receives router state instead of relying on the iframe address', async () => {
  let received
  const search = 'node=orders&zen=orders&hops=2&tenant=example'
  const result = await shareAtlasView({ search, locationHref: 'https://example.org/iframe?previous=yes', onShareView: async view => { received = view }, clipboard: { writeText() { assert.fail('host sharing must not touch clipboard') } } })
  assert.equal(result, 'shared')
  assert.equal(received.search, search)
  assert.equal(new URL(received.url).searchParams.get('previous'), null)
  assert.equal(new URL(received.url).searchParams.get('zen'), 'orders')
  await assert.rejects(shareAtlasView({ search, locationHref: received.url, onShareView: async () => { throw new Error('host denied') } }))
})

test('default sharing uses the complete current serialized view', async () => {
  let copied
  const result = await shareAtlasView({ search: 'node=validation', locationHref: 'https://example.org/atlas', clipboard: { async writeText(value) { copied = value } } })
  assert.equal(result, 'copied')
  assert.equal(copied, 'https://example.org/atlas?node=validation')
})
