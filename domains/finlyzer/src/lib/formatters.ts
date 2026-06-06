import { centsToYuanNumber, formatYuanNumber, normalizeMoneyCents } from './money'

export function formatMoney(value: number): string {
  return formatYuanNumber(centsToYuanNumber(value))
}

export function formatCompactMoney(value: number): string {
  const cents = normalizeMoneyCents(value)
  const absYuan = Math.abs(centsToYuanNumber(cents))
  if (absYuan >= 10000) {
    return `${cents < 0 ? '-' : ''}${(absYuan / 10000).toFixed(absYuan >= 100000 ? 0 : 1)}万`
  }
  return `${cents < 0 ? '-' : ''}${absYuan.toLocaleString('zh-CN', { maximumFractionDigits: absYuan >= 1000 ? 0 : 2 })}`
}

export function formatMonth(month: string): string {
  if (!month) return '-'
  const [year, mon] = month.split('-')
  return `${year}年${mon}月`
}

export function formatCompactDate(dateKey: string): string {
  if (!dateKey) return '-'
  const [year = '', month = '', day = ''] = dateKey.split('-')
  return `${year.slice(2)}/${month}/${day}`
}

export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}