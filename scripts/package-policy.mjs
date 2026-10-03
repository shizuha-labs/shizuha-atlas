import { createHash } from 'node:crypto'

const privatePatterns = [
  /(?:https?:\/\/|["'\s])[^\s"']*\.svc\.cluster\.local\b/i,
  /https?:\/\/(?:[^/\s]+\.)?shizuha\.com\b/i,
  /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i,
  /\b(?:gx10|gx11|gx12)-\d+\b/i,
  /atlas_catalog\.json|(?:auth|access|refresh)[_-]tokens?\.json/i,
  /\bBearer\s+[A-Za-z0-9._~-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]

export function assertPublicContent(name, content) {
  if (privatePatterns.some(pattern => pattern.test(content))) throw new Error(`Private content is forbidden in ${name}`)
}

export function validatePackageFiles(files, licenses) {
  const required = new Set(['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.json', 'dist/index.mjs', 'dist/index.cjs', 'dist/index.d.ts', 'dist/core.mjs', 'dist/core.cjs', 'dist/core.d.ts', 'dist/atlas.css', 'dist/portable.mjs', 'dist/portable.d.ts', 'scripts/atlas-cli.mjs'])
  if (!Array.isArray(licenses) || licenses.length === 0) throw new Error('A bundled dependency license inventory is required')
  for (const entry of licenses) {
    if (!Array.isArray(entry.files) || entry.files.length === 0) throw new Error('Each bundled dependency needs an original license file')
    for (const name of entry.files) {
      if (typeof name !== 'string' || !/^LICENSES\/[A-Za-z0-9@_+.-]+\/[A-Za-z0-9_+.-]+$/.test(name)
          || name.split('/').some(part => part === '.' || part === '..') || required.has(name)) {
        throw new Error('Invalid or duplicate bundled dependency license path')
      }
      required.add(name)
    }
  }
  const bundledDiagramRuntimes = new Set(['dist/index.mjs', 'dist/index.cjs', 'dist/portable.mjs'])
  for (const file of files) {
    if (!required.delete(file.path)) throw new Error(`Unexpected package file: ${file.path}`)
    const maximum = (bundledDiagramRuntimes.has(file.path) ? 8 : 4) * 1024 * 1024
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maximum) throw new Error(`Invalid package file size: ${file.path}`)
  }
  if (required.size) throw new Error(`Missing package files: ${[...required].join(', ')}`)
}

export function validateRegistry(value) {
  let registry
  try { registry = new URL(value) } catch { throw new Error('A valid internal registry URL is required') }
  if (!['http:', 'https:'].includes(registry.protocol) || registry.hostname !== 'npm-cache.registry.svc.cluster.local' || registry.port !== '4873' || registry.username || registry.password || registry.pathname !== '/' || registry.search || registry.hash) {
    throw new Error('Publication is restricted to the approved internal registry')
  }
  return registry.href
}

export function packageIntegrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

export function publishedVersionDecision(metadata, manifest, integrity) {
  if (metadata === null) return 'publish'
  if (metadata.name !== manifest.name || metadata.version !== manifest.version) throw new Error('Registry returned unexpected package identity')
  if (metadata.dist?.integrity === integrity) return 'unchanged'
  throw new Error('This package version already contains a different artifact; bump the version')
}
