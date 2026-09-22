# Offline standalone viewer

Atlas can render without an Atlas server, Wiki installation, account or API. The
standalone example bundles React, the explorer, styles and a fictional model into
local files. It uses no CDN, remote fonts, source-document requests or telemetry.

## Build and open

After installing this repository's locked dependencies in your build environment:

```sh
node scripts/build-demo.mjs
```

Copy the entire `artifacts/demo/` directory to your device, then open its
`index.html` in a modern browser, including directly through `file://`. Keep
`app.js` and `app.css` alongside it. No local HTTP server is needed. Dependencies
are needed at build time only; opening the finished viewer requires no network.
The output uses a classic bundled script rather than browser ES modules so that
opening local files does not depend on module-fetch permissions.

Explore the sample with search, node expansion, zoom, pan, the minimap, process
walkthroughs and Zen focus. **Share view** records the current selection and
filters in the file URL's fragment. Bookmark that address to restore the view on
the same device. A local file URL is not a public link; sending it alone does not
send the viewer or its model. Distribute all three files together instead.

This is a viewer, not an architecture editor. It does not import arbitrary model
files, edit diagrams, save source documents, or provide backend integrations.
The supplied `examples/sample-model.json` is synthetic, not private system data.

## Host boundary

`examples/standalone/main.jsx` supplies the model directly to `AtlasExplorer` and
uses `MemoryRouter` for in-view navigation. Its sharing callback handles local
bookmark state without clipboard permission or host APIs. The existing host
adapter contract still applies when an application adds authenticated document
retrieval or native diagram renderers.

An offline bundle contains its complete model in readable form. Do not include
private topology or source documents in a publicly distributed demo. There is no
server-side authorization after exporting files; control distribution instead.
Generated demo files stay under ignored `artifacts/` and are separate from the
published library's package allowlist.
