import type { MindmapNavigationEntry, MindmapNode } from './mindmap-types'

export function findNodeById(node: MindmapNode, nodeId: string): MindmapNode | null {
  if (node.id === nodeId) return node
  for (const child of node.children) {
    const match = findNodeById(child, nodeId)
    if (match) return match
  }
  return null
}

export function findNodeDepth(node: MindmapNode, nodeId: string, depth = 0): number | null {
  if (node.id === nodeId) return depth
  for (const child of node.children) {
    const match = findNodeDepth(child, nodeId, depth + 1)
    if (match !== null) return match
  }
  return null
}

export function getVisibleNavigationEntries(
  node: MindmapNode,
  depth = 0,
  parentId: string | null = null,
  entries: MindmapNavigationEntry[] = []
): MindmapNavigationEntry[] {
  entries.push({ depth, node, parentId })

  if (!node.collapsed) {
    for (const child of node.children) {
      getVisibleNavigationEntries(child, depth + 1, node.id, entries)
    }
  }

  return entries
}

export function updateNodeById(
  node: MindmapNode,
  nodeId: string,
  updater: (current: MindmapNode) => MindmapNode
): { nextNode: MindmapNode; changed: boolean } {
  if (node.id === nodeId) {
    return { nextNode: updater(node), changed: true }
  }

  let changed = false
  const nextChildren = node.children.map(child => {
    const result = updateNodeById(child, nodeId, updater)
    if (result.changed) changed = true
    return result.nextNode
  })

  if (!changed) return { nextNode: node, changed: false }

  return {
    nextNode: {
      ...node,
      children: nextChildren,
    },
    changed: true,
  }
}

export function addChildNode(
  node: MindmapNode,
  parentId: string,
  childNode: MindmapNode
): { nextNode: MindmapNode; added: boolean } {
  if (node.id === parentId) {
    return {
      nextNode: {
        ...node,
        children: [...node.children, childNode],
      },
      added: true,
    }
  }

  let added = false
  const nextChildren = node.children.map(child => {
    const result = addChildNode(child, parentId, childNode)
    if (result.added) added = true
    return result.nextNode
  })

  if (!added) return { nextNode: node, added: false }

  return {
    nextNode: {
      ...node,
      children: nextChildren,
    },
    added: true,
  }
}

export function findParentNode(node: MindmapNode, nodeId: string): MindmapNode | null {
  for (const child of node.children) {
    if (child.id === nodeId) return node
    const match = findParentNode(child, nodeId)
    if (match) return match
  }

  return null
}

export function addSiblingNode(
  node: MindmapNode,
  nodeId: string,
  siblingNode: MindmapNode
): { nextNode: MindmapNode; added: boolean } {
  const siblingIndex = node.children.findIndex(child => child.id === nodeId)
  if (siblingIndex >= 0) {
    const nextChildren = [...node.children]
    nextChildren.splice(siblingIndex + 1, 0, siblingNode)
    return {
      nextNode: {
        ...node,
        children: nextChildren,
      },
      added: true,
    }
  }

  let added = false
  const nextChildren = node.children.map(child => {
    const result = addSiblingNode(child, nodeId, siblingNode)
    if (result.added) added = true
    return result.nextNode
  })

  if (!added) return { nextNode: node, added: false }

  return {
    nextNode: {
      ...node,
      children: nextChildren,
    },
    added: true,
  }
}

export function removeNodeById(node: MindmapNode, nodeId: string): { nextNode: MindmapNode; removed: boolean } {
  const nextChildren: MindmapNode[] = []
  let removed = false

  for (const child of node.children) {
    if (child.id === nodeId) {
      removed = true
      continue
    }

    const result = removeNodeById(child, nodeId)
    if (result.removed) removed = true
    nextChildren.push(result.nextNode)
  }

  if (!removed) return { nextNode: node, removed: false }

  return {
    nextNode: {
      ...node,
      children: nextChildren,
    },
    removed: true,
  }
}

export function promoteNodeById(node: MindmapNode, nodeId: string): { nextNode: MindmapNode; promoted: boolean } {
  const parentIndex = node.children.findIndex(child => child.children.some(grandchild => grandchild.id === nodeId))

  if (parentIndex >= 0) {
    const parentNode = node.children[parentIndex]
    const targetIndex = parentNode.children.findIndex(child => child.id === nodeId)
    const promotedNode = parentNode.children[targetIndex]
    const nextParentChildren = parentNode.children.filter(child => child.id !== nodeId)
    const nextChildren = [...node.children]

    nextChildren[parentIndex] = {
      ...parentNode,
      children: nextParentChildren,
    }
    nextChildren.splice(parentIndex + 1, 0, promotedNode)

    return {
      nextNode: {
        ...node,
        children: nextChildren,
      },
      promoted: true,
    }
  }

  let promoted = false
  const nextChildren = node.children.map(child => {
    const result = promoteNodeById(child, nodeId)
    if (result.promoted) promoted = true
    return result.nextNode
  })

  if (!promoted) return { nextNode: node, promoted: false }

  return {
    nextNode: {
      ...node,
      children: nextChildren,
    },
    promoted: true,
  }
}

export function countNodes(node: MindmapNode): number {
  let total = 1
  for (const child of node.children) total += countNodes(child)
  return total
}

export function setNodeCollapsed(
  node: MindmapNode,
  nodeId: string,
  collapsed: boolean
): { nextNode: MindmapNode; changed: boolean } {
  return updateNodeById(node, nodeId, current => ({
    ...current,
    collapsed,
  }))
}

export function setTreeCollapsedState(node: MindmapNode, collapsed: boolean, keepRootExpanded = false): MindmapNode {
  return {
    ...node,
    collapsed: keepRootExpanded && node.id === 'root' ? false : collapsed,
    children: node.children.map(child => setTreeCollapsedState(child, collapsed, keepRootExpanded)),
  }
}

export function findNodePath(node: MindmapNode, nodeId: string, path: string[] = []): string[] | null {
  const nextPath = [...path, node.id]
  if (node.id === nodeId) return nextPath

  for (const child of node.children) {
    const match = findNodePath(child, nodeId, nextPath)
    if (match) return match
  }

  return null
}

export function expandPathToNode(node: MindmapNode, nodeId: string): MindmapNode {
  const path = findNodePath(node, nodeId)
  if (!path) return node

  const ancestorIds = new Set(path.slice(0, -1))

  function visit(current: MindmapNode): MindmapNode {
    const nextChildren = current.children.map(visit)
    const shouldExpand = ancestorIds.has(current.id)
    return {
      ...current,
      collapsed: shouldExpand ? false : current.collapsed,
      children: nextChildren,
    }
  }

  return visit(node)
}

function buildNodeSearchText(node: MindmapNode) {
  return [node.label, node.note ?? '', node.tags?.join(' ') ?? '']
    .join('\n')
    .toLowerCase()
}

export function collectMatchingNodeIds(node: MindmapNode, keyword: string): string[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return []

  const matchesCurrent = buildNodeSearchText(node).includes(normalized) ? [node.id] : []
  const childMatches = node.children.flatMap(child => collectMatchingNodeIds(child, normalized))
  return [...matchesCurrent, ...childMatches]
}
