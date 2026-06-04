'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'

type MindmapColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'gray'
type MindmapLayout = 'xmind-axis' | 'logic' | 'right' | 'vertical'
type MindmapBackground = 'paper' | 'white' | 'warm-gray' | 'dark'
type MindmapFontFamily = 'serif' | 'sans' | 'mono'
type MindmapBranchLine = 'thin' | 'default' | 'thick'
type LayoutTemplateId = 'xmind-axis' | 'right' | 'logic' | 'organization' | 'timeline' | 'fishbone'

type MindmapMeta = {
  layout: MindmapLayout
  background: MindmapBackground
  fontFamily: MindmapFontFamily
  branchLine: MindmapBranchLine
  rainbowBranches: boolean
  compact: boolean
}

type MindmapNode = {
  id: string
  label: string
  color: MindmapColor
  collapsed?: boolean
  meta?: Partial<MindmapMeta>
  note?: string
  tags?: string[]
  children: MindmapNode[]
}

type ScreenState = 'loading' | 'ready' | 'auth' | 'missing' | 'error'
type NodeInspectorTab = 'content' | 'style' | 'structure'
type FullscreenInspectorTab = 'node' | 'canvas'

const colorOrder: MindmapColor[] = ['blue', 'green', 'orange', 'purple', 'rose', 'gray']
const defaultMindmapMeta: MindmapMeta = {
  layout: 'xmind-axis',
  background: 'paper',
  fontFamily: 'serif',
  branchLine: 'thin',
  rainbowBranches: false,
  compact: false,
}

const colorMeta: Record<MindmapColor, {
  label: string
  chip: string
  button: string
  selected: string
  rootCard: string
  rootBadge: string
  primaryCard: string
  secondaryCard: string
  line: string
  arrow: string
}> = {
  blue: {
    label: '蓝',
    chip: 'border-[#D6E5EA] bg-[#EEF6F8] text-[#5C8897]',
    button: 'border-[#D6E5EA] bg-[#EEF6F8] text-[#5C8897] hover:bg-[#E7F1F4]',
    selected: 'ring-2 ring-[#D5E4E9]',
    rootCard: 'border-[#5F8897] bg-[linear-gradient(180deg,#7EA9B8_0%,#6F9FB0_56%,#668F9F_100%)] text-white shadow-[0_24px_48px_rgba(111,159,176,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#C8D8DE] bg-[linear-gradient(180deg,rgba(238,246,248,0.98),rgba(247,250,250,0.92))] shadow-[0_12px_26px_rgba(111,159,176,0.10)]',
    secondaryCard: 'border-[#D6E5EA] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,252,252,0.92))] shadow-[0_8px_18px_rgba(111,159,176,0.06)]',
    line: 'bg-[#C9D9DE]',
    arrow: 'border-[#C1D4DA]',
  },
  green: {
    label: '绿',
    chip: 'border-[#D7E4DA] bg-[#F0F7F1] text-[#698A73]',
    button: 'border-[#D7E4DA] bg-[#F0F7F1] text-[#698A73] hover:bg-[#E9F2EB]',
    selected: 'ring-2 ring-[#D7E4DA]',
    rootCard: 'border-[#6D9077] bg-[linear-gradient(180deg,#8DB196_0%,#7FA58A_56%,#6F9579_100%)] text-white shadow-[0_24px_48px_rgba(127,165,138,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#D1DED4] bg-[linear-gradient(180deg,rgba(240,247,241,0.98),rgba(248,250,247,0.92))] shadow-[0_12px_26px_rgba(127,165,138,0.10)]',
    secondaryCard: 'border-[#DCE8DF] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,252,250,0.92))] shadow-[0_8px_18px_rgba(127,165,138,0.06)]',
    line: 'bg-[#D1DDD3]',
    arrow: 'border-[#C9D8CC]',
  },
  orange: {
    label: '橙',
    chip: 'border-[#E8D8C7] bg-[#FAF3EA] text-[#A67D56]',
    button: 'border-[#E8D8C7] bg-[#FAF3EA] text-[#A67D56] hover:bg-[#F4EBDC]',
    selected: 'ring-2 ring-[#E8D8C7]',
    rootCard: 'border-[#B78758] bg-[linear-gradient(180deg,#D3AA80_0%,#C69A6D_56%,#B78D62_100%)] text-white shadow-[0_24px_48px_rgba(198,154,109,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#E2D2C1] bg-[linear-gradient(180deg,rgba(250,243,234,0.98),rgba(250,248,243,0.92))] shadow-[0_12px_26px_rgba(198,154,109,0.10)]',
    secondaryCard: 'border-[#EBE0D3] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,249,245,0.92))] shadow-[0_8px_18px_rgba(198,154,109,0.06)]',
    line: 'bg-[#E0D2C3]',
    arrow: 'border-[#D7C7B6]',
  },
  purple: {
    label: '紫',
    chip: 'border-[#DDD6E7] bg-[#F5F0FA] text-[#7C6A98]',
    button: 'border-[#DDD6E7] bg-[#F5F0FA] text-[#7C6A98] hover:bg-[#EEE7F5]',
    selected: 'ring-2 ring-[#DDD6E7]',
    rootCard: 'border-[#85739F] bg-[linear-gradient(180deg,#A694C0_0%,#9A88B5_56%,#8D7BA8_100%)] text-white shadow-[0_24px_48px_rgba(154,136,181,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#DED7E8] bg-[linear-gradient(180deg,rgba(245,240,250,0.98),rgba(250,247,252,0.92))] shadow-[0_12px_26px_rgba(154,136,181,0.10)]',
    secondaryCard: 'border-[#E8E0F0] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(251,249,253,0.92))] shadow-[0_8px_18px_rgba(154,136,181,0.06)]',
    line: 'bg-[#D8D0E3]',
    arrow: 'border-[#CDC4DB]',
  },
  rose: {
    label: '玫瑰',
    chip: 'border-[#E8D4D4] bg-[#FAF0F0] text-[#9F6C6C]',
    button: 'border-[#E8D4D4] bg-[#FAF0F0] text-[#9F6C6C] hover:bg-[#F4E7E7]',
    selected: 'ring-2 ring-[#E8D4D4]',
    rootCard: 'border-[#B67878] bg-[linear-gradient(180deg,#CE9A9A_0%,#C58A8A_56%,#B67B7B_100%)] text-white shadow-[0_24px_48px_rgba(197,138,138,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#E4D0D0] bg-[linear-gradient(180deg,rgba(250,240,240,0.98),rgba(251,247,247,0.92))] shadow-[0_12px_26px_rgba(197,138,138,0.10)]',
    secondaryCard: 'border-[#ECDEDE] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(252,248,248,0.92))] shadow-[0_8px_18px_rgba(197,138,138,0.06)]',
    line: 'bg-[#E1CFCF]',
    arrow: 'border-[#D8C4C4]',
  },
  gray: {
    label: '灰',
    chip: 'border-[#D7D7D1] bg-[#F3F2EE] text-[#7D7D76]',
    button: 'border-[#D7D7D1] bg-[#F3F2EE] text-[#7D7D76] hover:bg-[#ECEBE5]',
    selected: 'ring-2 ring-[#D7D7D1]',
    rootCard: 'border-[#84847D] bg-[linear-gradient(180deg,#ABABA4_0%,#9A9A92_56%,#8E8E87_100%)] text-white shadow-[0_24px_48px_rgba(154,154,146,0.22)]',
    rootBadge: 'border-white/18 bg-white/12 text-white/88',
    primaryCard: 'border-[#DDDCD7] bg-[linear-gradient(180deg,rgba(243,242,238,0.98),rgba(250,249,246,0.92))] shadow-[0_12px_26px_rgba(154,154,146,0.10)]',
    secondaryCard: 'border-[#E5E4DE] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,249,246,0.92))] shadow-[0_8px_18px_rgba(154,154,146,0.06)]',
    line: 'bg-[#D7D5CF]',
    arrow: 'border-[#CBC9C3]',
  },
}

