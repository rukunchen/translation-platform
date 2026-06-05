import type { MindmapColor, MindmapMeta, MindmapNode } from './mindmap-types'
import { mindmapColorOrder as colorOrder } from './mindmap-types'

export type MindmapNodeVariant = 'root' | 'primary' | 'secondary' | 'leaf'

export type LayoutNodePlacement = {
  branchColor?: MindmapColor
  depth: number
  height: number
  node: MindmapNode
  nodeId: string
  variant: MindmapNodeVariant
  width: number
  x: number
  y: number
}

export type LayoutConnector = {
  color: string
  fromX: number
  fromY: number
  kind: 'curve' | 'spine'
  toX: number
  toY: number
}

export type LayoutResult = {
  connectors: LayoutConnector[]
  height: number
  nodes: LayoutNodePlacement[]
  width: number
}

type ConnectorDraft = Omit<LayoutConnector, 'kind'>

type XmindSubtreeMeasure = {
  height: number
  width: number
}

export type XmindLayoutDirection = 'axis' | 'right' | 'down'

const xmindLineColorMeta: Record<MindmapColor, string> = {
  blue: '#62A8BF',
  green: '#79B99F',
  orange: '#FF9C62',
  purple: '#A78AC9',
  rose: '#EF7777',
  gray: '#9EA2A0',
}

function getXmindNodeSize(depth: number) {
  if (depth === 0) {
    return { width: 400, height: 70 }
  }

  if (depth === 1) {
    return { width: 270, height: 44 }
  }

  return { width: 260, height: 38 }
}

function getXmindColumnGap(depth: number, styleMeta: MindmapMeta) {
  const compactOffset = styleMeta.compact ? -24 : 0

  if (depth === 0) return 240 + compactOffset
  if (depth === 1) return 156 + compactOffset
  return 132 + compactOffset
}

function getXmindVerticalGap(depth: number, styleMeta: MindmapMeta) {
  const compactOffset = styleMeta.compact ? -8 : 0

  if (depth === 0) return 34 + compactOffset
  if (depth === 1) return 22 + compactOffset
  return 16 + compactOffset
}

function getVisibleXmindChildren(node: MindmapNode) {
  return node.collapsed ? [] : node.children
}

function getBranchLineColor(color: MindmapColor) {
  return xmindLineColorMeta[color]
}

function completeLayout(
  nodes: LayoutNodePlacement[],
  connectors: ConnectorDraft[],
  width: number,
  height: number,
  connectorKind: LayoutConnector['kind'] = 'curve'
): LayoutResult {
  return {
    connectors: connectors.map(connector => ({ ...connector, kind: connectorKind })),
    height,
    nodes,
    width,
  }
}

