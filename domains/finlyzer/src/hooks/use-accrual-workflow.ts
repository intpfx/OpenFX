import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  clearAccrualSettlement,
  confirmAccrualSettlement,
  createManualCommitment,
  getAccrualSettlementCandidates,
  type AccrualSettlementCandidate,
} from '../lib/storage/repositories'
import {
  getAccrualRootPath,
  getDirectionByEntryType,
  getManualEntryTypeByCategoryPath,
  isManualOnlyCategoryPath,
  type CategoryOption,
} from '../lib/categoryTree'
import { parseMoneyToCents } from '../lib/money'
import type { Transaction } from '../types/transaction'

export type AccrualSettlementReviewState = {
  open: boolean
  loading: boolean
  submitting: boolean
  accrual: Transaction | null
  candidates: AccrualSettlementCandidate[]
}

type OpenConfirmFn = (
  title: string,
  description: string,
  onConfirm: () => Promise<void>,
  dangerous?: boolean,
) => void

type UseAccrualWorkflowInput = {
  categoryOptions: CategoryOption[]
  refreshData: () => Promise<void>
  setImportNote: Dispatch<SetStateAction<string>>
}

export function useAccrualWorkflow({
  categoryOptions,
  refreshData,
  setImportNote,
}: UseAccrualWorkflowInput) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualAmount, setManualAmount] = useState('')
  const [manualContent, setManualContent] = useState('')
  const [manualCategoryPath, setManualCategoryPath] = useState('')
  const [settlementReview, setSettlementReview] = useState<AccrualSettlementReviewState>({
    open: false,
    loading: false,
    submitting: false,
    accrual: null,
    candidates: [],
  })

  const manualCategoryOptions = useMemo(() => {
    return categoryOptions.filter((option) => isManualOnlyCategoryPath(option.path))
  }, [categoryOptions])

  useEffect(() => {
    const defaultPath = getAccrualRootPath('payable')
    const nextValue = manualCategoryOptions.find((option) => option.path === manualCategoryPath)
      ? manualCategoryPath
      : (manualCategoryOptions[0]?.path ?? defaultPath)
    setManualCategoryPath(nextValue)
  }, [manualCategoryOptions, manualCategoryPath])

  const resetManualDialog = useCallback(() => {
    setManualDate(new Date().toISOString().slice(0, 10))
    setManualAmount('')
    setManualContent('')
    setManualCategoryPath(getAccrualRootPath('payable'))
  }, [])

  const handleCreateManualCommitment = useCallback(async () => {
    const amount = parseMoneyToCents(manualAmount)
    const nextContent = manualContent.trim()
    if (!manualDate || !Number.isFinite(amount) || amount <= 0 || !nextContent) {
      setImportNote('请完整填写手动录入的分类、记录内容、日期和正数金额。')
      return
    }

    const entryType = getManualEntryTypeByCategoryPath(manualCategoryPath)
    const fallbackCategory = getAccrualRootPath(entryType)
    const nextCategoryPath = manualCategoryOptions.some((option) => option.path === manualCategoryPath)
      ? manualCategoryPath
      : fallbackCategory

    const nextDirection = getDirectionByEntryType(entryType)

    await createManualCommitment({
      dateKey: manualDate,
      direction: nextDirection,
      amount,
      item: nextContent,
      note: nextContent,
      primaryCategory: nextCategoryPath,
    })

    await refreshData()
    setManualDialogOpen(false)
    resetManualDialog()
    setImportNote(entryType === 'payable' ? '已新增一条应付支出记录。' : '已新增一条应得收入记录。')
  }, [manualAmount, manualCategoryOptions, manualCategoryPath, manualContent, manualDate, refreshData, resetManualDialog, setImportNote])

  const openAccrualSettlementReview = useCallback(async (row: Transaction) => {
    if (row.recordKind !== 'accrual' || row.accrualStatus !== 'open') {
      setImportNote('仅未结转的承诺记录支持人工确认结转。')
      return
    }

    setSettlementReview({
      open: true,
      loading: true,
      submitting: false,
      accrual: row,
      candidates: [],
    })

    try {
      const result = await getAccrualSettlementCandidates(row.id)
      if (!result.accrual) {
        setSettlementReview({ open: false, loading: false, submitting: false, accrual: null, candidates: [] })
        setImportNote('未找到该承诺记录，可能已被删除。')
        return
      }

      setSettlementReview({
        open: true,
        loading: false,
        submitting: false,
        accrual: result.accrual,
        candidates: result.candidates,
      })
      setImportNote(result.candidates.length > 0 ? '已生成候选结转列表。' : '暂未找到金额和备注都匹配的候选流水。')
    } catch (error) {
      setSettlementReview({ open: false, loading: false, submitting: false, accrual: null, candidates: [] })
      const message = error instanceof Error ? error.message : '生成候选结转列表时发生异常。'
      setImportNote(message)
    }
  }, [setImportNote])

  const handleConfirmAccrualSettlement = useCallback(async (candidate: AccrualSettlementCandidate) => {
    if (!settlementReview.accrual) {
      return
    }

    setSettlementReview((prev) => ({ ...prev, submitting: true }))
    try {
      await confirmAccrualSettlement(settlementReview.accrual.id, candidate.cashTransaction.id)
      await refreshData()
      setSettlementReview({ open: false, loading: false, submitting: false, accrual: null, candidates: [] })
      setImportNote(`已确认结转：${settlementReview.accrual.dayKey} → ${candidate.cashTransaction.dayKey}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认结转时发生异常。'
      setSettlementReview((prev) => ({ ...prev, submitting: false }))
      setImportNote(message)
    }
  }, [refreshData, setImportNote, settlementReview.accrual])

  const handleClearAccrualSettlement = useCallback((row: Transaction, openConfirm: OpenConfirmFn) => {
    openConfirm(
      '解除承诺结转',
      '这会取消该承诺记录与真实流水之间的结转关联，但不会删除任何流水或自动回滚分类。',
      async () => {
        await clearAccrualSettlement(row.id)
        await refreshData()
        setImportNote('已解除该承诺记录的结转关联。')
      },
      false,
    )
  }, [refreshData, setImportNote])

  return {
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
  }
}
