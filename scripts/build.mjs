import { build } from 'esbuild'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { mermaidPlugin } from './mermaid-plugin.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const external = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
const diagramPlugin = await mermaidPlugin()
await rm(resolve(root, 'dist'), { recursive: true, force: true })
await mkdir(resolve(root, 'dist'))
for (const format of ['esm', 'cjs']) {
  await build({
    absWorkingDir: root,
    entryPoints: { index: 'src/index.jsx', core: 'src/core.js' },
    outdir: 'dist',
    outExtension: { '.js': format === 'esm' ? '.mjs' : '.cjs' },
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format,
    jsx: 'automatic',
    external,
    plugins: [diagramPlugin],
    legalComments: 'none',
    logLevel: 'warning',
  })
}
for (const name of ['index.d.ts', 'core.d.ts']) {
  await copyFile(resolve(root, 'src', name), resolve(root, 'dist', name))
}
await writeFile(resolve(root, 'dist/atlas.css'), (await Promise.all(['atlas.css', 'editor.css', 'diagrams.css'].map(name => readFile(resolve(root, 'src', name), 'utf8')))).join('\n'))
const portable = await build({
  absWorkingDir: root,
  entryPoints: ['examples/editor/main.jsx'],
  outfile: 'dist/portable-runtime.js',
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline',
  logLevel: 'warning',
  plugins: [diagramPlugin],
})
const script = portable.outputFiles.find(file => file.path.endsWith('.js')).text
const style = portable.outputFiles.find(file => file.path.endsWith('.css')).text
await writeFile(resolve(root, 'dist/portable.mjs'), `export const script = ${JSON.stringify(script)};\nexport const style = ${JSON.stringify(style)};\n`)
await writeFile(resolve(root, 'dist/portable.d.ts'), 'export declare const script: string;\nexport declare const style: string;\n')
console.log('Built ESM, CommonJS, types, scoped styles and the offline editor runtime.')
