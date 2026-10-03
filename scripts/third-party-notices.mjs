import { readdir, readFile, mkdir, writeFile, copyFile, stat, rm } from 'node:fs/promises'
import { resolve, dirname, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function writeThirdPartyNotices(root, inputs) {
  // This directory is generated output. Do not retain notices for dependencies
  // removed from a later build; the pack gate requires the exact current graph.
  await rm(resolve(root, 'LICENSES'), { recursive: true, force: true })
  const packages = new Map()
  for (const input of inputs) {
    if (!input.replaceAll('\\', '/').includes('node_modules/')) continue
    let current = dirname(resolve(root, input))
    while (current.startsWith(root) && current !== root) {
      try {
        const metadata = JSON.parse(await readFile(resolve(current, 'package.json'), 'utf8'))
        if (metadata.name && metadata.version) {
          packages.set(current, metadata)
          break
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      current = dirname(current)
    }
  }
  const entries = []
  for (const [directory, metadata] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const files = (await readdir(directory)).filter(name => /^(licen[sc]e|copying|notice)([._-]|$)/i.test(name))
    const licenseFiles = []
    for (const name of files) {
      const source = resolve(directory, name)
      if (!(await stat(source)).isFile()) continue
      const targetDirectory = resolve(root, 'LICENSES', metadata.name.replaceAll('/', '__') + '-' + metadata.version)
      await mkdir(targetDirectory, { recursive: true })
      await copyFile(source, resolve(targetDirectory, name))
      licenseFiles.push(relative(root, resolve(targetDirectory, name)))
    }
    if (!licenseFiles.length) throw new Error(`Bundled dependency ${metadata.name}@${metadata.version} has no installed license/notice file`)
    entries.push({ name: metadata.name, version: metadata.version, license: metadata.license ?? null, files: licenseFiles })
  }
  await writeFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), '# Third-party notices\n\nGenerated from the actual bundled module graph. Original installed dependency\nlicense and notice files are copied without modification under LICENSES/.\nDependencies externalized from these bundles remain separately distributed.\n\n' + entries.map(entry => `- ${entry.name}@${entry.version} (${typeof entry.license === 'string' ? entry.license : 'see upstream license files'}): ${entry.files.map(file => `[${basename(file)}](${file})`).join(', ')}`).join('\n') + '\n')
  await writeFile(resolve(root, 'THIRD_PARTY_LICENSES.json'), JSON.stringify(entries, null, 2) + '\n')
  console.log(`Preserved original licenses for ${entries.length} bundled dependencies`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.cwd())
  const inputs = new Set()
  for (const name of await readdir(resolve(root, 'dist'))) {
    if (!name.endsWith('.map')) continue
    const map = JSON.parse(await readFile(resolve(root, 'dist', name), 'utf8'))
    for (const source of map.sources ?? []) inputs.add(relative(root, resolve(root, 'dist', map.sourceRoot ?? '', source)))
  }
  await writeThirdPartyNotices(root, inputs)
}
