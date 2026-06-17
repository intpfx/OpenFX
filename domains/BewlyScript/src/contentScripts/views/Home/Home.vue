<script setup lang="ts">
import { useThrottleFn } from '@vueuse/core'

import { useBewlyApp } from '~/composables/useAppProvider'
import { OVERLAY_SCROLL_BAR_SCROLL, TOP_BAR_VISIBILITY_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import type { HomeTab } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { isMobileUserscriptRuntimePage } from '~/userscript/mobile'
import emitter from '~/utils/mitt'

import { HomeSubPage } from './types'

const mainStore = useMainStore()
const { handleBackToTop, homeActivatedPage, homeActivatedPageTouched, mainAppRef } = useBewlyApp()
const handleThrottledBackToTop = useThrottleFn((targetScrollTop: number = 0) => handleBackToTop(targetScrollTop), 1000)

// ✅ 性能优化：缓存 scrollTop 值，避免重复 DOM 读取
const cachedScrollTop = ref(0)

// 使用全局的homeActivatedPage状态
const activatedPage = homeActivatedPage
const pages = computed(() => ({
  [HomeSubPage.ForYou]: defineAsyncComponent(() => import('./components/ForYou.vue')),
  [HomeSubPage.Following]: settings.value.useFollowingNewLayout
    ? defineAsyncComponent(() => import('./components/Following.vue'))
    : defineAsyncComponent(() => import('./components/FollowingOld.vue')),
  [HomeSubPage.SubscribedSeries]: defineAsyncComponent(() => import('./components/SubscribedSeries.vue')),
  [HomeSubPage.Trending]: defineAsyncComponent(() => import('./components/Trending.vue')),
  [HomeSubPage.Ranking]: defineAsyncComponent(() => import('./components/Ranking.vue')),
  [HomeSubPage.Precious]: defineAsyncComponent(() => import('./components/Precious.vue')),
  [HomeSubPage.Weekly]: defineAsyncComponent(() => import('./components/Weekly.vue')),
  [HomeSubPage.Live]: defineAsyncComponent(() => import('./components/Live.vue')),
}))
const tabContentLoading = ref<boolean>(false)
const currentTabs = ref<HomeTab[]>([])
const tabPageRef = ref()
const topBarVisibility = ref<boolean>(true)
const topBarHomeTabsTarget = ref<HTMLElement | null>(null)
const topBarHomeTabsTargetAttempts = ref(0)
const TOP_BAR_HOME_TABS_TARGET_MAX_ATTEMPTS = 20
const shouldShowHomeTabs = computed(() => currentTabs.value.length > 1)
const isMobileUserscriptPage = isMobileUserscriptRuntimePage()
const showInlineHomeTabs = computed(() => {
  if (!shouldShowHomeTabs.value)
    return false
  if (topBarHomeTabsTarget.value)
    return false
  return isMobileUserscriptPage || topBarHomeTabsTargetAttempts.value >= TOP_BAR_HOME_TABS_TARGET_MAX_ATTEMPTS
})
let topBarHomeTabsTargetTimer: ReturnType<typeof setTimeout> | null = null

// 使用deep监听
watch(() => settings.value.homePageTabVisibilityList, () => {
  syncCurrentTabs()
}, { deep: true })

function handleOverlayScroll(scrollTop: number) {
  cachedScrollTop.value = scrollTop
}

function handleTopBarVisibilityChange(visible: boolean) {
  topBarVisibility.value = visible
}

function computeTabs(): HomeTab[] {
  // if homePageTabVisibilityList not fresh , set it to default
  if (!settings.value.homePageTabVisibilityList.length || settings.value.homePageTabVisibilityList.length !== mainStore.homeTabs.length)
    settings.value.homePageTabVisibilityList = mainStore.homeTabs.map(tab => ({ page: tab.page, visible: tab.page !== HomeSubPage.Precious }))

  const targetTabs: HomeTab[] = []

  for (const tab of settings.value.homePageTabVisibilityList) {
    if (tab.visible) {
      targetTabs.push({
        i18nKey: (mainStore.homeTabs.find(defaultTab => defaultTab.page === tab.page) || {})?.i18nKey || tab.page,
        page: tab.page,
      })
    }
  }

  return targetTabs
}

function syncCurrentTabs() {
  const nextTabs = computeTabs()
  currentTabs.value = nextTabs

  const fallbackPage = nextTabs[0]?.page || mainStore.homeTabs[0].page
  if (!nextTabs.some(tab => tab.page === activatedPage.value)) {
    activatedPage.value = fallbackPage
    homeActivatedPage.value = fallbackPage
  }
}

function syncTopBarHomeTabsTarget() {
  topBarHomeTabsTarget.value = mainAppRef.value?.querySelector('#top-bar-home-tabs-slot') as HTMLElement | null
  if (topBarHomeTabsTarget.value || topBarHomeTabsTargetAttempts.value >= TOP_BAR_HOME_TABS_TARGET_MAX_ATTEMPTS)
    return

  topBarHomeTabsTargetAttempts.value += 1
  if (topBarHomeTabsTargetTimer)
    clearTimeout(topBarHomeTabsTargetTimer)
  topBarHomeTabsTargetTimer = setTimeout(syncTopBarHomeTabsTarget, 50)
}

onMounted(() => {
  nextTick(() => {
    syncTopBarHomeTabsTarget()
  })
  requestAnimationFrame(syncTopBarHomeTabsTarget)

  // ✅ 性能优化：订阅滚动事件以缓存 scrollTop，避免后续 DOM 读取
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
  emitter.on(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)

  syncCurrentTabs()
})

onUnmounted(() => {
  if (topBarHomeTabsTargetTimer) {
    clearTimeout(topBarHomeTabsTargetTimer)
    topBarHomeTabsTargetTimer = null
  }

  emitter.off(TOP_BAR_VISIBILITY_CHANGE, handleTopBarVisibilityChange)
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleOverlayScroll)
})

