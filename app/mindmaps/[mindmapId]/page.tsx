'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import {
  buildFishboneSvgLayout,
  buildOrganizationTreeLayout,
  buildTimelineSvgLayout,
  buildXmindAxisTreeLayout,
  buildXmindTopDownTreeLayout,
  buildXmindTreeLayout,
  type LayoutResult,
  type XmindLayoutDirection,
} from './mindmap-layout'
import {
  addChildNode,
  addSiblingNode,
  collectMatchingNodeIds,
  countNodes,
  expandPathToNode,
  findNodeById,
  findNodeDepth,
  findParentNode,
  getVisibleNavigationEntries,
  promoteNodeById,
  removeNodeById,
  setNodeCollapsed,
  setTreeCollapsedState,
  updateNodeById,
} from './mindmap-tree'
import type {
  LayoutTemplateId,
  MindmapBackground,
  MindmapBranchLine,
  MindmapColor,
  MindmapFontFamily,
  MindmapMeta,
  MindmapNavigationEntry,
  MindmapNode,
  MindmapTheme,
  MindmapViewport,
} from './mindmap-types'
import { mindmapColorOrder } from './mindmap-types'

type ScreenState = 'loading' | 'ready' | 'auth' | 'missing' | 'error'
type NodeInspectorTab = 'content' | 'style' | 'structure'
type FullscreenInspectorTab = 'node' | 'canvas'
type MindmapHistoryEntry = {
  title: string
  tree: MindmapNode
}

const colorOrder = mindmapColorOrder
const minCanvasZoom = 0.6
const maxCanvasZoom = 1.6
const canvasZoomStep = 0.1
const maxMindmapHistoryEntries = 80
const authLoadTimeoutMs = 12_000
const mindmapLoadTimeoutMs = 15_000
const defaultCanvasViewport: MindmapViewport = { x: 0, y: 0, zoom: 1 }
const defaultMindmapMeta: MindmapMeta = {
  layout: 'xmind-axis',
  theme: 'classic',
  background: 'paper',
  fontFamily: 'serif',
  branchLine: 'thin',
  rainbowBranches: false,
  compact: false,
}

const mindmapThemeOptions: Array<{
  id: MindmapTheme
  label: string
  description: string
  colors: [string, string, string]
  patch: Omit<Partial<MindmapMeta>, 'layout'>
}> = [
  {
    id: 'classic',
    label: '经典纸本',
    description: '柔和纸张、细线、适合长时间编辑。',
    colors: ['#7EA9B8', '#B7A58D', '#93AD99'],
    patch: {
      theme: 'classic',
      background: 'paper',
      fontFamily: 'serif',
      branchLine: 'thin',
      rainbowBranches: false,
      compact: false,
    },
  },
  {
    id: 'business',
    label: '商务清爽',
    description: '白底、无衬线、线条更清晰。',
    colors: ['#5D7482', '#8B9AA0', '#C6A06F'],
    patch: {
      theme: 'business',
      background: 'white',
      fontFamily: 'sans',
      branchLine: 'default',
      rainbowBranches: false,
      compact: false,
    },
  },
  {
    id: 'rainbow',
    label: '彩虹分支',
    description: '多色分支，适合分类和头脑风暴。',
    colors: ['#7EA9B8', '#93AD99', '#C58A8A'],
    patch: {
      theme: 'rainbow',
      background: 'paper',
      fontFamily: 'serif',
      branchLine: 'default',
      rainbowBranches: true,
      compact: false,
    },
  },
  {
    id: 'compact',
    label: '紧凑阅读',
    description: '压缩间距，分支多时更省空间。',
    colors: ['#8C928B', '#B8A47C', '#829BA4'],
    patch: {
      theme: 'compact',
      background: 'warm-gray',
      fontFamily: 'sans',
      branchLine: 'thin',
      rainbowBranches: true,
      compact: true,
    },
  },
  {
    id: 'dark',
    label: '深色画布',
    description: '深色背景，适合演示和低光环境。',
    colors: ['#8EAFC0', '#9AB58F', '#C7A17A'],
    patch: {
      theme: 'dark',
      background: 'dark',
      fontFamily: 'sans',
      branchLine: 'default',
      rainbowBranches: true,
      compact: false,
    },
  },
  {
    id: 'minimal',
    label: '极简白板',
    description: '白底细线，减少视觉干扰。',
    colors: ['#A4B1B6', '#B7A58D', '#A6AA9D'],
    patch: {
      theme: 'minimal',
      background: 'white',
      fontFamily: 'sans',
      branchLine: 'thin',
      rainbowBranches: false,
      compact: true,
    },
  },
]

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
    primaryCard: 'border-[#C8D8DE] bg-[linear-gradient(180deg,#EEF6F8_0%,#F7FAFA_100%)] shadow-[0_12px_26px_rgba(111,159,176,0.10)]',
    secondaryCard: 'border-[#D6E5EA] bg-[linear-gradient(180deg,#FFFFFF_0%,#F9FCFC_100%)] shadow-[0_8px_18px_rgba(111,159,176,0.06)]',
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
    primaryCard: 'border-[#D1DED4] bg-[linear-gradient(180deg,#F0F7F1_0%,#F8FAF7_100%)] shadow-[0_12px_26px_rgba(127,165,138,0.10)]',
    secondaryCard: 'border-[#DCE8DF] bg-[linear-gradient(180deg,#FFFFFF_0%,#F9FCFA_100%)] shadow-[0_8px_18px_rgba(127,165,138,0.06)]',
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
    primaryCard: 'border-[#E2D2C1] bg-[linear-gradient(180deg,#FAF3EA_0%,#FAF8F3_100%)] shadow-[0_12px_26px_rgba(198,154,109,0.10)]',
    secondaryCard: 'border-[#EBE0D3] bg-[linear-gradient(180deg,#FFFFFF_0%,#FCF9F5_100%)] shadow-[0_8px_18px_rgba(198,154,109,0.06)]',
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
    primaryCard: 'border-[#DED7E8] bg-[linear-gradient(180deg,#F5F0FA_0%,#FAF7FC_100%)] shadow-[0_12px_26px_rgba(154,136,181,0.10)]',
    secondaryCard: 'border-[#E8E0F0] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBF9FD_100%)] shadow-[0_8px_18px_rgba(154,136,181,0.06)]',
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
    primaryCard: 'border-[#E4D0D0] bg-[linear-gradient(180deg,#FAF0F0_0%,#FBF7F7_100%)] shadow-[0_12px_26px_rgba(197,138,138,0.10)]',
    secondaryCard: 'border-[#ECDEDE] bg-[linear-gradient(180deg,#FFFFFF_0%,#FCF8F8_100%)] shadow-[0_8px_18px_rgba(197,138,138,0.06)]',
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
    primaryCard: 'border-[#DDDCD7] bg-[linear-gradient(180deg,#F3F2EE_0%,#FAF9F6_100%)] shadow-[0_12px_26px_rgba(154,154,146,0.10)]',
    secondaryCard: 'border-[#E5E4DE] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF9F6_100%)] shadow-[0_8px_18px_rgba(154,154,146,0.06)]',
    line: 'bg-[#D7D5CF]',
    arrow: 'border-[#CBC9C3]',
  },
}

const xmindColorMeta: Record<MindmapColor, {
  accent: string
  soft: string
  text: string
  line: string
  action: string
}> = {
  blue: {
    accent: 'border-[#62A8BF] bg-[#62A8BF] text-white',
    soft: 'border-transparent bg-[#E9F6F8] text-[#2F687A]',
    text: 'text-[#2F687A]',
    line: '#62A8BF',
    action: 'border-[#BFDDE5] bg-white text-[#2F687A] hover:bg-[#F3FAFB]',
  },
  green: {
    accent: 'border-[#79B99F] bg-[#79B99F] text-white',
    soft: 'border-transparent bg-[#EAF7F1] text-[#477C66]',
    text: 'text-[#477C66]',
    line: '#79B99F',
    action: 'border-[#C8E4D8] bg-white text-[#477C66] hover:bg-[#F3FBF7]',
  },
  orange: {
    accent: 'border-[#FF9C62] bg-[#FF9C62] text-white',
    soft: 'border-transparent bg-[#FFF0E6] text-[#A55F34]',
    text: 'text-[#A55F34]',
    line: '#FF9C62',
    action: 'border-[#F1D2BD] bg-white text-[#A55F34] hover:bg-[#FFF8F3]',
  },
  purple: {
    accent: 'border-[#A78AC9] bg-[#A78AC9] text-white',
    soft: 'border-transparent bg-[#F2ECFA] text-[#715892]',
    text: 'text-[#715892]',
    line: '#A78AC9',
    action: 'border-[#D8C8EA] bg-white text-[#715892] hover:bg-[#FAF7FD]',
  },
  rose: {
    accent: 'border-[#EF7777] bg-[#EF7777] text-white',
    soft: 'border-transparent bg-[#FDECEC] text-[#A45454]',
    text: 'text-[#A45454]',
    line: '#EF7777',
    action: 'border-[#F1C7C7] bg-white text-[#A45454] hover:bg-[#FFF7F7]',
  },
  gray: {
    accent: 'border-[#9EA2A0] bg-[#9EA2A0] text-white',
    soft: 'border-transparent bg-[#F0F1EF] text-[#686D6A]',
    text: 'text-[#686D6A]',
    line: '#9EA2A0',
    action: 'border-[#D7DAD7] bg-white text-[#686D6A] hover:bg-[#F8F9F7]',
  },
}

