<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { BILIBILI_LOGIN_URL, isMobileUserscriptRuntimePage, normalizeBilibiliUrlForCurrentSurface, openBilibiliLoginPage, openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { getUserID, isHomePage, removeHttpFromUrl } from '~/utils/main'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { isLogin, searchKeyword, userInfo } = storeToRefs(topBarStore)
const mid = getUserID() || ''
const showMobileLoginPanel = ref(false)
const mobileLoginDialogRef = ref<HTMLElement>()
const mobileLoginDragOffset = ref(0)
const mobileLoginDragging = ref(false)
const mobileLoginSettling = ref(false)
const mobileLoginClosing = ref(false)
const props = withDefaults(defineProps<{
  mobileBottom?: boolean
}>(), {
  mobileBottom: false,
})
const isMobileBottomSearch = computed(() => props.mobileBottom)

const searchBarStyles = computed(() => ({
  '--b-search-bar-normal-color': isMobileBottomSearch.value
    ? 'color-mix(in oklab, var(--bew-fill-1), transparent 16%)'
    : settings.value.enableFrostedGlass
      ? 'color-mix(in oklab, var(--bew-elevated-solid), transparent 60%)'
      : 'var(--bew-elevated)',
  '--b-search-bar-hover-color': isMobileBottomSearch.value
    ? 'color-mix(in oklab, var(--bew-fill-2), transparent 8%)'
    : 'var(--bew-elevated-hover)',
  '--b-search-bar-focus-color': isMobileBottomSearch.value
    ? 'color-mix(in oklab, var(--bew-elevated-solid), transparent 8%)'
    : 'var(--bew-elevated)',
  '--b-search-bar-normal-icon-color': isMobileBottomSearch.value || !(forceWhiteIcon.value && settings.value.enableFrostedGlass) ? 'var(--bew-text-1)' : 'white',
  '--b-search-bar-normal-text-color': isMobileBottomSearch.value || !(forceWhiteIcon.value && settings.value.enableFrostedGlass) ? 'var(--bew-text-1)' : 'white',
}))
const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())
const mobileAvatarUrl = computed(() => userInfo.value.face ? removeHttpFromUrl(userInfo.value.face) : '')
const mobileSpaceUrl = computed(() =>
  mid ? normalizeBilibiliUrlForCurrentSurface(`https://space.bilibili.com/${mid}`) : '',
)
const mobileLoginDialogStyle = computed(() => {
  if (!mobileLoginDragging.value && !mobileLoginSettling.value && !mobileLoginClosing.value)
    return {}

  return {
    transform: `translate3d(0, ${mobileLoginDragOffset.value}px, 0)`,
    transition: mobileLoginDragging.value
      ? 'none'
      : mobileLoginClosing.value
        ? 'transform 220ms cubic-bezier(0.32, 0, 0.67, 0)'
        : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
  }
})

const searchBehavior = computed<'navigate' | 'stay'>(() => {
  // 不再在这里决定搜索行为，让 SearchBar 组件自己根据情况判断
  // SearchBar 会根据当前是否在搜索页来决定是否使用 stay 模式
  return 'navigate'
})

function pushKeywordToSearchResultsPage(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized)
    return

  // 如果在首页,直接使用 pushState 更新 URL
  if (isHomePage()) {
    const params = new URLSearchParams(window.location.search)
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    // 清除旧的筛选参数，重新搜索时重置筛选条件
    params.delete('category')
    params.delete('pn')
    params.delete('user_order')
    params.delete('user_type')
    params.delete('search_type')
    params.delete('live_room_order')
    params.delete('live_user_order')
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.pushState({}, '', newUrl)
    // 触发 pushstate 事件通知其他组件（如 SearchResults.vue）
    window.dispatchEvent(new Event('pushstate'))
  }
  else {
    // 如果不在首页,跳转到当前 Bilibili surface 的搜索结果页
    const params = new URLSearchParams()
    params.set('page', 'SearchResults')
    params.set('keyword', normalized)
    const destination = new URL('https://www.bilibili.com/')
    destination.search = params.toString()
    const searchUrl = normalizeBilibiliUrlForCurrentSurface(destination.toString())
    if (!openMobileUrlInCurrentPage(searchUrl))
      window.location.href = searchUrl
  }
}

