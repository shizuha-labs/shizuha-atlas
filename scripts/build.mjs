import { build } from 'esbuild'
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const external = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
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
    legalComments: 'none',
    logLevel: 'warning',
  })
}
for (const name of ['index.d.ts', 'core.d.ts', 'atlas.css']) {
  await copyFile(resolve(root, 'src', name), resolve(root, 'dist', name))
}
console.log('Built ESM, CommonJS, types and scoped styles.')