export function buildXmindTreeLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const measureCache = new WeakMap<MindmapNode, XmindSubtreeMeasure>()
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 80

  function measureSubtree(node: MindmapNode, depth: number): XmindSubtreeMeasure {
    const cached = measureCache.get(node)
    if (cached) return cached

    const size = getXmindNodeSize(depth)
    const children = getVisibleXmindChildren(node)
    let measured: XmindSubtreeMeasure

    if (children.length === 0) {
      measured = size
    } else {
      const childMeasures = children.map(child => measureSubtree(child, depth + 1))
      const childGap = getXmindVerticalGap(depth, styleMeta)
      const childrenHeight = childMeasures.reduce((sum, child) => sum + child.height, 0) + childGap * (children.length - 1)
      const widestChild = Math.max(...childMeasures.map(child => child.width))

      measured = {
        height: Math.max(size.height, childrenHeight),
        width: size.width + getXmindColumnGap(depth, styleMeta) + widestChild,
      }
    }

    measureCache.set(node, measured)
    return measured
  }

  function placeSubtree(
    node: MindmapNode,
    depth: number,
    x: number,
    top: number,
    branchColor?: MindmapColor,
    childIndex = 0
  ) {
    const size = getXmindNodeSize(depth)
    const measure = measureSubtree(node, depth)
    const nodeY = top + (measure.height - size.height) / 2
    const nodeCenterY = nodeY + size.height / 2
    const variant: MindmapNodeVariant = depth === 0 ? 'root' : depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'

    nodes.push({
      branchColor,
      depth,
      height: size.height,
      node,
      nodeId: node.id,
      variant,
      width: size.width,
      x,
      y: nodeY,
    })

    const children = getVisibleXmindChildren(node)
    if (children.length === 0) {
      return {
        centerY: nodeCenterY,
        leftX: x,
        rightX: x + size.width,
      }
    }

    const childMeasures = children.map(child => measureSubtree(child, depth + 1))
    const childGap = getXmindVerticalGap(depth, styleMeta)
    const childrenHeight = childMeasures.reduce((sum, child) => sum + child.height, 0) + childGap * (children.length - 1)
    let childTop = top + (measure.height - childrenHeight) / 2

    children.forEach((child, index) => {
      const childBranchColor = depth === 0
        ? colorOrder[index % colorOrder.length]
        : branchColor ?? colorOrder[childIndex % colorOrder.length]
      const childX = x + size.width + getXmindColumnGap(depth, styleMeta)
      const childPlacement = placeSubtree(child, depth + 1, childX, childTop, childBranchColor, index)

      connectors.push({
        color: getBranchLineColor(childBranchColor),
        fromX: x + size.width,
        fromY: nodeCenterY,
        toX: childPlacement.leftX,
        toY: childPlacement.centerY,
      })

      childTop += childMeasures[index].height + childGap
    })

    return {
      centerY: nodeCenterY,
      leftX: x,
      rightX: x + size.width,
    }
  }

  const rootMeasure = measureSubtree(tree, 0)
  placeSubtree(tree, 0, padding, padding)

  return completeLayout(nodes, connectors, rootMeasure.width + padding * 2, rootMeasure.height + padding * 2)
}

