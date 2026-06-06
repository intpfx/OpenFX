import type { Transaction } from '../../../types/transaction'

export function normalizeMatchText(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase()
}

export function extractLinkTokens(tx: Transaction): string[] {
  const fields = [tx.orderId, tx.merchantOrderId, tx.note, tx.item]
  const tokens = new Set<string>()

  for (const field of fields) {
    const normalized = normalizeMatchText(field)
    if (!normalized) {
      continue
    }

    if (normalized.length >= 16) {
      tokens.add(normalized)
    }

    const digitMatches = normalized.match(/\d{16,}/g) ?? []
    for (const matched of digitMatches) {
      tokens.add(matched)
    }
  }

  return Array.from(tokens)
}

export function haveIntersectingTokens(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) {
    return false
  }

  const rightSet = new Set(right)
  return left.some((token) => rightSet.has(token))
}
