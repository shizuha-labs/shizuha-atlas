# Shizuha Atlas

A reusable React system-design editor and architecture explorer: one versioned model, mixed-depth expansion,
typed relationship roll-up, focused neighborhoods, search, shareable views and
host-provided diagram lenses. Atlas describes documented architecture, not live health.

Version 0.2 adds visual node and relationship authoring, nested components, drag layout,
copy/paste, undo/redo, validated import/export, and a revision-safe agent CLI. A host can
persist the portable document using its existing permissions and version history.
Self-contained HTML files remain editable without a server or internet connection.
Simultaneous editing uses explicit revision conflicts, not real-time multiplayer merging.

## Design editor

```jsx
import { useState } from 'react'
import { AtlasEditor, createAtlasDocument } from '@shizuha/atlas'
import '@xyflow/react/dist/style.css'
import '@shizuha/atlas/styles.css'

export function DesignStudio({ saveAuthorizedDocument }) {
  const [document, setDocument] = useState(() => createAtlasDocument())
  return <AtlasEditor document={document} onChange={setDocument}
    onSave={saveAuthorizedDocument} />
}
```

The editor needs no router. Its host owns persistence and must reject stale writes;
`onSave` resolves only after durable storage succeeds and rejects on failure. Do not
silently overwrite newer versions. The explorer below is an independent semantic
view: it automatically lays out hierarchical architecture rather than replaying the
editor's scope-relative canvas coordinates.

For a serverless editable file, load the bundled runtime only when needed:

```js
import { createAtlasPortableHtml } from '@shizuha/atlas/core'
const { script, style } = await import('@shizuha/atlas/portable')
const html = createAtlasPortableHtml(document, { script, style, title: document.model.title })
```

Save `html` as a local `.atlas.html` file. It contains the entire graph and its runtime,
blocks network requests with a content-security policy, and can download updated
editable HTML or portable JSON. Exported documents inherit no host access controls;
share only with authorized recipients. Importing into an existing editor replaces its
content while retaining document identity and undo history.

Agents use the same atomic operation engine as the UI:

```sh
atlas validate design.atlas.json
atlas apply design.atlas.json operations.json --output updated.atlas.json
atlas help
```

Every operation envelope includes `base_revision`. See `docs/document-format.md` for
schema and operations and `docs/editor-integrations.md` for embedding contracts.

## Integration

Install `@shizuha/atlas` from your approved package registry and provide its React,
React DOM and React Router peers. Wrap it in your existing router or a `MemoryRouter`.

```jsx
import { AtlasExplorer } from '@shizuha/atlas'
import { MemoryRouter } from 'react-router-dom'
import '@xyflow/react/dist/style.css'
import '@shizuha/atlas/styles.css'

export function SystemDocumentation({ model, DiagramLibrary }) {
  return (
    <MemoryRouter>
      <AtlasExplorer
        model={model}
        backHref="/documentation"
        backLabel="Documentation"
        renderDiagramLibrary={({ model, node }) => (
          <DiagramLibrary model={model} node={node} />
        )}
      />
    </MemoryRouter>
  )
}
```

The host fetches and authorizes the model before rendering. It also owns document
fetching, source permissions, diagram rendering, preferences and error handling.
There is no bundled company topology, authentication provider, API client or Mermaid
runtime. `renderDiagramLibrary` is the extension point for native diagram semantics;
a sequence diagram must not be flattened into a generic architecture graph.

Unrelated query parameters are preserved during navigation. The host must enforce
authorization server-side; query parameters are not permission checks. For embedded
use, size the parent explicitly and set `--atlas-height: 100%` and
`--atlas-min-height: 420px` on its container. Standalone navigation uses React Router;
sandboxed hosts should provide their own source-link and external-navigation handling.

## Model

The version-1 schema has one containment root, stable node identities, directed typed
edges, explanatory journeys and source provenance. Import pure model utilities from
`@shizuha/atlas/core`. `examples/sample-model.json` is entirely synthetic.

## Development

```sh
npm ci
npm run verify
```

Verification runs tests, builds ESM/CommonJS bundles and checks the packed artifact.
The package allowlist contains only compiled assets, public API types, the agent CLI,
this README and the MIT license. Source documents and host-specific adapters stay
with the host. `npm run build:demo` also creates `artifacts/demo/editor.html` using
only fictional example architecture. Confluence integration sources live in
`examples/confluence`; installing a Forge app is separate from generating an offline file.

## License

MIT, copyright Shizuha Global Pvt. Ltd. Repository visibility and registry access
are independent of the source license. Public distribution is a separate release
decision; internal development does not imply a public release.