export function buildXmindAxisTreeLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const measureCache = new WeakMap<MindmapNode, XmindSubtreeMeasure>()
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 80
  const rootSize = getXmindNodeSize(0)
  const rootColumnGap = getXmindColumnGap(0, styleMeta)
  const visibleChildren = getVisibleXmindChildren(tree)
  const leftChildren = visibleChildren.filter((_, index) => index % 2 === 1)
  const rightChildren = visibleChildren.filter((_, index) => index % 2 === 0)

  function measureSubtree(node: MindmapNode, depth: number): XmindSubtreeMeasure {
    const cached = measureCache.get(node)
    if (cached) return cached

    const size = getXmindNodeSize(depth)
    const children = getVisibleXmindChildren(node)
    let measured: XmindSubtreeMeasure

    if (children.length === 0) {
      measured = size
    } else {
      const childMeasures = children.map(child => measureSubtree(child, depth + 1))
      const childGap = getXmindVerticalGap(depth, styleMeta)
      const childrenHeight = childMeasures.reduce((sum, child) => sum + child.height, 0) + childGap * (children.length - 1)
      const widestChild = Math.max(...childMeasures.map(child => child.width))

      measured = {
        height: Math.max(size.height, childrenHeight),
        width: size.width + getXmindColumnGap(depth, styleMeta) + widestChild,
      }
    }

    measureCache.set(node, measured)
    return measured
  }

  function measureBranchGroup(children: MindmapNode[]) {
    if (children.length === 0) return { height: rootSize.height, width: 0 }
    const measures = children.map(child => measureSubtree(child, 1))
    const gap = getXmindVerticalGap(0, styleMeta)
    return {
      height: measures.reduce((sum, measure) => sum + measure.height, 0) + gap * (children.length - 1),
      width: Math.max(...measures.map(measure => measure.width)),
    }
  }

  function placeSubtree(
    node: MindmapNode,
    depth: number,
    left: number,
    top: number,
    direction: 'left' | 'right',
    branchColor: MindmapColor,
    childIndex = 0
  ) {
    const size = getXmindNodeSize(depth)
    const measure = measureSubtree(node, depth)
    const nodeX = direction === 'right' ? left : left + measure.width - size.width
    const nodeY = top + (measure.height - size.height) / 2
    const nodeCenterY = nodeY + size.height / 2
    const variant: MindmapNodeVariant = depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'

    nodes.push({
      branchColor,
      depth,
      height: size.height,
      node,
      nodeId: node.id,
      variant,
      width: size.width,
      x: nodeX,
      y: nodeY,
    })

    const children = getVisibleXmindChildren(node)
    if (children.length === 0) {
      return {
        centerY: nodeCenterY,
        leftX: nodeX,
        rightX: nodeX + size.width,
      }
    }

    const childMeasures = children.map(child => measureSubtree(child, depth + 1))
    const childGap = getXmindVerticalGap(depth, styleMeta)
    const childrenHeight = childMeasures.reduce((sum, measure) => sum + measure.height, 0) + childGap * (children.length - 1)
    let childTop = top + (measure.height - childrenHeight) / 2

    children.forEach((child, index) => {
      const childBranchColor = branchColor ?? colorOrder[childIndex % colorOrder.length]
      const childLeft = direction === 'right'
        ? nodeX + size.width + getXmindColumnGap(depth, styleMeta)
        : nodeX - getXmindColumnGap(depth, styleMeta) - childMeasures[index].width
      const childPlacement = placeSubtree(child, depth + 1, childLeft, childTop, direction, childBranchColor, index)

      connectors.push({
        color: getBranchLineColor(childBranchColor),
        fromX: direction === 'right' ? nodeX + size.width : nodeX,
        fromY: nodeCenterY,
        toX: direction === 'right' ? childPlacement.leftX : childPlacement.rightX,
        toY: childPlacement.centerY,
      })

      childTop += childMeasures[index].height + childGap
    })

    return {
      centerY: nodeCenterY,
      leftX: nodeX,
      rightX: nodeX + size.width,
    }
  }

  const leftGroup = measureBranchGroup(leftChildren)
  const rightGroup = measureBranchGroup(rightChildren)
  const contentHeight = Math.max(rootSize.height, leftGroup.height, rightGroup.height)
  const rootX = padding + leftGroup.width + rootColumnGap
  const rootY = padding + (contentHeight - rootSize.height) / 2
  const rootCenterY = rootY + rootSize.height / 2

  nodes.push({
    depth: 0,
    height: rootSize.height,
    node: tree,
    nodeId: tree.id,
    variant: 'root',
    width: rootSize.width,
    x: rootX,
    y: rootY,
  })

  let leftTop = padding + (contentHeight - leftGroup.height) / 2
  leftChildren.forEach(child => {
    const originalIndex = visibleChildren.indexOf(child)
    const branchColor = colorOrder[originalIndex % colorOrder.length]
    const measure = measureSubtree(child, 1)
    const placement = placeSubtree(child, 1, padding, leftTop, 'left', branchColor, originalIndex)
    connectors.push({
      color: getBranchLineColor(branchColor),
      fromX: rootX,
      fromY: rootCenterY,
      toX: placement.rightX,
      toY: placement.centerY,
    })
    leftTop += measure.height + getXmindVerticalGap(0, styleMeta)
  })

  let rightTop = padding + (contentHeight - rightGroup.height) / 2
  rightChildren.forEach(child => {
    const originalIndex = visibleChildren.indexOf(child)
    const branchColor = colorOrder[originalIndex % colorOrder.length]
    const measure = measureSubtree(child, 1)
    const placement = placeSubtree(child, 1, rootX + rootSize.width + rootColumnGap, rightTop, 'right', branchColor, originalIndex)
    connectors.push({
      color: getBranchLineColor(branchColor),
      fromX: rootX + rootSize.width,
      fromY: rootCenterY,
      toX: placement.leftX,
      toY: placement.centerY,
    })
    rightTop += measure.height + getXmindVerticalGap(0, styleMeta)
  })

  return completeLayout(
    nodes,
    connectors,
    leftGroup.width + rightGroup.width + rootSize.width + rootColumnGap * 2 + padding * 2,
    contentHeight + padding * 2
  )
}

export function buildXmindTopDownTreeLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const measureCache = new WeakMap<MindmapNode, XmindSubtreeMeasure>()
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 80

  function getLevelGap(depth: number) {
    const compactOffset = styleMeta.compact ? -24 : 0
    if (depth === 0) return 132 + compactOffset
    if (depth === 1) return 112 + compactOffset
    return 96 + compactOffset
  }

  function getSiblingGap(depth: number) {
    const compactOffset = styleMeta.compact ? -8 : 0
    if (depth === 0) return 38 + compactOffset
    if (depth === 1) return 28 + compactOffset
    return 20 + compactOffset
  }

  function measureSubtree(node: MindmapNode, depth: number): XmindSubtreeMeasure {
    const cached = measureCache.get(node)
    if (cached) return cached

    const size = getXmindNodeSize(depth)
    const children = getVisibleXmindChildren(node)
    let measured: XmindSubtreeMeasure

    if (children.length === 0) {
      measured = size
    } else {
      const childMeasures = children.map(child => measureSubtree(child, depth + 1))
      const siblingGap = getSiblingGap(depth)
      const childrenWidth = childMeasures.reduce((sum, child) => sum + child.width, 0) + siblingGap * (children.length - 1)
      const tallestChild = Math.max(...childMeasures.map(child => child.height))

      measured = {
        height: size.height + getLevelGap(depth) + tallestChild,
        width: Math.max(size.width, childrenWidth),
      }
    }

    measureCache.set(node, measured)
    return measured
  }

  function placeSubtree(
    node: MindmapNode,
    depth: number,
    left: number,
    y: number,
    branchColor?: MindmapColor,
    childIndex = 0
  ) {
    const size = getXmindNodeSize(depth)
    const measure = measureSubtree(node, depth)
    const nodeX = left + (measure.width - size.width) / 2
    const nodeCenterX = nodeX + size.width / 2
    const variant: MindmapNodeVariant = depth === 0 ? 'root' : depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'

    nodes.push({
      branchColor,
      depth,
      height: size.height,
      node,
      nodeId: node.id,
      variant,
      width: size.width,
      x: nodeX,
      y,
    })

    const children = getVisibleXmindChildren(node)
    if (children.length === 0) {
      return {
        centerX: nodeCenterX,
        bottomY: y + size.height,
        topY: y,
      }
    }

    const childMeasures = children.map(child => measureSubtree(child, depth + 1))
    const siblingGap = getSiblingGap(depth)
    const childrenWidth = childMeasures.reduce((sum, child) => sum + child.width, 0) + siblingGap * (children.length - 1)
    const childY = y + size.height + getLevelGap(depth)
    let childLeft = left + (measure.width - childrenWidth) / 2

    children.forEach((child, index) => {
      const childBranchColor = depth === 0
        ? colorOrder[index % colorOrder.length]
        : branchColor ?? colorOrder[childIndex % colorOrder.length]
      const childPlacement = placeSubtree(child, depth + 1, childLeft, childY, childBranchColor, index)

      connectors.push({
        color: getBranchLineColor(childBranchColor),
        fromX: nodeCenterX,
        fromY: y + size.height,
        toX: childPlacement.centerX,
        toY: childPlacement.topY,
      })

      childLeft += childMeasures[index].width + siblingGap
    })

    return {
      centerX: nodeCenterX,
      bottomY: y + size.height,
      topY: y,
    }
  }

  const rootMeasure = measureSubtree(tree, 0)
  placeSubtree(tree, 0, padding, padding)

  return completeLayout(nodes, connectors, rootMeasure.width + padding * 2, rootMeasure.height + padding * 2)
}

