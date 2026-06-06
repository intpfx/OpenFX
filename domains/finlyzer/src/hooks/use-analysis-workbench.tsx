import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactEChartsCore from 'echarts-for-react/esm/core'
import { EyeOff, Pin, Settings2 } from 'lucide-react'
import type { WorkbenchCard } from '@/components/analysis-workbench'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { echarts } from '@/lib/charts/echartsRuntime'
import { computeCategoryRatio } from '@/lib/analytics/categoryRatio'
import { computeTrendData } from '@/lib/analytics/monthly'
import {
  computeCategoryMatrixData,
  computeUnifiedCalendarData,
  type CategoryMatrixPreferences,
  type MatrixGranularity,
  type WorkbenchChartKey,
} from '@/lib/analytics/workbench'
import {
  makeCategoryMatrixOption,
  makeCategoryOption,
  makeTrendOption,
  makeUnifiedCalendarOption,
} from '@/lib/charts/echartsOptions'
import { addDays, formatCompactMoney, formatMoney, formatMonth } from '@/lib/formatters'
import type { Transaction } from '@/types/transaction'

type TreemapNodeEventData = {
  fullPath?: string
  children?: unknown[]
}

type ChartEventParam = {
  name?: string | number
  axisValue?: string | number
  data?: TreemapNodeEventData
  value?: unknown
}

const MATRIX_HIDDEN_CATEGORY_STORAGE_KEY = 'finlyzer.matrix.hiddenCategories'
const MATRIX_PINNED_CATEGORY_STORAGE_KEY = 'finlyzer.matrix.pinnedCategories'

function readStoredCategoryPaths(storageKey: string): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []
  } catch {
    return []
  }
}

function sanitizeStoredCategoryPaths(paths: string[], allowedPaths: Set<string>): string[] {
  return Array.from(new Set(paths.filter((path) => allowedPaths.has(path))))
}

export type AnalysisFocus = {
  source: WorkbenchChartKey
  label: string
  dateKey?: string
  monthKey?: string
  categoryPath?: string
  categoryMatchMode?: 'exact' | 'prefix'
  range?: {
    start: string
    end: string
  }
}

const WORKBENCH_CHART_META: Record<
  WorkbenchChartKey,
  { title: string; description: string; empty: string }
> = {
  trend: {
    title: '趋势图',
    description: '查看当前账期的收支走势变化。',
    empty: '暂无趋势',
  },
  distribution: {
    title: '分类分布图',
    description: '查看支出和收入在分类上的分布结构。',
    empty: '暂无分布',
  },
  calendar: {
    title: '统一日历热力图',
    description: '单月显示月历，多月切换为连续热力图。',
    empty: '暂无热度',
  },
  matrix: {
    title: '分类 x 时间矩阵图',
    description: '默认显示叶子分类在时间维度上的净额分布。',
    empty: '暂无矩阵',
  },
}

