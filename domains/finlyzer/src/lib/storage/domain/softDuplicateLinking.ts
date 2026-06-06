import type { Transaction } from '../../../types/transaction'
import { extractLinkTokens, haveIntersectingTokens } from './transactionMatch'

function hasExactTimestampAmountMatch(left: Transaction, right: Transaction): boolean {
  const leftTime = new Date(left.timestamp).getTime()
  const rightTime = new Date(right.timestamp).getTime()
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return false
  }

  return left.amount === right.amount && leftTime === rightTime
}

function getGroupRows(seed: Transaction, allRows: Transaction[], updates: Map<string, Transaction>): Transaction[] {
  const currentSeed = updates.get(seed.id) ?? seed
  const groupId = currentSeed.linkGroupId
  if (!groupId) {
    return [currentSeed]
  }

  return allRows
    .map((row) => updates.get(row.id) ?? row)
    .filter((row) => row.linkGroupId === groupId)
}

function normalizeGroup(rows: Transaction[]): Transaction[] {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.id, row])).values())
  if (uniqueRows.length <= 1) {
    return uniqueRows
  }

  const primary = uniqueRows.reduce((best, candidate) => pickPrimaryRecord(best, candidate))
  const mirrors = uniqueRows.filter((row) => row.id !== primary.id)
  const linkGroupId = uniqueRows.find((row) => row.linkGroupId)?.linkGroupId || crypto.randomUUID()

  return uniqueRows.map((row) => {
    const counterpart = row.id === primary.id ? (mirrors[0]?.id ?? '') : primary.id
    return {
      ...row,
      linkGroupId,
      linkedTransactionId: counterpart,
      countInAnalytics: row.id === primary.id,
      primaryCategory: row.primaryCategory || primary.primaryCategory,
    }
  })
}

function isSoftDuplicateCandidate(left: Transaction, right: Transaction): boolean {
  const bankLeft = left.source === 'bank'
  const bankRight = right.source === 'bank'
  if (bankLeft === bankRight) {
    return false
  }

  if (hasExactTimestampAmountMatch(left, right)) {
    return true
  }

  if (left.direction !== right.direction || left.amount !== right.amount) {
    return false
  }

  const timeGap = Math.abs(new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
  if (!Number.isFinite(timeGap) || timeGap > 1000 * 60 * 60 * 24 * 2) {
    return false
  }

  const leftTokens = extractLinkTokens(left)
  const rightTokens = extractLinkTokens(right)
  return haveIntersectingTokens(leftTokens, rightTokens)
}

function pickPrimaryRecord(left: Transaction, right: Transaction): Transaction {
  if (left.source === 'bank' && right.source !== 'bank') {
    return right
  }
  if (right.source === 'bank' && left.source !== 'bank') {
    return left
  }
  return left.timestamp <= right.timestamp ? left : right
}

export function applySoftDuplicateLinks(existingRows: Transaction[], importedRows: Transaction[]): {
  importedRows: Transaction[]
  existingRows: Transaction[]
} {
  if (importedRows.length === 0) {
    return { importedRows, existingRows: [] }
  }

  const byId = new Map<string, Transaction>()
  for (const row of existingRows) {
    byId.set(row.id, row)
  }
  for (const row of importedRows) {
    byId.set(row.id, row)
  }

  const importedIds = new Set(importedRows.map((row) => row.id))
  const allRows = Array.from(byId.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const updates = new Map<string, Transaction>()

  for (const imported of importedRows) {
    const currentImported = updates.get(imported.id) ?? byId.get(imported.id) ?? imported
    if (currentImported.linkGroupId) {
      continue
    }

    const match = allRows.find((candidate) => {
      if (candidate.id === currentImported.id) {
        return false
      }
      if (!isSoftDuplicateCandidate(currentImported, candidate)) {
        return false
      }
      return true
    })

    if (!match) {
      continue
    }

    const currentMatch = updates.get(match.id) ?? byId.get(match.id) ?? match
    const normalizedGroup = normalizeGroup([
      currentImported,
      ...getGroupRows(currentMatch, allRows, updates),
    ])
    normalizedGroup.forEach((row) => {
      updates.set(row.id, row)
    })
  }

  return {
    importedRows: Array.from(importedIds).map((id) => updates.get(id) ?? byId.get(id)!).filter(Boolean),
    existingRows: existingRows
      .map((row) => updates.get(row.id))
      .filter((row): row is Transaction => Boolean(row)),
  }
}
