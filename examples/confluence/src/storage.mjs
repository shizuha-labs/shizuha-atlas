import { parseAtlasDocument, serializeAtlasDocument } from '@shizuha/atlas/core'

const MAX_BYTES = 8 * 1024 * 1024
const keyPattern = /^shizuha-atlas:[0-9a-f-]{36}$/

function identifier(value) {
  if (!/^[0-9]+$/.test(String(value))) throw new Error('A published Confluence page or attachment ID is required')
  return String(value)
}

function keyValue(key) {
  if (typeof key !== 'string' || !keyPattern.test(key)) throw new Error('Invalid Atlas property key')
  return key
}

async function digest(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function checked(response, action) {
  if (!response.ok) {
    const error = new Error(`${action} failed (HTTP ${response.status}). Check page permissions or reload after a concurrent edit; local edits are retained.`)
    error.status = response.status
    throw error
  }
  return response
}

function descriptor(property, key) {
  if (property.key !== key || !Number.isSafeInteger(property.version?.number) || property.version.number < 1) throw new Error('Invalid Confluence property response')
  const value = property.value
  if (value?.format !== 'shizuha-atlas-attachment' || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_BYTES) throw new Error('Invalid Atlas attachment index')
  identifier(property.id)
  identifier(value.attachment_id)
  return property
}

export function createConfluenceStore({ requestConfluence, pageId }) {
  const page = identifier(pageId)
  const properties = `/wiki/api/v2/pages/${page}/properties`
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' }

  async function index(key) {
    keyValue(key)
    const response = await checked(await requestConfluence(`${properties}?key=${encodeURIComponent(key)}&limit=2`), 'Read Atlas index')
    const data = await response.json()
    if (!Array.isArray(data.results) || data.results.length > 1) throw new Error('Ambiguous Atlas property index')
    if (!data.results.length) return null
    return descriptor(data.results[0], key)
  }

  async function load(key) {
    const property = await index(key)
    if (!property) throw new Error('Atlas document is missing; do not replace it with a blank graph')
    const attachment = identifier(property.value.attachment_id)
    const response = await checked(await requestConfluence(`/wiki/rest/api/content/${page}/child/attachment/${attachment}/download`), 'Read Atlas attachment')
    const content = await response.text()
    const bytes = new TextEncoder().encode(content).byteLength
    if (bytes !== property.value.bytes || bytes > MAX_BYTES || await digest(content) !== property.value.sha256) throw new Error('Atlas attachment integrity check failed')
    const document = parseAtlasDocument(content)
    if (document.revision !== property.value.revision) throw new Error('Atlas document revision does not match its index')
    return { key, property, document }
  }

  async function save({ key, baseline, document }) {
    keyValue(key)
    const content = serializeAtlasDocument(document)
    const bytes = new TextEncoder().encode(content).byteLength
    if (bytes > MAX_BYTES) throw new Error('Atlas attachment exceeds the 8 MiB document limit')
    const current = await index(key)
    if (baseline ? !current || current.id !== baseline.property.id || current.version.number !== baseline.property.version.number || current.value.sha256 !== baseline.property.value.sha256 : current !== null) throw new Error('Revision conflict: reload before saving this Atlas document')
    if (baseline && document.revision < baseline.document.revision) throw new Error('Atlas revision cannot move backwards')
    if (baseline && content === serializeAtlasDocument(baseline.document)) return baseline
    if (baseline && document.revision === baseline.document.revision) throw new Error('Changed content must advance the Atlas revision')
    const checksum = await digest(content)
    const filename = `shizuha-atlas-${key.slice(14)}-${crypto.randomUUID()}.atlas.json`
    const form = new FormData()
    form.append('file', new Blob([content], { type: 'application/json' }), filename)
    form.append('minorEdit', 'true')
    let uploaded
    try {
      const upload = await checked(await requestConfluence(`/wiki/rest/api/content/${page}/child/attachment`, { method: 'POST', headers: { Accept: 'application/json', 'X-Atlassian-Token': 'nocheck' }, body: form }), 'Upload Atlas attachment')
      uploaded = (await upload.json()).results?.[0]
    } catch (error) {
      throw new Error(`${error.message} Inspect page attachments for ${filename} before retrying an interrupted upload.`)
    }
    if (!uploaded || uploaded.title !== filename || uploaded.version?.number !== 1) throw new Error(`Unexpected upload response; inspect page attachments for ${filename} before retrying`)
    const attachment = identifier(uploaded.id)
    const value = { format: 'shizuha-atlas-attachment', version: 1, revision: document.revision, attachment_id: attachment, sha256: checksum, bytes }
    try {
      const payload = { key, value, ...(current ? { version: { number: current.version.number + 1, message: 'Atlas document revision ' + document.revision } } : {}) }
      const response = await checked(await requestConfluence(current ? `${properties}/${identifier(current.id)}` : properties, { method: current ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) }), 'Commit Atlas index')
      const property = descriptor(await response.json(), key)
      if (property.value.attachment_id !== attachment || property.value.sha256 !== checksum) throw new Error('Atlas commit acknowledgement does not match the uploaded document')
      return { key, property, document: parseAtlasDocument(content) }
    } catch (error) {
      let observed
      try { observed = await index(key) } catch {
        throw new Error(`${error.message} Commit outcome is unknown; preserve attachment ${attachment} (${filename}) and reload before retrying.`)
      }
      if (observed?.value.attachment_id === attachment && observed.value.sha256 === checksum) return { key, property: observed, document: parseAtlasDocument(content) }
      if (![400, 403, 404, 409, 412].includes(error.status)) throw new Error(`${error.message} Commit outcome is uncertain; preserve staged attachment ${attachment} (${filename}) and reload before retrying.`)
      try {
        await checked(await requestConfluence(`/wiki/api/v2/attachments/${attachment}`, { method: 'DELETE' }), 'Clean up unpublished Atlas attachment')
      } catch {
        throw new Error(`${error.message} Unpublished attachment ${attachment} (${filename}) remains; inspect it before cleanup.`)
      }
      throw error
    }
  }

  return { load, save }
}
