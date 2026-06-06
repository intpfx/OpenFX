import type { EChartsOption } from 'echarts'
import type { TrendPoint } from '../../analytics/monthly'
import { centsToYuanNumber, formatYuanNumber } from '../../money'
import { safeTooltipBase } from './shared'

export function makeTrendOption(data: TrendPoint[]): EChartsOption {
  return {
    color: ['#0f766e', '#b42318', '#0ea5a4', '#d97706'],
    tooltip: {
      ...safeTooltipBase,
      trigger: 'axis',
      valueFormatter: (value) => `¥ ${formatYuanNumber(Number(value) || 0)}`,
    },
    grid: { top: 28, right: 16, left: 36, bottom: 24 },
    legend: { top: 0, textStyle: { color: '#334155', fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.day),
      axisLine: { lineStyle: { color: '#c9d4df' } },
      axisLabel: { color: '#64748b', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        name: '收入',
        type: 'line',
        stack: 'total',
        smooth: true,
        showSymbol: false,
        data: data.map((item) => centsToYuanNumber(item.income)),
        lineStyle: { width: 2.6 },
        areaStyle: {
          opacity: 0.55,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(15,118,110,0.65)' },
              { offset: 1, color: 'rgba(15,118,110,0.08)' },
            ],
          },
        },
      },
      {
        name: '支出',
        type: 'line',
        stack: 'total',
        smooth: true,
        showSymbol: false,
        data: data.map((item) => centsToYuanNumber(item.expense)),
        lineStyle: { width: 2.4 },
        areaStyle: {
          opacity: 0.5,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(180,35,24,0.52)' },
              { offset: 1, color: 'rgba(180,35,24,0.08)' },
            ],
          },
        },
      },
      {
        name: '应得',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: data.map((item) => centsToYuanNumber(item.accrualIncome)),
        lineStyle: { width: 2, type: 'dashed' },
        itemStyle: { opacity: 0.9 },
        emphasis: { focus: 'series' },
      },
      {
        name: '应付',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: data.map((item) => centsToYuanNumber(item.accrualExpense)),
        lineStyle: { width: 2, type: 'dashed' },
        itemStyle: { opacity: 0.9 },
        emphasis: { focus: 'series' },
      },
    ],
  }
}
