<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useElementSize, useWindowSize } from '@vueuse/core'
import { computed, ref } from 'vue'

import { UndoForwardState, useBewlyApp } from '~/composables/useAppProvider'
import { useDark } from '~/composables/useDark'
import { useDelayedHover } from '~/composables/useDelayedHover'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import {
  getBewlyUserscriptHomeUrl,
  isMobileBilibiliHomePage,
  isMobileUserscriptRuntimePage,
  shouldEnableHoverInteractions,
} from '~/userscript/mobile'
import { isHomePage, openLinkToNewTab } from '~/utils/main'

import Tooltip from '../Tooltip.vue'
import type { HoveringDockItem } from './types'

const props = defineProps<{
  activatedPage: AppPage
}>()

const emit = defineEmits<{
  (e: 'dockItemClick', dockItem: DockItem): void
  (e: 'dockItemMiddleClick', dockItem: DockItem): void
  (e: 'settingsVisibilityChange'): void
  (e: 'refresh'): void
  (e: 'backToTop'): void
  (e: 'undoRefresh'): void
  (e: 'forwardRefresh'): void
}>()

const mainStore = useMainStore()
const { isDark, toggleDark } = useDark()
const { reachTop, homeActivatedPage, undoForwardState, canRefreshHomeSubPage } = useBewlyApp()
const isMobileUserscriptPage = isMobileUserscriptRuntimePage()

function isBewlyHomePage(url: string = window.location.href): boolean {
  return isHomePage(url) || (isMobileUserscriptPage && isMobileBilibiliHomePage(url))
}

// 计算属性：是否显示撤销按钮
const showUndo = computed(() => undoForwardState.value === UndoForwardState.ShowUndo)
// 计算属性：是否显示前进按钮
const showForward = computed(() => undoForwardState.value === UndoForwardState.ShowForward)
const hoverInteractionsEnabled = computed(() => shouldEnableHoverInteractions(settings.value.touchScreenOptimization))
const dockAutoHideEnabled = computed(() => settings.value.autoHideDock && hoverInteractionsEnabled.value)
const effectiveDockPosition = computed(() => isMobileUserscriptPage ? 'bottom' : settings.value.dockPosition)
const effectiveHalfHideDock = computed(() => !isMobileUserscriptPage && settings.value.halfHideDock)

const hideDock = ref<boolean>(false)
const dockContentHover = ref<boolean>(false)
const dockContentRef = useDelayedHover({
  enterDelay: 100,
  leaveDelay: 600,
  enter: () => {
    dockContentHover.value = true
    toggleHideDock(false)
  },
  leave: () => {
    dockContentHover.value = false
    toggleHideDock(true)
  },
})

// Global mouse move detection for edge zones
const edgeZoneSize = 20 // pixels from edge
let mouseEnterTimer: any | undefined
let mouseLeaveTimer: any | undefined
let isGlobalMouseMoveListening = false

function clearDockHoverTimers() {
  if (mouseEnterTimer) {
    clearTimeout(mouseEnterTimer)
    mouseEnterTimer = undefined
  }

  if (mouseLeaveTimer) {
    clearTimeout(mouseLeaveTimer)
    mouseLeaveTimer = undefined
  }
}

function addGlobalMouseMoveListener() {
  if (!isGlobalMouseMoveListening) {
    window.addEventListener('mousemove', handleGlobalMouseMove)
    isGlobalMouseMoveListening = true
  }
}

function removeGlobalMouseMoveListener() {
  if (isGlobalMouseMoveListening) {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    isGlobalMouseMoveListening = false
  }
}

