# Host adapter boundary

The reusable package accepts a validated model and renders an interactive explorer.
It must not import a host API module, authentication provider, document parser,
deployment inventory or global preference store.

## Wiki-style hosts

1. Fetch the model under the current authenticated organization and page permissions.
2. Pass the model to `AtlasExplorer` under a React Router provider.
3. Supply `renderDiagramLibrary({model, node})` to browse authorized diagram sources.
4. Fetch sources through the host API, preserve page revision and original source,
   and render through the host's trusted diagram renderer.
5. Handle cancellation, access-denied responses and parse errors without sample
   fallbacks or cross-organization caches.

Use explicit stable identity bindings between diagram assets and architecture
components. Generated SVG IDs and display labels are not durable identities.
Preserve the renderer's native sequence, state, ER and other diagram semantics.
An exported architecture flowchart is a visual projection, not a lossless import or
round-trip representation of every supported diagram family.

## Confluence Cloud contract

A Forge Custom UI macro can host the same React package in its sandboxed iframe.
Use a `MemoryRouter` for in-macro navigation. The adapter must handle source links
through Forge bridge navigation rather than assuming ordinary anchor navigation.
Fetch page data through permission-aware Forge APIs/resolvers, honor page and space
access, and request only the required scopes. Never place service credentials in
the browser package or source model.

```jsx
import { router } from '@forge/bridge'

<AtlasExplorer
  model={authorizedModel}
  onOpenSource={url => router.navigate(url)}
  onShareView={async ({ search }) => {
    await saveAuthorizedMacroView({ search })
  }}
  renderDiagramLibrary={context => <HostDiagramLibrary {...context} />}
/>
```

`saveAuthorizedMacroView` and `HostDiagramLibrary` are host-provided adapters, not
exports from this package. The share callback receives the serialized in-memory
router query and a browser-based candidate URL. An iframe host should construct its
own permitted share target from that query rather than sharing its iframe URL.
Source callbacks may be asynchronous; a rejected callback is shown as a navigation
failure, not reported as a successful open. Share success is labeled Shared when
the host handles it, and Copied only when Atlas writes to the clipboard.

The adapter owns macro configuration, persistence of diagram/model references,
page-version provenance, viewport sizing and authorized source retrieval. Keep
diagram runtimes local to declared app resources or explicitly configured permitted
resources; do not silently inject third-party scripts into a host page.

This is an integration contract, not an installed or live-verified Confluence app.
Confluence Data Center is a different host integration and is not covered by the
Cloud Forge contract.

Official references:

- https://developer.atlassian.com/platform/forge/manifest-reference/modules/macro/
- https://developer.atlassian.com/platform/forge/extend-ui-with-custom-options/
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/

## Distribution boundary

Keep real customer topology, source document bodies, private URLs, screenshots,
authentication adapters, CI credentials and incident evidence out of package
artifacts and public example data. Package consumers supply these at runtime under
their own access controls. A permissive code license does not authorize publishing
private customer or organization data.