export function buildOrganizationTreeLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const measureCache = new WeakMap<MindmapNode, XmindSubtreeMeasure>()
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 88

  function getLevelGap(depth: number) {
    const compactOffset = styleMeta.compact ? -18 : 0
    if (depth === 0) return 128 + compactOffset
    if (depth === 1) return 112 + compactOffset
    return 100 + compactOffset
  }

  function getSiblingGap(depth: number) {
    const compactOffset = styleMeta.compact ? -10 : 0
    if (depth === 0) return 44 + compactOffset
    if (depth === 1) return 34 + compactOffset
    return 26 + compactOffset
  }

  function measureSubtree(node: MindmapNode, depth: number): XmindSubtreeMeasure {
    const cached = measureCache.get(node)
    if (cached) return cached

    const size = getXmindNodeSize(depth)
    const children = getVisibleXmindChildren(node)
    let measured: XmindSubtreeMeasure

    if (children.length === 0) {
      measured = size
    } else {
      const childMeasures = children.map(child => measureSubtree(child, depth + 1))
      const siblingGap = getSiblingGap(depth)
      const childrenWidth = childMeasures.reduce((sum, child) => sum + child.width, 0) + siblingGap * (children.length - 1)
      const tallestChild = Math.max(...childMeasures.map(child => child.height))

      measured = {
        height: size.height + getLevelGap(depth) + tallestChild,
        width: Math.max(size.width, childrenWidth),
      }
    }

    measureCache.set(node, measured)
    return measured
  }

  function placeSubtree(
    node: MindmapNode,
    depth: number,
    left: number,
    y: number,
    branchColor?: MindmapColor,
    childIndex = 0
  ) {
    const size = getXmindNodeSize(depth)
    const measure = measureSubtree(node, depth)
    const nodeX = left + (measure.width - size.width) / 2
    const nodeCenterX = nodeX + size.width / 2
    const nodeBottomY = y + size.height
    const variant: MindmapNodeVariant = depth === 0 ? 'root' : depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'

    nodes.push({
      branchColor,
      depth,
      height: size.height,
      node,
      nodeId: node.id,
      variant,
      width: size.width,
      x: nodeX,
      y,
    })

    const children = getVisibleXmindChildren(node)
    if (children.length === 0) {
      return {
        centerX: nodeCenterX,
        topY: y,
      }
    }

    const childMeasures = children.map(child => measureSubtree(child, depth + 1))
    const siblingGap = getSiblingGap(depth)
    const childrenWidth = childMeasures.reduce((sum, child) => sum + child.width, 0) + siblingGap * (children.length - 1)
    const childY = y + size.height + getLevelGap(depth)
    const busY = nodeBottomY + Math.max(30, (childY - nodeBottomY) * 0.45)
    let childLeft = left + (measure.width - childrenWidth) / 2
    const childPlacements: Array<{ branchColor: MindmapColor; centerX: number; topY: number }> = []

    children.forEach((child, index) => {
      const childBranchColor = depth === 0
        ? colorOrder[index % colorOrder.length]
        : branchColor ?? colorOrder[childIndex % colorOrder.length]
      const childPlacement = placeSubtree(child, depth + 1, childLeft, childY, childBranchColor, index)

      childPlacements.push({
        branchColor: childBranchColor,
        centerX: childPlacement.centerX,
        topY: childPlacement.topY,
      })
      childLeft += childMeasures[index].width + siblingGap
    })

    const trunkColor = getBranchLineColor(branchColor ?? node.color)
    connectors.push({
      color: trunkColor,
      fromX: nodeCenterX,
      fromY: nodeBottomY,
      toX: nodeCenterX,
      toY: busY,
    })

    if (childPlacements.length > 1) {
      connectors.push({
        color: trunkColor,
        fromX: childPlacements[0].centerX,
        fromY: busY,
        toX: childPlacements[childPlacements.length - 1].centerX,
        toY: busY,
      })
    }

    childPlacements.forEach(childPlacement => {
      connectors.push({
        color: getBranchLineColor(childPlacement.branchColor),
        fromX: childPlacement.centerX,
        fromY: busY,
        toX: childPlacement.centerX,
        toY: childPlacement.topY,
      })
    })

    return {
      centerX: nodeCenterX,
      topY: y,
    }
  }

  const rootMeasure = measureSubtree(tree, 0)
  placeSubtree(tree, 0, padding, padding)

  return completeLayout(nodes, connectors, rootMeasure.width + padding * 2, rootMeasure.height + padding * 2, 'spine')
}

