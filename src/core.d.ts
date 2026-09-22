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
