import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageIntegrity, publishedVersionDecision, validatePackageFiles, validateRegistry } from './package-policy.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const registry = validateRegistry(process.env.VERDACCIO_REGISTRY)
const token = process.env.VERDACCIO_TOKEN
if (!token || /[\r\n]/.test(token)) throw new Error('The internal publisher credential is missing or invalid')
if (process.env.GITHUB_REF !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('Publication requires an exact main-branch CI commit')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
if (commit !== process.env.GITHUB_SHA) throw new Error('The checked-out commit does not match the CI event')
execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { cwd: root, stdio: 'pipe' })
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const receipt = JSON.parse(await readFile(resolve(root, 'artifacts/pack.json'), 'utf8'))
if (manifest.name !== '@shizuha/atlas' || manifest.name !== receipt.name || manifest.version !== receipt.version || basename(receipt.filename) !== receipt.filename || !receipt.filename.endsWith('.tgz')) throw new Error('Package receipt identity is invalid')
if (receipt.sourceSha !== commit) throw new Error('The package was not packed from this CI commit')
validatePackageFiles(receipt.files)
const tarball = resolve(root, 'artifacts', receipt.filename)
const integrity = packageIntegrity(await readFile(tarball))
if (integrity !== receipt.integrity) throw new Error('The verified package artifact changed')

async function readPublishedVersion() {
  const address = new URL(`${encodeURIComponent(manifest.name)}/${manifest.version}`, registry)
  const response = await fetch(address, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Registry metadata request failed: HTTP ${response.status}`)
  return response.json()
}

const decision = publishedVersionDecision(await readPublishedVersion(), manifest, integrity)
if (decision === 'unchanged') {
  console.log(`Verified replay: ${manifest.name}@${manifest.version} already has the exact artifact.`)
} else {
  const temporary = await mkdtemp(join(tmpdir(), 'atlas-publish-'))
  try {
    const npmrc = join(temporary, 'npmrc')
    await writeFile(npmrc, `registry=${registry}\n//${new URL(registry).host}/:_authToken=${token}\n`, { mode: 0o600 })
    const env = { ...process.env, NPM_CONFIG_USERCONFIG: npmrc }
    delete env.VERDACCIO_TOKEN
    execFileSync('npm', ['publish', tarball, '--ignore-scripts', '--registry', registry], { cwd: root, env, stdio: 'inherit', timeout: 120000 })
    if (publishedVersionDecision(await readPublishedVersion(), manifest, integrity) !== 'unchanged') throw new Error('Published artifact could not be verified')
    console.log(`Published and verified ${manifest.name}@${manifest.version} from ${commit}.`)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