export function buildTimelineSvgLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 96
  const rootSize = getXmindNodeSize(0)
  const centerY = 360
  const rootX = padding
  const rootY = centerY - rootSize.height / 2
  const visibleChildren = getVisibleXmindChildren(tree)
  const branchStep = styleMeta.compact ? 300 : 360
  const firstBranchX = rootX + rootSize.width + (styleMeta.compact ? 150 : 190)
  const branchLift = styleMeta.compact ? 150 : 190
  let maxX = rootX + rootSize.width
  let maxY = centerY + rootSize.height
  let minY = rootY

  nodes.push({
    depth: 0,
    height: rootSize.height,
    node: tree,
    nodeId: tree.id,
    variant: 'root',
    width: rootSize.width,
    x: rootX,
    y: rootY,
  })

  visibleChildren.forEach((child, index) => {
    const branchColor = colorOrder[index % colorOrder.length]
    const primarySize = getXmindNodeSize(1)
    const above = index % 2 === 0
    const childX = firstBranchX + index * branchStep
    const childY = above ? centerY - branchLift - primarySize.height : centerY + branchLift
    const axisX = childX + primarySize.width / 2

    nodes.push({
      branchColor,
      depth: 1,
      height: primarySize.height,
      node: child,
      nodeId: child.id,
      variant: 'primary',
      width: primarySize.width,
      x: childX,
      y: childY,
    })
    connectors.push({
      color: getBranchLineColor(branchColor),
      fromX: axisX,
      fromY: centerY,
      toX: axisX,
      toY: above ? childY + primarySize.height : childY,
    })

    const grandchildren = getVisibleXmindChildren(child)
    grandchildren.forEach((grandchild, grandchildIndex) => {
      const size = getXmindNodeSize(2)
      const grandchildX = childX
      const grandchildY = above
        ? childY - (grandchildIndex + 1) * (size.height + 18)
        : childY + primarySize.height + 28 + grandchildIndex * (size.height + 18)

      nodes.push({
        branchColor,
        depth: 2,
        height: size.height,
        node: grandchild,
        nodeId: grandchild.id,
        variant: 'secondary',
        width: size.width,
        x: grandchildX,
        y: grandchildY,
      })
      connectors.push({
        color: getBranchLineColor(branchColor),
        fromX: childX + primarySize.width / 2,
        fromY: above ? childY : childY + primarySize.height,
        toX: grandchildX + size.width / 2,
        toY: above ? grandchildY + size.height : grandchildY,
      })

      minY = Math.min(minY, grandchildY)
      maxY = Math.max(maxY, grandchildY + size.height)
      maxX = Math.max(maxX, grandchildX + size.width)
    })

    minY = Math.min(minY, childY)
    maxY = Math.max(maxY, childY + primarySize.height)
    maxX = Math.max(maxX, childX + primarySize.width)
  })

  if (visibleChildren.length > 0) {
    connectors.unshift({
      color: getBranchLineColor(tree.color),
      fromX: rootX + rootSize.width,
      fromY: centerY,
      toX: maxX,
      toY: centerY,
    })
  }

  const verticalOffset = Math.max(0, padding - minY)
  if (verticalOffset > 0) {
    for (const node of nodes) node.y += verticalOffset
    for (const connector of connectors) {
      connector.fromY += verticalOffset
      connector.toY += verticalOffset
    }
    maxY += verticalOffset
  }

  return completeLayout(nodes, connectors, Math.max(960, maxX + padding), Math.max(720, maxY + padding), 'spine')
}

