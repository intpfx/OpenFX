import { useMemo, useState, type ReactNode, type RefObject, type UIEventHandler } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronDown, CircleHelp, Download, Link2, RotateCcw, Unlink2, SquarePen, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { CategoryCombobox } from './category-combobox'
import { CategoryBreadcrumb } from './category-breadcrumb'
import { PeriodPicker } from './period-picker'
import { cn } from '@/lib/utils'
import type { CategoryOption } from '@/lib/categoryTree'
import { formatCompactDate, formatMoney, formatMonth } from '@/lib/formatters'
import type { AmountSpreadUnit, Transaction } from '@/types/transaction'

type AmountFilterValue = 'all' | 'income' | 'expense'

type ToolbarMetric = {
  key: string
  label: string
  value: string
  detail: ReactNode
  tone: 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'
}

type AmountSpreadDraft = {
  value: string
  unit: AmountSpreadUnit
}

const AMOUNT_SPREAD_UNIT_LABEL: Record<AmountSpreadUnit, string> = {
  day: '天',
  month: '月',
  year: '年',
}

function convertDurationToDays(value: number, unit: AmountSpreadUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }

  if (unit === 'month') {
    return value * 30
  }
  if (unit === 'year') {
    return value * 365
  }
  return value
}

function getSpreadSummary(amount: number, draft: AmountSpreadDraft): { label: string; detail: string } | null {
  const durationValue = Number(draft.value)
  const totalDays = convertDurationToDays(durationValue, draft.unit)
  if (!Number.isFinite(durationValue) || durationValue <= 0 || totalDays <= 0) {
    return null
  }

  const dailyAmount = Math.round(amount / totalDays)
  return {
    label: `约 ¥${formatMoney(dailyAmount)}/天`,
    detail: `${draft.value}${AMOUNT_SPREAD_UNIT_LABEL[draft.unit]}折算`,
  }
}

type MultiSelectFilterPopoverProps = {
  title: string
  triggerLabel: string
  triggerActive: boolean
  searchPlaceholder: string
  emptyText: string
  selectedValues: string[]
  options: Array<{ value: string; keywords?: string; renderLabel: ReactNode; summaryLabel?: string }>
  clearLabel: string
  onChange: (values: string[]) => void
}

function HeaderPillButton({ label, active }: { label: string; active?: boolean }) {
  return (
    <span className={cn('table-head-pill', active && 'active')}>
      <span className="table-head-pill-prefix">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
    </span>
  )
}

function formatSelectedMonthsLabel(selectedMonths: string[] | null, allMonths: string[]): string {
  if (!selectedMonths || selectedMonths.length === 0) {
    return '全部账期'
  }

  if (selectedMonths.length === 1) {
    return formatMonth(selectedMonths[0])
  }

  const years = Array.from(new Set(selectedMonths.map((month) => month.slice(0, 4))))
  if (years.length === 1) {
    const yearMonths = allMonths.filter((month) => month.startsWith(`${years[0]}-`))
    if (yearMonths.length === selectedMonths.length) {
      return `${years[0]}年（全年）`
    }
    return `${years[0]}年 · ${selectedMonths.length}个月`
  }

  return `已选 ${selectedMonths.length} 个月`
}

