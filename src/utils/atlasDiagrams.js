export const MERMAID_TEMPLATES = Object.freeze([
  { id: 'flowchart', label: 'Flowchart', source: 'flowchart LR\n  Client --> API\n  API --> Database' },
  { id: 'sequence', label: 'Sequence', source: 'sequenceDiagram\n  participant Client\n  participant API\n  Client->>API: Request\n  API-->>Client: Response' },
  { id: 'class', label: 'Class', source: 'classDiagram\n  class Service {\n    +execute()\n  }\n  Service --> Repository' },
  { id: 'state', label: 'State machine', source: 'stateDiagram-v2\n  [*] --> Pending\n  Pending --> Active\n  Active --> [*]' },
  { id: 'er', label: 'Entity relationship', source: 'erDiagram\n  USER ||--o{ DOCUMENT : owns\n  DOCUMENT {\n    string title\n    int revision\n  }' },
  { id: 'journey', label: 'User journey', source: 'journey\n  title Design a system\n  section Design\n    Explore: 5: User\n    Edit: 4: User\n    Review: 5: Team' },
  { id: 'gantt', label: 'Gantt', source: 'gantt\n  title Delivery\n  dateFormat YYYY-MM-DD\n  section Design\n  Plan : 2026-01-01, 3d\n  Build : 5d' },
  { id: 'pie', label: 'Pie chart', source: 'pie title Requests\n  "Read" : 70\n  "Write" : 30' },
  { id: 'quadrant', label: 'Quadrant chart', source: 'quadrantChart\n  title Priorities\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  Feature: [0.3, 0.8]' },
  { id: 'requirement', label: 'Requirement', source: 'requirementDiagram\n  requirement availability {\n    id: 1\n    text: Service stays available\n    risk: high\n    verifymethod: test\n  }' },
  { id: 'git', label: 'Git graph', source: 'gitGraph\n  commit\n  branch feature\n  commit\n  checkout main\n  merge feature' },
  { id: 'c4', label: 'C4 context', source: 'C4Context\n  Person(user, "User")\n  System(system, "System")\n  Rel(user, system, "Uses")' },
  { id: 'mindmap', label: 'Mindmap', source: 'mindmap\n  root((System))\n    API\n    Storage\n    Observability' },
  { id: 'timeline', label: 'Timeline', source: 'timeline\n  title Delivery\n  Design : Model\n  Build : Implement\n  Release : Verify' },
  { id: 'sankey', label: 'Sankey', source: 'sankey-beta\n  Requests,Cache,70\n  Requests,Database,30' },
  { id: 'xy', label: 'XY chart', source: 'xychart-beta\n  title "Throughput"\n  x-axis [Jan, Feb, Mar]\n  y-axis "Requests" 0 --> 100\n  line [30, 60, 90]' },
  { id: 'block', label: 'Block diagram', source: 'block-beta\n  columns 3\n  Client API Database\n  Client --> API\n  API --> Database' },
  { id: 'packet', label: 'Packet', source: 'packet-beta\n  0-7: "Version"\n  8-31: "Payload"' },
  { id: 'kanban', label: 'Kanban', source: 'kanban\n  todo[To do]\n    design[Design]\n  done[Done]\n    research[Research]' },
  { id: 'architecture', label: 'Architecture', source: 'architecture-beta\n  service api(server)[API]\n  service db(database)[Database]\n  api:R -- L:db' },
  { id: 'radar', label: 'Radar', source: 'radar-beta\n  axis speed["Speed"], reliability["Reliability"], cost["Cost"]\n  curve service["Service"]{80, 90, 60}' },
  { id: 'treemap', label: 'Treemap', source: 'treemap-beta\n  "System"\n    "API": 60\n    "Storage": 40' },
])

export function validateAtlasDiagrams(diagrams, nodeIds) {
  if (diagrams === undefined) return
  if (!Array.isArray(diagrams) || diagrams.length > 100) throw new Error('Diagrams must be an array of at most 100 entries')
  const identifiers = new Set()
  for (const diagram of diagrams) {
    if (!diagram || typeof diagram !== 'object' || Array.isArray(diagram)) throw new Error('Diagram must be an object')
    if (typeof diagram.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(diagram.id) || ['__proto__', 'constructor', 'prototype'].includes(diagram.id)) throw new Error('Diagram ID is invalid')
    if (identifiers.has(diagram.id)) throw new Error(`Duplicate diagram ID: ${diagram.id}`)
    identifiers.add(diagram.id)
    if (typeof diagram.title !== 'string' || !diagram.title.trim() || diagram.title.length > 1000) throw new Error('Diagram title must be a non-empty bounded string')
    if (typeof diagram.source !== 'string' || diagram.source.length > 100000) throw new Error('Diagram source must be a string of at most 100000 characters')
    if (diagram.node_id !== undefined && diagram.node_id !== null && !nodeIds.has(diagram.node_id)) throw new Error(`Diagram references an unknown node: ${diagram.node_id}`)
  }
}

export function assertSafeMermaidSource(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 100000) throw new Error('Enter Mermaid source (maximum 100000 characters)')
  if (/%%\s*\{/.test(source) || /^\s*---(?:\s|$)/.test(source)) throw new Error('Per-diagram configuration and front matter are not rendered. Remove them; Atlas supplies safe renderer configuration.')
  return source
}

export function exportMermaidSource(diagram) {
  if (typeof diagram?.source !== 'string') throw new Error('Diagram source must be text')
  return diagram.source
}
