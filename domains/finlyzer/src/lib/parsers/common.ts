import type { TransactionDirection } from '../../types/transaction'
import { centsToYuanNumber, parseMoneyToCents } from '../money'

export function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\uFEFF/g, '').trim()
}

export function parseAmount(value: unknown): number {
  return parseMoneyToCents(value)
}

export function normalizeDirection(value: unknown, fallbackAmount: number): TransactionDirection {
  const text = normalizeText(value)
  if (/收|入账|收入/.test(text)) {
    return 'income'
  }
  if (/支|出账|支出/.test(text)) {
    return 'expense'
  }
  return fallbackAmount < 0 ? 'expense' : 'income'
}

export function toIsoTimestamp(raw: string): string {
  const text = normalizeText(raw)
  const normalized = text.replace(/\//g, '-')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toISOString()
}

export function toMonthKey(isoTimestamp: string): string {
  if (!isoTimestamp) {
    return ''
  }
  return isoTimestamp.slice(0, 7)
}

export function toDayKey(isoTimestamp: string): string {
  if (!isoTimestamp) {
    return ''
  }
  return isoTimestamp.slice(0, 10)
}

export function buildFingerprint(input: {
  timestamp: string
  amount: number
  counterparty: string
  orderId: string
}): string {
  const timestamp = input.timestamp.slice(0, 19)
  const amount = centsToYuanNumber(input.amount).toFixed(2)
  const counterparty = normalizeText(input.counterparty).toLowerCase()
  const orderId = normalizeText(input.orderId).toLowerCase()
  return `${timestamp}|${amount}|${counterparty}|${orderId}`
}

export function getField(row: Record<string, unknown>, aliases: string[]): string {
  for (const key of aliases) {
    if (key in row) {
      const value = normalizeText(row[key])
      if (value) {
        return value
      }
    }
  }
  return ''
}

export function locateHeaderLine(lines: string[], keywords: string[]): number {
  return lines.findIndex((line) => {
    return keywords.every((keyword) => line.includes(keyword))
  })
}

export function decodeFileBuffer(buffer: ArrayBuffer): string {
  const encodings = ['utf-8', 'gb18030', 'gbk']
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false })
      const text = decoder.decode(buffer)
      if (text.includes('交易') || text.includes('支付')) {
        return text
      }
    } catch {
      // Ignore unsupported encoding and continue fallback attempts.
    }
  }
  return new TextDecoder('utf-8').decode(buffer)
}
