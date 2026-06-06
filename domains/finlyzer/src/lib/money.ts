const MONEY_SCALE = 100

export function normalizeMoneyCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

export function parseMoneyToCents(value: unknown): number {
  const raw = String(value ?? '').replace(/\uFEFF/g, '').trim().replace(/[¥,\s]/g, '')
  if (!raw) {
    return 0
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * MONEY_SCALE) : 0
}

export function yuanToCents(value: number): number {
  return normalizeMoneyCents(value * MONEY_SCALE)
}

export function centsToYuanNumber(value: number): number {
  return normalizeMoneyCents(value) / MONEY_SCALE
}

export function formatYuanNumber(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function legacyYuanAmountToCents(value: number): number {
  return yuanToCents(value)
}