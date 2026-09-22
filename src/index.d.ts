import type { ReactElement, ReactNode } from 'react'
import type { AtlasModel, AtlasNode } from './core.js'

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
