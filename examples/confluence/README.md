# Shizuha Atlas for Confluence Cloud (Forge example)

A runnable Custom UI macro and visual configuration editor, licensed under the
repository's MIT license. Atlas and its dependencies are bundled into Forge
resources; **no Atlas server or external data backend is required**. This is a
buildable integration example, not a claim of an installed/verified site app.

## Build and install

Use Node 22. Build Atlas from the repository root, then build this example:

```sh
npm ci
npm run build
cd examples/confluence
npm ci
npm test
npm run build
npm run forge -- login
npm run forge -- register
npm run forge -- lint
npm run forge -- deploy --environment development
npm run forge -- install --environment development --product confluence --site YOUR_SITE.atlassian.net
```

`forge register` replaces the manifest's all-zero placeholder app ID with your
own app registration. Follow Forge's login flow using your existing Atlassian
account; never put its token in source, a diagram, or browser code. Deployment and
installation require appropriate developer/site administration rights. After
scope changes use `forge install --upgrade`. All commands operate on your app,
not an Atlas-hosted service. Keep the installed lockfile for reproducible builds.

On a **published page**, enter edit mode, insert `/Shizuha Atlas`, and configure
the macro. Create a design or import an `.atlas.json` file with the editor's
Import action. Choose **Save and use diagram**, then publish the page. Reopen the
macro configuration to edit. The macro itself is an explorable read-only view;
source links use Forge bridge navigation. Browser-local memory routing does not
rewrite the host page URL.

## Storage, permissions and concurrent editing

The full validated document (up to Atlas's 8 MiB bound) is stored in a new JSON
page attachment for every accepted save. The macro config contains only a random,
namespaced property key. A small page property indexes attachment ID, byte count,
SHA-256 and document revision. Reads validate the index, attachment hash, document
schema and revision before displaying anything. Missing data never becomes a
blank graph automatically.

Every API call uses `requestConfluence` as the current user. Page/attachment
permissions and app-access policy are enforced by Confluence, not by iframe
context or a UI flag. The manifest scopes permit reading/writing the page index,
reading/uploading attachments, and deleting only an unpublished failed upload.
No app-wide resolver bypasses user permissions, no service credentials are used,
and no external egress is configured.

The loaded property version is an optimistic concurrency token, independent of
the Atlas document revision. Saves preflight the original property version, then
upload a unique filename using **create**, never update. The final property PUT
supplies the previous version plus one. A racing writer receives an error rather
than overwriting the winner. Local edits remain in the editor for export/rebase.
Existing accepted attachments are retained as immutable revision history; the
example never deletes or modifies them.

Attachment upload and index commit are separate Confluence operations. A definite
index rejection triggers deletion of only this save's unpublished upload. If a
reply is lost, the adapter first checks whether the index references its exact
upload and hash; that is treated as a recovered success. An uncertain outcome
does **not** trigger destructive cleanup: an error names the staged attachment
for inspection. Closing the browser during upload may also leave a staged file;
look for its unique `shizuha-atlas-…atlas.json` filename in page attachments and
confirm it is not referenced by a macro index before removal. This example does
not falsely promise a distributed transaction across attachment and property APIs.

Saving writes immediately, independently of publishing the surrounding page.
**Close does not roll back an already saved graph.** If macro configuration
submission fails after storage succeeds, retry Save and use diagram in that
dialog: the existing accepted baseline is reused. Do not store secrets in the
graph: page attachments/properties are host-visible data, not a secret vault.

## Verification gate

`npm test` exercises real storage-adapter code with a deterministic REST transport:
graphs larger than the property size limit, stale writers, a racing commit,
permission denials, integrity failures and lost replies. `npm run build` bundles
the actual viewer/editor, Forge bridge and Atlas package without CDN dependencies.
These checks are necessary but do not replace installation testing.

Before production, test on the authorized Confluence site: create/import/save,
reload and export; two simultaneous editors; page-view-only user; restricted
page; interrupted save; large document upload/download; iframe sizing, minimap,
keyboard focus and source navigation. Confirm the site accepts the 8 MiB upload
and the Forge bridge follows the attachment download response. Do not weaken
validation or grant broad service permissions if a site policy denies access.

## Official references

- [Forge Custom UI macro](https://developer.atlassian.com/platform/forge/manifest-reference/modules/macro/)
- [Custom macro configuration and view.submit](https://developer.atlassian.com/platform/forge/add-custom-configuration-to-a-macro/)
- [Current-user requestConfluence bridge](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestConfluence/)
- [Page property REST API](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-content-properties/)
- [Property concurrency semantics](https://developer.atlassian.com/cloud/confluence/confluence-entity-properties/)
- [Create and download attachments](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content---attachments/)
- [Attachment metadata and deletion](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-attachment/)

For custom configuration resources this example uses `view.getContext()`, as
specified by the custom-configuration guide; its warning about `useConfig()` is
for sidebar configuration, not this Custom UI configuration modal. A Confluence
Data Center integration is a different plugin and is not included here.
