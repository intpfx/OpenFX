import type { Transaction } from '../../types/transaction'

function shouldIncludeInWorkbench(tx: Transaction): boolean {
  return tx.eventType !== 'authorization' && tx.countInAnalytics !== false
}

function shouldIncludeInAccrualWorkbench(tx: Transaction): boolean {
  return tx.recordKind === 'accrual' && tx.accrualStatus === 'open'
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`)
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeek(dateKey: string): string {
  const date = parseDateKey(dateKey)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return formatDateKey(date)
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-')
  return `${year}.${month}`
}

function formatShortDateLabel(dateKey: string): string {
  return dateKey.slice(5).replace('-', '/')
}

function formatWeekLabel(weekStartKey: string): string {
  const date = parseDateKey(weekStartKey)
  const end = new Date(date)
  end.setDate(end.getDate() + 6)
  return `${formatShortDateLabel(formatDateKey(date))}-${formatShortDateLabel(formatDateKey(end))}`
}

function buildLeafDisplayLabels(paths: string[]): Map<string, string> {
  const leafCounts = new Map<string, number>()

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    const leaf = parts[parts.length - 1] ?? path
    leafCounts.set(leaf, (leafCounts.get(leaf) ?? 0) + 1)
  }

  const labelMap = new Map<string, string>()
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    const leaf = parts[parts.length - 1] ?? path
    if ((leafCounts.get(leaf) ?? 0) <= 1) {
      labelMap.set(path, leaf)
      continue
    }

    const compact = parts.slice(-2).join('/')
    labelMap.set(path, compact)
  }

  return labelMap
}

export type WorkbenchChartKey = 'trend' | 'distribution' | 'calendar' | 'matrix'

export type MatrixGranularity = 'day' | 'week' | 'month'

export type DailyActivityPoint = {
  date: string
  monthKey: string
  income: number
  expense: number
  accrualIncome: number
  accrualExpense: number
  net: number
  count: number
  accrualCount: number
}

export type UnifiedCalendarData = {
  mode: 'month' | 'heatmap'
  range: string | [string, string]
  points: DailyActivityPoint[]
  strongestPoint: DailyActivityPoint | null
  totalNet: number
}

export type CategoryMatrixCell = {
  periodKey: string
  periodLabel: string
  categoryPath: string
  categoryLabel: string
  income: number
  expense: number
  accrualIncome: number
  accrualExpense: number
  net: number
  accrualNet: number
  count: number
  accrualCount: number
}

export type CategoryMatrixData = {
  granularity: MatrixGranularity
  periods: Array<{ key: string; label: string }>
  categories: Array<{ path: string; label: string }>
  allCategories: Array<{ path: string; label: string; visible: boolean; pinned: boolean }>
  cells: CategoryMatrixCell[]
  strongestCell: CategoryMatrixCell | null
}

export type CategoryMatrixPreferences = {
  hiddenCategoryPaths?: string[]
  pinnedCategoryPaths?: string[]
}

export function computeDailyActivityPoints(transactions: Transaction[]): DailyActivityPoint[] {
  const buckets = new Map<string, DailyActivityPoint>()

  for (const tx of transactions) {
    if (!shouldIncludeInWorkbench(tx) && !shouldIncludeInAccrualWorkbench(tx)) {
      continue
    }

    const key = tx.dayKey
    const existing = buckets.get(key) ?? {
      date: key,
      monthKey: tx.monthKey,
      income: 0,
      expense: 0,
      accrualIncome: 0,
      accrualExpense: 0,
      net: 0,
      count: 0,
      accrualCount: 0,
    }

    if (shouldIncludeInAccrualWorkbench(tx)) {
      if (tx.direction === 'income') {
        existing.accrualIncome += tx.amount
      } else {
        existing.accrualExpense += tx.amount
      }
      existing.accrualCount += 1
    } else if (tx.direction === 'income') {
      existing.income += tx.amount
      existing.net += tx.amount
    } else {
      existing.expense += tx.amount
      existing.net -= tx.amount
    }
    if (shouldIncludeInWorkbench(tx)) {
      existing.count += 1
    }

    buckets.set(key, existing)
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function computeUnifiedCalendarData(transactions: Transaction[]): UnifiedCalendarData {
  const points = computeDailyActivityPoints(transactions)
  const monthKeys = Array.from(new Set(points.map((point) => point.monthKey))).sort()
  const strongestPoint = points.reduce<DailyActivityPoint | null>((strongest, point) => {
    if (!strongest || Math.abs(point.net) > Math.abs(strongest.net)) {
      return point
    }
    return strongest
  }, null)

  if (points.length === 0) {
    return {
      mode: 'month',
      range: monthKeys[0] ?? '',
      points,
      strongestPoint: null,
      totalNet: 0,
    }
  }

  return {
    mode: monthKeys.length <= 1 ? 'month' : 'heatmap',
    range: monthKeys.length <= 1 ? monthKeys[0] : [points[0].date, points[points.length - 1].date],
    points,
    strongestPoint,
    totalNet: points.reduce((sum, point) => sum + point.net, 0),
  }
}

export function getSuggestedMatrixGranularity(transactions: Transaction[]): MatrixGranularity {
  const dayCount = computeDailyActivityPoints(transactions).length
  if (dayCount <= 40) {
    return 'day'
  }
  if (dayCount <= 180) {
    return 'week'
  }
  return 'month'
}

export function computeCategoryMatrixData(
  transactions: Transaction[],
  granularity: MatrixGranularity,
  preferences: CategoryMatrixPreferences = {},
): CategoryMatrixData {
  const periodMeta = new Map<string, { label: string }>()
  const categoryTotals = new Map<string, number>()
  const buckets = new Map<string, CategoryMatrixCell>()
  const hiddenCategoryPaths = new Set(preferences.hiddenCategoryPaths ?? [])
  const pinnedCategoryPaths = new Set(preferences.pinnedCategoryPaths ?? [])

  for (const tx of transactions) {
    if (!shouldIncludeInWorkbench(tx) && !shouldIncludeInAccrualWorkbench(tx)) {
      continue
    }

    const categoryPath = tx.primaryCategory.trim()
    if (!categoryPath) {
      continue
    }

    let periodKey = tx.dayKey
    let periodLabel = formatShortDateLabel(tx.dayKey)

    if (granularity === 'week') {
      periodKey = startOfWeek(tx.dayKey)
      periodLabel = formatWeekLabel(periodKey)
    } else if (granularity === 'month') {
      periodKey = tx.monthKey
      periodLabel = formatMonthLabel(tx.monthKey)
    }

    periodMeta.set(periodKey, { label: periodLabel })
    const bucketKey = `${periodKey}__${categoryPath}`
    const existing = buckets.get(bucketKey) ?? {
      periodKey,
      periodLabel,
      categoryPath,
      categoryLabel: categoryPath,
      income: 0,
      expense: 0,
      accrualIncome: 0,
      accrualExpense: 0,
      net: 0,
      accrualNet: 0,
      count: 0,
      accrualCount: 0,
    }

    if (shouldIncludeInAccrualWorkbench(tx)) {
      if (tx.direction === 'income') {
        existing.accrualIncome += tx.amount
        existing.accrualNet += tx.amount
      } else {
        existing.accrualExpense += tx.amount
        existing.accrualNet -= tx.amount
      }
      existing.accrualCount += 1
    } else if (tx.direction === 'income') {
      existing.income += tx.amount
      existing.net += tx.amount
    } else {
      existing.expense += tx.amount
      existing.net -= tx.amount
    }
    if (shouldIncludeInWorkbench(tx)) {
      existing.count += 1
    }

    buckets.set(bucketKey, existing)
    categoryTotals.set(categoryPath, (categoryTotals.get(categoryPath) ?? 0) + tx.amount)
  }

  const sortedCategoryEntries = Array.from(categoryTotals.entries()).sort((a, b) => {
    const aPinned = pinnedCategoryPaths.has(a[0]) ? 0 : 1
    const bPinned = pinnedCategoryPaths.has(b[0]) ? 0 : 1
    if (aPinned !== bPinned) {
      return aPinned - bPinned
    }
    if (b[1] !== a[1]) {
      return b[1] - a[1]
    }
    return a[0].localeCompare(b[0], 'zh-CN')
  })

  const sortedCategoryPaths = sortedCategoryEntries.map(([path]) => path)
  const visibleCategoryPaths = sortedCategoryPaths.filter((path) => !hiddenCategoryPaths.has(path))
  const labelMap = buildLeafDisplayLabels(sortedCategoryPaths)
  const periods = Array.from(periodMeta.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, meta]) => ({ key, label: meta.label }))

  const categories = visibleCategoryPaths.map((path) => ({ path, label: labelMap.get(path) ?? path }))
  const allCategories = sortedCategoryPaths.map((path) => ({
    path,
    label: labelMap.get(path) ?? path,
    visible: !hiddenCategoryPaths.has(path),
    pinned: pinnedCategoryPaths.has(path),
  }))
  const cells: CategoryMatrixCell[] = []

  for (const category of categories) {
    for (const period of periods) {
      const bucket = buckets.get(`${period.key}__${category.path}`)
      cells.push({
        periodKey: period.key,
        periodLabel: period.label,
        categoryPath: category.path,
        categoryLabel: category.label,
        income: bucket?.income ?? 0,
        expense: bucket?.expense ?? 0,
        net: bucket?.net ?? 0,
        accrualIncome: bucket?.accrualIncome ?? 0,
        accrualExpense: bucket?.accrualExpense ?? 0,
        accrualNet: bucket?.accrualNet ?? 0,
        accrualCount: bucket?.accrualCount ?? 0,
        count: bucket?.count ?? 0,
      })
    }
  }

  const strongestCell = cells.reduce<CategoryMatrixCell | null>((strongest, cell) => {
    if (!strongest || Math.abs(cell.net) > Math.abs(strongest.net)) {
      return cell
    }
    return strongest
  }, null)

  return {
    granularity,
    periods,
    categories,
    allCategories,
    cells,
    strongestCell,
  }
}