function MultiSelectFilterPopover({
  title,
  triggerLabel,
  triggerActive,
  searchPlaceholder,
  emptyText,
  selectedValues,
  options,
  clearLabel,
  onChange,
}: MultiSelectFilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return options
    }

    return options.filter((option) => `${option.value} ${option.keywords ?? ''}`.toLowerCase().includes(query))
  }, [options, search])

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])

  const toggleValue = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }

    onChange([...selectedValues, value])
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setSearch('') }}>
      <PopoverTrigger asChild>
        <button type="button" className="table-head-pill-button" title={title}>
          <HeaderPillButton label={triggerLabel} active={triggerActive} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="table-filter-popover" align="start">
        <div className="table-filter-popover-head">
          <strong>{title}</strong>
          {selectedValues.length > 0 ? (
            <button type="button" className="table-filter-clear" onClick={() => onChange([])}>
              {clearLabel}
            </button>
          ) : null}
        </div>
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {filteredOptions.map((option) => (
              <CommandItem key={option.value} value={option.value} onSelect={() => toggleValue(option.value)}>
                <Check className={cn('h-3.5 w-3.5 shrink-0', selectedSet.has(option.value) ? 'opacity-100' : 'opacity-0')} />
                <div className="table-filter-option-label">{option.renderLabel}</div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function AmountFilterPopover({
  amountFilter,
  onAmountFilterChange,
}: {
  amountFilter: AmountFilterValue
  onAmountFilterChange: (value: AmountFilterValue) => void
}) {
  const options: Array<{ value: AmountFilterValue; label: string }> = [
    { value: 'all', label: '全部金额' },
    { value: 'income', label: '仅收入' },
    { value: 'expense', label: '仅支出' },
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="table-head-pill-button" title="金额筛选">
          <HeaderPillButton label="金额" active={amountFilter !== 'all'} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="table-filter-popover table-filter-popover-compact" align="start">
        <div className="table-filter-popover-head">
          <strong>金额</strong>
        </div>
        <div className="table-filter-radio-list">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn('table-filter-radio-item', amountFilter === option.value && 'active')}
              onClick={() => onAmountFilterChange(option.value)}
            >
              <span>{option.label}</span>
              {amountFilter === option.value ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TransactionTable({
  selectedRowIds,
  tableRows,
  uncategorizedCount,
  toolbarMetrics,
  analysisFocusLabel,
  amountFilter,
  onAmountFilterChange,
  categoryFilters,
  onCategoryFiltersChange,
  hasActiveFilters,
  onClearTableFilters,
  months,
  selectedMonths,
  onChangeMonths,
  onImportClick,
  onManualClick,
  onExportBackup,
  onRestoreClick,
  onOpenGuide,
  onClearAnalysisFocus,
  onLinkMirrorsBatch,
  linkMirrorsDisabled,
  linkMirrorsTitle,
  onUnlinkMirrorsBatch,
  unlinkMirrorsDisabled,
  unlinkMirrorsTitle,
  onDeleteBatch,
  tableBodyRef,
  onTableScroll,
  loadedRows,
  virtualTotalHeight,
  virtualTopOffset,
  virtualRows,
  flashRowId,
  rowHeight,
  getTransactionSourceClassName,
  isCategorizedLeafTransaction,
  onToggleRow,
  renderLifecycleBadge,
  onJumpToAccrualLinkedTransaction,
  onOpenAccrualSettlementReview,
  onClearAccrualSettlement,
  onJumpToLinkedTransaction,
  onJumpToSettlement,
  categoryOptions,
  onSetSingleCategory,
  onSetAmountSpread,
  emptyStateText,
}: {
  selectedRowIds: string[]
  tableRows: Transaction[]
  uncategorizedCount: number
  toolbarMetrics: ToolbarMetric[]
  analysisFocusLabel: string | null
  amountFilter: AmountFilterValue
  onAmountFilterChange: (value: AmountFilterValue) => void
  categoryFilters: string[]
  onCategoryFiltersChange: (value: string[]) => void
  hasActiveFilters: boolean
  onClearTableFilters: () => void
  months: string[]
  selectedMonths: string[] | null
  onChangeMonths: (months: string[] | null) => void
  onImportClick: () => void
  onManualClick: () => void
  onExportBackup: () => void
  onRestoreClick: () => void
  onOpenGuide: () => void
  onClearAnalysisFocus: () => void
  onLinkMirrorsBatch: () => void
  linkMirrorsDisabled: boolean
  linkMirrorsTitle: string
  onUnlinkMirrorsBatch: () => void
  unlinkMirrorsDisabled: boolean
  unlinkMirrorsTitle: string
  onDeleteBatch: () => void
  tableBodyRef: RefObject<HTMLDivElement | null>
  onTableScroll: UIEventHandler<HTMLDivElement>
  loadedRows: Transaction[]
  virtualTotalHeight: number
  virtualTopOffset: number
  virtualRows: Transaction[]
  flashRowId: string
  rowHeight: number
  getTransactionSourceClassName: (source: Transaction['source']) => string
  isCategorizedLeafTransaction: (row: Transaction) => boolean
  onToggleRow: (id: string) => void
  renderLifecycleBadge: (row: Transaction) => ReactNode
  onJumpToAccrualLinkedTransaction: (row: Transaction) => void
  onOpenAccrualSettlementReview: (row: Transaction) => void
  onClearAccrualSettlement: (row: Transaction) => void
  onJumpToLinkedTransaction: (row: Transaction) => void
  onJumpToSettlement: (row: Transaction) => void
  categoryOptions: CategoryOption[]
  onSetSingleCategory: (id: string, categoryPath: string) => void
  onSetAmountSpread: (id: string, value: string, unit: AmountSpreadUnit) => void
  emptyStateText: string
}) {
  const monthSummary = formatSelectedMonthsLabel(selectedMonths, months)

  const activeSummaryChips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (selectedMonths) {
    activeSummaryChips.push({ key: 'months', label: monthSummary, onRemove: () => onChangeMonths(null) })
  }
  if (amountFilter !== 'all') {
    activeSummaryChips.push({
      key: 'amount',
      label: amountFilter === 'income' ? '仅收入' : '仅支出',
      onRemove: () => onAmountFilterChange('all'),
    })
  }
  if (categoryFilters.length > 0) {
    categoryFilters.slice(0, 2).forEach((value) => {
      const leafLabel = value.split('/').at(-1) ?? value
      activeSummaryChips.push({
        key: `category:${value}`,
        label: `分类 · ${leafLabel}`,
        onRemove: () => onCategoryFiltersChange(categoryFilters.filter((item) => item !== value)),
      })
    })
    if (categoryFilters.length > 2) {
      activeSummaryChips.push({ key: 'category:more', label: `分类 +${categoryFilters.length - 2}`, onRemove: () => onCategoryFiltersChange([]) })
    }
  }

  const categoryPopoverOptions = [
    {
      value: '未分类',
      keywords: '未分类 uncategorized',
      renderLabel: <span className="text-[hsl(var(--muted-foreground))]">未分类</span>,
    },
    ...categoryOptions.map((option) => ({
      value: option.path,
      keywords: option.path,
      renderLabel: <CategoryBreadcrumb path={option.path} />,
    })),
  ]

  const tableStats: ToolbarMetric[] = [
    {
      key: 'view',
      label: '当前视图',
      value: `${tableRows.length} 条`,
      detail: <><span>已选 {selectedRowIds.length} 条</span><span>未分类 {uncategorizedCount} 条</span></>,
      tone: 'neutral',
    },
    ...toolbarMetrics,
  ]

  return (
    <motion.article
      className="panel-card panel-card-table"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <section className="table-section">
        <div className="table-wrap">
          <div className="table-toolbar">
            <div className="table-toolbar-main">
              <div className="table-toolbar-stats">
                {tableStats.map((metric) => (
                  <article key={metric.key} className={cn('table-toolbar-stat', `tone-${metric.tone}`)}>
                    <span className="table-toolbar-stat-label">{metric.label}</span>
                    <strong className="table-toolbar-stat-value">{metric.value}</strong>
                    <span className="table-toolbar-stat-detail">{metric.detail}</span>
                  </article>
                ))}
              </div>
              <div className="table-toolbar-summary">
                {analysisFocusLabel ? (
                  <span className="table-focus-inline">
                    <span className="table-focus-inline-label">当前聚焦</span>
                    <strong>{analysisFocusLabel}</strong>
                    <span>点击主图其他位置可切换聚焦，或手动清除。</span>
                  </span>
                ) : null}
                {activeSummaryChips.map((chip) => (
                  <button key={chip.key} type="button" className="table-summary-chip" onClick={chip.onRemove}>
                    <span>{chip.label}</span>
                    <X className="h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            <div className="table-toolbar-actions">
              <div className="table-toolbar-action-group table-toolbar-action-group-primary" aria-label="导入、录入与备份操作">
                <Button variant="default" size="icon" title="选择文件并导入" aria-label="选择文件并导入" onClick={onImportClick}>
                  <Upload className="h-3.5 w-3.5" />
                </Button>
                <Button variant="secondary" size="icon" title="手动录入应付或应得" aria-label="手动录入应付或应得" onClick={onManualClick}>
                  <SquarePen className="h-3.5 w-3.5" />
                </Button>
                <Button variant="secondary" size="icon" title="导出备份" aria-label="导出备份" onClick={onExportBackup}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button variant="secondary" size="icon" title="恢复备份" aria-label="恢复备份" onClick={onRestoreClick}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>

              {hasActiveFilters || analysisFocusLabel ? (
                <div className="table-toolbar-action-group table-toolbar-action-group-context" aria-label="当前上下文操作">
                  {hasActiveFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="table-toolbar-focus-button"
                      onClick={onClearTableFilters}
                    >
                      清空筛选
                    </Button>
                  ) : null}
                  {analysisFocusLabel ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="table-toolbar-focus-button"
                      onClick={onClearAnalysisFocus}
                    >
                      <X className="h-3.5 w-3.5" />
                      清除聚焦
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="table-toolbar-action-group table-toolbar-action-group-danger" aria-label="镜像与删除操作">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={onLinkMirrorsBatch}
                  disabled={linkMirrorsDisabled}
                  title={linkMirrorsTitle}
                  aria-label="手动关联镜像"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={onUnlinkMirrorsBatch}
                  disabled={unlinkMirrorsDisabled}
                  title={unlinkMirrorsTitle}
                  aria-label="解除镜像关联"
                >
                  <Unlink2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onDeleteBatch}
                  disabled={selectedRowIds.length === 0}
                  title="删除选中项"
                  aria-label="删除选中项"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="table-toolbar-action-group table-toolbar-action-group-utility" aria-label="帮助操作">
                <Button variant="ghost" size="icon" title="打开操作指南" aria-label="打开操作指南" onClick={onOpenGuide}>
                  <CircleHelp className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <div className="table-head-row">
            <div className="table-head-cell">
              <PeriodPicker
                selectedMonths={selectedMonths}
                onChangeMonths={onChangeMonths}
                months={months}
                size="sm"
                className={cn('table-head-period-trigger', selectedMonths && 'active')}
                triggerLabel="日期"
              />
            </div>
            <div className="table-head-cell table-head-cell-summary">
              <div className="table-head-summary-tools">
                <span className="table-head-inline-copy">内容</span>
                <MultiSelectFilterPopover
                  title="分类筛选"
                  triggerLabel="分类"
                  triggerActive={categoryFilters.length > 0}
                  searchPlaceholder="搜索分类…"
                  emptyText="无匹配分类"
                  selectedValues={categoryFilters}
                  options={categoryPopoverOptions}
                  clearLabel="清空分类"
                  onChange={onCategoryFiltersChange}
                />
              </div>
            </div>
            <div className="table-head-cell">
              <AmountFilterPopover amountFilter={amountFilter} onAmountFilterChange={onAmountFilterChange} />
            </div>
          </div>
          <div ref={tableBodyRef} className="table-virtual-body" onScroll={onTableScroll}>
            {loadedRows.length > 0 ? (
              <div style={{ position: 'relative', height: `${virtualTotalHeight}px` }}>
                <div style={{ transform: `translateY(${virtualTopOffset}px)` }}>
                  {virtualRows.map((row) => {
                    const actionNodes: ReactNode[] = []
                    const lifecycleBadge = renderLifecycleBadge(row)

                    if (lifecycleBadge) {
                      actionNodes.push(<span key="lifecycle">{lifecycleBadge}</span>)
                    }

                    if (row.accrualLinkedTransactionId) {
                      actionNodes.push(
                        <button key="accrual-linked" type="button" className="row-link-btn" onClick={() => onJumpToAccrualLinkedTransaction(row)}>
                          查看结转
                        </button>,
                      )
                    }

                    if (row.recordKind === 'accrual' && row.accrualStatus === 'open') {
                      actionNodes.push(
                        <button key="accrual-open" type="button" className="row-link-btn" onClick={() => onOpenAccrualSettlementReview(row)}>
                          候选结转
                        </button>,
                      )
                    }

                    if (row.recordKind === 'accrual' && row.accrualStatus === 'settled') {
                      actionNodes.push(
                        <button key="accrual-settled" type="button" className="row-link-btn" onClick={() => onClearAccrualSettlement(row)}>
                          解除结转
                        </button>,
                      )
                    }

                    if (row.linkedTransactionId) {
                      actionNodes.push(
                        <button key="linked-transaction" type="button" className="row-link-btn" onClick={() => onJumpToLinkedTransaction(row)}>
                          查看关联
                        </button>,
                      )
                    }

                    if (row.eventType === 'authorization' && row.settlementStatus === 'linked') {
                      actionNodes.push(
                        <button key="settlement" type="button" className="row-link-btn" onClick={() => onJumpToSettlement(row)}>
                          查看结算
                        </button>,
                      )
                    }

                    const amountSpreadDraft: AmountSpreadDraft = {
                      value: row.amountSpreadValue ?? '',
                      unit: row.amountSpreadUnit ?? 'day',
                    }
                    const amountSpreadSummary = getSpreadSummary(row.amount, amountSpreadDraft)

                    return (
                      <div
                        className={cn(
                          'table-data-row',
                          getTransactionSourceClassName(row.source),
                          flashRowId === row.id && 'row-flash',
                          isCategorizedLeafTransaction(row) ? 'row-categorized' : 'row-uncategorized',
                        )}
                        key={row.id}
                        style={{ minHeight: rowHeight }}
                      >
                        <span className="row-select-date-cell">
                          <button
                            type="button"
                            className={cn('row-date-pill', selectedRowIds.includes(row.id) && 'selected')}
                            onClick={() => onToggleRow(row.id)}
                            title={row.dayKey}
                            aria-label={selectedRowIds.includes(row.id) ? `取消选择 ${row.dayKey}` : `选择 ${row.dayKey}`}
                          >
                            {formatCompactDate(row.dayKey)}
                          </button>
                        </span>
                        <span className="row-summary-cell">
                          <span className="row-summary-scroll" title={row.item || row.type || row.note || '-'}>
                            <span className="row-summary">{row.item || row.type || row.note || '-'}</span>
                          </span>
                          <CategoryCombobox
                            value={row.primaryCategory || ''}
                            onValueChange={(value) => onSetSingleCategory(row.id, value)}
                            options={categoryOptions}
                            direction={row.direction}
                            source={row.source}
                            placeholder="选择分类"
                            allowClear
                            emptyState="attention"
                            size="sm"
                            variant="rail"
                            className={cn(
                              'row-category-inline-control',
                              isCategorizedLeafTransaction(row) ? 'category-combobox-categorized' : 'category-combobox-uncategorized',
                            )}
                            railAddon={actionNodes.length > 0 ? <span className="row-summary-actions">{actionNodes}</span> : undefined}
                          />
                        </span>
                        <span className={cn('money-cell', row.direction === 'income' ? 'money in' : 'money out')}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn('money-trigger', amountSpreadSummary && 'has-spread')}
                                title="设置摊销时间"
                              >
                                <span className="money-primary">{row.direction === 'income' ? '+' : '-'}¥{formatMoney(row.amount)}</span>
                                {amountSpreadSummary ? <span className="money-spread">{amountSpreadSummary.label}</span> : null}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="money-spread-popover" align="end">
                              <div className="money-spread-panel">
                                <div className="money-spread-head">
                                  <strong>金额摊算</strong>
                                  <span>按 30 天/月、365 天/年折算为日均金额</span>
                                </div>
                                <div className="money-spread-controls">
                                  <Input
                                    value={amountSpreadDraft.value}
                                    onChange={(event) => {
                                      const nextValue = event.target.value.replace(/[^\d.]/g, '')
                                      onSetAmountSpread(row.id, nextValue, amountSpreadDraft.unit)
                                    }}
                                    inputMode="decimal"
                                    placeholder="输入时长"
                                  />
                                  <Select
                                    value={amountSpreadDraft.unit}
                                    onValueChange={(value) => {
                                      onSetAmountSpread(row.id, amountSpreadDraft.value, value as AmountSpreadUnit)
                                    }}
                                  >
                                    <SelectTrigger>
                                      <span>{AMOUNT_SPREAD_UNIT_LABEL[amountSpreadDraft.unit]}</span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="day">天数</SelectItem>
                                      <SelectItem value="month">月数</SelectItem>
                                      <SelectItem value="year">年数</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="money-spread-result">
                                  {amountSpreadSummary ? (
                                    <>
                                      <strong>{amountSpreadSummary.label}</strong>
                                      <span>{amountSpreadSummary.detail}</span>
                                    </>
                                  ) : (
                                    <span>输入时长后，将在金额旁显示按日摊算结果。</span>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-state">{emptyStateText}</div>
            )}
          </div>
        </div>
      </section>
    </motion.article>
  )
}