function handleSearch(keyword: string) {
  // 先更新 searchKeyword，确保顶栏搜索框显示正确的值
  searchKeyword.value = keyword

  // 只有在搜索结果页且启用了插件搜索时才使用 pushState 方式
  // 其他情况由 SearchBar 组件的 navigateToSearchResultPage 处理
  if (!settings.value.usePluginSearchResultsPage)
    return

  // 检查是否在搜索结果页（通过 URL 参数判断，因为在 TopBar 中无法 inject BEWLY_APP）
  const urlParams = new URLSearchParams(window.location.search)
  const isInSearchResultsPage = urlParams.get('page') === 'SearchResults' && !!urlParams.get('keyword')

  if (!isInSearchResultsPage)
    return

  pushKeywordToSearchResultsPage(keyword)
}

function handleMobileAccountPointerDown(event: Event) {
  event.stopPropagation()
}

let mobileLoginDragPointerId: number | undefined
let mobileLoginDragStartY = 0
let mobileLoginDragLastY = 0
let mobileLoginDragStartedAt = 0
let mobileLoginCloseTimer: number | undefined

function clearMobileLoginCloseTimer() {
  if (!mobileLoginCloseTimer)
    return

  window.clearTimeout(mobileLoginCloseTimer)
  mobileLoginCloseTimer = undefined
}

function removeMobileLoginDragListeners() {
  window.removeEventListener('pointermove', handleMobileLoginDragMove)
  window.removeEventListener('pointerup', handleMobileLoginDragEnd)
  window.removeEventListener('pointercancel', handleMobileLoginDragCancel)
}

function resetMobileLoginMotion() {
  mobileLoginDragPointerId = undefined
  mobileLoginDragOffset.value = 0
  mobileLoginDragging.value = false
  mobileLoginSettling.value = false
  mobileLoginClosing.value = false
  removeMobileLoginDragListeners()
  clearMobileLoginCloseTimer()
}

function settleMobileLoginDrawer() {
  mobileLoginDragging.value = false
  mobileLoginClosing.value = false
  mobileLoginSettling.value = true
  mobileLoginDragOffset.value = 0

  clearMobileLoginCloseTimer()
  mobileLoginCloseTimer = window.setTimeout(() => {
    mobileLoginSettling.value = false
    mobileLoginCloseTimer = undefined
  }, 190)
}

function finishMobileLoginDrawerClose() {
  const dialogHeight = mobileLoginDialogRef.value?.getBoundingClientRect().height ?? window.innerHeight
  mobileLoginDragging.value = false
  mobileLoginSettling.value = false
  mobileLoginClosing.value = true
  mobileLoginDragOffset.value = Math.max(dialogHeight, window.innerHeight * 0.45)

  clearMobileLoginCloseTimer()
  mobileLoginCloseTimer = window.setTimeout(() => {
    showMobileLoginPanel.value = false
    resetMobileLoginMotion()
  }, 230)
}

function handleMobileLoginDragMove(event: PointerEvent) {
  if (mobileLoginDragPointerId !== event.pointerId)
    return

  mobileLoginDragLastY = event.clientY
  mobileLoginDragOffset.value = Math.max(0, mobileLoginDragLastY - mobileLoginDragStartY)

  if (mobileLoginDragLastY >= mobileLoginDragStartY)
    event.preventDefault()
}

function handleMobileLoginDragEnd(event: PointerEvent) {
  if (mobileLoginDragPointerId !== event.pointerId)
    return

  mobileLoginDragLastY = event.clientY
  const deltaY = mobileLoginDragLastY - mobileLoginDragStartY
  const elapsedMs = Math.max(1, performance.now() - mobileLoginDragStartedAt)
  const velocity = deltaY / elapsedMs

  mobileLoginDragPointerId = undefined
  mobileLoginDragging.value = false
  removeMobileLoginDragListeners()

  if (deltaY >= 72 || (deltaY >= 36 && velocity >= 0.42))
    finishMobileLoginDrawerClose()
  else
    settleMobileLoginDrawer()
}

function handleMobileLoginDragCancel(event: PointerEvent) {
  if (mobileLoginDragPointerId !== event.pointerId)
    return

  mobileLoginDragPointerId = undefined
  mobileLoginDragging.value = false
  removeMobileLoginDragListeners()
  settleMobileLoginDrawer()
}

