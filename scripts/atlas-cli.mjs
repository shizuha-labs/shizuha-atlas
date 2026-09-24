#!/usr/bin/env node
import { open, readFile, lstat, realpath, link, rename, unlink } from 'node:fs/promises'
import { dirname, basename, resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createAtlasDocument, parseAtlasDocument, serializeAtlasDocument, applyAtlasOperations } from '../dist/core.mjs'

const help = `Shizuha Atlas — offline document tools

  atlas validate DOCUMENT
  atlas apply DOCUMENT OPERATIONS --output NEW_FILE
  atlas apply DOCUMENT OPERATIONS --in-place --expected-revision N
  atlas schema
  atlas example

OPERATIONS is JSON: {"base_revision":0,"operations":[...]}
Existing output files are never replaced without --in-place and a revision guard.
Use the same lock/CAS protocol for all writers; host storage needs its own CAS.
`

async function canonicalFile(path) {
  const absolute = resolve(path)
  return join(await realpath(dirname(absolute)), basename(absolute))
}

async function regularFile(path, optional = false) {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular, non-symlink file: ' + path)
    return stat
  } catch (error) {
    if (optional && error.code === 'ENOENT') return null
    throw error
  }
}

async function apply(argumentsList) {
  const [inputArgument, operationsArgument, ...options] = argumentsList
  if (!inputArgument || !operationsArgument) throw new Error('apply requires document and operations files')
  let outputArgument
  let inPlace = false
  let expectedRevision
  const seen = new Set()
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index]
    if (seen.has(option)) throw new Error('Duplicate option: ' + option)
    seen.add(option)
    if (option === '--in-place') inPlace = true
    else if (option === '--output') {
      outputArgument = options[++index]
      if (!outputArgument || outputArgument.startsWith('--')) throw new Error('--output requires a path')
    } else if (option === '--expected-revision') {
      const value = options[++index]
      if (!value || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--expected-revision requires a non-negative safe integer')
      expectedRevision = Number(value)
    } else throw new Error('Unknown option: ' + option)
  }
  if (inPlace ? outputArgument || expectedRevision === undefined : !outputArgument || expectedRevision !== undefined) throw new Error('Use --output NEW_FILE or --in-place --expected-revision N')
  const input = await canonicalFile(inputArgument)
  const output = inPlace ? input : await canonicalFile(outputArgument)
  if (!inPlace && input === output) throw new Error('Input overwrite requires --in-place --expected-revision N')
  await regularFile(input)
  const lockPath = output + '.atlas-lock'
  let lock
  let temporary
  try {
    lock = await open(lockPath, 'wx', 0o600)
    await lock.writeFile(JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }) + '\n')
    if (!inPlace && await regularFile(output, true)) throw new Error('Output already exists; refusing to replace it')
    await regularFile(input)
    const original = await readFile(input, 'utf8')
    const document = parseAtlasDocument(original)
    if (inPlace && document.revision !== expectedRevision) throw new Error('Revision conflict: input no longer matches --expected-revision')
    const envelope = JSON.parse(await readFile(operationsArgument, 'utf8'))
    const next = applyAtlasOperations(document, envelope)
    temporary = join(dirname(output), '.' + basename(output) + '.' + randomUUID() + '.tmp')
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(serializeAtlasDocument(next) + '\n')
      await handle.sync()
    } finally { await handle.close() }
    await regularFile(input)
    if (await readFile(input, 'utf8') !== original) throw new Error('Input changed while applying operations; refusing to write')
    if (inPlace) await rename(temporary, output)
    else await link(temporary, output)
    const directory = await open(dirname(output), 'r')
    try { await directory.sync() } finally { await directory.close() }
    process.stdout.write(JSON.stringify({ output, revision: next.revision }) + '\n')
  } finally {
    if (temporary) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (lock) {
      await lock.close()
      await unlink(lockPath)
    }
  }
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Shizuha Atlas version 1 document envelope',
  description: 'Structural interchange envelope only. atlas validate is authoritative for graph references, cycles, safe URLs, JSON safety and bounds.',
  type: 'object', required: ['format', 'version', 'revision', 'model', 'layout', 'views'],
  properties: {
    format: { const: 'shizuha-atlas' }, version: { const: 1 },
    revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    model: { type: 'object', required: ['schema_version', 'nodes', 'edges', 'flows'], properties: { schema_version: { const: 1 }, nodes: { type: 'array' }, edges: { type: 'array' }, flows: { type: 'array' } } },
    layout: {
      type: 'object', required: ['positions'],
      properties: {
        positions: {
          type: 'object',
          additionalProperties: {
            type: 'object', required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
        },
      },
    },
    views: { type: 'array' },
    diagrams: {
      type: 'array', maxItems: 100,
      items: {
        type: 'object', required: ['id', 'title', 'source'],
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' },
          title: { type: 'string', minLength: 1, maxLength: 1000 },
          source: { type: 'string', maxLength: 100000 },
          node_id: { type: ['string', 'null'] },
        },
      },
    },
  },
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2)
  if (!command || ['help', '--help', '-h'].includes(command)) return process.stdout.write(help)
  if (command === 'apply') return apply(argumentsList)
  if (command === 'validate') {
    if (argumentsList.length !== 1) throw new Error('validate requires exactly one document file')
    const document = parseAtlasDocument(await readFile(argumentsList[0], 'utf8'))
    return process.stdout.write(JSON.stringify({ valid: true, format: document.format, version: document.version, revision: document.revision, nodes: document.model.nodes.length, edges: document.model.edges.length }) + '\n')
  }
  if (argumentsList.length) throw new Error('Unexpected arguments')
  if (command === 'schema') return process.stdout.write(JSON.stringify(schema, null, 2) + '\n')
  if (command === 'example') return process.stdout.write(serializeAtlasDocument(createAtlasDocument()) + '\n')
  throw new Error('Unknown command: ' + command)
}

main().catch(error => {
  process.stderr.write('atlas: ' + error.message + '\n')
  process.exitCode = 1
})
