import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const alias = Object.fromEntries(['react', 'react-dom', 'react-router-dom'].map(name => [name, dirname(require.resolve(name + '/package.json'))]))
for (const mode of ['viewer', 'editor']) {
  const output = resolve(root, 'static', mode)
  await mkdir(output, { recursive: true })
  await build({
    absWorkingDir: root, entryPoints: ['src/main.jsx'], outfile: resolve(output, 'app.js'),
    bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022',
    jsx: 'automatic', legalComments: 'none', alias,
    define: { __ATLAS_CONFIG__: JSON.stringify(mode === 'editor'), 'process.env.NODE_ENV': '"production"' },
  })
  await writeFile(resolve(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shizuha Atlas</title><link rel="stylesheet" href="./app.css"></head><body><div id="root"></div><script src="./app.js"></script></body></html>')
}
console.log('Built self-contained Forge viewer and editor resources; no Atlas server required.')