function handleMobileLoginDragStart(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0)
    return

  removeMobileLoginDragListeners()
  clearMobileLoginCloseTimer()
  mobileLoginDragPointerId = event.pointerId
  mobileLoginDragStartY = event.clientY
  mobileLoginDragLastY = event.clientY
  mobileLoginDragStartedAt = performance.now()
  mobileLoginDragOffset.value = 0
  mobileLoginDragging.value = true
  mobileLoginSettling.value = false
  mobileLoginClosing.value = false

  if (event.currentTarget instanceof HTMLElement)
    event.currentTarget.setPointerCapture(event.pointerId)

  window.addEventListener('pointermove', handleMobileLoginDragMove, { passive: false })
  window.addEventListener('pointerup', handleMobileLoginDragEnd)
  window.addEventListener('pointercancel', handleMobileLoginDragCancel)
  event.preventDefault()
  event.stopPropagation()
}

function handleMobileLoginClick(event: MouseEvent) {
  if (event.defaultPrevented)
    return

  event.preventDefault()
  event.stopPropagation()

  if (isMobileUserscriptPage.value) {
    showMobileLoginPanel.value = true
    return
  }

  openBilibiliLoginPage()
}

function closeMobileLoginPanel() {
  showMobileLoginPanel.value = false
  resetMobileLoginMotion()
}

function openFullMobileLoginPage() {
  showMobileLoginPanel.value = false
  resetMobileLoginMotion()
  openBilibiliLoginPage()
}

function handleMobileAvatarClick(event: MouseEvent) {
  if (!mobileSpaceUrl.value)
    return

  event.preventDefault()
  event.stopPropagation()

  if (!openMobileUrlInCurrentPage(mobileSpaceUrl.value))
    window.location.href = mobileSpaceUrl.value
}

onBeforeUnmount(() => {
  resetMobileLoginMotion()
})
</script>

<template>
  <div
    class="top-bar-search"
    :class="{ 'top-bar-search--mobile-bottom': isMobileBottomSearch }"
    flex="inline 1 items-center"
    w="full"
    data-top-bar-search
  >
    <Transition name="slide-out">
      <div
        v-if="showSearchBar"
        id="top-bar-search-content"
        class="top-bar-search-content"
      >
        <SearchBar
          v-model="searchKeyword"
          class="search-bar"
          :class="{ 'search-bar--mobile-bottom': isMobileBottomSearch }"
          :style="searchBarStyles"
          :show-hot-search="settings.showHotSearchInTopBar"
          :search-behavior="searchBehavior"
          @search="handleSearch"
        >
          <template
            v-if="isMobileUserscriptPage"
            #suffix
          >
            <button
              v-if="!isLogin"
              type="button"
              class="mobile-search-account-button"
              :aria-label="$t('topbar.sign_in')"
              :title="$t('topbar.sign_in')"
              @pointerdown="handleMobileAccountPointerDown"
              @mousedown="handleMobileAccountPointerDown"
              @touchstart.stop
              @click="handleMobileLoginClick"
            >
              <div i-solar:user-circle-bold-duotone />
            </button>

            <button
              v-else
              type="button"
              class="mobile-search-account-button mobile-search-account-button--avatar"
              :title="userInfo.uname || '个人空间'"
              :style="{
                backgroundImage: mobileAvatarUrl ? `url(${mobileAvatarUrl})` : undefined,
              }"
              @pointerdown="handleMobileAccountPointerDown"
              @mousedown="handleMobileAccountPointerDown"
              @touchstart.stop
              @click="handleMobileAvatarClick"
            >
              <span class="mobile-search-account-button__fallback" i-solar:user-circle-bold-duotone />
            </button>
          </template>
        </SearchBar>

        <Transition name="mobile-login-panel">
          <div
            v-if="showMobileLoginPanel"
            class="mobile-login-panel"
            @pointerdown.stop
            @mousedown.stop
            @touchstart.stop
            @click.stop
          >
            <button
              type="button"
              class="mobile-login-panel__backdrop"
              aria-label="关闭登录窗口"
              @click="closeMobileLoginPanel"
            />

            <section
              ref="mobileLoginDialogRef"
              class="mobile-login-panel__dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Bilibili 登录 / 注册"
              :data-mobile-login-dragging="mobileLoginDragging ? 'true' : undefined"
              :data-mobile-login-settling="mobileLoginSettling ? 'true' : undefined"
              :data-mobile-login-closing="mobileLoginClosing ? 'true' : undefined"
              :style="mobileLoginDialogStyle"
            >
              <button
                type="button"
                class="mobile-login-panel__drag-handle"
                aria-label="下滑关闭登录 / 注册抽屉"
                @pointerdown="handleMobileLoginDragStart"
                @click.stop
              />

              <header class="mobile-login-panel__header">
                <strong>登录 / 注册</strong>
                <div class="mobile-login-panel__actions">
                  <button
                    type="button"
                    aria-label="打开完整登录页"
                    title="打开完整登录页"
                    @click="openFullMobileLoginPage"
                  >
                    <div i-mingcute:external-link-line />
                  </button>
                  <button
                    type="button"
                    aria-label="关闭"
                    title="关闭"
                    @click="closeMobileLoginPanel"
                  >
                    <div i-mingcute:close-line />
                  </button>
                </div>
              </header>

              <iframe
                class="mobile-login-panel__frame"
                :src="BILIBILI_LOGIN_URL"
                title="Bilibili 登录 / 注册"
                referrerpolicy="no-referrer-when-downgrade"
              />
            </section>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.top-bar-search-content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: min(100%, 560px);
  min-width: 0;
}

