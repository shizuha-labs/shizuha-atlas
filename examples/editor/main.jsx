import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AtlasEditor, AtlasExplorer, createAtlasPortableHtml, parseAtlasDocument } from '../../src/index.jsx'
import '@xyflow/react/dist/style.css'
import '../../src/atlas.css'
import '../../src/editor.css'
import './standalone.css'

function OfflineEditor({ initial }) {
  const [document, setDocument] = useState(initial)
  const [preview, setPreview] = useState(false)
  const latest = useRef(initial)
  const [notice, setNotice] = useState('Changes stay in this tab until you download a file. Downloaded files contain the complete graph; share them only with trusted recipients.')
  function change(next) {
    latest.current = next
    setDocument(next)
  }
  function save(next = latest.current) {
    const html = createAtlasPortableHtml(next, {
      script: window.document.getElementById('atlas-runtime').textContent,
      style: window.document.getElementById('atlas-style').textContent,
      title: next.model.title,
    })
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `${next.model.id.replace(/[^a-zA-Z0-9_-]/g, '-')}.atlas.html`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    setNotice('Downloaded a self-contained editable HTML file. Open that file to resume, even without internet.')
  }
  return <main className="atlas-offline-shell">
    <header className="atlas-offline-header">
      <div><strong>Shizuha Atlas · Offline design studio</strong><p role="status">{notice}</p></div>
      <button type="button" onClick={() => setPreview(!preview)}>{preview ? 'Edit design' : 'Explore design'}</button>
      <button type="button" onClick={() => save()}>Download editable HTML</button>
    </header>
    {preview && <MemoryRouter><AtlasExplorer model={document.model} backLabel="Design overview" /></MemoryRouter>}
    <div hidden={preview}><AtlasEditor document={document} onChange={change} onSave={save} /></div>
  </main>
}

const root = createRoot(document.getElementById('root'))
try {
  const initial = parseAtlasDocument(document.getElementById('atlas-document').textContent)
  root.render(<OfflineEditor initial={initial} />)
} catch (error) {
  root.render(<main><h1>This Atlas document could not be opened</h1><p>{error.message}</p><p>The original file has not been modified.</p></main>)
}
