import { build } from 'esbuild'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

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
})
for (const [name, entry] of Object.entries(result.metafile.outputs)) {
  if (entry.imports.some(dependency => dependency.external)) throw new Error(`Offline demo has an external dependency: ${name}`)
}
await copyFile(resolve(root, 'examples/standalone/index.html'), resolve(output, 'index.html'))
console.log('Built offline viewer: artifacts/demo/index.html, app.js and app.css. Open index.html directly; no server required.')
