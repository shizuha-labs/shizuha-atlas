import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

export async function mermaidPlugin() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/utils/mermaidWorker.js', import.meta.url))],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'inline', define: { 'process.env.NODE_ENV': '"production"' },
  })
  const runtime = result.outputFiles[0].text
  return {
    name: 'atlas-mermaid-sandbox',
    setup(plugin) {
      plugin.onResolve({ filter: /^atlas:mermaid-runtime$/ }, () => ({ path: 'runtime', namespace: 'atlas-mermaid' }))
      plugin.onLoad({ filter: /.*/, namespace: 'atlas-mermaid' }, () => ({ contents: `export default ${JSON.stringify(runtime)}`, loader: 'js' }))
    },
  }
}
