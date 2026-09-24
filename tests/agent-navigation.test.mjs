import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAtlasNavigationRequest } from '../src/utils/atlasAgentNavigation.js'
import { createAtlasDocument } from '../src/utils/atlasDocument.js'

test('agent navigation accepts only exact current model identities and no mutation fields', () => {
  const { model } = createAtlasDocument()
  model.flows.push({ id: 'request', label: 'Request', description: '', steps: [] })
  const before = structuredClone(model)
  for (const action of ['focus', 'zen', 'expand']) assert.deepEqual(validateAtlasNavigationRequest({ id: 'command', action, nodeId: model.nodes[0].id }, model), { id: 'command', action, nodeId: model.nodes[0].id })
  for (const action of ['collapse_all', 'expand_all', 'fit_view', 'overview']) assert.deepEqual(validateAtlasNavigationRequest({ id: 'command', action }, model), { id: 'command', action })
  assert.equal(validateAtlasNavigationRequest({ id: 'command', action: 'journey', flowId: 'request' }, model).flowId, 'request')
  for (const request of [null, {}, { id: 'command', action: 'node.remove' }, { id: '', action: 'overview' }, { id: 'command', action: 'focus', nodeId: 'missing' }, { id: 'command', action: 'journey', flowId: 'missing' }, { id: 'command', action: 'overview', nodeId: model.nodes[0].id }, { id: 'command', action: 'overview', operations: [] }, { id: 'command', action: 'focus', nodeId: model.nodes[0].id, flowId: 'request' }]) assert.throws(() => validateAtlasNavigationRequest(request, model))
  assert.deepEqual(model, before)
})
