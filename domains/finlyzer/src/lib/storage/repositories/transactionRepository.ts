import type { AmountSpreadUnit, Transaction } from '../../../types/transaction'
import { db } from '../db'

function pickMirrorPrimaryRecord(left: Transaction, right: Transaction): Transaction {
  if (left.source === 'bank' && right.source !== 'bank') {
    return right
  }
  if (right.source === 'bank' && left.source !== 'bank') {
    return left
  }
  return left.timestamp <= right.timestamp ? left : right
}

function normalizeMirrorGroup(rows: Transaction[]): Transaction[] {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values())
  if (uniqueRows.length <= 1) {
    return uniqueRows
  }

  const primary = uniqueRows.reduce((best, candidate) => pickMirrorPrimaryRecord(best, candidate))
  const mirrors = uniqueRows.filter((row) => row.id !== primary.id)
  const linkGroupId = uniqueRows.find((row) => row.linkGroupId)?.linkGroupId || crypto.randomUUID()
  const sharedCategory = primary.primaryCategory || uniqueRows.find((row) => row.primaryCategory)?.primaryCategory || ''

  return uniqueRows.map((row) => ({
    ...row,
    linkGroupId,
    linkedTransactionId: row.id === primary.id ? (mirrors[0]?.id ?? '') : primary.id,
    countInAnalytics: row.id === primary.id,
    primaryCategory: row.primaryCategory || sharedCategory,
  }))
}

function collectMirrorGroup(row: Transaction, byId: Map<string, Transaction>): Transaction[] {
  if (row.linkGroupId) {
    return Array.from(byId.values()).filter((item) => item.linkGroupId === row.linkGroupId)
  }

  if (row.linkedTransactionId) {
    const counterpart = byId.get(row.linkedTransactionId)
    return counterpart ? [row, counterpart] : [row]
  }

  return [row]
}

function clearMirrorGroup(rows: Transaction[]): Transaction[] {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values())
  return uniqueRows.map((row) => ({
    ...row,
    linkGroupId: '',
    linkedTransactionId: '',
    countInAnalytics: true,
  }))
}

export async function getAllTransactions(): Promise<Transaction[]> {
  return db.transactions.orderBy('timestamp').reverse().toArray()
}

export async function deleteTransactionById(id: string): Promise<void> {
  await db.transactions.delete(id)
}

export async function deleteTransactionsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return
  }
  await db.transactions.bulkDelete(ids)
}

export async function setCategoryForTransactions(ids: string[], categoryPath: string): Promise<void> {
  if (ids.length === 0) {
    return
  }
  await db.transaction('rw', db.transactions, async () => {
    const allRows = await db.transactions.toArray()
    const idsToUpdate = new Set<string>()

    for (const id of ids) {
      const row = allRows.find((item) => item.id === id)
      if (!row) {
        continue
      }

      idsToUpdate.add(row.id)

      if (row.linkGroupId) {
        allRows
          .filter((item) => item.linkGroupId === row.linkGroupId)
          .forEach((item) => idsToUpdate.add(item.id))
        continue
      }

      if (row.linkedTransactionId) {
        idsToUpdate.add(row.linkedTransactionId)
      }
    }

    for (const id of idsToUpdate) {
      await db.transactions.update(id, { primaryCategory: categoryPath })
    }
  })
}

export async function linkTransactionsAsMirrors(ids: string[]): Promise<number> {
  const uniqueIds = Array.from(new Set(ids))
  if (uniqueIds.length < 2) {
    return 0
  }

  return db.transaction('rw', db.transactions, async () => {
    const allRows = await db.transactions.toArray()
    const byId = new Map(allRows.map((row) => [row.id, row]))
    const rowsToNormalize = new Map<string, Transaction>()

    for (const id of uniqueIds) {
      const row = byId.get(id)
      if (!row) {
        continue
      }

      collectMirrorGroup(row, byId).forEach((item) => {
        rowsToNormalize.set(item.id, item)
      })
    }

    if (rowsToNormalize.size < 2) {
      return 0
    }

    const normalizedRows = normalizeMirrorGroup(Array.from(rowsToNormalize.values()))

    for (const row of normalizedRows) {
      await db.transactions.update(row.id, {
        linkGroupId: row.linkGroupId,
        linkedTransactionId: row.linkedTransactionId,
        countInAnalytics: row.countInAnalytics,
        primaryCategory: row.primaryCategory,
      })
    }

    return normalizedRows.length
  })
}

export async function unlinkTransactionsFromMirrors(ids: string[]): Promise<number> {
  const uniqueIds = Array.from(new Set(ids))
  if (uniqueIds.length === 0) {
    return 0
  }

  return db.transaction('rw', db.transactions, async () => {
    const allRows = await db.transactions.toArray()
    const byId = new Map(allRows.map((row) => [row.id, row]))
    const rowsToClear = new Map<string, Transaction>()

    for (const id of uniqueIds) {
      const row = byId.get(id)
      if (!row || (!row.linkGroupId && !row.linkedTransactionId)) {
        continue
      }

      collectMirrorGroup(row, byId).forEach((item) => {
        rowsToClear.set(item.id, item)
      })
    }

    if (rowsToClear.size === 0) {
      return 0
    }

    const clearedRows = clearMirrorGroup(Array.from(rowsToClear.values()))

    for (const row of clearedRows) {
      await db.transactions.update(row.id, {
        linkGroupId: row.linkGroupId,
        linkedTransactionId: row.linkedTransactionId,
        countInAnalytics: row.countInAnalytics,
      })
    }

    return clearedRows.length
  })
}

export async function updateTransactionAmountSpread(id: string, input: { value: string; unit: AmountSpreadUnit }): Promise<void> {
  await db.transactions.update(id, {
    amountSpreadValue: input.value,
    amountSpreadUnit: input.unit,
  })
}