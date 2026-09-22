import { memo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, useStore } from '@xyflow/react'

const selectShowLabels = state => state.transform[2] > 0.72

function AtlasEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data, label }) {
  const [hovered, setHovered] = useState(false)
  const detailed = useStore(selectShowLabels)
  const horizontal = data.horizontal
  const lane = data.lane || 0
  const distance = horizontal ? targetX - sourceX : targetY - sourceY
  const firstControl = horizontal ? { x: sourceX + distance * .35, y: sourceY + lane } : { x: sourceX + lane, y: sourceY + distance * .35 }
  const secondControl = horizontal ? { x: targetX - distance * .35, y: targetY + lane } : { x: targetX + lane, y: targetY - distance * .35 }
  const path = `M ${sourceX},${sourceY} C ${firstControl.x},${firstControl.y} ${secondControl.x},${secondControl.y} ${targetX},${targetY}`
  const labelX = (sourceX + targetX) / 2 + (horizontal ? 0 : lane * .75)
  const labelY = (sourceY + targetY) / 2 + (horizontal ? lane * .75 : 0)
  return <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}><BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, ...(hovered ? { opacity: 1, strokeWidth: 2.5 } : {}) }} interactionWidth={16} />{(hovered || data.active || (detailed && data.focused)) && <EdgeLabelRenderer><div className="atlas-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</div></EdgeLabelRenderer>}</g>
}

export default memo(AtlasEdge)