const svgColorMeta: Record<MindmapColor, { fill: string; softFill: string; text: string; line: string }> = {
  blue: { fill: '#62A8BF', softFill: '#E9F6F8', text: '#2F687A', line: '#62A8BF' },
  green: { fill: '#79B99F', softFill: '#EAF7F1', text: '#477C66', line: '#79B99F' },
  orange: { fill: '#FF9C62', softFill: '#FFF0E6', text: '#A55F34', line: '#FF9C62' },
  purple: { fill: '#A78AC9', softFill: '#F2ECFA', text: '#715892', line: '#A78AC9' },
  rose: { fill: '#EF7777', softFill: '#FDECEC', text: '#A45454', line: '#EF7777' },
  gray: { fill: '#9EA2A0', softFill: '#F0F1EF', text: '#686D6A', line: '#9EA2A0' },
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

function normalizeMindmapTheme(value: unknown): MindmapTheme {
  return typeof value === 'string' && mindmapThemeOptions.some(option => option.id === value)
    ? value as MindmapTheme
    : defaultMindmapMeta.theme
}

function clampCanvasZoom(value: number) {
  const clamped = Math.min(maxCanvasZoom, Math.max(minCanvasZoom, value))
  return Math.round(clamped * 100) / 100
}

function normalizeCanvasViewport(value: unknown): MindmapViewport {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : defaultCanvasViewport.x
  const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : defaultCanvasViewport.y
  const zoom = typeof record.zoom === 'number' && Number.isFinite(record.zoom)
    ? clampCanvasZoom(record.zoom)
    : defaultCanvasViewport.zoom

  return { x, y, zoom }
}

function normalizeMindmapMeta(value: unknown): MindmapMeta {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    layout: record.layout === 'logic'
      || record.layout === 'right'
      || record.layout === 'organization'
      || record.layout === 'timeline'
      || record.layout === 'fishbone'
      || record.layout === 'xmind-axis'
      ? record.layout
      : defaultMindmapMeta.layout,
    theme: normalizeMindmapTheme(record.theme),
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
    viewport: record.viewport ? normalizeCanvasViewport(record.viewport) : undefined,
  }
}

function doesMindmapMetaMatchTheme(meta: MindmapMeta, option: (typeof mindmapThemeOptions)[number]) {
  return meta.theme === option.id
    && meta.background === option.patch.background
    && meta.fontFamily === option.patch.fontFamily
    && meta.branchLine === option.patch.branchLine
    && meta.rainbowBranches === option.patch.rainbowBranches
    && meta.compact === option.patch.compact
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

function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(errorMessage))
    }, timeoutMs)

    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeoutId))
  })
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapSvgText(value: string, maxLineLength: number) {
  const normalized = normalizeMarkdownText(value, '未命名节点')
  const lines: string[] = []
  for (let index = 0; index < normalized.length; index += maxLineLength) {
    lines.push(normalized.slice(index, index + maxLineLength))
  }
  return lines.slice(0, 3)
}

function getSvgLayout(tree: MindmapNode, styleMeta: MindmapMeta) {
  if (styleMeta.layout === 'xmind-axis') return buildXmindAxisTreeLayout(tree, styleMeta)
  if (styleMeta.layout === 'right') return buildXmindTreeLayout(tree, styleMeta)
  if (styleMeta.layout === 'timeline') return buildTimelineSvgLayout(tree, styleMeta)
  if (styleMeta.layout === 'fishbone') return buildFishboneSvgLayout(tree, styleMeta)
  if (styleMeta.layout === 'organization') return buildOrganizationTreeLayout(tree, styleMeta)
  return buildXmindTopDownTreeLayout(tree, styleMeta)
}

function getLayoutConnectorPath(
  connector: { fromX: number; fromY: number; kind?: 'curve' | 'spine'; toX: number; toY: number },
  direction?: XmindLayoutDirection
) {
  if (connector.kind === 'spine') {
    return `M ${connector.fromX} ${connector.fromY} L ${connector.toX} ${connector.toY}`
  }

  const vertical = direction === 'down'
    || Math.abs(connector.toY - connector.fromY) > Math.abs(connector.toX - connector.fromX)
  const controlOffset = vertical
    ? Math.max(46, Math.min(120, Math.abs(connector.toY - connector.fromY) * 0.5))
    : Math.max(76, Math.min(180, Math.abs(connector.toX - connector.fromX) * 0.45))
  const horizontalDirection = connector.toX >= connector.fromX ? 1 : -1
  const verticalDirection = connector.toY >= connector.fromY ? 1 : -1

  return vertical
    ? `M ${connector.fromX} ${connector.fromY} C ${connector.fromX} ${connector.fromY + controlOffset * verticalDirection}, ${connector.toX} ${connector.toY - controlOffset * verticalDirection}, ${connector.toX} ${connector.toY}`
    : `M ${connector.fromX} ${connector.fromY} C ${connector.fromX + controlOffset * horizontalDirection} ${connector.fromY}, ${connector.toX - controlOffset * horizontalDirection} ${connector.toY}, ${connector.toX} ${connector.toY}`
}

function buildMindmapSvg(tree: MindmapNode, title: string, styleMeta: MindmapMeta) {
  const layout = getSvgLayout(tree, styleMeta)
  const width = Math.max(960, Math.ceil(layout.width + 80))
  const height = Math.max(720, Math.ceil(layout.height + 80))
  const background = styleMeta.background === 'dark' ? '#24272D' : styleMeta.background === 'white' ? '#FFFFFF' : '#F8F4EC'
  const lineWidth = styleMeta.branchLine === 'thick' ? 2.4 : styleMeta.branchLine === 'default' ? 1.8 : 1.25
  const escapedTitle = escapeXml(title.trim() || '未命名导图')

  const connectorSvg = layout.connectors.map(connector => {
    const pathData = getLayoutConnectorPath(connector)

    return `<path d="${pathData}" fill="none" stroke="${connector.color}" stroke-linecap="round" stroke-width="${lineWidth}" opacity="0.78" />`
  }).join('\n')

  const nodeSvg = layout.nodes.map(placement => {
    const color = svgColorMeta[placement.branchColor ?? placement.node.color]
    const isRoot = placement.depth === 0
    const isPrimary = placement.depth === 1
    const fill = isRoot ? '#111111' : isPrimary ? color.fill : color.softFill
    const textColor = isRoot || isPrimary ? '#FFFFFF' : color.text
    const radius = isRoot ? 7 : isPrimary ? 6 : 5
    const lines = wrapSvgText(placement.node.label, isRoot ? 18 : 22)
    const fontSize = isRoot ? 18 : isPrimary ? 14 : 12
    const lineHeight = fontSize + 4
    const textStartY = placement.y + placement.height / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize / 2 - 2
    const textSvg = lines.map((line, index) => (
      `<text x="${placement.x + placement.width / 2}" y="${textStartY + index * lineHeight}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="${isRoot || isPrimary ? 600 : 500}" fill="${textColor}">${escapeXml(line)}</text>`
    )).join('\n')

    return [
      `<rect x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" rx="${radius}" fill="${fill}" stroke="${isRoot ? '#111111' : color.line}" stroke-width="1" />`,
      textSvg,
    ].join('\n')
  }).join('\n')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapedTitle}">`,
    `<rect width="100%" height="100%" fill="${background}" />`,
    `<text x="40" y="44" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="600" fill="${styleMeta.background === 'dark' ? '#F8FAFC' : '#2F2D29'}">${escapedTitle}</text>`,
    connectorSvg,
    nodeSvg,
    '</svg>',
  ].join('\n')
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
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.024) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.024) 1px, transparent 1px), radial-gradient(circle at top left, rgba(112,139,152,0.12), transparent 28%), linear-gradient(180deg, rgba(34,38,43,0.98), rgba(24,27,31,0.98))',
      backgroundSize: '32px 32px, 32px 32px, auto, auto',
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

function isMobileBrowserLayout() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(max-width: 1023px)').matches
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
type MindmapLayoutBuilder = (tree: MindmapNode, styleMeta: MindmapMeta) => LayoutResult

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

type MindmapNodeVariant = 'root' | 'primary' | 'secondary' | 'leaf'

type MindmapNodeCardProps = TreeNodeCardProps & {
  variant: MindmapNodeVariant
}

