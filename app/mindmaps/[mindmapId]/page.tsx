'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MainContent } from '@/components/ui/MainContent'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'

type MindmapColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'gray'

type MindmapNode = {
  id: string
  label: string
  color: MindmapColor
  children: MindmapNode[]
}

type ScreenState = 'loading' | 'ready' | 'auth' | 'missing' | 'error'

const colorOrder: MindmapColor[] = ['blue', 'green', 'orange', 'purple', 'rose', 'gray']

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

function normalizeNode(value: unknown, fallbackId: string): MindmapNode {
  if (!value || typeof value !== 'object') {
    return {
      id: fallbackId,
      label: fallbackId === 'root' ? '中心主题' : '新节点',
      color: fallbackId === 'root' ? 'blue' : 'gray',
      children: [],
    }
  }

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id ? record.id : fallbackId
  const label = typeof record.label === 'string' && record.label.trim()
    ? record.label
    : (id === 'root' ? '中心主题' : '新节点')
  const childrenSource = Array.isArray(record.children) ? record.children : []

  return {
    id,
    label,
    color: normalizeColor(record.color ?? (id === 'root' ? 'blue' : 'gray')),
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

type TreeNodeCardProps = {
  depth: number
  node: MindmapNode
  selectedNodeId: string
  onAddChild: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onSelect: (nodeId: string) => void
}

function nodeActionClassName(level: 'root' | 'primary' | 'secondary', emphasis: 'default' | 'muted' | 'danger' = 'default') {
  if (level === 'root') {
    return emphasis === 'muted'
      ? 'border-white/10 bg-white/6 text-white/76 hover:border-white/18 hover:bg-white/12 hover:text-white'
      : 'border-white/14 bg-white/10 text-white/92 hover:border-white/22 hover:bg-white/16 hover:text-white'
  }

  if (emphasis === 'danger') {
    return 'border border-[#E7D4D4] bg-[#FAF1F1] text-[#9E6B6B] hover:border-[#DDBFC0] hover:bg-[#F6E9E9]'
  }

  if (emphasis === 'muted') {
    return 'border border-transparent bg-transparent text-ink-500 hover:border-line/90 hover:bg-[#F9F7F2] hover:text-ink-800'
  }

  return 'border border-line/90 bg-[#FCFBF8] text-ink-700 hover:border-ink-300 hover:bg-white hover:text-ink-900'
}

function TreeNodeCard({
  depth,
  node,
  selectedNodeId,
  onAddChild,
  onDelete,
  onSelect,
}: TreeNodeCardProps) {
  const tone = colorMeta[node.color]
  const isSelected = node.id === selectedNodeId
  const isRoot = node.id === 'root'
  const isPrimary = depth === 1
  const level = isRoot ? 'root' : isPrimary ? 'primary' : 'secondary'

  return (
    <div className="relative">
      <div className={cn('flex flex-col gap-7 lg:gap-12', node.children.length > 0 && 'lg:flex-row lg:items-center')}>
        <div
          className={cn(
            'relative z-10 min-w-0',
            isRoot ? 'lg:w-[372px] xl:w-[404px]' : isPrimary ? 'lg:w-[304px]' : 'lg:w-[254px]'
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden border transition-all duration-200',
              isRoot
                ? 'min-h-[250px] rounded-[38px] px-10 py-9 sm:px-11 sm:py-10'
                : isPrimary
                  ? 'min-h-[190px] rounded-[30px] px-7 py-6 sm:px-8 sm:py-7'
                  : 'min-h-[154px] rounded-[26px] px-6 py-5 sm:px-7 sm:py-6',
              isRoot ? tone.rootCard : isPrimary ? tone.primaryCard : tone.secondaryCard,
              isSelected
                ? cn(tone.selected, isRoot ? 'shadow-[0_26px_56px_rgba(31,41,55,0.18)]' : 'shadow-[0_18px_40px_rgba(148,163,184,0.18)]')
                : 'hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(148,163,184,0.16)]'
            )}
            onClick={() => onSelect(node.id)}
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
              <div className={cn('flex flex-wrap items-center gap-2.5', isRoot && 'justify-center')}>
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

              <div className={cn('min-w-0', isRoot ? 'mt-8' : 'mt-6')}>
                <h3 className={cn(
                  'break-words font-serif',
                  isRoot
                    ? 'text-[2.12rem] leading-[1.22] text-white'
                    : isPrimary
                      ? 'text-[1.24rem] leading-[1.38] text-ink-900'
                      : 'text-[1.05rem] leading-snug text-ink-900'
                )}>
                  {node.label || '未命名节点'}
                </h3>
                <p className={cn(
                  'text-sm leading-6',
                  isRoot ? 'mt-3 text-white/76' : isPrimary ? 'mt-3 text-ink-600' : 'mt-2.5 text-ink-500'
                )}>
                  {node.children.length === 0 ? '暂无子节点' : `${node.children.length} 个子节点`}
                </p>
              </div>

              <div className={cn('mt-7 flex flex-wrap gap-3', isRoot && 'justify-center')}>
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
                  onClick={() => onSelect(node.id)}
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

        {node.children.length > 0 ? (
          <div className="relative min-w-0 flex-1">
            <div className={cn('pointer-events-none absolute left-0 top-1/2 hidden h-px w-[72px] -translate-y-1/2 opacity-60 lg:block', tone.line)} />
            <div className={cn('pointer-events-none absolute bottom-12 left-[72px] top-12 hidden w-px opacity-50 lg:block', tone.line)} />

            <div className="relative mt-6 pl-7 lg:mt-0 lg:pl-[72px]">
              <div className={cn('pointer-events-none absolute bottom-6 left-[10px] top-4 w-px opacity-55 lg:hidden', tone.line)} />

              <div className="space-y-6">
                {node.children.map(child => (
                  <div key={child.id} className="relative">
                    <div className={cn('pointer-events-none absolute left-[-16px] top-[38px] h-px w-5 opacity-55 lg:hidden', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-[72px] top-[38px] hidden h-px w-[72px] opacity-60 lg:block', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-[8px] top-[34px] hidden h-[9px] w-[9px] rotate-45 border-r border-t opacity-60 lg:block', tone.arrow)} />

                    <TreeNodeCard
                      depth={depth + 1}
                      node={child}
                      selectedNodeId={selectedNodeId}
                      onAddChild={onAddChild}
                      onDelete={onDelete}
                      onSelect={onSelect}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : isRoot ? (
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
      setLastSavedAt(data.updated_at)
      setSavedSnapshot(nextSnapshot)
      setScreenState('ready')
    })

    return () => { alive = false }
  }, [mindmapId])

  const currentSnapshot = useMemo(() => JSON.stringify({ title, tree }), [title, tree])
  const isDirty = screenState === 'ready' && currentSnapshot !== savedSnapshot
  const selectedNode = useMemo(
    () => findNodeById(tree, selectedNodeId) ?? tree,
    [selectedNodeId, tree]
  )
  const selectedNodeDepth = useMemo(
    () => findNodeDepth(tree, selectedNode.id) ?? 0,
    [selectedNode.id, tree]
  )
  const totalNodes = useMemo(() => countNodes(tree), [tree])

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
  }

  function handleTitleChange(value: string) {
    markEdited()
    setTitle(value)
  }

  function handleNodeLabelChange(value: string) {
    markEdited()
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

  function handleAddChild(nodeId: string) {
    const childNode: MindmapNode = {
      id: createNodeId(),
      label: '新节点',
      color: 'gray',
      children: [],
    }

    let added = false

    markEdited()
    setTree(current => {
      const result = addChildNode(current, nodeId, childNode)
      added = result.added
      return result.added ? result.nextNode : current
    })

    if (added) {
      setSelectedNodeId(childNode.id)
    }
  }

  function handleDeleteNode(nodeId: string) {
    if (nodeId === 'root') return

    const confirmed = window.confirm('确定删除该节点及其所有子节点吗？')
    if (!confirmed) return

    let removed = false

    markEdited()
    setTree(current => {
      const result = removeNodeById(current, nodeId)
      removed = result.removed
      return result.removed ? result.nextNode : current
    })

    if (removed) {
      setSelectedNodeId('root')
    }
  }

  async function handleSave() {
    if (!userId || screenState !== 'ready' || !isDirty || saving) return

    const nextTitle = title.trim() || '未命名导图'
    setSaving(true)
    setSaveError('')

    const { data, error: updateError } = await supabase
      .from('mindmaps')
      .update({
        title: nextTitle,
        content_json: tree,
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
    setSavedSnapshot(JSON.stringify({ title: nextTitle, tree }))
  }

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

  return (
    <div className="flex h-screen bg-[linear-gradient(180deg,#F5F1E8_0%,#F0ECE2_100%)]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
        <div className="min-h-[calc(100vh-40px)] rounded-[28px] border border-[#E6E0D4] bg-[linear-gradient(180deg,rgba(252,250,246,0.98),rgba(246,242,234,0.96))] shadow-[0_24px_60px_rgba(130,120,103,0.08)]">
          <MainContent size="wide">
            <Card padding="lg" className="mb-6 rounded-[30px] border border-[#E8E2D8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,237,0.94))] shadow-[0_18px_40px_rgba(130,120,103,0.06)]">
              <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end xl:gap-6">
                <div className="flex items-center">
                  <Button
                    variant="secondary"
                    className="min-h-11 rounded-full border-[#D6CFC2] bg-[#FCFBF8] px-5 text-ink-700 hover:border-[#BFB5A3] hover:bg-white hover:text-ink-900"
                    onClick={() => router.push('/mindmaps')}
                  >
                    返回列表
                  </Button>
                </div>

                <div className="min-w-0">
                  <p className="mb-3 text-xs uppercase tracking-[0.26em] text-ink-400">Mindmap Editor</p>
                  <div
                    className="rounded-[30px] border border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors focus-within:border-[#CDBDA6] focus-within:bg-white"
                    style={{ padding: '16px 30px' }}
                  >
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full border-0 bg-transparent font-serif text-[1.52rem] leading-[1.3] text-ink-900 outline-none placeholder:text-ink-400 sm:text-[1.7rem]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 xl:max-w-[460px] xl:items-end">
                  <div className="flex flex-wrap items-center gap-3 text-sm xl:justify-end">
                    <span className={cn(
                      'inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium',
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
                  <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-10 rounded-full border border-[#E0D9CD] bg-transparent px-4 text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportMarkdown}
                      disabled={screenState !== 'ready'}
                    >
                      导出 Markdown
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-10 rounded-full border border-[#E0D9CD] bg-transparent px-4 text-ink-600 hover:border-[#C9BEAE] hover:bg-[#FBF8F2]"
                      onClick={handleExportJson}
                      disabled={screenState !== 'ready'}
                    >
                      导出 JSON
                    </Button>
                    <Button
                      variant="primary"
                      className="min-h-10 rounded-full bg-[#26231F] px-6 text-white hover:bg-[#1D1B18]"
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
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.06fr)_minmax(430px,0.94fr)]">
                <Card padding="lg" className="rounded-[32px] border border-[#E6DFD3] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,244,237,0.94))] shadow-[0_24px_54px_rgba(130,120,103,0.08)]">
                  <div className="mb-7 flex flex-col gap-4 border-b border-[#E7E0D4] pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs uppercase tracking-[0.26em] text-ink-400">Mindmap View</p>
                      <h2 className="mt-2 font-serif text-[2rem] text-ink-900">纸本知识画布</h2>
                      <p className="mt-2 text-sm leading-7 text-ink-500">
                        以纸面笔记的留白和层级组织知识结构。桌面端向右延展分支，移动端保留纵向阅读顺序，保持编辑过程清楚克制。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[#E2DBCF] bg-[#FCFAF6] px-3 py-1.5 text-xs text-ink-600">
                        {totalNodes} 个节点
                      </span>
                    </div>
                  </div>

                  <div
                    className="rounded-[34px] border border-[#E4DDD1] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                    style={{
                      padding: '34px 38px',
                      backgroundImage: 'linear-gradient(rgba(134,125,113,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(134,125,113,0.035) 1px, transparent 1px), radial-gradient(circle at top left, rgba(198,154,109,0.05), transparent 28%), radial-gradient(circle at bottom right, rgba(111,159,176,0.05), transparent 24%), linear-gradient(180deg, rgba(252,250,245,0.98), rgba(246,242,234,0.96))',
                      backgroundSize: '28px 28px, 28px 28px, auto, auto, auto',
                    }}
                  >
                    <TreeNodeCard
                      depth={0}
                      node={tree}
                      selectedNodeId={selectedNodeId}
                      onAddChild={handleAddChild}
                      onDelete={handleDeleteNode}
                      onSelect={handleSelectNode}
                    />
                  </div>
                </Card>

                <Card padding="lg" className="rounded-[32px] border border-[#E6DFD3] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,242,235,0.95))] shadow-[0_24px_54px_rgba(130,120,103,0.08)]" as="section">
                  <div className="mb-7 border-b border-[#E7E0D4] pb-5">
                    <p className="text-xs uppercase tracking-[0.26em] text-ink-400">Node Details</p>
                    <h2 id="mindmap-node-editor" className="mt-2 font-serif text-[1.9rem] leading-[1.2] text-ink-900">
                      当前节点
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-ink-500">
                      以属性面板的方式管理当前节点的概览、内容、样式与结构操作。所有保存与导出逻辑保持不变。
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div
                      className="rounded-[28px] border border-[#E5DED2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,241,233,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      style={{ padding: '30px 32px' }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">当前节点概览</p>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-ink-400">{formatNodeLevel(selectedNodeDepth)}</p>
                          <h3 className="mt-2 break-words font-serif text-[1.55rem] leading-[1.24] text-ink-900">
                            {selectedNode.label || '未命名节点'}
                          </h3>
                          <p className="mt-3 text-sm leading-7 text-ink-500">
                            {selectedNode.id === 'root'
                              ? '这是中心主题，负责承载整张导图的主线。'
                              : `当前节点下有 ${selectedNode.children.length} 个直接子节点。`}
                          </p>
                        </div>
                        <span className={cn('rounded-full border px-3.5 py-1.5 text-xs leading-none', colorMeta[selectedNode.color].chip)}>
                          {colorMeta[selectedNode.color].label}
                        </span>
                      </div>

                      <div
                        className="mt-6 rounded-[22px] border border-[#E7E0D4] bg-[#FCFAF6]"
                        style={{ padding: '18px 24px' }}
                      >
                        <div className="space-y-3 text-sm text-ink-600">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs uppercase tracking-[0.16em] text-ink-400">Node ID</span>
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
                    </div>

                    <div
                      className="rounded-[24px] border border-[#E7E0D4] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,247,241,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      style={{ padding: '28px 32px' }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">节点内容</p>
                      <label htmlFor="mindmap-node-label" className="mt-3 block text-sm text-ink-700">
                        节点名称
                      </label>
                      <div
                        className="mt-3 rounded-[20px] border border-[#E1DBCF] bg-[#F8F5EE] transition-colors focus-within:border-[#CBBBA4] focus-within:bg-white"
                        style={{ padding: '14px 20px' }}
                      >
                        <input
                          id="mindmap-node-label"
                          value={selectedNode.label}
                          onChange={event => handleNodeLabelChange(event.target.value)}
                          className="w-full border-0 bg-transparent text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400"
                          placeholder="请输入节点文本"
                        />
                      </div>
                    </div>

                    <div
                      className="rounded-[24px] border border-[#E7E0D4] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,247,241,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      style={{ padding: '28px 32px' }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">节点样式</p>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="mt-3 text-sm text-ink-600">选择一组低饱和 Morandi 配色，用于标示结构层次。</p>
                        </div>
                        <span className={cn('rounded-full border px-3.5 py-1.5 text-xs leading-none', colorMeta[selectedNode.color].chip)}>
                          当前色: {colorMeta[selectedNode.color].label}
                        </span>
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {colorOrder.map(color => {
                          const tone = colorMeta[color]
                          const active = selectedNode.color === color
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleNodeColorChange(color)}
                              className={cn(
                                'min-h-[52px] rounded-[18px] border px-5 py-3 text-sm transition-colors',
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

                    <div
                      className="rounded-[24px] border border-[#E7E0D4] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,247,241,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                      style={{ padding: '28px 32px' }}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">结构操作</p>
                      <div className="mt-6 flex flex-wrap gap-4">
                        <Button
                          variant="primary"
                          className="min-h-11 rounded-full bg-[#26231F] px-6 text-white hover:bg-[#1D1B18]"
                          onClick={() => handleAddChild(selectedNode.id)}
                        >
                          添加子节点
                        </Button>
                        <Button
                          variant="secondary"
                          className="min-h-11 rounded-full border-[#D6CFC2] bg-[#FCFBF8] px-6 text-ink-700 hover:border-[#BFB5A3] hover:bg-white hover:text-ink-900"
                          onClick={() => handleSelectNode('root')}
                        >
                          选中中心主题
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11 rounded-full border border-[#E5D3D3] bg-[#FBF3F3] px-6 text-[#9E6B6B] hover:border-[#D6BBBB] hover:bg-[#F7E9E9]"
                          onClick={() => handleDeleteNode(selectedNode.id)}
                          disabled={selectedNode.id === 'root'}
                        >
                          删除当前节点
                        </Button>
                      </div>

                      {selectedNode.id === 'root' && (
                        <p
                          className="mt-5 rounded-[18px] border border-[#E7E0D4] bg-[#F8F5EE] text-xs leading-6 text-ink-500"
                          style={{ padding: '14px 20px' }}
                        >
                          中心主题作为整张导图的起点会被保留，因此这里不提供删除操作。
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </MainContent>
        </div>
      </main>
    </div>
  )
}
