<script setup lang="ts">
import Empty from '~/components/Empty.vue'
import Loading from '~/components/Loading.vue'
import type { Author, Video } from '~/components/VideoCard/types'
import VideoCardGrid from '~/components/VideoCardGrid.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { openBilibiliLoginPage } from '~/userscript/mobile'
import api from '~/utils/api'
import { getCSRF, openLinkToNewTab } from '~/utils/main'
import type { CollaborativeVideoEntry, NormalizedMomentItem } from '~/utils/moments'
import {
  mergeCollaborativeVideos,
  normalizeLiveMomentItem,
  normalizeNavMomentItem,
  updateMomentCollaborative,
} from '~/utils/moments'

type MomentTab = 'video' | 'article' | 'live'

interface MomentTabConfig {
  key: MomentTab
  label: string
  icon: string
}

interface MomentTabState {
  items: NormalizedMomentItem[]
  isLoading: boolean
  noMoreContent: boolean
  needToLoginFirst: boolean
  requestFailed: boolean
  offset: string
  updateBaseline: string
  livePage: number
  collaborativeVideoMap: Map<string, CollaborativeVideoEntry>
}

const ORIGINAL_MOMENTS_URL = 'https://t.bilibili.com'
const LIVE_PAGE_SIZE = 12

const { handleReachBottom, handlePageRefresh } = useBewlyApp()

const momentTabs: MomentTabConfig[] = [
  { key: 'video', label: '视频', icon: 'i-mingcute:video-line' },
  { key: 'article', label: '专栏', icon: 'i-mingcute:document-line' },
  { key: 'live', label: '直播', icon: 'i-mingcute:live-location-line' },
]

const selectedTab = ref<MomentTab>('video')

function createState(): MomentTabState {
  return {
    items: [],
    isLoading: false,
    noMoreContent: false,
    needToLoginFirst: false,
    requestFailed: false,
    offset: '',
    updateBaseline: '',
    livePage: 1,
    collaborativeVideoMap: new Map(),
  }
}

const tabStates = reactive<Record<MomentTab, MomentTabState>>({
  video: createState(),
  article: createState(),
  live: createState(),
})

const activeState = computed(() => tabStates[selectedTab.value])
const needToLoginFirst = computed(() => !getCSRF() || activeState.value.needToLoginFirst)
const isArticleTab = computed(() => selectedTab.value === 'article')

onMounted(() => {
  initPageAction()
  if (!needToLoginFirst.value)
    initData()
})

onActivated(() => {
  initPageAction()
})

watch(selectedTab, () => {
  if (!needToLoginFirst.value && activeState.value.items.length === 0 && !activeState.value.isLoading)
    loadActiveTab(true)
})

function initPageAction() {
  handleReachBottom.value = async () => {
    await handleLoadMore()
  }

  handlePageRefresh.value = async () => {
    await initData()
  }
}

function resetState(tab: MomentTab) {
  const state = tabStates[tab]
  state.items = []
  state.isLoading = false
  state.noMoreContent = false
  state.needToLoginFirst = false
  state.requestFailed = false
  state.offset = ''
  state.updateBaseline = ''
  state.livePage = 1
  state.collaborativeVideoMap.clear()
}

async function initData() {
  resetState(selectedTab.value)
  if (!needToLoginFirst.value)
    await loadActiveTab(true)
}

async function handleLoadMore() {
  if (needToLoginFirst.value)
    return
  await loadActiveTab(false)
}

async function loadActiveTab(initial: boolean) {
  if (selectedTab.value === 'live') {
    await loadLiveMoments()
    return
  }

  const maxPages = selectedTab.value === 'article'
    ? (initial ? 4 : 3)
    : (initial ? 2 : 1)
  await loadNavMoments(selectedTab.value, maxPages)
}

function matchesNavTab(item: any, tab: Exclude<MomentTab, 'live'>) {
  const sourceType = Number(item?.type)
  if (tab === 'article')
    return sourceType === 64
  return sourceType === 8
}

