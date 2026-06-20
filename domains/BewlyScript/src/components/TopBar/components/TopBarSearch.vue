<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { isMobileUserscriptRuntimePage, normalizeBilibiliUrlForCurrentSurface, openBilibiliLoginPage, openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { getUserID, isHomePage, removeHttpFromUrl } from '~/utils/main'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'

const { showSearchBar, forceWhiteIcon } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { isLogin, searchKeyword, userInfo } = storeToRefs(topBarStore)
const mid = getUserID() || ''
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

function handleMobileLoginClick(event: MouseEvent) {
  if (event.defaultPrevented)
    return

  event.preventDefault()
  event.stopPropagation()
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
