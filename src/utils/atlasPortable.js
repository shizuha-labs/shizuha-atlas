import { applyAtlasOperations, parseAtlasDocument, serializeAtlasDocument } from './atlasDocument.js'

const CHANNEL = 'shizuha-atlas.v1'
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024

function documentCopy(document) {
  return parseAtlasDocument(serializeAtlasDocument(document))
}

export function encodeAtlasDocument(document) {
  return serializeAtlasDocument(documentCopy(document))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function importAtlasCodeBlock(text) {
  if (typeof text !== 'string' || text.length > MAX_MESSAGE_BYTES) throw new Error('Atlas code block is too large or is not text')
  const match = text.match(/^\s*```(?:atlas|shizuha-atlas)[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/)
  if (!match) throw new Error('Expected exactly one fenced atlas JSON code block')
  const envelope = JSON.parse(match[1])
  if (envelope?.format !== 'shizuha-atlas' || envelope.version !== 1) throw new Error('Expected a version 1 Shizuha Atlas document')
  return parseAtlasDocument(match[1])
}

export function exportAtlasCodeBlock(document) {
  return `\`\`\`atlas\n${encodeAtlasDocument(document).replace(/`/g, '\\u0060')}\n\`\`\`\n`
}

function htmlText(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

export function createAtlasPortableHtml(document, { script, style = '', title = 'Shizuha Atlas' } = {}) {
  if (typeof script !== 'string' || !script.trim()) throw new Error('A trusted, self-contained Atlas runtime bundle is required')
  if (typeof style !== 'string') throw new Error('Atlas styles must be a string')
  const payload = encodeAtlasDocument(document)
  const runtime = script.replace(/<\/script/gi, '<\\/script')
  const styles = style.replace(/<\/style/gi, '<\\/style')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>${htmlText(title)}</title><style id="atlas-style">${styles}</style></head>
<body><div id="root"></div><script id="atlas-document" type="application/json">${payload}</script><script id="atlas-runtime">${runtime}</script></body></html>`
}

function exactOrigin(origin) {
  let parsed
  try { parsed = new URL(origin) } catch { throw new Error('An explicit HTTP(S) host origin is required') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
    throw new Error('Host origin must be an exact HTTP(S) origin, not a wildcard, opaque origin or URL path')
  }
  return parsed.origin
}

export function createAtlasEmbedAdapter({ window: localWindow, hostWindow, origin, nonce, getDocument, onLoad, onSaveAck, onError } = {}) {
  const trustedOrigin = exactOrigin(origin)
  if (!localWindow?.addEventListener || !localWindow?.removeEventListener || !hostWindow?.postMessage || hostWindow === localWindow) throw new Error('Explicit local and host windows are required')
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) throw new Error('Use an unpredictable nonce of 16–128 URL-safe characters')
  if (typeof getDocument !== 'function' || typeof onLoad !== 'function') throw new Error('getDocument and onLoad callbacks are required')
  let disposed = false
  let sequence = 0
  let pendingSave = null
  let queue = Promise.resolve()
  let queued = 0
  let publishedRevision = documentCopy(getDocument()).revision
  const received = new Set()

  function send(type, payload = {}, requestId) {
    if (disposed) throw new Error('Atlas embed adapter is disposed')
    const message = { channel: CHANNEL, type, nonce, request_id: requestId || `atlas-${++sequence}`, ...payload }
    hostWindow.postMessage(message, trustedOrigin)
    return message.request_id
  }

  function report(error, requestId) {
    if (disposed) return
    try { send('atlas:error', { message: error instanceof Error ? error.message : 'Atlas host operation failed' }, requestId) } catch {}
    if (onError) {
      try { onError(error) } catch { return }
    }
  }

  async function receive(message) {
    if (disposed) return
    if (message.type === 'atlas:saved' || message.type === 'atlas:save-error') {
      if (!pendingSave || message.request_id !== pendingSave.requestId || message.revision !== pendingSave.document.revision) throw new Error('Save acknowledgement does not match the pending document revision')
      const saved = pendingSave.document
      pendingSave = null
      if (message.type === 'atlas:save-error') throw new Error('Host rejected the Atlas save; reload or retry after resolving the conflict')
      await onSaveAck?.({ revision: saved.revision, document: documentCopy(saved) })
      return
    }
    const current = documentCopy(getDocument())
    if (!Number.isSafeInteger(message.base_revision) || message.base_revision !== current.revision) throw new Error('Atlas revision conflict: reload before changing this document')
    if (pendingSave) throw new Error('Wait for the pending save acknowledgement before loading host changes')
    const next = message.type === 'atlas:load'
      ? documentCopy(message.document)
      : applyAtlasOperations(current, { base_revision: message.base_revision, operations: message.operations })
    if (next.revision < current.revision) throw new Error('A host load cannot roll back the document revision')
    const applied = onLoad(documentCopy(next))
    if (applied?.then || serializeAtlasDocument(getDocument()) !== serializeAtlasDocument(next)) throw new Error('onLoad must synchronously install the validated document')
    if (disposed) return
    publishedRevision = next.revision
    send('atlas:loaded', { revision: next.revision }, message.request_id)
  }

  function listener(event) {
    if (disposed || event.source !== hostWindow || event.origin !== trustedOrigin) return
    const message = event.data
    if (!message || message.channel !== CHANNEL || message.nonce !== nonce) return
    if (!['atlas:load', 'atlas:change', 'atlas:saved', 'atlas:save-error'].includes(message.type)) return
    if (typeof message.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(message.request_id)) return
    const acknowledgement = message.type === 'atlas:saved' || message.type === 'atlas:save-error'
    if (!acknowledgement && received.has(message.request_id)) return
    try {
      if (JSON.stringify(message).length > MAX_MESSAGE_BYTES) throw new Error('Atlas host message is too large')
      if (received.size >= 4096) throw new Error('Atlas embed session exhausted; reconnect with a fresh nonce')
      if (queued >= 32) throw new Error('Atlas host message queue is full')
      if (!acknowledgement) received.add(message.request_id)
      queued += 1
      queue = queue.then(() => receive(message)).catch(error => report(error, message.request_id)).finally(() => { queued -= 1 })
    } catch (error) { report(error, message.request_id) }
  }

  localWindow.addEventListener('message', listener)
  return {
    notifyChange() {
      const document = documentCopy(getDocument())
      if (document.revision <= publishedRevision) throw new Error('Changed documents must advance the revision')
      const requestId = send('atlas:change', { base_revision: publishedRevision, revision: document.revision, document })
      publishedRevision = document.revision
      return requestId
    },
    requestSave() {
      if (pendingSave) throw new Error('An Atlas save is already pending')
      const document = documentCopy(getDocument())
      const requestId = `atlas-${++sequence}`
      pendingSave = { requestId, document }
      try { send('atlas:save', { revision: document.revision, document }, requestId) } catch (error) { pendingSave = null; throw error }
      return requestId
    },
    dispose() {
      disposed = true
      pendingSave = null
      localWindow.removeEventListener('message', listener)
    },
  }
}
