import type { CSSProperties } from 'vue'
import { computed } from 'vue'

import { settings } from '~/logic'

export function useGridLayout() {
  const gridCssVars = computed<CSSProperties>(() => ({
    '--grid-cols-base': settings.value.gridColumns.base,
    '--grid-cols-sm': settings.value.gridColumns.sm,
    '--grid-cols-md': settings.value.gridColumns.md,
    '--grid-cols-lg': settings.value.gridColumns.lg,
    '--grid-cols-xl': settings.value.gridColumns.xl,
    '--grid-cols-xxl': settings.value.gridColumns.xxl,
  }))

  const gridClass = computed((): string => 'grid-adaptive')

  return { gridClass, gridCssVars }
}