export function buildFishboneSvgLayout(tree: MindmapNode, styleMeta: MindmapMeta): LayoutResult {
  const nodes: LayoutNodePlacement[] = []
  const connectors: ConnectorDraft[] = []
  const padding = 96
  const rootSize = getXmindNodeSize(0)
  const centerY = 390
  const rootX = padding
  const rootY = centerY - rootSize.height / 2
  const visibleChildren = getVisibleXmindChildren(tree)
  const branchStep = styleMeta.compact ? 270 : 330
  const firstBranchX = rootX + rootSize.width + (styleMeta.compact ? 150 : 190)
  const branchLift = styleMeta.compact ? 140 : 170
  let maxX = rootX + rootSize.width
  let maxY = centerY + rootSize.height
  let minY = rootY

  nodes.push({
    depth: 0,
    height: rootSize.height,
    node: tree,
    nodeId: tree.id,
    variant: 'root',
    width: rootSize.width,
    x: rootX,
    y: rootY,
  })

  visibleChildren.forEach((child, index) => {
    const branchColor = colorOrder[index % colorOrder.length]
    const primarySize = getXmindNodeSize(1)
    const above = index % 2 === 0
    const spineX = firstBranchX + index * branchStep
    const childX = spineX + 52
    const childY = above ? centerY - branchLift - primarySize.height : centerY + branchLift

    nodes.push({
      branchColor,
      depth: 1,
      height: primarySize.height,
      node: child,
      nodeId: child.id,
      variant: 'primary',
      width: primarySize.width,
      x: childX,
      y: childY,
    })
    connectors.push({
      color: getBranchLineColor(branchColor),
      fromX: spineX,
      fromY: centerY,
      toX: childX,
      toY: above ? childY + primarySize.height : childY,
    })

    const grandchildren = getVisibleXmindChildren(child)
    grandchildren.forEach((grandchild, grandchildIndex) => {
      const size = getXmindNodeSize(2)
      const grandchildX = childX + 42 + grandchildIndex * 28
      const grandchildY = above
        ? childY - (grandchildIndex + 1) * (size.height + 18)
        : childY + primarySize.height + 26 + grandchildIndex * (size.height + 18)

      nodes.push({
        branchColor,
        depth: 2,
        height: size.height,
        node: grandchild,
        nodeId: grandchild.id,
        variant: 'secondary',
        width: size.width,
        x: grandchildX,
        y: grandchildY,
      })
      connectors.push({
        color: getBranchLineColor(branchColor),
        fromX: childX + primarySize.width * 0.72,
        fromY: above ? childY : childY + primarySize.height,
        toX: grandchildX + size.width * 0.15,
        toY: above ? grandchildY + size.height : grandchildY,
      })

      minY = Math.min(minY, grandchildY)
      maxY = Math.max(maxY, grandchildY + size.height)
      maxX = Math.max(maxX, grandchildX + size.width)
    })

    minY = Math.min(minY, childY)
    maxY = Math.max(maxY, childY + primarySize.height)
    maxX = Math.max(maxX, childX + primarySize.width)
  })

  if (visibleChildren.length > 0) {
    connectors.unshift({
      color: getBranchLineColor(tree.color),
      fromX: rootX + rootSize.width,
      fromY: centerY,
      toX: maxX,
      toY: centerY,
    })
  }

  const verticalOffset = Math.max(0, padding - minY)
  if (verticalOffset > 0) {
    for (const node of nodes) node.y += verticalOffset
    for (const connector of connectors) {
      connector.fromY += verticalOffset
      connector.toY += verticalOffset
    }
    maxY += verticalOffset
  }

  return completeLayout(nodes, connectors, Math.max(960, maxX + padding), Math.max(720, maxY + padding), 'spine')
}