function handleGlobalMouseMove(event: MouseEvent) {
  if (!dockAutoHideEnabled.value) {
    return
  }

  const { clientX, clientY } = event
  const { innerWidth, innerHeight } = window

  let isInEdgeZone = false

  if (effectiveDockPosition.value === 'left' && clientX <= edgeZoneSize) {
    isInEdgeZone = true
  }
  else if (effectiveDockPosition.value === 'right' && clientX >= innerWidth - edgeZoneSize) {
    isInEdgeZone = true
  }
  else if (effectiveDockPosition.value === 'bottom' && clientY >= innerHeight - edgeZoneSize) {
    isInEdgeZone = true
  }

  if (isInEdgeZone) {
    if (mouseLeaveTimer) {
      clearTimeout(mouseLeaveTimer)
      mouseLeaveTimer = undefined
    }
    if (!mouseEnterTimer) {
      mouseEnterTimer = setTimeout(() => {
        mouseEnterTimer = undefined
        toggleHideDock(false)
      }, 100)
    }
  }
  else {
    if (mouseEnterTimer) {
      clearTimeout(mouseEnterTimer)
      mouseEnterTimer = undefined
    }
    if (!mouseLeaveTimer && !dockContentHover.value) {
      mouseLeaveTimer = setTimeout(() => {
        mouseLeaveTimer = undefined
        toggleHideDock(true)
      }, 600)
    }
  }
}

const hoveringDockItem = reactive<HoveringDockItem>({
  themeMode: false,
})
const themeModeDockItemRef = useDelayedHover({
  enterDelay: 0,
  leaveDelay: 0,
  enter: () => {
    hoveringDockItem.themeMode = true
  },
  leave: () => {
    hoveringDockItem.themeMode = false
  },
})
const currentDockItems = ref<DockItem[]>([])
const activatedDockItem = ref<DockItem>()

const tooltipPlacement = computed(() => {
  if (effectiveDockPosition.value === 'left')
    return 'right'
  else if (effectiveDockPosition.value === 'right')
    return 'left'
  else if (effectiveDockPosition.value === 'bottom')
    return 'top'
  return 'right'
})

/**
 * Whether to show the back to top or refresh button
 */
const showBackToTopOrRefreshButton = computed((): boolean => {
  if (isMobileUserscriptPage)
    return false

  // 在首页显示返回顶部/刷新按钮（包括搜索页）
  return isBewlyHomePage()
})

const canRefreshCurrentPage = computed((): boolean => {
  if (props.activatedPage === AppPage.SearchResults)
    return false

  return props.activatedPage !== AppPage.Home || homeActivatedPage.value === HomeSubPage.ForYou || canRefreshHomeSubPage.value
})

const showBackToTopOrRefreshActions = computed((): boolean => {
  return showBackToTopOrRefreshButton.value && (canRefreshCurrentPage.value || !reachTop.value)
})

/**
 * Whether to show the undo/forward buttons
 * Only show on Home page when current sub-page is ForYou
 */
const shouldShowUndoForwardButtons = computed((): boolean => {
  return props.activatedPage === AppPage.Home && homeActivatedPage.value === HomeSubPage.ForYou
})

watch(dockAutoHideEnabled, (enabled) => {
  clearDockHoverTimers()

  if (enabled) {
    hideDock.value = true
    addGlobalMouseMoveListener()
  }
  else {
    removeGlobalMouseMoveListener()
    dockContentHover.value = false
    hoveringDockItem.themeMode = false
    hideDock.value = false
  }
}, { immediate: true })

// use Json stringify to watch the changes of the array item properties
watch(() => JSON.stringify(settings.value.dockItemsConfig), () => {
  currentDockItems.value = computeDockItem()
}, { immediate: true })

