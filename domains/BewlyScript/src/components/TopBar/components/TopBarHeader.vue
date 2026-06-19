<script setup lang="ts">
import { settings } from '~/logic'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import TopBarLogo from './TopBarLogo.vue'
import TopBarRight from './TopBarRight.vue'
import TopBarSearch from './TopBarSearch.vue'

defineProps<{
  reachTop: boolean
  isDark: boolean
}>()

const { forceWhiteIcon, handleNotificationsItemClick } = useTopBarInteraction()
</script>

<template>
  <main
    class="top-bar-header"
    max-w="$bew-page-max-width"
    p="x-12" m-auto
    h="$bew-top-bar-height"
  >
    <!-- Top bar mask -->
    <Transition name="fade">
      <div
        v-if="!reachTop && settings.enableFrostedGlass"
        style="
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 1), rgba(0, 0, 0, 1) 24px, rgba(0, 0, 0, 0.9) 44px, transparent);
        "
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height"
        pointer-events-none
        :style="{
          backgroundColor: settings.enableFrostedGlass ? 'transparent' : 'var(--bew-bg)',
          opacity: settings.enableFrostedGlass ? 1 : 0.9,
          backdropFilter: settings.enableFrostedGlass ? 'blur(12px)' : 'none',
        }"
      />
    </Transition>

    <div
      pos="absolute top-0 left-0" w-full
      pointer-events-none opacity-100 duration-300
      :style="{
        background: `linear-gradient(to bottom, ${
          forceWhiteIcon
            ? 'rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4) calc(var(--bew-top-bar-height) / 2)'
            : 'color-mix(in oklab, var(--bew-bg), transparent 20%), color-mix(in oklab, var(--bew-bg), transparent 40%) calc(var(--bew-top-bar-height) / 2)'
        }, transparent)`,
        opacity: reachTop ? 0.8 : 1,
        height: 'var(--bew-top-bar-height)',
      }"
    />

    <!-- Top bar theme color gradient -->
    <Transition name="fade">
      <div
        v-if="settings.showTopBarThemeColorGradient && !forceWhiteIcon && reachTop && isDark"
        pos="absolute top-0 left-0" w-full h="$bew-top-bar-height" pointer-events-none
        :style="{ background: 'linear-gradient(to bottom, var(--bew-theme-color-10), transparent)' }"
      />
    </Transition>

    <div class="top-bar-header__side top-bar-header__side--left">
      <TopBarLogo :force-white-icon="forceWhiteIcon" />
    </div>

    <!-- search bar -->
    <div
      class="top-bar-header__search"
    >
      <TopBarSearch />
    </div>

    <div id="top-bar-home-tabs-slot" class="top-bar-header__home-tabs" />

    <!-- right content -->
    <div class="top-bar-header__side top-bar-header__side--right">
      <TopBarRight
        @notifications-click="handleNotificationsItemClick"
      />
    </div>
  </main>
</template>

<style scoped lang="scss">
.top-bar-header {
  display: grid;
  grid-template-columns: auto minmax(320px, 560px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
}

.top-bar-header__side {
  display: flex;
  align-items: center;
  min-width: 0;
}

.top-bar-header__side--left {
  justify-self: start;
}

.top-bar-header__side--right {
  justify-self: end;
}

.top-bar-header__search {
  display: flex;
  justify-content: flex-start;
  min-width: 0;
}

.top-bar-header__home-tabs {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1280px) {
  .top-bar-header {
    grid-template-columns: auto minmax(240px, 1fr) auto;
  }

  .top-bar-header__home-tabs {
    display: none;
  }
}

@media (max-width: 700px) {
  .top-bar-header {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    padding-inline: 10px;
  }

  .top-bar-header__side--left,
  .top-bar-header__home-tabs,
  .top-bar-header__side--right {
    display: none;
  }

  .top-bar-header__search {
    justify-content: stretch;
    width: 100%;
  }
}
</style>
