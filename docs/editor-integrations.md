# Portable editing and host integrations

Atlas documents are data, not programs. The versioned envelope is
`{format:"shizuha-atlas",version:1,revision,model,layout:{positions:{}},views:[]}`.
The model uses schema version 1. Both the editor and agents use the same validator
and atomic operation batches. Each accepted batch advances the document revision
once. Invalid batches leave the original unchanged. Unknown versions fail closed.
Legacy schema-1 models can be imported by `parseAtlasDocument`; portable Markdown
blocks deliberately require the full versioned envelope.

## Agents and local files

After installing the package (or building this checkout):

```sh
atlas example > system.atlas.json
atlas validate system.atlas.json
atlas schema > atlas-envelope.schema.json
atlas apply system.atlas.json operations.json --output next.atlas.json
atlas apply system.atlas.json operations.json --in-place --expected-revision 0
```

Inside this checkout, substitute `node scripts/atlas-cli.mjs` for `atlas`.
An operations file contains, for example:

```json
{"base_revision":0,"operations":[{"type":"document.update","changes":{"title":"My system"}}]}
```

The CLI has no network, credentials or execution hooks. It rejects stale revisions,
existing output files, and symlink targets. In-place edits require an explicit
revision guard. Writers take an exclusive adjacent `.atlas-lock`; the new file is
written and fsynced before an atomic rename (in-place) or no-replace hard link
(new output). The containing directory is fsynced. Use a filesystem supporting
these primitives. Output files have mode 0600. A crashed process may leave a lock;
inspect the recorded PID before removing a stale lock. Locks are never stolen.

All writers must participate in this protocol. Comparing input bytes before
rename also detects outside edits, but is not an OS-level transaction against an
uncooperative writer. Shared/remote storage must implement its own transactional
revision comparison. Do not treat a local lock as cross-service authorization.
`atlas schema` is a structural envelope schema; `atlas validate` also checks graph
references, containment cycles, safe links, JSON safety and resource bounds.

## No Atlas server required

`exportAtlasCodeBlock(document)` and `importAtlasCodeBlock(text)` exchange a single
fenced `atlas` or `shizuha-atlas` JSON block. A Markdown renderer needs an Atlas
plugin to render it; an ordinary code block remains inert text. Agents can edit
the same document package that humans open in the editor.

`createAtlasPortableHtml(document, {script, style, title})` produces a single HTML
file from a **trusted, prebuilt, self-contained runtime** and CSS. It includes a
`#root` mount and a `#atlas-document` application/json element. The runtime reads
the latter's `textContent` through `parseAtlasDocument` and mounts the viewer or
editor. Bundle dependencies locally; CDN scripts, runtime imports and network
requests are blocked by its offline content-security policy. Opening/downloading
files is browser-mediated. Saving to an organization remains a host capability,
not a permission granted by the portable file.

`encodeAtlasDocument` escapes HTML/script delimiters and Unicode line separators;
code-block export also escapes backticks. Do not concatenate raw JSON into HTML.
Do not accept script/CSS bundles from a document or an untrusted message. The
validator rejects executable values and unsafe source URLs. Host navigation must
still use `safeSourceUrl`/`createAtlasHostAdapter` before opening a source link.
Exports contain the full graph, not merely currently visible/Zen nodes: authorize
the complete export and remove private information before sharing. Never embed
session tokens, API keys or organization credentials.

## Wiki and generic iframe adapter

A host owns authentication, authorization, persistence and revision CAS. A Wiki
renderer can parse a block and mount Atlas directly in its existing React app.
Persist the document as page data/attachment or host storage, using the page's
write permissions. Compare the stored revision atomically before committing;
return a conflict rather than silently overwriting another editor's work.

For a separate trusted iframe, `createAtlasEmbedAdapter` is explicitly opt-in:

```js
const adapter = createAtlasEmbedAdapter({
  window,
  hostWindow: window.parent,
  origin: 'https://wiki.example',
  nonce: hostProvidedRandomNonce,
  getDocument: () => documentRef.current,
  onLoad: document => {
    documentRef.current = document
    setDocument(document)
  },
  onSaveAck: ({ revision }) => markRevisionSaved(revision),
  onError: error => showError(error.message),
})
```

Generate a fresh unpredictable nonce (at least 128 random bits, URL-safe encoded)
for each iframe session and provision it through a trusted bootstrap. Pin the
exact HTTP(S) host origin and parent window; wildcard and opaque origins are
rejected. The host must symmetrically verify the child origin, source window,
nonce and message shape. Never derive trust from an incoming message. A local
`file:` export uses its inline document, not an opaque-origin host channel.

Every message has `channel:"shizuha-atlas.v1"`, `nonce`, `type`, and a unique
URL-safe `request_id` (1–128 characters; use a host-specific prefix).

| Direction | Type | Payload / behavior |
| --- | --- | --- |
| Host → Atlas | `atlas:load` | `base_revision`, `document`; validates the whole document and refuses revision rollback. |
| Host → Atlas | `atlas:change` | `base_revision`, `operations`; applies the same atomic agent operation batch. |
| Atlas → Host | `atlas:loaded` | Echoes request ID and accepted `revision`. |
| Atlas → Host | `atlas:change` | `notifyChange()` sends `base_revision`, `revision`, complete `document`. |
| Atlas → Host | `atlas:save` | `requestSave()` sends a snapshot `document` and its `revision`. |
| Host → Atlas | `atlas:saved` | Echoes save request ID and exact persisted `revision`, only after durable authorized CAS. |
| Host → Atlas | `atlas:save-error` | Echoes save request ID and snapshot `revision`; releases pending save and surfaces failure. |
| Atlas → Host | `atlas:error` | Request ID and validation/conflict message; no document mutation. |

`onLoad` must **synchronously** install the document returned by the validator;
React integrations update their document ref before scheduling state. Initial
loading may replace a document at the same revision; use `atlas:change` for edits.
Save ACKs refer to the submitted snapshot, never a newer local edit. A host must
remember its persisted base revision separately; never assume an ACK saves edits
made while the request was pending. Only one save is pending at a time; incoming
loads/edits wait until that save is acknowledged or rejected. Mutation messages
are deduplicated and processed serially; malformed save ACKs do not mark anything
saved. Sessions cap message size, queue depth and accepted mutation IDs. Recreate
the adapter with a fresh nonce when reconnecting; call `dispose()` on unmount.

## Confluence Cloud: packaged Forge macro

A feasible integration is a Forge macro whose `resource` is a packaged Custom UI
build containing Atlas and its dependencies. Atlassian hosts those assets, so a
separate Atlas backend is unnecessary. The macro is installed into the target
Confluence site; this repository does **not** claim a deployed Confluence app.
The buildable [Confluence example](../examples/confluence/README.md) includes a
viewer, visual configuration editor, immutable JSON attachments and a small
version-checked page-property index for full-size documents.
See the official [macro module reference](https://developer.atlassian.com/platform/forge/manifest-reference/modules/macro/)
and [Custom UI guide](https://developer.atlassian.com/platform/forge/extend-ui-with-custom-options/).

Use the documented Forge bridge/configuration APIs for the sandboxed macro, not
an arbitrary parent `postMessage` channel. Macro configuration can identify the
document; larger graphs can live in a host-authorized attachment or appropriate
Forge storage, with explicit revision checks. Choose storage and required scopes
only after validating current limits and permissions for that Confluence site.
The static document can also be included in the macro resource for read-only use.
Custom UI iframe links need `@forge/bridge` navigation rather than ordinary
anchors. Use a memory router inside the iframe and test resizing, focus, keyboard
shortcuts, editing permissions, concurrent saves and export in a real installed
macro before calling the integration production-ready.
