<template>
  <div
    w="full"
    min-h="46px"
    p="y-8"
    flex="~"
    justify="center"
    items="center"
  >
    <span class="bew-css-loading-spinner" aria-hidden="true" />
    {{ $t('common.loading') }}
  </div>
</template>

<style scoped lang="scss">
.bew-css-loading-spinner {
  width: 46px;
  height: 46px;
  margin-right: 0.5rem;
  border: 3px solid var(--bew-fill-3);
  border-top-color: var(--bew-theme-color);
  border-radius: 999px;
  animation: bew-css-loading-spin 0.85s linear infinite;
}

@keyframes bew-css-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
