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

const HEADER_KEYWORDS = ['交易时间', '交易分类', '交易对方', '收/支', '金额']

function buildLinkKey(tx: Pick<Transaction, 'merchantOrderId' | 'orderId'>): string {
  return tx.merchantOrderId || tx.orderId
}

function applyAuthorizationLinks(transactions: Transaction[]): Transaction[] {
  const settlementByKey = new Map<string, Transaction>()

  for (const tx of transactions) {
    if (tx.amount <= 0 || tx.eventType === 'authorization') {
      continue
    }
    const key = buildLinkKey(tx)
    if (!key || settlementByKey.has(key)) {
      continue
    }
    settlementByKey.set(key, tx)
  }

  return transactions.map((tx) => {
    if (tx.eventType !== 'authorization') {
      return tx
    }

    const key = buildLinkKey(tx)
    const linked = key ? settlementByKey.get(key) : undefined
    if (!linked) {
      return tx
    }

    return {
      ...tx,
      settlementStatus: 'linked',
      relatedOrderId: linked.orderId,
    }
  })
}

function parseRows(content: string): Record<string, unknown>[] {
  const lines = content.split(/\r?\n/)
  const headerLine = locateHeaderLine(lines, HEADER_KEYWORDS)
  if (headerLine < 0) {
    throw new Error('未找到支付宝账单表头，请确认导出格式')
  }

  // Alipay appends a dashed separator followed by footnotes after the data rows.
  // Find that footer boundary so we only parse actual transaction rows.
  let endLine = lines.length
  for (let i = headerLine + 2; i < lines.length; i++) {
    if (/^-{4,}/.test(lines[i].replace(/,/g, '').trim())) {
      endLine = i
      break
    }
  }

  const csvContent = lines.slice(headerLine, endLine).join('\n')
  const parsed = Papa.parse<Record<string, unknown>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => normalizeText(header),
  })

  return parsed.data
}

export function parseAlipay(content: string): ParsedFileResult {
  const rows = parseRows(content)
  const failures: ParsedFileResult['failures'] = []
  const transactions: Transaction[] = []

  rows.forEach((row, index) => {
    const timestamp = toIsoTimestamp(getField(row, ['交易时间']))
    const amountText = normalizeText(getField(row, ['金额']))
    const rawAmount = Number(amountText.replace(/[¥,\s]/g, ''))
    const amount = parseAmount(amountText)
    const direction = normalizeDirection(getField(row, ['收/支']), rawAmount)
    const counterparty = getField(row, ['交易对方']) || '未知对象'
    const orderId = getField(row, ['交易订单号', '订单号'])
    const status = getField(row, ['交易状态'])
    const hasValidAmount = amountText.length > 0 && Number.isFinite(rawAmount)
    const isAuthorization = amount === 0
    const isClosed = /关闭|失败|撤销/.test(status)

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
      source: 'alipay',
      eventType: isAuthorization ? 'authorization' : 'normal',
      settlementStatus: isAuthorization ? (isClosed ? 'closed' : 'pending') : 'normal',
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
      account: getField(row, ['对方账号']),
      item: getField(row, ['商品说明']),
      type: getField(row, ['交易分类']),
      method: getField(row, ['收/付款方式', '付款方式']),
      status,
      orderId,
      merchantOrderId: getField(row, ['商家订单号']),
      note: getField(row, ['备注']),
      primaryCategory: '未分类',
    })
  })

  const linkedTransactions = applyAuthorizationLinks(transactions)

  const linkedSettlementOrderIds = new Set(
    linkedTransactions
      .filter((tx) => tx.eventType === 'authorization' && tx.relatedOrderId)
      .map((tx) => tx.relatedOrderId),
  )

  const normalizedTransactions = linkedTransactions.map((tx) => {
    if (tx.eventType !== 'normal' || !linkedSettlementOrderIds.has(tx.orderId)) {
      return tx
    }

    return {
      ...tx,
      eventType: 'settlement' as const,
    }
  })

  return {
    source: 'alipay',
    transactions: normalizedTransactions,
    failures,
  }
}
