'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import ExportPlugin from 'simple-mind-map/src/plugins/Export.js'
import ExportPDF from 'simple-mind-map/src/plugins/ExportPDF.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import Search from 'simple-mind-map/src/plugins/Search.js'
// RichText disabled to avoid <p> tag pollution on node text
import Scrollbar from 'simple-mind-map/src/plugins/Scrollbar.js'
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js'
import OuterFrame from 'simple-mind-map/src/plugins/OuterFrame.js'
import Formula from 'simple-mind-map/src/plugins/Formula.js'
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Sidebar from '@/components/Sidebar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/components/ui/cn'
import { supabase } from '@/lib/supabase'
import {
  legacyNodeToSmm,
  smmNodeToLegacy,
  countNodes,
  type MindmapBackground,
  type MindmapMeta,
  type MindmapNode,
  type SmmNode,
} from './mindmap-types'

/* ---------- Register plugins (must be before instantiation) ---------- */
MindMap.usePlugin(Drag)
MindMap.usePlugin(Select)
MindMap.usePlugin(AssociativeLine)
MindMap.usePlugin(ExportPlugin)
MindMap.usePlugin(ExportPDF)
MindMap.usePlugin(ExportXMind)
MindMap.usePlugin(Search)
// MindMap.usePlugin(RichText) // disabled: causes <p> tag pollution
MindMap.usePlugin(Scrollbar)
MindMap.usePlugin(RainbowLines)
MindMap.usePlugin(OuterFrame)
MindMap.usePlugin(Formula)
MindMap.usePlugin(NodeImgAdjust)
MindMap.usePlugin(MiniMap)

/* ---------- Constants ---------- */
const defaultMeta: MindmapMeta = {
  layout: 'logicalStructure',
  theme: 'classic',
  background: 'paper',
  fontFamily: 'sans',
  branchLine: 'thin',
  rainbowBranches: false,
  compact: false,
}

const defaultNode: MindmapNode = {
  id: 'root',
  label: '中心主题',
  color: 'blue',
  collapsed: false,
  meta: defaultMeta,
  note: '',
  tags: [],
  children: [],
}

const layoutOptions = [
  { id: 'logicalStructure', label: '逻辑结构图', icon: 'LR' },
  { id: 'mindMap', label: '思维导图', icon: 'MM' },
  { id: 'organizationStructure', label: '组织结构图', icon: 'OG' },
  { id: 'catalogOrganization', label: '目录组织图', icon: 'CT' },
  { id: 'timeline', label: '时间轴(横)', icon: 'TH' },
  { id: 'timeline2', label: '时间轴(交替)', icon: 'TA' },
  { id: 'fishbone', label: '鱼骨图', icon: 'FB' },
]