function computeDockItem(): DockItem[] {
  if (Array.isArray(settings.value.dockItemsConfig) && settings.value.dockItemsConfig.length < mainStore.dockItems.length) {
    // Add missing items to dockItemsConfig
    const missingItems = mainStore.dockItems.filter(dock => !settings.value.dockItemsConfig.some(item => item.page === dock.page))
    settings.value.dockItemsConfig = [
      ...settings.value.dockItemsConfig,
      ...missingItems.map(dock => ({ page: dock.page, visible: true, openInNewTab: false })),
    ]
  }
  // if dockItemsConfig not fresh, set it to default
  else if (!Array.isArray(settings.value.dockItemsConfig) || settings.value.dockItemsConfig.length !== mainStore.dockItems.length) {
    settings.value.dockItemsConfig = mainStore.dockItems.map(dock =>
      ({ page: dock.page, visible: true, openInNewTab: false }),
    )
  }

  const targetDockItems: DockItem[] = []

  settings.value.dockItemsConfig.forEach((item) => {
    const foundItem = mainStore.dockItems.find(defaultItem => defaultItem.page === item.page)

    if (item.visible) {
      targetDockItems.push({
        i18nKey: foundItem?.i18nKey || '',
        icon: foundItem?.icon || '',
        iconActivated: foundItem?.iconActivated || '',
        page: foundItem?.page || AppPage.Home,
        openInNewTab: item.openInNewTab,
        url: foundItem?.url || '',
        hasBewlyPage: foundItem?.hasBewlyPage || false,
      })
    }
  })
  return targetDockItems
}

function toggleHideDock(hide: boolean) {
  if (dockAutoHideEnabled.value)
    hideDock.value = hide
  else
    hideDock.value = false
}

function handleDockItemClick($event: MouseEvent, dockItem: DockItem) {
  if (($event.ctrlKey || $event.metaKey) && !isMobileUserscriptPage) {
    openDockItemInNewTab(dockItem)
    return
  }

  activatedDockItem.value = dockItem
  emit('dockItemClick', dockItem)
}

function handleDockItemMiddleClick($event: MouseEvent, dockItem: DockItem) {
  if (isMobileUserscriptPage) {
    $event.preventDefault()
    handleDockItemClick($event, dockItem)
    return
  }

  openDockItemInNewTab(dockItem)
}

function openDockItemInNewTab(dockItem: DockItem) {
  activatedDockItem.value = dockItem
  openLinkToNewTab(getBewlyUserscriptHomeUrl(dockItem.page, window.location.href))
}

function handleBackToTopOrRefresh(action: 'backToTop' | 'refresh' | 'auto' = 'auto') {
  if (action === 'backToTop') {
    emit('backToTop')
  }
  else if (action === 'refresh') {
    if (canRefreshCurrentPage.value)
      emit('refresh')
  }
  else {
    if (reachTop.value && canRefreshCurrentPage.value) {
      emit('refresh')
    }
    else {
      emit('backToTop')
    }
  }
}

// 处理撤销刷新
function handleUndoRefresh() {
  emit('undoRefresh')
  undoForwardState.value = UndoForwardState.ShowForward
}

// 添加处理前进的方法
function handleForwardRefresh() {
  emit('forwardRefresh')
  undoForwardState.value = UndoForwardState.ShowUndo
}

// 添加统一的前进后退处理方法
function handleHistoryNavigation() {
  if (showUndo.value) {
    handleUndoRefresh()
  }
  else if (showForward.value) {
    handleForwardRefresh()
  }
}

function isDockItemActivated(dockItem: DockItem): boolean {
  return props.activatedPage === dockItem.page && isBewlyHomePage()
}

const { width: windowWidth, height: windowHeight } = useWindowSize()
const { width: dockWidth, height: dockHeight } = useElementSize(dockContentRef)

