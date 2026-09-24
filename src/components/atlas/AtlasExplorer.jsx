import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Compass, GitBranch, Layers, Minimize2, Scan, Map as MapIcon, RotateCcw, Search, Share2, X } from 'lucide-react'
import AtlasNode from './AtlasNode'
import AtlasEdge from './AtlasEdge'
import AtlasInspector from './AtlasInspector'
import { shareAtlasView } from '../../utils/atlasHost'
import { validateAtlasNavigationRequest } from '../../utils/atlasAgentNavigation.js'
import { atlasFocus } from '../../utils/atlasFocus'
import { expansionState, keyboardPan, minimapSize } from '../../utils/atlasNavigation'
import { ancestorsOf, collapseNode, flowSelection, indexAtlas, layoutAtlas, parseAtlasState, projectAtlas, revealNodes, serializeAtlasState } from '../../utils/atlasGraph'

const nodeTypes = { atlas: AtlasNode }
const edgeTypes = { atlas: AtlasEdge }
const KIND_COLORS = { http: '#7dd3fc', auth: '#c4b5fd', event: '#fbbf24', inference: '#34d399', storage: '#f9a8d4', data: '#f9a8d4', control: '#a5b4fc', tool: '#2dd4bf', mcp: '#2dd4bf', build: '#fb923c', ci: '#fb923c', sequence: '#cbd5e1' }

