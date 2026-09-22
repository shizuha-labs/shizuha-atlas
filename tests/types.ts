import { AtlasExplorer, atlasFocus, indexAtlas, parseAtlasState, shareAtlasView, type AtlasModel } from '@shizuha/atlas'
import { expansionState, createAtlasDocument, applyAtlasOperations, createAtlasPortableHtml } from '@shizuha/atlas/core'
import { AtlasEditor } from '@shizuha/atlas'
import { script, style } from '@shizuha/atlas/portable'

declare const model: AtlasModel
const index = indexAtlas(model)
const state = expansionState(index, parseAtlasState('', model), 'expand')
atlasFocus(model, state.selected, state.hops, state.direction)
AtlasExplorer({
  model,
  renderDiagramLibrary: ({ node }) => node?.label || null,
  onOpenSource: async (url) => { new URL(url) },
  onShareView: async ({ search, url }) => { new URL(url).search = search },
})
shareAtlasView({ search: 'node=example', locationHref: 'https://example.org', onShareView: async () => {} })
const document = createAtlasDocument(model)
const edited = applyAtlasOperations(document, { base_revision: document.revision, operations: [{ type: 'document.update', changes: { title: 'Updated system' } }] })
AtlasEditor({ document: edited, onSave: async next => { createAtlasPortableHtml(next, { script, style }) } })
