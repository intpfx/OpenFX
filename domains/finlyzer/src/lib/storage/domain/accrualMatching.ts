import type { Transaction } from '../../../types/transaction'

export type AccrualSettlementReason = {
  code: 'amount' | 'remark' | 'category' | 'time'
  label: string
  detail?: string
}

export type AccrualSettlementRemarkEvidence = {
  label: string
  accrualFieldLabel: string
  accrualValue: string
  cashFieldLabel: string
  cashValue: string
  matchedFragments: string[]
}

export type AccrualSettlementCandidate = {
  cashTransaction: Transaction
  score: number
  reasons: string[]
  reasonDetails: AccrualSettlementReason[]
  remarkEvidence: AccrualSettlementRemarkEvidence | null
  dayGap: number
}

export function mapAccrualCategoryToCashCategory(categoryPath: string, direction: Transaction['direction']): string {
  if (!categoryPath || categoryPath === '未分类') {
    return direction === 'expense' ? '支出/已付支出' : '收入/已得收入'
  }

  if (direction === 'expense') {
    return categoryPath.replace('支出/应付支出', '支出/已付支出')
  }

  return categoryPath.replace('收入/应得收入', '收入/已得收入')
}

function normalizeRemarkText(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase()
}

type RemarkField = {
  label: string
  raw: string
  normalized: string
  fragments: string[]
}

function extractRemarkFields(tx: Transaction): RemarkField[] {
  return [
    { label: '备注', value: tx.note },
    { label: '内容', value: tx.item },
    { label: '类型', value: tx.type },
  ]
    .map(({ label, value }) => {
      const raw = value.trim()
      return {
        label,
        raw,
        normalized: normalizeRemarkText(raw),
        fragments: buildRemarkFragments(raw),
      }
    })
    .filter((field) => field.normalized)
}

function buildRemarkFragments(value: string): string[] {
  const compact = normalizeRemarkText(value)
  if (!compact) {
    return []
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  if (tokens.length === 0) {
    return [compact]
  }

  return Array.from(new Set([...tokens, compact]))
}

function getSharedFragments(left: RemarkField, right: RemarkField): string[] {
  const rightSet = new Set(right.fragments)
  return left.fragments.filter((fragment) => rightSet.has(fragment))
}

function pickDisplayFragments(left: RemarkField, right: RemarkField): string[] {
  const shared = getSharedFragments(left, right)
    .filter((fragment) => fragment.length >= 2)
    .sort((prev, next) => next.length - prev.length)

  if (shared.length > 0) {
    return shared.slice(0, 3)
  }

  const fallback = left.normalized.length <= right.normalized.length ? left.raw.trim() : right.raw.trim()
  return fallback ? [fallback] : []
}

function getRemarkMatch(accrual: Transaction, cash: Transaction): { score: number; reason: string; evidence: AccrualSettlementRemarkEvidence } | null {
  const accrualFields = extractRemarkFields(accrual)
  const cashFields = extractRemarkFields(cash)

  if (accrualFields.length === 0 || cashFields.length === 0) {
    return null
  }

  for (const left of accrualFields) {
    for (const right of cashFields) {
      if (left.normalized === right.normalized) {
        const matchedFragments = pickDisplayFragments(left, right)
        return {
          score: 12,
          reason: '备注完全命中',
          evidence: {
            label: '备注完全命中',
            accrualFieldLabel: left.label,
            accrualValue: left.raw,
            cashFieldLabel: right.label,
            cashValue: right.raw,
            matchedFragments,
          },
        }
      }

      if (
        left.normalized.length >= 3
        && right.normalized.length >= 3
        && (left.normalized.includes(right.normalized) || right.normalized.includes(left.normalized))
      ) {
        const matchedFragments = pickDisplayFragments(left, right)
        return {
          score: 9,
          reason: '备注高度接近',
          evidence: {
            label: '备注高度接近',
            accrualFieldLabel: left.label,
            accrualValue: left.raw,
            cashFieldLabel: right.label,
            cashValue: right.raw,
            matchedFragments,
          },
        }
      }

      const shared = getSharedFragments(left, right)
      if (shared.length > 0) {
        const matchedFragments = shared
          .filter((fragment) => fragment.length >= 2)
          .sort((prev, next) => next.length - prev.length)
          .slice(0, 3)

        return {
          score: 7,
          reason: `备注片段命中（${matchedFragments[0] ?? shared[0]}）`,
          evidence: {
            label: '备注片段命中',
            accrualFieldLabel: left.label,
            accrualValue: left.raw,
            cashFieldLabel: right.label,
            cashValue: right.raw,
            matchedFragments,
          },
        }
      }
    }
  }

  return null
}

export function getManualAccrualCandidate(accrual: Transaction, cash: Transaction): AccrualSettlementCandidate | null {
  if (accrual.source !== 'manual' || accrual.recordKind !== 'accrual' || accrual.accrualStatus !== 'open') {
    return null
  }

  if (cash.recordKind !== 'cash' || cash.direction !== accrual.direction || cash.amount !== accrual.amount) {
    return null
  }

  const timeGap = Math.abs(new Date(cash.timestamp).getTime() - new Date(accrual.timestamp).getTime())
  if (!Number.isFinite(timeGap)) {
    return null
  }

  const dayGap = Math.round(timeGap / (1000 * 60 * 60 * 24))
  const reasonDetails: AccrualSettlementReason[] = [
    { code: 'amount', label: '金额与方向一致' },
  ]
  let score = 10

  const remarkMatch = getRemarkMatch(accrual, cash)
  if (!remarkMatch) {
    return null
  }
  reasonDetails.push({ code: 'remark', label: remarkMatch.reason })
  score += remarkMatch.score

  reasonDetails.push({ code: 'time', label: `相隔${dayGap}天` })

  const mappedCashCategory = mapAccrualCategoryToCashCategory(accrual.primaryCategory, cash.direction)
  if (cash.primaryCategory && cash.primaryCategory !== '未分类' && cash.primaryCategory === mappedCashCategory) {
    reasonDetails.push({ code: 'category', label: '分类路径一致' })
    score += 4
  }

  return {
    cashTransaction: cash,
    score,
    reasons: reasonDetails.map((reason) => reason.label),
    reasonDetails,
    remarkEvidence: remarkMatch.evidence,
    dayGap,
  }
}
