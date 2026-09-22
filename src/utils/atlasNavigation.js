export function expansionState(index, previous, action) {
  const expanded = action === 'expand'
    ? new Set([...index.children].filter(([, children]) => children.length).map(([nodeId]) => nodeId))
    : new Set([index.root.id])
  expanded.add(index.root.id)
  return { ...previous, expanded, selected: '', flow: '', step: 0, zen: '', kind: action === 'overview' ? '' : previous.kind }
}

export function minimapSize(compact) {
  return compact ? { width: 120, height: 80 } : { width: 176, height: 112 }
}

export function keyboardPan(viewport, key, distance = 100) {
  const movement = { ArrowLeft: [distance, 0], ArrowRight: [-distance, 0], ArrowUp: [0, distance], ArrowDown: [0, -distance] }[key]
  return movement ? { ...viewport, x: viewport.x + movement[0], y: viewport.y + movement[1] } : null
}
