import { memo } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import { Box, ChevronDown, ChevronRight, Layers, Network } from 'lucide-react'

const selectDetail = state => state.transform[2] < 0.42 ? 'overview' : state.transform[2] < 0.85 ? 'summary' : 'detail'

function AtlasNode({ id, data, selected }) {
  const detail = useStore(selectDetail)
  const Icon = data.depth === 0 ? Network : data.childCount ? Layers : Box
  return (
    <div
      className={`atlas-node ${data.isExpanded ? 'atlas-node--group' : ''} ${data.depth === 0 ? 'atlas-node--domain' : ''} ${selected ? 'atlas-node--selected' : ''} ${data.highlighted ? 'atlas-node--active' : ''} ${data.dimmed ? 'atlas-node--dimmed' : ''}`}
      style={{ '--domain-color': data.color }}
      data-detail={detail}
      data-node-id={id}
    >
      {[['left', Position.Left], ['right', Position.Right], ['top', Position.Top], ['bottom', Position.Bottom]].map(([side, position]) => (
        <span key={side}>
          <Handle type="source" id={`source-${side}`} position={position} isConnectable={false} />
          <Handle type="target" id={`target-${side}`} position={position} isConnectable={false} />
        </span>
      ))}
      <div className="atlas-node-heading">
        <span className="atlas-node-icon"><Icon size={data.depth === 0 ? 24 : 16} aria-hidden="true" /></span>
        <div className="atlas-node-title"><span className="atlas-node-kind">{data.kind.replaceAll('_', ' ')}</span><strong>{data.label}</strong></div>
        {data.childCount > 0 && (
          <button className="atlas-node-expand nodrag nopan" onClick={event => { event.stopPropagation(); data.onToggle(id) }} aria-label={`${data.isExpanded ? 'Collapse' : 'Expand'} ${data.label}`} aria-expanded={data.isExpanded}>
            {data.isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        )}
      </div>
      {!data.isExpanded && <>
        <p className="atlas-node-description">{data.description}</p>
        <div className="atlas-node-footer"><span>{data.childCount ? `${data.childCount} ${data.depth === 0 ? 'components' : 'inside'}` : data.status}</span>{data.internalCount > 0 && <span>{data.internalCount} internal links</span>}</div>
      </>}
      {data.isExpanded && <span className="atlas-group-count">{data.childCount} inside</span>}
    </div>
  )
}

export default memo(AtlasNode)