function MindmapNodeCard({
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
  variant,
}: MindmapNodeCardProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, styleMeta)]
  const fontClass = getMindmapFontClass(styleMeta.fontFamily)
  const isSelected = node.id === selectedNodeId
  const isRoot = variant === 'root'
  const isPrimary = variant === 'primary'
  const isInlineEditing = editingNodeId === node.id
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const isSearchMatch = matchedNodeIds.has(node.id)
  const isActiveSearchMatch = activeSearchNodeId === node.id
  const searchHighlightClass = getNodeSearchHighlightClass(isRoot, isSearchMatch, isActiveSearchMatch)
  const actionLevel = isRoot ? 'root' : isPrimary ? 'primary' : 'secondary'
  const variantClass = {
    root: 'min-w-[320px] max-w-[460px] rounded-[30px] px-14 py-9 text-center',
    primary: 'min-w-[260px] max-w-[400px] rounded-[22px] px-12 py-[22px] text-center',
    secondary: 'min-w-[240px] max-w-[360px] rounded-[18px] px-11 py-[18px] text-center',
    leaf: 'min-w-[210px] max-w-[330px] rounded-[16px] px-10 py-4 text-center',
  }[variant]
  const titleClass = {
    root: 'text-[1.72rem] text-white',
    primary: 'text-[1.08rem] font-medium text-ink-900',
    secondary: 'text-[0.96rem] font-medium text-ink-900',
    leaf: 'text-[0.92rem] text-ink-900',
  }[variant]
  const actionVisibilityClass = isRoot || isSelected
    ? 'opacity-100'
    : 'lg:max-h-0 lg:overflow-hidden lg:opacity-0 lg:group-hover:max-h-32 lg:group-hover:opacity-100 lg:group-focus-within:max-h-32 lg:group-focus-within:opacity-100'
  const actionButtonClass = {
    root: 'min-h-8 px-3.5 text-[11px]',
    primary: 'min-h-8 px-3 text-[11px]',
    secondary: 'min-h-7 px-2.5 text-[10px]',
    leaf: 'min-h-7 px-2.5 text-[10px]',
  }[variant]

  return (
    <div className="relative scroll-m-[120px]" data-node-id={node.id}>
      <div
        className={cn(
          'group relative overflow-visible border transition-all duration-200',
          variantClass,
          isRoot ? tone.rootCard : isPrimary ? tone.primaryCard : tone.secondaryCard,
          isSelected
            ? isRoot
              ? 'border-white/26 shadow-[0_28px_62px_rgba(31,41,55,0.2)] ring-1 ring-white/18'
              : 'border-[#CFC2AE] shadow-[0_14px_30px_rgba(130,120,103,0.12)] ring-2 ring-[#E8DECF]'
            : 'shadow-[0_8px_18px_rgba(130,120,103,0.05)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(130,120,103,0.10)]',
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
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(63,85,96,0.16),transparent_34%)]" />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-white/18" />
          </>
        ) : (
          <div className={cn('pointer-events-none absolute inset-y-4 left-7 rounded-full opacity-75', isPrimary ? 'w-[4px]' : 'w-[3px]', tone.line)} />
        )}

        <div className="relative min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            <span className={cn('uppercase tracking-[0.18em]', isRoot ? 'text-[10px] text-white/72' : 'text-[9px] text-ink-400')}>
              {formatNodeLevel(depth)}
            </span>
            <span className={cn('rounded-full border px-4 py-1 text-[10px] leading-none', isRoot ? tone.rootBadge : tone.chip)}>
              {tone.label}
            </span>
            {isSelected && (
              <span className={cn(
                'rounded-full border px-4 py-1 text-[10px] leading-none',
                isRoot ? 'border-white/20 bg-white/14 text-white' : 'border-white/90 bg-white text-ink-600 shadow-sm'
              )}>
                选中
              </span>
            )}
          </div>

          <div className={cn('min-w-0', isRoot ? 'mt-5' : 'mt-3.5')}>
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
                  'w-full rounded-[14px] border bg-transparent py-2 outline-none placeholder:text-ink-400',
                  fontClass,
                  isRoot
                    ? 'border-white/20 px-6 text-center text-[1.54rem] leading-relaxed text-white placeholder:text-white/56'
                    : 'border-[#DDD5C8] px-8 text-center text-sm leading-6 text-ink-900'
                )}
                placeholder="输入节点名称"
              />
            ) : (
              <h3
                className={cn('block max-w-full break-words text-center leading-relaxed [overflow-wrap:anywhere]', fontClass, titleClass)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  onInlineEditStart(node.id)
                }}
              >
                {node.label || (isRoot ? '中心主题' : '未命名节点')}
              </h3>
            )}
            <p className={cn('text-center leading-5', isRoot ? 'mt-3 text-sm text-white/76' : 'mt-2 text-[11px] text-ink-500')}>
              {hasChildren
                ? isCollapsed
                  ? `已折叠 ${node.children.length} 个子节点`
                  : `${node.children.length} 个子节点`
                : isRoot ? '暂无一级主题' : '暂无子节点'}
            </p>
          </div>

          <div className={cn(
            'flex flex-wrap transition-all duration-150',
            isRoot ? 'mt-6 justify-center gap-3' : 'mt-4 justify-center gap-2',
            actionVisibilityClass
          )}>
            <Button
              size="sm"
              variant={isRoot ? 'secondary' : 'ghost'}
              className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel))}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(node.id)
              }}
            >
              选择
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel, 'muted'))}
              onClick={(event) => {
                event.stopPropagation()
                onInlineEditStart(node.id)
              }}
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant={isRoot ? 'secondary' : 'ghost'}
              className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel))}
              onClick={(event) => {
                event.stopPropagation()
                onAddChild(node.id)
              }}
            >
              添加
            </Button>
            {hasChildren && (
              <Button
                size="sm"
                variant="ghost"
                className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel, 'muted'))}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleCollapse(node.id)
                }}
              >
                {isCollapsed ? '展开' : '收起'}
              </Button>
            )}
            {!isRoot && (
              <Button
                size="sm"
                variant="ghost"
                className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel))}
                onClick={(event) => {
                  event.stopPropagation()
                  onAddSibling(node.id)
                }}
              >
                同级
              </Button>
            )}
            {!isRoot && (
              <Button
                size="sm"
                variant="ghost"
                className={cn('rounded-full', actionButtonClass, nodeActionClassName(actionLevel, 'danger'))}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(node.id)
                }}
              >
                删除
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MindmapXmindNode({
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
  variant,
}: MindmapNodeCardProps) {
  const resolvedColor = variant === 'root' ? node.color : branchColor ?? node.color
  const tone = xmindColorMeta[resolvedColor]
  const fontClass = getMindmapFontClass(styleMeta.fontFamily)
  const isSelected = node.id === selectedNodeId
  const isRoot = variant === 'root'
  const isPrimary = variant === 'primary'
  const isInlineEditing = editingNodeId === node.id
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const isSearchMatch = matchedNodeIds.has(node.id)
  const isActiveSearchMatch = activeSearchNodeId === node.id
  const actionLevel = isRoot ? 'root' : isPrimary ? 'primary' : 'secondary'
  const searchHighlightClass = getNodeSearchHighlightClass(isRoot, isSearchMatch, isActiveSearchMatch)
  const nodeClass = isRoot
    ? 'w-[400px] max-w-[400px] rounded-[7px] border-[#111111] bg-[#111111] px-7 py-4 text-center text-white shadow-[0_14px_32px_rgba(17,17,17,0.16)]'
    : isPrimary
      ? cn('w-[270px] max-w-[270px] rounded-[6px] px-6 py-2.5 text-center shadow-none', tone.accent)
      : cn('w-[260px] max-w-[260px] rounded-[5px] px-5 py-2 text-center shadow-none', tone.soft)
  const titleClass = isRoot
    ? 'text-[1.14rem] font-semibold leading-snug sm:text-[1.28rem]'
    : isPrimary
      ? 'text-[0.92rem] font-semibold leading-snug'
      : 'text-[0.82rem] leading-snug'

  return (
    <div className="relative scroll-m-[120px]" data-node-id={node.id}>
      <div
        className={cn(
          'group relative border transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-0.5',
          nodeClass,
          isSelected && (isRoot ? 'ring-2 ring-[#111111]/15' : 'ring-2 ring-white ring-offset-2 ring-offset-[#F8F4EC]'),
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
              'w-full rounded-[4px] border bg-white/92 px-3 py-1.5 text-center outline-none',
              fontClass,
              isRoot ? 'border-white/20 text-[1.12rem] text-ink-900' : 'border-white/70 text-sm text-ink-900'
            )}
            placeholder="输入节点名称"
          />
        ) : (
          <h3
            className={cn('block max-w-full whitespace-normal break-words text-center [overflow-wrap:anywhere]', fontClass, titleClass)}
            onDoubleClick={(event) => {
              event.stopPropagation()
              onInlineEditStart(node.id)
            }}
          >
            {node.label || (isRoot ? '中心主题' : '未命名节点')}
          </h3>
        )}

        {hasChildren && isCollapsed ? (
          <span className={cn(
            'pointer-events-none absolute -right-2 -top-2 rounded-full border px-2 py-0.5 text-[10px] leading-none shadow-sm',
            isRoot ? 'border-white/18 bg-white/12 text-white' : 'border-white bg-white text-ink-500'
          )}>
            {node.children.length}
          </span>
        ) : null}

        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 flex-nowrap gap-1.5 rounded-full border border-[#E7DFD4] bg-white/96 px-2 py-1.5 opacity-0 shadow-[0_10px_24px_rgba(99,91,80,0.12)] transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            className={cn('min-h-7 rounded-full px-2.5 text-[10px]', isRoot ? nodeActionClassName(actionLevel) : tone.action)}
            onClick={(event) => {
              event.stopPropagation()
              onInlineEditStart(node.id)
            }}
          >
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('min-h-7 rounded-full px-2.5 text-[10px]', isRoot ? nodeActionClassName(actionLevel) : tone.action)}
            onClick={(event) => {
              event.stopPropagation()
              onAddChild(node.id)
            }}
          >
            添加
          </Button>
          {hasChildren && (
            <Button
              size="sm"
              variant="ghost"
              className={cn('min-h-7 rounded-full px-2.5 text-[10px]', isRoot ? nodeActionClassName(actionLevel, 'muted') : tone.action)}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapse(node.id)
              }}
            >
              {isCollapsed ? '展开' : '收起'}
            </Button>
          )}
          {!isRoot && (
            <Button
              size="sm"
              variant="ghost"
              className={cn('min-h-7 rounded-full px-2.5 text-[10px]', tone.action)}
              onClick={(event) => {
                event.stopPropagation()
                onAddSibling(node.id)
              }}
            >
              同级
            </Button>
          )}
          {!isRoot && (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-7 rounded-full border border-transparent px-2.5 text-[10px] text-[#A06F6F] hover:border-[#E4CDCD] hover:bg-[#FAF1F1]"
              onClick={(event) => {
                event.stopPropagation()
                onDelete(node.id)
              }}
            >
              删除
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function MindmapXmindBranch({
  branchColor,
  depth,
  node,
  ...props
}: { depth: number; node: MindmapNode } & MindmapRendererProps) {
  const resolvedColor = branchColor ?? node.color
  const tone = xmindColorMeta[resolvedColor]
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const variant: MindmapNodeVariant = depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'
  const lineWidth = props.styleMeta.branchLine === 'thick' ? 2.2 : props.styleMeta.branchLine === 'default' ? 1.6 : 1.15
  const childGap = props.styleMeta.compact ? 'gap-2.5' : 'gap-3.5'

  return (
    <div className="relative flex shrink-0 items-center gap-24">
      <div className="relative z-10 shrink-0">
        <MindmapXmindNode
          branchColor={branchColor}
          depth={depth}
          node={node}
          variant={variant}
          {...props}
        />
      </div>

      {hasChildren && !isCollapsed ? (
        <div className={cn('relative flex flex-col', childGap)}>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-[-96px] top-1/2 h-4 w-12 -translate-y-1/2 overflow-visible"
            viewBox="0 0 48 16"
          >
            <path
              d="M0 8 C15 8 28 8 48 8"
              fill="none"
              stroke={tone.line}
              strokeLinecap="round"
              strokeWidth={lineWidth}
              opacity="0.72"
            />
          </svg>
          {node.children.length > 1 && (
            <div
              className="pointer-events-none absolute bottom-[18px] left-[-48px] top-[18px] rounded-full"
              style={{ width: lineWidth, backgroundColor: tone.line, opacity: 0.42 }}
            />
          )}
          {node.children.map(child => (
            <div key={child.id} className="relative pl-[72px]">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute left-[-48px] top-1/2 h-5 w-[120px] -translate-y-1/2 overflow-visible"
                viewBox="0 0 120 20"
              >
                <path
                  d="M0 10 C34 10 62 10 120 10"
                  fill="none"
                  stroke={tone.line}
                  strokeLinecap="round"
                  strokeWidth={lineWidth}
                  opacity="0.66"
                />
              </svg>
              <MindmapXmindBranch
                branchColor={branchColor}
                depth={depth + 1}
                node={child}
                {...props}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MindmapXmindLayout({
  direction = 'right',
  tree,
  ...props
}: { direction?: XmindLayoutDirection; tree: MindmapNode } & MindmapRendererProps) {
  const hasChildren = tree.children.length > 0
  const isCollapsed = Boolean(tree.collapsed) && hasChildren
  const lineWidth = props.styleMeta.branchLine === 'thick' ? 2.4 : props.styleMeta.branchLine === 'default' ? 1.8 : 1.25
  const layout = direction === 'axis'
    ? buildXmindAxisTreeLayout(tree, props.styleMeta)
    : direction === 'down'
    ? buildXmindTopDownTreeLayout(tree, props.styleMeta)
    : buildXmindTreeLayout(tree, props.styleMeta)

  if (!hasChildren || isCollapsed) {
    return (
      <div className="relative min-h-[720px] min-w-[900px]">
        <div className="absolute left-20 top-1/2 z-20 -translate-y-1/2">
          <MindmapXmindNode
            depth={0}
            node={tree}
            variant="root"
            {...props}
          />
        </div>
        <div className="absolute left-[540px] top-1/2 max-w-[300px] -translate-y-1/2 rounded-[8px] border border-dashed border-[#D9D1C5] bg-white/86 px-5 py-3 text-center text-sm leading-6 text-ink-500">
          {hasChildren
            ? '中心主题已收起，可通过节点按钮或右侧面板展开。'
            : '先添加一级主题，导图会按 XMind 风格向右展开。'}
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative min-h-[720px] min-w-max"
      style={{
        height: Math.max(720, layout.height),
        width: layout.width,
      }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-visible"
        height={Math.max(720, layout.height)}
        width={layout.width}
      >
        {layout.connectors.map((connector, index) => {
          const pathData = getLayoutConnectorPath(connector, direction)

          return (
            <path
              key={`${connector.fromX}-${connector.fromY}-${connector.toX}-${connector.toY}-${index}`}
              d={pathData}
              fill="none"
              opacity="0.78"
              stroke={connector.color}
              strokeLinecap="round"
              strokeWidth={lineWidth}
            />
          )
        })}
      </svg>

      {layout.nodes.map(placement => (
        <div
          key={placement.node.id}
          className="absolute z-10"
          style={{
            height: placement.height,
            left: placement.x,
            top: placement.y,
            width: placement.width,
          }}
        >
          <MindmapXmindNode
            branchColor={placement.branchColor}
            depth={placement.depth}
            node={placement.node}
            variant={placement.variant}
            {...props}
          />
        </div>
      ))}
    </div>
  )
}

function MindmapPlacementLayout({
  buildLayout,
  tree,
  ...props
}: { buildLayout: MindmapLayoutBuilder; tree: MindmapNode } & MindmapRendererProps) {
  const lineWidth = props.styleMeta.branchLine === 'thick' ? 2.4 : props.styleMeta.branchLine === 'default' ? 1.8 : 1.25
  const layout = buildLayout(tree, props.styleMeta)

  return (
    <div
      className="relative min-h-[720px] min-w-max"
      style={{
        height: Math.max(720, layout.height),
        width: layout.width,
      }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-visible"
        height={Math.max(720, layout.height)}
        width={layout.width}
      >
        {layout.connectors.map((connector, index) => (
          <path
            key={`${connector.fromX}-${connector.fromY}-${connector.toX}-${connector.toY}-${index}`}
            d={getLayoutConnectorPath(connector)}
            fill="none"
            opacity={connector.kind === 'spine' ? '0.7' : '0.78'}
            stroke={connector.color}
            strokeLinecap="round"
            strokeWidth={lineWidth}
          />
        ))}
      </svg>

      {layout.nodes.map(placement => (
        <div
          key={placement.nodeId}
          className="absolute z-10"
          style={{
            height: placement.height,
            left: placement.x,
            top: placement.y,
            width: placement.width,
          }}
        >
          <MindmapXmindNode
            branchColor={placement.branchColor}
            depth={placement.depth}
            node={placement.node}
            variant={placement.variant}
            {...props}
          />
        </div>
      ))}
    </div>
  )
}

function MindmapDesktopBranch({
  branchColor,
  depth,
  node,
  ...props
}: { depth: number; node: MindmapNode } & MindmapRendererProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, props.styleMeta)]
  const lineClasses = getBranchLineClasses(props.styleMeta.branchLine)
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const variant: MindmapNodeVariant = depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'
  const childGapClass = depth === 1 ? 'gap-24' : 'gap-20'
  const incomingLineClass = depth === 1 ? '-left-28 w-[94px]' : depth === 2 ? '-left-[78px] w-[60px]' : '-left-[62px] w-[44px]'
  const childTrunkClass = depth === 1 ? '-left-[78px]' : '-left-[62px]'

  return (
    <div className={cn('relative flex shrink-0 items-center', childGapClass)}>
      <div className="relative z-10 shrink-0">
        <div className={cn('pointer-events-none absolute top-1/2 z-0 -translate-y-1/2 rounded-full opacity-70', incomingLineClass, tone.line, lineClasses.horizontal)} />
        <MindmapNodeCard
          branchColor={branchColor}
          depth={depth}
          node={node}
          variant={variant}
          {...props}
        />
      </div>

      {hasChildren && !isCollapsed ? (
        <div className="relative flex flex-col gap-6">
          {node.children.length > 1 && (
            <div className={cn('pointer-events-none absolute bottom-10 top-10 z-0 rounded-full opacity-55', childTrunkClass, tone.line, lineClasses.vertical)} />
          )}
          {node.children.map(child => (
            <MindmapDesktopBranch
              key={child.id}
              branchColor={branchColor}
              depth={depth + 1}
              node={child}
              {...props}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MindmapDesktopLayout({
  tree,
  ...props
}: { tree: MindmapNode } & MindmapRendererProps) {
  if (props.styleMeta.layout === 'xmind-axis') {
    return <MindmapXmindLayout direction="axis" tree={tree} {...props} />
  }

  if (props.styleMeta.layout === 'right') {
    return <MindmapXmindLayout direction="right" tree={tree} {...props} />
  }

  if (props.styleMeta.layout === 'timeline') {
    return <MindmapPlacementLayout buildLayout={buildTimelineSvgLayout} tree={tree} {...props} />
  }

  if (props.styleMeta.layout === 'fishbone') {
    return <MindmapPlacementLayout buildLayout={buildFishboneSvgLayout} tree={tree} {...props} />
  }

  if (props.styleMeta.layout === 'organization') {
    return <MindmapPlacementLayout buildLayout={buildOrganizationTreeLayout} tree={tree} {...props} />
  }

  return <MindmapXmindLayout direction="down" tree={tree} {...props} />
}

function MindmapMobileBranch({
  branchColor,
  depth,
  node,
  ...props
}: { depth: number; node: MindmapNode } & MindmapRendererProps) {
  const tone = colorMeta[resolveBranchColor(node.color, branchColor, props.styleMeta)]
  const hasChildren = node.children.length > 0
  const isCollapsed = Boolean(node.collapsed) && hasChildren
  const variant: MindmapNodeVariant = depth === 0 ? 'root' : depth === 1 ? 'primary' : depth === 2 ? 'secondary' : 'leaf'

  return (
    <div className="min-w-0">
      <MindmapNodeCard
        branchColor={branchColor}
        depth={depth}
        node={node}
        variant={variant}
        {...props}
      />

      {hasChildren && !isCollapsed ? (
        <div className="relative mt-5 space-y-5 pl-5">
          <div className={cn('pointer-events-none absolute bottom-3 left-2 top-0 w-px opacity-45', tone.line)} />
          {node.children.map((child, index) => (
            <div key={child.id} className="relative min-w-0">
              <div className={cn('pointer-events-none absolute -left-3 top-9 h-px w-3 opacity-55', tone.line)} />
              <MindmapMobileBranch
                branchColor={depth === 0 ? colorOrder[index % colorOrder.length] : branchColor}
                depth={depth + 1}
                node={child}
                {...props}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MindmapMobileLayout({
  tree,
  ...props
}: { tree: MindmapNode } & MindmapRendererProps) {
  return (
    <div className="w-full min-w-0">
      <MindmapMobileBranch depth={0} node={tree} {...props} />
    </div>
  )
}

function MindmapCanvas({
  fullscreen,
  setViewportRef,
  tree,
  useMobileLayout,
  viewport,
  onViewportChange,
  ...props
}: {
  fullscreen: boolean
  setViewportRef: (node: HTMLDivElement | null) => void
  tree: MindmapNode
  useMobileLayout: boolean
  viewport: MindmapViewport
  onViewportChange: (viewport: MindmapViewport) => void
} & MindmapRendererProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{
    startMouseX: number
    startMouseY: number
    startViewportX: number
    startViewportY: number
  } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    if (!fullscreen) return

    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current
      if (!viewport) return
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
    })

    return () => window.cancelAnimationFrame(frame)
  }, [fullscreen, tree.id, useMobileLayout])

  useEffect(() => {
    if (!isPanning || useMobileLayout) return

    function handleMouseMove(event: MouseEvent) {
      const activePan = panRef.current
      if (!activePan) return
      onViewportChange({
        ...viewport,
        x: activePan.startViewportX + event.clientX - activePan.startMouseX,
        y: activePan.startViewportY + event.clientY - activePan.startMouseY,
      })
    }

    function handleMouseUp() {
      panRef.current = null
      setIsPanning(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, onViewportChange, useMobileLayout, viewport])

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (useMobileLayout) return
    event.preventDefault()

    const nextZoom = clampCanvasZoom(viewport.zoom - event.deltaY * 0.0016)
    if (nextZoom === viewport.zoom) return

    const rect = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const scale = nextZoom / viewport.zoom

    onViewportChange({
      zoom: nextZoom,
      x: pointerX - (pointerX - viewport.x) * scale,
      y: pointerY - (pointerY - viewport.y) * scale,
    })
  }

  function handleCanvasMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (useMobileLayout || event.button !== 0 || isTypingTarget(event.target)) return
    if (event.target instanceof HTMLElement && event.target.closest('[data-node-id]')) return

    event.preventDefault()
    panRef.current = {
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startViewportX: viewport.x,
      startViewportY: viewport.y,
    }
    setIsPanning(true)
  }

  return (
    <div
      ref={node => {
        viewportRef.current = node
        setViewportRef(node)
      }}
      tabIndex={-1}
      onMouseDown={handleCanvasMouseDown}
      onWheel={handleCanvasWheel}
      className={cn(
        'h-full w-full min-h-0 flex-1 overscroll-contain rounded-none bg-transparent outline-none',
        useMobileLayout ? 'overflow-auto' : 'overflow-hidden',
        !useMobileLayout && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        fullscreen ? 'h-full' : 'h-[680px] lg:h-[760px]'
      )}
    >
      <div
        className={cn(
          'flex min-h-[720px]',
          useMobileLayout ? 'w-full min-w-0 items-start' : 'min-w-max items-center'
        )}
        style={{
          padding: useMobileLayout ? '24px 16px 40px 16px' : '64px 96px 96px 96px',
          transform: useMobileLayout ? undefined : `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        } as CSSProperties}
      >
        {useMobileLayout ? (
          <MindmapMobileLayout tree={tree} {...props} />
        ) : (
          <MindmapDesktopLayout tree={tree} {...props} />
        )}
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
  const [isMobileCanvasLayout, setIsMobileCanvasLayout] = useState(false)
  const [canvasViewport, setCanvasViewport] = useState<MindmapViewport>(defaultCanvasViewport)
  const [historyPast, setHistoryPast] = useState<MindmapHistoryEntry[]>([])
  const [historyFuture, setHistoryFuture] = useState<MindmapHistoryEntry[]>([])
  const [scrollRequest, setScrollRequest] = useState<{ nodeId: string; token: number } | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const canvasViewportRef = useRef<HTMLDivElement | null>(null)
  const screenStateRef = useRef(screenState)
  const titleRef = useRef(title)
  const treeRef = useRef(tree)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const editingNodeIdRef = useRef(editingNodeId)
  const isFullscreenEditorRef = useRef(isFullscreenEditor)
  const canvasViewportStateRef = useRef(canvasViewport)
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})
  const handleAddChildRef = useRef<(nodeId: string) => void>(() => {})
  const handleAddSiblingRef = useRef<(nodeId: string) => void>(() => {})
  const handleDeleteNodeRef = useRef<(nodeId: string) => void>(() => {})
  const handlePromoteNodeRef = useRef<(nodeId: string) => void>(() => {})
  const handleNavigateNodeRef = useRef<(direction: 'previous' | 'next' | 'parent' | 'child') => void>(() => {})
  const handleToggleCollapseRef = useRef<(nodeId: string) => void>(() => {})
  const handleUndoRef = useRef<() => void>(() => {})
  const handleRedoRef = useRef<() => void>(() => {})

  screenStateRef.current = screenState
  titleRef.current = title
  treeRef.current = tree
  selectedNodeIdRef.current = selectedNodeId
  editingNodeIdRef.current = editingNodeId
  isFullscreenEditorRef.current = isFullscreenEditor
  canvasViewportStateRef.current = canvasViewport

  function focusCanvasViewport() {
    window.requestAnimationFrame(() => {
      canvasViewportRef.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    let alive = true

    async function loadMindmap() {
      setScreenState('loading')
      setLoadingError('')

      try {
        const { data: { user } } = await runWithTimeout(
          supabase.auth.getUser(),
          authLoadTimeoutMs,
          '登录状态校验超时，请刷新后重试。'
        )

        if (!alive) return

        if (!user) {
          setScreenState('auth')
          return
        }

        setUserId(user.id)

        const { data, error: queryError } = await runWithTimeout(
          Promise.resolve(
            supabase
              .from('mindmaps')
              .select('id, user_id, title, description, source_module, content_json, updated_at')
              .eq('id', mindmapId)
              .eq('user_id', user.id)
              .maybeSingle()
          ),
          mindmapLoadTimeoutMs,
          '导图数据加载超时，请检查网络后重试。'
        )

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
        const nextViewport = normalizeMindmapMeta(nextTree.meta).viewport ?? defaultCanvasViewport

        setTitle(nextTitle)
        setTree(nextTree)
        setCanvasViewport(nextViewport)
        setSelectedNodeId(nextTree.id)
        setEditingNodeId(null)
        setEditingNodeLabel('')
        setHistoryPast([])
        setHistoryFuture([])
        setLastSavedAt(data.updated_at)
        setSavedSnapshot(nextSnapshot)
        setScreenState('ready')
      } catch (error) {
        if (!alive) return
        setLoadingError(error instanceof Error ? error.message : '加载导图失败，请稍后重试。')
        setScreenState('error')
      }
    }

    void loadMindmap()

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
  const canPromoteSelectedNode = selectedNodeDepth >= 2
  const canvasMeta = useMemo(
    () => normalizeMindmapMeta(tree.meta),
    [tree.meta]
  )
  const canvasZoom = canvasViewport.zoom
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

  function pushHistorySnapshot() {
    if (screenStateRef.current !== 'ready') return
    setHistoryPast(current => [
      ...current.slice(-(maxMindmapHistoryEntries - 1)),
      { title: titleRef.current, tree: treeRef.current },
    ])
    setHistoryFuture([])
  }

  function restoreHistoryEntry(entry: MindmapHistoryEntry) {
    const nextViewport = normalizeMindmapMeta(entry.tree.meta).viewport ?? defaultCanvasViewport
    setTitle(entry.title)
    setTree(entry.tree)
    setCanvasViewport(nextViewport)
    setSelectedNodeId(current => findNodeById(entry.tree, current)?.id ?? entry.tree.id)
    setEditingNodeId(null)
    setEditingNodeLabel('')
    markEdited()
    focusCanvasViewport()
  }

  function handleUndo() {
    if (historyPast.length === 0 || saving) return
    const previous = historyPast[historyPast.length - 1]
    setHistoryPast(current => current.slice(0, -1))
    setHistoryFuture(current => [
      { title: titleRef.current, tree: treeRef.current },
      ...current.slice(0, maxMindmapHistoryEntries - 1),
    ])
    restoreHistoryEntry(previous)
  }

  function handleRedo() {
    if (historyFuture.length === 0 || saving) return
    const next = historyFuture[0]
    setHistoryFuture(current => current.slice(1))
    setHistoryPast(current => [
      ...current.slice(-(maxMindmapHistoryEntries - 1)),
      { title: titleRef.current, tree: treeRef.current },
    ])
    restoreHistoryEntry(next)
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
    pushHistorySnapshot()
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
    pushHistorySnapshot()
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
    pushHistorySnapshot()
    setTree(current => ({
      ...current,
      meta: {
        ...normalizeMindmapMeta(current.meta),
        ...patch,
      },
    }))
  }

  function handleCanvasViewportChange(nextViewport: MindmapViewport) {
    const normalizedViewport = normalizeCanvasViewport(nextViewport)
    markEdited()
    setCanvasViewport(normalizedViewport)
    setTree(current => ({
      ...current,
      meta: {
        ...normalizeMindmapMeta(current.meta),
        viewport: normalizedViewport,
      },
    }))
  }

  function handleThemeSelect(theme: MindmapTheme) {
    const nextTheme = mindmapThemeOptions.find(option => option.id === theme)
    if (!nextTheme) return
    handleCanvasMetaChange(nextTheme.patch)
  }

  function handleZoomOut() {
    handleCanvasViewportChange({
      ...canvasViewport,
      zoom: clampCanvasZoom(canvasViewport.zoom - canvasZoomStep),
    })
  }

  function handleZoomIn() {
    handleCanvasViewportChange({
      ...canvasViewport,
      zoom: clampCanvasZoom(canvasViewport.zoom + canvasZoomStep),
    })
  }

  function handleZoomReset() {
    handleCanvasViewportChange(defaultCanvasViewport)
  }

  function handleFitCanvasView() {
    handleCanvasViewportChange({
      x: 32,
      y: 32,
      zoom: canvasMeta.compact ? 0.95 : 0.9,
    })
  }

  function handleLayoutTemplateSelect(templateId: LayoutTemplateId) {
    setLayoutTemplateNotice('')
    handleCanvasMetaChange({ layout: templateId })
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
    pushHistorySnapshot()
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
    pushHistorySnapshot()
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
    pushHistorySnapshot()
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

  function handlePromoteNode(nodeId: string) {
    if (nodeId === 'root') return

    const parentNode = findParentNode(tree, nodeId)
    if (!parentNode || parentNode.id === 'root') return

    let promoted = false

    setEditingNodeId(null)
    setEditingNodeLabel('')
    markEdited()
    pushHistorySnapshot()
    setTree(current => {
      const result = promoteNodeById(current, nodeId)
      promoted = result.promoted
      return result.promoted ? result.nextNode : current
    })

    if (promoted) {
      setSelectedNodeId(nodeId)
      focusCanvasViewport()
    }
  }

  function handleNavigateNode(direction: 'previous' | 'next' | 'parent' | 'child') {
    const entries = getVisibleNavigationEntries(treeRef.current)
    const currentIndex = entries.findIndex(entry => entry.node.id === selectedNodeIdRef.current)
    if (currentIndex < 0) return

    const currentEntry = entries[currentIndex]
    let nextEntry: MindmapNavigationEntry | undefined

    if (direction === 'previous') {
      nextEntry = entries[Math.max(0, currentIndex - 1)]
    } else if (direction === 'next') {
      nextEntry = entries[Math.min(entries.length - 1, currentIndex + 1)]
    } else if (direction === 'parent' && currentEntry.parentId) {
      nextEntry = entries.find(entry => entry.node.id === currentEntry.parentId)
    } else if (direction === 'child' && !currentEntry.node.collapsed && currentEntry.node.children.length > 0) {
      nextEntry = entries.find(entry => entry.parentId === currentEntry.node.id)
    }

    if (!nextEntry || nextEntry.node.id === selectedNodeIdRef.current) return
    locateNode(nextEntry.node.id)
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
    pushHistorySnapshot()
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
    pushHistorySnapshot()
    setTree(current => {
      const result = setNodeCollapsed(current, nodeId, !currentNode.collapsed)
      return result.changed ? result.nextNode : current
    })
    focusCanvasViewport()
  }

  function handleExpandAll() {
    markEdited()
    pushHistorySnapshot()
    setTree(current => setTreeCollapsedState(current, false, true))
    focusCanvasViewport()
  }

  function handleCollapseAll() {
    markEdited()
    pushHistorySnapshot()
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
  handlePromoteNodeRef.current = handlePromoteNode
  handleNavigateNodeRef.current = handleNavigateNode
  handleToggleCollapseRef.current = handleToggleCollapse
  handleUndoRef.current = handleUndo
  handleRedoRef.current = handleRedo

  useEffect(() => {
    if (!userId || screenState !== 'ready' || !isDirty || saving || editingNodeId) return

    const timeoutId = window.setTimeout(() => {
      void handleSaveRef.current()
    }, 1600)

    return () => window.clearTimeout(timeoutId)
  }, [currentSnapshot, editingNodeId, hasPendingInlineEdit, isDirty, saving, screenState, userId])

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
    const updateLayoutMode = () => {
      setIsMobileCanvasLayout(isMobileBrowserLayout())
    }

    updateLayoutMode()

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    mediaQuery.addEventListener('change', updateLayoutMode)
    window.addEventListener('resize', updateLayoutMode)

    return () => {
      mediaQuery.removeEventListener('change', updateLayoutMode)
      window.removeEventListener('resize', updateLayoutMode)
    }
  }, [])

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.isComposing) return

      const key = event.key
      const isSaveShortcut = (event.metaKey || event.ctrlKey) && key.toLowerCase() === 's'
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && key.toLowerCase() === 'f'
      const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.shiftKey && key.toLowerCase() === 'z'
      const isRedoShortcut = (event.metaKey || event.ctrlKey) && (key.toLowerCase() === 'y' || (event.shiftKey && key.toLowerCase() === 'z'))
      const isZoomShortcut = event.metaKey || event.ctrlKey

      if (isSaveShortcut) {
        event.preventDefault()
        event.stopPropagation()
        void handleSaveRef.current()
        return
      }

      if (isUndoShortcut && !isTypingTarget(event.target)) {
        event.preventDefault()
        event.stopPropagation()
        handleUndoRef.current()
        return
      }

      if (isRedoShortcut && !isTypingTarget(event.target)) {
        event.preventDefault()
        event.stopPropagation()
        handleRedoRef.current()
        return
      }

      if (isZoomShortcut && !isTypingTarget(event.target)) {
        if (key === '+' || key === '=') {
          event.preventDefault()
          event.stopPropagation()
          handleCanvasViewportChange({
            ...canvasViewportStateRef.current,
            zoom: clampCanvasZoom(canvasViewportStateRef.current.zoom + canvasZoomStep),
          })
          return
        }

        if (key === '-') {
          event.preventDefault()
          event.stopPropagation()
          handleCanvasViewportChange({
            ...canvasViewportStateRef.current,
            zoom: clampCanvasZoom(canvasViewportStateRef.current.zoom - canvasZoomStep),
          })
          return
        }

        if (key === '0') {
          event.preventDefault()
          event.stopPropagation()
          handleCanvasViewportChange(defaultCanvasViewport)
          return
        }
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
	        if (event.shiftKey) {
	          handlePromoteNodeRef.current(currentNodeId)
	        } else {
	          handleAddChildRef.current(currentNodeId)
	        }
	        return
	      }

	      if (key === 'ArrowUp') {
	        event.preventDefault()
	        handleNavigateNodeRef.current('previous')
	        return
	      }

	      if (key === 'ArrowDown') {
	        event.preventDefault()
	        handleNavigateNodeRef.current('next')
	        return
	      }

	      if (key === 'ArrowLeft') {
	        event.preventDefault()
	        handleNavigateNodeRef.current('parent')
	        return
	      }

	      if (key === 'ArrowRight') {
	        event.preventDefault()
	        handleNavigateNodeRef.current('child')
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

  function handleExportSvg() {
    if (screenState !== 'ready') return

    try {
      setExportError('')
      const filename = `${sanitizeMindmapFilename(title)}.svg`
      const content = buildMindmapSvg(tree, title, canvasMeta)
      downloadFile(filename, content, 'image/svg+xml;charset=utf-8')
    } catch {
      setExportError('导出失败，请稍后重试。')
    }
  }

  function renderCanvasPanel(fullscreen = false) {
    const canvasSurfaceStyle = getCanvasSurfaceStyle(canvasMeta.background)
    const currentTheme = mindmapThemeOptions.find(option => doesMindmapMetaMatchTheme(canvasMeta, option))
    const zoomPercent = Math.round(canvasZoom * 100)
    const isDarkCanvas = canvasMeta.background === 'dark'
    const toolbarShellClass = isDarkCanvas
      ? 'border-white/8 bg-[#171B20]/82 text-slate-300 shadow-[0_10px_32px_rgba(0,0,0,0.18)] backdrop-blur'
      : 'border-[#E6DED1] bg-white/86 text-ink-600 shadow-[0_8px_24px_rgba(111,102,88,0.08)] backdrop-blur'
    const toolbarPillClass = isDarkCanvas
      ? 'border-white/10 bg-white/[0.06] text-slate-300'
      : 'border-[#E5DED2] bg-[#FCFAF6] text-ink-600'
    const toolbarButtonClass = isDarkCanvas
      ? 'h-8 min-h-8 rounded-[9px] border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 hover:border-white/18 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:border-white/6 disabled:bg-white/[0.02] disabled:text-slate-500 disabled:opacity-100'
      : 'h-8 min-h-8 rounded-[9px] border border-[#E0D9CD] bg-white/70 px-3 text-xs font-medium text-ink-600 hover:border-[#C9BEAE] hover:bg-white hover:text-ink-900 disabled:cursor-not-allowed disabled:border-[#E9E2D7] disabled:bg-[#F5F1E8] disabled:text-ink-300 disabled:opacity-100'
    const toolbarStrongButtonClass = isDarkCanvas
      ? 'h-8 min-h-8 rounded-[9px] border border-white/14 bg-white/[0.09] px-3 text-xs font-semibold text-white hover:border-white/22 hover:bg-white/[0.13]'
      : 'h-8 min-h-8 rounded-[9px] border border-[#D8CBBA] bg-[#FAF7F1] px-3 text-xs font-semibold text-ink-800 hover:border-[#C4B49F] hover:bg-white'
    const shortcutHintClass = isDarkCanvas
      ? 'border-white/8 bg-[#171B20]/62 text-slate-400'
      : 'border-[#E7DFD4] bg-white/68 text-ink-500'

    return (
      <Card
        variant="flat"
        padding="none"
        className={cn(
          'min-w-0 overflow-visible !rounded-none !border-0 !bg-transparent !shadow-none',
          fullscreen && 'flex h-full min-h-0 flex-col'
        )}
      >
        <div
          className={cn(
            'rounded-none',
            fullscreen && 'flex min-h-0 flex-1 flex-col'
          )}
          style={{
            padding: '0',
            ...canvasSurfaceStyle,
          }}
        >
          <div className={cn('mb-2 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border px-2.5 py-2 text-xs', toolbarShellClass)}>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex h-8 items-center rounded-[9px] border px-2.5 text-xs', toolbarPillClass)}>
                {totalNodes} 节点
              </span>
              <span className={cn('inline-flex h-8 items-center rounded-[9px] border px-2.5 text-xs', toolbarPillClass)}>
                {searchQuery.trim() ? `${searchResults.length} 匹配` : '未搜索'}
              </span>
              <span className={cn('inline-flex h-8 max-w-[220px] items-center rounded-[9px] border px-2.5 text-xs', toolbarPillClass)}>
                <span className="truncate">{selectedNode.label || '未命名节点'}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleZoomOut}
                disabled={canvasZoom <= minCanvasZoom}
              >
                缩小
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(toolbarStrongButtonClass, 'min-w-16 justify-center')}
                onClick={handleZoomReset}
              >
                {zoomPercent}%
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleZoomIn}
                disabled={canvasZoom >= maxCanvasZoom}
              >
                放大
              </Button>
              <span className={cn('mx-0.5 hidden h-5 w-px sm:block', isDarkCanvas ? 'bg-white/10' : 'bg-[#E2D8CB]')} />
              <button
                type="button"
                className={toolbarButtonClass}
                onClick={() => setFullscreenInspectorTab('canvas')}
              >
                {currentTheme?.label ?? '自定义风格'}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleFitCanvasView}
                disabled={screenState !== 'ready'}
              >
                适应
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleExpandAll}
                disabled={screenState !== 'ready'}
              >
                全部展开
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleCollapseAll}
                disabled={screenState !== 'ready'}
              >
                全部收起
              </Button>
            </div>
          </div>
          <div className={cn(
            'mb-3 hidden w-fit rounded-[9px] border px-2.5 py-1 text-[11px] leading-5',
            shortcutHintClass,
            !isMobileCanvasLayout && 'lg:block'
          )}>
            快捷键 Tab 添加子节点 · Enter 同级 · Delete 删除 · Cmd/Ctrl+S 保存
          </div>
          <MindmapCanvas
            fullscreen={fullscreen}
            setViewportRef={node => { canvasViewportRef.current = node }}
            tree={tree}
            useMobileLayout={isMobileCanvasLayout}
            viewport={canvasViewport}
            onViewportChange={handleCanvasViewportChange}
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
          {searchQuery.trim() ? (
            <div className="mt-4 rounded-[22px] border border-[#E6DFD2] bg-[rgba(252,250,245,0.86)] px-7 py-3 text-center">
              <div className="mb-2 flex flex-col items-center justify-center gap-1 text-xs text-ink-500">
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
                        'flex w-full flex-col items-center justify-center gap-1 rounded-[16px] border px-6 py-2 text-center text-sm transition-colors',
                        activeSearchNodeId === item.id
                          ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900'
                          : 'border-[#ECE5D9] bg-[#FCFAF6] text-ink-600 hover:border-[#D8CCBC] hover:bg-[#F8F4EC] hover:text-ink-900'
                      )}
                    >
                      <span className="max-w-full truncate">{item.label}</span>
                      <span className="shrink-0 text-xs text-ink-400">{item.level}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#E5DED2] bg-[#FCFAF6] px-6 py-2 text-center text-sm text-ink-500">
                    未匹配到节点。
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[22px] border border-dashed border-[#E1D9CC] bg-[rgba(252,250,245,0.84)] px-7 py-3 text-center text-sm leading-6 text-ink-500">
              画布优先保留横向展开空间，分支较多时会在内部滚动，不压缩脑图结构。
            </div>
          )}
        </div>
      </Card>
    )
  }

  function renderInspectorPanel(fullscreen = false) {
    const showingCanvasInspector = fullscreenInspectorTab === 'canvas'
    const nodeInfoRows = [
      ['节点 ID', selectedNode.id],
      ['层级', formatNodeLevel(selectedNodeDepth)],
      ['子节点', `${selectedNode.children.length}`],
    ]

    const nodeInspector = (
      <>
        <div className="min-w-0 rounded-[12px] border border-[#E6DED2] bg-white/82 px-4 py-3.5 text-center shadow-[0_8px_20px_rgba(111,102,88,0.045)]">
          <div className="flex min-w-0 flex-col items-center gap-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">{formatNodeLevel(selectedNodeDepth)}</p>
              <h3 className="mt-1.5 max-w-full break-words text-sm font-semibold leading-5 text-ink-900">
                {selectedNode.label || '未命名节点'}
              </h3>
              <p className="mt-1.5 text-[11px] leading-5 text-ink-500">
                {selectedNode.id === 'root'
                  ? '中心主题固定保留，用作整张导图的起点。'
                  : `当前节点下有 ${selectedNode.children.length} 个直接子节点。`}
              </p>
            </div>
            <span className={cn('w-fit shrink-0 rounded-[8px] border px-2 py-1 text-[11px] leading-none', colorMeta[selectedNode.color].chip)}>
              {colorMeta[selectedNode.color].label}
            </span>
          </div>
        </div>

        <div className="grid h-9 min-w-0 grid-cols-3 rounded-[10px] border border-[#E7DFD4] bg-[#F5F1EA] p-1">
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
                'min-w-0 rounded-[7px] px-2 text-center text-xs font-medium transition-colors',
                nodeInspectorTab === key
                  ? 'bg-white text-ink-900 shadow-[0_4px_10px_rgba(111,102,88,0.08)]'
                  : 'text-ink-500 hover:text-ink-900'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {nodeInspectorTab === 'content' && (
          <>
            <div className="space-y-2">
              <label htmlFor="mindmap-node-label" className="block text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">
                节点名称
              </label>
              <input
                id="mindmap-node-label"
                value={selectedNode.label}
                onChange={event => handleNodeLabelChange(event.target.value)}
                className="h-10 w-full min-w-0 rounded-[10px] border border-[#DDD4C6] bg-white px-3 text-center text-sm leading-5 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-[#BFAF99] focus:bg-white"
                placeholder="请输入节点文本"
              />
            </div>
            <div className="min-w-0 divide-y divide-[#ECE4D8] rounded-[10px] border border-[#E8E0D4] bg-white/68 text-sm">
              {nodeInfoRows.map(([label, value]) => (
                <div key={label} className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] items-center gap-3 px-3.5 py-2.5">
                  <span className="text-[11px] text-ink-400">{label}</span>
                  <span className="min-w-0 break-words text-left text-xs font-medium leading-5 text-ink-800" title={value}>{value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {nodeInspectorTab === 'style' && (
          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400">节点颜色</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">用低饱和配色区分主题层次。</p>
              </div>
              <span className={cn('w-fit shrink-0 rounded-[8px] border px-2 py-1 text-[11px] leading-none', colorMeta[selectedNode.color].chip)}>
                当前色: {colorMeta[selectedNode.color].label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {colorOrder.map(color => {
                const tone = colorMeta[color]
                const active = selectedNode.color === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleNodeColorChange(color)}
                    className={cn(
                      'min-h-9 rounded-[10px] border px-3 py-2 text-xs font-medium transition-colors',
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
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">结构操作</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="h-9 min-h-9 rounded-[10px] bg-[#26231F] px-3 text-xs text-white hover:bg-[#1D1B18]"
                  onClick={() => handleAddChild(selectedNode.id)}
                >
                  添加子主题
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 min-h-9 rounded-[10px] border border-[#D6CFC2] bg-white px-3 text-xs text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleAddSibling(selectedNode.id)}
                  disabled={selectedNode.id === 'root'}
                >
                  添加同级
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 min-h-9 rounded-[10px] border border-[#D6CFC2] bg-white px-3 text-xs text-ink-700 hover:border-[#BFB5A3] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleToggleCollapse(selectedNode.id)}
                  disabled={selectedNode.children.length === 0}
                >
                  {selectedNodeIsCollapsed ? '展开分支' : '折叠分支'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 min-h-9 rounded-[10px] border border-[#E5D3D3] bg-[#FBF3F3] px-3 text-xs text-[#9E6B6B] hover:border-[#D6BBBB] hover:bg-[#F7E9E9] disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  disabled={selectedNode.id === 'root'}
                >
                  删除
                </Button>
              </div>
            </div>
            {selectedNode.id === 'root' && (
              <p className="rounded-[10px] bg-[#F8F5EE] px-3 py-2 text-xs leading-5 text-ink-500">
                中心主题不能删除，也不能创建同级节点；可继续添加一级主题来扩展主轴。
              </p>
            )}
          </>
        )}
      </>
    )

    const canvasInspector = (
      <>
        <div className="rounded-[22px] border border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,241,233,0.94))] px-8 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-400">画布样式</p>
          <h3 className="mt-2 font-serif text-[1.3rem] leading-[1.2] text-ink-900">全局格式</h3>
          <p className="mt-2 text-sm leading-6 text-ink-500">这些设置会写入 root.meta，并在保存后随导图一起保留。</p>
        </div>

        <div className="px-1 py-1 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">导图风格</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {mindmapThemeOptions.map(option => {
              const active = doesMindmapMetaMatchTheme(canvasMeta, option)

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleThemeSelect(option.id)}
                  className={cn(
                    'rounded-[18px] border px-4 py-4 text-center transition-colors',
                    active
                      ? 'border-[#D7CCBC] bg-[#F6F0E6] text-ink-900 shadow-sm'
                      : 'border-[#E5DED2] bg-white text-ink-700 hover:border-[#D4C9B9] hover:bg-[#FBF7F0]'
                  )}
                >
                  <div className="relative mx-auto h-16 w-full max-w-[150px] overflow-hidden rounded-[14px] border border-[#ECE4D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,244,237,0.9))]">
                    <div className="absolute left-[18%] top-1/2 h-px w-[64%] -translate-y-1/2 rounded-full bg-[#D8CDBF]" />
                    <div
                      className="absolute left-1/2 top-1/2 h-5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ backgroundColor: option.colors[0] }}
                    />
                    <div
                      className="absolute left-[14%] top-[18%] h-4 w-9 rounded-full"
                      style={{ backgroundColor: option.colors[1] }}
                    />
                    <div
                      className="absolute right-[14%] bottom-[18%] h-4 w-9 rounded-full"
                      style={{ backgroundColor: option.colors[2] }}
                    />
                  </div>
                  <span className="mt-3 block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-400">{option.description}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-1 py-1 text-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-400">导图结构</p>
              <p className="mt-2 text-sm leading-6 text-ink-500">像 XMind 一样切换结构模板，保存后会跟随导图保留。</p>
            </div>
            <span className="rounded-full border border-[#E4DDD2] bg-white px-5 py-1 text-[10px] text-ink-500">布局</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([
              ['xmind-axis', '主轴结构'],
              ['right', '向右结构'],
              ['logic', '逻辑图'],
              ['organization', '组织结构图'],
              ['timeline', '时间轴'],
              ['fishbone', '鱼骨图'],
            ] as const).map(([templateId, label]) => {
              const isSelected = canvasMeta.layout === templateId

              return (
                <button
                  key={templateId}
                  type="button"
                  onClick={() => handleLayoutTemplateSelect(templateId)}
                  className={cn(
                    'rounded-[18px] p-2 text-center transition-colors',
                    isSelected
                      ? 'bg-[#F6F0E6] shadow-sm'
                      : 'bg-white hover:bg-[#FBF7F0]'
                  )}
                >
                  {renderLayoutTemplatePreview(templateId)}
                  <div className="mt-3 flex flex-col items-center justify-center gap-3 px-1 pb-1 text-center">
                    <div className="text-center">
                      <p className="text-sm text-ink-900">{label}</p>
                      <p className="mt-1 text-xs text-ink-400">可用</p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-4 py-1 text-[10px]',
                        'border-[#DCCFBD] bg-white text-ink-600'
                      )}
                    >
                      {isSelected ? '当前结构' : '切换'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
          {layoutTemplateNotice ? (
            <p className="mt-4 rounded-[14px] border border-[#E7D9C8] bg-[#FBF5EC] px-6 py-2 text-sm text-[#9A7650]">
              {layoutTemplateNotice}
            </p>
          ) : null}
        </div>

        <div className="px-1 py-1 text-center">
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
                  'min-h-[46px] rounded-[14px] border px-6 py-2 text-sm transition-colors',
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

        <div className="px-1 py-1 text-center">
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
                  'min-h-[46px] rounded-[14px] border px-6 py-2 text-sm transition-colors',
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

        <div className="px-1 py-1 text-center">
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
                  'min-h-[46px] rounded-[14px] border px-5 py-2 text-sm transition-colors',
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

        <div className="px-1 py-1 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">布局细节</p>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => handleCanvasMetaChange({ rainbowBranches: !canvasMeta.rainbowBranches })}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-1 rounded-[14px] border px-6 py-3 text-center text-sm transition-colors',
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
                'flex w-full flex-col items-center justify-center gap-1 rounded-[14px] border px-6 py-3 text-center text-sm transition-colors',
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
        variant="flat"
        padding="none"
        className={cn(
          'min-w-0 overflow-hidden !rounded-none !border-0 !bg-transparent !shadow-none',
          fullscreen ? 'flex h-full min-h-0 flex-col overflow-hidden' : 'xl:sticky xl:top-6 xl:self-start'
        )}
        as="section"
      >
        <div className={cn('flex min-w-0 flex-col px-6 py-5 sm:px-7', fullscreen && 'min-h-0 flex-1')}>
          <div className="mb-4 min-w-0 border-b border-[#E7E0D4] pb-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">Inspector</p>
            <h2 id="mindmap-node-editor" className="mt-1.5 max-w-full break-words text-[15px] font-semibold leading-6 text-ink-900">
              {showingCanvasInspector ? '画布样式' : '当前节点'}
            </h2>
            <p className="mt-1 max-w-full text-[11px] leading-5 text-ink-500">
              {showingCanvasInspector
                ? '像 XMind 的格式面板一样管理整张导图的风格、结构、背景和线条。'
                : '编辑当前选中节点的内容、颜色和结构操作。'}
            </p>
          </div>

          <div className={cn('min-w-0 space-y-3.5', fullscreen && 'min-h-0 flex-1 overflow-y-auto pr-3')}>
            <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
              {([
                ['node', '节点'],
                ['canvas', '画布'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFullscreenInspectorTab(key)}
                  className={cn(
                    'min-w-0 rounded-[10px] border border-transparent px-2.5 py-1.5 text-center text-xs font-medium transition-colors sm:px-3',
                    fullscreenInspectorTab === key
                      ? 'border-[#E3D7C7] bg-white text-ink-900 shadow-[0_6px_14px_rgba(130,120,103,0.08)]'
                      : 'text-ink-500 hover:text-ink-900'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {showingCanvasInspector ? canvasInspector : nodeInspector}
          </div>
        </div>
      </Card>
    )
  }

  function renderReadyWorkspace(fullscreen = false) {
    return (
      <div className={cn(
        'grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]',
        fullscreen && 'h-full min-h-0 gap-4',
        fullscreen && !isMobileCanvasLayout && 'grid-cols-[minmax(0,1fr)_460px] 2xl:grid-cols-[minmax(0,1fr)_500px]',
        fullscreen && isMobileCanvasLayout && 'md:grid-cols-[minmax(0,1fr)_420px]'
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
        <div className="min-h-[calc(100vh-40px)]">
          <MainContent size="full">
            <Card
              variant="flat"
              padding="lg"
              className="mb-5 !rounded-none !border-0 !bg-transparent !shadow-none"
            >
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
                  <div className="min-w-[240px] flex-1 rounded-[22px] border border-[#E4DDD1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] px-8 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors focus-within:border-[#CDBDA6] focus-within:bg-white">
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full border-0 bg-transparent text-center font-serif text-[1.12rem] leading-[1.25] text-ink-900 outline-none placeholder:text-ink-400 sm:text-[1.22rem]"
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
                  <div className="flex flex-wrap items-center gap-2">
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
	                      onClick={() => handlePromoteNode(selectedNode.id)}
	                      disabled={screenState !== 'ready' || !canPromoteSelectedNode}
	                    >
	                      提升层级
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
                      onClick={handleUndo}
                      disabled={screenState !== 'ready' || historyPast.length === 0}
                    >
                      撤销
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleRedo}
                      disabled={screenState !== 'ready' || historyFuture.length === 0}
                    >
                      重做
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
                  <div className="flex min-w-[240px] flex-1 items-center gap-2">
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={event => handleSearchQueryChange(event.target.value)}
                      className="min-w-[120px] flex-1 rounded-full border border-[#E3DCCF] bg-[#FCFAF6] px-7 py-1.5 text-center text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400 focus:border-[#CDBDA6]"
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
                  <div className="flex flex-wrap items-center gap-2">
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
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportSvg}
                      disabled={screenState !== 'ready'}
                    >
                      导出 SVG
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
                  <div className="min-w-[220px] flex-1 rounded-[20px] border border-[#E4DDD1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] px-8 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors focus-within:border-[#CDBDA6] focus-within:bg-white">
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full border-0 bg-transparent text-center font-serif text-[1.02rem] leading-[1.2] text-ink-900 outline-none placeholder:text-ink-400 sm:text-[1.12rem]"
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
                  <div className="flex flex-wrap items-center gap-2">
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
	                      onClick={() => handlePromoteNode(selectedNode.id)}
	                      disabled={screenState !== 'ready' || !canPromoteSelectedNode}
	                    >
	                      提升层级
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
                      onClick={handleUndo}
                      disabled={screenState !== 'ready' || historyPast.length === 0}
                    >
                      撤销
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-700 hover:border-[#C9BEAE] hover:bg-[#FBF8F2] disabled:cursor-not-allowed disabled:opacity-45"
                      onClick={handleRedo}
                      disabled={screenState !== 'ready' || historyFuture.length === 0}
                    >
                      重做
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
                  <div className="flex min-w-[240px] flex-1 items-center gap-2">
                    <input
                      ref={searchInputRef}
                      value={searchQuery}
                      onChange={event => handleSearchQueryChange(event.target.value)}
                      className="min-w-[120px] flex-1 rounded-full border border-[#E3DCCF] bg-[#FCFAF6] px-7 py-1.5 text-center text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400 focus:border-[#CDBDA6]"
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
                  <div className="flex flex-wrap items-center gap-2">
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
                      className="min-h-8 rounded-full border border-[#E0D9CD] bg-transparent px-3 text-[11px] text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportSvg}
                      disabled={screenState !== 'ready'}
                    >
                      导出 SVG
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
