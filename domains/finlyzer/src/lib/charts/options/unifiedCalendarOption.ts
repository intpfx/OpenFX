import type { EChartsOption } from 'echarts'
import type { CallbackDataParams, TopLevelFormatterParams } from 'echarts/types/dist/shared'
import type { UnifiedCalendarData } from '../../analytics/workbench'
import { centsToYuanNumber, formatYuanNumber } from '../../money'
import { divergingPalette, getRobustMaxAbs, safeTooltipBase } from './shared'

type CalendarHeatmapValue = [string, number, number, number, number, number, number, number]
type CalendarScatterValue = [string, number, number]

function readCalendarHeatmapValue(params: TopLevelFormatterParams): CalendarHeatmapValue | [] {
  if (Array.isArray(params)) {
    return []
  }

  return Array.isArray(params.value) ? params.value as CalendarHeatmapValue : []
}

function readCalendarScatterValue(params: CallbackDataParams['value']): CalendarScatterValue | [] {
  return Array.isArray(params) ? params as CalendarScatterValue : []
}

export function makeUnifiedCalendarOption(data: UnifiedCalendarData): EChartsOption {
  const maxAbsNet = getRobustMaxAbs(data.points.map((point) => centsToYuanNumber(point.net)))
  const singleMonth = data.mode === 'month'
  const visualMapTop = singleMonth ? 12 : 16
  const calendarTop = singleMonth ? 52 : 78
  const calendarLeft = singleMonth ? 18 : 72
  const calendarRight = singleMonth ? 12 : 24
  const calendarBottom = singleMonth ? 10 : 20
  const monthLabelFormatter = (params: {
    nameMap: string
    yyyy: string
    yy: string
    MM: string
    M: number
  }) => `${params.M}月`
  const dayNumberFormatter = (value: unknown) => {
    const dateKey = Array.isArray(value) ? String(value[0] ?? '') : ''
    const dayText = dateKey.split('-').at(-1) ?? ''
    return dayText ? String(Number(dayText)) : ''
  }
  const accrualBadgeSize = (count: number) => Math.max(singleMonth ? 14 : 10, Math.min(singleMonth ? 22 : 16, 10 + count * 2))
  return {
    backgroundColor: 'transparent',
    tooltip: {
      ...safeTooltipBase,
      trigger: 'item',
      formatter: (params: TopLevelFormatterParams) => {
        const value = readCalendarHeatmapValue(params)
        const [, net = 0, income = 0, expense = 0, count = 0] = value
        const accrualIncome = Number(value[5] ?? 0)
        const accrualExpense = Number(value[6] ?? 0)
        const accrualCount = Number(value[7] ?? 0)
        return [
          `${value[0] ?? '-'}`,
          `净额: ¥ ${formatYuanNumber(Number(net))}`,
          `收入: ¥ ${formatYuanNumber(Number(income))}`,
          `支出: ¥ ${formatYuanNumber(Number(expense))}`,
          `笔数: ${count}`,
          `应得: ¥ ${formatYuanNumber(accrualIncome)}`,
          `应付: ¥ ${formatYuanNumber(accrualExpense)}`,
          `承诺笔数: ${accrualCount}`,
        ].join('\n')
      },
    },
    visualMap: {
      min: -maxAbsNet,
      max: maxAbsNet,
      dimension: 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      top: visualMapTop,
      itemWidth: 14,
      itemHeight: 80,
      text: ['净流入', '净流出'],
      textGap: 14,
      textStyle: { color: '#64748b', fontSize: 12, fontWeight: 600 },
      inRange: { color: divergingPalette },
    },
    calendar: {
      top: calendarTop,
      left: calendarLeft,
      right: calendarRight,
      bottom: calendarBottom,
      range: data.range,
      orient: 'horizontal',
      splitLine: {
        show: true,
        lineStyle: {
          color: '#ffffff',
          width: singleMonth ? 4 : 2,
        },
      },
      itemStyle: {
        color: '#eef2f7',
        borderWidth: 0,
      },
      cellSize: singleMonth ? ['auto', 36] : [20, 20],
      dayLabel: {
        firstDay: 1,
        nameMap: ['日', '一', '二', '三', '四', '五', '六'],
        color: '#64748b',
        margin: singleMonth ? 16 : 14,
        fontSize: singleMonth ? 12 : 11,
        fontWeight: 600,
      },
      monthLabel: {
        show: !singleMonth,
        color: '#64748b',
        fontSize: 12,
        fontWeight: 600,
        margin: 16,
        formatter: monthLabelFormatter,
      },
      yearLabel: {
        show: !singleMonth,
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: 600,
        margin: 28,
      },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        progressive: 0,
        label: {
          show: true,
          position: 'insideTopLeft',
          offset: singleMonth ? [6, 5] : [4, 3],
          color: '#334155',
          fontSize: singleMonth ? 12 : 10,
          fontWeight: 700,
          formatter: ({ value }: { value: unknown }) => dayNumberFormatter(value),
        },
        encode: {
          value: 1,
          tooltip: [0, 1, 2, 3, 4],
        },
        data: data.points.map((point) => [
          point.date,
          centsToYuanNumber(point.net),
          centsToYuanNumber(point.income),
          centsToYuanNumber(point.expense),
          point.count,
          centsToYuanNumber(point.accrualIncome),
          centsToYuanNumber(point.accrualExpense),
          point.accrualCount,
        ]),
      },
      {
        type: 'scatter',
        coordinateSystem: 'calendar',
        symbol: 'circle',
        symbolOffset: singleMonth ? [10, -10] : [6, -6],
        symbolSize: (value: CallbackDataParams['value']) => {
          const count = Number(readCalendarScatterValue(value)[2] ?? 0)
          return accrualBadgeSize(count)
        },
        itemStyle: {
          color: 'rgba(255,255,255,0.96)',
          borderColor: '#d97706',
          borderWidth: singleMonth ? 2 : 1.6,
        },
        label: {
          show: true,
          position: 'inside',
          color: '#b45309',
          fontSize: singleMonth ? 10 : 8,
          fontWeight: 800,
          formatter: ({ value }: { value: unknown }) => {
            const count = Number(Array.isArray(value) ? value[2] ?? 0 : 0)
            return count > 0 ? String(count) : ''
          },
        },
        tooltip: { show: false },
        data: data.points
          .filter((point) => point.accrualCount > 0)
          .map((point) => [
            point.date,
            centsToYuanNumber(point.accrualIncome + point.accrualExpense),
            point.accrualCount,
          ]),
      },
    ],
  }
}
