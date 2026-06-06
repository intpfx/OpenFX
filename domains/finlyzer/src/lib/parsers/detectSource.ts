import type { TransactionSource } from '../../types/transaction'

const ALIPAY_MARKERS = ['支付宝交易', '交易分类', '交易对方', '收/支', '交易订单号']
const WECHAT_MARKERS = ['微信支付账单', '交易类型', '交易对方', '收/支', '交易单号']
const BANK_MARKERS = ['账户明细查询', '交易日期', '交易金额', '本次余额', '交易摘要']

function score(markers: string[], text: string): number {
  return markers.reduce((acc, marker) => (text.includes(marker) ? acc + 1 : acc), 0)
}

export function detectSourceFromText(text: string): TransactionSource | null {
  const alipayScore = score(ALIPAY_MARKERS, text)
  const wechatScore = score(WECHAT_MARKERS, text)
  const bankScore = score(BANK_MARKERS, text)
  const bestScore = Math.max(alipayScore, wechatScore, bankScore)

  if (bestScore === 0) {
    return null
  }

  if (bankScore === bestScore) {
    return 'bank'
  }

  return alipayScore >= wechatScore ? 'alipay' : 'wechat'
}