const dockScale = computed((): number => {
  if (!dockHeight.value || !dockWidth.value)
    return 1

  // Get current top bar height from CSS variable
  const getTopBarHeight = (): number => {
    const topBarHeight = getComputedStyle(document.documentElement)
      .getPropertyValue('--bew-top-bar-height')
      .replace('px', '')
    return Number.parseInt(topBarHeight) || 64 // fallback to 64px
  }

  const currentTopBarHeight = getTopBarHeight()

  // Dynamic margins based on screen size and dock position
  let heightMargin: number
  let widthMargin: number

  if (effectiveDockPosition.value === 'bottom') {
    // For bottom position, use original logic
    heightMargin = Math.max(100, Math.min(150, windowHeight.value * 0.1))
    widthMargin = Math.max(100, Math.min(150, windowWidth.value * 0.1))
  }
  else {
    // For side positions, adjust margins considering responsive top bar height
    heightMargin = Math.max(50, Math.min(100, windowHeight.value * 0.08)) + currentTopBarHeight
    widthMargin = Math.max(50, Math.min(100, windowWidth.value * 0.08))
  }

  const maxAllowedHeight = windowHeight.value - heightMargin
  const maxAllowedWidth = windowWidth.value - widthMargin

  const buttonSize = 45 // lg:w-45px w-35px, use larger size for calculation
  const buttonGap = 8 // gap-2 = 8px

  let additionalHeight = 0
  let additionalWidth = 0

  if (effectiveDockPosition.value === 'bottom') {
    const maxButtonCount = settings.value.backToTopAndRefreshButtonsAreSeparated ? 2 : 1
    const maxUndoForwardButtonCount = settings.value.enableUndoRefreshButton ? 1 : 0
    additionalWidth = (maxButtonCount + maxUndoForwardButtonCount) * buttonSize + maxButtonCount * buttonGap
  }
  else {
    const maxButtonCount = settings.value.backToTopAndRefreshButtonsAreSeparated ? 2 : 1
    const maxUndoForwardButtonCount = settings.value.enableUndoRefreshButton ? 1 : 0
    additionalHeight = (maxButtonCount + maxUndoForwardButtonCount) * buttonSize + maxButtonCount * buttonGap
  }

  const effectiveDockHeight = dockHeight.value + additionalHeight
  const effectiveDockWidth = dockWidth.value + additionalWidth

  // Calculate scale factors for both dimensions
  const heightScale = effectiveDockHeight > maxAllowedHeight
    ? maxAllowedHeight / effectiveDockHeight
    : 1

  const widthScale = effectiveDockWidth > maxAllowedWidth
    ? maxAllowedWidth / effectiveDockWidth
    : 1

  // Use the smaller scale to ensure dock fits in both dimensions
  return Math.min(heightScale, widthScale)
})

const dockTransformStyle = computed((): { transform: string, transformOrigin: string } => {
  const position = effectiveDockPosition.value
  const scale = dockScale.value
  dockContentRef.value?.style.setProperty('--scale', `${scale}`)

  if (isMobileUserscriptPage) {
    return {
      transform: 'none',
      transformOrigin: 'center bottom',
    }
  }

  // Adjust origin based on dock position
  const origin = {
    left: 'left center',
    right: 'right center',
    bottom: 'center bottom',
  }[position] || 'center center'

  return {
    transform: position === 'bottom' ? `translateX(-50%) scale(${scale})` : `scale(${scale})`,
    transformOrigin: origin,
  }
})

// 处理首页刷新快捷键
function handleHomeRefreshKeydown(event: KeyboardEvent) {
  // 检查快捷键设置是否启用
  const shortcutConfig = settings.value.shortcuts?.homeRefresh
  if (!shortcutConfig?.enabled) {
    return
  }

  // 获取配置的快捷键
  const configuredKey = shortcutConfig.key || 'R'

  // 检查是否按下了配置的快捷键
  if (event.key && event.key.toUpperCase() === configuredKey.toUpperCase() && !event.ctrlKey && !event.metaKey && !event.altKey) {
    // 检查页面中是否有任何输入框处于焦点状态
    const activeElement = document.activeElement

    // 使用事件路径检查是否点击了输入框
    const eventPath = event.composedPath ? event.composedPath() : (event as any).path || []
    let hasInputFocus = false

    // 检查事件路径中是否包含输入元素
    for (const element of eventPath) {
      if (element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || (element instanceof HTMLElement && element.contentEditable === 'true')) {
        hasInputFocus = true
        break
      }
    }

    // 备用检查：查找页面中所有输入元素并检查焦点
    if (!hasInputFocus) {
      const allInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]')

      allInputs.forEach((input) => {
        const inputElement = input as HTMLElement
        if (inputElement === activeElement
          || inputElement === document.activeElement
          || inputElement.matches(':focus')) {
          hasInputFocus = true
        }
      })
    }

    // 最后检查：直接检查activeElement
    if (!hasInputFocus && activeElement) {
      if (activeElement.tagName === 'INPUT'
        || activeElement.tagName === 'TEXTAREA'
        || (activeElement instanceof HTMLElement && activeElement.contentEditable === 'true')) {
        hasInputFocus = true
      }
    }

    if (hasInputFocus)
      return

    // 如果没有输入框获得焦点且显示刷新按钮，则触发刷新
    if (showBackToTopOrRefreshButton.value && canRefreshCurrentPage.value) {
      event.preventDefault()
      handleBackToTopOrRefresh('refresh')
    }
  }
}

