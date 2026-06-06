export type MindmapColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'gray'
export const mindmapColorOrder: MindmapColor[] = ['blue', 'green', 'orange', 'purple', 'rose', 'gray']

export type MindmapBackground = 'paper' | 'white' | 'warm-gray' | 'dark'
export type MindmapFontFamily = 'serif' | 'sans' | 'mono'
export type MindmapBranchLine = 'thin' | 'default' | 'thick'
export type MindmapTheme = 'classic' | 'business' | 'rainbow' | 'compact' | 'dark' | 'minimal'
export type MindmapPaletteId = string

export type MindmapViewport = {
  x: number
  y: number
  zoom: number
}

export type MindmapMeta = {
  layout: string
  theme: MindmapTheme
  background: MindmapBackground
  fontFamily: MindmapFontFamily
  branchLine: MindmapBranchLine
  palette?: MindmapPaletteId
  rainbowBranches: boolean
  compact: boolean
  viewport?: MindmapViewport
}

export type MindmapNode = {
  id: string
  label: string
  color: MindmapColor
  collapsed?: boolean
  meta?: Partial<MindmapMeta>
  note?: string
  tags?: string[]
  children: MindmapNode[]
}

export type MindmapNavigationEntry = {
  depth: number
  node: MindmapNode
  parentId: string | null
}

/* ---------- SMM (simple-mind-map) compatible data types ---------- */

export type SmmNodeData = {
  text: string
  uid: string
  expand: boolean
  note?: string
  tag?: string[]
  generalization?: {
    text: string
  } | null
  // preserve our custom meta
  _mindmapColor?: string
  _mindmapMeta?: Partial<MindmapMeta>
}

export type SmmNode = {
  data: SmmNodeData
  children: SmmNode[]
}

/* ---------- HTML tag cleanup ---------- */

/**
 * Strip HTML tags from text. simple-mind-map's RichText plugin may have
 * wrapped node text in <p> tags. This function removes them so the UI
 * doesn't display raw HTML like "<p>text</p>".
 */
export function stripHtmlTags(text: string): string {
  if (!text) return text
  // Remove <p>...</p> and any other HTML tags
  return text
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim()
}

/* ---------- Conversion between legacy tree and SMM tree ---------- */

export function legacyNodeToSmm(node: MindmapNode): SmmNode {
  return {
    data: {
      text: stripHtmlTags(node.label),
      uid: node.id,
      expand: !node.collapsed,
      note: node.note || undefined,
      tag: Array.isArray(node.tags) ? node.tags.filter(Boolean) : undefined,
      _mindmapColor: node.color || undefined,
      _mindmapMeta: node.meta || undefined,
    },
    children: node.children.map(legacyNodeToSmm),
  }
}

export function smmNodeToLegacy(node: SmmNode): MindmapNode {
  const data = node.data
  return {
    id: data.uid,
    label: stripHtmlTags(data.text) || '新节点',
    color: (data._mindmapColor as MindmapColor) || 'gray',
    collapsed: !data.expand,
    meta: data._mindmapMeta as Partial<MindmapMeta> | undefined,
    note: data.note || '',
    tags: Array.isArray(data.tag) ? data.tag.filter(Boolean) : [],
    children: node.children.map(smmNodeToLegacy),
  }
}

/* ---------- Helpers for counting nodes in either format ---------- */

export function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0

  // SMM format: { data: {...}, children: [...] }
  const smm = node as { data?: unknown; children?: unknown[] }
  if (smm.data && typeof smm.data === 'object') {
    const children = Array.isArray(smm.children) ? smm.children : []
    let total = 1
    for (const child of children) total += countNodes(child)
    return total
  }

  // Legacy format: { id, label, children: [...] }
  const legacy = node as { children?: unknown[] }
  const children = Array.isArray(legacy.children) ? legacy.children : []
  let total = 1
  for (const child of children) total += countNodes(child)
  return total
}
