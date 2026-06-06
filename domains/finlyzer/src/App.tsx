import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import './index.css'
import { getAvailableMonths } from './lib/analytics/monthly'
import {
  type WorkbenchChartKey,
} from './lib/analytics/workbench'
import {
  deleteTransactionsByIds,
  getAllTransactions,
  getCategoryTree,
  setCategoryForTransactions,
  unlinkTransactionsFromMirrors,
  linkTransactionsAsMirrors,
  updateTransactionAmountSpread,
  getAppMetaValue,
  setAppMetaValue,
} from './lib/storage/repositories'
import type { AmountSpreadUnit, CategoryNode, Transaction } from './types/transaction'
import { AnalysisWorkbench } from './components/analysis-workbench'
import { AccrualSettlementReviewDialog } from './components/dialogs/accrual-settlement-review-dialog'
import { CategoryManager } from './components/category-manager'
import { ConfirmDialog } from './components/dialogs/confirm-dialog'
import { GuideDialog } from './components/dialogs/guide-dialog'
import { ManualCommitmentDialog } from './components/dialogs/manual-commitment-dialog'
import { TransactionTable } from './components/transaction-table'
import { Badge } from '@/components/ui/badge'
import { useAnalysisWorkbench, type AnalysisFocus } from './hooks/use-analysis-workbench'
import { useAccrualWorkflow } from './hooks/use-accrual-workflow'
import { useCategoryWorkflow } from './hooks/use-category-workflow'
import { useImportOperations } from './hooks/use-import-operations'
import { useVirtualizedTable } from './hooks/use-virtualized-table'
import { formatMoney } from './lib/formatters'
import {
  flattenLeafCategoryPaths,
  isCategoryPathSelectableForTransaction,
  isUncategorizedCategoryPath,
} from './lib/categoryTree'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
  }
}

type WorkbenchTransitionDirection = 'expand' | 'collapse'

const GUIDE_SEEN_META_KEY = 'ui.guideSeen'

function getTransactionSourceClassName(source: Transaction['source']): string {
  if (source === 'alipay') {
    return 'source-alipay'
  }
  if (source === 'wechat') {
    return 'source-wechat'
  }
  if (source === 'manual') {
    return 'source-manual'
  }
  return 'source-bank'
}

function renderLifecycleBadge(row: Transaction): React.JSX.Element | null {
  if (row.recordKind === 'accrual') {
    if (row.accrualType === 'payable') {
      return row.accrualStatus === 'settled'
        ? <Badge variant="success" className="lifecycle-badge">应付已结转</Badge>
        : <Badge variant="processing" className="lifecycle-badge">应付待结转</Badge>
    }

    if (row.accrualType === 'receivable') {
      return row.accrualStatus === 'settled'
        ? <Badge variant="success" className="lifecycle-badge">应得已结转</Badge>
        : <Badge variant="processing" className="lifecycle-badge">应得待结转</Badge>
    }
  }

  if (row.accrualLinkedTransactionId) {
    return <Badge variant="success" className="lifecycle-badge">已结转承诺</Badge>
  }

  if (row.linkedTransactionId) {
    if (row.countInAnalytics === false) {
      return <Badge variant="secondary" className="lifecycle-badge">镜像记录</Badge>
    }
    return <Badge variant="success" className="lifecycle-badge">已关联镜像</Badge>
  }

  if (row.eventType === 'authorization') {
    if (row.settlementStatus === 'linked') {
      return <Badge variant="processing" className="lifecycle-badge">先用后付已关联</Badge>
    }
    if (row.settlementStatus === 'closed') {
      return <Badge variant="secondary" className="lifecycle-badge">先用后付已关闭</Badge>
    }
    return <Badge variant="partial" className="lifecycle-badge">先用后付待结算</Badge>
  }

  if (row.eventType === 'settlement') {
    return <Badge variant="success" className="lifecycle-badge">先用后付结算</Badge>
  }

  return null
}

function getMirrorScopeKey(row: Transaction): string {
  if (row.linkGroupId) {
    return `group:${row.linkGroupId}`
  }

  if (row.linkedTransactionId) {
    return `pair:${[row.id, row.linkedTransactionId].sort().join(':')}`
  }

  return `single:${row.id}`
}