function isNormalizedMoment(item: NormalizedMomentItem | undefined): item is NormalizedMomentItem {
  return Boolean(item)
}

function appendUniqueItems(state: MomentTabState, items: NormalizedMomentItem[]) {
  const seen = new Set(state.items.map(item => item.id))
  const nextItems = items.filter((item) => {
    if (!item.id || seen.has(item.id))
      return false
    seen.add(item.id)
    return true
  })

  state.items.push(...nextItems)
  return nextItems.length
}

async function loadNavMoments(tab: Exclude<MomentTab, 'live'>, maxPages: number) {
  const state = tabStates[tab]
  if (state.isLoading || state.noMoreContent)
    return

  state.isLoading = true
  state.requestFailed = false

  try {
    let loadedPages = 0
    let addedItems = 0

    while (loadedPages < maxPages && !state.noMoreContent) {
      const previousOffset = state.offset
      const response = await api.moment.getTopBarMoments({
        type: 'video',
        update_baseline: state.updateBaseline || undefined,
        offset: state.offset || undefined,
      })

      if (response.code === -101) {
        state.needToLoginFirst = true
        state.noMoreContent = true
        break
      }

      if (response.code !== 0)
        throw new Error(response.message || `Moments API failed: ${response.code}`)

      const data = response.data || {}
      const rawItems = Array.isArray(data.items) ? data.items : []
      const filteredItems = rawItems.filter((item: any) => matchesNavTab(item, tab))
      const processedItems = tab === 'video'
        ? mergeCollaborativeVideos(filteredItems, state.collaborativeVideoMap)
        : filteredItems

      const normalizedItems = processedItems
        .map((item: any) => normalizeNavMomentItem(item, tab))
        .filter(isNormalizedMoment)

      if (tab === 'video') {
        normalizedItems.forEach((momentItem) => {
          if (!momentItem.bvid)
            return
          const entry = state.collaborativeVideoMap.get(momentItem.bvid)
          if (!entry)
            return
          entry.moment = momentItem
          updateMomentCollaborative(momentItem, entry.item)
        })
      }

      addedItems += appendUniqueItems(state, normalizedItems)

      const nextOffset = typeof data.offset === 'string' ? data.offset : ''
      if (typeof data.update_baseline === 'string')
        state.updateBaseline = data.update_baseline
      if (nextOffset)
        state.offset = nextOffset

      loadedPages++

      if (!data.has_more || rawItems.length === 0 || nextOffset === '0' || (previousOffset && nextOffset === previousOffset))
        state.noMoreContent = true

      if (tab === 'article' && addedItems === 0 && !state.noMoreContent)
        continue
    }
  }
  catch (error) {
    console.error('[BewlyScript] Failed to load moments:', error)
    state.requestFailed = true
  }
  finally {
    state.isLoading = false
  }
}

async function loadLiveMoments() {
  const state = tabStates.live
  if (state.isLoading || state.noMoreContent)
    return

  state.isLoading = true
  state.requestFailed = false

  try {
    const response = await api.moment.getTopBarLiveMoments({
      page: state.livePage,
      pagesize: LIVE_PAGE_SIZE,
    })

    if (response.code === -101) {
      state.needToLoginFirst = true
      state.noMoreContent = true
      return
    }

    if (response.code !== 0)
      throw new Error(response.message || `Live moments API failed: ${response.code}`)

    const list = Array.isArray(response.data?.list) ? response.data.list : []
    const normalizedItems = list.map(normalizeLiveMomentItem).filter(isNormalizedMoment)
    appendUniqueItems(state, normalizedItems)

    if (list.length < LIVE_PAGE_SIZE)
      state.noMoreContent = true
    else
      state.livePage++
  }
  catch (error) {
    console.error('[BewlyScript] Failed to load live moments:', error)
    state.requestFailed = true
  }
  finally {
    state.isLoading = false
  }
}

