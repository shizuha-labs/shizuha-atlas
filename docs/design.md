# Portable architecture documents

## Current release

Version 0.1 is a viewer and navigation library, not a visual editor. It renders a
host-supplied versioned model without an Atlas server. Hosts can provide native
diagram lenses. This release does not claim node creation, edge editing, persistence,
undo, concurrent editing or an installed Confluence integration.

## Target architecture

The product direction is a portable architecture document that humans can edit
visually and agents can edit through the same validated operations. The document,
not a canvas component or a service database, is the source of truth.

- Stable node and edge identities, typed relationships, containment hierarchy,
  descriptions and provenance form the semantic model.
- Named views, expanded regions and optional layout positions form presentation
  state. Moving a node must not silently change its semantic parent.
- A versioned operation envelope carries a base document revision and explicit
  operations such as add node, move node, update attributes and connect nodes.
  Validate identity uniqueness, endpoint existence, containment cycles and supported
  types before applying the complete operation batch atomically.
- Visual editing and agent editing both call that same document reducer. Undo/redo
  uses inverse operations or bounded snapshots; stale revisions produce a visible
  conflict rather than silently overwriting someone else's changes.
- Flowchart, sequence, state and data-model lenses retain their distinct semantics.
  Renderer plugins bind their elements to stable model identities where appropriate;
  they do not pretend every diagram is the same graph.
- Wiki pages, Confluence macros, local files and other hosts store the document.
  The renderer consumes JSON or an embedded document block and requires no Atlas
  backend. Authentication and access controls belong to the host storage adapter.
- A collaboration service can optionally synchronize operations, permissions and
  revision history. Its absence must not prevent offline rendering or local editing.

The existing `schema_version: 1` model remains the current contract. Future editable
document fields need an explicit schema version and migration policy; do not silently
reinterpret existing stored models or promise lossless import of arbitrary diagrams.

## Offline embedding

Bundle this package and its styles with the host application, load a local document,
and use an in-memory router. No fetch, authentication service or Atlas endpoint is
needed for this example:

```jsx
import { AtlasExplorer } from '@shizuha/atlas'
import { MemoryRouter } from 'react-router-dom'
import model from './architecture.json'
import '@xyflow/react/dist/style.css'
import '@shizuha/atlas/styles.css'

export default function EmbeddedArchitecture() {
  return (
    <div style={{ height: 700, '--atlas-height': '100%', '--atlas-min-height': '420px' }}>
      <MemoryRouter>
        <AtlasExplorer model={model} backLabel="Documentation" />
      </MemoryRouter>
    </div>
  )
}
```

The synthetic document in `examples/sample-model.json` can be copied to
`architecture.json`. This demonstrates offline viewing only. External source links
and optional host-provided diagram assets may require connectivity unless the host
also bundles those resources locally.
