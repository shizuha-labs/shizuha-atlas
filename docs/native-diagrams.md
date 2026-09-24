# Native diagrams, safe previews and agent navigation

The architecture canvas remains the editable hierarchical node/edge model. **Diagram studio** adds native Mermaid documents alongside that model, without pretending that a sequence, ER model, timeline or chart can be converted losslessly into architecture nodes. Choose a starter or import `.mmd`, edit source and choose Preview. Changes participate in Atlas history and normal host saves. Syntax errors remain editable drafts.

An optional `diagrams` array belongs to the version 1 envelope. Each entry is `{id,title,source,node_id?}`: a unique immutable ID, non-empty title (maximum 1,000 characters), source (maximum 100,000 characters), and an optional existing node ID or `null`. Up to 100 diagrams fit within the existing overall document size limit. `diagram.add`, `diagram.update` and `diagram.remove` use the atomic revision-checked operation engine. Removing a linked component requires explicit cascade; cascading **detaches**, rather than destroys, its diagram source. Legacy documents without `diagrams` remain valid and unchanged by parsing.

Source survives JSON, fenced Atlas Markdown and editable offline HTML exports. The studio exports exact `.mmd` text and a sanitized static SVG of the latest successful preview. SVG export is disabled after source changes until a successful refresh. SVGs do not carry Atlas editing/hierarchy semantics.

## Coverage and security limits

Mermaid **12.0.0** is pinned and bundled locally. All families registered in that runtime can be entered directly. Browser verification covers 22 starters: flowchart, sequence, class, state, ER, journey, Gantt, pie, quadrant, requirement, Git graph, C4 context, mindmap, timeline, Sankey, XY, block, packet, Kanban, architecture, radar and treemap. Optional external plugins such as ZenUML are not registered. Remote icon packs, HTML interactions, callbacks, external image/font loads and source-supplied configuration are not supported. Front matter and initialization directives remain preserved as text but preview rejects them.

Rendering executes in a separate opaque-origin iframe with only `allow-scripts`, no same-origin access, and a CSP denying network access. Parent messages are checked against the exact iframe window, opaque origin and per-render nonce. Each render gets a new frame, source/edge limits, timeout and selection-change cancellation. Mermaid runs in strict mode. The parent never inserts diagram HTML or binds callbacks. SVG output is reduced to passive elements and presentation attributes, removing stylesheets, event handlers, active content and external references. Preview uses an inert image. Portable HTML embeds the complete runtime without CDN dependencies.

This is native-source editing for family-specific semantics, not WYSIWYG conversion of every family into architecture nodes. The iframe isolates script/network authority, not unlimited CPU; bounded source/edges and cancellation reduce accidental overload, but this is not a general-purpose untrusted-code execution service.

References: [Mermaid usage/security](https://mermaid.js.org/config/usage), [syntax](https://mermaid.js.org/intro/syntax-reference.html), [radar grammar](https://mermaid.js.org/syntax/radar).

## Controlled agent navigation

The renderer is a build-time dependency embedded in the runtime, not an extra CDN or consumer-installed library. The build pins `lodash-es` 4.18.1 for Mermaid's Chevrotain parser dependency, avoiding the upstream 4.17.23 pin affected by [GHSA-r5fr-rjxr-66jc](https://github.com/lodash/lodash/security/advisories/GHSA-r5fr-rjxr-66jc) and [GHSA-f23m-r3pf-42rh](https://github.com/lodash/lodash/security/advisories/GHSA-f23m-r3pf-42rh). Regression verification renders all starter families at the actual parser/renderer boundary, not just an isolated dependency import.

`AtlasExplorer` and `AtlasEditor` accept `navigationRequest` and `onNavigationResult`. Requests contain `{id,action,nodeId?,flowId?}` with a new ID per approved action. Actions are `focus`, `zen`, `expand`, `collapse_all`, `expand_all`, `fit_view`, `overview` and `journey`. Component actions require exact current node IDs; journeys require exact flow IDs. Unknown keys/IDs are rejected; each ID is consumed once per mounted component. Results contain `{id,ok,error?}`. Navigation never mutates the document. The design canvas supports focus, expand, overview, collapse, expand-all and fit; Zen/journeys explicitly require Explorer.

Hosts provide authenticated chat, scoped capabilities and user/host approval. Arbitrary agent text is not code or an authorized document operation.

## Three-way collaboration merge

`mergeAtlasDocuments({base,local,remote})` returns a validated `document` and empty `conflicts`, or `document: null` with structured conflicts. Inputs must be valid documents with the same identity and branch revisions not older than their common base. The result uses `max(local.revision,remote.revision)+1` and a fresh timestamp. Inputs never mutate.

Nodes, edges, flows, views and diagrams merge by ID. Independent fields/additions merge; identical edits coalesce. Divergent same-field edits, deletion-versus-edit and different additions sharing an ID conflict. Ordered arrays such as journey steps/source lists stay atomic, never inventing order or concatenating source. Entity order follows remote with local additions appended. Layout maps merge recursively. Revision/timestamp metadata is ignored during comparison. Final graph validation rejects combined containment cycles or dangling references as `invalid_merge`; no partial document escapes any conflict.

This primitive is not transport/authentication/presence/autosave or storage compare-and-swap. Hosts retain the actual common base, preserve conflicted local edits, enforce current permissions and save against the exact remote storage version. Another concurrent write requires another verified merge, never unconditional overwrite.