// 在组件挂载时添加键盘事件监听
onMounted(() => {
  document.addEventListener('keydown', handleHomeRefreshKeydown)
})

// 在组件卸载时移除键盘事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleHomeRefreshKeydown)
  removeGlobalMouseMoveListener()
  clearDockHoverTimers()
})
</script>

<template>
  <aside
    class="dock-wrap"
    pos="fixed top-0" z-100 flex="~ col justify-center items-center" w-full h-full
    z-10 pointer-events-none
  >
    <!-- Edge Div -->
    <div
      v-if="dockAutoHideEnabled && hideDock"
      class="dock-edge"
      :class="`dock-edge-${effectiveDockPosition}`"
    />

    <!-- Dock Content -->
    <div
      ref="dockContentRef"
      class="dock-content"
      :class="{
        'left': effectiveDockPosition === 'left',
        'right': effectiveDockPosition === 'right',
        'bottom': effectiveDockPosition === 'bottom',
        'mobile-userscript': isMobileUserscriptPage,
        'hide': hideDock,
        'half-hide': dockAutoHideEnabled && effectiveHalfHideDock,
        'hover': dockContentHover,
      }"
      :style="dockTransformStyle"
    >
      <div
        class="dock-content-inner"
      >
        <template v-for="dockItem in currentDockItems" :key="dockItem.page">
          <Tooltip :content="$t(dockItem.i18nKey)" :placement="tooltipPlacement">
            <button
              class="dock-item group"
              :class="{
                'hover-enabled': hoverInteractionsEnabled,
                'active': isDockItemActivated(dockItem),
                'inactive': hoveringDockItem.themeMode && isDark,
                'disable-glowing-effect': settings.disableDockGlowingEffect,
              }"
              @click="handleDockItemClick($event, dockItem)"
              @click.middle="handleDockItemMiddleClick($event, dockItem)"
            >
              <div
                v-show="!isDockItemActivated(dockItem)"
                :class="dockItem.icon"
                text-xl
              />
              <div
                v-show="isDockItemActivated(dockItem)"
                :class="dockItem.iconActivated"
                text-xl
              />
            </button>
          </Tooltip>
        </template>

        <!-- dividing line -->
        <div class="divider" />

        <Tooltip
          v-if="!settings.disableLightDarkModeSwitcherOnDock"
          :content="isDark ? $t('dock.dark_mode') : $t('dock.light_mode')" :placement="tooltipPlacement"
          class="group"
          pointer-events-none
        >
          <!-- moon -->
          <div
            v-if="isDark"
            pos="absolute top-0 left-0"
            :class="hoverInteractionsEnabled
              ? 'group-hover:top-2px group-hover:left--4px opacity-0 group-hover:opacity-100'
              : 'opacity-0'"
            w-full h-full bg-white rounded="1/2"
            z--2 pointer-events-none
            :shadow="
              settings.disableDockGlowingEffect || !hoverInteractionsEnabled
                ? 'none'
                : 'group-hover:[-8px_4px_160px_20px_hsla(226deg,85%,77%,1),-8px_4px_100px_12px_hsla(226deg,85%,77%,0.8),-8px_4px_60px_10px_hsla(226deg,85%,77%,0.6),-8px_4px_20px_4px_hsla(226deg,85%,77%,0.4),-4px_2px_8px_0_hsla(226deg,85%,77%,0.8)]'"
            duration-600
          />

          <button
            ref="themeModeDockItemRef"
            class="dock-item"
            :class="{
              'hover-enabled': hoverInteractionsEnabled,
              'theme-mode-dark': isDark,
              'disable-glowing-effect': settings.disableDockGlowingEffect,
            }"
            pointer-events-auto
            @click="toggleDark"
          >
            <Transition name="fade">
              <div v-show="hoveringDockItem.themeMode" absolute>
                <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-loop-transition" />
                <Icon v-else icon="line-md:moon-alt-to-sunny-outline-loop-transition" />
              </div>
            </Transition>
            <Transition name="fade">
              <div v-show="!hoveringDockItem.themeMode" absolute>
                <Icon v-if="isDark" icon="line-md:sunny-outline-to-moon-transition" />
                <Icon v-else icon="line-md:moon-to-sunny-outline-transition" />
              </div>
            </Transition>
          </button>
        </Tooltip>

        <Tooltip :content="$t('dock.settings')" :placement="tooltipPlacement">
          <button
            class="dock-item group"
            :class="{
              'hover-enabled': hoverInteractionsEnabled,
              'disable-glowing-effect': settings.disableDockGlowingEffect,
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="emit('settingsVisibilityChange')"
          >
            <div
              i-mingcute:settings-3-line
              text-xl
              :class="hoverInteractionsEnabled ? 'group-hover:rotate-180' : ''"
              transition="all 2000 ease-out"
            />
          </button>
        </Tooltip>
      </div>

      <!-- Back to top & refresh buttons -->
      <div
        v-if="showBackToTopOrRefreshActions"
        :style="{
          bottom: effectiveDockPosition === 'bottom' ? 'unset' : 0,
          right: effectiveDockPosition === 'bottom' ? 0 : 'unset',
          transform: effectiveDockPosition === 'bottom' ? 'translate(100%, 0)' : 'translateY(100%)',
          flexDirection: effectiveDockPosition === 'bottom' ? 'row' : 'column',
        }"
        pos="absolute"
        flex="~ gap-2"
      >
        <template
          v-if="settings.backToTopAndRefreshButtonsAreSeparated"
        >
          <template v-for="key in 2" :key="key">
            <Transition name="fade">
              <button
                v-if="(key === 1 && canRefreshCurrentPage) || (key === 2 && !reachTop)"
                class="back-to-top-or-refresh-btn"
                :class="{
                  'hover-enabled': hoverInteractionsEnabled,
                  inactive: hoveringDockItem.themeMode && isDark,
                }"
                @click="handleBackToTopOrRefresh(key === 1 ? 'refresh' : 'backToTop')"
              >
                <Icon
                  v-if="key === 1"
                  icon="line-md:rotate-270"
                  shrink-0 rotate-90 absolute text-2xl
                />
                <Icon
                  v-else
                  icon="line-md:arrow-small-up"
                  shrink-0 absolute text-2xl
                />
              </button>
            </Transition>
          </template>
        </template>
        <template v-else>
          <button
            class="back-to-top-or-refresh-btn"
            :class="{
              'hover-enabled': hoverInteractionsEnabled,
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleBackToTopOrRefresh('auto')"
          >
            <Transition name="fade">
              <Icon
                v-if="reachTop && canRefreshCurrentPage"
                icon="line-md:rotate-270"
                shrink-0 rotate-90 absolute text-2xl
              />
              <Icon
                v-else
                icon="line-md:arrow-small-up"
                shrink-0 absolute text-2xl
              />
            </Transition>
          </button>
        </template>
        <!-- 将原来的两个按钮替换为一个 -->
        <Transition name="fade">
          <button
            v-if="shouldShowUndoForwardButtons && (showUndo || showForward) && settings.enableUndoRefreshButton"
            class="back-to-top-or-refresh-btn"
            :class="{
              'hover-enabled': hoverInteractionsEnabled,
              inactive: hoveringDockItem.themeMode && isDark,
            }"
            @click="handleHistoryNavigation"
          >
            <Icon
              v-if="showUndo"
              icon="mdi:undo-variant"
              shrink-0 absolute text-2xl
            />
            <Icon
              v-else-if="showForward"
              icon="mdi:redo-variant"
              shrink-0 absolute text-2xl
            />
          </button>
        </Transition>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.dock-wrap {
  > * {
    --uno: "pointer-events-auto";
  }
}