function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonths, setSelectedMonths] = useState<string[] | null>(null)
  const [amountFilter, setAmountFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [activeWorkbenchChart, setActiveWorkbenchChart] = useState<WorkbenchChartKey>('trend')
  const [expandedWorkbenchChart, setExpandedWorkbenchChart] = useState<WorkbenchChartKey | null>(null)
  const [, setImportNote] = useState('')
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideSeen, setGuideSeen] = useState(true)

  const runWorkbenchTransition = useCallback((direction: WorkbenchTransitionDirection, update: () => void) => {
    const doc = document as DocumentWithViewTransition
    const root = document.documentElement
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion) {
      flushSync(update)
      return
    }

    root.dataset.workbenchTransition = direction
    const transition = doc.startViewTransition(() => {
      flushSync(update)
    })
    transition.finished.finally(() => {
      delete root.dataset.workbenchTransition
    })
  }, [])

  const expandWorkbenchChart = useCallback((chartKey: WorkbenchChartKey) => {
    runWorkbenchTransition('expand', () => {
      setActiveWorkbenchChart(chartKey)
      setExpandedWorkbenchChart(chartKey)
    })
  }, [runWorkbenchTransition])

  const collapseWorkbenchChart = useCallback(() => {
    runWorkbenchTransition('collapse', () => {
      setExpandedWorkbenchChart(null)
    })
  }, [runWorkbenchTransition])

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    dangerous: boolean
    onConfirm: () => Promise<void>
  }>({ open: false, title: '', description: '', dangerous: true, onConfirm: async () => {} })

  const openConfirm = (
    title: string,
    description: string,
    onConfirm: () => Promise<void>,
    dangerous = true,
  ) => {
    setConfirmDialog({ open: true, title, description, dangerous, onConfirm })
  }

  const {
    selectedCategoryId,
    childInput,
    renameInput,
    editingCategoryId,
    childPopoverNodeId,
    expandedIds,
    setSelectedCategoryId,
    setChildInput,
    setRenameInput,
    setEditingCategoryId,
    setChildPopoverNodeId,
    addChildCategoryTo,
    renameCategoryById,
    deleteCategoryById,
    copyCategoryBranchById,
    selectCategoryNode,
    startInlineRename,
    openChildPopover,
    toggleNode,
    moveCategoryNode,
    syncSelectedCategory,
  } = useCategoryWorkflow({
    categoryTree,
    setCategoryTree,
    setImportNote,
  })

  const refreshData = useCallback(async () => {
    const [loadedTransactions, loadedTree] = await Promise.all([
      getAllTransactions(),
      getCategoryTree(),
    ])
    const nextMonths = getAvailableMonths(loadedTransactions)
    setTransactions(loadedTransactions)
    setMonths(nextMonths)
    setCategoryTree(loadedTree)
    setSelectedRowIds((prev) => prev.filter((id) => loadedTransactions.some((item) => item.id === id)))
    syncSelectedCategory(loadedTree)
  }, [syncSelectedCategory])

  const {
    importInputRef,
    restoreInputRef,
    handleImportClick,
    handleFileSelection,
    handleExportBackup,
    handleRestoreClick,
    handleRestoreSelection,
  } = useImportOperations({
    refreshData,
    setImportNote,
  })

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  useEffect(() => {
    let cancelled = false

    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.themeMode

    void getAppMetaValue(GUIDE_SEEN_META_KEY).then((storedGuideSeen) => {
      if (cancelled) {
        return
      }

      const nextGuideSeen = storedGuideSeen === 'true'
      setGuideSeen(nextGuideSeen)
      if (!nextGuideSeen) {
        setGuideOpen(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const acknowledgeGuide = useCallback(() => {
    setGuideOpen(false)
    if (guideSeen) {
      return
    }

    setGuideSeen(true)
    void setAppMetaValue(GUIDE_SEEN_META_KEY, 'true')
  }, [guideSeen])

  const categoryOptions = useMemo(() => flattenLeafCategoryPaths(categoryTree), [categoryTree])
  const leafCategoryPathSet = useMemo(() => new Set(categoryOptions.map((option) => option.path)), [categoryOptions])

  const {
    manualDialogOpen,
    manualDate,
    manualAmount,
    manualContent,
    manualCategoryPath,
    manualCategoryOptions,
    settlementReview,
    setManualDialogOpen,
    setManualDate,
    setManualAmount,
    setManualContent,
    setManualCategoryPath,
    setSettlementReview,
    resetManualDialog,
    handleCreateManualCommitment,
    openAccrualSettlementReview,
    handleConfirmAccrualSettlement,
    handleClearAccrualSettlement,
  } = useAccrualWorkflow({
    categoryOptions,
    refreshData,
    setImportNote,
  })

  const isLeafCategoryPath = useCallback((categoryPath: string) => {
    if (isUncategorizedCategoryPath(categoryPath)) {
      return false
    }
    return leafCategoryPathSet.has(categoryPath)
  }, [leafCategoryPathSet])

  const isCategorizedLeafTransaction = useCallback((row: Transaction) => {
    return isLeafCategoryPath(row.primaryCategory)
  }, [isLeafCategoryPath])

  const periodRows = useMemo(() => {
    if (!selectedMonths) return transactions
    return transactions.filter((item) => selectedMonths.includes(item.monthKey))
  }, [transactions, selectedMonths])

  const {
    analysisFocus,
    clearAnalysisFocus,
    workbenchCards,
    expandedWorkbenchCard,
    renderWorkbenchCard,
  } = useAnalysisWorkbench({
    periodRows,
    isCategorizedLeafTransaction,
    selectedMonths,
    activeWorkbenchChart,
    expandedWorkbenchChart,
    setImportNote,
  })

  const matchesAnalysisFocus = useCallback((row: Transaction, focus: AnalysisFocus) => {
    if (focus.dateKey && row.dayKey !== focus.dateKey) {
      return false
    }

    if (focus.monthKey && row.monthKey !== focus.monthKey) {
      return false
    }

    if (focus.range && (row.dayKey < focus.range.start || row.dayKey > focus.range.end)) {
      return false
    }

    if (focus.categoryPath) {
      if (focus.categoryMatchMode === 'prefix') {
        if (!(row.primaryCategory === focus.categoryPath || row.primaryCategory.startsWith(`${focus.categoryPath}/`))) {
          return false
        }
      } else if (row.primaryCategory !== focus.categoryPath) {
        return false
      }
    }

    return true
  }, [])

  const focusedRows = useMemo(() => {
    if (!analysisFocus) {
      return periodRows
    }
    return periodRows.filter((row) => matchesAnalysisFocus(row, analysisFocus))
  }, [analysisFocus, matchesAnalysisFocus, periodRows])

  const filteredRows = useMemo(() => {
    const categorySet = new Set(categoryFilters)

    return focusedRows.filter((row) => {
      if (amountFilter !== 'all' && row.direction !== amountFilter) {
        return false
      }

      if (categorySet.size > 0) {
        const rowCategory = row.primaryCategory.trim() || '未分类'
        if (!categorySet.has(rowCategory)) {
          return false
        }
      }

      return true
    })
  }, [amountFilter, categoryFilters, focusedRows])

  const uncategorizedCount = useMemo(() => {
    return filteredRows.filter((row) => !isCategorizedLeafTransaction(row)).length
  }, [filteredRows, isCategorizedLeafTransaction])

  const analyticsRows = useMemo(() => {
    return filteredRows.filter((row) => row.countInAnalytics !== false)
  }, [filteredRows])

  const totalIncome = useMemo(() => {
    return analyticsRows
      .filter((row) => row.direction === 'income')
      .reduce((sum, row) => sum + row.amount, 0)
  }, [analyticsRows])

  const totalExpense = useMemo(() => {
    return analyticsRows
      .filter((row) => row.direction === 'expense')
      .reduce((sum, row) => sum + row.amount, 0)
  }, [analyticsRows])

  const openAccrualAmount = useMemo(() => {
    return filteredRows
      .filter((row) => row.recordKind === 'accrual' && row.accrualStatus === 'open')
      .reduce((sum, row) => sum + row.amount, 0)
  }, [filteredRows])

  const tableRows = useMemo(() => {
    const uncategorizedRows: Transaction[] = []
    const categorizedRows: Transaction[] = []

    for (const row of filteredRows) {
      if (!isCategorizedLeafTransaction(row)) {
        uncategorizedRows.push(row)
      } else {
        categorizedRows.push(row)
      }
    }

    return [...uncategorizedRows, ...categorizedRows]
  }, [filteredRows, isCategorizedLeafTransaction])

  const hasActiveTableFilters = Boolean(selectedMonths) || amountFilter !== 'all' || categoryFilters.length > 0

  const selectedRows = useMemo(() => {
    const selectedIdSet = new Set(selectedRowIds)
    return transactions.filter((row) => selectedIdSet.has(row.id))
  }, [selectedRowIds, transactions])

  const linkMirrorsDisabledReason = useMemo(() => {
    if (selectedRowIds.length < 2) {
      return '至少选择 2 条流水后才能手动关联镜像。'
    }

    if (selectedRows.length !== selectedRowIds.length) {
      return '部分已选流水已失效，请重新选择。'
    }

    if (selectedRows.some((row) => row.recordKind !== 'cash')) {
      return '承诺记录不能参与镜像关联。'
    }

    const scopeKeys = new Set(selectedRows.map((row) => getMirrorScopeKey(row)))
    if (scopeKeys.size === 1 && selectedRows.every((row) => Boolean(row.linkGroupId || row.linkedTransactionId))) {
      return '所选流水已经在同一镜像组中。'
    }

    return ''
  }, [selectedRowIds.length, selectedRows])

  const linkMirrorsBatch = useCallback(() => {
    if (linkMirrorsDisabledReason) {
      setImportNote(linkMirrorsDisabledReason)
      return
    }

    const selectedCount = selectedRows.length
    const mergesExistingMirrors = selectedRows.some((row) => Boolean(row.linkGroupId || row.linkedTransactionId))

    openConfirm(
      '手动关联镜像',
      mergesExistingMirrors
        ? `将把已选 ${selectedCount} 条流水及其已有镜像记录合并到同一镜像组，并只保留 1 条计入分析。`
        : `将把已选 ${selectedCount} 条流水合并到同一镜像组，并只保留 1 条计入分析。`,
      async () => {
        const affectedCount = await linkTransactionsAsMirrors(selectedRowIds)
        await refreshData()
        setImportNote(affectedCount > 0
          ? `已将 ${affectedCount} 条流水归入同一镜像组。`
          : '未找到可关联的镜像流水。')
      },
      false,
    )
  }, [linkMirrorsDisabledReason, refreshData, selectedRowIds, selectedRows])

  const unlinkMirrorsDisabledReason = useMemo(() => {
    if (selectedRowIds.length === 0) {
      return '至少选择 1 条流水后才能解除镜像关联。'
    }

    if (selectedRows.length !== selectedRowIds.length) {
      return '部分已选流水已失效，请重新选择。'
    }

    if (selectedRows.some((row) => row.recordKind !== 'cash')) {
      return '承诺记录不能参与镜像解除。'
    }

    if (!selectedRows.some((row) => Boolean(row.linkGroupId || row.linkedTransactionId))) {
      return '所选流水里没有已关联的镜像记录。'
    }

    return ''
  }, [selectedRowIds.length, selectedRows])

  const unlinkMirrorsBatch = useCallback(() => {
    if (unlinkMirrorsDisabledReason) {
      setImportNote(unlinkMirrorsDisabledReason)
      return
    }

    openConfirm(
      '解除镜像关联',
      `将解除已选流水所在镜像组的关联关系，并恢复这些记录全部计入分析。`,
      async () => {
        const affectedCount = await unlinkTransactionsFromMirrors(selectedRowIds)
        await refreshData()
        setImportNote(affectedCount > 0
          ? `已解除 ${affectedCount} 条流水的镜像关联。`
          : '所选流水没有可解除的镜像关联。')
      },
      false,
    )
  }, [refreshData, selectedRowIds, unlinkMirrorsDisabledReason])

  useEffect(() => {
    const visibleIds = new Set(tableRows.map((item) => item.id))
    setSelectedRowIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [tableRows])
  const {
    tableBodyRef,
    loadedRows,
    virtualRows,
    virtualTopOffset,
    virtualTotalHeight,
    flashRowId,
    handleTableScroll,
    requestCenterRow,
    rowHeight,
  } = useVirtualizedTable({
    rows: tableRows,
    resetDeps: [selectedMonths, analysisFocus, transactions.length, amountFilter, categoryFilters.join('|')],
  })

  const clearTableFilters = useCallback(() => {
    setSelectedMonths(null)
    setAmountFilter('all')
    setCategoryFilters([])
  }, [])

  const toggleRow = (id: string) => {
    setSelectedRowIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const deleteBatch = () => {
    if (selectedRowIds.length === 0) return
    openConfirm(
      `删除 ${selectedRowIds.length} 条流水`,
      '已选流水将被永久删除，此操作不可恢复。',
      async () => {
        await deleteTransactionsByIds(selectedRowIds)
        setSelectedRowIds([])
        await refreshData()
      },
    )
  }

  const findNextUncategorizedRowId = useCallback((currentId: string) => {
    const uncategorizedIds = tableRows.filter((row) => !isCategorizedLeafTransaction(row)).map((row) => row.id)
    const currentIndex = uncategorizedIds.indexOf(currentId)

    if (currentIndex < 0) {
      return uncategorizedIds[0] ?? ''
    }

    return uncategorizedIds[currentIndex + 1] ?? ''
  }, [isCategorizedLeafTransaction, tableRows])

  const setSingleCategory = useCallback(async (id: string, categoryPath: string) => {
    const currentRow = tableRows.find((row) => row.id === id)
    const normalizedCategoryPath = currentRow && isLeafCategoryPath(categoryPath) && isCategoryPathSelectableForTransaction(categoryPath, currentRow)
      ? categoryPath
      : ''
    const shouldAdvance = currentRow && !isCategorizedLeafTransaction(currentRow) && normalizedCategoryPath !== ''
    const nextUncategorizedRowId = shouldAdvance ? findNextUncategorizedRowId(id) : ''

    await setCategoryForTransactions([id], normalizedCategoryPath)
    await refreshData()

    if (shouldAdvance) {
      if (nextUncategorizedRowId) {
        requestCenterRow(nextUncategorizedRowId)
        setImportNote('已完成分类，已自动定位到下一条未分类记录。')
      } else {
        setImportNote('已完成分类，当前账期内没有更多未分类记录。')
      }
    }
  }, [findNextUncategorizedRowId, isCategorizedLeafTransaction, isLeafCategoryPath, refreshData, requestCenterRow, tableRows])

  const jumpToSettlement = (row: Transaction) => {
    if (!row.relatedOrderId) {
      setImportNote('该记录暂无已关联的结算单。')
      return
    }

    const target =
      transactions.find((item) => item.orderId === row.relatedOrderId) ||
      transactions.find((item) => item.merchantOrderId === row.relatedOrderId)

    if (!target) {
      setImportNote('未找到对应结算单，可能已被删除。')
      return
    }

    setSelectedMonths([target.monthKey])
    requestCenterRow(target.id)
    setImportNote(`已定位到结算单：${target.dayKey} ¥${formatMoney(target.amount)}`)
  }

  const jumpToLinkedTransaction = (row: Transaction) => {
    if (!row.linkedTransactionId) {
      setImportNote('该记录暂无关联镜像。')
      return
    }

    const target = transactions.find((item) => item.id === row.linkedTransactionId)
    if (!target) {
      setImportNote('未找到关联镜像，可能已被删除。')
      return
    }

    setSelectedMonths([target.monthKey])
    requestCenterRow(target.id)
    setImportNote(`已定位到关联记录：${target.dayKey} ¥${formatMoney(target.amount)}`)
  }

  const jumpToAccrualLinkedTransaction = (row: Transaction) => {
    if (!row.accrualLinkedTransactionId) {
      setImportNote('该记录暂无承诺结转关联。')
      return
    }

    const target = transactions.find((item) => item.id === row.accrualLinkedTransactionId)
    if (!target) {
      setImportNote('未找到对应结转记录，可能已被删除。')
      return
    }

    setSelectedMonths([target.monthKey])
    requestCenterRow(target.id)
    setImportNote(`已定位到结转记录：${target.dayKey} ¥${formatMoney(target.amount)}`)
  }

  const setAmountSpreadForTransaction = useCallback(async (id: string, value: string, unit: AmountSpreadUnit) => {
    setTransactions((prev) => prev.map((row) => (row.id === id
      ? { ...row, amountSpreadValue: value, amountSpreadUnit: unit }
      : row)))
    await updateTransactionAmountSpread(id, { value, unit })
  }, [])

  return (
    <main className="app-shell">
      <section className="top-panel">
        <TransactionTable
          selectedRowIds={selectedRowIds}
          tableRows={tableRows}
          uncategorizedCount={uncategorizedCount}
          toolbarMetrics={[
            {
              key: 'net',
              label: '本期净流入',
              value: `${totalIncome - totalExpense >= 0 ? '+' : '-'}¥${formatMoney(Math.abs(totalIncome - totalExpense))}`,
              tone: totalIncome - totalExpense >= 0 ? 'positive' : 'negative',
              detail: (
                <>
                  <span>收入 ¥{formatMoney(totalIncome)}</span>
                  <span>支出 ¥{formatMoney(totalExpense)}</span>
                </>
              ),
            },
            {
              key: 'accrual',
              label: '待结转承诺',
              value: `¥${formatMoney(openAccrualAmount)}`,
              tone: openAccrualAmount > 0 ? 'accent' : 'neutral',
              detail: `${filteredRows.filter((row) => row.recordKind === 'accrual' && row.accrualStatus === 'open').length} 条开放承诺`,
            },
          ]}
          analysisFocusLabel={analysisFocus?.label ?? null}
          amountFilter={amountFilter}
          onAmountFilterChange={(value) => setAmountFilter(value)}
          categoryFilters={categoryFilters}
          onCategoryFiltersChange={setCategoryFilters}
          hasActiveFilters={hasActiveTableFilters}
          onClearTableFilters={clearTableFilters}
          months={months}
          selectedMonths={selectedMonths}
          onChangeMonths={setSelectedMonths}
          onImportClick={handleImportClick}
          onManualClick={() => setManualDialogOpen(true)}
          onExportBackup={() => void handleExportBackup()}
          onRestoreClick={handleRestoreClick}
          onOpenGuide={() => setGuideOpen(true)}
          onClearAnalysisFocus={clearAnalysisFocus}
          onLinkMirrorsBatch={linkMirrorsBatch}
          linkMirrorsDisabled={Boolean(linkMirrorsDisabledReason)}
          linkMirrorsTitle={linkMirrorsDisabledReason || '将所选流水手动归并为同一镜像组'}
          onUnlinkMirrorsBatch={unlinkMirrorsBatch}
          unlinkMirrorsDisabled={Boolean(unlinkMirrorsDisabledReason)}
          unlinkMirrorsTitle={unlinkMirrorsDisabledReason || '解除所选流水所在镜像组的关联'}
          onDeleteBatch={deleteBatch}
          tableBodyRef={tableBodyRef}
          onTableScroll={handleTableScroll}
          loadedRows={loadedRows}
          virtualTotalHeight={virtualTotalHeight}
          virtualTopOffset={virtualTopOffset}
          virtualRows={virtualRows}
          flashRowId={flashRowId}
          rowHeight={rowHeight}
          getTransactionSourceClassName={getTransactionSourceClassName}
          isCategorizedLeafTransaction={isCategorizedLeafTransaction}
          onToggleRow={toggleRow}
          renderLifecycleBadge={renderLifecycleBadge}
          onJumpToAccrualLinkedTransaction={jumpToAccrualLinkedTransaction}
          onOpenAccrualSettlementReview={(row) => void openAccrualSettlementReview(row)}
          onClearAccrualSettlement={(row) => handleClearAccrualSettlement(row, openConfirm)}
          onJumpToLinkedTransaction={jumpToLinkedTransaction}
          onJumpToSettlement={jumpToSettlement}
          categoryOptions={categoryOptions}
          onSetSingleCategory={(id, categoryPath) => void setSingleCategory(id, categoryPath)}
          onSetAmountSpread={(id, value, unit) => void setAmountSpreadForTransaction(id, value, unit)}
          emptyStateText={hasActiveTableFilters
            ? '当前表头筛选条件下没有匹配流水，请调整账期、金额或分类筛选。'
            : analysisFocus
              ? '当前图表聚焦条件下没有匹配流水，请尝试点击其他图块或清除聚焦。'
              : '当前账期暂无流水，请切换账期或先导入账单。'}
        />
      </section>

      <section className="bottom-main-panel">
        <AnalysisWorkbench
          expandedWorkbenchChart={expandedWorkbenchChart}
          expandedWorkbenchCard={expandedWorkbenchCard}
          workbenchCards={workbenchCards}
          expandWorkbenchChart={expandWorkbenchChart}
          collapseWorkbenchChart={collapseWorkbenchChart}
          renderWorkbenchCard={renderWorkbenchCard}
        />
      </section>

      <section className="side-panel">
        <input
          ref={importInputRef}
          type="file"
          hidden
          multiple
          accept=".csv,.txt,.xls,.xlsx"
          onChange={handleFileSelection}
        />
        <input
          ref={restoreInputRef}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={handleRestoreSelection}
        />

        <CategoryManager
          categoryTree={categoryTree}
          selectedCategoryId={selectedCategoryId}
          editingCategoryId={editingCategoryId}
          renameInput={renameInput}
          childPopoverNodeId={childPopoverNodeId}
          childInput={childInput}
          expandedIds={expandedIds}
          onSelectCategoryNode={selectCategoryNode}
          onToggleNode={toggleNode}
          onRenameInputChange={setRenameInput}
          onChildInputChange={setChildInput}
          onRenameCategory={(id) => void renameCategoryById(id)}
          onCancelRename={() => {
            setEditingCategoryId('')
            setRenameInput('')
          }}
          onStartInlineRename={startInlineRename}
          onCopyCategoryBranch={(id) => void copyCategoryBranchById(id)}
          onOpenChildPopover={openChildPopover}
          onCloseChildPopover={(id) => {
            setSelectedCategoryId(id)
            setChildPopoverNodeId('')
            setChildInput('')
          }}
          onAddChildCategory={(id) => void addChildCategoryTo(id)}
          onDeleteCategory={(id) => deleteCategoryById(id, openConfirm)}
          onMoveCategoryNode={(sourceId, targetId) => void moveCategoryNode(sourceId, targetId)}
        />
      </section>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        dangerous={confirmDialog.dangerous}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog((prev) => ({ ...prev, open: false }))
          }
        }}
        onConfirm={confirmDialog.onConfirm}
      />

      <AccrualSettlementReviewDialog
        open={settlementReview.open}
        loading={settlementReview.loading}
        submitting={settlementReview.submitting}
        accrual={settlementReview.accrual}
        candidates={settlementReview.candidates}
        onOpenChange={(open) => {
          if (!open && !settlementReview.submitting) {
            setSettlementReview({ open: false, loading: false, submitting: false, accrual: null, candidates: [] })
          }
        }}
        onClose={() => setSettlementReview({ open: false, loading: false, submitting: false, accrual: null, candidates: [] })}
        onConfirmCandidate={handleConfirmAccrualSettlement}
      />

      <ManualCommitmentDialog
        open={manualDialogOpen}
        date={manualDate}
        amount={manualAmount}
        content={manualContent}
        categoryPath={manualCategoryPath}
        categoryOptions={manualCategoryOptions}
        onOpenChange={(open) => {
          setManualDialogOpen(open)
          if (!open) {
            resetManualDialog()
          }
        }}
        onDateChange={setManualDate}
        onAmountChange={setManualAmount}
        onContentChange={setManualContent}
        onCategoryPathChange={setManualCategoryPath}
        onSubmit={handleCreateManualCommitment}
      />

      <GuideDialog
        open={guideOpen}
        onOpenChange={(open) => {
          setGuideOpen(open)
          if (!open) {
            acknowledgeGuide()
          }
        }}
        onAcknowledge={acknowledgeGuide}
      />

    </main>
  )
}

export default App
