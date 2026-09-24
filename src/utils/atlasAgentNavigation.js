const ACTIONS = new Set(['focus', 'zen', 'expand', 'collapse_all', 'expand_all', 'fit_view', 'overview', 'journey'])

export function validateAtlasNavigationRequest(request, model) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['id', 'action', 'nodeId', 'flowId'].includes(key))) throw new Error('Invalid navigation request')
  if (typeof request.id !== 'string' || !request.id.trim() || request.id.length > 200) throw new Error('Navigation request ID is required')
  if (!ACTIONS.has(request.action)) throw new Error('Unsupported navigation action')
  const needsNode = ['focus', 'zen', 'expand'].includes(request.action)
  const needsFlow = request.action === 'journey'
  if (needsNode && !model.nodes.some(node => node.id === request.nodeId)) throw new Error('Navigation references an unknown component')
  if (needsFlow && !model.flows.some(flow => flow.id === request.flowId)) throw new Error('Navigation references an unknown journey')
  if (!needsNode && request.nodeId !== undefined) throw new Error('This navigation action does not accept a component')
  if (!needsFlow && request.flowId !== undefined) throw new Error('This navigation action does not accept a journey')
  return { id: request.id, action: request.action, ...(needsNode ? { nodeId: request.nodeId } : {}), ...(needsFlow ? { flowId: request.flowId } : {}) }
}