function createInitialMindmapTree(): MindmapNode {
  return {
    id: 'root',
    label: '中心主题',
    color: 'blue',
    collapsed: false,
    meta: defaultMindmapMeta,
    children: [],
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeColor(value: unknown): MindmapColor {
  return typeof value === 'string' && colorOrder.includes(value as MindmapColor)
    ? value as MindmapColor
    : 'gray'
}

function normalizeMindmapMeta(value: unknown): MindmapMeta {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    layout: record.layout === 'logic' || record.layout === 'right' || record.layout === 'vertical' || record.layout === 'xmind-axis'
      ? record.layout
      : defaultMindmapMeta.layout,
    background: record.background === 'white' || record.background === 'warm-gray' || record.background === 'dark' || record.background === 'paper'
      ? record.background
      : defaultMindmapMeta.background,
    fontFamily: record.fontFamily === 'sans' || record.fontFamily === 'mono' || record.fontFamily === 'serif'
      ? record.fontFamily
      : defaultMindmapMeta.fontFamily,
    branchLine: record.branchLine === 'default' || record.branchLine === 'thick' || record.branchLine === 'thin'
      ? record.branchLine
      : defaultMindmapMeta.branchLine,
    rainbowBranches: typeof record.rainbowBranches === 'boolean'
      ? record.rainbowBranches
      : defaultMindmapMeta.rainbowBranches,
    compact: typeof record.compact === 'boolean'
      ? record.compact
      : defaultMindmapMeta.compact,
  }
}

function normalizeNode(value: unknown, fallbackId: string): MindmapNode {
  if (!value || typeof value !== 'object') {
    return {
      id: fallbackId,
      label: fallbackId === 'root' ? '中心主题' : '新节点',
      color: fallbackId === 'root' ? 'blue' : 'gray',
      collapsed: false,
      note: '',
      tags: [],
      children: [],
    }
  }

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id ? record.id : fallbackId
  const label = typeof record.label === 'string' && record.label.trim()
    ? record.label
    : (id === 'root' ? '中心主题' : '新节点')
  const note = typeof record.note === 'string' ? record.note : ''
  const tags = Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const childrenSource = Array.isArray(record.children) ? record.children : []

  return {
    id,
    label,
    color: normalizeColor(record.color ?? (id === 'root' ? 'blue' : 'gray')),
    collapsed: typeof record.collapsed === 'boolean' ? record.collapsed : false,
    meta: id === 'root' ? normalizeMindmapMeta(record.meta) : undefined,
    note,
    tags,
    children: childrenSource.map((child, index) => normalizeNode(child, `${id}-${index + 1}`)),
  }
}

function normalizeTree(value: unknown): MindmapNode {
  const node = normalizeNode(value, 'root')
  return {
    ...node,
    id: 'root',
    label: node.label || '中心主题',
    color: normalizeColor(node.color || 'blue'),
    collapsed: false,
    meta: normalizeMindmapMeta(node.meta),
  }
}

function findNodeById(node: MindmapNode, nodeId: string): MindmapNode | null {
  if (node.id === nodeId) return node
  for (const child of node.children) {
    const match = findNodeById(child, nodeId)
    if (match) return match
  }
  return null
}

function findNodeDepth(node: MindmapNode, nodeId: string, depth = 0): number | null {
  if (node.id === nodeId) return depth
  for (const child of node.children) {
    const match = findNodeDepth(child, nodeId, depth + 1)
    if (match !== null) return match
  }
  return null
}

function updateNodeById(
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

function addChildNode(
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

function findParentNode(node: MindmapNode, nodeId: string): MindmapNode | null {
  for (const child of node.children) {
    if (child.id === nodeId) return node
    const match = findParentNode(child, nodeId)
    if (match) return match
  }

  return null
}

function addSiblingNode(
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

function removeNodeById(node: MindmapNode, nodeId: string): { nextNode: MindmapNode; removed: boolean } {
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

function countNodes(node: MindmapNode): number {
  let total = 1
  for (const child of node.children) total += countNodes(child)
  return total
}

function setNodeCollapsed(
  node: MindmapNode,
  nodeId: string,
  collapsed: boolean
): { nextNode: MindmapNode; changed: boolean } {
  return updateNodeById(node, nodeId, current => ({
    ...current,
    collapsed,
  }))
}

function setTreeCollapsedState(node: MindmapNode, collapsed: boolean, keepRootExpanded = false): MindmapNode {
  return {
    ...node,
    collapsed: keepRootExpanded && node.id === 'root' ? false : collapsed,
    children: node.children.map(child => setTreeCollapsedState(child, collapsed, keepRootExpanded)),
  }
}

function findNodePath(node: MindmapNode, nodeId: string, path: string[] = []): string[] | null {
  const nextPath = [...path, node.id]
  if (node.id === nodeId) return nextPath

  for (const child of node.children) {
    const match = findNodePath(child, nodeId, nextPath)
    if (match) return match
  }

  return null
}

function expandPathToNode(node: MindmapNode, nodeId: string): MindmapNode {
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

function collectMatchingNodeIds(node: MindmapNode, keyword: string): string[] {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return []

  const matchesCurrent = buildNodeSearchText(node).includes(normalized) ? [node.id] : []
  const childMatches = node.children.flatMap(child => collectMatchingNodeIds(child, normalized))
  return [...matchesCurrent, ...childMatches]
}

function createNodeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `node-${crypto.randomUUID()}`
  }

  return `node-${Date.now()}`
}

function formatNodeLevel(depth: number) {
  if (depth === 0) return '中心主题'
  if (depth === 1) return '一级节点'
  if (depth === 2) return '二级节点'
  if (depth === 3) return '三级节点'
  return `${depth} 级节点`
}

function sanitizeMindmapFilename(value: string) {
  const sanitized = value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || 'mindmap'
}

function normalizeMarkdownText(value: string, fallback: string) {
  const normalized = value.replace(/\r?\n+/g, ' ').trim()
  return normalized || fallback
}

function buildMarkdownLines(node: MindmapNode, depth = 0): string[] {
  const label = normalizeMarkdownText(node.label, depth === 0 ? '中心主题' : '未命名节点')

  if (depth === 0) {
    const childLines = node.children.flatMap(child => buildMarkdownLines(child, 1))
    return childLines.length > 0 ? [`# ${label}`, '', ...childLines] : [`# ${label}`]
  }

  const lines = [`${'  '.repeat(depth - 1)}- ${label}`]

  for (const child of node.children) {
    lines.push(...buildMarkdownLines(child, depth + 1))
  }

  return lines
}

function buildMindmapMarkdown(tree: MindmapNode) {
  return `${buildMarkdownLines(tree).join('\n')}\n`
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && target.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"]') !== null
}

function canStartInlineEditFromTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && target.closest('button, input, textarea, select, a, [contenteditable="true"], [role="textbox"], [data-inline-editor="true"]') === null
}

function getMindmapFontClass(fontFamily: MindmapFontFamily) {
  if (fontFamily === 'sans') return 'font-sans'
  if (fontFamily === 'mono') return 'font-mono'
  return 'font-serif'
}

function getCanvasSurfaceStyle(background: MindmapBackground) {
  if (background === 'white') {
    return {
      backgroundImage: 'linear-gradient(rgba(134,125,113,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(134,125,113,0.025) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(252,252,250,0.96))',
      backgroundSize: '26px 26px, 26px 26px, auto',
    }
  }

  if (background === 'warm-gray') {
    return {
      backgroundImage: 'linear-gradient(rgba(118,112,103,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(118,112,103,0.035) 1px, transparent 1px), radial-gradient(circle at top left, rgba(148,142,132,0.08), transparent 26%), linear-gradient(180deg, rgba(243,239,232,0.98), rgba(236,231,223,0.96))',
      backgroundSize: '28px 28px, 28px 28px, auto, auto',
    }
  }

  if (background === 'dark') {
    return {
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px), radial-gradient(circle at top left, rgba(137,165,177,0.14), transparent 24%), linear-gradient(180deg, rgba(42,45,50,0.98), rgba(28,31,36,0.98))',
      backgroundSize: '30px 30px, 30px 30px, auto, auto',
    }
  }

  return {
    backgroundImage: 'linear-gradient(rgba(134,125,113,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(134,125,113,0.035) 1px, transparent 1px), radial-gradient(circle at top left, rgba(198,154,109,0.05), transparent 28%), radial-gradient(circle at bottom right, rgba(111,159,176,0.05), transparent 24%), linear-gradient(180deg, rgba(252,250,245,0.98), rgba(246,242,234,0.96))',
    backgroundSize: '28px 28px, 28px 28px, auto, auto, auto',
  }
}

function getBranchLineClasses(branchLine: MindmapBranchLine) {
  if (branchLine === 'default') {
    return {
      horizontal: 'h-[1.5px]',
      vertical: 'w-[1.5px]',
      accent: 'w-[3px]',
    }
  }

  if (branchLine === 'thick') {
    return {
      horizontal: 'h-[2px]',
      vertical: 'w-[2px]',
      accent: 'w-[4px]',
    }
  }

  return {
    horizontal: 'h-px',
    vertical: 'w-px',
    accent: 'w-[2px]',
  }
}

function resolveBranchColor(nodeColor: MindmapColor, branchColor: MindmapColor | undefined, styleMeta: MindmapMeta) {
  return styleMeta.rainbowBranches && branchColor ? branchColor : nodeColor
}

function isDesktopBrowserLayout() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function renderLayoutTemplatePreview(templateId: LayoutTemplateId) {
  const nodeClass = 'absolute h-2.5 rounded-full bg-[#D8CDBF]'
  const lineClass = 'absolute rounded-full bg-[#D8CDBF]/90'

  if (templateId === 'xmind-axis') {
    return (
      <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
        <div className={`${lineClass} left-1/2 top-1/2 h-px w-[42%] -translate-x-1/2 -translate-y-1/2`} />
        <div className={`${nodeClass} left-1/2 top-1/2 w-8 -translate-x-1/2 -translate-y-1/2 bg-[#8EA7B2]`} />
        <div className={`${lineClass} left-[26%] top-[28%] h-px w-[20%]`} />
        <div className={`${lineClass} left-[54%] top-[28%] h-px w-[20%]`} />
        <div className={`${lineClass} left-[26%] top-[68%] h-px w-[20%]`} />
        <div className={`${lineClass} left-[54%] top-[68%] h-px w-[20%]`} />
        <div className={`${nodeClass} left-[14%] top-[24%] w-7 bg-[#B7A58D]`} />
        <div className={`${nodeClass} right-[14%] top-[24%] w-7 bg-[#93AD99]`} />
        <div className={`${nodeClass} left-[14%] top-[64%] w-7 bg-[#A68FB5]`} />
        <div className={`${nodeClass} right-[14%] top-[64%] w-7 bg-[#C49A85]`} />
      </div>
    )
  }

  if (templateId === 'right') {
    return (
      <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
        <div className={`${nodeClass} left-[16%] top-1/2 w-8 -translate-y-1/2 bg-[#8EA7B2]`} />
        <div className={`${lineClass} left-[31%] top-1/2 h-px w-[18%] -translate-y-1/2`} />
        <div className={`${lineClass} left-[49%] top-[26%] h-[48%] w-px`} />
        <div className={`${lineClass} left-[49%] top-[26%] h-px w-[24%]`} />
        <div className={`${lineClass} left-[49%] top-1/2 h-px w-[24%] -translate-y-1/2`} />
        <div className={`${lineClass} left-[49%] top-[74%] h-px w-[24%] -translate-y-full`} />
        <div className={`${nodeClass} left-[74%] top-[22%] w-8 bg-[#B7A58D]`} />
        <div className={`${nodeClass} left-[74%] top-[46%] w-8 bg-[#93AD99]`} />
        <div className={`${nodeClass} left-[74%] top-[68%] w-8 bg-[#C49A85]`} />
      </div>
    )
  }

  if (templateId === 'logic') {
    return (
      <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
        <div className={`${nodeClass} left-1/2 top-[20%] w-8 -translate-x-1/2 bg-[#8EA7B2]`} />
        <div className={`${lineClass} left-1/2 top-[32%] h-[18%] w-px -translate-x-1/2`} />
        <div className={`${lineClass} left-[25%] top-[50%] h-px w-[50%]`} />
        <div className={`${lineClass} left-[25%] top-[50%] h-[18%] w-px`} />
        <div className={`${lineClass} left-1/2 top-[50%] h-[18%] w-px -translate-x-1/2`} />
        <div className={`${lineClass} right-[25%] top-[50%] h-[18%] w-px`} />
        <div className={`${nodeClass} left-[17%] top-[64%] w-8 bg-[#B7A58D]`} />
        <div className={`${nodeClass} left-1/2 top-[64%] w-8 -translate-x-1/2 bg-[#93AD99]`} />
        <div className={`${nodeClass} right-[17%] top-[64%] w-8 bg-[#A68FB5]`} />
      </div>
    )
  }

  if (templateId === 'organization') {
    return (
      <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
        <div className={`${nodeClass} left-1/2 top-[16%] w-8 -translate-x-1/2 bg-[#8EA7B2]`} />
        <div className={`${lineClass} left-1/2 top-[28%] h-[12%] w-px -translate-x-1/2`} />
        <div className={`${lineClass} left-[24%] top-[40%] h-px w-[52%]`} />
        <div className={`${lineClass} left-[24%] top-[40%] h-[16%] w-px`} />
        <div className={`${lineClass} left-1/2 top-[40%] h-[16%] w-px -translate-x-1/2`} />
        <div className={`${lineClass} right-[24%] top-[40%] h-[16%] w-px`} />
        <div className={`${nodeClass} left-[16%] top-[58%] w-8 bg-[#B7A58D]`} />
        <div className={`${nodeClass} left-1/2 top-[58%] w-8 -translate-x-1/2 bg-[#93AD99]`} />
        <div className={`${nodeClass} right-[16%] top-[58%] w-8 bg-[#C49A85]`} />
      </div>
    )
  }

  if (templateId === 'timeline') {
    return (
      <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
        <div className={`${lineClass} left-[12%] top-1/2 h-px w-[76%] -translate-y-1/2`} />
        <div className="absolute left-[18%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[#CDBEAC] bg-white" />
        <div className="absolute left-[42%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[#CDBEAC] bg-white" />
        <div className="absolute left-[66%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[#CDBEAC] bg-white" />
        <div className={`${nodeClass} left-[12%] top-[20%] w-8 bg-[#8EA7B2]`} />
        <div className={`${nodeClass} left-[36%] top-[60%] w-8 bg-[#B7A58D]`} />
        <div className={`${nodeClass} left-[60%] top-[20%] w-8 bg-[#93AD99]`} />
      </div>
    )
  }

  return (
    <div className="relative h-[84px] overflow-hidden rounded-[16px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.96))]">
      <div className={`${nodeClass} left-[12%] top-1/2 w-8 -translate-y-1/2 bg-[#8EA7B2]`} />
      <div className={`${lineClass} left-[31%] top-1/2 h-px w-[18%] -translate-y-1/2`} />
      <div className={`${lineClass} left-[48%] top-1/2 h-px w-[28%] -translate-y-1/2`} />
      <div className={`${lineClass} left-[48%] top-[32%] h-px w-[20%]`} />
      <div className={`${lineClass} left-[48%] top-[68%] h-px w-[20%] -translate-y-full`} />
      <div className={`${nodeClass} left-[74%] top-[22%] w-7 bg-[#B7A58D]`} />
      <div className={`${nodeClass} left-[74%] top-[46%] w-7 bg-[#93AD99]`} />
      <div className={`${nodeClass} left-[74%] top-[68%] w-7 bg-[#C49A85]`} />
    </div>
  )
}

type TreeNodeCardProps = {
  depth: number
  node: MindmapNode
  styleMeta: MindmapMeta
  branchColor?: MindmapColor
  selectedNodeId: string
  onAddChild: (nodeId: string) => void
  onAddSibling: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onInlineEditCancel: () => void
  onInlineEditChange: (value: string) => void
  onInlineEditCommit: () => void
  onInlineEditStart: (nodeId: string) => void
  onSelect: (nodeId: string) => void
  onToggleCollapse: (nodeId: string) => void
  activeSearchNodeId: string | null
  editingNodeId: string | null
  editingNodeLabel: string
  matchedNodeIds: Set<string>
}

function nodeActionClassName(level: 'root' | 'primary' | 'secondary', emphasis: 'default' | 'muted' | 'danger' = 'default') {
  if (level === 'root') {
    return emphasis === 'muted'
      ? 'border border-white/10 bg-white/6 text-white/74 hover:border-white/18 hover:bg-white/12 hover:text-white'
      : 'border border-white/14 bg-white/10 text-white/92 hover:border-white/22 hover:bg-white/16 hover:text-white'
  }

  if (emphasis === 'danger') {
    return 'border border-transparent bg-transparent text-[#A06F6F] hover:border-[#E4CDCD] hover:bg-[#FAF1F1] hover:text-[#945F5F]'
  }

  if (emphasis === 'muted') {
    return 'border border-transparent bg-transparent text-ink-500 hover:border-[#E1D8CB] hover:bg-[#FAF8F3] hover:text-ink-800'
  }

  return 'border border-[#E6DDD0] bg-[rgba(255,255,255,0.96)] text-ink-700 hover:border-[#CCBEAA] hover:bg-white hover:text-ink-900'
}

type MindmapRendererProps = Omit<TreeNodeCardProps, 'depth' | 'node'>

function getNodeSearchHighlightClass(
  isRoot: boolean,
  isSearchMatch: boolean,
  isActiveSearchMatch: boolean
) {
  if (isActiveSearchMatch) {
    return isRoot
      ? 'shadow-[0_0_0_3px_rgba(255,255,255,0.22),0_28px_62px_rgba(31,41,55,0.2)]'
      : 'border-[#CDBCA3] shadow-[0_0_0_3px_rgba(216,204,185,0.88),0_22px_46px_rgba(148,163,184,0.24)]'
  }

  if (isSearchMatch) {
    return isRoot
      ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.16),0_26px_56px_rgba(31,41,55,0.18)]'
      : 'border-[#D9CEBF] shadow-[0_0_0_2px_rgba(228,220,206,0.82),0_18px_38px_rgba(148,163,184,0.18)]'
  }

  return null
}