function toAuthor(item: NormalizedMomentItem): Author | Author[] | undefined {
  if (item.authors?.length) {
    const authors = item.authors.map(author => ({
      name: author.name,
      authorFace: author.face,
      authorUrl: author.jump_url,
      mid: author.mid,
    }))
    return authors.length === 1 ? authors[0] : authors
  }

  if (!item.author && !item.authorFace)
    return undefined

  return {
    name: item.author,
    authorFace: item.authorFace,
    authorUrl: item.authorJumpUrl,
  }
}

function getNumericId(item: NormalizedMomentItem) {
  const id = item.aid ?? item.rid ?? item.roomid ?? Number.parseInt(item.id, 10)
  return Number.isFinite(id) ? id : 0
}

function transformMomentCard(item: NormalizedMomentItem): Video {
  const isLive = item.kind === 'live'

  return {
    id: getNumericId(item),
    title: item.title,
    cover: item.cover,
    author: toAuthor(item),
    viewStr: item.viewStr,
    danmakuStr: item.danmakuStr,
    likeStr: item.likeStr,
    capsuleText: isLive ? '直播中' : item.pubTime,
    publishedTimestamp: item.pubTimestamp,
    bvid: item.bvid,
    aid: item.aid,
    roomid: item.roomid,
    url: item.link,
    liveStatus: isLive ? 1 : undefined,
    tag: item.isCollaborative ? '联合投稿' : isLive ? '直播中' : undefined,
    threePointV2: [],
  }
}

function getMomentKey(item: NormalizedMomentItem, index?: number) {
  return item.id || `${item.kind}-${index ?? 0}`
}

function openOriginalPage() {
  openLinkToNewTab(ORIGINAL_MOMENTS_URL)
}

function jumpToLoginPage() {
  openBilibiliLoginPage()
}
</script>

<template>
  <div class="moments-page">
    <header class="moments-header">
      <div class="moments-heading">
        <h1>动态</h1>
        <span>关注更新</span>
      </div>

      <nav class="moments-tabs" aria-label="动态分类">
        <button
          v-for="tab in momentTabs"
          :key="tab.key"
          class="moments-tab"
          :class="{ active: selectedTab === tab.key }"
          :disabled="activeState.isLoading"
          type="button"
          @click="selectedTab = tab.key"
        >
          <span :class="tab.icon" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="moments-actions">
        <button
          class="moments-icon-button"
          type="button"
          :disabled="activeState.isLoading || needToLoginFirst"
          title="刷新"
          @click="initData"
        >
          <span i-mingcute:refresh-2-line />
        </button>
        <button
          class="moments-original-button"
          type="button"
          title="查看原站"
          @click="openOriginalPage"
        >
          <span i-mingcute:external-link-line />
          <span>查看原站</span>
        </button>
      </div>
    </header>

    <section v-if="needToLoginFirst" class="moments-state-panel">
      <div class="moments-state-icon" i-mingcute:user-follow-line />
      <h2>登录后查看动态</h2>
      <button type="button" class="moments-primary-button" @click="jumpToLoginPage">
        登录
      </button>
    </section>

    <section v-else-if="isArticleTab" class="moments-content">
      <Loading
        v-if="activeState.isLoading && activeState.items.length === 0"
        h="full"
        flex="~"
        items="center"
      />

      <Empty
        v-else-if="!activeState.isLoading && activeState.items.length === 0"
        :description="activeState.requestFailed ? '加载失败' : '暂无专栏动态'"
      >
        <button type="button" class="moments-primary-button" @click="initData">
          重试
        </button>
      </Empty>

      <div v-else class="article-grid">
        <a
          v-for="article in activeState.items"
          :key="article.id"
          class="article-card"
          :href="article.link || ORIGINAL_MOMENTS_URL"
          target="_blank"
          rel="noreferrer"
        >
          <div class="article-cover">
            <img v-if="article.cover" :src="`${article.cover}@420w_236h_1c`" alt="">
            <span v-else i-mingcute:document-line />
          </div>
          <div class="article-body">
            <div class="article-title">
              {{ article.title }}
            </div>
            <div class="article-meta">
              <img v-if="article.authorFace" :src="`${article.authorFace}@48w_48h_1c`" alt="">
              <span>{{ article.author }}</span>
              <span v-if="article.pubTime">{{ article.pubTime }}</span>
            </div>
          </div>
        </a>
      </div>

      <Loading v-if="activeState.isLoading && activeState.items.length > 0" m="y-5" />
      <Empty v-if="activeState.noMoreContent && activeState.items.length > 0" :description="$t('common.no_more_content')" />
    </section>

    <section v-else class="moments-content">
      <VideoCardGrid
        :items="activeState.items"
        :transform-item="transformMomentCard"
        :get-item-key="getMomentKey"
        grid-layout="adaptive"
        :loading="activeState.isLoading"
        :no-more-content="activeState.noMoreContent"
        :need-to-login-first="activeState.needToLoginFirst"
        :request-failed="activeState.requestFailed"
        :empty-description="activeState.requestFailed ? '加载失败' : '暂无动态'"
        :show-watch-later="false"
        :more-btn="false"
        show-preview
        enable-row-padding
        @refresh="initData"
        @login="jumpToLoginPage"
        @load-more="handleLoadMore"
      />
    </section>
  </div>
