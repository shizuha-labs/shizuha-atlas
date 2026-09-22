# Atlas documents and operations

Atlas uses portable JSON, not a server-specific database export. Human editing and agent editing share the same validation and transaction engine. Existing schema-version-1 architecture models remain readable through `parseAtlasDocument` and are upgraded to a revision-zero document without changing their model identity.

```json
{
  "format": "shizuha-atlas",
  "version": 1,
  "revision": 0,
  "model": {
    "schema_version": 1,
    "id": "example-system",
    "title": "Example system",
    "description": "",
    "model_revision": "0",
    "updated_at": "2026-01-01T00:00:00Z",
    "coverage": {},
    "nodes": [{"id":"example-system","label":"Example system","kind":"system","parent_id":null,"description":"","sources":[],"status":"declared"}],
    "edges": [],
    "flows": []
  },
  "layout": {"positions": {}},
  "views": []
}
```

`model.id` is the stable document identity. The wrapper's integer `revision` is the concurrency token. `model_revision` remains a display-compatible string and is updated with each transaction. Node IDs, edge IDs, flow IDs, view IDs, and step IDs within a flow are unique within their respective collections. IDs use letters, digits, period, underscore, colon, slash, and hyphen, start with a letter or digit, and are at most 200 characters.

## Public functions

- `createAtlasDocument(model?)` validates and clones an existing model, or creates a new empty system with a generated stable ID.
- `validateAtlasDocument(document)` returns the same document on success without modifying it; invalid input throws an `AtlasDocumentError` with `code`, `reason`, and `message`.
- `parseAtlasDocument(jsonText)` accepts a portable wrapper or a legacy model.
- `serializeAtlasDocument(document)` validates and emits readable JSON with a trailing newline.
- `applyAtlasOperations(document, envelope)` returns a detached new document with revision increased by one. It never changes either argument.

Transactions require an exact base revision. Operations are applied in order to a private copy and the final graph is validated before publication. This permits mutually dependent additions within one transaction. Any error rejects the entire transaction, leaving the caller's document unchanged. A host that accepts concurrent writes must persist with an atomic compare-and-swap on the revision; this pure library does not provide a database lock or authorization.

```json
{
  "base_revision": 0,
  "operations": [
    {"type":"node.add","node":{"id":"orders","label":"Orders","kind":"service","parent_id":"example-system"}},
    {"type":"node.add","node":{"id":"payments","label":"Payments","kind":"service","parent_id":"example-system"}},
    {"type":"edge.add","edge":{"id":"charge","source":"orders","target":"payments","kind":"http","label":"Charge"}},
    {"type":"layout.set","positions":{"orders":{"x":40,"y":120},"payments":{"x":500,"y":120}}}
  ]
}
```

## Operations

| Type | Payload | Behavior |
| --- | --- | --- |
| `node.add` | `node` | Requires ID, label, kind, parent ID. Defaults description to empty, sources to empty, and status to `declared`. |
| `node.update` | `id`, `changes` | Updates node attributes; ID and parent ID are immutable here. |
| `node.reparent` | `id`, `parent_id` | Moves containment, rejects cycles or root changes, clears the node's old relative position. |
| `node.remove` | `id`, optional `cascade` | Root deletion is forbidden. Dependent nodes, edges, flow steps, or view references require explicit `cascade: true`. Cascade cleans descendants and their incident edges, dependent flow steps, positions, and known view references. |
| `edge.add` | `edge` | Requires ID, source, target, kind. Defaults label to empty, sources to empty, status to `declared`. |
| `edge.update` | `id`, `changes` | Updates relationship attributes, including endpoints; ID stays immutable. |
| `edge.remove` | `id`, optional `cascade` | References from flow steps require explicit `cascade: true`; cascade clears those edge references. |
| `layout.set` | `positions` | Merges node-relative `{x,y}` coordinates. A `null` entry clears that node's override. |
| `document.update` | `changes` | Updates model `title` and/or `description`. |
| `flow.upsert` | `flow` | Adds or replaces a complete flow. Steps retain their order and validated node/edge references. |
| `flow.remove` | `id` | Removes the flow and clears saved-view references to it. |
| `view.upsert` | `view` | Adds or replaces a named view. |
| `view.remove` | `id` | Deletes a saved view. |
| `document.replace` | `document` | Replaces content after full validation, preserving `model.id` and advancing the current revision, not the imported revision. |

Node `kind` and edge `kind` are extensible strings. Self-loop edges are allowed. Evidence status is `declared`, `documented`, or `inferred`. Sources have `{label,type,url}` and optional metadata; URL policy permits ordinary HTTP(S) and site-relative links, not executable schemes, protocol-relative links, or credentials.

A flow is `{id,label,description,steps}`. Each step is `{id,label,description,source,target,edge_ids?}`. Empty flows are permitted, including after cascading deletion.

A named view is `{id,label,state?,viewport?}`. State can store `selected`, `zen`, `flow`, `expanded` (an array of node IDs), and other JSON view parameters. Known references are validated. Viewports use `{x,y,zoom}`; zoom must be greater than zero and no more than 100. Coordinates must be finite and within ±10,000,000. Positions are relative to the immediate container, matching Atlas/React Flow layout conventions.

## Undo and redo

`createAtlasHistory(document?)` returns `{document,past:[],future:[]}`. `commitAtlasHistory(history,envelope)`, `undoAtlasHistory(history)`, and `redoAtlasHistory(history)` return new histories without mutating their inputs. New edits clear redo. Up to 100 snapshots are retained in either history direction. No-op undo or redo returns the original history.

Undo and redo are new document transactions, not revision rewinds: revisions remain monotonic, so a stale agent write cannot accidentally become valid after undo. History is an in-memory editor facility, not part of portable document JSON. Importing a different model starts a different document/history rather than replacing the stable identity of an existing document.

## Validation and limits

The validator accepts bounded plain JSON only. Unknown extension fields survive editing and round trips, but they must satisfy the same JSON limits. Extension semantics are the host's responsibility; do not execute imported values as code or HTML. Built-in limits are 5,000 nodes, 20,000 edges, 1,000 flows, 2,000 steps per flow, 1,000 saved views, 1,000 operations per transaction, 100 sources per item, 64 levels of JSON/containment depth, and 300,000 traversed JSON values. A conservative UTF-8 size estimate is limited to 8 MiB, individual strings to 200,000 characters, and labels to 1,000. Arrays cannot be sparse or have extension properties.

The validator rejects non-finite numbers, functions, accessors, hidden properties, symbols, non-plain objects, object cycles, and the reserved property names `__proto__`, `prototype`, and `constructor`. It requires exactly one containment root, unique IDs, acyclic connected containment, existing edge endpoints, valid flow references, and valid layout/view references. JSON escaping does not bypass validation.

Error codes are `INVALID_DOCUMENT`, `INVALID_OPERATION`, `NOT_FOUND`, `DEPENDENCY_CONFLICT`, and `REVISION_CONFLICT`. Display `reason` to the editor; agents should refresh the current document after a revision conflict and construct a new transaction rather than blind-retrying an old base revision.