.top-bar-search--mobile-bottom,
.top-bar-search--mobile-bottom .top-bar-search-content {
  width: 100%;
  max-width: none;
}

.search-bar {
  flex: 1 1 auto;
  min-width: 0;
}

.mobile-search-account-button {
  position: absolute;
  right: 6px;
  z-index: 2;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--b-search-bar-normal-icon-color);
  border: 0;
  border-radius: 999px;
  outline: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.mobile-search-account-button:hover,
.mobile-search-account-button:focus-visible,
.mobile-search-account-button:active {
  color: var(--bew-theme-color);
  background: var(--bew-fill-2);
}

.mobile-search-account-button:active {
  transform: scale(0.94);
}

.mobile-search-account-button--avatar {
  background-color: var(--bew-fill-2);
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bew-border-color), transparent 18%);
}

.mobile-search-account-button--avatar .mobile-search-account-button__fallback {
  opacity: v-bind('mobileAvatarUrl ? 0 : 1');
}

.mobile-login-panel {
  position: fixed;
  inset: 0;
  z-index: 2147483600;
  display: grid;
  align-items: end;
  justify-items: center;
  pointer-events: auto;
}

.mobile-login-panel__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.56);
  backdrop-filter: blur(12px) saturate(1.08);
  -webkit-backdrop-filter: blur(12px) saturate(1.08);
}

.mobile-login-panel__dialog {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(100vw, 520px);
  height: min(86dvh, 720px);
  min-height: min(460px, 86dvh);
  overflow: hidden;
  color: var(--bew-text-1);
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 46%);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;
  background: var(--bew-elevated-solid);
  box-shadow: 0 -18px 46px rgba(0, 0, 0, 0.34);
  will-change: transform;
}

.mobile-login-panel__dialog[data-mobile-login-dragging="true"],
.mobile-login-panel__dialog[data-mobile-login-settling="true"],
.mobile-login-panel__dialog[data-mobile-login-closing="true"] {
  will-change: transform;
}

.mobile-login-panel__drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  width: 100%;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.mobile-login-panel__drag-handle::before {
  content: "";
  position: absolute;
  top: 14px;
  left: 50%;
  width: 48px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--bew-text-1), transparent 74%);
  transform: translateX(-50%);
}

.mobile-login-panel__dialog[data-mobile-login-dragging="true"] .mobile-login-panel__drag-handle {
  cursor: grabbing;
}

.mobile-login-panel__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  margin-top: 30px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 40%);
}

.mobile-login-panel__header strong {
  font-size: 17px;
  font-weight: 750;
  letter-spacing: 0;
}

.mobile-login-panel__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mobile-login-panel__actions button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--bew-text-1);
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 20px;
}

.mobile-login-panel__actions button:active,
.mobile-login-panel__actions button:focus-visible {
  background: var(--bew-fill-2);
}

.mobile-login-panel__frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  border: 0;
  background: #fff;
}

.mobile-login-panel-enter-active,
.mobile-login-panel-leave-active {
  transition: opacity 0.2s ease;
}

.mobile-login-panel-enter-active .mobile-login-panel__dialog,
.mobile-login-panel-leave-active .mobile-login-panel__dialog {
  transition: transform 0.24s cubic-bezier(0.2, 0, 0, 1);
}

.mobile-login-panel-enter-from,
.mobile-login-panel-leave-to {
  opacity: 0;
}

.mobile-login-panel-enter-from .mobile-login-panel__dialog,
.mobile-login-panel-leave-to .mobile-login-panel__dialog {
  transform: translate3d(0, 100%, 0);
}

@media (max-width: 700px) {
  .top-bar-search-content {
    width: 100%;
    max-width: none;
  }

  .search-bar {
    width: 100%;
  }
}
</style>
