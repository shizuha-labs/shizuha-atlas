# Shizuha Atlas

A reusable React architecture explorer: one versioned model, mixed-depth expansion,
typed relationship roll-up, focused neighborhoods, search, shareable views and
host-provided diagram lenses. Atlas describes documented architecture, not live health.

Version 0.1 is a serverless viewer, not yet a visual or agent-driven editor. A host can
bundle a local JSON document and render it entirely offline. Editing and collaboration
are future document-layer capabilities, not features claimed by this release.

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
The package allowlist contains only compiled assets, public API types, this README
and the MIT license. Source documents and host-specific adapters stay with the host.

## License

MIT, copyright Shizuha Global Pvt. Ltd. Repository visibility and registry access
are independent of the source license. Public distribution is a separate release
decision; internal development does not imply a public release.
