import { execFileSync } from 'node:child_process'
import { cp, mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPublicContent, packageIntegrity, validatePackageFiles } from './package-policy.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const artifacts = resolve(root, 'artifacts')
const stage = resolve(artifacts, 'package-stage')
await rm(artifacts, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
delete manifest.scripts
delete manifest.devDependencies
let sourceSha = null
try { sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
// The published artifact must be a function of PACKAGE CONTENT, not of the
// commit that packed it. Injecting gitHead made every commit (docs-only
// included) produce different bytes for the same declared version, so the
// package policy's 'unchanged' replay path could never succeed and main went
// red on every post-publish push (run 6: docs-only commit, "This package
// version already contains a different artifact"). The commit stays in the
// pack receipt (artifacts/pack.json) for provenance; it stays out of the
// artifact itself.
const licenses = JSON.parse(await readFile(resolve(root, 'THIRD_PARTY_LICENSES.json'), 'utf8'))
for (const name of ['README.md', 'LICENSE', 'dist', 'LICENSES', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.json']) {
  await cp(resolve(root, name), resolve(stage, name), { recursive: true })
}
await mkdir(resolve(stage, 'scripts'))
await cp(resolve(root, 'scripts/atlas-cli.mjs'), resolve(stage, 'scripts/atlas-cli.mjs'))
await writeFile(resolve(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
// npm tarballs embed per-file mtimes; a fresh CI checkout would otherwise make
// byte-identical content produce a different sha512. Freeze every staged mtime
// to the epoch so packing is deterministic.
async function freezeMtimes(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await freezeMtimes(path)
    await utimes(path, 0, 0)
  }
}
await freezeMtimes(stage)
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], { cwd: stage, encoding: 'utf8' }))
validatePackageFiles(packed.files, licenses)
for (const file of packed.files) assertPublicContent(file.path, await readFile(resolve(stage, file.path), 'utf8'))
const integrity = packageIntegrity(await readFile(resolve(artifacts, packed.filename)))
if (integrity !== packed.integrity) throw new Error('Package integrity disagrees with npm pack')
await writeFile(resolve(artifacts, 'pack.json'), `${JSON.stringify({ filename: packed.filename, name: manifest.name, version: manifest.version, sourceSha, integrity, files: packed.files }, null, 2)}\n`)
await rm(stage, { recursive: true })
console.log(`Verified ${packed.name}@${packed.version}: ${packed.files.length} allowlisted files, ${packed.size} bytes.`)
