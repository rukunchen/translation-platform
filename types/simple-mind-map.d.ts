declare module 'simple-mind-map' {
  interface MindMapOptions {
    el: HTMLElement
    data?: unknown
    readonly?: boolean
    layout?: string
    theme?: string
    themeConfig?: Record<string, unknown>
    enableFreeDrag?: boolean
    mousewheelAction?: string
    defaultNodeWidth?: number
    defaultNodeHeight?: number
    nodeTextEditZIndex?: number
    isShowNodeExpandButton?: boolean
    rainbowLinesConfig?: { open: boolean; colorsList: string[] }
    mousewheelZoomActionReverse?: boolean
    maxHistoryCount?: number
    defaultInsertSecondLevelNodeText?: string
    defaultInsertBelowSecondLevelNodeText?: string
    alwaysShowExpandBtn?: boolean
    fit?: boolean
    isShowCreateChildBtnIcon?: boolean
  }

  class MindMap {
    static usePlugin(plugin: unknown): void
    static pluginList: Record<string, unknown>

    constructor(options: MindMapOptions)

    getData(): unknown
    destroy(): void
    setTheme(theme: string): void
    setThemeConfig(config: Record<string, unknown>): void
    setData(data: unknown): void
    render(): void
    reRender(): void
    fitCanvas(): void
    emit(event: string, ...args: unknown[]): void
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void

    command: {
      exec(command: string, ...args: unknown[]): void
      redo(): void
      undo(): void
    }

    execCommand(command: string, ...args: unknown[]): void

    renderer: {
      findNodeByUid(uid: string): unknown
      activeNodeList: unknown[]
      insertChildNode(openEdit?: boolean, appointNode?: unknown, appointData?: unknown, appointChildren?: unknown[]): void
      insertNode(openEdit?: boolean, appointNode?: unknown, appointData?: unknown, appointChildren?: unknown[]): void
    }

    setLayout(layout: string): void
    getLayout(): string

    view: {
      enlarge(): void
      narrow(): void
      reset(): void
      fit(): void
    }

    keyCommand: Record<string, string>

    rainbowLines?: {
      openRainbow(): void
      closeRainbow(): void
      updateRainLinesConfig(config: { open?: boolean; colorsList?: string[] }): void
    }

    miniMap?: {
      openMiniMap(): void
      closeMiniMap(): void
    }

    select?: {
      selectAll(): void
    }

    export: {
      png(opt?: unknown): string | Promise<string>
      svg(opt?: unknown): string | Promise<string>
      pdf(opt?: unknown): string | Promise<string>
      json(opt?: unknown): string | Promise<string>
      md(opt?: unknown): string | Promise<string>
      xmind(opt?: unknown): string | Promise<string>
    }

    doExport: {
      png(fileName?: string): Promise<void>
      svg(fileName?: string): Promise<void>
      pdf(fileName?: string): Promise<void>
      json(fileName?: string): Promise<void>
      md(fileName?: string): Promise<void>
      xmind(fileName?: string): Promise<void>
    }

    search: {
      search(keyword: string): void
      searchNext(): void
      searchPrev?(): void
      endSearch(): void
    }

    scrollbar?: {
      update(): void
    }

    associativeLine?: {
      createLineFromActiveNode(): void
    }
  }

  export default MindMap
}

declare module 'simple-mind-map/src/plugins/Drag.js'
declare module 'simple-mind-map/src/plugins/Select.js'
declare module 'simple-mind-map/src/plugins/AssociativeLine.js'
declare module 'simple-mind-map/src/plugins/Export.js'
declare module 'simple-mind-map/src/plugins/ExportPDF.js'
declare module 'simple-mind-map/src/plugins/ExportXMind.js'
declare module 'simple-mind-map/src/plugins/Search.js'
declare module 'simple-mind-map/src/plugins/RichText.js'
declare module 'simple-mind-map/src/plugins/Scrollbar.js'
declare module 'simple-mind-map/src/plugins/RainbowLines.js'
declare module 'simple-mind-map/src/plugins/OuterFrame.js'
declare module 'simple-mind-map/src/plugins/Formula.js'
declare module 'simple-mind-map/src/plugins/NodeImgAdjust.js'
declare module 'simple-mind-map/src/plugins/MiniMap.js'
