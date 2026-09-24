import { useEffect, useRef, useState } from 'react'
import { MERMAID_TEMPLATES, exportMermaidSource } from '../../utils/atlasDiagrams.js'
import { renderMermaidSource } from '../../utils/mermaidRuntime.js'
import { editorId } from './editorGraph.js'

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export default function MermaidDiagramPanel({ document: atlas, commit, disabled, scope, onClose }) {
  const diagrams = atlas.diagrams || []
  const [selected, setSelected] = useState(diagrams[0]?.id || '')
  const [template, setTemplate] = useState('sequence')
  const [svg, setSvg] = useState('')
  const [renderedSource, setRenderedSource] = useState('')
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [zoom, setZoom] = useState(1)
  const control = useRef(null)
  const importInput = useRef(null)
  const dialog = useRef(null)
  const item = diagrams.find(candidate => candidate.id === selected) || diagrams[0]
  const itemRef = useRef(item)
  itemRef.current = item
  function update(changes) { commit([{ type: 'diagram.update', id: item.id, changes }]) }
  async function preview() {
    control.current?.abort()
    const current = new AbortController()
    control.current = current
    setSvg('')
    setError('')
    if (!itemRef.current) return
    const source = itemRef.current.source
    setRendering(true)
    try {
      const next = await renderMermaidSource(source, { signal: current.signal })
      if (!current.signal.aborted) { setSvg(next); setRenderedSource(source) }
    } catch (failure) {
      if (!current.signal.aborted) setError(failure.message)
    } finally {
      if (!current.signal.aborted) setRendering(false)
    }
  }
  useEffect(() => { preview(); setZoom(1); return () => control.current?.abort() }, [item?.id])
  useEffect(() => {
    const previous = window.document.activeElement
    dialog.current?.focus()
    return () => previous?.focus?.()
  }, [])
  function trap(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (window.document.activeElement === first || window.document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  async function importSource(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 100000) { setError('Mermaid file exceeds 100000 bytes'); return }
    const id = editorId('diagram')
    const source = await file.text()
    if (commit([{ type: 'diagram.add', diagram: { id, title: file.name.replace(/\.mmd$/i, '') || 'Imported diagram', source, node_id: scope } }])) setSelected(id)
  }
  return <div className="atlas-edit-modal-backdrop atlas-diagrams-backdrop" onKeyDown={trap}>
    <section className="atlas-diagrams" role="dialog" aria-modal="true" aria-labelledby="atlas-diagram-title" tabIndex={-1} ref={dialog}>
      <header><div><h2 id="atlas-diagram-title">Diagram studio</h2><p>Native Mermaid source · separate from the visual architecture graph · included in document saves</p></div><button type="button" onClick={onClose} aria-label="Close diagram studio">Close</button></header>
      <div className="atlas-diagrams-body"><aside aria-label="Diagram library">
        <label>New diagram template<select value={template} onChange={event => setTemplate(event.target.value)}>{MERMAID_TEMPLATES.map(entry => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</select></label>
        <button disabled={disabled || diagrams.length >= 100} onClick={() => {
          const entry = MERMAID_TEMPLATES.find(candidate => candidate.id === template)
          const id = editorId('diagram')
          if (commit([{ type: 'diagram.add', diagram: { id, title: entry.label, source: entry.source, node_id: scope } }])) setSelected(id)
        }}>Add diagram</button>
        <button disabled={disabled || diagrams.length >= 100} onClick={() => importInput.current?.click()}>Import .mmd</button>
        <input hidden ref={importInput} type="file" accept=".mmd,.mermaid,.txt,text/plain" onChange={importSource} />
        <nav>{diagrams.map(entry => <button key={entry.id} aria-pressed={entry.id === item?.id} onClick={() => setSelected(entry.id)}>{entry.title}</button>)}</nav>
        <p>All built-in Mermaid 12 families can be entered as source. Templates are starting points, not a family restriction. External plugins, remote icons and source configuration are not enabled.</p>
      </aside>{item ? <main>
        <div className="atlas-diagram-meta"><label>Diagram title<input aria-label="Diagram title" key={`${item.id}-${item.title}`} defaultValue={item.title} disabled={disabled} maxLength={1000} onBlur={event => { if (event.target.value.trim()) update({ title: event.target.value }); else event.target.value = item.title }} /></label><label>Linked component<select aria-label="Linked component" value={item.node_id || ''} disabled={disabled} onChange={event => update({ node_id: event.target.value || null })}><option value="">Whole document</option>{atlas.model.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label></div>
        <div className="atlas-diagram-actions"><button onClick={preview} disabled={rendering}>{rendering ? 'Rendering…' : 'Preview diagram'}</button><button onClick={() => download(exportMermaidSource(item), `${item.id}.mmd`, 'text/plain')}>Export Mermaid</button><button disabled={!svg || renderedSource !== item.source} onClick={() => download(svg, `${item.id}.svg`, 'image/svg+xml')}>Export SVG</button><button disabled={disabled} onClick={() => { if (window.confirm('Delete this diagram? You can undo this change.')) commit([{ type: 'diagram.remove', id: item.id }]) }}>Delete diagram</button><span>{svg && renderedSource !== item.source ? 'Source changed · preview to refresh' : 'Source is kept in the Atlas document'}</span></div>
        <div className="atlas-diagram-workspace"><label className="atlas-diagram-source">Mermaid source<textarea aria-label="Mermaid source" spellCheck={false} value={item.source} disabled={disabled} maxLength={100000} onChange={event => update({ source: event.target.value })} /></label><div className="atlas-diagram-preview"><div className="atlas-diagram-zoom"><button aria-label="Zoom diagram out" onClick={() => setZoom(value => Math.max(.25, value - .25))}>−</button><button onClick={() => setZoom(1)}>Fit</button><button aria-label="Zoom diagram in" onClick={() => setZoom(value => Math.min(4, value + .25))}>+</button><span>{Math.round(zoom * 100)}%</span></div><div className="atlas-diagram-image" tabIndex={0} aria-label="Diagram preview">{svg ? <img alt={item.title} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} /> : <p>{rendering ? 'Rendering in an isolated sandbox…' : 'Choose Preview diagram to render this source.'}</p>}</div></div></div>
        {error && <pre className="atlas-diagram-error" role="alert">{error}</pre>}
      </main> : <main className="atlas-diagram-empty"><h3>Design beyond boxes and arrows</h3><p>Add sequence diagrams, ER models, state machines, timelines, architecture diagrams and charts without losing their original source.</p></main>}</div>
    </section>
  </div>
}
