import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import test from 'node:test'

test('the actual staged npm artifact carries every original bundled dependency license', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  execFileSync(process.execPath, ['scripts/pack.mjs'], { cwd: root, stdio: 'pipe' })
  const receipt = JSON.parse(readFileSync(resolve(root, 'artifacts/pack.json'), 'utf8'))
  const archive = resolve(root, 'artifacts', receipt.filename)
  const readPacked = name => execFileSync('tar', ['-xOf', archive, 'package/' + name])
  const entries = JSON.parse(readFileSync(resolve(root, 'THIRD_PARTY_LICENSES.json'), 'utf8'))
  assert.ok(entries.length > 0, 'a bundled portable runtime must carry its dependency license inventory')
  assert.deepEqual(readPacked('THIRD_PARTY_LICENSES.json'), readFileSync(resolve(root, 'THIRD_PARTY_LICENSES.json')))
  assert.deepEqual(readPacked('THIRD_PARTY_NOTICES.md'), readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md')))
  for (const entry of entries) {
    assert.ok(entry.files.length > 0)
    for (const license of entry.files) {
      assert.deepEqual(readPacked(license), readFileSync(resolve(root, license)), license + ' must be preserved byte-for-byte')
    }
  }
})
