import Papa from 'papaparse'
import type { ParsedFileResult, Transaction } from '../../types/transaction'
import {
  buildFingerprint,
  getField,
  locateHeaderLine,
  normalizeDirection,
  normalizeText,
  parseAmount,
  toDayKey,
  toIsoTimestamp,
  toMonthKey,
} from './common'

const HEADER_KEYWORDS = ['交易日期', '交易时间', '交易金额', '本次余额', '对方户名', '交易摘要']

function parseRows(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/)
  const headerLine = locateHeaderLine(lines, HEADER_KEYWORDS)
  if (headerLine < 0) {
    throw new Error('未找到银行流水表头，请确认导出格式')
  }

  const csvContent = lines.slice(headerLine).join('\n')
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeText(header),
  })

  if (parsed.errors.length > 0) {
    throw new Error(`银行流水解析失败: ${parsed.errors[0].message}`)
  }

  return parsed.data
}

function extractSourceAccount(content: string): string {
  const lines = content.split(/\r?\n/).map((line) => normalizeText(line))
  const accountLine = lines.find((line) => line.includes('账户：'))
  if (!accountLine) {
    return ''
  }

  const matched = accountLine.match(/账户：([^\s,，]+)/)
  return normalizeText(matched?.[1])
}

function buildBankTimestamp(dateText: string, timeText: string): string {
  const date = normalizeText(dateText)
  const time = normalizeText(timeText)
  if (!date) {
    return ''
  }

  return toIsoTimestamp(time ? `${date} ${time}` : date)
}

function extractBankOrderId(row: Record<string, unknown>): string {
  const candidates = [
    getField(row, ['交易用途']),
    getField(row, ['交易摘要']),
    getField(row, ['对方账号']),
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const matched = candidate.match(/\d{16,}/)
    if (matched) {
      return matched[0]
    }
  }

  return ''
}

export function parseBank(content: string): ParsedFileResult {
  const rows = parseRows(content)
  const failures: ParsedFileResult['failures'] = []
  const transactions: Transaction[] = []
  const sourceAccount = extractSourceAccount(content)

  rows.forEach((row, index) => {
    const timestamp = buildBankTimestamp(
      getField(row, ['交易日期']),
      getField(row, ['交易时间']),
    )
    const amountText = normalizeText(getField(row, ['交易金额']))
    const rawAmount = Number(amountText.replace(/[¥,\s]/g, ''))
    const amount = parseAmount(amountText)
    const direction = normalizeDirection('', rawAmount)
    const counterparty = getField(row, ['对方户名']) || getField(row, ['对方账号']) || '未知对象'
    const orderId = extractBankOrderId(row)
    const hasValidAmount = amountText.length > 0 && Number.isFinite(rawAmount)

    if (!timestamp || !hasValidAmount) {
      failures.push({
        rowNumber: index + 1,
        reason: '时间或金额无效',
        raw: JSON.stringify(row),
      })
      return
    }

    const fingerprint = buildFingerprint({ timestamp, amount, counterparty, orderId })

    transactions.push({
      id: fingerprint,
      fingerprint,
      source: 'bank',
      eventType: 'normal',
      settlementStatus: 'normal',
      recordKind: 'cash',
      accrualType: 'none',
      accrualStatus: 'none',
      accrualLinkedTransactionId: '',
      relatedOrderId: '',
      linkedTransactionId: '',
      linkGroupId: '',
      countInAnalytics: true,
      timestamp,
      monthKey: toMonthKey(timestamp),
      dayKey: toDayKey(timestamp),
      direction,
      amount,
      amountSpreadValue: '',
      amountSpreadUnit: 'day',
      counterparty,
      account: sourceAccount,
      item: getField(row, ['交易摘要']) || getField(row, ['交易用途']),
      type: getField(row, ['交易类型']),
      method: getField(row, ['交易渠道']),
      status: '',
      orderId,
      merchantOrderId: '',
      note: getField(row, ['交易用途']),
      primaryCategory: '未分类',
    })
  })

  return {
    source: 'bank',
    transactions,
    failures,
  }
}