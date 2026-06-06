import type { Transaction } from '../../types/transaction'

function shouldIncludeInAnalytics(tx: Transaction): boolean {
  return tx.eventType !== 'authorization' && tx.countInAnalytics !== false
}

function shouldIncludeInAccrualLayer(tx: Transaction): boolean {
  return tx.recordKind === 'accrual' && tx.accrualStatus === 'open'
}

export type MonthlyKpi = {
  income: number
  expense: number
  balance: number
  savingsRate: number
}

export type TrendPoint = {
  day: string
  income: number
  expense: number
  accrualIncome: number
  accrualExpense: number
}

export function getAvailableMonths(transactions: Transaction[]): string[] {
  return Array.from(new Set(transactions.map((item) => item.monthKey).filter(Boolean))).sort((a, b) => b.localeCompare(a))
}

export function computeMonthlyKpi(transactions: Transaction[], monthKey: string): MonthlyKpi {
  let income = 0
  let expense = 0
  for (const tx of transactions) {
    if (tx.monthKey !== monthKey) {
      continue
    }
    if (!shouldIncludeInAnalytics(tx)) {
      continue
    }
    if (tx.direction === 'income') {
      income += tx.amount
    } else {
      expense += tx.amount
    }
  }

  const balance = income - expense
  const savingsRate = income > 0 ? (balance / income) * 100 : 0

  return {
    income,
    expense,
    balance,
    savingsRate,
  }
}

export function computeTrendData(transactions: Transaction[]): TrendPoint[] {
  const buckets = new Map<string, TrendPoint>()
  const monthKeys = new Set(transactions.map((t) => t.monthKey).filter(Boolean))
  const multiMonth = monthKeys.size > 1

  for (const tx of transactions) {
    if (!shouldIncludeInAnalytics(tx)) {
      if (!shouldIncludeInAccrualLayer(tx)) {
        continue
      }
    }
    const key = multiMonth ? tx.monthKey : tx.dayKey.slice(8, 10)
    if (!buckets.has(key)) {
      buckets.set(key, { day: key, income: 0, expense: 0, accrualIncome: 0, accrualExpense: 0 })
    }
    const target = buckets.get(key)!
    if (shouldIncludeInAccrualLayer(tx)) {
      if (tx.direction === 'income') {
        target.accrualIncome += tx.amount
      } else {
        target.accrualExpense += tx.amount
      }
    } else if (tx.direction === 'income') {
      target.income += tx.amount
    } else {
      target.expense += tx.amount
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day))
}
