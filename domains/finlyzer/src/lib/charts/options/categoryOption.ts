import type { EChartsOption } from 'echarts'
import type { CallbackDataParams, TopLevelFormatterParams } from 'echarts/types/dist/shared'
import type { CategoryRatioRow } from '../../analytics/categoryRatio'
import { centsToYuanNumber, formatYuanNumber } from '../../money'
import { safeTooltipBase } from './shared'

type TreemapLabelParam = {
  name: string
  value?: unknown
  data?: Record<string, unknown> | null
}

function readTreemapNodeParams(params: CallbackDataParams): TreemapLabelParam {
  return {
    name: String(params.name ?? ''),
    value: params.value,
    data: params.data && typeof params.data === 'object' ? params.data as Record<string, unknown> : null,
  }
}

function readTreemapTooltipParams(params: TopLevelFormatterParams): TreemapLabelParam {
  if (Array.isArray(params)) {
    return { name: '', value: undefined, data: null }
  }

  return readTreemapNodeParams(params)
}

export function makeCategoryOption(data: CategoryRatioRow[]): EChartsOption {
  const fallbackBaseColor = '#64748b'
  const semanticBaseColors: Record<string, string> = {
    '支出': '#b42318',
    '收入': '#0f766e',
    '支出/应付支出': '#d92d20',
    '支出/已付支出': '#ef4444',
    '收入/应得收入': '#059669',
    '收入/已得收入': '#0f766e',
    '支出/未分类': '#c2410c',
    '收入/未分类': '#047857',
  }

  const compressAreaValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return 0
    }
    return Number(Math.pow(value, 0.82).toFixed(4))
  }

  const hexToRgb = (hex?: string) => {
    const safeHex = hex && /^#?[0-9a-fA-F]{3,6}$/.test(hex) ? hex : fallbackBaseColor
    const normalized = safeHex.replace('#', '')
    const full = normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized
    const value = Number.parseInt(full, 16)
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    }
  }

  const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
    return `#${[clamp(r), clamp(g), clamp(b)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  }

  const mixColor = (from: string, to: string, ratio: number) => {
    const left = hexToRgb(from)
    const right = hexToRgb(to)
    const amount = Math.max(0, Math.min(1, ratio))
    return rgbToHex({
      r: left.r + (right.r - left.r) * amount,
      g: left.g + (right.g - left.g) * amount,
      b: left.b + (right.b - left.b) * amount,
    })
  }

  const withAlpha = (hex: string, alpha: number) => {
    const { r, g, b } = hexToRgb(hex)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const getSemanticBaseColor = (fullPath: string) => {
    const parts = String(fullPath ?? '').split('/').filter(Boolean)
    const secondLevelPath = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] ?? '支出'
    return semanticBaseColors[secondLevelPath] ?? semanticBaseColors[parts[0] ?? ''] ?? fallbackBaseColor
  }

  const getNodeFillColor = (fullPath: string, depth: number) => {
    const baseColor = getSemanticBaseColor(fullPath)
    if (depth === 0) {
      return mixColor(baseColor, '#f8fafc', 0.14)
    }
    if (depth === 1) {
      return baseColor
    }
    const deepened = mixColor(baseColor, '#0f172a', Math.min(0.14 + (depth - 2) * 0.12, 0.4))
    return mixColor(deepened, '#ffffff', Math.max(0, 0.08 - depth * 0.01))
  }

  const getLabelColor = (depth: number) => (depth <= 1 ? '#0f172a' : '#ffffff')

  const getAccrualDecal = (fillColor: string, accrualValue: number, cashValue: number) => {
    if (accrualValue <= 0) {
      return undefined
    }

    const accrualOnly = cashValue <= 0
    return {
      symbol: 'rect',
      symbolSize: accrualOnly ? 1.8 : 1.2,
      color: accrualOnly ? withAlpha('#fff7ed', 0.92) : withAlpha('#ffffff', 0.45),
      backgroundColor: withAlpha(fillColor, 0),
      dashArrayX: accrualOnly ? [[1, 0], [2, 2]] : [[1, 0], [1, 5]],
      dashArrayY: accrualOnly ? [5, 3] : [3, 5],
      rotation: -Math.PI / 4,
      maxTileWidth: 18,
      maxTileHeight: 18,
    }
  }

  const createLeafLabel = (fontSize: number, color: string) => ({
    show: true,
    color,
    fontSize,
    fontWeight: 700,
    overflow: 'break' as const,
    formatter: (params: CallbackDataParams) => {
      const node = readTreemapNodeParams(params)
      const rawValue = Number(node.data?.rawValue ?? node.value ?? 0)
      return `${node.name}\n¥${formatYuanNumber(rawValue)}`
    },
  })

  const createLevel = (depth: number) => ({
    itemStyle: {
      borderColor: 'transparent',
      borderWidth: 0,
      gapWidth: 0,
      borderRadius: 0,
      opacity: depth >= 4 ? 0.98 : 1,
    },
    upperLabel: depth <= 3 ? {
      show: true,
      height: Math.max(16, 24 - depth * 2),
      color: '#f8fafc',
      fontSize: Math.max(9, 12 - depth),
      fontWeight: 700,
    } : undefined,
    label: createLeafLabel(Math.max(9, 12 - depth), depth <= 1 ? '#0f172a' : '#ffffff'),
  })

  const assignColors = (nodes: CategoryRatioRow[], depth = 0): CategoryRatioRow[] => {
    return nodes.map((node) => {
      const fillColor = getNodeFillColor(node.fullPath, depth)
      const accrualOnly = node.accrualValue > 0 && node.cashValue <= 0

      return {
        ...node,
        value: compressAreaValue(node.value),
        rawValue: centsToYuanNumber(node.value),
        cashValue: centsToYuanNumber(node.cashValue),
        accrualValue: centsToYuanNumber(node.accrualValue),
        itemStyle: {
          color: fillColor,
          opacity: accrualOnly ? 0.88 : 0.97,
          borderColor: node.accrualValue > 0 ? withAlpha('#b45309', depth <= 1 ? 0.95 : 0.7) : withAlpha(fillColor, 0.18),
          borderWidth: node.accrualValue > 0 ? (depth <= 1 ? 2 : 1.4) : 0,
          borderType: node.accrualValue > 0 ? 'solid' : 'solid',
          decal: getAccrualDecal(fillColor, node.accrualValue, node.cashValue),
          shadowBlur: depth <= 1 ? 0 : 6,
          shadowColor: withAlpha('#0f172a', 0.06),
        },
        label: createLeafLabel(Math.max(9, 12 - depth), getLabelColor(depth)),
        upperLabel: depth >= 1 && depth <= 3 ? {
          show: true,
          height: Math.max(16, 24 - depth * 2),
          color: getLabelColor(depth),
          fontSize: Math.max(9, 12 - depth),
          fontWeight: 700,
        } : undefined,
        children: node.children ? assignColors(node.children, depth + 1) : undefined,
      }
    })
  }

  const treeData = assignColors(data)

  return {
    backgroundColor: 'transparent',
    tooltip: {
      ...safeTooltipBase,
      trigger: 'item',
      formatter: (params: TopLevelFormatterParams) => {
        const node = readTreemapTooltipParams(params)
        const dataNode = node.data ?? {}
        const total = Number(dataNode.rawValue ?? dataNode.value ?? 0)
        const cashValue = Number(dataNode.cashValue ?? 0)
        const accrualValue = Number(dataNode.accrualValue ?? 0)
        return [
          `${node.name}`,
          `合计: ¥ ${formatYuanNumber(total)}`,
          `现金层: ¥ ${formatYuanNumber(cashValue)}`,
          `承诺层: ¥ ${formatYuanNumber(accrualValue)}`,
        ].join('\n')
      },
    },
    series: [
      {
        name: '分类占比',
        type: 'treemap',
        roam: false,
        nodeClick: 'zoomToNode',
        animation: true,
        animationDurationUpdate: 260,
        animationEasingUpdate: 'cubicOut',
        itemStyle: {
          borderColor: 'transparent',
          borderWidth: 0,
          gapWidth: 0,
        },
        breadcrumb: {
          show: false,
          height: 0,
          itemStyle: {
            color: '#f8fafc',
            borderColor: '#d8e1ea',
            borderWidth: 1,
            borderRadius: 0,
          },
          emptyItemWidth: 24,
        },
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        visibleMin: 0,
        data: treeData,
        squareRatio: 1.1,
        sort: 'desc',
        childrenVisibleMin: 8,
        colorMappingBy: 'id',
        label: {
          show: true,
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 700,
          overflow: 'truncate',
          formatter: (params: CallbackDataParams) => {
            const node = readTreemapNodeParams(params)
            return `${node.name}
        ¥${formatYuanNumber(Number(node.data?.rawValue ?? node.value ?? 0))}`
          },
        },
        levels: [
          {
            itemStyle: {
              borderColor: 'transparent',
              borderWidth: 0,
              gapWidth: 0,
              borderRadius: 0,
            },
            upperLabel: {
              show: false,
              height: 24,
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 700,
            },
          },
          createLevel(1),
          createLevel(2),
          createLevel(3),
          createLevel(4),
          createLevel(5),
        ],
      },
    ],
  }
}
