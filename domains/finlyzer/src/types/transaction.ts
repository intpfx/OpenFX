export type TransactionSource = 'alipay' | 'wechat' | 'bank' | 'manual'

export type TransactionDirection = 'income' | 'expense'

export type TransactionEventType = 'normal' | 'authorization' | 'settlement'

export type TransactionSettlementStatus = 'normal' | 'pending' | 'linked' | 'closed'

export type TransactionRecordKind = 'cash' | 'accrual'

export type TransactionAccrualType = 'none' | 'payable' | 'receivable'

export type TransactionAccrualStatus = 'none' | 'open' | 'settled'

export type AmountSpreadUnit = 'day' | 'month' | 'year'

export type Transaction = {
  id: string
  fingerprint: string
  source: TransactionSource
  eventType: TransactionEventType
  settlementStatus: TransactionSettlementStatus
  recordKind: TransactionRecordKind
  accrualType: TransactionAccrualType
  accrualStatus: TransactionAccrualStatus
  accrualLinkedTransactionId: string
  relatedOrderId: string
  linkedTransactionId: string
  linkGroupId: string
  countInAnalytics?: boolean
  timestamp: string
  monthKey: string
  dayKey: string
  direction: TransactionDirection
  amount: number
  amountSpreadValue: string
  amountSpreadUnit: AmountSpreadUnit
  counterparty: string
  account: string
  item: string
  type: string
  method: string
  status: string
  orderId: string
  merchantOrderId: string
  note: string
  primaryCategory: string
}

export type ImportFailure = {
  fileName: string
  rowNumber: number
  reason: string
  raw: string
}

export type ParsedFileResult = {
  source: TransactionSource
  transactions: Transaction[]
  failures: Omit<ImportFailure, 'fileName'>[]
}

export type ImportSummary = {
  totalRows: number
  validRows: number
  duplicateRows: number
  failedRows: number
  failures: ImportFailure[]
  sources: TransactionSource[]
}

export type ImportJob = {
  id: string
  createdAt: string
  fileNames: string[]
  summary: ImportSummary
}

export type CategoryNode = {
  id: string
  name: string
  locked?: boolean
  children: CategoryNode[]
}

export type BackupPayload = {
  version: number
  exportedAt: string
  transactions: Transaction[]
  importJobs: ImportJob[]
  categoryTree: CategoryNode[]
}
