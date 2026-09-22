export type AtlasEvidenceStatus = 'documented' | 'declared' | 'inferred'

export interface AtlasSource {
  label: string
  url: string
  type: string
  revision?: string | number
}

export interface AtlasNode {
  id: string
  label: string
  kind: string
  parent_id: string | null
  description: string
  sources: AtlasSource[]
  status: AtlasEvidenceStatus
}

export interface AtlasEdge {
  id: string
  source: string
  target: string
  kind: string
  label: string
  description?: string
  sources: AtlasSource[]
  status: AtlasEvidenceStatus
}

export interface AtlasStep {
  id: string
  label: string
  source: string
  target: string
  description: string
  edge_ids?: string[]
}

export interface AtlasFlow {
  id: string
  label: string
  description: string
  steps: AtlasStep[]
}

export interface AtlasModel {
  schema_version: 1
  id: string
  title: string
  description: string
  model_revision: string
  updated_at: string
  coverage: Record<string, unknown>
  nodes: AtlasNode[]
  edges: AtlasEdge[]
  flows: AtlasFlow[]
}

export interface AtlasIndex {
  byId: Map<string, AtlasNode>
  children: Map<string, AtlasNode[]>
  root: AtlasNode
  domains: AtlasNode[]
}

export interface AtlasViewState {
  expanded: Set<string>
  selected: string
  flow: string
  step: number
  kind: string
  zen: string
  hops: number
  direction: 'both' | 'upstream' | 'downstream'
  isolation: 'fade' | 'hide'
}

export interface AtlasAggregateEdge {
  id: string
  source: string
  target: string
  kind: string
  members: AtlasEdge[]
  labels: string[]
}

export interface AtlasLayoutEntry {
  width: number
  height: number
  domainId: string
  color: string
  depth: number
  isExpanded: boolean
  position: { x: number; y: number }
  absolutePosition: { x: number; y: number }
  parentId?: string
}

export interface AtlasFocus {
  focusId: string
  primaryIds: Set<string>
  relatedIds: Set<string>
  nodeIds: Set<string>
  edgeIds: Set<string>
}

export interface AtlasViewport {
  x: number
  y: number
  zoom: number
}

export interface AtlasSavedView {
  id: string
  label: string
  state?: Partial<Omit<AtlasViewState, 'expanded'>> & { expanded?: string[]; editor_scope?: string; editor_deep?: boolean }
  viewport?: AtlasViewport
}

export interface AtlasDocument {
  format: 'shizuha-atlas'
  version: 1
  revision: number
  model: AtlasModel
  layout: { positions: Record<string, { x: number; y: number }> }
  views: AtlasSavedView[]
}

export type AtlasOperation =
  | { type: 'node.add'; node: Pick<AtlasNode, 'id' | 'label' | 'kind' | 'parent_id'> & Partial<AtlasNode> }
  | { type: 'node.update'; id: string; changes: Partial<Omit<AtlasNode, 'id' | 'parent_id'>> }
  | { type: 'node.reparent'; id: string; parent_id: string }
  | { type: 'node.remove'; id: string; cascade?: boolean }
  | { type: 'edge.add'; edge: Pick<AtlasEdge, 'id' | 'source' | 'target' | 'kind'> & Partial<AtlasEdge> }
  | { type: 'edge.update'; id: string; changes: Partial<Omit<AtlasEdge, 'id'>> }
  | { type: 'edge.remove'; id: string; cascade?: boolean }
  | { type: 'layout.set'; positions: Record<string, { x: number; y: number } | null> }
  | { type: 'document.update'; changes: { title?: string; description?: string } }
  | { type: 'document.replace'; document: AtlasDocument }
  | { type: 'flow.upsert'; flow: AtlasFlow }
  | { type: 'flow.remove'; id: string }
  | { type: 'view.upsert'; view: AtlasSavedView }
  | { type: 'view.remove'; id: string }