function DesktopNodeActions({
  depth,
  hasChildren,
  isCollapsed,
  isSelected,
  node,
  onAddChild,
  onAddSibling,
  onDelete,
  onInlineEditStart,
  onToggleCollapse,
}: {
  depth: number
  hasChildren: boolean
  isCollapsed: boolean
  isSelected: boolean
  node: MindmapNode
  onAddChild: (nodeId: string) => void
  onAddSibling: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onInlineEditStart: (nodeId: string) => void
  onToggleCollapse: (nodeId: string) => void
}) {
  const level = depth === 0 ? 'root' : depth === 1 ? 'primary' : 'secondary'
  const actionButtonClassName = cn(
    'h-7 min-h-7 w-7 min-w-7 rounded-full px-0 text-[11px] font-medium tracking-normal shadow-none',
    depth === 0 && 'h-7.5 min-h-7.5 w-7.5 min-w-7.5 text-[10px]'
  )

  return (
    <div
      className={cn(
        'absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full px-1.5 py-1 shadow-[0_14px_24px_rgba(130,120,103,0.12)] backdrop-blur-sm transition-all duration-150',
        depth === 0
          ? 'border border-white/12 bg-[rgba(255,255,255,0.08)]'
          : 'border border-[#E8E0D3] bg-[rgba(255,255,255,0.88)]',
        isSelected
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'
      )}
    >
      <Button
        size="sm"
        variant="ghost"
        title="添加子主题"
        aria-label="添加子主题"
        className={cn(actionButtonClassName, nodeActionClassName(level))}
        onClick={() => onAddChild(node.id)}
      >
        子
      </Button>
      {depth > 0 && (
        <Button
          size="sm"
          variant="ghost"
          title="添加同级节点"
          aria-label="添加同级节点"
          className={cn(actionButtonClassName, nodeActionClassName(level))}
          onClick={() => onAddSibling(node.id)}
        >
          同
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        title="编辑节点"
        aria-label="编辑节点"
        className={cn(actionButtonClassName, nodeActionClassName(level, 'muted'))}
        onClick={() => onInlineEditStart(node.id)}
      >
        编
      </Button>
      {hasChildren && (
        <Button
          size="sm"
          variant="ghost"
          title={isCollapsed ? '展开当前分支' : '折叠当前分支'}
          aria-label={isCollapsed ? '展开当前分支' : '折叠当前分支'}
          className={cn(actionButtonClassName, nodeActionClassName(level, 'muted'))}
          onClick={() => onToggleCollapse(node.id)}
        >
          {isCollapsed ? '展' : '折'}
        </Button>
      )}
      {depth > 0 && (
        <Button
          size="sm"
          variant="ghost"
          title="删除节点"
          aria-label="删除节点"
          className={cn(actionButtonClassName, nodeActionClassName(level, 'danger'))}
          onClick={() => onDelete(node.id)}
        >
          删
        </Button>
      )}
    </div>
  )
}

function DesktopBranchNode({
  depth,
  branchColor,
  node,
  styleMeta,
  selectedNodeId,
  onAddChild,
  onAddSibling,
  onDelete,
  onInlineEditCancel,
  onInlineEditChange,
  onInlineEditCommit,
  onInlineEditStart,
  onSelect,
  onToggleCollapse,
  activeSearchNodeId,
  editingNodeId,
  editingNodeLabel,
  matchedNodeIds,
}: { depth: number; node: MindmapNode } & MindmapRendererProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, styleMeta)]
  const fontClass = getMindmapFontClass(styleMeta.fontFamily)
  const lineClasses = getBranchLineClasses(styleMeta.branchLine)
  const isSelected = node.id === selectedNodeId
  const isInlineEditing = editingNodeId === node.id
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const isSearchMatch = matchedNodeIds.has(node.id)
  const isActiveSearchMatch = activeSearchNodeId === node.id
  const searchHighlightClass = getNodeSearchHighlightClass(false, isSearchMatch, isActiveSearchMatch)
  const isSecondary = depth === 2

  return (
    <div className="relative scroll-m-[140px] pl-12" data-node-id={node.id}>
      <div className={cn('pointer-events-none absolute left-0 top-[18px] w-12 opacity-70', tone.line, lineClasses.horizontal)} />
      <div className="pointer-events-none absolute left-0 top-[18px] bottom-[18px] w-12">
        <div className={cn('absolute left-0 top-0 h-full opacity-35', tone.line, lineClasses.vertical)} />
      </div>
      <div className={cn('pointer-events-none absolute left-[-4px] top-[14px] h-2.5 w-2.5 rounded-full border border-white/70 bg-white shadow-sm', tone.line)} />
      <div className={cn('flex items-start', styleMeta.compact ? 'gap-3.5' : 'gap-5')}>
        <div className={cn('relative', styleMeta.compact ? 'min-w-[194px] max-w-[236px]' : 'min-w-[216px] max-w-[264px]', isSecondary ? 'pt-0' : 'pt-0.5')}>
          <div
            className={cn(
              'group relative overflow-hidden border transition-all duration-200',
              isSecondary
                ? cn('rounded-[16px] border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,246,241,0.96))]', styleMeta.compact ? 'pl-6 pr-4 py-2' : 'pl-7 pr-5 py-2.5')
                : cn('rounded-[18px] border-[#E5DDD1] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,238,0.95))]', styleMeta.compact ? 'pl-6 pr-4 py-2.5' : 'pl-7 pr-5 py-3'),
              tone.secondaryCard,
              isSelected
                ? 'border-[#CFC2AE] shadow-[0_12px_26px_rgba(130,120,103,0.10)] ring-2 ring-[#E8DECF]'
                : 'shadow-[0_4px_10px_rgba(130,120,103,0.04)] hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(130,120,103,0.08)]',
              searchHighlightClass
            )}
            onClick={() => onSelect(node.id)}
            onDoubleClick={(event) => {
              if (!canStartInlineEditFromTarget(event.target)) return
              event.preventDefault()
              event.stopPropagation()
              onInlineEditStart(node.id)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(node.id)
              }
            }}
          >
            <div className={cn('pointer-events-none absolute left-[-12px] top-1/2 w-12 -translate-y-1/2 opacity-55', tone.line, lineClasses.horizontal)} />
            <div className={cn('pointer-events-none absolute inset-y-3 left-2 w-[3px] rounded-full opacity-70', tone.line)} />
            <div className="relative pl-2 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[8px] uppercase tracking-[0.18em] text-ink-400">{formatNodeLevel(depth)}</span>
                {isSelected && (
                  <span className="rounded-full border border-[#E4DCCF] bg-white px-2 py-0.5 text-[8px] text-ink-500">
                    选中
                  </span>
                )}
              </div>
              <div className="mt-1 min-w-0">
                {isInlineEditing ? (
                  <input
                    autoFocus
                    data-inline-editor="true"
                    value={editingNodeLabel}
                    onChange={event => onInlineEditChange(event.target.value)}
                    onFocus={event => event.currentTarget.select()}
                    onBlur={onInlineEditCommit}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onInlineEditCommit()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        onInlineEditCancel()
                      }
                    }}
                    className="w-full rounded-[12px] border border-[#DDD5C8] bg-transparent px-2.5 py-1 text-sm text-ink-900 outline-none placeholder:text-ink-400"
                    placeholder="输入节点名称"
                  />
                ) : (
                  <p
                    className={cn(
                      'break-words text-ink-900',
                      fontClass,
                      isSecondary ? 'text-[0.88rem] font-medium leading-[1.25rem]' : 'text-[0.88rem] leading-[1.3rem]'
                    )}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      onInlineEditStart(node.id)
                    }}
                  >
                    {node.label || '未命名节点'}
                  </p>
                )}
                <p className="mt-1 text-[10px] leading-5 text-ink-500">
                  {hasChildren
                    ? isCollapsed
                      ? `已折叠 ${node.children.length} 个子节点`
                      : `${node.children.length} 个子节点`
                    : '子条目'}
                </p>
              </div>
              <DesktopNodeActions
                depth={depth}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                isSelected={isSelected}
                node={node}
                onAddChild={onAddChild}
                onAddSibling={onAddSibling}
                onDelete={onDelete}
                onInlineEditStart={onInlineEditStart}
                onToggleCollapse={onToggleCollapse}
              />
            </div>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className={cn('relative pl-2', styleMeta.compact ? 'min-w-[172px]' : 'min-w-[190px]')}>
            <div className={cn('pointer-events-none absolute left-0 top-3 bottom-3 opacity-32', tone.line, lineClasses.vertical)} />
            <div className={cn(styleMeta.compact ? 'space-y-2.5' : 'space-y-3')}>
              {node.children.map(child => (
                <DesktopBranchNode
                  key={child.id}
                  depth={depth + 1}
                  branchColor={branchColor}
                  node={child}
                  styleMeta={styleMeta}
                  selectedNodeId={selectedNodeId}
                  onAddChild={onAddChild}
                  onAddSibling={onAddSibling}
                  onDelete={onDelete}
                  onInlineEditCancel={onInlineEditCancel}
                  onInlineEditChange={onInlineEditChange}
                  onInlineEditCommit={onInlineEditCommit}
                  onInlineEditStart={onInlineEditStart}
                  onSelect={onSelect}
                  onToggleCollapse={onToggleCollapse}
                  activeSearchNodeId={activeSearchNodeId}
                  editingNodeId={editingNodeId}
                  editingNodeLabel={editingNodeLabel}
                  matchedNodeIds={matchedNodeIds}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DesktopPrimaryColumn({
  branchColor,
  index,
  node,
  ...props
}: { index: number; node: MindmapNode } & MindmapRendererProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, props.styleMeta)]
  const fontClass = getMindmapFontClass(props.styleMeta.fontFamily)
  const lineClasses = getBranchLineClasses(props.styleMeta.branchLine)
  const isSelected = node.id === props.selectedNodeId
  const isInlineEditing = props.editingNodeId === node.id
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const isSearchMatch = props.matchedNodeIds.has(node.id)
  const isActiveSearchMatch = props.activeSearchNodeId === node.id
  const searchHighlightClass = getNodeSearchHighlightClass(false, isSearchMatch, isActiveSearchMatch)
  const branchUp = index % 2 === 0

  return (
    <div className={cn('relative flex shrink-0 flex-col justify-center', props.styleMeta.compact ? 'w-[300px]' : 'w-[344px]')}>
      <div className="pointer-events-none absolute left-0 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white shadow-sm" />
      <div className={cn('pointer-events-none absolute left-[2px] top-1/2 w-9 -translate-y-1/2 opacity-70', tone.line, lineClasses.horizontal)} />
      <div className={cn('flex flex-col justify-end', props.styleMeta.compact ? 'min-h-[176px]' : 'min-h-[220px]')}>
        {branchUp && hasChildren && !isCollapsed ? (
          <div className={cn('relative', props.styleMeta.compact ? 'pb-6' : 'pb-9')}>
            <div className={cn('pointer-events-none absolute left-[58px] opacity-40', tone.line, props.styleMeta.compact ? 'bottom-0 h-6' : 'bottom-0 h-9', lineClasses.vertical)} />
            <div className={cn('relative flex flex-col items-start', props.styleMeta.compact ? 'gap-3' : 'gap-4')}>
              {node.children.map(child => (
                <DesktopBranchNode key={child.id} depth={2} branchColor={branchColor} node={child} {...props} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className={cn('relative flex items-center justify-start', props.styleMeta.compact ? 'py-3.5' : 'py-5')}>
        {hasChildren && (
          <div
            className={cn(
              'pointer-events-none absolute left-[58px] opacity-40',
              branchUp ? 'top-0 h-5' : 'bottom-0 h-5',
              tone.line,
              lineClasses.vertical
            )}
          />
        )}
        <div className={cn('relative scroll-m-[140px]', props.styleMeta.compact ? 'pl-10' : 'pl-12')} data-node-id={node.id}>
          <div
            className={cn(
              'group relative overflow-hidden rounded-[18px] border transition-all duration-200',
              props.styleMeta.compact ? 'min-h-[78px] w-[248px] pl-7 pr-5 py-3.5' : 'min-h-[88px] w-[292px] pl-8 pr-6 py-4',
              'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,242,235,0.94))]',
              tone.primaryCard,
              isSelected
                ? 'border-[#CDBFA9] shadow-[0_18px_36px_rgba(130,120,103,0.13)] ring-2 ring-[#ECE2D3]'
                : 'shadow-[0_8px_18px_rgba(130,120,103,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(130,120,103,0.10)]',
              searchHighlightClass
            )}
            onClick={() => props.onSelect(node.id)}
            onDoubleClick={(event) => {
              if (!canStartInlineEditFromTarget(event.target)) return
              event.preventDefault()
              event.stopPropagation()
              props.onInlineEditStart(node.id)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                props.onSelect(node.id)
              }
            }}
          >
            <div className={cn('pointer-events-none absolute left-[-42px] top-1/2 w-12 -translate-y-1/2 opacity-60', tone.line, lineClasses.horizontal)} />
            <div className={cn('pointer-events-none absolute inset-y-4 left-2 w-[4px] rounded-full opacity-80', tone.line)} />
            <div className="relative pl-2 pr-16">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.18em] text-ink-400">主题</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[9px] leading-none', tone.chip)}>
                  {tone.label}
                </span>
                {isSelected && (
                  <span className="rounded-full border border-white/90 bg-white px-2 py-0.5 text-[9px] leading-none text-ink-600 shadow-sm">
                    选中
                  </span>
                )}
              </div>
              <div className="mt-2 min-w-0 pr-3">
                {isInlineEditing ? (
                  <input
                    autoFocus
                    data-inline-editor="true"
                    value={props.editingNodeLabel}
                    onChange={event => props.onInlineEditChange(event.target.value)}
                    onFocus={event => event.currentTarget.select()}
                    onBlur={props.onInlineEditCommit}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        props.onInlineEditCommit()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        props.onInlineEditCancel()
                      }
                    }}
                    className="w-full rounded-[14px] border border-[#DDD5C8] bg-transparent px-3 py-1.5 text-[0.98rem] leading-6 text-ink-900 outline-none placeholder:text-ink-400"
                    placeholder="输入节点名称"
                  />
                ) : (
                  <h3
                    className={cn('break-words font-medium text-[1rem] leading-[1.35] text-ink-900', fontClass)}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      props.onInlineEditStart(node.id)
                    }}
                  >
                    {node.label || '未命名节点'}
                  </h3>
                )}
                <p className="mt-1.5 text-[11px] leading-5 text-ink-500">
                  {hasChildren
                    ? isCollapsed
                      ? `已折叠 ${node.children.length} 个分支`
                      : `${node.children.length} 个分支`
                    : '暂无子主题'}
                </p>
              </div>
              <DesktopNodeActions
                depth={1}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                isSelected={isSelected}
                node={node}
                onAddChild={props.onAddChild}
                onAddSibling={props.onAddSibling}
                onDelete={props.onDelete}
                onInlineEditStart={props.onInlineEditStart}
                onToggleCollapse={props.onToggleCollapse}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={cn('flex flex-col', props.styleMeta.compact ? 'min-h-[176px]' : 'min-h-[220px]')}>
        {!branchUp && hasChildren && !isCollapsed ? (
          <div className={cn('relative', props.styleMeta.compact ? 'pt-6' : 'pt-9')}>
            <div className={cn('pointer-events-none absolute left-[58px] top-0 opacity-40', tone.line, props.styleMeta.compact ? 'h-6' : 'h-9', lineClasses.vertical)} />
            <div className={cn('relative flex flex-col items-start', props.styleMeta.compact ? 'gap-3' : 'gap-4')}>
              {node.children.map(child => (
                <DesktopBranchNode key={child.id} depth={2} branchColor={branchColor} node={child} {...props} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DesktopMindmapCanvas({
  tree,
  useDesktopLayout = false,
  ...props
}: { tree: MindmapNode; useDesktopLayout?: boolean } & MindmapRendererProps) {
  const tone = colorMeta[tree.color]
  const fontClass = getMindmapFontClass(props.styleMeta.fontFamily)
  const lineClasses = getBranchLineClasses(props.styleMeta.branchLine)
  const isSelected = tree.id === props.selectedNodeId
  const isInlineEditing = props.editingNodeId === tree.id
  const hasChildren = tree.children.length > 0
  const isCollapsed = Boolean(tree.collapsed) && hasChildren
  const isSearchMatch = props.matchedNodeIds.has(tree.id)
  const isActiveSearchMatch = props.activeSearchNodeId === tree.id
  const searchHighlightClass = getNodeSearchHighlightClass(true, isSearchMatch, isActiveSearchMatch)

  return (
    <div className={cn('hidden min-w-max', useDesktopLayout ? 'block' : 'lg:block')}>
      <div className={cn('flex min-h-[720px] items-center', props.styleMeta.compact ? 'gap-10 px-10 py-10' : 'gap-16 px-16 py-14')}>
        <div className="relative scroll-m-[140px] shrink-0" data-node-id={tree.id}>
          <div className="pointer-events-none absolute inset-[-16px] rounded-[42px] border border-white/35 bg-[radial-gradient(circle,rgba(255,255,255,0.10),transparent_72%)]" />
          <div
            className={cn(
              'group relative min-h-[176px] w-[312px] overflow-hidden rounded-[34px] border px-9 py-7 transition-all duration-200',
              tone.rootCard,
              isSelected
                ? 'border-white/26 shadow-[0_28px_62px_rgba(31,41,55,0.2)] ring-1 ring-white/18'
                : 'hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(31,41,55,0.16)]',
              searchHighlightClass
            )}
            onClick={() => props.onSelect(tree.id)}
            onDoubleClick={(event) => {
              if (!canStartInlineEditFromTarget(event.target)) return
              event.preventDefault()
              event.stopPropagation()
              props.onInlineEditStart(tree.id)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                props.onSelect(tree.id)
              }
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(63,85,96,0.18),transparent_34%)]" />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/18" />
            <div className="relative flex h-full flex-col items-center justify-between pr-16 text-center">
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <span className="text-[11px] uppercase tracking-[0.24em] text-white/72">中心主题</span>
                <span className={cn('rounded-full border px-3 py-1 text-[10px] leading-none', tone.rootBadge)}>
                  {tone.label}
                </span>
                {isSelected && (
                  <span className="rounded-full border border-white/20 bg-white/14 px-3 py-1 text-[10px] text-white">
                    当前选中
                  </span>
                )}
              </div>
              <div className="mt-6 min-w-0">
                {isInlineEditing ? (
                  <input
                    autoFocus
                    data-inline-editor="true"
                    value={props.editingNodeLabel}
                    onChange={event => props.onInlineEditChange(event.target.value)}
                    onFocus={event => event.currentTarget.select()}
                    onBlur={props.onInlineEditCommit}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        props.onInlineEditCommit()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        props.onInlineEditCancel()
                      }
                    }}
                    className={cn('w-full rounded-[18px] border border-white/20 bg-transparent px-3 py-2 text-center text-[1.72rem] leading-[1.18] text-white outline-none placeholder:text-white/56', fontClass)}
                    placeholder="输入节点名称"
                  />
                ) : (
                  <h3
                    className={cn('break-words text-[1.82rem] leading-[1.18] text-white', fontClass)}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      props.onInlineEditStart(tree.id)
                    }}
                  >
                    {tree.label || '中心主题'}
                  </h3>
                )}
                <p className="mt-3 text-sm leading-6 text-white/76">
                  {hasChildren
                    ? isCollapsed
                      ? `主轴已收起，共 ${tree.children.length} 个一级主题`
                      : `${tree.children.length} 个一级主题`
                    : '暂无一级主题'}
                </p>
              </div>
              <DesktopNodeActions
                depth={0}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                isSelected={isSelected}
                node={tree}
                onAddChild={props.onAddChild}
                onAddSibling={props.onAddSibling}
                onDelete={props.onDelete}
                onInlineEditStart={props.onInlineEditStart}
                onToggleCollapse={props.onToggleCollapse}
              />
            </div>
          </div>
        </div>

        {hasChildren && !isCollapsed ? (
          <div className={cn('relative flex', props.styleMeta.compact ? 'gap-7 pl-7' : 'gap-11 pl-10')}>
            <div className={cn('pointer-events-none absolute -left-10 top-1/2 w-10 -translate-y-1/2 opacity-70', tone.line, lineClasses.horizontal)} />
            <div className={cn('pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 opacity-35', tone.line, lineClasses.horizontal)} />
            <div className={cn('pointer-events-none absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-white/80 bg-white shadow-sm', tone.line)} />
            {tree.children.map((child, index) => (
              <DesktopPrimaryColumn
                key={child.id}
                index={index}
                branchColor={colorOrder[index % colorOrder.length]}
                node={child}
                {...props}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-[#E1D9CC] bg-[rgba(252,250,245,0.84)] px-7 py-5 text-sm leading-7 text-ink-500">
            {hasChildren
              ? '当前中心主题的主轴已收起，可通过节点按钮或右侧面板重新展开。'
              : '先添加一级主题，画布会沿主轴横向展开。'}
          </div>
        )}
      </div>
    </div>
  )
}

function TreeNodeCard({
  branchColor,
  depth,
  node,
  styleMeta,
  selectedNodeId,
  onAddChild,
  onAddSibling,
  onDelete,
  onInlineEditCancel,
  onInlineEditChange,
  onInlineEditCommit,
  onInlineEditStart,
  onSelect,
  onToggleCollapse,
  activeSearchNodeId,
  editingNodeId,
  editingNodeLabel,
  matchedNodeIds,
}: TreeNodeCardProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, styleMeta)]
  const fontClass = getMindmapFontClass(styleMeta.fontFamily)
  const isSelected = node.id === selectedNodeId
  const isRoot = node.id === 'root'
  const isPrimary = depth === 1
  const isInlineEditing = editingNodeId === node.id
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const isSearchMatch = matchedNodeIds.has(node.id)
  const isActiveSearchMatch = activeSearchNodeId === node.id
  const searchHighlightClass = isActiveSearchMatch
    ? isRoot
      ? 'shadow-[0_0_0_3px_rgba(255,255,255,0.22),0_28px_62px_rgba(31,41,55,0.2)]'
      : 'border-[#CDBCA3] shadow-[0_0_0_3px_rgba(216,204,185,0.88),0_22px_46px_rgba(148,163,184,0.24)]'
    : isSearchMatch
      ? isRoot
        ? 'shadow-[0_0_0_2px_rgba(255,255,255,0.16),0_26px_56px_rgba(31,41,55,0.18)]'
        : 'border-[#D9CEBF] shadow-[0_0_0_2px_rgba(228,220,206,0.82),0_18px_38px_rgba(148,163,184,0.18)]'
      : null
  const level = isRoot ? 'root' : isPrimary ? 'primary' : 'secondary'

  return (
    <div className="relative scroll-m-[120px]" data-node-id={node.id}>
      <div className={cn('flex flex-col gap-6 lg:gap-9', node.children.length > 0 && 'lg:flex-row lg:items-center')}>
        <div
          className={cn(
            'relative z-10 min-w-0',
            isRoot ? 'lg:w-[344px] xl:w-[376px]' : isPrimary ? 'lg:w-[272px]' : 'lg:w-[228px]'
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden border transition-all duration-200',
              isRoot
                ? 'min-h-[228px] rounded-[32px] px-7 py-7 sm:min-h-[236px] sm:rounded-[38px] sm:px-10 sm:py-9'
                : isPrimary
                  ? 'min-h-[170px] rounded-[24px] px-7 py-5 sm:min-h-[178px] sm:rounded-[30px] sm:px-7 sm:py-6'
                  : 'min-h-[140px] rounded-[22px] px-6 py-[18px] sm:min-h-[144px] sm:rounded-[26px] sm:px-6 sm:py-5',
              isRoot ? tone.rootCard : isPrimary ? tone.primaryCard : tone.secondaryCard,
              isSelected
                ? cn(
                  tone.selected,
                  isRoot
                    ? 'border-white/26 shadow-[0_28px_62px_rgba(31,41,55,0.2)] ring-1 ring-white/18'
                    : 'border-[#CFC5B6] shadow-[0_20px_42px_rgba(148,163,184,0.2)] ring-2 ring-offset-2 ring-offset-[#F7F3EC]'
                )
                : 'hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(148,163,184,0.16)]'
              ,
              searchHighlightClass
            )}
            onClick={() => onSelect(node.id)}
            onDoubleClick={(event) => {
              if (!canStartInlineEditFromTarget(event.target)) return
              event.preventDefault()
              event.stopPropagation()
              onInlineEditStart(node.id)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(node.id)
              }
            }}
          >
            {isRoot ? (
              <>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(63,85,96,0.18),transparent_34%)]" />
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/22" />
              </>
            ) : isPrimary ? (
              <>
                <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-[30px]', tone.line)} />
                <div className={cn('pointer-events-none absolute inset-y-7 left-0 w-1.5 rounded-r-full opacity-80', tone.line)} />
              </>
            ) : (
              <div className={cn('pointer-events-none absolute inset-y-6 left-0 w-[3px] rounded-r-full opacity-75', tone.line)} />
            )}

            <div className={cn('relative flex h-full flex-col', isRoot ? 'items-center justify-between text-center' : 'justify-between')}>
              <div className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-2', isRoot && 'justify-center')}>
                <span className={cn(
                  'text-[11px] uppercase leading-none tracking-[0.24em]',
                  isRoot ? 'text-white/70' : isPrimary ? 'text-ink-500' : 'text-ink-400'
                )}>
                  {formatNodeLevel(depth)}
                </span>
                <span className={cn('rounded-full border px-3.5 py-1.5 text-xs leading-none', isRoot ? tone.rootBadge : tone.chip)}>
                  {tone.label}
                </span>
                {isSelected && (
                  <span className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs leading-none',
                    isRoot
                      ? 'border-white/20 bg-white/14 text-white'
                      : 'border-white/90 bg-white text-ink-600 shadow-sm'
                  )}>
                    当前选中
                  </span>
                )}
              </div>

              <div className={cn('min-w-0', isRoot ? 'mt-7' : 'mt-5')}>
                {isInlineEditing ? (
                  <input
                    autoFocus
                    data-inline-editor="true"
                    value={editingNodeLabel}
                    onChange={event => onInlineEditChange(event.target.value)}
                    onFocus={event => event.currentTarget.select()}
                    onBlur={onInlineEditCommit}
                    onClick={event => event.stopPropagation()}
                    onDoubleClick={event => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        onInlineEditCommit()
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        onInlineEditCancel()
                      }
                    }}
                    className={cn(
                      'w-full rounded-[18px] border bg-transparent px-3 py-2 font-serif outline-none',
                      fontClass,
                      isRoot
                        ? 'border-white/20 text-[2rem] leading-[1.22] text-white placeholder:text-white/56'
                        : isPrimary
                          ? 'border-[#D8D0C3] text-[1.2rem] leading-[1.38] text-ink-900 placeholder:text-ink-400'
                          : 'border-[#DDD5C8] text-[1.02rem] leading-snug text-ink-900 placeholder:text-ink-400'
                    )}
                    placeholder="输入节点名称"
                  />
                ) : (
                  <h3
                    className={cn(
                      'break-words font-serif',
                      fontClass,
                      isRoot
                        ? 'text-[1.88rem] leading-[1.18] text-white sm:text-[2.12rem] sm:leading-[1.22]'
                        : isPrimary
                          ? 'text-[1.16rem] leading-[1.34] text-ink-900 sm:text-[1.24rem] sm:leading-[1.38]'
                          : 'text-[1rem] leading-snug text-ink-900 sm:text-[1.05rem]'
                    )}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      onInlineEditStart(node.id)
                    }}
                  >
                    {node.label || '未命名节点'}
                  </h3>
                )}
                <p className={cn(
                  'text-sm leading-6',
                  isRoot ? 'mt-3 text-white/76' : isPrimary ? 'mt-3 text-ink-600' : 'mt-2.5 text-ink-500'
                )}>
                  {hasChildren
                    ? isCollapsed
                      ? `已收起 ${node.children.length} 个子节点`
                      : `${node.children.length} 个子节点`
                    : '暂无子节点'}
                </p>
              </div>

              <div className={cn('mt-6 flex flex-wrap gap-2.5 sm:mt-7 sm:gap-3', isRoot && 'justify-center')}>
                <Button
                  size="sm"
                  variant="secondary"
                  className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level))}
                  onClick={() => onSelect(node.id)}
                >
                  选择节点
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level, 'muted'))}
                  onClick={() => onInlineEditStart(node.id)}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant={isRoot ? 'secondary' : 'ghost'}
                  className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level))}
                  onClick={() => onAddChild(node.id)}
                >
                  添加子节点
                </Button>
                {hasChildren && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level, 'muted'))}
                    onClick={() => onToggleCollapse(node.id)}
                  >
                    {isCollapsed ? '展开' : '收起'}
                  </Button>
                )}
                {!isRoot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level))}
                    onClick={() => onAddSibling(node.id)}
                  >
                    添加同级
                  </Button>
                )}
                {!isRoot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn('min-h-10 rounded-full px-4', nodeActionClassName(level, 'danger'))}
                    onClick={() => onDelete(node.id)}
                  >
                    删除
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {hasChildren && !isCollapsed ? (
          <div className="relative min-w-0 flex-1">
            <div className={cn('pointer-events-none absolute left-0 top-1/2 hidden h-px w-[56px] -translate-y-1/2 opacity-60 lg:block', tone.line)} />
            <div className={cn('pointer-events-none absolute bottom-12 left-[56px] top-12 hidden w-px opacity-50 lg:block', tone.line)} />

            <div className="relative mt-5 pl-10 lg:mt-0 lg:pl-[56px]">
              <div className={cn('pointer-events-none absolute bottom-6 left-[14px] top-4 w-px opacity-55 lg:hidden', tone.line)} />

              <div className="space-y-5">
                {node.children.map(child => (
                  <div key={child.id} className="relative">
                    <div className={cn('pointer-events-none absolute left-[-20px] top-[38px] h-px w-7 opacity-55 lg:hidden', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-[56px] top-[38px] hidden h-px w-[56px] opacity-60 lg:block', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-[8px] top-[34px] hidden h-[9px] w-[9px] rotate-45 border-r border-t opacity-60 lg:block', tone.arrow)} />

                    <TreeNodeCard
                      branchColor={branchColor}
                      depth={depth + 1}
                      node={child}
                      styleMeta={styleMeta}
                      selectedNodeId={selectedNodeId}
                      onAddChild={onAddChild}
                      onAddSibling={onAddSibling}
                      onDelete={onDelete}
                      onInlineEditCancel={onInlineEditCancel}
                      onInlineEditChange={onInlineEditChange}
                      onInlineEditCommit={onInlineEditCommit}
                      onInlineEditStart={onInlineEditStart}
                      onSelect={onSelect}
                      onToggleCollapse={onToggleCollapse}
                      activeSearchNodeId={activeSearchNodeId}
                      editingNodeId={editingNodeId}
                      editingNodeLabel={editingNodeLabel}
                      matchedNodeIds={matchedNodeIds}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : isRoot && !isCollapsed ? (
          <div className="rounded-[30px] border border-dashed border-line/70 bg-[linear-gradient(180deg,rgba(252,250,245,0.94),rgba(247,243,235,0.9))] px-8 py-6 text-sm leading-7 text-ink-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:px-10 sm:py-7 lg:flex-1">
            从当前卡片或右侧属性面板添加一级节点，导图会以中心主题为起点向右舒展。
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function MindmapDetailPage() {
  const router = useRouter()
  const params = useParams<{ mindmapId: string }>()
  const mindmapId = typeof params?.mindmapId === 'string' ? params.mindmapId : ''

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [tree, setTree] = useState<MindmapNode>(createInitialMindmapTree())
  const [selectedNodeId, setSelectedNodeId] = useState('root')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [exportError, setExportError] = useState('')
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingNodeLabel, setEditingNodeLabel] = useState('')
  const [nodeInspectorTab, setNodeInspectorTab] = useState<NodeInspectorTab>('content')
  const [fullscreenInspectorTab, setFullscreenInspectorTab] = useState<FullscreenInspectorTab>('node')
  const [layoutTemplateNotice, setLayoutTemplateNotice] = useState('')
  const [isFullscreenEditor, setIsFullscreenEditor] = useState(false)
  const [useDesktopFullscreenLayout, setUseDesktopFullscreenLayout] = useState(false)
  const [scrollRequest, setScrollRequest] = useState<{ nodeId: string; token: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const screenStateRef = useRef(screenState)
  const treeRef = useRef(tree)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const editingNodeIdRef = useRef(editingNodeId)
  const isFullscreenEditorRef = useRef(isFullscreenEditor)
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})
  const handleAddChildRef = useRef<(nodeId: string) => void>(() => {})
  const handleAddSiblingRef = useRef<(nodeId: string) => void>(() => {})
  const handleDeleteNodeRef = useRef<(nodeId: string) => void>(() => {})
  const handleToggleCollapseRef = useRef<(nodeId: string) => void>(() => {})

  screenStateRef.current = screenState
  treeRef.current = tree
  selectedNodeIdRef.current = selectedNodeId
  editingNodeIdRef.current = editingNodeId
  isFullscreenEditorRef.current = isFullscreenEditor

  function focusCanvasViewport() {
    window.requestAnimationFrame(() => {
      canvasViewportRef.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    let alive = true

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!alive) return

      if (!user) {
        setScreenState('auth')
        return
      }

      setUserId(user.id)

      const { data, error: queryError } = await supabase
        .from('mindmaps')
        .select('id, user_id, title, description, source_module, content_json, updated_at')
        .eq('id', mindmapId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alive) return

      if (queryError) {
        setLoadingError(queryError.message || '加载导图失败')
        setScreenState('error')
        return
      }

      if (!data) {
        setScreenState('missing')
        return
      }

      const nextTitle = data.title || '未命名导图'
      const nextTree = normalizeTree(data.content_json)
      const nextSnapshot = JSON.stringify({ title: nextTitle, tree: nextTree })

      setTitle(nextTitle)
      setTree(nextTree)
      setSelectedNodeId(nextTree.id)
      setEditingNodeId(null)
      setEditingNodeLabel('')
      setLastSavedAt(data.updated_at)
      setSavedSnapshot(nextSnapshot)
      setScreenState('ready')
    })

    return () => { alive = false }
  }, [mindmapId])

  const currentSnapshot = useMemo(() => JSON.stringify({ title, tree }), [title, tree])
  const hasPendingInlineEdit = useMemo(() => {
    if (!editingNodeId) return false
    const currentNode = findNodeById(tree, editingNodeId)
    return Boolean(currentNode && currentNode.label !== editingNodeLabel)
  }, [editingNodeId, editingNodeLabel, tree])
  const isDirty = screenState === 'ready' && (currentSnapshot !== savedSnapshot || hasPendingInlineEdit)
  const selectedNode = useMemo(
    () => findNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  )
  const selectedNodeDepth = useMemo(
    () => findNodeDepth(tree, selectedNode.id) ?? 0,
    [selectedNode.id, tree]
  )
  const canvasMeta = useMemo(
    () => normalizeMindmapMeta(tree.meta),
    [tree.meta]
  )
  const totalNodes = useMemo(() => countNodes(tree), [tree])
  const selectedNodeIsCollapsed = Boolean(selectedNode.collapsed)
  const searchResults = useMemo(
    () => collectMatchingNodeIds(tree, searchQuery),
    [searchQuery, tree]
  )
  const activeSearchNodeId = activeSearchIndex >= 0 ? searchResults[activeSearchIndex] ?? null : null
  const matchedNodeIds = useMemo(() => new Set(searchResults), [searchResults])
  const searchResultItems = useMemo(
    () => searchResults.map(nodeId => {
      const node = findNodeById(tree, nodeId)
      const depth = findNodeDepth(tree, nodeId) ?? 0
      return {
        id: nodeId,
        label: node?.label || '未命名节点',
        level: formatNodeLevel(depth),
      }
    }),
    [searchResults, tree]
  )

  const statusText = screenState === 'loading'
    ? '加载中...'
    : screenState === 'auth'
      ? '请先登录'
      : screenState === 'missing'
        ? '不可访问'
        : screenState === 'error'
          ? '加载失败'
          : exportError
            ? exportError
          : saveError
            ? saveError
            : saving
              ? '保存中...'
              : isDirty
                ? '未保存'
                : '已保存'

  function markEdited() {
    if (saveError) setSaveError('')
    if (exportError) setExportError('')
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId)
    focusCanvasViewport()
  }

  function handleTitleChange(value: string) {
    markEdited()
    setTitle(value)
  }

  function locateNode(nodeId: string) {
    setTree(current => expandPathToNode(current, nodeId))
    setSelectedNodeId(nodeId)
    setScrollRequest({
      nodeId,
      token: Date.now(),
    })
    focusCanvasViewport()
  }

  function handleNodeLabelChange(value: string) {
    markEdited()
    if (editingNodeId === selectedNode.id) {
      setEditingNodeLabel(value)
    }
    setTree(current => {
      const result = updateNodeById(current, selectedNode.id, node => ({
        ...node,
        label: value,
      }))
      return result.changed ? result.nextNode : current
    })
  }

  function handleNodeColorChange(color: MindmapColor) {
    markEdited()
    setTree(current => {
      const result = updateNodeById(current, selectedNode.id, node => ({
        ...node,
        color,
      }))
      return result.changed ? result.nextNode : current
    })
  }

  function handleCanvasMetaChange(patch: Partial<MindmapMeta>) {
    markEdited()
    setTree(current => ({
      ...current,
      meta: {
        ...normalizeMindmapMeta(current.meta),
        ...patch,
      },
    }))
  }

  function handleLayoutTemplateSelect(templateId: LayoutTemplateId) {
    if (templateId !== 'xmind-axis') {
      setLayoutTemplateNotice('该布局将在后续版本支持。')
      return
    }

    setLayoutTemplateNotice('')
    handleCanvasMetaChange({ layout: 'xmind-axis' })
  }

  function handleAddChild(nodeId: string) {
    setEditingNodeId(null)
    setEditingNodeLabel('')
    const childNode: MindmapNode = {
      id: createNodeId(),
      label: '新节点',
      color: 'gray',
      collapsed: false,
      children: [],
    }

    let added = false

    markEdited()
    setTree(current => {
      const expandedCurrent = setNodeCollapsed(current, nodeId, false).nextNode
      const result = addChildNode(expandedCurrent, nodeId, childNode)
      added = result.added
      return result.added ? result.nextNode : current
    })

    if (added) {
      setSelectedNodeId(childNode.id)
      focusCanvasViewport()
    }
  }

  function handleAddSibling(nodeId: string) {
    if (nodeId === 'root') return

    const currentNode = findNodeById(tree, nodeId)
    const siblingNode: MindmapNode = {
      id: createNodeId(),
      label: '新主题',
      color: currentNode?.color ?? 'gray',
      collapsed: false,
      children: [],
    }

    let added = false

    setEditingNodeId(null)
    setEditingNodeLabel('')
    markEdited()
    setTree(current => {
      const result = addSiblingNode(current, nodeId, siblingNode)
      added = result.added
      return result.added ? result.nextNode : current
    })

    if (added) {
      setSelectedNodeId(siblingNode.id)
      focusCanvasViewport()
    }
  }

  function handleDeleteNode(nodeId: string) {
    if (nodeId === 'root') return

    const confirmed = window.confirm('确定删除该节点及其所有子节点吗？')
    if (!confirmed) return

    const parentNode = findParentNode(tree, nodeId)
    let removed = false

    setEditingNodeId(null)
    setEditingNodeLabel('')
    markEdited()
    setTree(current => {
      const result = removeNodeById(current, nodeId)
      removed = result.removed
      return result.removed ? result.nextNode : current
    })

    if (removed) {
      setSelectedNodeId(parentNode?.id ?? 'root')
      focusCanvasViewport()
    }
  }

  function handleInlineEditStart(nodeId: string) {
    const node = findNodeById(tree, nodeId)
    if (!node) return
    setSelectedNodeId(nodeId)
    setEditingNodeId(nodeId)
    setEditingNodeLabel(node.label)
  }

  function handleInlineEditCancel() {
    setEditingNodeId(null)
    setEditingNodeLabel('')
  }

  function handleInlineEditCommit() {
    if (!editingNodeId) return

    const nodeId = editingNodeId
    const nextLabel = editingNodeLabel
    const currentNode = findNodeById(tree, nodeId)

    setEditingNodeId(null)
    setEditingNodeLabel('')

    if (!currentNode || currentNode.label === nextLabel) return

    markEdited()
    setTree(current => {
      const result = updateNodeById(current, nodeId, node => ({
        ...node,
        label: nextLabel,
      }))
      return result.changed ? result.nextNode : current
    })
  }

  function handleToggleCollapse(nodeId: string) {
    const currentNode = findNodeById(tree, nodeId)
    if (!currentNode || currentNode.children.length === 0) return

    markEdited()
    setTree(current => {
      const result = setNodeCollapsed(current, nodeId, !currentNode.collapsed)
      return result.changed ? result.nextNode : current
    })
    focusCanvasViewport()
  }

  function handleExpandAll() {
    markEdited()
    setTree(current => setTreeCollapsedState(current, false, true))
    focusCanvasViewport()
  }

  function handleCollapseAll() {
    markEdited()
    setSelectedNodeId('root')
    setTree(current => setTreeCollapsedState(current, true, true))
    focusCanvasViewport()
  }

  function handleSearchQueryChange(value: string) {
    setSearchQuery(value)
    const normalized = value.trim()
    if (!normalized) {
      setActiveSearchIndex(-1)
      return
    }
    setActiveSearchIndex(0)
  }

  function handleGoToPreviousMatch() {
    if (searchResults.length === 0) return
    const nextIndex = activeSearchIndex <= 0 ? searchResults.length - 1 : activeSearchIndex - 1
    setActiveSearchIndex(nextIndex)
    const nextNodeId = searchResults[nextIndex]
    if (nextNodeId) locateNode(nextNodeId)
  }

  function handleGoToNextMatch() {
    if (searchResults.length === 0) return
    const nextIndex = activeSearchIndex >= searchResults.length - 1 ? 0 : activeSearchIndex + 1
    setActiveSearchIndex(nextIndex)
    const nextNodeId = searchResults[nextIndex]
    if (nextNodeId) locateNode(nextNodeId)
  }

  async function handleSave() {
    if (!userId || screenState !== 'ready' || (!isDirty && !hasPendingInlineEdit) || saving) return

    const nextTitle = title.trim() || '未命名导图'
    let nextTree = tree

    if (editingNodeId) {
      const currentEditingNode = findNodeById(tree, editingNodeId)
      if (currentEditingNode && currentEditingNode.label !== editingNodeLabel) {
        const result = updateNodeById(tree, editingNodeId, node => ({
          ...node,
          label: editingNodeLabel,
        }))
        if (result.changed) {
          nextTree = result.nextNode
          setTree(result.nextNode)
        }
      }
      setEditingNodeId(null)
      setEditingNodeLabel('')
    }

    setSaving(true)
    setSaveError('')

    const { data, error: updateError } = await supabase
      .from('mindmaps')
      .update({
        title: nextTitle,
        content_json: nextTree,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mindmapId)
      .eq('user_id', userId)
      .select('updated_at')
      .single()

    setSaving(false)

    if (updateError) {
      setSaveError('保存失败，请稍后重试。')
      return
    }

    setTitle(nextTitle)
    setLastSavedAt(data?.updated_at ?? new Date().toISOString())
    setSavedSnapshot(JSON.stringify({ title: nextTitle, tree: nextTree }))
  }

  handleSaveRef.current = handleSave
  handleAddChildRef.current = handleAddChild
  handleAddSiblingRef.current = handleAddSibling
  handleDeleteNodeRef.current = handleDeleteNode
  handleToggleCollapseRef.current = handleToggleCollapse

  useEffect(() => {
    if (editingNodeId && !findNodeById(tree, editingNodeId)) {
      setEditingNodeId(null)
      setEditingNodeLabel('')
    }
  }, [editingNodeId, tree])

  useEffect(() => {
    if (!isFullscreenEditor) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    focusCanvasViewport()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreenEditor])

  useEffect(() => {
    if (!layoutTemplateNotice) return

    const timeoutId = window.setTimeout(() => {
      setLayoutTemplateNotice('')
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [layoutTemplateNotice])

  useEffect(() => {
    if (!isFullscreenEditor) {
      setUseDesktopFullscreenLayout(false)
      return
    }

    const updateLayoutMode = () => {
      setUseDesktopFullscreenLayout(isDesktopBrowserLayout())
    }

    updateLayoutMode()

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    mediaQuery.addEventListener('change', updateLayoutMode)
    window.addEventListener('resize', updateLayoutMode)

    return () => {
      mediaQuery.removeEventListener('change', updateLayoutMode)
      window.removeEventListener('resize', updateLayoutMode)
    }
  }, [isFullscreenEditor])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.isComposing) return

      const key = event.key
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && key.toLowerCase() === 's'
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && key.toLowerCase() === 'f'

      if (isSaveShortcut) {
        event.preventDefault()
        event.stopPropagation()
        void handleSaveRef.current()
        return
      }

      if (
        key === 'Escape' &&
        isFullscreenEditorRef.current &&
        !editingNodeIdRef.current &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()
        setIsFullscreenEditor(false)
        return
      }

      if (screenStateRef.current !== 'ready') return

      if (isSearchShortcut) {
        event.preventDefault()
        event.stopPropagation()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (editingNodeIdRef.current) return
      if (isTypingTarget(event.target)) return

      const currentNodeId = selectedNodeIdRef.current

      if (key === 'Tab') {
        event.preventDefault()
        handleAddChildRef.current(currentNodeId)
        return
      }

      if (key === ' ') {
        const currentNode = findNodeById(treeRef.current, currentNodeId)
        if (!currentNode || currentNode.children.length === 0) return
        event.preventDefault()
        handleToggleCollapseRef.current(currentNodeId)
        return
      }

      if (key === 'Enter') {
        event.preventDefault()
        if (currentNodeId === 'root') {
          handleAddChildRef.current(currentNodeId)
        } else {
          handleAddSiblingRef.current(currentNodeId)
        }
        return
      }

      if ((key === 'Backspace' || key === 'Delete') && currentNodeId !== 'root') {
        event.preventDefault()
        handleDeleteNodeRef.current(currentNodeId)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    if (!editingNodeId) return

    const frame = window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>('[data-inline-editor="true"]')
      input?.focus()
      input?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [editingNodeId])

  useEffect(() => {
    if (!searchQuery.trim() || searchResults.length === 0) {
      if (activeSearchIndex !== -1) setActiveSearchIndex(-1)
      return
    }

    setActiveSearchIndex(current => {
      if (current < 0) return 0
      return Math.min(current, searchResults.length - 1)
    })
  }, [activeSearchIndex, searchQuery, searchResults.length])

  useEffect(() => {
    if (!activeSearchNodeId) return
    locateNode(activeSearchNodeId)
  }, [activeSearchNodeId])

  useEffect(() => {
    if (!scrollRequest) return

    const frame = window.requestAnimationFrame(() => {
      const target = canvasViewportRef.current?.querySelector<HTMLElement>(`[data-node-id="${scrollRequest.nodeId}"]`)
      target?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [scrollRequest, tree])

  function handleExportMarkdown() {
    if (screenState !== 'ready') return

    try {
      setExportError('')
      const filename = `${sanitizeMindmapFilename(title)}.md`
      const content = buildMindmapMarkdown(tree)
      downloadFile(filename, content, 'text/markdown;charset=utf-8')
    } catch {
      setExportError('导出失败，请稍后重试。')
    }
  }

  function handleExportJson() {
    if (screenState !== 'ready') return

    try {
      setExportError('')
      const filename = `${sanitizeMindmapFilename(title)}.json`
      const content = JSON.stringify(tree, null, 2)
      downloadFile(filename, content, 'application/json;charset=utf-8')
    } catch {
      setExportError('导出失败，请稍后重试。')
    }
  }

  function renderCanvasPanel(fullscreen = false) {
    const canvasSurfaceStyle = getCanvasSurfaceStyle(canvasMeta.background)
    const shouldUseDesktopCanvas = fullscreen ? useDesktopFullscreenLayout : false

    return (
      <Card
        padding="lg"
        className={cn(
          'min-w-0 overflow-hidden rounded-[32px] border border-[#E6DFD3] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.94))] shadow-[0_24px_54px_rgba(130,120,103,0.08)]',
          fullscreen && 'flex h-full min-h-0 flex-col rounded-[28px] shadow-[0_18px_40px_rgba(130,120,103,0.08)]'
        )}
      >
        <div
          className={cn(
            'rounded-[34px] border border-[#E4DDD1] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]',
            fullscreen && 'flex min-h-0 flex-1 flex-col rounded-[30px]'
          )}
          style={{
            padding: '20px',
            ...canvasSurfaceStyle,
          }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[#E7E0D4] bg-[rgba(252,250,245,0.88)] px-4 py-3 text-xs text-ink-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#E2DBCF] bg-[#FCFAF6] px-3 py-1 text-[11px] text-ink-600">
                {totalNodes} 个节点
              </span>
              <span className="rounded-full border border-[#E2DBCF] bg-[#FCFAF6] px-3 py-1 text-[11px] text-ink-600">
                {searchQuery.trim() ? `${searchResults.length} 个匹配` : '未搜索'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-9 rounded-full border border-[#E0D9CD] bg-transparent px-3.5 text-[11px] uppercase tracking-[0.12em] text-ink-500 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                onClick={handleExpandAll}
                disabled={screenState !== 'ready'}
              >
                全部展开
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-9 rounded-full border border-[#E0D9CD] bg-transparent px-3.5 text-[11px] uppercase tracking-[0.12em] text-ink-500 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                onClick={handleCollapseAll}
                disabled={screenState !== 'ready'}
              >
                全部收起
              </Button>
            </div>
          </div>
          <div className={cn(
            'mb-4 hidden rounded-[20px] border border-dashed border-[#E3DBCF] bg-[rgba(252,250,245,0.72)] px-4 py-3 text-xs leading-6 text-ink-500',
            shouldUseDesktopCanvas ? 'block' : 'lg:block'
          )}>
            快捷键：Tab 添加子节点 · Enter 添加同级节点 · Delete 删除 · Cmd/Ctrl+S 保存
          </div>
          <div
            ref={canvasViewportRef}
            tabIndex={-1}
            className={cn(
              'overflow-auto overscroll-contain rounded-[28px] border border-[#E8E1D6] bg-[rgba(255,255,255,0.38)] outline-none',
              fullscreen ? 'min-h-[420px] flex-1' : 'lg:h-[760px]'
            )}
          >
            <div
              className="min-h-full min-w-max"
              style={{ padding: '28px 28px 34px 28px' }}
            >
              <DesktopMindmapCanvas
                tree={tree}
                useDesktopLayout={shouldUseDesktopCanvas}
                styleMeta={canvasMeta}
                selectedNodeId={selectedNodeId}
                onAddChild={handleAddChild}
                onAddSibling={handleAddSibling}
                onDelete={handleDeleteNode}
                onInlineEditCancel={handleInlineEditCancel}
                onInlineEditChange={setEditingNodeLabel}
                onInlineEditCommit={handleInlineEditCommit}
                onInlineEditStart={handleInlineEditStart}
                onSelect={handleSelectNode}
                onToggleCollapse={handleToggleCollapse}
                activeSearchNodeId={activeSearchNodeId}
                editingNodeId={editingNodeId}
                editingNodeLabel={editingNodeLabel}
                matchedNodeIds={matchedNodeIds}
              />
              <div className={shouldUseDesktopCanvas ? 'hidden' : 'lg:hidden'}>
                <TreeNodeCard
                  depth={0}
                  node={tree}
                  styleMeta={canvasMeta}
                  selectedNodeId={selectedNodeId}
                  onAddChild={handleAddChild}
                  onAddSibling={handleAddSibling}
                  onDelete={handleDeleteNode}
                  onInlineEditCancel={handleInlineEditCancel}
                  onInlineEditChange={setEditingNodeLabel}
                  onInlineEditCommit={handleInlineEditCommit}
                  onInlineEditStart={handleInlineEditStart}
                  onSelect={handleSelectNode}
                  onToggleCollapse={handleToggleCollapse}
                  activeSearchNodeId={activeSearchNodeId}
                  editingNodeId={editingNodeId}
                  editingNodeLabel={editingNodeLabel}
                  matchedNodeIds={matchedNodeIds}
                />
              </div>
            </div>
          </div>
          {searchQuery.trim() ? (
            <div className="mt-4 rounded-[22px] border border-[#E6DFD2] bg-[rgba(252,250,245,0.86)] px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-500">
                <span>搜索结果</span>
                <span>{searchResults.length} 个匹配</span>
              </div>
              <div className="max-h-36 space-y-2 overflow-auto">
                {searchResultItems.length > 0 ? (
                  searchResultItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSearchIndex(index)
                        locateNode(item.id)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-[16px] border px-3 py-2 text-left text-sm transition-colors',
                        activeSearchNodeId === item.id
                          ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900'
                          : 'border-[#ECE5D9] bg-[#FCFAF6] text-ink-600 hover:border-[#D8CCBC] hover:bg-[#F8F4EC] hover:text-ink-900'
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="ml-3 shrink-0 text-xs text-ink-400">{item.level}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#E5DED2] bg-[#FCFAF6] px-3 py-2 text-sm text-ink-500">
                    未匹配到节点。
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[22px] border border-dashed border-[#E1D9CC] bg-[rgba(252,250,245,0.84)] px-4 py-3 text-sm leading-6 text-ink-500">
              画布优先保留横向展开空间，分支较多时会在内部滚动，不压缩脑图结构。
            </div>
          )}
        </div>
      </Card>
    )
  }

  function renderInspectorPanel(fullscreen = false) {
    const nodeInspector = (
      <>
        <div className="rounded-[22px] border border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,241,233,0.94))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400">{formatNodeLevel(selectedNodeDepth)}</p>
              <h3 className="mt-2 break-words font-serif text-[1.16rem] leading-[1.22] text-ink-900 sm:text-[1.35rem] sm:leading-[1.24]">
                {selectedNode.label || '未命名节点'}
              </h3>
              <p className="mt-2 text-[13px] leading-6 text-ink-500 sm:text-sm">
                {selectedNode.id === 'root'
                  ? '中心主题固定保留，用作整张导图的起点。'
                  : `当前节点下有 ${selectedNode.children.length} 个直接子节点。`}
              </p>
            </div>
            <span className={cn('w-fit rounded-full border px-3 py-1 text-[10px] leading-none', colorMeta[selectedNode.color].chip)}>
              {colorMeta[selectedNode.color].label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-[18px] bg-[#F5EFE5] p-1.5 ring-1 ring-[#E4DBCE]/85 sm:flex sm:flex-wrap sm:gap-2">
          {([
            ['content', '内容'],
            ['style', '样式'],
            ['structure', '结构'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setNodeInspectorTab(key)}
              className={cn(
                'min-w-0 rounded-[14px] border border-transparent px-2.5 py-2 text-center text-[13px] transition-colors sm:px-3 sm:text-sm',
                nodeInspectorTab === key
                  ? 'border-[#E3D7C7] bg-white text-ink-900 shadow-[0_6px_14px_rgba(130,120,103,0.08)]'
                  : 'text-ink-500 hover:text-ink-900'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {nodeInspectorTab === 'content' && (
          <>
            <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-400">节点名称</p>
              <div className="mt-4 rounded-[16px] border border-[#E1DBCF] bg-white px-5 py-3.5 transition-colors focus-within:border-[#CBBBA4]">
                <input
                  id="mindmap-node-label"
                  value={selectedNode.label}
                  onChange={event => handleNodeLabelChange(event.target.value)}
                  className="w-full border-0 bg-transparent text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400"
                  placeholder="请输入节点文本"
                />
              </div>
            </div>
            <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
              <div className="space-y-3 px-1 text-sm text-ink-600">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs uppercase tracking-[0.16em] text-ink-400">节点 ID</span>
                  <span className="break-all text-right text-sm leading-6 text-ink-700">{selectedNode.id}</span>
                </div>
                <div className="h-px bg-[#EBE4D8]" />
                <div className="flex items-center justify-between gap-4">
                  <span>层级</span>
                  <span className="font-medium text-ink-900">{formatNodeLevel(selectedNodeDepth)}</span>
                </div>
                <div className="h-px bg-[#EBE4D8]" />
                <div className="flex items-center justify-between gap-4">
                  <span>子节点数量</span>
                  <span className="font-medium text-ink-900">{selectedNode.children.length}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {nodeInspectorTab === 'style' && (
          <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-ink-400">节点颜色</p>
                <p className="mt-2 text-sm leading-6 text-ink-500">保留低饱和 Morandi 配色，用于区分主题层次。</p>
              </div>
              <span className={cn('rounded-full border px-3 py-1 text-[10px] leading-none', colorMeta[selectedNode.color].chip)}>
                当前色: {colorMeta[selectedNode.color].label}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {colorOrder.map(color => {
                const tone = colorMeta[color]
                const active = selectedNode.color === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleNodeColorChange(color)}
                    className={cn(
                      'min-h-[46px] rounded-[14px] border px-4 py-2 text-sm transition-colors',
                      tone.button,
                      active && cn(tone.selected, 'shadow-sm')
                    )}
                  >
                    {tone.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {nodeInspectorTab === 'structure' && (
          <>
            <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-400">结构操作</p>
              <div className="mt-4 grid gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  className="min-h-10 rounded-full bg-[#26231F] px-5 text-white hover:bg-[#1D1B18]"
                  onClick={() => handleAddChild(selectedNode.id)}
                >
                  添加子主题
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10 rounded-full border border-[#D6CFC2] bg-white px-5 text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleAddSibling(selectedNode.id)}
                  disabled={selectedNode.id === 'root'}
                >
                  添加同级
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10 rounded-full border border-[#D6CFC2] bg-white px-5 text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleToggleCollapse(selectedNode.id)}
                  disabled={selectedNode.children.length === 0}
                >
                  {selectedNodeIsCollapsed ? '展开当前分支' : '折叠当前分支'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-10 rounded-full border border-[#E5D3D3] bg-[#FBF3F3] px-5 text-[#9E6B6B] hover:border-[#D6BBBB] hover:bg-[#F7E9E9] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  disabled={selectedNode.id === 'root'}
                >
                  删除
                </Button>
              </div>
            </div>
            {selectedNode.id === 'root' && (
              <p className="rounded-[18px] border border-[#E7E0D4] bg-[#F8F5EE] px-4 py-3 text-xs leading-6 text-ink-500">
                中心主题不能删除，也不能创建同级节点；可继续添加一级主题来扩展主轴。
              </p>
            )}
          </>
        )}
      </>
    )

    const canvasInspector = (
      <>
        <div className="rounded-[22px] border border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,241,233,0.94))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400">画布样式</p>
          <h3 className="mt-2 font-serif text-[1.3rem] leading-[1.2] text-ink-900">全局格式</h3>
          <p className="mt-2 text-sm leading-6 text-ink-500">这些设置会写入 root.meta，并在保存后随导图一起保留。</p>
        </div>

        <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-ink-400">导图结构</p>
              <p className="mt-2 text-sm leading-6 text-ink-500">像 XMind 一样先选结构模板。当前只有主轴结构可用，其余入口先做预览和占位。</p>
            </div>
            <span className="rounded-full border border-[#E4DDD2] bg-white px-3 py-1 text-[10px] text-ink-500">布局</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([
              ['xmind-axis', '主轴结构', true],
              ['right', '向右结构', false],
              ['logic', '逻辑图', false],
              ['organization', '组织结构图', false],
              ['timeline', '时间轴', false],
              ['fishbone', '鱼骨图', false],
            ] as const).map(([templateId, label, supported]) => {
              const isSelected = supported && canvasMeta.layout === 'xmind-axis'

              return (
                <button
                  key={templateId}
                  type="button"
                  onClick={() => handleLayoutTemplateSelect(templateId)}
                  className={cn(
                    'rounded-[18px] border p-2 text-left transition-colors',
                    isSelected
                      ? 'border-[#D7CCBC] bg-[#F6F0E6] shadow-sm'
                      : supported
                        ? 'border-[#E5DED2] bg-white hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
                        : 'border-dashed border-[#E6DFD4] bg-[#F7F4EE] hover:border-[#D7CCBC] hover:bg-[#F4EFE7]'
                  )}
                >
                  {renderLayoutTemplatePreview(templateId)}
                  <div className="mt-3 flex items-start justify-between gap-3 px-1 pb-1">
                    <div>
                      <p className="text-sm text-ink-900">{label}</p>
                      <p className="mt-1 text-xs text-ink-400">{supported ? '可用' : '即将支持'}</p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px]',
                        supported
                          ? 'border-[#DCCFBD] bg-white text-ink-600'
                          : 'border-[#E5DED2] bg-[#FBF7F0] text-ink-400'
                      )}
                    >
                      {isSelected ? '当前结构' : supported ? '可用' : '预览'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          {layoutTemplateNotice ? (
            <p className="mt-4 rounded-[14px] border border-[#E7D9C8] bg-[#FBF5EC] px-3 py-2 text-sm text-[#9A7650]">
              {layoutTemplateNotice}
            </p>
          ) : null}
        </div>

        <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">背景</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['paper', '纸本米白'],
              ['white', '纯白'],
              ['warm-gray', '暖灰'],
              ['dark', '深色'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleCanvasMetaChange({ background: value as MindmapBackground })}
                className={cn(
                  'min-h-[46px] rounded-[14px] border px-4 py-2 text-sm transition-colors',
                  canvasMeta.background === value
                    ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900 shadow-sm'
                    : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">全局字体</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['serif', '默认 / Serif'],
              ['sans', 'Sans'],
              ['mono', 'Mono'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleCanvasMetaChange({ fontFamily: value as MindmapFontFamily })}
                className={cn(
                  'min-h-[46px] rounded-[14px] border px-4 py-2 text-sm transition-colors',
                  canvasMeta.fontFamily === value
                    ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900 shadow-sm'
                    : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">分支线粗细</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ['thin', '细'],
              ['default', '默认'],
              ['thick', '粗'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => handleCanvasMetaChange({ branchLine: value as MindmapBranchLine })}
                className={cn(
                  'min-h-[46px] rounded-[14px] border px-3 py-2 text-sm transition-colors',
                  canvasMeta.branchLine === value
                    ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900 shadow-sm'
                    : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[20px] border border-[#E7E0D4] bg-[#FCFAF6] px-5 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">布局细节</p>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => handleCanvasMetaChange({ rainbowBranches: !canvasMeta.rainbowBranches })}
              className={cn(
                'flex w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left text-sm transition-colors',
                canvasMeta.rainbowBranches
                  ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900'
                  : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
              )}
            >
              <span>彩虹分支</span>
              <span className="text-xs text-ink-400">{canvasMeta.rainbowBranches ? '已开启' : '已关闭'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCanvasMetaChange({ compact: !canvasMeta.compact })}
              className={cn(
                'flex w-full items-center justify-between rounded-[14px] border px-4 py-3 text-left text-sm transition-colors',
                canvasMeta.compact
                  ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900'
                  : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
              )}
            >
              <span>紧凑布局</span>
              <span className="text-xs text-ink-400">{canvasMeta.compact ? '已开启' : '已关闭'}</span>
            </button>
          </div>
        </div>
      </>
    )

    return (
      <Card
        padding="lg"
        className={cn(
          'rounded-[28px] border border-[#E6DFD3] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,242,235,0.95))] shadow-[0_20px_46px_rgba(130,120,103,0.08)]',
          fullscreen ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[26px]' : 'xl:sticky xl:top-6 xl:self-start'
        )}
        as="section"
      >
        <div className={cn('flex flex-col', fullscreen && 'min-h-0 flex-1')}>
          <div className="mb-5 border-b border-[#E7E0D4] pb-4">
            <p className="text-xs uppercase tracking-[0.24em] text-ink-400">Inspector</p>
            <h2 id="mindmap-node-editor" className="mt-2 break-words font-serif text-[1.2rem] leading-[1.16] text-ink-900 sm:text-[1.55rem] sm:leading-[1.2]">
              {fullscreen && fullscreenInspectorTab === 'canvas' ? '画布样式' : '当前节点'}
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-ink-500 sm:text-sm">
              {fullscreen
                ? '全屏模式下可在节点和画布之间切换，像 XMind 的格式面板一样管理局部和全局设置。'
                : '右侧只保留内容、样式和结构检查，不再与画布平分视觉重心。'}
            </p>
          </div>

          <div className={cn('space-y-4', fullscreen && 'min-h-0 flex-1 overflow-y-auto pr-1')}>
            {fullscreen && (
              <div className="grid grid-cols-2 gap-1.5 rounded-[18px] bg-[#F5EFE5] p-1.5 ring-1 ring-[#E4DBCE]/85 sm:flex sm:flex-wrap sm:gap-2">
                {([
                  ['node', '节点'],
                  ['canvas', '画布'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFullscreenInspectorTab(key)}
                    className={cn(
                      'min-w-0 rounded-[14px] border border-transparent px-2.5 py-2 text-center text-[13px] transition-colors sm:px-3 sm:text-sm',
                      fullscreenInspectorTab === key
                        ? 'border-[#E3D7C7] bg-white text-ink-900 shadow-[0_6px_14px_rgba(130,120,103,0.08)]'
                        : 'text-ink-500 hover:text-ink-900'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {fullscreen ? (fullscreenInspectorTab === 'node' ? nodeInspector : canvasInspector) : nodeInspector}
          </div>
        </div>
      </Card>
    )
  }

  function renderReadyWorkspace(fullscreen = false) {
    return (
      <div className={cn(
        'grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]',
        fullscreen && 'h-full min-h-0 gap-4',
        fullscreen && useDesktopFullscreenLayout && 'grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]',
        fullscreen && !useDesktopFullscreenLayout && 'md:grid-cols-[minmax(0,1fr)_380px]'
      )}>
        {renderCanvasPanel(fullscreen)}
        {renderInspectorPanel(fullscreen)}
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[linear-gradient(180deg,#F5F1E8_0%,#F0ECE2_100%)]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-[#E6E0D4] bg-[linear-gradient(180deg,rgba(252,250,246,0.98),rgba(246,242,234,0.96))] shadow-[0_24px_60px_rgba(130,120,103,0.08)]">
          <MainContent size="full">
            <Card padding="lg" className="mb-5 rounded-[26px] border border-[#E7E1D7] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,237,0.94))] shadow-[0_16px_36px_rgba(130,120,103,0.06)]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-9 rounded-full border border-[#E0D9CD] bg-[#FCFAF6] px-4 text-ink-700 hover:border-[#C9BEAE] hover:bg-white hover:text-ink-900"
                    onClick={() => router.push('/mindmaps')}
                  >
                    返回列表
                  </Button>
                  <div className="min-w-[240px] flex-1 rounded-[22px] border border-[#E4DDD1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors focus-within:border-[#CDBDA6] focus-within:bg-white">
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full border-0 bg-transparent font-serif text-[1.12rem] leading-[1.25] text-ink-900 outline-none placeholder:text-ink-400 sm:text-[1.22rem]"
                    />
                  </div>
                  <span className={cn(
                    'inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium',
                    screenState === 'error' || !!saveError || !!exportError
                      ? 'border-[#E8D3D3] bg-[#FAF0F0] text-[#9E6B6B]'
                      : isDirty
                        ? 'border-[#E8D8C7] bg-[#FAF3EA] text-[#A67D56]'
                        : 'border-[#D7E4DA] bg-[#F0F7F1] text-[#698A73]'
                  )}>
                    {statusText}
                  </span>
                  <p className="text-xs text-ink-500">最近保存：{formatDateTime(lastSavedAt)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[#E3DCCF] bg-[rgba(255,255,255,0.9)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#D7D0C4] bg-white px-3 text-[11px] text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2]"
                      onClick={() => handleAddChild('root')}
                      disabled={screenState !== 'ready'}
                    >
                      添加主题
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={() => handleAddChild(selectedNode.id)}
                      disabled={screenState !== 'ready'}
                    >
                      添加子主题
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleAddSibling(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.id === 'root'}
                    >
                      添加同级
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.id === 'root'}
                    >
                      删除
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleToggleCollapse(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.children.length === 0}
                    >
                      {selectedNodeIsCollapsed ? '展开' : '折叠'}
                    </Button>
                  </div>
                  <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[20px] border border-[#E3DCCF] bg-[#FCFAF6] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={event => handleSearchQueryChange(event.target.value)}
                      className="min-w-[120px] flex-1 border-0 bg-transparent text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400"
                      placeholder="搜索节点..."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-7 rounded-full border border-[#E0D9CD] bg-transparent px-2.5 text-[10px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleGoToPreviousMatch}
                      disabled={searchResults.length === 0}
                    >
                      上一项
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-7 rounded-full border border-[#E0D9CD] bg-transparent px-2.5 text-[10px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleGoToNextMatch}
                      disabled={searchResults.length === 0}
                    >
                      下一项
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[#E3DCCF] bg-[rgba(255,255,255,0.9)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportMarkdown}
                      disabled={screenState !== 'ready'}
                    >
                      导出 Markdown
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportJson}
                      disabled={screenState !== 'ready'}
                    >
                      导出 JSON
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hidden min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] lg:inline-flex"
                      onClick={() => setIsFullscreenEditor(true)}
                      disabled={screenState !== 'ready'}
                    >
                      全屏编辑
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-8 rounded-full bg-[#26231F] px-4 text-white hover:bg-[#1D1B18]"
                      onClick={handleSave}
                      loading={saving}
                      disabled={screenState !== 'ready' || !isDirty}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {screenState === 'loading' ? (
              <Card padding="lg" className="text-center text-sm text-ink-500">
                正在加载导图...
              </Card>
            ) : screenState === 'auth' ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">请先登录。</h2>
                <p className="mb-7 text-sm text-ink-600">登录后才能查看和编辑你的思维导图。</p>
                <Button variant="brand" onClick={() => router.push('/')}>返回首页</Button>
              </Card>
            ) : screenState === 'error' ? (
              <Card padding="lg" className="border border-red-100 bg-red-50 text-sm text-red-700">
                {loadingError}
              </Card>
            ) : screenState === 'missing' ? (
              <Card padding="lg" className="py-20 text-center">
                <h2 className="mb-3 font-serif text-xl text-ink-900">未找到这张思维导图。</h2>
                <p className="mb-7 text-sm text-ink-600">它可能已被删除，或你当前没有访问权限。</p>
                <Button variant="brand" onClick={() => router.push('/mindmaps')}>返回列表</Button>
              </Card>
            ) : (
              !isFullscreenEditor ? renderReadyWorkspace() : null
            )}
          </MainContent>
        </div>
      </main>
      {isFullscreenEditor && screenState === 'ready' && (
        <div className="fixed inset-0 z-50 bg-[linear-gradient(180deg,#F5F1E8_0%,#EFE9DE_100%)]">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-[#E5DED2] bg-[rgba(248,244,238,0.96)] px-3 py-3 shadow-[0_12px_30px_rgba(130,120,103,0.08)] backdrop-blur sm:px-4 lg:px-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-8 rounded-full border border-[#E0D9CD] bg-[#FCFAF6] px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-white hover:text-ink-900"
                    onClick={() => setIsFullscreenEditor(false)}
                  >
                    退出全屏
                  </Button>
                  <div className="min-w-[220px] flex-1 rounded-[20px] border border-[#E4DDD1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors focus-within:border-[#CDBDA6] focus-within:bg-white">
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full border-0 bg-transparent font-serif text-[1.02rem] leading-[1.2] text-ink-900 outline-none placeholder:text-ink-400 sm:text-[1.12rem]"
                    />
                  </div>
                  <span className={cn(
                    'inline-flex min-h-8 items-center rounded-full border px-3 text-[11px] font-medium',
                    !!saveError || !!exportError
                      ? 'border-[#E8D3D3] bg-[#FAF0F0] text-[#9E6B6B]'
                      : isDirty
                        ? 'border-[#E8D8C7] bg-[#FAF3EA] text-[#A67D56]'
                        : 'border-[#D7E4DA] bg-[#F0F7F1] text-[#698A73]'
                  )}>
                    {statusText}
                  </span>
                  <p className="text-xs text-ink-500">最近保存：{formatDateTime(lastSavedAt)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#E3DCCF] bg-[rgba(255,255,255,0.9)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#D7D0C4] bg-white px-3 text-[11px] text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2]"
                      onClick={() => handleAddChild('root')}
                      disabled={screenState !== 'ready'}
                    >
                      添加主题
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={() => handleAddChild(selectedNode.id)}
                      disabled={screenState !== 'ready'}
                    >
                      添加子主题
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleAddSibling(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.id === 'root'}
                    >
                      添加同级
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.id === 'root'}
                    >
                      删除
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={() => handleToggleCollapse(selectedNode.id)}
                      disabled={screenState !== 'ready' || selectedNode.children.length === 0}
                    >
                      {selectedNodeIsCollapsed ? '展开' : '折叠'}
                    </Button>
                  </div>
                  <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[18px] border border-[#E3DCCF] bg-[#FCFAF6] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={event => handleSearchQueryChange(event.target.value)}
                      className="min-w-[120px] flex-1 border-0 bg-transparent text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400"
                      placeholder="搜索节点..."
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-7 rounded-full border border-[#E0D9CD] bg-transparent px-2.5 text-[10px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleGoToPreviousMatch}
                      disabled={searchResults.length === 0}
                    >
                      上一项
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-7 rounded-full border border-[#E0D9CD] bg-transparent px-2.5 text-[10px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleGoToNextMatch}
                      disabled={searchResults.length === 0}
                    >
                      下一项
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#E3DCCF] bg-[rgba(255,255,255,0.9)] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportMarkdown}
                      disabled={screenState !== 'ready'}
                    >
                      导出 Markdown
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportJson}
                      disabled={screenState !== 'ready'}
                    >
                      导出 JSON
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-8 rounded-full bg-[#26231F] px-4 text-white hover:bg-[#1D1B18]"
                      onClick={handleSave}
                      loading={saving}
                      disabled={screenState !== 'ready' || !isDirty}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4 lg:p-5">
              {renderReadyWorkspace(true)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
