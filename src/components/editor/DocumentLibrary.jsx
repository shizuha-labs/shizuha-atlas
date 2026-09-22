import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { editorId } from './editorGraph.js'

export function SourcesEditor({ sources, status, disabled, onChange }) {
  const updateSource = (index, changes) => onChange({ sources: sources.map((source, offset) => offset === index ? { ...source, ...changes } : source) })
  return <fieldset className="atlas-edit-sources" disabled={disabled}><legend>Evidence and sources</legend>
    <label>Evidence status<select aria-label="Evidence status" value={status || 'declared'} onChange={event => onChange({ status: event.target.value })}>{['declared', 'documented', 'inferred'].map(value => <option key={value}>{value}</option>)}</select></label>
    {sources.map((source, index) => <div className="atlas-edit-source" key={index}>
      <label>Source {index + 1} label<input value={source.label} onChange={event => updateSource(index, { label: event.target.value })} /></label>
      <label>Source {index + 1} URL<input value={source.url} placeholder="https://… or /docs/…" onChange={event => updateSource(index, { url: event.target.value })} /></label>
      <label>Source {index + 1} type<input value={source.type} onChange={event => updateSource(index, { type: event.target.value })} /></label>
      {!disabled && <button type="button" aria-label={`Remove source ${index + 1}`} onClick={() => onChange({ sources: sources.filter((_source, offset) => offset !== index) })}><Trash2 size={12} />Remove source</button>}
    </div>)}
    {!disabled && <button type="button" onClick={() => onChange({ sources: [...sources, { label: 'Documentation', type: 'documentation', url: '' }] })}><Plus size={13} />Add source</button>}
  </fieldset>
}

function FlowForm({ flow, model, disabled, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => structuredClone(flow))
  const updateStep = (index, changes) => setDraft(previous => ({ ...previous, steps: previous.steps.map((step, offset) => offset === index ? { ...step, ...changes } : step) }))
  const moveStep = (index, offset) => setDraft(previous => {
    const steps = [...previous.steps]
    const step = steps.splice(index, 1)[0]
    steps.splice(index + offset, 0, step)
    return { ...previous, steps }
  })
  return <form className="atlas-edit-inspector-form atlas-edit-flow-form" onSubmit={event => { event.preventDefault(); if (onSave(draft)) onCancel() }}>
    <div className="atlas-edit-kicker">Process storyboard</div><h3>Edit journey</h3>
    <label>Journey name<input required value={draft.label} onChange={event => setDraft(previous => ({ ...previous, label: event.target.value }))} disabled={disabled} /></label>
    <label>Journey description<textarea rows={3} value={draft.description || ''} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} disabled={disabled} /></label>
    <p className="atlas-edit-hint">Ordered interactions, not a full UML sequence language. Steps retain their semantic endpoints and optional relationship bindings.</p>
    {draft.steps.map((step, index) => <fieldset key={step.id} disabled={disabled} className="atlas-edit-step"><legend>Step {index + 1}</legend>
      <label>Step {index + 1} label<input required value={step.label} onChange={event => updateStep(index, { label: event.target.value })} /></label>
      <label>Step {index + 1} description<textarea rows={2} value={step.description || ''} onChange={event => updateStep(index, { description: event.target.value })} /></label>
      {['source', 'target'].map(endpoint => <label key={endpoint}>{endpoint === 'source' ? 'From' : 'To'}<select aria-label={`Step ${index + 1} ${endpoint}`} value={step[endpoint]} onChange={event => updateStep(index, { [endpoint]: event.target.value, edge_ids: [] })}>{model.nodes.map(node => <option value={node.id} key={node.id}>{node.label}</option>)}</select></label>)}
      <label>Linked relationship<select aria-label={`Step ${index + 1} relationship`} value={step.edge_ids?.[0] || ''} onChange={event => { const edge = model.edges.find(candidate => candidate.id === event.target.value); updateStep(index, edge ? { source: edge.source, target: edge.target, edge_ids: [edge.id] } : { edge_ids: [] }) }}><option value="">No binding</option>{model.edges.map(edge => <option key={edge.id} value={edge.id}>{edge.label || edge.id}</option>)}</select></label>
      {!disabled && <div className="atlas-edit-step-actions"><button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp size={13} /></button><button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown size={13} /></button><button type="button" aria-label={`Remove step ${index + 1}`} onClick={() => setDraft(previous => ({ ...previous, steps: previous.steps.filter((_step, offset) => offset !== index) }))}><Trash2 size={13} /></button></div>}
    </fieldset>)}
    {!disabled && <><button type="button" onClick={() => setDraft(previous => ({ ...previous, steps: [...previous.steps, { id: editorId('step'), label: `Step ${previous.steps.length + 1}`, description: '', source: model.nodes[0].id, target: model.nodes[1]?.id || model.nodes[0].id, edge_ids: [] }] }))}><Plus size={13} />Add journey step</button><button className="atlas-edit-primary" type="submit">Save journey</button></>}
    <button type="button" onClick={onCancel}>{disabled ? 'Back to journeys' : 'Cancel journey edits'}</button>
  </form>
}

export default function DocumentLibrary({ section, document, disabled, commit, captureView, restoreView }) {
  const [editing, setEditing] = useState(null)
  const [viewName, setViewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState('')
  const { model, views } = document
  if (section === 'journeys' && editing) return <FlowForm key={editing.id} flow={editing} model={model} disabled={disabled} onSave={flow => commit([{ type: 'flow.upsert', flow }])} onCancel={() => setEditing(null)} />
  return <div className="atlas-edit-inspector-form"><div className="atlas-edit-kicker">Document library</div><h3>{section === 'journeys' ? 'Process journeys' : 'Saved views'}</h3>
    <p className="atlas-edit-hint">{section === 'journeys' ? 'Describe a process step by step. The same journeys are available in the explorer.' : 'Save a named component scope and viewport inside the portable document.'}</p>
    {section === 'journeys' ? <>{model.flows.map(flow => <div className="atlas-edit-library-item" key={flow.id}><button onClick={() => setEditing(flow)}><span>{flow.label}</span><small>{flow.steps.length} steps</small></button>{!disabled && (confirmDelete === flow.id ? <div><button onClick={() => { if (commit([{ type: 'flow.remove', id: flow.id }])) setConfirmDelete('') }}>Confirm delete journey</button><button onClick={() => setConfirmDelete('')}>Cancel</button></div> : <button className="atlas-edit-library-remove" aria-label={`Delete journey ${flow.label}`} onClick={() => setConfirmDelete(flow.id)}><Trash2 size={12} /></button>)}</div>)}{!disabled && <button onClick={() => setEditing({ id: editorId('journey'), label: 'New journey', description: '', steps: [] })}><Plus size={14} />New journey</button>}</> : <>{views.map(view => <div className="atlas-edit-library-item" key={view.id}><button onClick={() => restoreView(view)}><span>{view.label}</span><small>Open view</small></button>{!disabled && <button className="atlas-edit-library-remove" aria-label={`Delete view ${view.label}`} onClick={() => commit([{ type: 'view.remove', id: view.id }])}><Trash2 size={12} /></button>}</div>)}{!disabled && <form onSubmit={event => { event.preventDefault(); if (commit([{ type: 'view.upsert', view: { ...captureView(), id: editorId('view'), label: viewName.trim() } }])) setViewName('') }}><label>View name<input required maxLength={200} value={viewName} onChange={event => setViewName(event.target.value)} placeholder="e.g. Checkout architecture" /></label><button type="submit" className="atlas-edit-primary" disabled={!viewName.trim()}>Save current view</button></form>}</>}
  </div>
}