export interface AtlasOperationEnvelope {
  base_revision: number
  operations: AtlasOperation[]
}

export interface AtlasHistory {
  document: AtlasDocument
  past: AtlasDocument[]
  future: AtlasDocument[]
}

export function createAtlasDocument(model?: AtlasModel): AtlasDocument
export function validateAtlasDocument(document: AtlasDocument): AtlasDocument
export function parseAtlasDocument(input: string): AtlasDocument
export function serializeAtlasDocument(document: AtlasDocument): string
export function applyAtlasOperations(document: AtlasDocument, envelope: AtlasOperationEnvelope): AtlasDocument
export function createAtlasHistory(document?: AtlasDocument): AtlasHistory
export function commitAtlasHistory(history: AtlasHistory, envelope: AtlasOperationEnvelope): AtlasHistory
export function undoAtlasHistory(history: AtlasHistory): AtlasHistory
export function redoAtlasHistory(history: AtlasHistory): AtlasHistory
export function encodeAtlasDocument(document: AtlasDocument): string
export function importAtlasCodeBlock(text: string): AtlasDocument
export function exportAtlasCodeBlock(document: AtlasDocument): string
export function createAtlasPortableHtml(document: AtlasDocument, options: { script: string; style?: string; title?: string }): string
export function createAtlasEmbedAdapter(options: {
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>
  hostWindow: Pick<Window, 'postMessage'>
  origin: string
  nonce: string
  getDocument: () => AtlasDocument
  onLoad: (document: AtlasDocument) => void
  onSaveAck?: (result: { revision: number; document: AtlasDocument }) => void | Promise<void>
  onError?: (error: unknown) => void
}): { notifyChange(): string; requestSave(): string; dispose(): void }

export function indexAtlas(model: AtlasModel): AtlasIndex
export function ancestorsOf(index: AtlasIndex, nodeId: string): string[]
export function revealNodes(index: AtlasIndex, expanded: Set<string>, nodeIds: string[]): Set<string>
export function collapseNode(index: AtlasIndex, expanded: Set<string>, nodeId: string): Set<string>
export function visibleRepresentative(index: AtlasIndex, expanded: Set<string>, nodeId: string): string
export function parseAtlasState(search: string, model: AtlasModel): AtlasViewState
export function serializeAtlasState(state: AtlasViewState, model: AtlasModel, existingSearch?: string): string
export function safeSourceUrl(value: unknown): string | null
export function projectAtlas(model: AtlasModel, expanded: Set<string>, relationshipKind?: string): { index: AtlasIndex; nodes: AtlasNode[]; edges: AtlasAggregateEdge[]; internalCounts: Map<string, number> }
export function layoutAtlas(index: AtlasIndex, expanded: Set<string>, options?: { spacious?: boolean }): Map<string, AtlasLayoutEntry>
export function flowSelection(model: AtlasModel, flowId: string, stepIndex?: number): { flow: AtlasFlow | null; step: AtlasStep | null; stepIndex: number; nodeIds: string[]; edgeIds: string[] }
export function atlasFocus(model: AtlasModel, focusId: string, hops?: number, direction?: 'both' | 'upstream' | 'downstream'): AtlasFocus | null
export function expansionState(index: AtlasIndex, previous: AtlasViewState, action: 'expand' | 'collapse' | 'overview'): AtlasViewState
export function minimapSize(compact: boolean): { width: number; height: number }
export function keyboardPan(viewport: AtlasViewport, key: string, distance?: number): AtlasViewport | null
export function openAtlasSource(event: { preventDefault(): void }, sourceUrl: string, onOpenSource?: (url: string) => void | Promise<void>): Promise<boolean>
export function shareAtlasView(options: { search: string; locationHref: string; onShareView?: (view: { search: string; url: string }) => void | Promise<void>; clipboard?: { writeText(text: string): Promise<void> } }): Promise<'shared' | 'copied'>