.dock-edge {
  &-left,
  &-right,
  &-bottom {
    --uno: "absolute z--1";
  }

  &-left {
    --uno: "left-0 top-0 w-14px h-full";
  }

  &-right {
    --uno: "right-0 top-0 w-14px h-full";
  }

  &-bottom {
    --uno: "left-0 bottom-0 w-full h-14px";
  }
}

.dock-content {
  --uno: "absolute flex justify-center items-center duration-300 scale-$scale";

  &.left {
    --uno: "left-2 after:right--4px";
  }
  &.left.hide:not(.hover) {
    --uno: "opacity-0 !translate-x--100%";
  }
  &.left.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x--50%";
  }

  &.right {
    --uno: "right-2 after:left--4px";
  }
  &.right.hide:not(.hover) {
    --uno: "opacity-0 !translate-x-100%";
  }
  &.right.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-x-50%";
  }

  &.bottom {
    --uno: "top-unset bottom-0 left-1/2";
  }
  &.bottom.hide:not(.hover) {
    --uno: "opacity-0 !translate-y-100%";
  }
  &.bottom.half-hide:not(.hover) {
    --uno: "!opacity-60 !translate-y-50%";
  }

  .divider {
    --uno: "my-1 mx-3 h-3px bg-$bew-border-color rounded-4";
  }

  &.bottom .divider {
    --uno: "w-3px h-auto my-3 mx-1";
  }

  .dock-content-inner {
    --uno: "duration-300 ease-in-out";
    --uno: "p-2 m-2 bg-$bew-content-alt dark:bg-$bew-elevated";
    --uno: "flex flex-col gap-2 shrink-0";
    --uno: "rounded-full border-1 border-$bew-border-color";
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
    backdrop-filter: var(--bew-filter-glass-1);
  }

  &.bottom .dock-content-inner {
    --uno: "flex-row";
  }

  &.mobile-userscript.bottom {
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    transform: none !important;
    transform-origin: center bottom !important;
  }

  &.mobile-userscript .dock-content-inner {
    width: 100vw !important;
    max-width: 100vw !important;
    margin: 0 !important;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px max(10px, env(safe-area-inset-left, 0px)) calc(env(safe-area-inset-bottom, 0px) + 8px) max(10px, env(safe-area-inset-right, 0px)) !important;
    gap: 8px;
    scrollbar-width: none;
    touch-action: pan-x;
    border-inline: 0 !important;
    border-bottom: 0 !important;
    border-radius: 18px 18px 0 0 !important;
    background: color-mix(in oklab, var(--bew-elevated-solid), transparent 3%);
    border-color: color-mix(in oklab, var(--bew-border-color), transparent 8%);
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 -10px 30px rgba(0, 0, 0, 0.28);
  }

  &.mobile-userscript .dock-content-inner::-webkit-scrollbar {
    display: none;
  }

  .back-to-top-or-refresh-btn {
    --uno: "transform active:important-scale-90";
    --uno: "lg:w-45px w-35px lg:h-45px h-35px";
    --uno: "grid place-items-center";
    --uno: "relative";
    --uno: "filter-$bew-filter-glass-1";
    --uno: "bg-$bew-elevated";
    --uno: "rounded-full shadow-$bew-shadow-2 border-1 border-$bew-border-color";

    backdrop-filter: var(--bew-filter-glass-1);
    transition:
      transform 300ms cubic-bezier(0.34, 2, 0.6, 1),
      background 300ms ease,
      color 300ms ease,
      box-shadow 300ms ease,
      opacity 600ms ease;
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);

    &.hover-enabled:hover {
      --uno: "hover:scale-110 hover:bg-$bew-content-hover";
    }

    &.active {
      --uno: "important-bg-$bew-theme-color-auto text-$bew-text-auto";
      --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
      --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
    }

    &.inactive {
      --uno: "opacity-80 !shadow-none";
    }
  }

  &.bottom .back-to-top-or-refresh-btn {
    --uno: "bottom-unset lg:right--45px right--35px";
  }
}