function Explorer({ model, renderDiagramLibrary, onOpenSource, onShareView, backHref = '/', backLabel = 'Back to documentation', navigationRequest, onNavigationResult }) {
  const location = useLocation()
  const navigate = useNavigate()
  const index = useMemo(() => indexAtlas(model), [model])
  const [state, setState] = useState(() => parseAtlasState(location.search, model))
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [relationship, setRelationship] = useState(null)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')
  const [focusRequest, setFocusRequest] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches)
  const latestWrittenSearch = useRef(location.search)
  const initialFocusApplied = useRef(false)
  const canvasRef = useRef(null)
  const consumedNavigation = useRef(new Set())
  const { fitView, getViewport, setViewport, getZoom, setCenter, zoomIn, zoomOut } = useReactFlow()
  const selection = useMemo(() => flowSelection(model, state.flow, state.step), [model, state.flow, state.step])
  const zen = useMemo(() => atlasFocus(model, state.zen, state.hops, state.direction), [model, state.zen, state.hops, state.direction])
  const projection = useMemo(() => projectAtlas(model, state.expanded, state.kind), [model, state.expanded, state.kind])
  const layout = useMemo(() => layoutAtlas(index, state.expanded, { spacious: Boolean(state.zen) }), [index, state.expanded, state.zen])
  const scopedSearch = useCallback(searchString => searchString, [])

  useEffect(() => {
    if (location.search !== latestWrittenSearch.current) {
      latestWrittenSearch.current = location.search
      setState(parseAtlasState(location.search, model))
      setRelationship(null)
    }
  }, [location.search, model])

  useEffect(() => {
    const searchString = serializeAtlasState(state, model, scopedSearch(latestWrittenSearch.current))
    const nextSearch = searchString ? `?${searchString}` : ''
    if (nextSearch !== latestWrittenSearch.current) {
      latestWrittenSearch.current = nextSearch
      navigate({ pathname: location.pathname, search: nextSearch }, { replace: true })
    }
  }, [state, model, navigate, location.pathname, scopedSearch])

  const focus = useCallback(nodeIds => setFocusRequest({ nodeIds, token: Date.now() }), [])
  useEffect(() => {
    if (!initialized || initialFocusApplied.current) return
    initialFocusApplied.current = true
    if (selection.nodeIds.length) focus(selection.nodeIds)
    else if (state.selected) focus([state.selected])
  }, [initialized, selection.nodeIds, state.selected, focus])
  useEffect(() => {
    if (!initialized || !focusRequest) return
    const timer = setTimeout(() => {
      fitView({ nodes: focusRequest.nodeIds.map(id => ({ id })), padding: 0.16, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420, maxZoom: 1.15 })
    }, 70)
    return () => clearTimeout(timer)
  }, [focusRequest, initialized, layout, fitView])
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const resize = () => setCompact(media.matches)
    resize()
    media.addEventListener('change', resize)
    return () => media.removeEventListener('change', resize)
  }, [])

  const selectNode = useCallback(nodeId => {
    if (!index.byId.has(nodeId) || nodeId === index.root.id) return
    setState(previous => ({ ...previous, selected: nodeId, expanded: revealNodes(index, previous.expanded, [nodeId]) }))
    setRelationship(null)
    setSearch('')
    setSearchOpen(false)
    focus([nodeId])
  }, [index, focus])

  const focusZen = useCallback((nodeId, settings = {}) => {
    setState(previous => {
      const next = { ...previous, ...settings, zen: nodeId, selected: nodeId, flow: '', step: 0, kind: '' }
      const scope = atlasFocus(model, nodeId, next.hops, next.direction)
      if (!scope) return previous
      const targets = [...scope.relatedIds].filter(id => scope.primaryIds.has(id) ? id === nodeId : !scope.relatedIds.has(index.byId.get(id)?.parent_id))
      next.expanded = revealNodes(index, new Set([...previous.expanded, nodeId]), targets)
      return next
    })
    setRelationship(null)
    focus([nodeId])
  }, [index, model, focus])

  const toggleNode = useCallback(nodeId => {
    if (!index.children.get(nodeId)?.length) return
    setState(previous => {
      const isExpanded = previous.expanded.has(nodeId)
      const expanded = isExpanded ? collapseNode(index, previous.expanded, nodeId) : revealNodes(index, new Set([...previous.expanded, nodeId]), [nodeId])
      const selectedIsInside = previous.selected && ancestorsOf(index, previous.selected).includes(nodeId)
      return { ...previous, expanded, selected: isExpanded && selectedIsInside ? nodeId : previous.selected, flow: '', step: 0 }
    })
    setRelationship(null)
    focus([nodeId])
  }, [index, focus])

  const chooseFlow = useCallback((flowId, stepIndex = 0) => {
    const nextSelection = flowSelection(model, flowId, stepIndex)
    setState(previous => ({ ...previous, flow: nextSelection.flow?.id || '', step: nextSelection.stepIndex, kind: '', zen: '', selected: '', expanded: revealNodes(index, previous.expanded, nextSelection.nodeIds) }))
    setRelationship(null)
    if (nextSelection.nodeIds.length) focus(nextSelection.nodeIds)
  }, [model, index, focus])

  useEffect(() => {
    if (!navigationRequest || !initialized || consumedNavigation.current.has(navigationRequest.id)) return
    consumedNavigation.current.add(navigationRequest.id)
    try {
      const request = validateAtlasNavigationRequest(navigationRequest, model)
      if (request.action === 'focus') {
        if (request.nodeId === index.root.id) focus([])
        else selectNode(request.nodeId)
      } else if (request.action === 'zen') focusZen(request.nodeId)
      else if (request.action === 'expand') {
        setState(previous => ({ ...previous, expanded: revealNodes(index, new Set([...previous.expanded, request.nodeId]), [request.nodeId]) }))
        focus([request.nodeId])
      } else if (request.action === 'journey') chooseFlow(request.flowId)
      else if (request.action === 'fit_view') focus([])
      else {
        const action = request.action === 'expand_all' ? 'expand' : request.action === 'collapse_all' ? 'collapse' : 'overview'
        setState(previous => expansionState(index, previous, action))
        setRelationship(null)
        focus([])
      }
      onNavigationResult?.({ id: request.id, ok: true })
    } catch (failure) { onNavigationResult?.({ id: navigationRequest.id, ok: false, error: failure.message }) }
  }, [navigationRequest, initialized, model, index, focus, selectNode, focusZen, chooseFlow, onNavigationResult])

  const activeNodeIds = new Set(selection.nodeIds.flatMap(nodeId => [nodeId, ...ancestorsOf(index, nodeId)]))
  const activeEdgeIds = new Set(selection.edgeIds)
  const nodes = projection.nodes.map(node => {
    const placement = layout.get(node.id)
    const unrelated = zen && !zen.nodeIds.has(node.id)
    return {
      id: node.id,
      type: 'atlas',
      hidden: Boolean(unrelated && state.isolation === 'hide'),
      className: unrelated ? 'atlas-zen-unrelated' : zen?.primaryIds.has(node.id) ? 'atlas-zen-primary' : '',
      position: placement.position,
      width: placement.width,
      height: placement.height,
      ...(placement.parentId ? { parentId: placement.parentId, extent: 'parent' } : {}),
      style: { width: placement.width, height: placement.height },
      zIndex: placement.isExpanded ? placement.depth * 2 : 20 + placement.depth,
      selected: node.id === state.selected,
      ariaLabel: `${node.label}, ${node.kind}${index.children.get(node.id).length ? ', expandable' : ''}`,
      domAttributes: { onKeyDown: event => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
        event.preventDefault()
        selectNode(node.id)
      } },
      data: { ...node, ...placement, childCount: index.children.get(node.id).length, internalCount: projection.internalCounts.get(node.id) || 0, onToggle: toggleNode, highlighted: activeNodeIds.has(node.id), dimmed: Boolean(selection.flow) && !activeNodeIds.has(node.id) },
    }
  })
  const edgeLanes = new Map()
  for (const edge of projection.edges) {
    const pair = JSON.stringify([edge.source, edge.target].sort())
    if (!edgeLanes.has(pair)) edgeLanes.set(pair, [])
    edgeLanes.get(pair).push(edge.id)
  }
  const edges = projection.edges.map(edge => {
    const source = layout.get(edge.source)
    const target = layout.get(edge.target)
    const horizontal = Math.abs(source.absolutePosition.x - target.absolutePosition.x) > 180
    const forward = horizontal ? target.absolutePosition.x >= source.absolutePosition.x : target.absolutePosition.y >= source.absolutePosition.y
    const active = edge.members.some(member => activeEdgeIds.has(member.id))
    const zenRelated = zen && edge.members.some(member => zen.edgeIds.has(member.id))
    const focused = Boolean(state.selected) && (edge.source === state.selected || edge.target === state.selected)
    const lanes = edgeLanes.get(JSON.stringify([edge.source, edge.target].sort()))
    const lane = (lanes.indexOf(edge.id) - (lanes.length - 1) / 2) * 56
    const color = active ? '#f8fafc' : KIND_COLORS[edge.kind] || '#7c93ad'
    return { hidden: Boolean(zen && !zenRelated && state.isolation === 'hide'), id: edge.id, source: edge.source, target: edge.target, sourceHandle: `source-${horizontal ? forward ? 'right' : 'left' : forward ? 'bottom' : 'top'}`, targetHandle: `target-${horizontal ? forward ? 'left' : 'right' : forward ? 'top' : 'bottom'}`, type: 'atlas', label: `${edge.kind.replaceAll('_', ' ')}${edge.members.length > 1 ? ` · ${edge.members.length}` : ''}`, markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }, animated: active, zIndex: active ? 10 : 1, style: { stroke: color, strokeWidth: active ? 2.7 : focused ? 1.9 : 1.4, opacity: zen ? zenRelated ? 0.85 : 0.025 : selection.flow ? active ? 1 : 0.09 : state.selected ? focused ? 0.9 : 0.12 : 0.4 }, data: { ...edge, lane, horizontal, active, focused } }
  })
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase().slice(0, 150)
    if (!query) return []
    return model.nodes.filter(node => node.id !== index.root.id && `${node.label} ${node.id} ${node.description || ''}`.toLowerCase().includes(query)).sort((first, second) => Number(!first.label.toLowerCase().startsWith(query)) - Number(!second.label.toLowerCase().startsWith(query))).slice(0, 12)
  }, [search, model.nodes, index.root.id])
  const kinds = useMemo(() => [...new Set(model.edges.map(edge => edge.kind))].sort(), [model.edges])
  const changeExpansion = action => {
    setState(previous => expansionState(index, previous, action))
    setRelationship(null)
    setSearch('')
    focus(index.domains.map(domain => domain.id))
  }
  const fitMap = () => focus(zen ? projection.nodes.filter(node => zen.relatedIds.has(node.id) && !zen.relatedIds.has(node.parent_id)).map(node => node.id) : index.domains.map(domain => domain.id))
  const minimapKeyDown = event => {
    const viewport = keyboardPan(getViewport(), event.key, event.shiftKey ? 250 : 100)
    if (viewport) {
      event.preventDefault()
      setFocusRequest(null)
      setViewport(viewport)
    } else if (['+', '=', '-', 'Home'].includes(event.key)) {
      event.preventDefault()
      setFocusRequest(null)
      if (event.key === 'Home') fitMap()
      else if (event.key === '-') zoomOut()
      else zoomIn()
    }
  }
  const share = async () => {
    setShareError('')
    try {
      await shareAtlasView({ search: serializeAtlasState(state, model, scopedSearch(location.search)), locationHref: window.location.href, onShareView, clipboard: navigator.clipboard })
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setShareError('Unable to share this view. Please try again.')
    }
  }
  const selectedNode = index.byId.get(state.selected) || null
  const updated = model.updated_at && !Number.isNaN(Date.parse(model.updated_at)) ? new Date(model.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null
  return <div className="atlas-app">
    <header className="atlas-header"><div className="atlas-brand"><Link to={backHref} className="atlas-back" aria-label={backLabel}><ArrowLeft size={18} /></Link><span className="atlas-brand-icon"><Compass size={25} /></span><div><div className="atlas-kicker">Shizuha · Architecture</div><h1>Atlas <span>/</span> <small>{model.title || 'Shizuha system'}</small></h1></div></div><div className="atlas-header-actions"><span className="atlas-snapshot"><span />Documented snapshot</span>{renderDiagramLibrary?.({ model, node: selectedNode })}<button className="atlas-button" onClick={share}>{copied ? <Check size={15} /> : <Share2 size={15} />}<span>{copied ? onShareView ? 'Shared' : 'Copied' : 'Share view'}</span></button></div></header>
    <div className="atlas-toolbar"><div className="atlas-search"><Search size={16} /><input aria-label="Search architecture" placeholder="Find a service, component, or process…" value={search} onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter' && matches[0]) selectNode(matches[0].id) }} aria-expanded={searchOpen && Boolean(search.trim())} aria-controls="atlas-search-results" autoComplete="off" />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}{searchOpen && search.trim() && <div id="atlas-search-results" className="atlas-search-results" aria-label="Search results">{matches.length ? matches.map(node => <button key={node.id} onClick={() => selectNode(node.id)}><span>{node.label}<small>{[...ancestorsOf(index, node.id).filter(nodeId => nodeId !== index.root.id).map(nodeId => index.byId.get(nodeId).label), node.kind].join(' / ')}</small></span><ArrowRight size={14} /></button>) : <p>No matching components in this snapshot.</p>}</div>}</div><div className="atlas-toolbar-actions"><div className="atlas-navigation-actions" role="group" aria-label="Map navigation"><button className="atlas-button" title="Open every domain, component and process" onClick={() => changeExpansion('expand')}><Layers size={15} /><span>Expand all</span></button><button className="atlas-button" title="Close all nested details; retain the connection filter" onClick={() => changeExpansion('collapse')}><Minimize2 size={15} /><span>Collapse all</span></button><button className="atlas-button" title="Fit the current map without changing its contents" onClick={fitMap}><Scan size={15} /><span>Fit view</span></button><button className="atlas-button" title="Reset to the top-level system map and clear filters" onClick={() => changeExpansion('overview')}><RotateCcw size={15} /><span>Overview</span></button></div><label className="atlas-select"><GitBranch size={15} /><select aria-label="Filter relationship type" value={state.kind} onChange={event => { setState(previous => ({ ...previous, kind: event.target.value, flow: '', step: 0 })); setRelationship(null) }}><option value="">All connections</option>{kinds.map(kind => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</select><ChevronDown size={13} /></label></div></div>
{zen && <section className="atlas-zen-bar" aria-label="Zen view controls"><strong>Zen · {index.byId.get(state.zen)?.label}</strong><label>Interactions<select aria-label="Zen interaction depth" value={state.hops} onChange={event => focusZen(state.zen, { hops: Number(event.target.value) })}><option value={0}>Internal only</option><option value={1}>Direct · 1 hop</option><option value={2}>Indirect · 2 hops</option><option value={3}>Extended · 3 hops</option></select></label><label>Direction<select aria-label="Zen interaction direction" value={state.direction} onChange={event => focusZen(state.zen, { direction: event.target.value })}><option value="both">Both ways</option><option value="upstream">Incoming</option><option value="downstream">Outgoing</option></select></label><label>Unrelated<select aria-label="Zen unrelated components" value={state.isolation} onChange={event => setState(previous => ({ ...previous, isolation: event.target.value }))}><option value="fade">Fade</option><option value="hide">Hide</option></select></label><span>Parents stay visible · Scope follows documented connections</span><button className="atlas-button" onClick={() => setState(previous => ({ ...previous, zen: '' }))}><X size={14} />Exit Zen</button></section>}
<div className="atlas-workspace"><div className="atlas-map" ref={canvasRef}><div className="atlas-map-caption"><MapIcon size={14} /><span>{zen ? 'Zen view' : selection.flow ? 'Process lens' : 'System map'}</span><span className="atlas-map-caption-divider">/</span><span>{nodes.filter(node => !node.hidden).length} visible · {model.nodes.length - 1} mapped</span></div><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={() => setInitialized(true)} onNodeClick={(_event, node) => selectNode(node.id)} onNodeDoubleClick={(_event, node) => toggleNode(node.id)} onEdgeClick={(_event, edge) => { setRelationship(edge.data); setState(previous => ({ ...previous, selected: '' })) }} onPaneClick={() => { setSearchOpen(false); setRelationship(null); setState(previous => ({ ...previous, selected: '' })) }} fitView fitViewOptions={{ padding: 0.17, maxZoom: 1 }} minZoom={0.015} maxZoom={2} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} zoomOnDoubleClick={false} panOnDrag zoomOnScroll zoomOnPinch preventScrolling onMoveStart={event => { if (event) setFocusRequest(null) }} colorMode="dark" aria-label="Interactive Shizuha architecture map" onlyRenderVisibleElements><Background color="#24314b" gap={24} size={1} /><Controls showInteractive={false} showFitView={false} position="bottom-left" /><div className="atlas-minimap-navigation" style={minimapSize(compact)} tabIndex={0} role="group" aria-label="Map navigator: arrow keys pan, plus and minus zoom, Home fits view" onKeyDown={minimapKeyDown}><MiniMap style={minimapSize(compact)} nodeColor={node => node.data.color} nodeStrokeColor="#334155" maskColor="rgba(5, 12, 23, .76)" pannable zoomable onClick={(_event, position) => { setFocusRequest(null); setCenter(position.x, position.y, { zoom: getZoom() }) }} onNodeClick={(event, node) => { event.stopPropagation(); selectNode(node.id) }} ariaLabel="System map navigator — click to recenter, drag to pan, scroll to zoom" position="bottom-right" /></div><div className="atlas-map-help">Scroll to zoom · Drag to pan · Expand to explore</div></ReactFlow></div><AtlasInspector node={selectedNode} relationship={relationship} model={model} index={index} expanded={state.expanded} onSelect={selectNode} onFocus={focusZen} onOpenSource={onOpenSource} onToggle={toggleNode} onClose={() => { setRelationship(null); setState(previous => ({ ...previous, selected: '' })) }} /></div>
    <section className={`atlas-flow-bar ${selection.flow ? 'atlas-flow-bar--active' : ''}`} aria-label="Process walkthrough"><div className="atlas-flow-picker"><span className="atlas-flow-icon"><GitBranch size={19} /></span><div><label htmlFor="atlas-flow" className="atlas-kicker">Follow a process</label><select id="atlas-flow" value={state.flow} onChange={event => chooseFlow(event.target.value)}><option value="">Choose a journey through the system</option>{(model.flows || []).map(flow => <option key={flow.id} value={flow.id}>{flow.label}</option>)}</select></div></div>{selection.step ? <div className="atlas-flow-step"><div className="atlas-flow-progress"><span>{selection.stepIndex + 1}</span> / {selection.flow.steps.length}</div><div className="atlas-flow-step-copy"><strong>{selection.step.label}</strong><p>{selection.step.description || `${index.byId.get(selection.step.source)?.label} → ${index.byId.get(selection.step.target)?.label}`}</p></div><button className="atlas-icon-button" disabled={selection.stepIndex === 0} aria-label="Previous process step" onClick={() => chooseFlow(state.flow, state.step - 1)}><ArrowLeft size={17} /></button><button className="atlas-icon-button" disabled={selection.stepIndex === selection.flow.steps.length - 1} aria-label="Next process step" onClick={() => chooseFlow(state.flow, state.step + 1)}><ArrowRight size={17} /></button><button className="atlas-icon-button" aria-label="Exit process walkthrough" onClick={() => chooseFlow('')}><X size={17} /></button></div> : <p className="atlas-flow-empty">The same map. A different story. Trace messages across component boundaries.</p>}</section>
    <footer className="atlas-footer"><span>{index.domains.length} domains · {model.edges.length} source connections · {(model.flows || []).length} journeys</span><span>{shareError || `${updated ? `Updated ${updated} · ` : ''}Revision ${String(model.model_revision || 'unversioned').slice(0, 16)}`}</span></footer>
    <div className="atlas-sr-only" role="status" aria-live="polite">{copied ? onShareView ? 'View shared.' : 'View link copied.' : shareError || `${projection.nodes.length} components visible.${selection.step ? ` Step ${selection.stepIndex + 1}: ${selection.step.label}` : ''}`}</div>
  </div>
}

export default function AtlasExplorer(props) {
  return <ReactFlowProvider><Explorer {...props} /></ReactFlowProvider>
}
