import { build } from 'esbuild'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { mermaidPlugin } from './mermaid-plugin.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = resolve(root, 'artifacts/demo')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: ['examples/standalone/main.jsx'],
  outfile: resolve(output, 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  legalComments: 'eof',
  metafile: true,
  logLevel: 'warning',
  plugins: [await mermaidPlugin()],
})
for (const [name, entry] of Object.entries(result.metafile.outputs)) {
  if (entry.imports.some(dependency => dependency.external)) throw new Error(`Offline demo has an external dependency: ${name}`)
}
await copyFile(resolve(root, 'examples/standalone/index.html'), resolve(output, 'index.html'))
console.log('Built offline viewer: artifacts/demo/index.html, app.js and app.css. Open index.html directly; no server required.')
const { createAtlasDocument, createAtlasPortableHtml } = await import('../dist/core.mjs')
const { script, style } = await import('../dist/portable.mjs')
const model = JSON.parse(await readFile(resolve(root, 'examples/sample-model.json'), 'utf8'))
await writeFile(resolve(output, 'editor.html'), createAtlasPortableHtml(createAtlasDocument(model), { script, style, title: 'Atlas offline design studio' }))
console.log('Built self-contained editable file: artifacts/demo/editor.html. It can save another editable HTML file without any server.')
