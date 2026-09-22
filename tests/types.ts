import { AtlasExplorer, atlasFocus, indexAtlas, parseAtlasState, shareAtlasView, type AtlasModel } from '@shizuha/atlas'
import { expansionState } from '@shizuha/atlas/core'

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