// Theme configs for simple-mind-map (uses setThemeConfig, not setTheme)
// Each theme defines: lineColor, root fillColor, second fillColor/borderColor, node color, backgroundColor
const themeConfigs: Record<string, { lineColor: string; rootFill: string; rootColor: string; secondFill: string; secondBorder: string; secondColor: string; nodeColor: string; bgColor: string }> = {
  classic:     { lineColor: '#549688', rootFill: '#549688', rootColor: '#fff', secondFill: '#fff', secondBorder: '#549688', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#fafafa' },
  classic2:    { lineColor: '#4372a0', rootFill: '#4372a0', rootColor: '#fff', secondFill: '#fff', secondBorder: '#4372a0', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#f5f7fa' },
  classic3:    { lineColor: '#d9534f', rootFill: '#d9534f', rootColor: '#fff', secondFill: '#fff', secondBorder: '#d9534f', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#faf5f5' },
  classic4:    { lineColor: '#5cb85c', rootFill: '#5cb85c', rootColor: '#fff', secondFill: '#fff', secondBorder: '#5cb85c', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#f5faf5' },
  dark:        { lineColor: '#5a9fd4', rootFill: '#2d333b', rootColor: '#c9d1d9', secondFill: '#22272e', secondBorder: '#5a9fd4', secondColor: '#c9d1d9', nodeColor: '#8b949e', bgColor: '#1a1d22' },
  dark2:       { lineColor: '#7c4dff', rootFill: '#2d2d3a', rootColor: '#e0e0e0', secondFill: '#252530', secondBorder: '#7c4dff', secondColor: '#e0e0e0', nodeColor: '#a0a0b0', bgColor: '#1a1a24' },
  minions:     { lineColor: '#f5c71a', rootFill: '#fce029', rootColor: '#333', secondFill: '#fff9c4', secondBorder: '#fbc02d', secondColor: '#333', nodeColor: '#666', bgColor: '#fffde7' },
  pinkGrape:   { lineColor: '#e91e63', rootFill: '#f06292', rootColor: '#fff', secondFill: '#fce4ec', secondBorder: '#e91e63', secondColor: '#880e4f', nodeColor: '#ad1457', bgColor: '#fdf2f8' },
  mint:        { lineColor: '#26a69a', rootFill: '#4db6ac', rootColor: '#fff', secondFill: '#e0f2f1', secondBorder: '#26a69a', secondColor: '#004d40', nodeColor: '#00695c', bgColor: '#f0fdfa' },
  gold:        { lineColor: '#c9a227', rootFill: '#d4af37', rootColor: '#fff', secondFill: '#fff8e1', secondBorder: '#c9a227', secondColor: '#5d4037', nodeColor: '#795548', bgColor: '#fffbf0' },
  vitalityOrange: { lineColor: '#ff7043', rootFill: '#ff8a65', rootColor: '#fff', secondFill: '#fbe9e7', secondBorder: '#ff7043', secondColor: '#bf360c', nodeColor: '#d84315', bgColor: '#fdf3f0' },
  greenLeaf:   { lineColor: '#66bb6a', rootFill: '#81c784', rootColor: '#fff', secondFill: '#e8f5e9', secondBorder: '#66bb6a', secondColor: '#1b5e20', nodeColor: '#2e7d32', bgColor: '#f1f8e9' },
  skyGreen:    { lineColor: '#26c6da', rootFill: '#4dd0e1', rootColor: '#fff', secondFill: '#e0f7fa', secondBorder: '#26c6da', secondColor: '#006064', nodeColor: '#00838f', bgColor: '#f0fcfd' },
  classicGreen:{ lineColor: '#43a047', rootFill: '#43a047', rootColor: '#fff', secondFill: '#fff', secondBorder: '#43a047', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#f5faf5' },
  classicBlue: { lineColor: '#1e88e5', rootFill: '#1e88e5', rootColor: '#fff', secondFill: '#fff', secondBorder: '#1e88e5', secondColor: '#565656', nodeColor: '#6a6d6c', bgColor: '#f0f7ff' },
  blueSky:     { lineColor: '#42a5f5', rootFill: '#64b5f6', rootColor: '#fff', secondFill: '#e3f2fd', secondBorder: '#42a5f5', secondColor: '#0d47a1', nodeColor: '#1565c0', bgColor: '#f0f7ff' },
  brainImpairedPink: { lineColor: '#ec407a', rootFill: '#f48fb1', rootColor: '#fff', secondFill: '#fce4ec', secondBorder: '#ec407a', secondColor: '#880e4f', nodeColor: '#c2185b', bgColor: '#fdf2f8' },
  earthYellow: { lineColor: '#8d6e63', rootFill: '#a1887f', rootColor: '#fff', secondFill: '#efebe9', secondBorder: '#8d6e63', secondColor: '#3e2723', nodeColor: '#5d4037', bgColor: '#faf7f5' },
}

const themeLabelMap: Record<string, string> = {
  classic: '经典', classic2: '经典2', classic3: '经典3', classic4: '经典4',
  dark: '暗色', dark2: '暗色2', minions: '小黄人', pinkGrape: '粉葡',
  mint: '薄荷', gold: '金色', vitalityOrange: '活力橙', greenLeaf: '绿叶',
  skyGreen: '天绿', classicGreen: '经典绿', classicBlue: '经典蓝',
  blueSky: '蓝天', brainImpairedPink: '脑残粉', earthYellow: '土黄',
}
const themeOptions = Object.keys(themeConfigs).map(id => ({ id, label: themeLabelMap[id] || id }))

function buildThemeConfig(themeId: string) {
  const c = themeConfigs[themeId] || themeConfigs.classic
  return {
    lineColor: c.lineColor,
    generalizationLineColor: c.lineColor,
    backgroundColor: c.bgColor,
    root: { fillColor: c.rootFill, color: c.rootColor, borderColor: 'transparent' },
    second: { fillColor: c.secondFill, color: c.secondColor, borderColor: c.secondBorder },
    node: { color: c.nodeColor, borderColor: 'transparent' },
    generalization: { fillColor: c.secondFill, color: c.secondColor, borderColor: c.secondBorder },
  }
}

/* ---------- Helpers ---------- */

type ScreenState = 'loading' | 'ready' | 'auth' | 'missing' | 'error'

function createInitialTree(): MindmapNode {
  return {
    ...defaultNode,
    meta: { ...defaultMeta },
    children: [],
  }
}

function normalizeNode(value: unknown, fallbackId: string): MindmapNode {
  if (!value || typeof value !== 'object') {
    return {
      id: fallbackId,
      label: fallbackId === 'root' ? '中心主题' : '新节点',
      color: 'gray',
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
    : id === 'root' ? '中心主题' : '新节点'
  const note = typeof record.note === 'string' ? record.note : ''
  const tags = Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === 'string') : []
  const childrenSource = Array.isArray(record.children) ? record.children : []
  const colors = ['blue', 'green', 'orange', 'purple', 'rose', 'gray'] as const
  const color = typeof record.color === 'string' && colors.includes(record.color as typeof colors[number])
    ? record.color as typeof colors[number]
    : id === 'root' ? 'blue' : 'gray'

  return {
    id,
    label,
    color,
    collapsed: typeof record.collapsed === 'boolean' ? record.collapsed : false,
    meta: id === 'root' ? (record.meta as Partial<MindmapMeta> | undefined) : undefined,
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
    color: 'blue',
    collapsed: false,
    meta: (node.meta || defaultMeta) as MindmapMeta,
  }
}

function getNodeMeta(tree: MindmapNode): MindmapMeta {
  if (tree.id === 'root' && tree.meta) {
    return { ...defaultMeta, ...tree.meta }
  }
  return { ...defaultMeta }
}

function mergeMeta(tree: MindmapNode, patch: Partial<MindmapMeta>): MindmapNode {
  if (tree.id !== 'root') return tree
  return {
    ...tree,
    meta: { ...getNodeMeta(tree), ...patch },
  }
}

const canvasBgStyles: Record<MindmapBackground, React.CSSProperties> = {
  'paper': {
    background: 'linear-gradient(180deg, rgba(252,250,245,0.98), rgba(246,242,234,0.96))',
  },
  'white': {
    background: '#FFFFFF',
  },
  'warm-gray': {
    background: 'linear-gradient(180deg, rgba(243,239,232,0.98), rgba(236,231,223,0.96))',
  },
  'dark': {
    background: '#1a1d22',
  },
}

/* ---------- Component ---------- */

export default function MindmapDetailPage() {
  const router = useRouter()
  const params = useParams<{ mindmapId: string }>()
  const mindmapId = typeof params?.mindmapId === 'string' ? params.mindmapId : ''

  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('未命名导图')
  const [tree, setTree] = useState<MindmapNode>(createInitialTree())
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [canvasBg, setCanvasBg] = useState<MindmapBackground>(defaultMeta.background)
  const [currentThemeId, setCurrentThemeId] = useState(defaultMeta.theme)

  const containerRef = useRef<HTMLDivElement>(null)
  const mindMapRef = useRef<MindMap | null>(null)
  const treeRef = useRef(tree)
  const titleRef = useRef(title)
  const savedSnapshotRef = useRef(savedSnapshot)
  const savingRef = useRef(saving)
  const userIdRef = useRef(userId)
  treeRef.current = tree
  titleRef.current = title
  savedSnapshotRef.current = savedSnapshot
  savingRef.current = saving
  userIdRef.current = userId

  // dirty check
  const currentSnapshot = useMemo(() => JSON.stringify({ title, tree }), [title, tree])
  const isDirty = screenState === 'ready' && currentSnapshot !== savedSnapshot

  // status text
  const statusText = screenState === 'loading'
    ? '加载中...'
    : screenState === 'auth'
      ? '请先登录'
      : screenState === 'missing'
        ? '导图不存在'
        : screenState === 'error'
          ? '加载失败'
          : saveError
            ? saveError
            : saving
              ? '保存中...'
              : isDirty
                ? '未保存'
                : '已保存'

  const totalNodes = useMemo(() => countNodes(tree), [tree])

  /* ---------- Init / destroy mindmap ---------- */

  const initMindMap = useCallback((container: HTMLElement, data: SmmNode, meta: MindmapMeta) => {
    if (mindMapRef.current) {
      mindMapRef.current.destroy()
      mindMapRef.current = null
    }

    const mm = new MindMap({
      el: container,
      data,
      layout: meta.layout,
      theme: 'default',
      themeConfig: buildThemeConfig(meta.theme),
      rainbowLinesConfig: { open: meta.rainbowBranches, colorsList: [] },
      readonly: false,
      enableFreeDrag: false,
      mousewheelAction: 'zoom',
      mousewheelZoomActionReverse: true,
      maxHistoryCount: 1000,
      defaultInsertSecondLevelNodeText: '分支主题',
      defaultInsertBelowSecondLevelNodeText: '子主题',
      alwaysShowExpandBtn: true,
      fit: true,
      isShowCreateChildBtnIcon: true,
    })

    mindMapRef.current = mm
    return mm
  }, [])

  const updateStyleFromMeta = useCallback((mm: MindMap | null, meta: MindmapMeta) => {
    if (!mm) return

    // Layout
    try {
      mm.setLayout(meta.layout)
    } catch { /* ignore */ }

    // Theme (via setThemeConfig)
    try {
      mm.setThemeConfig(buildThemeConfig(meta.theme))
    } catch { /* ignore */ }

    // Rainbow lines
    if (mm.rainbowLines) {
      mm.rainbowLines.updateRainLinesConfig({ open: meta.rainbowBranches })
    }
  }, [])

  /* ---------- Load data ---------- */

  useEffect(() => {
    let alive = true

    async function load() {
      setScreenState('loading')
      setLoadingError('')

      // Auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { setScreenState('auth'); return }
      setUserId(user.id)
      userIdRef.current = user.id

      // Load mindmap
      const { data, error: qe } = await supabase
        .from('mindmaps')
        .select('id, user_id, title, description, source_module, content_json, updated_at')
        .eq('id', mindmapId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alive) return
      if (qe) { setLoadingError(qe.message || '加载失败'); setScreenState('error'); return }
      if (!data) { setScreenState('missing'); return }

      const nextTitle = data.title || '未命名导图'
      const nextTree = normalizeTree(data.content_json)
      const nextSnapshot = JSON.stringify({ title: nextTitle, tree: nextTree })
      const meta = getNodeMeta(nextTree)

      setTitle(nextTitle)
      setTree(nextTree)
      setCanvasBg(meta.background)
      setCurrentThemeId(meta.theme)
      setLastSavedAt(data.updated_at)
      setSavedSnapshot(nextSnapshot)
      savedSnapshotRef.current = nextSnapshot

      // Init mindmap
      if (containerRef.current) {
        const smmData = legacyNodeToSmm(nextTree)
        initMindMap(containerRef.current, smmData, meta)
      }

      if (alive) setScreenState('ready')
    }

    void load()

    return () => {
      alive = false
      if (mindMapRef.current) {
        mindMapRef.current.destroy()
        mindMapRef.current = null
      }
    }
  }, [mindmapId, initMindMap])

  /* ---------- Save ---------- */

  const getCurrentData = useCallback((): MindmapNode | null => {
    const mm = mindMapRef.current
    if (!mm) return null
    try {
      const smmData = mm.getData() as SmmNode
      const legacy = smmNodeToLegacy(smmData)
      // Preserve meta from current tree
      const currentMeta = treeRef.current.meta
      if (currentMeta) {
        legacy.meta = currentMeta
      }
      // Ensure root id stays 'root'
      legacy.id = 'root'
      return legacy
    } catch {
      return null
    }
  }, [])

  const handleSave = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid || screenState !== 'ready' || savingRef.current) return

    const nextTitle = titleRef.current.trim() || '未命名导图'
    const nextTree = getCurrentData()
    if (!nextTree) return

    const newSnapshot = JSON.stringify({ title: nextTitle, tree: nextTree })
    if (newSnapshot === savedSnapshotRef.current) return

    savingRef.current = true
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
      .eq('user_id', uid)
      .select('updated_at')
      .single()

    setSaving(false)
    savingRef.current = false

    if (updateError) {
      setSaveError('保存失败，请稍后重试。')
      return
    }

    setTitle(nextTitle)
    setTree(nextTree)
    setLastSavedAt(data?.updated_at ?? new Date().toISOString())
    setSavedSnapshot(newSnapshot)
    savedSnapshotRef.current = newSnapshot
  }, [screenState, getCurrentData, mindmapId])

  // Auto-save
  useEffect(() => {
    if (!userId || screenState !== 'ready' || !isDirty || saving) return
    const t = setTimeout(() => { void handleSave() }, 1600)
    return () => clearTimeout(t)
  }, [currentSnapshot, isDirty, saving, screenState, userId, handleSave])

  // Keyboard: Ctrl+S save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  /* ---------- Actions ---------- */

  const handleThemeChange = useCallback((themeId: string) => {
    const mm = mindMapRef.current
    if (!mm) return
    try {
      mm.setThemeConfig(buildThemeConfig(themeId))
      setCurrentThemeId(themeId as MindmapMeta['theme'])
      setTree(prev => mergeMeta(prev, { theme: themeId as MindmapMeta['theme'] }))
    } catch { /* ignore */ }
  }, [])

  const handleLayoutChange = useCallback((layoutId: string) => {
    const mm = mindMapRef.current
    if (!mm) return
    try {
      mm.setLayout(layoutId)
      setTree(prev => mergeMeta(prev, { layout: layoutId }))
    } catch { /* ignore */ }
  }, [])

  const handleBgChange = useCallback((bg: MindmapBackground) => {
    setCanvasBg(bg)
    setTree(prev => mergeMeta(prev, { background: bg }))
  }, [])

  const handleRainbowToggle = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm) return
    setTree(prev => {
      const newVal = !getNodeMeta(prev).rainbowBranches
      if (mm.rainbowLines) {
        mm.rainbowLines.updateRainLinesConfig({ open: newVal })
      }
      return mergeMeta(prev, { rainbowBranches: newVal })
    })
  }, [])

  const handleExportPng = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.png(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  const handleExportSvg = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.svg(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  const handleExportPdf = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.pdf(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  const handleExportJson = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.json(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  const handleExportMd = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.md(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  const handleExportXMind = useCallback(async () => {
    const mm = mindMapRef.current
    if (!mm || !mm.doExport) return
    try {
      await mm.doExport.xmind(titleRef.current || '思维导图')
    } catch { /* ignore */ }
  }, [])

  // Search
  const [searchText, setSearchText] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const handleSearch = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm || !mm.search) return
    const text = searchText.trim()
    if (!text) {
      mm.search.endSearch()
      return
    }
    mm.search.search(text)
  }, [searchText])

  const handleSearchNext = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm || !mm.search) return
    mm.search.searchNext()
  }, [])

  const handleSearchPrev = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm || !mm.search) return
    mm.search.searchPrev?.()
    // fallback: cycle backward
    if (mm.search.searchNext) {
      mm.search.searchNext()
    }
  }, [])

  const handleSearchClose = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm || !mm.search) return
    setSearchText('')
    mm.search.endSearch()
  }, [])

  // Zoom
  const handleZoomIn = useCallback(() => {
    mindMapRef.current?.view.enlarge()
  }, [])
  const handleZoomOut = useCallback(() => {
    mindMapRef.current?.view.narrow()
  }, [])
  const handleZoomReset = useCallback(() => {
    mindMapRef.current?.view.reset()
  }, [])
  const handleFit = useCallback(() => {
    mindMapRef.current?.view.fit()
  }, [])

  // Add child node to the currently active node (or root if none selected)
  const handleAddTopic = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm) return
    const activeNodes = mm.renderer.activeNodeList
    if (activeNodes && activeNodes.length > 0) {
      // Add child to the first active node
      mm.renderer.insertChildNode(true, activeNodes[0])
    } else {
      // Fallback: add to root
      const root = mm.renderer.findNodeByUid('root')
      if (root) {
        mm.renderer.insertChildNode(true, root)
      }
    }
  }, [])

  // Expand/collapse all
  const handleExpandAll = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm) return
    try {
      mm.execCommand('EXPAND_ALL')
    } catch { /* ignore */ }
  }, [])

  const handleCollapseAll = useCallback(() => {
    const mm = mindMapRef.current
    if (!mm) return
    try {
      mm.execCommand('UNEXPAND_ALL')
    } catch { /* ignore */ }
  }, [])

  /* ---------- Update state from mindmap changes ---------- */

  // Listen to data changes to update our tree state for auto-save
  useEffect(() => {
    const mm = mindMapRef.current
    if (!mm) return

    const updateFromMm = () => {
      const nextTree = getCurrentData()
      if (nextTree) {
        // Preserve meta
        const currentMeta = treeRef.current.meta
        if (currentMeta) {
          nextTree.meta = currentMeta
        }
        nextTree.id = 'root'
        setTree(nextTree)
      }
    }

    mm.on('data_change', updateFromMm)
    mm.on('node_tree_render_end', updateFromMm)

    return () => {
      // cleanup handled by destroy in load effect
    }
  }, [getCurrentData])

  /* ---------- Render ---------- */

  const meta = getNodeMeta(tree)
  const isDarkBg = canvasBg === 'dark'

  // Shared styles matching site design system
  const panelBg = isDarkBg ? 'bg-[#16181d]' : 'bg-white'
  const panelBorder = isDarkBg ? 'border-white/[0.06]' : 'border-line'
  const textPrimary = isDarkBg ? 'text-slate-100' : 'text-ink-900'
  const textSecondary = isDarkBg ? 'text-slate-400' : 'text-ink-500'
  const textMuted = isDarkBg ? 'text-slate-500' : 'text-ink-400'
  const sectionTitle = isDarkBg ? 'text-slate-500' : 'text-ink-400'

  const chipBase = isDarkBg
    ? 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:border-white/15 hover:bg-white/[0.08]'
    : 'border-line bg-surface text-ink-600 hover:border-ink-200 hover:bg-white'
  const chipActive = 'border-brand bg-brand-50 text-brand-700'

  const iconBtnBase = isDarkBg
    ? 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
    : 'text-ink-500 hover:text-ink-900 hover:bg-canvas-2'

  if (screenState === 'auth') {
    return (
      <div className="flex h-screen bg-canvas">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Card padding="lg" className="text-center">
            <p className="text-ink-500">请先登录。</p>
            <Button variant="brand" className="mt-4" onClick={() => router.push('/')}>返回登录</Button>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-5 gap-4">
        {/* ====== Title Card ====== */}
        <div className={cn(
          'flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-[var(--shadow-card)]',
          panelBg, panelBorder
        )}>
          {/* Back */}
          <button
            className={cn('flex h-8 w-8 items-center justify-center rounded-xl transition-colors', iconBtnBase)}
            onClick={() => router.push('/mindmaps')}
            title="返回列表"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>

          {/* Title */}
          <input
            className={cn(
              'min-w-0 flex-1 bg-transparent font-serif text-xl font-semibold outline-none',
              textPrimary, isDarkBg ? 'placeholder:text-slate-600' : 'placeholder:text-ink-300'
            )}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="未命名导图"
          />

          {/* Status */}
          <span className={cn(
            'inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-medium',
            saveError
              ? 'border-red-200 bg-red-50 text-red-600'
              : isDarkBg
                ? 'border-white/[0.08] bg-white/[0.04] text-slate-400'
                : 'border-line bg-surface text-ink-500'
          )}>
            {statusText}
          </span>

          {/* Save */}
          <Button
            variant={isDirty ? 'primary' : 'ghost'}
            size="sm"
            className={cn('rounded-xl', !isDirty && (isDarkBg ? 'text-slate-500' : 'text-ink-400'))}
            onClick={() => { void handleSave() }}
            loading={saving}
            disabled={screenState !== 'ready' || !isDirty}
          >
            保存
          </Button>
        </div>

        {/* ====== Toolbar + Canvas + Sidebar ====== */}
        <div className="flex min-h-0 flex-1 gap-4">
          {/* ===== Left: Canvas Area ===== */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Toolbar */}
            <div className={cn(
              'flex flex-wrap items-center gap-1.5 rounded-2xl border px-4 py-2.5 shadow-[var(--shadow-card)]',
              panelBg, panelBorder
            )}>
              {/* Node ops */}
              <ToolbarBtn onClick={handleAddTopic} icon={<PlusIcon />} label="子主题" isDark={isDarkBg} />
              <ToolbarDivider isDark={isDarkBg} />
              <ToolbarBtn onClick={handleExpandAll} icon={<ExpandIcon />} label="展开" isDark={isDarkBg} />
              <ToolbarBtn onClick={handleCollapseAll} icon={<CollapseIcon />} label="收起" isDark={isDarkBg} />

              <ToolbarDivider isDark={isDarkBg} />

              {/* Zoom */}
              <ToolbarBtn onClick={handleZoomOut} icon={<ZoomOutIcon />} isDark={isDarkBg} title="缩小" />
              <ToolbarBtn onClick={handleZoomReset} label="100%" isDark={isDarkBg} />
              <ToolbarBtn onClick={handleZoomIn} icon={<ZoomInIcon />} isDark={isDarkBg} title="放大" />
              <ToolbarBtn onClick={handleFit} icon={<FitIcon />} label="适应" isDark={isDarkBg} />

              <div className="flex-1" />

              {/* Search */}
              <div className={cn(
                'flex items-center gap-1 rounded-xl border px-2.5 h-8',
                isDarkBg ? 'border-white/[0.08] bg-white/[0.03]' : 'border-line bg-surface'
              )}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={textMuted}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input
                  ref={searchInputRef}
                  className={cn('w-28 bg-transparent text-xs outline-none', textSecondary)}
                  placeholder="搜索节点..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                />
                {searchText && (
                  <button onClick={handleSearchClose} className={cn('text-xs', textMuted, 'hover:text-red-500')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
              <ToolbarBtn onClick={handleSearchPrev} icon={<ChevronUpIcon />} isDark={isDarkBg} title="上一个" />
              <ToolbarBtn onClick={handleSearchNext} icon={<ChevronDownIcon />} isDark={isDarkBg} title="下一个" />

              <ToolbarDivider isDark={isDarkBg} />

              {/* Export */}
              <div className="relative group">
                <ToolbarBtn icon={<ExportIcon />} label="导出" isDark={isDarkBg} />
                <div className={cn(
                  'absolute right-0 top-full z-50 mt-2 hidden w-40 rounded-xl border py-1.5 shadow-[var(--shadow-modal)] group-hover:block',
                  isDarkBg ? 'border-white/[0.08] bg-[#1e2028]' : 'border-line bg-white'
                )}>
                  {([
                    ['PNG 图片', handleExportPng],
                    ['SVG 矢量', handleExportSvg],
                    ['PDF 文档', handleExportPdf],
                    ['JSON 数据', handleExportJson],
                    ['Markdown', handleExportMd],
                    ['XMind 文件', handleExportXMind],
                  ] as const).map(([label, fn]) => (
                    <button
                      key={label}
                      className={cn(
                        'block w-full px-4 py-1.5 text-left text-xs transition-colors',
                        isDarkBg ? 'text-slate-300 hover:bg-white/[0.05]' : 'text-ink-600 hover:bg-canvas-2'
                      )}
                      onClick={() => { void fn() }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info */}
              <span className={cn('ml-1 text-[11px]', textMuted)}>
                {totalNodes} 节点
              </span>
            </div>

            {/* Canvas */}
            <div className={cn(
              'flex-1 min-w-0 rounded-2xl border overflow-hidden shadow-[var(--shadow-card)]',
              panelBorder
            )}>
              <div
                className="h-full w-full"
                style={canvasBgStyles[canvasBg]}
              >
                <div
                  ref={containerRef}
                  className="h-full w-full"
                  id="mindmap-container"
                />
              </div>
            </div>
          </div>

          {/* ===== Right: Inspector Panel ===== */}
          <div className={cn(
            'flex w-[280px] flex-col gap-3 overflow-auto rounded-2xl border p-4 shadow-[var(--shadow-card)]',
            panelBg, panelBorder
          )}>
            {/* Theme */}
            <InspectorSection title="主题" isDark={isDarkBg}>
              <div className="flex flex-wrap gap-1.5">
                {themeOptions.map(t => (
                  <button
                    key={t.id}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all',
                      currentThemeId === t.id ? chipActive : chipBase
                    )}
                    onClick={() => handleThemeChange(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </InspectorSection>

            {/* Layout */}
            <InspectorSection title="结构" isDark={isDarkBg}>
              <div className="flex flex-wrap gap-1.5">
                {layoutOptions.map(l => (
                  <button
                    key={l.id}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all',
                      meta.layout === l.id ? chipActive : chipBase
                    )}
                    onClick={() => handleLayoutChange(l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </InspectorSection>

            {/* Background */}
            <InspectorSection title="背景" isDark={isDarkBg}>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'paper' as const, label: '纸张', color: '#f8f4ec' },
                  { id: 'white' as const, label: '纯白', color: '#fff' },
                  { id: 'warm-gray' as const, label: '暖灰', color: '#e8e3d8' },
                  { id: 'dark' as const, label: '深色', color: '#1a1d22' },
                ].map(b => (
                  <button
                    key={b.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
                      canvasBg === b.id ? chipActive : chipBase
                    )}
                    onClick={() => handleBgChange(b.id)}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                      style={{ background: b.color }}
                    />
                    {b.label}
                  </button>
                ))}
              </div>
            </InspectorSection>

            {/* Options */}
            <InspectorSection title="选项" isDark={isDarkBg}>
              <label className={cn('flex items-center gap-2.5 text-sm cursor-pointer select-none', textSecondary)}>
                <span className={cn(
                  'flex h-5 w-9 items-center rounded-full transition-colors',
                  meta.rainbowBranches ? 'bg-brand' : isDarkBg ? 'bg-white/10' : 'bg-ink-200'
                )}>
                  <span className={cn(
                    'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    meta.rainbowBranches ? 'translate-x-4' : 'translate-x-0.5'
                  )} />
                </span>
                <input
                  type="checkbox"
                  checked={meta.rainbowBranches}
                  onChange={handleRainbowToggle}
                  className="sr-only"
                />
                彩虹分支线
              </label>
            </InspectorSection>

            {/* Shortcuts */}
            <InspectorSection title="快捷键" isDark={isDarkBg}>
              <div className={cn('text-[11px] leading-[1.8] space-y-0.5', textMuted)}>
                <ShortcutRow keys="Tab / Enter" desc="新建子节点" />
                <ShortcutRow keys="Shift + Enter" desc="新建同级节点" />
                <ShortcutRow keys="Delete" desc="删除节点" />
                <ShortcutRow keys="双击" desc="编辑文本" />
                <ShortcutRow keys="拖拽" desc="移动节点" />
                <ShortcutRow keys="Ctrl + Z / Y" desc="撤销 / 重做" />
                <ShortcutRow keys="Ctrl + S" desc="保存" />
                <ShortcutRow keys="右键" desc="更多操作" />
              </div>
            </InspectorSection>

            {/* Last saved */}
            <div className={cn('mt-auto pt-2 text-[10px] border-t', isDarkBg ? 'border-white/[0.06] text-slate-600' : 'border-line text-ink-400')}>
              {lastSavedAt ? `上次保存 ${new Date(lastSavedAt).toLocaleString('zh-CN')}` : '尚未保存'}
            </div>
          </div>
        </div>
      </main>

      {/* Loading overlay */}
      {screenState === 'loading' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
          <Card padding="lg" className="text-center">
            <p className="text-ink-500">加载中...</p>
          </Card>
        </div>
      )}

      {/* Error overlay */}
      {screenState === 'error' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
          <Card padding="lg" className="text-center">
            <p className="text-red-600 mb-4">{loadingError}</p>
            <Button variant="secondary" onClick={() => router.push('/mindmaps')}>返回列表</Button>
          </Card>
        </div>
      )}

      {/* Missing overlay */}
      {screenState === 'missing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
          <Card padding="lg" className="text-center">
            <p className="text-ink-500 mb-4">导图不存在或无权访问</p>
            <Button variant="secondary" onClick={() => router.push('/mindmaps')}>返回列表</Button>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ===== Sub-components for the redesigned UI ===== */

function ToolbarBtn({ onClick, icon, label, isDark, title }: {
  onClick?: () => void
  icon?: React.ReactNode
  label?: string
  isDark: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl px-2.5 h-8 text-xs font-medium transition-colors',
        isDark
          ? 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
          : 'text-ink-500 hover:text-ink-900 hover:bg-canvas-2'
      )}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {label}
    </button>
  )
}

function ToolbarDivider({ isDark }: { isDark: boolean }) {
  return <span className={cn('mx-0.5 h-4 w-px', isDark ? 'bg-white/10' : 'bg-ink-100')} />
}

function InspectorSection({ title, children, isDark }: {
  title: string
  children: React.ReactNode
  isDark: boolean
}) {
  return (
    <section>
      <h3 className={cn('mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]', isDark ? 'text-slate-500' : 'text-ink-400')}>
        {title}
      </h3>
      {children}
    </section>
  )
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono">{keys}</span>
      <span>{desc}</span>
    </div>
  )
}

/* ===== Icons ===== */
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
}
function ExpandIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
}
function CollapseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>
}
function ZoomOutIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M8 11h6"/></svg>
}
function ZoomInIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/></svg>
}
function FitIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
}
function ChevronUpIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m18 15-6-6-6 6"/></svg>
}
function ChevronDownIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
}
function ExportIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
