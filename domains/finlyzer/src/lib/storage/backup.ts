import type { BackupPayload, Transaction } from '../../types/transaction'
import { SCHEMA_VERSION, db } from './db'

function toStringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toBooleanField(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeBackupTransaction(raw: unknown): Transaction {
  const value = (raw && typeof raw === 'object') ? raw as Partial<Transaction> : {}
  return {
    id: toStringField(value.id),
    fingerprint: toStringField(value.fingerprint),
    source: (value.source === 'alipay' || value.source === 'wechat' || value.source === 'bank' || value.source === 'manual') ? value.source : 'manual',
    eventType: (value.eventType === 'normal' || value.eventType === 'authorization' || value.eventType === 'settlement') ? value.eventType : 'normal',
    settlementStatus: (value.settlementStatus === 'normal' || value.settlementStatus === 'pending' || value.settlementStatus === 'linked' || value.settlementStatus === 'closed') ? value.settlementStatus : 'normal',
    recordKind: (value.recordKind === 'cash' || value.recordKind === 'accrual') ? value.recordKind : 'cash',
    accrualType: (value.accrualType === 'none' || value.accrualType === 'payable' || value.accrualType === 'receivable') ? value.accrualType : 'none',
    accrualStatus: (value.accrualStatus === 'none' || value.accrualStatus === 'open' || value.accrualStatus === 'settled') ? value.accrualStatus : 'none',
    accrualLinkedTransactionId: toStringField(value.accrualLinkedTransactionId),
    relatedOrderId: toStringField(value.relatedOrderId),
    linkedTransactionId: toStringField(value.linkedTransactionId),
    linkGroupId: toStringField(value.linkGroupId),
    countInAnalytics: toBooleanField(value.countInAnalytics),
    timestamp: toStringField(value.timestamp),
    monthKey: toStringField(value.monthKey),
    dayKey: toStringField(value.dayKey),
    direction: value.direction === 'income' ? 'income' : 'expense',
    amount: toNumberField(value.amount),
    amountSpreadValue: toStringField(value.amountSpreadValue),
    amountSpreadUnit: (value.amountSpreadUnit === 'day' || value.amountSpreadUnit === 'month' || value.amountSpreadUnit === 'year') ? value.amountSpreadUnit : 'day',
    counterparty: toStringField(value.counterparty),
    account: toStringField(value.account),
    item: toStringField(value.item),
    type: toStringField(value.type),
    method: toStringField(value.method),
    status: toStringField(value.status),
    orderId: toStringField(value.orderId),
    merchantOrderId: toStringField(value.merchantOrderId),
    note: toStringField(value.note),
    primaryCategory: toStringField(value.primaryCategory),
  }
}

export async function exportBackup(): Promise<BackupPayload> {
  const [transactions, importJobs, categoryTreeRecord] = await Promise.all([
    db.transactions.toArray(),
    db.importJobs.toArray(),
    db.categoryTrees.get('default-tree'),
  ])

  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: transactions.map((transaction) => normalizeBackupTransaction(transaction)),
    importJobs,
    categoryTree: categoryTreeRecord?.tree ?? [],
  }
}

export function downloadBackup(payload: BackupPayload): void {
  const content = JSON.stringify(payload, null, 2)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const stamp = payload.exportedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  anchor.href = url
  anchor.download = `finlyzer-backup-${stamp}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(file: File): Promise<void> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Partial<BackupPayload>

  if (!parsed.version || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.importJobs)) {
    throw new Error('备份文件格式无效')
  }

  if (parsed.version !== SCHEMA_VERSION) {
    throw new Error('仅支持恢复当前版本导出的备份文件。')
  }

  const transactions = parsed.transactions.map((transaction) => normalizeBackupTransaction(transaction))
  const importJobs = parsed.importJobs
  const categoryTree = Array.isArray(parsed.categoryTree) ? parsed.categoryTree : []

  await db.transaction('rw', db.transactions, db.importJobs, db.categoryTrees, async () => {
    await db.transactions.clear()
    await db.importJobs.clear()
    await db.categoryTrees.clear()

    if (transactions.length) {
      await db.transactions.bulkPut(transactions)
    }
    if (importJobs.length) {
      await db.importJobs.bulkPut(importJobs)
    }
    if (categoryTree.length) {
      await db.categoryTrees.put({ id: 'default-tree', tree: categoryTree })
    }
  })
}