export function useAnalysisWorkbench({
  periodRows,
  isCategorizedLeafTransaction,
  selectedMonths,
  activeWorkbenchChart,
  expandedWorkbenchChart,
  setImportNote,
}: {
  periodRows: Transaction[]
  isCategorizedLeafTransaction: (row: Transaction) => boolean
  selectedMonths: string[] | null
  activeWorkbenchChart: WorkbenchChartKey
  expandedWorkbenchChart: WorkbenchChartKey | null
  setImportNote: (message: string) => void
}) {
  const matrixGranularity: MatrixGranularity = 'month'
  const [analysisFocus, setAnalysisFocus] = useState<AnalysisFocus | null>(null)
  const [distributionDrillPath, setDistributionDrillPath] = useState<string[]>([])
  const [matrixHiddenCategoryPaths, setMatrixHiddenCategoryPaths] = useState<string[]>(
    () => readStoredCategoryPaths(MATRIX_HIDDEN_CATEGORY_STORAGE_KEY),
  )
  const [matrixPinnedCategoryPaths, setMatrixPinnedCategoryPaths] = useState<string[]>(
    () => readStoredCategoryPaths(MATRIX_PINNED_CATEGORY_STORAGE_KEY),
  )
  const distributionChartRef = useRef<InstanceType<typeof ReactEChartsCore> | null>(null)
  const echartsRendererOptions = useMemo(() => ({ renderer: 'svg' as const }), [])
  const distributionRendererOptions = useMemo(() => ({ renderer: 'canvas' as const }), [])

  const trendData = useMemo(() => computeTrendData(periodRows), [periodRows])
  const ratioData = useMemo(() => computeCategoryRatio(periodRows), [periodRows])
  const distributionOption = useMemo(() => makeCategoryOption(ratioData), [ratioData])
  const canDrillDistributionBack = distributionDrillPath.length > 0
  const distributionDrillLabel = distributionDrillPath.join(' / ')
  const categorizedLeafRows = useMemo(() => {
    return periodRows.filter(isCategorizedLeafTransaction)
  }, [isCategorizedLeafTransaction, periodRows])
  const unifiedCalendarData = useMemo(() => computeUnifiedCalendarData(periodRows), [periodRows])
  const availableMatrixCategoryPaths = useMemo(() => {
    return new Set(categorizedLeafRows.map((row) => row.primaryCategory.trim()).filter(Boolean))
  }, [categorizedLeafRows])

  useEffect(() => {
    setMatrixHiddenCategoryPaths((current) => sanitizeStoredCategoryPaths(current, availableMatrixCategoryPaths))
    setMatrixPinnedCategoryPaths((current) => sanitizeStoredCategoryPaths(current, availableMatrixCategoryPaths))
  }, [availableMatrixCategoryPaths])

  useEffect(() => {
    window.localStorage.setItem(MATRIX_HIDDEN_CATEGORY_STORAGE_KEY, JSON.stringify(matrixHiddenCategoryPaths))
  }, [matrixHiddenCategoryPaths])

  useEffect(() => {
    window.localStorage.setItem(MATRIX_PINNED_CATEGORY_STORAGE_KEY, JSON.stringify(matrixPinnedCategoryPaths))
  }, [matrixPinnedCategoryPaths])

  useEffect(() => {
    setDistributionDrillPath([])
  }, [ratioData])

  const matrixPreferences = useMemo<CategoryMatrixPreferences>(() => ({
    hiddenCategoryPaths: matrixHiddenCategoryPaths,
    pinnedCategoryPaths: matrixPinnedCategoryPaths,
  }), [matrixHiddenCategoryPaths, matrixPinnedCategoryPaths])

  const categoryMatrixData = useMemo(() => {
    return computeCategoryMatrixData(categorizedLeafRows, matrixGranularity, matrixPreferences)
  }, [categorizedLeafRows, matrixGranularity, matrixPreferences])

  const toggleMatrixCategoryHidden = useCallback((categoryPath: string, nextVisible: boolean) => {
    setMatrixHiddenCategoryPaths((current) => {
      if (nextVisible) {
        return current.filter((path) => path !== categoryPath)
      }
      if (current.includes(categoryPath)) {
        return current
      }
      return [...current, categoryPath]
    })

    if (!nextVisible) {
      setMatrixPinnedCategoryPaths((current) => current.filter((path) => path !== categoryPath))
    }
  }, [])

  const toggleMatrixCategoryPinned = useCallback((categoryPath: string) => {
    setMatrixPinnedCategoryPaths((current) => {
      if (current.includes(categoryPath)) {
        return current.filter((path) => path !== categoryPath)
      }
      return [categoryPath, ...current.filter((path) => path !== categoryPath)]
    })
    setMatrixHiddenCategoryPaths((current) => current.filter((path) => path !== categoryPath))
  }, [])

  const resetMatrixCategoryPreferences = useCallback(() => {
    setMatrixHiddenCategoryPaths([])
    setMatrixPinnedCategoryPaths([])
  }, [])

  const trendSummary = useMemo(() => {
    if (trendData.length === 0) {
      return '当前账期暂无走势波动'
    }

    const strongestExpensePoint = trendData.reduce((strongest, point) => {
      if (!strongest || point.expense > strongest.expense) {
        return point
      }
      return strongest
    }, trendData[0])

    return `支出高点 ${strongestExpensePoint.day} · ¥${formatMoney(strongestExpensePoint.expense)}`
  }, [trendData])

  const distributionSummary = useMemo(() => {
    if (ratioData.length === 0) {
      return '当前账期暂无分类分布'
    }

    const topNode = ratioData[0]
    return `${topNode.name} 占比最高 · ¥${formatMoney(topNode.value)}`
  }, [ratioData])

  const calendarSummary = useMemo(() => {
    if (!unifiedCalendarData.strongestPoint) {
      return '当前账期暂无日级热度'
    }

    const strongestPoint = unifiedCalendarData.strongestPoint
    const directionLabel = strongestPoint.net >= 0 ? '净流入' : '净流出'
    return `${strongestPoint.date} ${directionLabel} · ¥${formatMoney(Math.abs(strongestPoint.net))}`
  }, [unifiedCalendarData])

  const matrixSummary = useMemo(() => {
    if (!categoryMatrixData.strongestCell) {
      return '当前账期暂无分类矩阵'
    }

    return `${categoryMatrixData.strongestCell.categoryLabel} 在 ${categoryMatrixData.strongestCell.periodLabel} 的净额最突出`
  }, [categoryMatrixData])

  const workbenchCards = useMemo<WorkbenchCard[]>(() => {
    const strongestTrendExpense = trendData.reduce((strongest, point) => {
      if (!strongest || point.expense > strongest.expense) {
        return point
      }
      return strongest
    }, trendData[0])

    const topDistributionNode = ratioData[0]
    const strongestCalendarPoint = unifiedCalendarData.strongestPoint
    const strongestMatrixCell = categoryMatrixData.strongestCell

    return [
      {
        key: 'trend' as const,
        title: '趋势图',
        eyebrow: '收支走势',
        metric: strongestTrendExpense ? `¥${formatCompactMoney(strongestTrendExpense.expense)}` : '--',
        detail: strongestTrendExpense ? `支出峰值 · ${strongestTrendExpense.day}` : '暂无走势波动',
        summary: trendSummary,
        tone: 'trend',
      },
      {
        key: 'distribution' as const,
        title: '分类分布图',
        eyebrow: '最高分类',
        metric: topDistributionNode ? topDistributionNode.name : '--',
        detail: topDistributionNode ? `¥${formatCompactMoney(topDistributionNode.value)}` : '暂无分类分布',
        summary: distributionSummary,
        tone: 'distribution',
      },
      {
        key: 'calendar' as const,
        title: '统一日历热力图',
        eyebrow: unifiedCalendarData.mode === 'month' ? '月历模式' : '连续热图',
        metric: strongestCalendarPoint ? `¥${formatCompactMoney(Math.abs(strongestCalendarPoint.net))}` : '--',
        detail: strongestCalendarPoint ? `${strongestCalendarPoint.date} · ${strongestCalendarPoint.net >= 0 ? '净流入' : '净流出'}` : '暂无日级热度',
        summary: calendarSummary,
        tone: 'calendar',
      },
      {
        key: 'matrix' as const,
        title: '分类 x 时间矩阵图',
        eyebrow: '最强净额格子',
        metric: strongestMatrixCell ? `¥${formatCompactMoney(strongestMatrixCell.net)}` : '--',
        detail: strongestMatrixCell ? `${strongestMatrixCell.categoryLabel} · ${strongestMatrixCell.periodLabel}` : '暂无分类矩阵',
        summary: matrixSummary,
        tone: 'matrix',
      },
    ]
  }, [calendarSummary, categoryMatrixData, distributionSummary, matrixSummary, ratioData, trendData, trendSummary, unifiedCalendarData])

  const expandedWorkbenchCard = workbenchCards.find(
    (card) => card.key === (expandedWorkbenchChart ?? activeWorkbenchChart),
  ) ?? workbenchCards[0]

  const applyAnalysisFocus = useCallback((focus: AnalysisFocus) => {
    setAnalysisFocus(focus)
    setImportNote(`已根据${focus.label}聚焦交易表。`)
  }, [setImportNote])

  const clearAnalysisFocus = useCallback(() => {
    setAnalysisFocus(null)
    setImportNote('已清除图表聚焦，恢复当前账期全部流水。')
  }, [setImportNote])

  const handleTrendChartClick = useCallback((params: ChartEventParam) => {
    const rawKey = String(params?.name ?? params?.axisValue ?? '').trim()
    if (!rawKey) {
      return
    }

    if (selectedMonths && selectedMonths.length === 1) {
      const dateKey = `${selectedMonths[0]}-${rawKey.padStart(2, '0')}`
      applyAnalysisFocus({
        source: 'trend',
        label: `趋势图 ${dateKey}`,
        dateKey,
      })
      return
    }

    applyAnalysisFocus({
      source: 'trend',
      label: `趋势图 ${formatMonth(rawKey)}`,
      monthKey: rawKey,
    })
  }, [applyAnalysisFocus, selectedMonths])

  const handleDistributionChartClick = useCallback((params: ChartEventParam) => {
    const categoryPath = String(params?.data?.fullPath ?? '').trim()
    if (!categoryPath) {
      return
    }

    const hasChildren = Array.isArray(params?.data?.children) && params.data.children.length > 0
    if (hasChildren) {
      requestAnimationFrame(() => {
        setDistributionDrillPath(categoryPath.split('/').filter(Boolean))
      })
    }
  }, [])

  const handleDistributionDrillBack = useCallback(() => {
    setDistributionDrillPath((current) => {
      const next = current.slice(0, -1)
      const instance = distributionChartRef.current?.getEchartsInstance()
      if (instance) {
        if (next.length === 0) {
          instance.setOption(distributionOption, true)
        } else {
          instance.dispatchAction({
            type: 'treemapRootToNode',
            seriesIndex: 0,
            targetNodeId: next.join('/'),
          })
        }
      }
      return next
    })
    setAnalysisFocus(null)
  }, [distributionOption])

  const handleDistributionDrillReset = useCallback(() => {
    distributionChartRef.current?.getEchartsInstance().setOption(distributionOption, true)
    setDistributionDrillPath([])
    setAnalysisFocus(null)
  }, [distributionOption])

  const handleCalendarChartClick = useCallback((params: ChartEventParam) => {
    const dateKey = Array.isArray(params?.value) ? String(params.value[0] ?? '').trim() : ''
    if (!dateKey) {
      return
    }

    applyAnalysisFocus({
      source: 'calendar',
      label: `日历热图 ${dateKey}`,
      dateKey,
    })
  }, [applyAnalysisFocus])

  const handleMatrixChartClick = useCallback((params: ChartEventParam) => {
    const value = Array.isArray(params?.value) ? params.value : []
    const xIndex = Number(value[0])
    const yIndex = Number(value[1])
    const period = categoryMatrixData.periods[xIndex]
    const category = categoryMatrixData.categories[yIndex]

    if (!period || !category) {
      return
    }

    if (categoryMatrixData.granularity === 'day') {
      applyAnalysisFocus({
        source: 'matrix',
        label: `矩阵图 ${category.label} × ${period.label}`,
        categoryPath: category.path,
        categoryMatchMode: 'exact',
        dateKey: period.key,
      })
      return
    }

    if (categoryMatrixData.granularity === 'week') {
      applyAnalysisFocus({
        source: 'matrix',
        label: `矩阵图 ${category.label} × ${period.label}`,
        categoryPath: category.path,
        categoryMatchMode: 'exact',
        range: {
          start: period.key,
          end: addDays(period.key, 6),
        },
      })
      return
    }

    applyAnalysisFocus({
      source: 'matrix',
      label: `矩阵图 ${category.label} × ${period.label}`,
      categoryPath: category.path,
      categoryMatchMode: 'exact',
      monthKey: period.key,
    })
  }, [applyAnalysisFocus, categoryMatrixData])

  const renderWorkbenchChart = useCallback((chartKey: WorkbenchChartKey) => {
    if (chartKey === 'trend' && trendData.length > 0) {
      return (
        <ReactEChartsCore
          echarts={echarts}
          option={makeTrendOption(trendData)}
          opts={echartsRendererOptions}
          style={{ width: '100%', height: '100%' }}
          onEvents={{ click: handleTrendChartClick }}
          notMerge
          lazyUpdate
        />
      )
    }

    if (chartKey === 'distribution' && ratioData.length > 0) {
      return (
        <ReactEChartsCore
          echarts={echarts}
          ref={distributionChartRef}
          option={distributionOption}
          opts={distributionRendererOptions}
          style={{ width: '100%', height: '100%' }}
          onEvents={{ click: handleDistributionChartClick }}
          notMerge
          lazyUpdate
        />
      )
    }

    if (chartKey === 'calendar' && unifiedCalendarData.points.length > 0) {
      return (
        <ReactEChartsCore
          echarts={echarts}
          option={makeUnifiedCalendarOption(unifiedCalendarData)}
          opts={echartsRendererOptions}
          style={{ width: '100%', height: '100%' }}
          onEvents={{ click: handleCalendarChartClick }}
          notMerge
          lazyUpdate
        />
      )
    }

    if (chartKey === 'matrix' && categoryMatrixData.categories.length > 0 && categoryMatrixData.periods.length > 0) {
      return (
        <ReactEChartsCore
          echarts={echarts}
          option={makeCategoryMatrixOption(categoryMatrixData)}
          opts={echartsRendererOptions}
          style={{ width: '100%', height: '100%' }}
          onEvents={{ click: handleMatrixChartClick }}
          notMerge
          lazyUpdate
        />
      )
    }

    return (
      <div className="analysis-stage-empty">
        <span className="analysis-stage-empty-icon">◌</span>
        <span>{WORKBENCH_CHART_META[chartKey].empty}</span>
      </div>
    )
  }, [
    categoryMatrixData,
    distributionOption,
    distributionRendererOptions,
    echartsRendererOptions,
    handleCalendarChartClick,
    handleDistributionChartClick,
    handleMatrixChartClick,
    handleTrendChartClick,
    ratioData.length,
    trendData,
    unifiedCalendarData,
  ])

  const renderWorkbenchCard = useCallback((card: WorkbenchCard, mode: 'thumbnail' | 'expanded'): ReactNode => {
    const compact = mode === 'thumbnail'
    const showFloatingControls = !compact && (card.key === 'matrix' || card.key === 'distribution')
    const hiddenCount = categoryMatrixData.allCategories.filter((category) => !category.visible).length

    return (
      <div className={cn('analysis-stage-shell', compact && 'compact')}>
        <div className="analysis-stage-chart-shell">
          <div
            className={cn(
              'analysis-stage-chart',
              card.key === 'calendar' && 'analysis-stage-chart-calendar',
              !compact && card.key === 'matrix' && 'analysis-stage-chart-matrix-expanded',
            )}
          >
            {renderWorkbenchChart(card.key)}
          </div>

          {showFloatingControls ? (
            <div className="analysis-stage-floating-controls">
              {card.key === 'distribution' && canDrillDistributionBack ? (
                <div className="analysis-distribution-controls">
                  <button
                    type="button"
                    className="analysis-distribution-nav"
                    onClick={handleDistributionDrillBack}
                  >
                    返回上级
                  </button>
                  <button
                    type="button"
                    className="analysis-distribution-nav"
                    onClick={handleDistributionDrillReset}
                  >
                    回到根级
                  </button>
                  <span className="analysis-distribution-path">{distributionDrillLabel}</span>
                </div>
              ) : null}
              {card.key === 'matrix' ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" size="sm" className="analysis-matrix-config-trigger">
                      <Settings2 className="h-3.5 w-3.5" />
                      <span>分类显示</span>
                      <span className="analysis-matrix-config-count">
                        {categoryMatrixData.categories.length}/{categoryMatrixData.allCategories.length}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="analysis-matrix-config-popover">
                    <div className="analysis-matrix-config-head">
                      <div>
                        <div className="analysis-matrix-config-title">矩阵分类</div>
                        <div className="analysis-matrix-config-caption">默认全显示，可置顶或隐藏分类</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={resetMatrixCategoryPreferences}>
                        重置
                      </Button>
                    </div>
                    <div className="analysis-matrix-config-list">
                      {categoryMatrixData.allCategories.map((category) => (
                        <div key={category.path} className="analysis-matrix-config-item">
                          <label className="analysis-matrix-config-label">
                            <Checkbox
                              checked={category.visible}
                              onCheckedChange={(checked) => toggleMatrixCategoryHidden(category.path, Boolean(checked))}
                            />
                            <span className="analysis-matrix-config-texts">
                              <span className="analysis-matrix-config-name">{category.label}</span>
                              <span className="analysis-matrix-config-path">{category.path}</span>
                            </span>
                          </label>
                          <Button
                            type="button"
                            variant={category.pinned ? 'secondary' : 'ghost'}
                            size="icon"
                            className={cn('analysis-matrix-config-pin', category.pinned && 'active')}
                            aria-label={category.pinned ? `取消置顶 ${category.label}` : `置顶 ${category.label}`}
                            onClick={() => toggleMatrixCategoryPinned(category.path)}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {hiddenCount > 0 ? (
                      <div className="analysis-matrix-config-foot">
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>已隐藏 {hiddenCount} 个分类</span>
                      </div>
                    ) : null}
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    )
  }, [canDrillDistributionBack, categoryMatrixData, distributionDrillLabel, handleDistributionDrillBack, handleDistributionDrillReset, renderWorkbenchChart, resetMatrixCategoryPreferences, toggleMatrixCategoryHidden, toggleMatrixCategoryPinned])

  return {
    analysisFocus,
    clearAnalysisFocus,
    workbenchCards,
    expandedWorkbenchCard,
    renderWorkbenchCard,
  }
}