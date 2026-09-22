# Portable architecture documents

## Current release

Version 0.2 is a visual editor, portable document engine and navigation library.
People and agents use the same atomic, revision-checked operations. Nodes, typed
relationships, containment, layout, flows and saved views have stable identities.
History uses bounded snapshots with monotonic revisions. Hosts supply persistence;
the library does not require an Atlas server. The bundled offline editor can save
its complete runtime and current graph as one HTML file.

Wiki integration persists documents in ordinary permissioned, versioned pages.
Confluence has a separate Forge example; source availability is not proof that the
app is installed in a customer's tenant. Real-time concurrent merging, executable
infrastructure provisioning and lossless conversion of every diagram language are
not claimed. Revision conflicts are explicit and preserve the caller's local draft.

## Architecture

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

The existing `schema_version: 1` model remains the semantic contract, wrapped in
`format: "shizuha-atlas", version: 1` with a revision, layout positions and views.
See `document-format.md` for the validated format and supported operations. Importing
a legacy model upgrades it to a document; unknown future versions are rejected.

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
