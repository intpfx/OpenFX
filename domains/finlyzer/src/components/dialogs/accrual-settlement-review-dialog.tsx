import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatMoney } from '@/lib/formatters'
import type { Transaction } from '@/types/transaction'
import type { AccrualSettlementCandidate } from '@/lib/storage/repositories'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(value: string, fragments: string[]) {
  const normalized = Array.from(new Set(fragments.map((fragment) => fragment.trim()).filter(Boolean)))
    .sort((left, right) => right.length - left.length)

  if (!value.trim() || normalized.length === 0) {
    return value.trim() || '未填写'
  }

  const pattern = normalized.map((fragment) => escapeRegExp(fragment)).join('|')
  if (!pattern) {
    return value.trim()
  }

  const lookup = new Set(normalized.map((fragment) => fragment.toLowerCase()))
  return value.split(new RegExp(`(${pattern})`, 'ig')).filter(Boolean).map((part, index) => {
    if (lookup.has(part.toLowerCase())) {
      return <mark key={`mark-${part}-${index}`} className="settlement-review-mark">{part}</mark>
    }

    return <Fragment key={`text-${part}-${index}`}>{part}</Fragment>
  })
}

function getReasonVariant(code: AccrualSettlementCandidate['reasonDetails'][number]['code']) {
  switch (code) {
    case 'amount':
      return 'success' as const
    case 'remark':
      return 'processing' as const
    case 'category':
      return 'partial' as const
    default:
      return 'outline' as const
  }
}

export function AccrualSettlementReviewDialog({
  open,
  loading,
  submitting,
  accrual,
  candidates,
  onOpenChange,
  onClose,
  onConfirmCandidate,
}: {
  open: boolean
  loading: boolean
  submitting: boolean
  accrual: Transaction | null
  candidates: AccrualSettlementCandidate[]
  onOpenChange: (open: boolean) => void
  onClose: () => void
  onConfirmCandidate: (candidate: AccrualSettlementCandidate) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>人工确认承诺结转</DialogTitle>
          <DialogDescription>从候选真实流水中选择一条，与这笔应付/应得记录建立结转关联，并查看系统命中的备注线索。</DialogDescription>
        </DialogHeader>
        <div className="settlement-review-shell">
          {accrual ? (
            <div className="settlement-review-accrual">
              <div>
                <strong>{accrual.item || '未填写摘要'}</strong>
                <span>备注线索：{accrual.note || '未填写'}</span>
              </div>
              <div>
                <Badge variant="processing">{accrual.accrualType === 'payable' ? '应付待结转' : '应得待结转'}</Badge>
                <span>{accrual.dayKey}</span>
                <strong>{accrual.direction === 'income' ? '+' : '-'}¥{formatMoney(accrual.amount)}</strong>
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="settlement-review-empty">正在生成候选列表...</div>
          ) : candidates.length > 0 ? (
            <div className="settlement-review-list">
              {candidates.map((candidate) => (
                <article className="settlement-review-item" key={candidate.cashTransaction.id}>
                  <div className="settlement-review-main">
                    <div className="settlement-review-title-row">
                      <strong>{candidate.cashTransaction.item || candidate.cashTransaction.type || candidate.cashTransaction.note || '未填写摘要'}</strong>
                      <Badge variant="secondary">{candidate.cashTransaction.source}</Badge>
                    </div>
                    <div className="settlement-review-meta">
                      <span>{candidate.cashTransaction.dayKey}</span>
                      <span>{candidate.cashTransaction.type || candidate.cashTransaction.note || '无备注线索'}</span>
                      <strong>{candidate.cashTransaction.direction === 'income' ? '+' : '-'}¥{formatMoney(candidate.cashTransaction.amount)}</strong>
                    </div>
                    <div className="settlement-review-reasons">
                      <Badge variant="success">匹配分 {candidate.score}</Badge>
                      {candidate.reasonDetails.map((reason) => (
                        <Badge key={`${candidate.cashTransaction.id}-${reason.code}-${reason.label}`} variant={getReasonVariant(reason.code)}>{reason.label}</Badge>
                      ))}
                    </div>
                    {candidate.remarkEvidence ? (
                      <div className="settlement-review-evidence">
                        <div className="settlement-review-evidence-head">
                          <span>命中线索</span>
                          <Badge variant="outline">{candidate.remarkEvidence.accrualFieldLabel}{' -> '}{candidate.remarkEvidence.cashFieldLabel}</Badge>
                        </div>
                        <div className="settlement-review-evidence-grid">
                          <div className="settlement-review-evidence-row">
                            <span>手动录入</span>
                            <p>{highlightText(candidate.remarkEvidence.accrualValue, candidate.remarkEvidence.matchedFragments)}</p>
                          </div>
                          <div className="settlement-review-evidence-row">
                            <span>候选流水</span>
                            <p>{highlightText(candidate.remarkEvidence.cashValue, candidate.remarkEvidence.matchedFragments)}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    disabled={submitting}
                    onClick={() => void onConfirmCandidate(candidate)}
                  >
                    确认结转
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <div className="settlement-review-empty">当前没有找到同时满足金额、方向和备注线索的候选真实流水。</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}