</template>

<style lang="scss" scoped>
.moments-page {
  min-height: 100%;
  padding: 0 24px 32px;
  color: var(--bew-text-1);
}

.moments-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(280px, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 18px 0 16px;
  background: color-mix(in srgb, var(--bew-bg) 86%, transparent);
  backdrop-filter: var(--bew-filter-glass-1);
}

.moments-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1.2;
    letter-spacing: 0;
  }

  span {
    color: var(--bew-text-2);
    font-size: 14px;
    white-space: nowrap;
  }
}

.moments-tabs {
  display: inline-flex;
  justify-self: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
}

.moments-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  min-width: 82px;
  justify-content: center;
  padding: 0 14px;
  border: 0;
  border-radius: calc(var(--bew-radius) - 2px);
  background: transparent;
  color: var(--bew-text-2);
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    color: var(--bew-text-1);
  }

  &.active {
    background: var(--bew-content);
    color: var(--bew-text-1);
    box-shadow: var(--bew-shadow-1);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.72;
  }
}

.moments-actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: 10px;
}

.moments-icon-button,
.moments-original-button,
.moments-primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background: var(--bew-content);
  color: var(--bew-text-1);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    border-color: var(--bew-theme-color);
    color: var(--bew-theme-color);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.moments-icon-button {
  width: 38px;
  height: 38px;
  font-size: 20px;
}

.moments-original-button,
.moments-primary-button {
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  font-weight: 700;
}

.moments-content {
  min-height: 420px;
}

.moments-state-panel {
  min-height: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;

  h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0;
  }
}

.moments-state-icon {
  font-size: 48px;
  color: var(--bew-theme-color);
}

.article-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}

.article-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background: var(--bew-content);
  color: var(--bew-text-1);
  text-decoration: none;
  box-shadow: var(--bew-shadow-1);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--bew-theme-color);
    box-shadow: var(--bew-shadow-2);
  }
}

.article-cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  background: var(--bew-fill-1);
  color: var(--bew-text-2);
  font-size: 42px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.article-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}

.article-title {
  min-height: 44px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
  word-break: break-word;
}

.article-meta {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: var(--bew-text-2);
  font-size: 13px;

  img {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    flex: 0 0 auto;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 860px) {
  .moments-page {
    padding: 0 12px 24px;
  }

  .moments-header {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .moments-tabs {
    justify-self: stretch;
    overflow-x: auto;
  }

  .moments-tab {
    flex: 1 0 auto;
  }

  .moments-actions {
    justify-content: flex-start;
  }
}
</style>
