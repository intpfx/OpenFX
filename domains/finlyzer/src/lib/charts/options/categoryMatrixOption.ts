import type { EChartsOption } from 'echarts'
import type { CallbackDataParams, TopLevelFormatterParams } from 'echarts/types/dist/shared'
import type { CategoryMatrixData } from '../../analytics/workbench'
import { centsToYuanNumber, formatYuanNumber } from '../../money'
import { divergingPalette, getRobustMaxAbs, safeTooltipBase } from './shared'

type MatrixTooltipValue = [number, number, number, number, number, number, number, number, number]
type MatrixScatterValue = [number, number, number]

function readMatrixTooltipValue(params: TopLevelFormatterParams): MatrixTooltipValue | [] {
  if (Array.isArray(params)) {
    return []
  }

  return Array.isArray(params.value) ? params.value as MatrixTooltipValue : []
}

function readMatrixScatterValue(params: CallbackDataParams['value']): MatrixScatterValue | [] {
  return Array.isArray(params) ? params as MatrixScatterValue : []
}

export function makeCategoryMatrixOption(data: CategoryMatrixData): EChartsOption {
  const maxAbsNet = getRobustMaxAbs(data.cells.map((cell) => centsToYuanNumber(cell.net)))
  const labelFontSize = data.periods.length > 8 || data.categories.length > 14 ? 12 : 14
  const labelFormatter = (value: unknown) => {
    const net = Number(Array.isArray(value) ? value[2] ?? 0 : 0)
    if (!Number.isFinite(net) || net === 0) {
      return '0'
    }

    const absNet = Math.abs(net)
    if (absNet >= 10000) {
      return `${net > 0 ? '+' : '-'}${(absNet / 10000).toFixed(absNet >= 100000 ? 0 : 1)}w`
    }
    if (absNet >= 1000) {
      return `${net > 0 ? '+' : '-'}${(absNet / 1000).toFixed(absNet >= 10000 ? 0 : 1)}k`
    }
    return `${net > 0 ? '+' : ''}${Math.round(net)}`
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      ...safeTooltipBase,
      trigger: 'item',
      formatter: (params: TopLevelFormatterParams) => {
        const value = readMatrixTooltipValue(params)
        const periodIndex = Number(value[0] ?? -1)
        const categoryIndex = Number(value[1] ?? -1)
        const period = data.periods[periodIndex]?.label ?? '-'
        const category = data.categories[categoryIndex]?.label ?? '-'
        return [
          `${category}`,
          `时间: ${period}`,
          `净额: ¥ ${formatYuanNumber(Number(value[2] ?? 0))}`,
          `收入: ¥ ${formatYuanNumber(Number(value[3] ?? 0))}`,
          `支出: ¥ ${formatYuanNumber(Number(value[4] ?? 0))}`,
          `笔数: ${value[5] ?? 0}`,
          `应得: ¥ ${formatYuanNumber(Number(value[6] ?? 0))}`,
          `应付: ¥ ${formatYuanNumber(Number(value[7] ?? 0))}`,
          `承诺笔数: ${value[8] ?? 0}`,
        ].join('\n')
      },
    },
    grid: {
      top: 58,
      left: 108,
      right: 6,
      bottom: 4,
    },
    xAxis: {
      type: 'category',
      position: 'top',
      data: data.periods.map((period) => period.label),
      axisLine: { lineStyle: { color: '#d8e1ea' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        interval: 0,
        rotate: data.periods.length > 10 ? 32 : 0,
      },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: data.categories.map((category) => category.label),
      inverse: true,
      axisLine: { lineStyle: { color: '#d8e1ea' } },
      axisLabel: {
        color: '#475569',
        fontSize: 10,
        interval: 0,
        width: 112,
        overflow: 'truncate',
      },
    },
    visualMap: {
      min: -maxAbsNet,
      max: maxAbsNet,
      dimension: 2,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      top: 2,
      itemWidth: 10,
      itemHeight: 52,
      text: ['净流入', '净流出'],
      textGap: 10,
      textStyle: { color: '#64748b', fontSize: 10, fontWeight: 600 },
      inRange: { color: divergingPalette },
    },
    series: [
      {
        type: 'heatmap',
        data: data.cells.map((cell) => [
          data.periods.findIndex((period) => period.key === cell.periodKey),
          data.categories.findIndex((category) => category.path === cell.categoryPath),
          centsToYuanNumber(cell.net),
          centsToYuanNumber(cell.income),
          centsToYuanNumber(cell.expense),
          cell.count,
          centsToYuanNumber(cell.accrualIncome),
          centsToYuanNumber(cell.accrualExpense),
          cell.accrualCount,
        ]),
        label: {
          show: true,
          position: 'inside',
          color: '#0f172a',
          fontSize: labelFontSize,
          fontWeight: 900,
          formatter: ({ value }: { value: unknown }) => labelFormatter(value),
        },
        progressive: 0,
        emphasis: {
          itemStyle: {
            borderColor: '#0f172a',
            borderWidth: 1,
          },
        },
      },
      {
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        symbol: 'circle',
        symbolOffset: [18, -10],
        symbolSize: (value: CallbackDataParams['value']) => {
          const count = Number(readMatrixScatterValue(value)[2] ?? 0)
          return Math.max(12, Math.min(20, 10 + count * 2))
        },
        itemStyle: {
          color: 'rgba(255,255,255,0.96)',
          borderColor: '#d97706',
          borderWidth: 1.8,
        },
        label: {
          show: true,
          position: 'inside',
          color: '#b45309',
          fontSize: 9,
          fontWeight: 800,
          formatter: ({ value }: { value: unknown }) => {
            const count = Number(Array.isArray(value) ? value[2] ?? 0 : 0)
            return count > 0 ? String(count) : ''
          },
        },
        tooltip: { show: false },
        data: data.cells
          .filter((cell) => cell.accrualCount > 0)
          .map((cell) => [
            data.periods.findIndex((period) => period.key === cell.periodKey),
            data.categories.findIndex((category) => category.path === cell.categoryPath),
            cell.accrualCount,
          ]),
      },
    ],
  }
}
