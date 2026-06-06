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

const HEADER_KEYWORDS = ['交易时间', '交易类型', '交易对方', '收/支', '金额']

function parseRows(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/)
  const headerLine = locateHeaderLine(lines, HEADER_KEYWORDS)
  if (headerLine < 0) {
    throw new Error('未找到微信账单表头，请确认导出格式')
  }

  const csvContent = lines.slice(headerLine).join('\n')
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeText(header),
  })

  if (parsed.errors.length > 0) {
    throw new Error(`微信账单解析失败: ${parsed.errors[0].message}`)
  }

  return parsed.data
}

export function parseWeChat(content: string): ParsedFileResult {
  const rows = parseRows(content)
  const failures: ParsedFileResult['failures'] = []
  const transactions: Transaction[] = []

  rows.forEach((row, index) => {
    const timestamp = toIsoTimestamp(getField(row, ['交易时间']))
    const amountText = normalizeText(getField(row, ['金额(元)', '金额']))
    const rawAmount = Number(amountText.replace(/[¥,\s]/g, ''))
    const amount = parseAmount(amountText)
    const direction = normalizeDirection(getField(row, ['收/支']), rawAmount)
    const counterparty = getField(row, ['交易对方']) || '未知对象'
    const orderId = getField(row, ['交易单号', '交易订单号'])
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
      source: 'wechat',
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
      account: '',
      item: getField(row, ['商品', '商品名称']),
      type: getField(row, ['交易类型']),
      method: getField(row, ['支付方式']),
      status: getField(row, ['当前状态', '交易状态']),
      orderId,
      merchantOrderId: getField(row, ['商户单号', '商家订单号']),
      note: getField(row, ['备注']),
      primaryCategory: '未分类',
    })
  })

  return {
    source: 'wechat',
    transactions,
    failures,
  }
}
