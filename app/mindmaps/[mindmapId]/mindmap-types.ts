export type MindmapColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose' | 'gray'
export const mindmapColorOrder: MindmapColor[] = ['blue', 'green', 'orange', 'purple', 'rose', 'gray']
export type MindmapLayout = 'xmind-axis' | 'right' | 'logic' | 'organization' | 'timeline' | 'fishbone'
export type MindmapBackground = 'paper' | 'white' | 'warm-gray' | 'dark'
export type MindmapFontFamily = 'serif' | 'sans' | 'mono'
export type MindmapBranchLine = 'thin' | 'default' | 'thick'
export type MindmapTheme = 'classic' | 'business' | 'rainbow' | 'compact' | 'dark' | 'minimal'
export type LayoutTemplateId = 'xmind-axis' | 'right' | 'logic' | 'organization' | 'timeline' | 'fishbone'

export type MindmapViewport = {
  x: number
  y: number
  zoom: number
}

export type MindmapMeta = {
  layout: MindmapLayout
  theme: MindmapTheme
  background: MindmapBackground
  fontFamily: MindmapFontFamily
  branchLine: MindmapBranchLine
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
