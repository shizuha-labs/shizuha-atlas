import { validateAtlasDocument } from './atlasDocument.js'

const ABSENT = Symbol('absent')
const ENTITY_ARRAYS = new Set(['/model/nodes', '/model/edges', '/model/flows', '/views', '/diagrams'])
const pointer = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1')
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && value !== ABSENT
const copy = value => value === ABSENT ? ABSENT : JSON.parse(JSON.stringify(value))

function equal(left, right) {
  if (left === right) return true
  if (left === ABSENT || right === ABSENT || typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]))
  if (!plain(left) || !plain(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]))
}

export function mergeAtlasDocuments({ base, local, remote } = {}) {
  const conflicts = []
  for (const [name, document] of Object.entries({ base, local, remote })) {
    try { validateAtlasDocument(document) }
    catch (error) { conflicts.push({ path: `/${name}`, kind: 'invalid_document', message: error.message }) }
  }
  if (conflicts.length) return { document: null, conflicts }
  if (base.model.id !== local.model.id || base.model.id !== remote.model.id) return { document: null, conflicts: [{ path: '/model/id', kind: 'identity', message: 'Three-way merge requires the same document identity' }] }
  const revision = Math.max(local.revision, remote.revision) + 1
  if (local.revision < base.revision || remote.revision < base.revision || !Number.isSafeInteger(revision)) return { document: null, conflicts: [{ path: '/revision', kind: 'revision', message: 'Branches must not predate their base, and the merged revision must be a safe integer' }] }

  function conflict(path, kind, original, ours, theirs) {
    const entry = { path: path || '/', kind, message: kind === 'delete_edit' ? 'One writer deleted an item changed by the other writer' : kind === 'concurrent_add' ? 'Writers added different items with the same ID' : 'Writers changed the same field differently' }
    for (const [key, value] of Object.entries({ base: original, local: ours, remote: theirs })) if (value !== ABSENT) entry[key] = copy(value)
    conflicts.push(entry)
    return ABSENT
  }

  function merge(original, ours, theirs, path) {
    if (equal(ours, theirs)) return copy(ours)
    if (equal(ours, original)) return copy(theirs)
    if (equal(theirs, original)) return copy(ours)
    if (ENTITY_ARRAYS.has(path) && Array.isArray(ours) && Array.isArray(theirs) && (Array.isArray(original) || original === ABSENT)) {
      const before = new Map((original === ABSENT ? [] : original).map(item => [item.id, item]))
      const mine = new Map(ours.map(item => [item.id, item]))
      const latest = new Map(theirs.map(item => [item.id, item]))
      const order = [...new Set([...latest.keys(), ...mine.keys(), ...before.keys()])]
      const merged = []
      for (const id of order) {
        const ancestor = before.has(id) ? before.get(id) : ABSENT
        const oursItem = mine.has(id) ? mine.get(id) : ABSENT
        const theirsItem = latest.has(id) ? latest.get(id) : ABSENT
        const result = ancestor === ABSENT && oursItem !== ABSENT && theirsItem !== ABSENT && !equal(oursItem, theirsItem)
          ? conflict(`${path}/${pointer(id)}`, 'concurrent_add', ancestor, oursItem, theirsItem)
          : merge(ancestor, oursItem, theirsItem, `${path}/${pointer(id)}`)
        if (result !== ABSENT) merged.push(result)
      }
      return merged
    }
    if (ours === ABSENT || theirs === ABSENT) return conflict(path, 'delete_edit', original, ours, theirs)
    if (plain(ours) && plain(theirs) && (plain(original) || original === ABSENT)) {
      const merged = {}
      const baseline = original === ABSENT ? {} : original
      for (const key of new Set([...Object.keys(baseline), ...Object.keys(ours), ...Object.keys(theirs)])) {
        const result = merge(Object.hasOwn(baseline, key) ? baseline[key] : ABSENT, Object.hasOwn(ours, key) ? ours[key] : ABSENT, Object.hasOwn(theirs, key) ? theirs[key] : ABSENT, `${path}/${pointer(key)}`)
        if (result !== ABSENT) merged[key] = result
      }
      return merged
    }
    return conflict(path, 'field', original, ours, theirs)
  }

  const clean = document => {
    const cloned = copy(document)
    delete cloned.revision
    delete cloned.model.model_revision
    delete cloned.model.updated_at
    return cloned
  }
  const merged = merge(clean(base), clean(local), clean(remote), '')
  if (conflicts.length) return { document: null, conflicts }
  merged.revision = revision
  merged.model.model_revision = String(revision)
  merged.model.updated_at = new Date().toISOString()
  try { validateAtlasDocument(merged) }
  catch (error) { return { document: null, conflicts: [{ path: '/', kind: 'invalid_merge', message: error.message }] } }
  return { document: merged, conflicts: [] }
}
