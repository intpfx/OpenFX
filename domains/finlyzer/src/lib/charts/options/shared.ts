export const palette = ['#0f766e', '#b45309', '#2563eb', '#7c3aed', '#be185d', '#0891b2', '#4d7c0f', '#dc2626']
export const divergingPalette = ['#b42318', '#f4d8d6', '#eef2f7', '#d4ece7', '#0f766e']
export const safeTooltipBase = {
  renderMode: 'richText' as const,
  confine: true,
  transitionDuration: 0,
}

export function getRobustMaxAbs(values: number[]): number {
  const absoluteValues = values
    .map((value) => Math.abs(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)

  if (absoluteValues.length === 0) {
    return 1
  }

  const percentileIndex = Math.min(
    absoluteValues.length - 1,
    Math.max(0, Math.floor((absoluteValues.length - 1) * 0.88)),
  )

  return Math.max(absoluteValues[percentileIndex], 1)
}
