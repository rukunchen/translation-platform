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
    chip: 'border-sky-200 bg-sky-100 text-sky-700',
    button: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
    selected: 'ring-2 ring-sky-200',
    rootCard: 'border-sky-500 bg-sky-500 text-white shadow-[0_20px_44px_rgba(14,116,144,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-sky-300 bg-linear-to-br from-sky-100 via-white to-sky-50 shadow-[0_14px_32px_rgba(14,116,144,0.10)]',
    secondaryCard: 'border-sky-200 bg-white/92 shadow-[0_10px_24px_rgba(14,116,144,0.08)]',
    line: 'bg-sky-200/90',
    arrow: 'border-sky-300',
  },
  green: {
    label: '绿',
    chip: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    button: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    selected: 'ring-2 ring-emerald-200',
    rootCard: 'border-emerald-500 bg-emerald-500 text-white shadow-[0_20px_44px_rgba(5,150,105,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-emerald-300 bg-linear-to-br from-emerald-100 via-white to-emerald-50 shadow-[0_14px_32px_rgba(5,150,105,0.10)]',
    secondaryCard: 'border-emerald-200 bg-white/92 shadow-[0_10px_24px_rgba(5,150,105,0.08)]',
    line: 'bg-emerald-200/90',
    arrow: 'border-emerald-300',
  },
  orange: {
    label: '橙',
    chip: 'border-amber-200 bg-amber-100 text-amber-700',
    button: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    selected: 'ring-2 ring-amber-200',
    rootCard: 'border-amber-500 bg-amber-500 text-white shadow-[0_20px_44px_rgba(217,119,6,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-amber-300 bg-linear-to-br from-amber-100 via-white to-amber-50 shadow-[0_14px_32px_rgba(217,119,6,0.10)]',
    secondaryCard: 'border-amber-200 bg-white/92 shadow-[0_10px_24px_rgba(217,119,6,0.08)]',
    line: 'bg-amber-200/90',
    arrow: 'border-amber-300',
  },
  purple: {
    label: '紫',
    chip: 'border-violet-200 bg-violet-100 text-violet-700',
    button: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
    selected: 'ring-2 ring-violet-200',
    rootCard: 'border-violet-500 bg-violet-500 text-white shadow-[0_20px_44px_rgba(139,92,246,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-violet-300 bg-linear-to-br from-violet-100 via-white to-violet-50 shadow-[0_14px_32px_rgba(139,92,246,0.10)]',
    secondaryCard: 'border-violet-200 bg-white/92 shadow-[0_10px_24px_rgba(139,92,246,0.08)]',
    line: 'bg-violet-200/90',
    arrow: 'border-violet-300',
  },
  rose: {
    label: '玫瑰',
    chip: 'border-rose-200 bg-rose-100 text-rose-700',
    button: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    selected: 'ring-2 ring-rose-200',
    rootCard: 'border-rose-500 bg-rose-500 text-white shadow-[0_20px_44px_rgba(244,63,94,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-rose-300 bg-linear-to-br from-rose-100 via-white to-rose-50 shadow-[0_14px_32px_rgba(244,63,94,0.10)]',
    secondaryCard: 'border-rose-200 bg-white/92 shadow-[0_10px_24px_rgba(244,63,94,0.08)]',
    line: 'bg-rose-200/90',
    arrow: 'border-rose-300',
  },
  gray: {
    label: '灰',
    chip: 'border-slate-200 bg-slate-100 text-slate-700',
    button: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
    selected: 'ring-2 ring-slate-200',
    rootCard: 'border-slate-500 bg-slate-500 text-white shadow-[0_20px_44px_rgba(71,85,105,0.24)]',
    rootBadge: 'border-white/20 bg-white/14 text-white/90',
    primaryCard: 'border-slate-300 bg-linear-to-br from-slate-100 via-white to-slate-50 shadow-[0_14px_32px_rgba(71,85,105,0.10)]',
    secondaryCard: 'border-slate-200 bg-white/92 shadow-[0_10px_24px_rgba(71,85,105,0.08)]',
    line: 'bg-slate-200/90',
    arrow: 'border-slate-300',
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
      ? 'border-white/18 bg-white/8 text-white/86 hover:border-white/26 hover:bg-white/14 hover:text-white'
      : 'border-white/22 bg-white/14 text-white hover:border-white hover:bg-white hover:text-ink-900'
  }

  if (emphasis === 'danger') {
    return 'border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
  }

  if (emphasis === 'muted') {
    return 'border border-transparent bg-transparent text-ink-500 hover:border-line hover:bg-white/90 hover:text-ink-800'
  }

  return 'border border-line/90 bg-white/90 text-ink-700 hover:border-ink-300 hover:bg-white hover:text-ink-900'
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
      <div className={cn('flex flex-col gap-6 lg:gap-10', node.children.length > 0 && 'lg:flex-row lg:items-center')}>
        <div
          className={cn(
            'relative z-10 min-w-0',
            isRoot ? 'lg:w-[360px] xl:w-[392px]' : isPrimary ? 'lg:w-[290px]' : 'lg:w-[248px]'
          )}
        >
          <div
            className={cn(
              'relative overflow-hidden border transition-all duration-200',
              isRoot
                ? 'min-h-[236px] rounded-[36px] px-8 py-8 sm:px-10 sm:py-9'
                : isPrimary
                  ? 'min-h-[176px] rounded-[30px] px-6 py-6 sm:px-7 sm:py-[26px]'
                  : 'min-h-[150px] rounded-[26px] px-5 py-5 sm:px-6 sm:py-[22px]',
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
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.16),transparent_34%)]" />
                <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/24" />
              </>
            ) : isPrimary ? (
              <>
                <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-[30px]', tone.line)} />
                <div className={cn('pointer-events-none absolute inset-y-6 left-0 w-1.5 rounded-r-full opacity-80', tone.line)} />
              </>
            ) : (
              <div className={cn('pointer-events-none absolute inset-y-5 left-0 w-1 rounded-r-full opacity-80', tone.line)} />
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

              <div className={cn('min-w-0', isRoot ? 'mt-7' : 'mt-6')}>
                <h3 className={cn(
                  'break-words font-serif',
                  isRoot
                    ? 'text-[2.2rem] leading-[1.15] text-white'
                    : isPrimary
                      ? 'text-[1.3rem] leading-snug text-ink-900'
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

              <div className={cn('mt-6 flex flex-wrap gap-3', isRoot && 'justify-center')}>
                <Button
                  size="sm"
                  variant="secondary"
                  className={nodeActionClassName(level)}
                  onClick={() => onSelect(node.id)}
                >
                  选择节点
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={nodeActionClassName(level, 'muted')}
                  onClick={() => onSelect(node.id)}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant={isRoot ? 'secondary' : 'ghost'}
                  className={nodeActionClassName(level)}
                  onClick={() => onAddChild(node.id)}
                >
                  添加子节点
                </Button>
                {!isRoot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={nodeActionClassName(level, 'danger')}
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
            <div className={cn('pointer-events-none absolute left-0 top-1/2 hidden h-px w-16 -translate-y-1/2 opacity-70 lg:block', tone.line)} />
            <div className={cn('pointer-events-none absolute bottom-12 left-16 top-12 hidden w-px opacity-60 lg:block', tone.line)} />

            <div className="relative mt-6 pl-7 lg:mt-0 lg:pl-16">
              <div className={cn('pointer-events-none absolute bottom-6 left-[10px] top-4 w-px opacity-65 lg:hidden', tone.line)} />

              <div className="space-y-6">
                {node.children.map(child => (
                  <div key={child.id} className="relative">
                    <div className={cn('pointer-events-none absolute left-[-16px] top-[38px] h-px w-5 opacity-65 lg:hidden', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-16 top-[38px] hidden h-px w-16 opacity-70 lg:block', tone.line)} />
                    <div className={cn('pointer-events-none absolute -left-[8px] top-[33px] hidden h-3 w-3 rotate-45 border-r border-t opacity-70 lg:block', tone.arrow)} />

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
          <div className="rounded-[30px] border border-dashed border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,241,233,0.86))] px-7 py-8 text-sm leading-7 text-ink-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:px-9 sm:py-10 lg:flex-1">
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

  const statusClassName = screenState === 'error' || !!saveError || !!exportError
    ? 'text-red-600'
    : screenState === 'missing'
      ? 'text-ink-500'
      : screenState === 'auth'
        ? 'text-ink-600'
        : isDirty
          ? 'text-amber-600'
          : 'text-emerald-600'

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
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
        <div className="min-h-[calc(100vh-40px)] rounded-2xl border border-line bg-white">
          <MainContent size="wide">
            <Card padding="lg" className="mb-6 rounded-[30px] border border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,237,0.92))] shadow-[0_20px_45px_rgba(148,163,184,0.10)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4 xl:min-w-0 xl:flex-1">
                  <Button
                    variant="secondary"
                    className="min-h-11 rounded-2xl border-line/90 px-5"
                    onClick={() => router.push('/mindmaps')}
                  >
                    返回列表
                  </Button>

                  <div className="min-w-0 flex-1">
                    <p className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-400">Mindmap Editor</p>
                    <input
                      value={title}
                      onChange={event => handleTitleChange(event.target.value)}
                      placeholder="请输入导图标题"
                      disabled={screenState !== 'ready'}
                      className="w-full rounded-[26px] border border-line/80 bg-white/90 px-6 py-4 font-serif text-[1.6rem] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand focus:bg-white sm:px-7"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 xl:max-w-[420px] xl:flex-shrink-0 xl:items-end">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={cn(
                      'inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium',
                      screenState === 'error' || !!saveError || !!exportError
                        ? 'border-red-200 bg-red-50 text-red-600'
                        : isDirty
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    )}>
                      {statusText}
                    </span>
                    <p className="text-xs text-ink-500">最近保存：{formatDateTime(lastSavedAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-10 rounded-xl border border-line/80 bg-white/70 px-4 text-ink-600 hover:border-ink-300 hover:bg-white"
                      onClick={handleExportMarkdown}
                      disabled={screenState !== 'ready'}
                    >
                      导出 Markdown
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-10 rounded-xl border border-line/80 bg-white/70 px-4 text-ink-600 hover:border-ink-300 hover:bg-white"
                      onClick={handleExportJson}
                      disabled={screenState !== 'ready'}
                    >
                      导出 JSON
                    </Button>
                    <Button
                      variant="primary"
                      className="min-h-10 rounded-xl px-6"
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
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <Card padding="lg" className="rounded-[32px] border border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,237,0.90))] shadow-[0_24px_54px_rgba(148,163,184,0.12)]">
                  <div className="mb-7 flex flex-col gap-4 border-b border-line/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">Mindmap View</p>
                      <h2 className="mt-2 font-serif text-[2rem] text-ink-900">知识结构画布</h2>
                      <p className="mt-2 text-sm leading-7 text-ink-500">
                        桌面端从中心主题向右延展，移动端维持纵向阅读顺序。当前版本专注结构整理与节点编辑，保持轻量和清晰。
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-line/80 bg-white/80 px-3 py-1.5 text-xs text-ink-600">
                        {totalNodes} 个节点
                      </span>
                    </div>
                  </div>

                  <div
                    className="rounded-[34px] border border-line/70 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] sm:px-8 sm:py-8"
                    style={{
                      backgroundImage: 'linear-gradient(rgba(123,115,103,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(123,115,103,0.05) 1px, transparent 1px), radial-gradient(circle at top left, rgba(217,119,87,0.10), transparent 28%), radial-gradient(circle at bottom right, rgba(59,130,246,0.08), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,244,236,0.95))',
                      backgroundSize: '24px 24px, 24px 24px, auto, auto, auto',
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

                <Card padding="lg" className="rounded-[32px] border border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,243,235,0.92))] shadow-[0_24px_54px_rgba(148,163,184,0.12)]" as="section">
                  <div className="mb-7 border-b border-line/70 pb-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-ink-400">Node Details</p>
                    <h2 id="mindmap-node-editor" className="mt-2 font-serif text-[2rem] text-ink-900">
                      当前节点
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      这里集中编辑节点文本、颜色、层级信息与结构操作。所有保存、导出能力保持不变。
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[28px] border border-line/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,241,233,0.92))] px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-7">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">{formatNodeLevel(selectedNodeDepth)}</p>
                          <h3 className="mt-2 break-words font-serif text-xl text-ink-900">
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

                      <div className="mt-5 rounded-[22px] border border-line/70 bg-white/85 px-5 py-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-ink-400">Node ID</p>
                        <p className="mt-2 break-all text-sm leading-6 text-ink-700">{selectedNode.id}</p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-line/75 bg-white/88 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-7">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-400">节点文本</p>
                      <label htmlFor="mindmap-node-label" className="mt-3 block text-sm text-ink-700">
                        节点名称
                      </label>
                      <input
                        id="mindmap-node-label"
                        value={selectedNode.label}
                        onChange={event => handleNodeLabelChange(event.target.value)}
                        className="mt-2 w-full rounded-[20px] border border-line/80 bg-canvas-2/55 px-5 py-3.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand focus:bg-white"
                        placeholder="请输入节点文本"
                      />
                    </div>

                    <div className="rounded-[24px] border border-line/75 bg-white/88 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-7">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-ink-400">节点颜色</p>
                          <p className="mt-2 text-sm text-ink-600">选择一组低饱和配色，用于区分结构层次。</p>
                        </div>
                        <span className={cn('rounded-full border px-3.5 py-1.5 text-xs leading-none', colorMeta[selectedNode.color].chip)}>
                          当前色: {colorMeta[selectedNode.color].label}
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                        {colorOrder.map(color => {
                          const tone = colorMeta[color]
                          const active = selectedNode.color === color
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleNodeColorChange(color)}
                              className={cn(
                                'min-h-12 rounded-[18px] border px-4 py-3 text-sm transition-colors',
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

                    <div className="rounded-[24px] border border-line/75 bg-white/88 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-7">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-400">层级信息</p>
                      <div className="mt-4 space-y-3 rounded-[20px] border border-line/70 bg-canvas-2/55 px-5 py-4 text-sm text-ink-600">
                        <div className="flex items-center justify-between gap-3">
                          <span>层级</span>
                          <span className="font-medium text-ink-900">{formatNodeLevel(selectedNodeDepth)}</span>
                        </div>
                        <div className="h-px bg-line/70" />
                        <div className="flex items-center justify-between gap-3">
                          <span>子节点数量</span>
                          <span className="font-medium text-ink-900">{selectedNode.children.length}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-line/75 bg-white/88 px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-7">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink-400">操作区</p>
                      <div className="mt-5 flex flex-wrap gap-3.5">
                        <Button
                          variant="primary"
                          className="min-h-11 rounded-2xl px-6"
                          onClick={() => handleAddChild(selectedNode.id)}
                        >
                          添加子节点
                        </Button>
                        <Button
                          variant="secondary"
                          className="min-h-11 rounded-2xl border-line/90 px-6"
                          onClick={() => handleSelectNode('root')}
                        >
                          选中中心主题
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11 rounded-2xl border border-red-200 bg-red-50 px-6 text-red-700 hover:border-red-300 hover:bg-red-100"
                          onClick={() => handleDeleteNode(selectedNode.id)}
                          disabled={selectedNode.id === 'root'}
                        >
                          删除当前节点
                        </Button>
                      </div>

                      {selectedNode.id === 'root' && (
                        <p className="mt-4 rounded-[18px] border border-line/70 bg-canvas-2/55 px-5 py-3 text-xs leading-6 text-ink-500">
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
