import type { Transaction } from '../../../types/transaction'
import { db } from '../db'
import {
  getManualAccrualCandidate,
  mapAccrualCategoryToCashCategory,
  type AccrualSettlementCandidate,
} from '../domain/accrualMatching'

export type { AccrualSettlementCandidate } from '../domain/accrualMatching'

export async function createManualCommitment(input: {
  dateKey: string
  direction: Transaction['direction']
  amount: number
  item: string
  note: string
  primaryCategory: string
}): Promise<Transaction> {
  const id = `manual:${crypto.randomUUID()}`
  const timestamp = `${input.dateKey}T00:00:00.000Z`
  const accrualType = input.direction === 'expense' ? 'payable' : 'receivable'

  const transaction: Transaction = {
    id,
    fingerprint: id,
    source: 'manual',
    eventType: 'normal',
    settlementStatus: 'normal',
    recordKind: 'accrual',
    accrualType,
    accrualStatus: 'open',
    accrualLinkedTransactionId: '',
    relatedOrderId: '',
    linkedTransactionId: '',
    linkGroupId: '',
    countInAnalytics: false,
    timestamp,
    monthKey: input.dateKey.slice(0, 7),
    dayKey: input.dateKey,
    direction: input.direction,
    amount: input.amount,
    amountSpreadValue: '',
    amountSpreadUnit: 'day',
    counterparty: '',
    account: '',
    item: input.item,
    type: '',
    method: 'manual',
    status: '',
    orderId: '',
    merchantOrderId: '',
    note: input.note,
    primaryCategory: input.primaryCategory,
  }

  await db.transactions.put(transaction)
  return transaction
}

export async function getAccrualSettlementCandidates(
  accrualId: string,
  limit = 8,
): Promise<{ accrual: Transaction | null; candidates: AccrualSettlementCandidate[] }> {
  const accrual = await db.transactions.get(accrualId)
  if (!accrual || accrual.recordKind !== 'accrual') {
    return { accrual: null, candidates: [] }
  }

  const allTransactions = await db.transactions.toArray()
  const candidates = allTransactions
    .filter((row) => row.id !== accrual.id && row.recordKind === 'cash' && !row.accrualLinkedTransactionId)
    .map((row) => getManualAccrualCandidate(accrual, row))
    .filter((item): item is AccrualSettlementCandidate => item !== null)
    .sort((left, right) => right.score - left.score || left.dayGap - right.dayGap || left.cashTransaction.timestamp.localeCompare(right.cashTransaction.timestamp))
    .slice(0, limit)

  return { accrual, candidates }
}

export async function confirmAccrualSettlement(accrualId: string, cashId: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const [accrual, cash] = await Promise.all([
      db.transactions.get(accrualId),
      db.transactions.get(cashId),
    ])

    if (!accrual || accrual.source !== 'manual' || accrual.recordKind !== 'accrual') {
      throw new Error('未找到可结转的承诺记录。')
    }
    if (!cash || cash.recordKind !== 'cash') {
      throw new Error('未找到可结转的真实流水。')
    }
    if (accrual.accrualStatus === 'settled' && accrual.accrualLinkedTransactionId !== cash.id) {
      throw new Error('该承诺记录已与其他流水结转，请先解除原结转。')
    }
    if (cash.accrualLinkedTransactionId && cash.accrualLinkedTransactionId !== accrual.id) {
      throw new Error('该真实流水已结转到其他承诺记录。')
    }

    const candidate = getManualAccrualCandidate(accrual, cash)
    if (!candidate) {
      throw new Error('这两条记录不满足结转条件，请检查方向、金额和备注线索。')
    }

    await db.transactions.update(accrual.id, {
      accrualStatus: 'settled',
      accrualLinkedTransactionId: cash.id,
    })
    await db.transactions.update(cash.id, {
      accrualLinkedTransactionId: accrual.id,
      primaryCategory:
        cash.primaryCategory && cash.primaryCategory !== '未分类'
          ? cash.primaryCategory
          : mapAccrualCategoryToCashCategory(accrual.primaryCategory, cash.direction),
    })
  })
}

export async function clearAccrualSettlement(accrualId: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const accrual = await db.transactions.get(accrualId)
    if (!accrual || accrual.source !== 'manual' || accrual.recordKind !== 'accrual') {
      throw new Error('未找到承诺记录。')
    }

    const linkedId = accrual.accrualLinkedTransactionId
    if (!linkedId) {
      throw new Error('该承诺记录尚未结转。')
    }

    await db.transactions.update(accrual.id, {
      accrualStatus: 'open',
      accrualLinkedTransactionId: '',
    })

    const linkedCash = await db.transactions.get(linkedId)
    if (linkedCash?.accrualLinkedTransactionId === accrual.id) {
      await db.transactions.update(linkedCash.id, {
        accrualLinkedTransactionId: '',
      })
    }
  })
}