function handleChangeTab(tab: HomeTab) {
  homeActivatedPageTouched.value = true

  if (activatedPage.value === tab.page) {
    // ✅ 性能优化：使用缓存的 scrollTop，避免 DOM 读取
    const scrollTop = cachedScrollTop.value

    if (scrollTop > 0) {
      handleThrottledBackToTop(0)
    }
    else {
      if (tabContentLoading.value)
        return
      if (tabPageRef.value)
        tabPageRef.value.initData()
    }
    return
  }
  else {
    handleThrottledBackToTop(0)
  }

  if (tabContentLoading.value)
    toggleTabContentLoading(false)

  activatedPage.value = tab.page
  // Update global home activated page state
  homeActivatedPage.value = tab.page
}

function toggleTabContentLoading(loading: boolean) {
  tabContentLoading.value = loading
}
</script>

<template>
  <div pos="relative">
    <Teleport v-if="topBarHomeTabsTarget && shouldShowHomeTabs" :to="topBarHomeTabsTarget">
      <section
        class="home-tabs-panel glass-panel"
        bg="$bew-elevated" p-1
        h-38px rounded-full
        text="sm"
        shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
        box-border border="1 $bew-border-color"
      >
        <div class="home-tabs-scroll" h-full of-x-auto of-y-hidden>
          <div class="home-tabs-inside" flex="~ items-center gap-1" h-inherit rounded="$bew-radius-half" w-max>
            <button
              v-for="tab in currentTabs" :key="tab.page"
              :class="{ 'tab-activated': activatedPage === tab.page }"
              px-3 h-inherit
              bg="transparent hover:$bew-fill-2" text="$bew-text-2 hover:$bew-text-1" fw-bold rounded-full
              cursor-pointer duration-300
              flex="~ gap-2 items-center shrink-0" relative
              @click="handleChangeTab(tab)"
            >
              <span class="text-center">{{ $t(tab.i18nKey) }}</span>

              <Transition name="fade">
                <div
                  v-show="activatedPage === tab.page && tabContentLoading"
                  i-svg-spinners:ring-resize
                  pos="absolute right-4px top-4px" duration-300
                  text="8px white"
                />
              </Transition>
            </button>
          </div>
        </div>
      </section>
    </Teleport>

    <section
      v-if="showInlineHomeTabs"
      class="home-tabs-panel home-tabs-panel--inline glass-panel"
      bg="$bew-elevated" p-1
      h-38px rounded-full
      text="sm"
      shadow="[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]"
      box-border border="1 $bew-border-color"
    >
      <div class="home-tabs-scroll" h-full of-x-auto of-y-hidden>
        <div class="home-tabs-inside" flex="~ items-center gap-1" h-inherit rounded="$bew-radius-half" w-max>
          <button
            v-for="tab in currentTabs" :key="tab.page"
            :class="{ 'tab-activated': activatedPage === tab.page }"
            px-3 h-inherit
            bg="transparent hover:$bew-fill-2" text="$bew-text-2 hover:$bew-text-1" fw-bold rounded-full
            cursor-pointer duration-300
            flex="~ gap-2 items-center shrink-0" relative
            @click="handleChangeTab(tab)"
          >
            <span class="text-center">{{ $t(tab.i18nKey) }}</span>

            <Transition name="fade">
              <div
                v-show="activatedPage === tab.page && tabContentLoading"
                i-svg-spinners:ring-resize
                pos="absolute right-4px top-4px" duration-300
                text="8px white"
              />
            </Transition>
          </button>
        </div>
      </div>
    </section>

    <main>
      <Transition name="page-fade">
        <KeepAlive :max="3">
          <Component
            :is="pages[activatedPage]" :key="activatedPage"
            ref="tabPageRef"
            grid-layout="adaptive"
            :top-bar-visibility="topBarVisibility"
            @before-loading="toggleTabContentLoading(true)"
            @after-loading="toggleTabContentLoading(false)"
          />
        </KeepAlive>
      </Transition>
    </main>
  </div>
</template>

<style scoped lang="scss">
.glass-panel {
  backdrop-filter: var(--bew-filter-glass-1);
  /* 关键优化：绘制隔离，防止重绘传播 */
  contain: paint layout;
  /* 创建独立堆叠上下文，减少合成压力 */
  isolation: isolate;
}

.home-tabs-panel {
  max-width: 100%;
  min-width: 0;
}

.home-tabs-panel--inline {
  position: sticky;
  top: calc(env(safe-area-inset-top, 0px) + 8px);
  z-index: 2;
  margin-bottom: 14px;
}

.mobile-userscript .home-tabs-panel--inline {
  top: calc(env(safe-area-inset-top, 0px) + var(--bew-top-bar-height) + 8px);
}

.home-tabs-scroll {
  max-width: 100%;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab-activated {
  --uno: "bg-$bew-theme-color-auto text-$bew-text-auto";
}
</style>
