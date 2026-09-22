import type { ReactElement, ReactNode } from 'react'
import type { AtlasModel, AtlasNode, AtlasDocument } from './core.js'

export * from './core.js'

export interface AtlasExplorerProps {
  model: AtlasModel
  renderDiagramLibrary?: (context: { model: AtlasModel; node: AtlasNode | null }) => ReactNode
  backHref?: string
  backLabel?: string
  onOpenSource?: (url: string) => void | Promise<void>
  onShareView?: (view: { search: string; url: string }) => void | Promise<void>
}

export function AtlasExplorer(props: AtlasExplorerProps): ReactElement

export interface AtlasEditorProps {
  document: AtlasDocument
  onChange?: (document: AtlasDocument) => void
  onSave?: (document: AtlasDocument) => unknown | Promise<unknown>
  readOnly?: boolean
  saving?: boolean
  saveError?: string
  onExport?: (document: AtlasDocument) => void | Promise<void>
}

export function AtlasEditor(props: AtlasEditorProps): ReactElement
