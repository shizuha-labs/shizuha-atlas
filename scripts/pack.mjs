import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
if (sourceSha) manifest.gitHead = sourceSha
const licenses = JSON.parse(await readFile(resolve(root, 'THIRD_PARTY_LICENSES.json'), 'utf8'))
for (const name of ['README.md', 'LICENSE', 'dist', 'LICENSES', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.json']) {
  await cp(resolve(root, name), resolve(stage, name), { recursive: true })
}
await mkdir(resolve(stage, 'scripts'))
await cp(resolve(root, 'scripts/atlas-cli.mjs'), resolve(stage, 'scripts/atlas-cli.mjs'))
await writeFile(resolve(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], { cwd: stage, encoding: 'utf8' }))
validatePackageFiles(packed.files, licenses)
for (const file of packed.files) assertPublicContent(file.path, await readFile(resolve(stage, file.path), 'utf8'))
const integrity = packageIntegrity(await readFile(resolve(artifacts, packed.filename)))
if (integrity !== packed.integrity) throw new Error('Package integrity disagrees with npm pack')
await writeFile(resolve(artifacts, 'pack.json'), `${JSON.stringify({ filename: packed.filename, name: manifest.name, version: manifest.version, sourceSha, integrity, files: packed.files }, null, 2)}\n`)
await rm(stage, { recursive: true })
console.log(`Verified ${packed.name}@${packed.version}: ${packed.files.length} allowlisted files, ${packed.size} bytes.`)