.dock-item {
  --shadow-dark: 0 4px 30px 4px rgba(255, 255, 255, 0.6);
  --shadow-active: 0 4px 30px var(--bew-theme-color-60);
  --shadow-dark-active: 0 4px 20px rgba(255, 255, 255, 0.8);
  --shadow-active-active: 0 4px 20px var(--bew-theme-color-80);

  --uno: "relative transform active:important-scale-90";
  --uno: "lg:w-45px w-35px";
  --uno: "lg:lh-45px lh-35px";
  --uno: "p-0 flex items-center justify-center";
  --uno: "aspect-square relative";
  --uno: "leading-0";
  --uno: "rounded-60px antialiased";
  --uno: "bg-$bew-fill-alt cursor-pointer";
  --uno: "dark:bg-$bew-fill-1";

  box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);
  transition:
    transform 300ms cubic-bezier(0.34, 2, 0.6, 1),
    background 300ms ease,
    color 300ms ease,
    box-shadow 600ms ease,
    opacity 600ms ease;

  &.hover-enabled:hover {
    --uno: "hover:scale-110 hover:bg-$bew-fill-2 dark-hover:bg-$bew-fill-4";
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-fill-2),
      var(--bew-shadow-2);
  }

  &.disable-glowing-effect {
    box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1) !important;
  }

  &.theme-mode-dark.hover-enabled:hover {
    --uno: "!dark-hover:bg-$bew-bg !dark-hover:scale-100";
  }

  &.theme-mode-dark.hover-enabled:not(.disable-glowing-effect):hover {
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      var(--bew-shadow-1),
      inset 4px -2px 8px hsla(226deg, 85%, 77%, 1);
  }

  &.active {
    --uno: "important-bg-$bew-theme-color text-white !dark:bg-white !dark:text-black";
    --uno: "shadow-$shadow-active dark:shadow-$shadow-dark";
    --uno: "active:shadow-$shadow-active-active dark-active:shadow-$shadow-dark-active";
  }

  &.inactive {
    --uno: "opacity-80 !shadow-none";
  }

  svg {
    --uno: "lg:w-22px w-18px lg:h-22px h-18px block align-middle";
  }
}

