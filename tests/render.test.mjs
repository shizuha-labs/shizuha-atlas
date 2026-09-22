import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AtlasExplorer } from '../dist/index.mjs'

const model = JSON.parse(readFileSync(new URL('../examples/sample-model.json', import.meta.url), 'utf8'))

test('actual packaged Explorer renders with host navigation and diagram slot', () => {
  const html = renderToString(createElement(MemoryRouter, null, createElement(AtlasExplorer, {
    model,
    backHref: '/docs',
    backLabel: 'Example docs',
    renderDiagramLibrary: () => createElement('button', null, 'Host diagram library'),
  })))
  assert.match(html, /Example store/)
  assert.match(html, /Collapse all/)
  assert.match(html, /Expand all/)
  assert.match(html, /Map navigator/)
  assert.match(html, /Example docs/)
  assert.match(html, /Host diagram library/)
  assert.doesNotMatch(html, /Back to Wiki|wiki\/api|organization_id/)
})
