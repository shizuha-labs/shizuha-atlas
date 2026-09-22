import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, MarkerType, useReactFlow } from '@xyflow/react'
import { Plus, Save, Download, Upload, Undo2, Redo2, Copy, ClipboardPaste, Trash2, Search, LayoutGrid, Maximize, ChevronRight, Layers, X, ArrowRight, MousePointer2, HelpCircle as CircleHelp } from 'lucide-react'
import { createAtlasHistory, commitAtlasHistory, undoAtlasHistory, redoAtlasHistory, parseAtlasDocument, serializeAtlasDocument } from '../../utils/atlasDocument.js'
import { NODE_KINDS, EDGE_KINDS, editorId, descendantIds, scopedNodes, automaticPositions, copySelection, pasteOperations, isTypingTarget, installAtlasLeaveGuard } from './editorGraph.js'
import DocumentLibrary, { SourcesEditor } from './DocumentLibrary.jsx'

function EditorNode({ data, selected }) {
  return <div className={`atlas-edit-node ${selected ? 'is-selected' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <div className="atlas-edit-node-kind"><Layers size={12} />{data.kind}<span>{data.childCount ? `${data.childCount} inside` : ''}</span></div>
    <strong>{data.label}</strong><p>{data.description || 'Add a description in the inspector'}</p>
    {data.childCount > 0 && <button className="nodrag nopan" onClick={() => data.onOpen(data.id)}>Explore component <ChevronRight size={12} /></button>}
    <Handle type="source" position={Position.Right} />
  </div>
}
const nodeTypes = { atlasEditor: EditorNode }

function Action({ label, children, ...props }) {
  return <button type="button" title={label} aria-label={label} {...props}>{children}</button>
}

function Inspector({ item, isEdge, model, disabled, onApply, onDelete, onExplore }) {
  const [draft, setDraft] = useState(item)
  useEffect(() => setDraft(item), [item])
  const descendants = !isEdge ? descendantIds(model, item.id) : new Set()
  const update = event => setDraft(previous => ({ ...previous, [event.target.name]: event.target.value }))
  const kinds = [...new Set([...(isEdge ? EDGE_KINDS : NODE_KINDS), item.kind])]
  return <form className="atlas-edit-inspector-form" onSubmit={event => {
    event.preventDefault()
    onApply(draft)
  }}>
    <div className="atlas-edit-kicker">{isEdge ? 'Relationship' : 'Component'} properties</div>
    <h3>{item.label || item.id}</h3><code title={item.id}>{item.id}</code>
    <label>Label<input name="label" value={draft.label || ''} onChange={update} disabled={disabled} required maxLength={200} /></label>
    <label>Type<select aria-label="Type" name="kind" value={draft.kind} onChange={update} disabled={disabled}>{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label>
    <label>Description<textarea name="description" value={draft.description || ''} onChange={update} disabled={disabled} rows={4} /></label>
    {!isEdge && item.parent_id !== null && <label>Parent component<select aria-label="Parent component" name="parent_id" value={draft.parent_id} onChange={update} disabled={disabled}>{model.nodes.filter(node => !descendants.has(node.id)).map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>}
    {isEdge && ['source', 'target'].map(endpoint => <label key={endpoint}>{endpoint === 'source' ? 'From' : 'To'}<select aria-label={endpoint === 'source' ? 'From' : 'To'} name={endpoint} value={draft[endpoint]} onChange={update} disabled={disabled}>{model.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>)}
    <SourcesEditor sources={draft.sources || []} status={draft.status} disabled={disabled} onChange={changes => setDraft(previous => ({ ...previous, ...changes }))} />
    {!disabled && <button className="atlas-edit-primary" type="submit">Apply changes</button>}
    {!isEdge && <button type="button" onClick={() => onExplore(item.id)}><Layers size={14} /> Explore inside</button>}
    {!disabled && (isEdge || item.parent_id !== null) && <button className="atlas-edit-danger" type="button" onClick={onDelete}><Trash2 size={14} />Delete {isEdge ? 'relationship' : 'component'}</button>}
  </form>
}

function EditorCanvas({ document: incoming, savedDocument, onChange, onSave, readOnly = false, saving = false, saveError = '', onExport }) {
  const [history, setHistory] = useState(() => createAtlasHistory(incoming))
  const current = history.document
  const historyRef = useRef(history)
  historyRef.current = history
  const lastIncoming = useRef(incoming)
  const lastEmitted = useRef(incoming)
  const [savedValue, setSavedValue] = useState(() => serializeAtlasDocument(savedDocument || incoming))
  const [scope, setScope] = useState(() => incoming.model.nodes.find(node => node.parent_id === null).id)
  const [deep, setDeep] = useState(false)
  const [selected, setSelected] = useState([])
  const [selectedEdge, setSelectedEdge] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [linking, setLinking] = useState(false)
  const [help, setHelp] = useState(false)
  const [panel, setPanel] = useState('properties')
  const [snap, setSnap] = useState(true)
  const [clipboard, setClipboard] = useState(null)
  const [localSaving, setLocalSaving] = useState(false)
  const importInput = useRef(null)
  const container = useRef(null)
  const { fitView, setCenter, getViewport, setViewport } = useReactFlow()
  const model = current.model
  const root = model.nodes.find(node => node.parent_id === null)
  const activeScope = model.nodes.find(node => node.id === scope) || root
  const busy = saving || localSaving
  const locked = readOnly || busy
  const currentValue = useMemo(() => serializeAtlasDocument(current), [current])
  const dirty = currentValue !== savedValue

  useEffect(() => {
    if (savedDocument) setSavedValue(serializeAtlasDocument(savedDocument))
  }, [savedDocument])

  useEffect(() => {
    if (incoming === lastIncoming.current) return
    lastIncoming.current = incoming
    if (incoming === lastEmitted.current || serializeAtlasDocument(incoming) === serializeAtlasDocument(lastEmitted.current)) return
    try {
      const next = createAtlasHistory(incoming)
      setHistory(next)
      setSavedValue(serializeAtlasDocument(savedDocument || incoming))
      setSelected([])
      setSelectedEdge('')
      setNotice('Document refreshed from host.')
    } catch (failure) { setError(failure.message) }
  }, [incoming])

  const publish = useCallback(next => {
    historyRef.current = next
    lastEmitted.current = next.document
    setHistory(next)
    setError('')
    setNotice('')
    onChange?.(next.document)
  }, [onChange])

  const commit = useCallback(operations => {
    if (locked) return false
    try {
      const previous = historyRef.current
      publish(commitAtlasHistory(previous, { base_revision: previous.document.revision, operations }))
      return true
    } catch (failure) { setError(failure.message); return false }
  }, [locked, publish])

  const undo = useCallback(() => {
    if (locked || !historyRef.current.past.length) return
    try { publish(undoAtlasHistory(historyRef.current)) } catch (failure) { setError(failure.message) }
  }, [locked, publish])
  const redo = useCallback(() => {
    if (locked || !historyRef.current.future.length) return
    try { publish(redoAtlasHistory(historyRef.current)) } catch (failure) { setError(failure.message) }
  }, [locked, publish])

  const openScope = useCallback(id => {
    setScope(id)
    setSelected([])
    setSelectedEdge('')
    setSearch('')
  }, [])
  const visible = useMemo(() => scopedNodes(model, activeScope.id, deep), [model, activeScope.id, deep])
  const defaults = useMemo(() => automaticPositions(visible), [visible])
  const visibleIds = useMemo(() => new Set(visible.map(node => node.id)), [visible])
  const graphNodes = useMemo(() => visible.map(node => ({
    id: node.id, type: 'atlasEditor', position: deep ? defaults[node.id] : current.layout.positions[node.id] || defaults[node.id], selected: selected.includes(node.id),
    data: { ...node, childCount: model.nodes.filter(child => child.parent_id === node.id).length, onOpen: openScope },
  })), [visible, current.layout.positions, defaults, selected, model.nodes, openScope, deep])
  const [nodes, setNodes] = useState(graphNodes)
  useEffect(() => setNodes(graphNodes), [graphNodes])
  const selectionChanged = useCallback(({ nodes: selection, edges: edgeSelection }) => {
    const identities = selection.map(node => node.id)
    setSelected(previous => previous.length === identities.length && previous.every((id, index) => id === identities[index]) ? previous : identities)
    if (edgeSelection.length === 1) setSelectedEdge(edgeSelection[0].id)
    else if (selection.length) setSelectedEdge('')
  }, [])
  useEffect(() => { const timer = setTimeout(() => fitView({ padding: .22, duration: 200, maxZoom: 1 }), 80); return () => clearTimeout(timer) }, [activeScope.id, deep, fitView])
  useEffect(() => {
    let timer
    const resize = () => { clearTimeout(timer); timer = setTimeout(() => fitView({ padding: .2, duration: 200, maxZoom: 1 }), 100) }
    window.addEventListener('resize', resize)
    return () => { clearTimeout(timer); window.removeEventListener('resize', resize) }
  }, [fitView])
  const edges = useMemo(() => model.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map(edge => ({
    ...edge, label: edge.label || edge.kind, selected: edge.id === selectedEdge, type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#8298b8' }, style: { stroke: edge.id === selectedEdge ? '#a78bfa' : '#68819f', strokeWidth: 1.6 },
    labelStyle: { fill: '#d8e5f6', fontSize: 11 }, labelBgStyle: { fill: '#172339' }, labelBgPadding: [7, 4],
  })), [model.edges, visibleIds, selectedEdge])

  const addNode = kind => {
    const id = editorId(kind)
    const offset = visible.length
    if (commit([{ type: 'node.add', node: { id, label: `New ${kind}`, kind, parent_id: activeScope.id, description: '', sources: [], status: 'declared' } }, { type: 'layout.set', positions: { [id]: { x: offset % 3 * 310, y: Math.floor(offset / 3) * 180 } } }])) {
      setSelected([id]); setSelectedEdge(''); setPanel('properties')
      setTimeout(() => fitView({ padding: .25, duration: 200, maxZoom: 1 }), 80)
    }
  }
  const connect = connection => {
    if (connection.source === connection.target) { setError('Choose two different components.'); return }
    const edge = { id: editorId('edge'), source: connection.source, target: connection.target, kind: 'call', label: 'Connects to', description: '', sources: [], status: 'declared' }
    if (commit([{ type: 'edge.add', edge }])) { setSelectedEdge(edge.id); setSelected([]); setLinking(false); setPanel('properties') }
  }
  const copy = useCallback(() => {
    const copied = copySelection(historyRef.current.document, selected)
    if (!copied.nodes.length) return
    setClipboard(copied); setNotice(`Copied ${copied.nodes.length} components with internal relationships.`)
  }, [selected])
  const paste = useCallback((source = clipboard) => {
    if (!source?.nodes.length || locked) return
    const copied = pasteOperations(source, activeScope.id)
    if (commit(copied.operations)) { setSelected(copied.ids); setSelectedEdge(''); setTimeout(() => fitView({ padding: .2, duration: 200 }), 80) }
  }, [clipboard, locked, activeScope.id, commit, fitView])
  const duplicate = useCallback(() => paste(copySelection(historyRef.current.document, selected)), [paste, selected])
  const askDelete = useCallback(() => {
    if (locked) return
    if (selectedEdge) { setPendingDelete({ edges: [selectedEdge], nodes: [], count: 0 }); return }
    const all = new Set()
    for (const id of selected) if (id !== root.id) for (const child of descendantIds(model, id)) all.add(child)
    const top = [...all].filter(id => !all.has(model.nodes.find(node => node.id === id)?.parent_id))
    if (top.length) setPendingDelete({ nodes: top, edges: [], count: all.size })
  }, [locked, selectedEdge, selected, root.id, model])

  const save = useCallback(async () => {
    if (!onSave || locked) return
    const document = historyRef.current.document
    setLocalSaving(true); setError('')
    try {
      const result = await onSave(document)
      if (result === false) throw new Error('The host did not save this document. Your edits are retained.')
      setSavedValue(serializeAtlasDocument(document)); setNotice('Document saved.')
    } catch (failure) { setError(failure.message || 'Save failed. Your edits are retained.') }
    finally { setLocalSaving(false) }
  }, [onSave, locked])

  useEffect(() => {
    const element = container.current
    const keydown = event => {
      if (pendingDelete || help) {
        if (event.key === 'Escape') { event.preventDefault(); setPendingDelete(null); setHelp(false) }
        if (event.key === 'Tab') {
          const dialog = element.querySelector('[aria-modal="true"]')
          const controls = [...dialog.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]')]
          const first = controls[0]
          const last = controls.at(-1)
          if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        return
      }
      if (isTypingTarget(event.target)) return
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); copy() }
      if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); paste() }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); askDelete() }
      if (event.key === 'Escape') { setPendingDelete(null); setLinking(false); setHelp(false) }
    }
    element?.addEventListener('keydown', keydown)
    return () => element?.removeEventListener('keydown', keydown)
  }, [save, undo, redo, copy, paste, duplicate, askDelete, pendingDelete, help])
  useEffect(() => installAtlasLeaveGuard(window, dirty), [dirty])

  const exportDocument = async () => {
    try {
      const serialized = serializeAtlasDocument(current)
      if (onExport) {
        const result = await onExport(current)
        if (result === false) throw new Error('The host did not export this document.')
      }
      else {
        const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }))
        const link = window.document.createElement('a')
        link.href = url; link.download = `${model.id.replace(/[^a-zA-Z0-9_-]/g, '-')}.atlas.json`; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setNotice('Exported portable .atlas.json document.')
    } catch (failure) { setError(failure.message) }
  }
  const importDocument = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || locked) return
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose an Atlas document smaller than 10 MB.')
      const document = parseAtlasDocument(await file.text())
      document.model.id = historyRef.current.document.model.id
      if (commit([{ type: 'document.replace', document }])) {
        openScope(document.model.nodes.find(node => node.parent_id === null).id)
        setNotice('Imported content into this document. Undo restores previous content; save to keep this import.')
      }
    } catch (failure) { setError(`Import rejected: ${failure.message}. Your document is unchanged.`) }
  }

  const inspectedEdge = model.edges.find(edge => edge.id === selectedEdge)
  const inspectedNode = selected.length === 1 ? model.nodes.find(node => node.id === selected[0]) : null
  const inspected = inspectedEdge || inspectedNode
  const breadcrumbs = []
  for (let node = activeScope; node; node = model.nodes.find(candidate => candidate.id === node.parent_id)) breadcrumbs.unshift(node)
  const results = search.trim() ? model.nodes.filter(node => `${node.label} ${node.kind} ${node.description}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30) : []
  const reveal = node => {
    setScope(node.parent_id || node.id); setDeep(false); setSelected(node.parent_id ? [node.id] : []); setSelectedEdge(''); setSearch('')
    const position = current.layout.positions[node.id]
    if (position) setTimeout(() => setCenter(position.x + 125, position.y + 60, { zoom: 1, duration: 250 }), 120)
  }

  return <section className="atlas-editor" ref={container} tabIndex={-1} aria-label="Atlas system design editor">
    <header className="atlas-edit-header"><div className="atlas-edit-heading"><div className="atlas-edit-kicker"><Layers size={13} />SHIZUHA ATLAS <span>DESIGN STUDIO</span></div><input className="atlas-edit-title" aria-label="Document title" key={`${model.id}-${model.title}`} defaultValue={model.title} readOnly={locked} maxLength={200} onBlur={event => { const title = event.target.value.trim(); if (title && title !== model.title) commit([{ type: 'document.update', changes: { title } }]); else event.target.value = model.title }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></div><div className="atlas-edit-document-actions"><span className={`atlas-edit-save-state ${dirty ? 'is-dirty' : ''}`}>{readOnly ? 'Read only' : dirty ? 'Unsaved changes' : 'All changes saved'}<small>revision {current.revision}</small></span><Action label="Import Atlas document" disabled={locked} onClick={() => importInput.current?.click()}><Upload size={16} /></Action><Action label="Export Atlas document" onClick={exportDocument}><Download size={16} /><span>Export</span></Action>{onSave && <button className="atlas-edit-primary" disabled={locked || !dirty} onClick={save}><Save size={15} />{busy ? 'Saving…' : 'Save'}</button>}</div></header>
    <input ref={importInput} type="file" accept=".json,.atlas.json,application/json" hidden onChange={importDocument} />
    <div className="atlas-edit-toolbar"><div className="atlas-edit-tool-group"><Action label="Undo" disabled={locked || !history.past.length} onClick={undo}><Undo2 size={16} /></Action><Action label="Redo" disabled={locked || !history.future.length} onClick={redo}><Redo2 size={16} /></Action><span className="atlas-edit-divider" /><Action label="Copy selection" disabled={!selected.length} onClick={copy}><Copy size={16} /></Action><Action label="Paste components" disabled={locked || !clipboard} onClick={() => paste()}><ClipboardPaste size={16} /></Action><Action label="Duplicate selection" disabled={locked || !selected.length} onClick={duplicate}><Copy size={14} /><Plus size={11} /></Action><Action label="Delete selection" disabled={locked || (!selected.length && !selectedEdge)} onClick={askDelete}><Trash2 size={16} /></Action></div><div className="atlas-edit-search"><Search size={15} /><input aria-label="Find component" placeholder="Find a component…" value={search} onChange={event => setSearch(event.target.value)} />{search && <div className="atlas-edit-search-results">{results.length ? results.map(node => <button key={node.id} onClick={() => reveal(node)}><span>{node.label}</span><small>{node.kind}</small></button>) : <p>No components found</p>}</div>}</div><div className="atlas-edit-tool-group"><label className="atlas-edit-check"><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />Snap</label><Action label="Auto layout this view" disabled={locked || deep || !visible.length} onClick={() => { if (commit([{ type: 'layout.set', positions: automaticPositions(visible) }])) setTimeout(() => fitView({ padding: .2, duration: 200 }), 80) }}><LayoutGrid size={16} /></Action><Action label="Fit view" onClick={() => fitView({ padding: .2, duration: 200 })}><Maximize size={16} /></Action><Action label="Editor help" onClick={() => setHelp(!help)}><CircleHelp size={16} /></Action></div></div>
    {(error || saveError) && <div className="atlas-edit-alert" role="alert">{error || saveError}<button onClick={() => setError('')} aria-label="Dismiss editor error"><X size={14} /></button></div>}
    {notice && <div className="atlas-edit-notice" role="status">{notice}</div>}
    <div className="atlas-edit-breadcrumbs"><nav aria-label="Component hierarchy">{breadcrumbs.map((node, index) => <span key={node.id}>{index > 0 && <ChevronRight size={13} />}<button onClick={() => openScope(node.id)} aria-current={node.id === activeScope.id ? 'location' : undefined}>{node.label}</button></span>)}</nav><label className="atlas-edit-check"><input type="checkbox" checked={deep} onChange={event => setDeep(event.target.checked)} />Include descendants</label></div>
    <div className="atlas-edit-workspace"><aside className="atlas-edit-palette" aria-label="Component palette"><div className="atlas-edit-kicker">Add to {activeScope.label}</div>{NODE_KINDS.filter(kind => kind !== 'system').map(kind => <button key={kind} disabled={locked} onClick={() => addNode(kind)}><Plus size={14} /><span>{kind}</span></button>)}<button className={linking ? 'is-active' : ''} disabled={locked || model.nodes.length < 2} onClick={() => { setLinking(!linking); setPanel('properties') }}><ArrowRight size={14} />Relationship</button><p>Drag between handles to connect. Double-click a component to explore inside.</p></aside>
      <div className="atlas-edit-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changes => setNodes(previous => applyNodeChanges(changes.filter(change => change.type !== 'remove'), previous))} onNodeDragStop={(_event, _node, dragged) => commit([{ type: 'layout.set', positions: Object.fromEntries(dragged.map(node => [node.id, node.position])) }])} onConnect={connect} onReconnect={(edge, connection) => commit([{ type: 'edge.update', id: edge.id, changes: { source: connection.source, target: connection.target } }])} onSelectionChange={selectionChanged} onNodeClick={() => setPanel('properties')} onEdgeClick={(_event, edge) => { setSelectedEdge(edge.id); setSelected([]); setPanel('properties') }} onNodeDoubleClick={(_event, node) => openScope(node.id)} onPaneClick={() => { setSelected([]); setSelectedEdge('') }} nodesDraggable={!locked && !deep} nodesConnectable={!locked} edgesReconnectable={!locked} deleteKeyCode={null} selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode={['Meta', 'Control']} snapToGrid={snap} snapGrid={[20, 20]} minZoom={.05} maxZoom={2} fitView fitViewOptions={{ padding: .2, maxZoom: 1 }} zoomOnDoubleClick={false} colorMode="dark"><Background color="#26374e" gap={20} size={1} /><Controls showInteractive={false} /><MiniMap style={{ width: 145, height: 95 }} pannable zoomable nodeColor="#6366f1" maskColor="rgba(7,14,28,.8)" onClick={(_event, position) => setCenter(position.x, position.y, { zoom: .8, duration: 200 })} /></ReactFlow>{!visible.length && <div className="atlas-edit-empty"><Layers size={32} /><h3>Design inside {activeScope.label}</h3><p>Add a service, component or data store to begin.</p>{!locked && <button className="atlas-edit-primary" onClick={() => addNode('service')}><Plus size={15} />Add service</button>}</div>}<div className="atlas-edit-canvas-caption"><MousePointer2 size={12} />{visible.length} components · {edges.length} relationships in view <span>{deep ? 'Overview · open a component to arrange its children' : 'Shift + drag to select'}</span></div></div>
      <aside className="atlas-edit-inspector" aria-label="Properties inspector"><div className="atlas-edit-panel-tabs" role="group" aria-label="Inspector section">{['properties', 'journeys', 'views'].map(section => <button key={section} aria-pressed={panel === section} onClick={() => setPanel(section)}>{section}</button>)}</div>{panel !== 'properties' ? <DocumentLibrary key={panel} section={panel} document={current} disabled={locked} commit={commit} captureView={() => ({ state: { selected: activeScope.id, editor_scope: activeScope.id, editor_deep: deep }, viewport: getViewport() })} restoreView={view => { const target = view.state?.editor_scope || view.state?.selected; openScope(model.nodes.some(node => node.id === target) ? target : root.id); setDeep(Boolean(view.state?.editor_deep)); if (view.viewport) setTimeout(() => setViewport(view.viewport, { duration: 200 }), 150) }} /> : linking ? <form className="atlas-edit-inspector-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); connect({ source: data.get('source'), target: data.get('target') }) }}><div className="atlas-edit-kicker">New relationship</div><h3>Connect components</h3>{['source', 'target'].map(endpoint => <label key={endpoint}>{endpoint === 'source' ? 'From' : 'To'}<select aria-label={endpoint === 'source' ? 'From' : 'To'} name={endpoint} required>{model.nodes.map(node => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>)}<button className="atlas-edit-primary" disabled={locked}>Add relationship</button><button type="button" onClick={() => setLinking(false)}>Cancel</button></form> : inspected ? <Inspector key={inspected.id} item={inspected} isEdge={Boolean(inspectedEdge)} model={model} disabled={locked} onExplore={openScope} onDelete={askDelete} onApply={draft => {
        const changes = { label: draft.label.trim(), kind: draft.kind, description: draft.description || '', sources: draft.sources || [], status: draft.status || 'declared' }
        const operations = inspectedEdge ? [{ type: 'edge.update', id: draft.id, changes: { ...changes, source: draft.source, target: draft.target } }] : [{ type: 'node.update', id: draft.id, changes }]
        if (!inspectedEdge && draft.parent_id !== inspected.parent_id) operations.push({ type: 'node.reparent', id: draft.id, parent_id: draft.parent_id })
        if (commit(operations) && !inspectedEdge && draft.parent_id !== inspected.parent_id) openScope(draft.parent_id)
      }} /> : <div className="atlas-edit-inspector-empty"><MousePointer2 size={26} /><h3>{selected.length ? `${selected.length} selected` : 'Your system, connected'}</h3><p>{selected.length ? 'Copy, duplicate or delete this selection using the toolbar. Children and internal relationships travel together.' : 'Select a component or relationship to edit its details. Navigate inside a component to design at the next level.'}</p><dl><div><dt>Components</dt><dd>{model.nodes.length - 1}</dd></div><div><dt>Relationships</dt><dd>{model.edges.length}</dd></div><div><dt>Document revision</dt><dd>{current.revision}</dd></div></dl>{!onSave && !readOnly && <p>Local workspace · export your document to keep your changes.</p>}</div>}</aside>
    </div>
    {pendingDelete && <div className="atlas-edit-modal-backdrop"><div className="atlas-edit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="atlas-delete-title"><h3 id="atlas-delete-title">Delete {pendingDelete.count ? `${pendingDelete.count} components` : 'this relationship'}?</h3><p>Contained components, affected relationships and dependent journey steps will be removed. You can undo this change.</p><div><button autoFocus onClick={() => setPendingDelete(null)}>Cancel</button><button className="atlas-edit-danger" onClick={() => { const operations = [...pendingDelete.nodes.map(id => ({ type: 'node.remove', id, cascade: true })), ...pendingDelete.edges.map(id => ({ type: 'edge.remove', id, cascade: true }))]; if (commit(operations)) { setSelected([]); setSelectedEdge(''); setPendingDelete(null) } }}>Delete</button></div></div></div>}
    {help && <div className="atlas-edit-modal-backdrop"><div className="atlas-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-help-title"><h3 id="atlas-help-title">A map you can design</h3><p>Use the palette to add components inside the current scope. Connect handles or use Relationship. Edit labels, types and hierarchy in the inspector.</p><p>⌘/Ctrl + Z undo · Shift + Z redo · C copy · V paste · D duplicate · S save. Delete removes your selection after confirmation. Shortcuts never intercept text editing.</p><p>Import and export .atlas.json documents. Import is validated before replacing the current document and can be undone.</p><button autoFocus onClick={() => setHelp(false)}>Got it</button></div></div>}
  </section>
}

export default function AtlasEditor(props) {
  return <ReactFlowProvider><EditorCanvas {...props} /></ReactFlowProvider>
}