.dock-content.mobile-userscript {
  .divider {
    --uno: "mx-1 my-2";
  }

  .dock-item,
  .back-to-top-or-refresh-btn {
    width: 52px;
    height: 52px;
    min-width: 52px;
    line-height: 52px;
    background: transparent;
    border-color: transparent;
    border-radius: 16px;
    box-shadow: none;
    z-index: 0;

    &::before {
      content: "";
      position: absolute;
      inset: 3px;
      z-index: 0;
      border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 10%);
      border-radius: 16px;
      background: transparent;
      box-shadow: none;
      transition:
        transform 240ms ease,
        background-color 240ms ease,
        box-shadow 240ms ease;
    }

    > * {
      position: relative;
      z-index: 1;
    }

    &.active::before {
      background: var(--bew-theme-color);
      border-color: color-mix(in oklab, var(--bew-theme-color), white 20%);
      box-shadow: var(--bew-shadow-edge-glow-1), 0 8px 24px var(--bew-theme-color-40);
    }

    &.inactive::before {
      opacity: 0.55;
    }

    &.hover-enabled:hover::before {
      transform: scale(1.04);
      background: var(--bew-fill-2);
    }
  }

  .dock-item > div,
  .back-to-top-or-refresh-btn > div {
    font-size: 22px;
  }
}
</style>
