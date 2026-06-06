import type { Transaction } from '../../types/transaction'

export type CategoryRatioRow = {
  id: string
  name: string
  fullPath: string
  value: number
  cashValue: number
  accrualValue: number
  children?: CategoryRatioRow[]
}

export function computeCategoryRatio(transactions: Transaction[]): CategoryRatioRow[] {
  const buckets: CategoryRatioRow[] = []

  const ensureNode = (nodes: CategoryRatioRow[], name: string, fullPath: string): CategoryRatioRow => {
    const existing = nodes.find((node) => node.name === name)
    if (existing) return existing

    const created: CategoryRatioRow = {
      id: fullPath,
      name,
      fullPath,
      value: 0,
      cashValue: 0,
      accrualValue: 0,
      children: [],
    }
    nodes.push(created)
    return created
  }

  for (const tx of transactions) {
    if (tx.eventType === 'authorization') {
      continue
    }

    const isCash = tx.countInAnalytics !== false
    const isAccrual = tx.recordKind === 'accrual' && tx.accrualStatus === 'open'
    if (!isCash && !isAccrual) {
      continue
    }

    const key = tx.primaryCategory || (tx.direction === 'income' ? '收入/未分类' : '支出/未分类')
    const parts = key.split('/').filter(Boolean)
    let currentLevel = buckets
    let currentPath = ''

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const node = ensureNode(currentLevel, part, currentPath)
      node.value += tx.amount
      if (isCash) {
        node.cashValue += tx.amount
      }
      if (isAccrual) {
        node.accrualValue += tx.amount
      }

      if (!node.children) {
        node.children = []
      }

      currentLevel = node.children
    }
  }

  const sortNodes = (nodes: CategoryRatioRow[]): CategoryRatioRow[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: node.children && node.children.length > 0 ? sortNodes(node.children) : undefined,
      }))
      .sort((a, b) => b.value - a.value)
  }

  return sortNodes(buckets)
}
