import { createRequire } from 'node:module'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createAtlasDocument, applyAtlasOperations, MERMAID_TEMPLATES, createAtlasPortableHtml } from '../dist/core.mjs'
import { script, style } from '../dist/portable.mjs'

const require = createRequire(process.env.ATLAS_PLAYWRIGHT_PACKAGE || import.meta.url)
const { chromium } = require('playwright')
const output = fileURLToPath(new URL('../artifacts/diagram-tests/', import.meta.url))
await mkdir(output, { recursive: true })
let document = createAtlasDocument()
document = applyAtlasOperations(document, { base_revision: 0, operations: MERMAID_TEMPLATES.map(template => ({ type: 'diagram.add', diagram: { id: template.id, title: template.label, source: template.source } })) })
await writeFile(`${output}all-families.html`, createAtlasPortableHtml(document, { script, style }))
const browser = await chromium.connectOverCDP(process.env.ATLAS_CDP_URL || 'http://127.0.0.1:9338')
const context = browser.contexts()[0]
const page = await context.newPage()
const errors = []
const requests = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
await page.setViewportSize({ width: 1450, height: 1000 })
await page.goto(`file://${output}all-families.html`)
async function click(locator) {
  await locator.waitFor({ state: 'visible' })
  const bounds = await locator.boundingBox()
  assert.ok(bounds)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
}
const results = []
try {
  await click(page.getByRole('button', { name: /^Diagram studio/ }))
  for (const entry of MERMAID_TEMPLATES) {
    const button = page.getByRole('navigation').getByRole('button', { name: entry.label, exact: true })
    await button.scrollIntoViewIfNeeded()
    await click(button)
    await page.waitForFunction(() => Boolean(document.querySelector('.atlas-diagram-preview img')) || Boolean(document.querySelector('.atlas-diagram-error')), null, { timeout: 30000 })
    const error = await page.locator('.atlas-diagram-error').count() ? await page.locator('.atlas-diagram-error').textContent() : ''
    const image = page.locator('.atlas-diagram-preview img')
    const valid = !error && await image.evaluate(element => element.complete && element.naturalWidth > 0)
    results.push({ family: entry.id, valid, error })
    console.log(JSON.stringify(results.at(-1)))
  }
  const sourceField = page.getByRole('textbox', { name: 'Mermaid source', exact: true })
  async function sourcePreview(source) {
    await click(sourceField)
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText(source)
    await click(page.getByRole('button', { name: 'Preview diagram', exact: true }))
    await page.waitForFunction(() => Boolean(document.querySelector('.atlas-diagram-preview img')) || Boolean(document.querySelector('.atlas-diagram-error')), null, { timeout: 30000 })
  }
  for (const source of ['%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A --> B', '---\nconfig:\n  securityLevel: loose\n---\nflowchart LR\n A --> B']) {
    await sourcePreview(source)
    assert.match(await page.locator('.atlas-diagram-error').textContent(), /configuration/)
    assert.equal(await sourceField.inputValue(), source)
  }
  await sourcePreview('flowchart LR\n A["<img src=https://atlas-invalid.test/leak onerror=alert(1)>"] --> B\n click B "https://atlas-invalid.test/link"')
  assert.equal(await page.locator('.atlas-diagram-error').count(), 0)
  const safeSvg = await page.locator('.atlas-diagram-preview img').getAttribute('src')
  const xml = decodeURIComponent(safeSvg.slice(safeSvg.indexOf(',') + 1))
  assert.doesNotMatch(xml, /<(?:script|style|image|foreignObject|iframe|a)\b/i)
  assert.doesNotMatch(xml, /\son[a-z]+\s*=|(?:href|xlink:href)="(?!#)/i)
  await sourcePreview(MERMAID_TEMPLATES.find(entry => entry.id === 'sequence').source)
  const savedFile = page.waitForEvent('download')
  await click(page.getByRole('button', { name: 'Close diagram studio' }))
  await click(page.getByRole('button', { name: 'Download editable HTML', exact: true }))
  const download = await savedFile
  await download.saveAs(`${output}edited.html`)
  await page.goto(`file://${output}edited.html`)
  await click(page.getByRole('button', { name: /^Diagram studio/ }))
  const lastDiagram = page.getByRole('navigation').getByRole('button', { name: 'Treemap', exact: true })
  await lastDiagram.scrollIntoViewIfNeeded()
  await click(lastDiagram)
  assert.equal(await page.getByRole('textbox', { name: 'Mermaid source', exact: true }).inputValue(), MERMAID_TEMPLATES.find(entry => entry.id === 'sequence').source)
  await page.waitForFunction(() => Boolean(document.querySelector('.atlas-diagram-preview img')), null, { timeout: 30000 })
  await page.screenshot({ path: `${output}studio.png`, fullPage: true })
  await writeFile(`${output}receipt.json`, JSON.stringify({ results, errors, requests }, null, 2))
  console.log(JSON.stringify({ results, errors, requests }))
  assert.equal(results.filter(result => !result.valid).length, 0, 'Every bundled template must render')
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, [])
} finally {
  await page.close()
  await browser.close()
}
