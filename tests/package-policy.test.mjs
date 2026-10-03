import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assertPublicContent, packageIntegrity, publishedVersionDecision, validatePackageFiles, validateRegistry } from '../scripts/package-policy.mjs'

test('publication accepts only the approved internal registry', () => {
  assert.equal(validateRegistry('http://npm-cache.registry.svc.cluster.local:4873/'), 'http://npm-cache.registry.svc.cluster.local:4873/')
  for (const address of [undefined, 'https://registry.npmjs.org/', 'http://localhost:4873/', 'http://npm-cache.registry.svc.cluster.local:4873/other', 'http://user:secret@npm-cache.registry.svc.cluster.local:4873/', 'http://npm-cache.registry.svc.cluster.local:4873/?forward=public']) assert.throws(() => validateRegistry(address))
})

test('artifact policy rejects private topology and credentials, not neutral examples', () => {
  assert.doesNotThrow(() => assertPublicContent('README.md', 'MIT Shizuha Atlas example storefront'))
  for (const content of ['https://private.shizuha.com', 'http://service.namespace.svc.cluster.local', 'http://10.2.3.4', 'atlas_catalog.json', 'access-token.json', 'Bearer ' + 'example'.repeat(5), '-----BEGIN PRIVATE KEY-----']) assert.throws(() => assertPublicContent('dist/index.mjs', content))
})

test('file allowlist rejects unexpected or missing artifact entries', () => {
  const licenses = [{ name: 'synthetic', version: '1.0.0', files: ['LICENSES/synthetic-1.0.0/LICENSE'] }]
  const names = ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.json', 'LICENSES/synthetic-1.0.0/LICENSE', 'dist/index.mjs', 'dist/index.cjs', 'dist/index.d.ts', 'dist/core.mjs', 'dist/core.cjs', 'dist/core.d.ts', 'dist/atlas.css', 'dist/portable.mjs', 'dist/portable.d.ts', 'scripts/atlas-cli.mjs']
  const files = names.map(path => ({ path, size: 100 }))
  const validate = list => validatePackageFiles(list, licenses)
  assert.doesNotThrow(() => validate(files))
  assert.throws(() => validate(files.slice(1)))
  assert.throws(() => validate([...files, { path: '.env', size: 20 }]))
  assert.throws(() => validate([...files, files[0]]))
  assert.doesNotThrow(() => validate(files.map(file => file.path === 'dist/portable.mjs' ? { ...file, size: 6 * 1024 * 1024 } : file)))
  assert.throws(() => validate(files.map(file => file.path === 'dist/portable.mjs' ? { ...file, size: 8 * 1024 * 1024 + 1 } : file)))
  assert.throws(() => validate(files.map(file => file.path === 'dist/core.mjs' ? { ...file, size: 4 * 1024 * 1024 + 1 } : file)))
  assert.throws(() => validate(files.filter(file => !file.path.startsWith('LICENSES/'))), /Missing package files/)
  assert.throws(() => validate([...files, { path: 'LICENSES/unreviewed/LICENSE', size: 100 }]), /Unexpected/)
  assert.throws(() => validatePackageFiles(files, []), /inventory/)
  assert.throws(() => validatePackageFiles(files, [{ files: ['LICENSES/../private'] }]), /Invalid/)
})

test('same-version publication requires exact verified artifact replay', () => {
  const manifest = { name: '@shizuha/atlas', version: '0.1.0' }
  const integrity = packageIntegrity(Buffer.from('example'))
  assert.equal(publishedVersionDecision(null, manifest, integrity), 'publish')
  assert.equal(publishedVersionDecision({ ...manifest, dist: { integrity } }, manifest, integrity), 'unchanged')
  assert.throws(() => publishedVersionDecision({ ...manifest, dist: { integrity: 'wrong' } }, manifest, integrity))
  assert.throws(() => publishedVersionDecision({ ...manifest, version: '9.0.0', dist: { integrity } }, manifest, integrity))
})

test('entrypoints exclude host APIs, authentication and diagram runtime coupling', () => {
  const explorer = readFileSync(new URL('../src/components/atlas/AtlasExplorer.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(explorer, /services\/api|useAuth|mermaidHydrate|AtlasDiagramLibrary|atlas_catalog/)
  assert.match(explorer, /renderDiagramLibrary/)
  const stylesheet = readFileSync(new URL('../src/atlas.css', import.meta.url), 'utf8')
  assert.match(stylesheet, /--atlas-height/)
  assert.match(stylesheet, /--atlas-min-height/)
})
