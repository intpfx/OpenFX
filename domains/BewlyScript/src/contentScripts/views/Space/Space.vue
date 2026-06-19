<script lang="ts" setup>
import { useEventListener, useTitle } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { getCSRF } from '~/utils/main'
import api from '~/utils/api'
import { normalizeNavMomentItem, type NormalizedMomentItem } from '~/utils/moments'
import { openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { parseMobileRoute } from '~/userscript/mobile-route'

interface SpaceVideoItem {
  aid?: number
  bvid?: string
  title: string
  pic: string
  length?: string
  play?: number
  comment?: number
  created?: number
}

interface SpaceInfo {
  mid?: number
  name?: string
  face?: string
  sign?: string
  official?: {
    title?: string
    desc?: string
    type?: number
  }
  vip?: {
    label?: {
      text?: string
    }
  }
  level?: number
  following?: boolean
  is_followed?: boolean
}

type SpaceTab = 'videos' | 'moments'

const { handleReachBottom } = useBewlyApp()

const loading = ref(false)
const loadingMore = ref(false)
const errorMessage = ref('')
const activeTab = ref<SpaceTab>('videos')
const mid = ref('')
const info = ref<SpaceInfo | null>(null)
const stat = ref<Record<string, any>>({})
const videos = ref<SpaceVideoItem[]>([])
const moments = ref<NormalizedMomentItem[]>([])
const nextMomentOffset = ref('')
const videosPage = ref(1)
const noMoreVideos = ref(false)
const noMoreMoments = ref(false)
const followLoading = ref(false)

const originalUrl = computed(() => mid.value ? `https://m.bilibili.com/space/${mid.value}` : 'https://m.bilibili.com/')
const authorName = computed(() => info.value?.name || `用户 ${mid.value || ''}`)
const isFollowing = ref(false)
const hasProfile = computed(() => !!info.value)
const canLoadMore = computed(() => activeTab.value === 'videos' ? !noMoreVideos.value : !noMoreMoments.value)

useTitle(computed(() => `${authorName.value} - BewlyScript`))

function normalizePic(url: string | undefined) {
  if (!url)
    return ''
  return url.startsWith('//') ? `https:${url}` : url
}

function formatCount(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number.parseInt(`${value || 0}`, 10)
  if (!Number.isFinite(numberValue))
    return '0'
  if (numberValue >= 100000000)
    return `${(numberValue / 100000000).toFixed(1)}亿`
  if (numberValue >= 10000)
    return `${(numberValue / 10000).toFixed(1)}万`
  return `${numberValue}`
}

function formatDate(value?: number) {
  if (!value)
    return ''
  const date = new Date(value * 1000)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getCurrentMid() {
  const route = parseMobileRoute()
  return route.kind === 'space' ? route.mid : ''
}

function extractVideos(response: any): SpaceVideoItem[] {
  const list = response?.data?.list?.vlist
    ?? response?.data?.list
    ?? response?.list?.vlist
    ?? []

  return Array.isArray(list)
    ? list.map((item: any) => ({
      aid: item.aid,
      bvid: item.bvid,
      title: item.title || '未命名视频',
      pic: normalizePic(item.pic),
      length: item.length,
      play: item.play,
      comment: item.comment,
      created: item.created,
    }))
    : []
}

function extractMoments(response: any): NormalizedMomentItem[] {
  const items = response?.data?.items ?? response?.data?.list ?? []
  return Array.isArray(items)
    ? items.map((item: any) => normalizeNavMomentItem(item)).filter(Boolean) as NormalizedMomentItem[]
    : []
}

function syncFollowingState() {
  isFollowing.value = Boolean(info.value?.following || info.value?.is_followed)
}

async function loadVideosPage(page: number) {
  const response = await api.user.getUserVideos({
    mid: mid.value,
    ps: 30,
    pn: page,
    order: 'pubdate',
    tid: 0,
  })

  if (response.code !== 0)
    throw new Error(response.message || `视频列表加载失败：${response.code}`)

  const newVideos = extractVideos(response)
  noMoreVideos.value = newVideos.length < 30
  if (page === 1)
    videos.value = newVideos
  else
    videos.value.push(...newVideos)
}

async function loadMoments(offset = '') {
  const response = await api.moment.getUserMoments({
    host_mid: mid.value,
    offset,
    features: 'itemOpusStyle',
  })

  if (response.code !== 0)
    throw new Error(response.message || `动态加载失败：${response.code}`)

  const newMoments = extractMoments(response)
  nextMomentOffset.value = response.data?.offset || ''
  noMoreMoments.value = !nextMomentOffset.value || newMoments.length === 0
  if (!offset)
    moments.value = newMoments
  else
    moments.value.push(...newMoments)
}

async function loadSpace() {
  const currentMid = getCurrentMid()
  if (!currentMid) {
    errorMessage.value = '无法识别空间用户 ID'
    return
  }

  mid.value = currentMid
  loading.value = true
  errorMessage.value = ''
  videosPage.value = 1
  noMoreVideos.value = false
  noMoreMoments.value = false
  nextMomentOffset.value = ''

  try {
    const [infoResponse, statResponse] = await Promise.all([
      api.user.getSpaceInfo({ mid: currentMid }),
      api.user.getSpaceStat({ vmid: currentMid }),
    ])

    if (infoResponse.code !== 0)
      throw new Error(infoResponse.message || `空间资料加载失败：${infoResponse.code}`)

    info.value = infoResponse.data
    stat.value = statResponse.code === 0 ? statResponse.data : {}
    syncFollowingState()

    await Promise.all([
      loadVideosPage(1),
      loadMoments(''),
    ])
  }
  catch (error) {
    console.error('[BewlyScript] Failed to load space:', error)
    errorMessage.value = error instanceof Error ? error.message : '空间加载失败'
  }
  finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || loadingMore.value || !mid.value || !canLoadMore.value)
    return

  loadingMore.value = true
  try {
    if (activeTab.value === 'videos') {
      videosPage.value += 1
      await loadVideosPage(videosPage.value)
    }
    else {
      await loadMoments(nextMomentOffset.value)
    }
  }
  catch (error) {
    console.error('[BewlyScript] Failed to load more space content:', error)
  }
  finally {
    loadingMore.value = false
  }
}

async function toggleFollow() {
  if (!mid.value || followLoading.value)
    return

  const csrf = getCSRF()
  if (!csrf) {
    errorMessage.value = '登录后才能关注用户'
    return
  }

  followLoading.value = true
  try {
    const nextState = !isFollowing.value
    const response = await api.user.relationModify({
      fid: mid.value,
      act: nextState ? 1 : 2,
      re_src: 11,
      csrf,
    })

    if (response.code !== 0)
      throw new Error(response.message || `关注操作失败：${response.code}`)

    isFollowing.value = nextState
  }
  catch (error) {
    console.error('[BewlyScript] Failed to modify relation:', error)
    errorMessage.value = error instanceof Error ? error.message : '关注操作失败'
  }
  finally {
    followLoading.value = false
  }
}

function openVideo(video: SpaceVideoItem) {
  if (video.bvid)
    openMobileUrlInCurrentPage(`https://m.bilibili.com/video/${video.bvid}`)
}

function openMoment(moment: NormalizedMomentItem) {
  if (moment.bvid) {
    openMobileUrlInCurrentPage(`https://m.bilibili.com/video/${moment.bvid}`)
    return
  }

  if (moment.link)
    openMobileUrlInCurrentPage(moment.link)
}

function openOriginalPage() {
  location.href = originalUrl.value
}

useEventListener(window, 'pushstate', loadSpace)
useEventListener(window, 'popstate', loadSpace)

watch(activeTab, () => {
  handleReachBottom.value = loadMore
})

onMounted(() => {
  handleReachBottom.value = loadMore
  void loadSpace()
})

onUnmounted(() => {
  handleReachBottom.value = () => {}
})
</script>

<template>
  <main class="mobile-space-page">
    <section v-if="loading && !hasProfile" class="space-state">
      <div class="space-spinner" />
      <p>正在加载空间</p>
    </section>

    <section v-else-if="errorMessage && !hasProfile" class="space-state">
      <div class="space-state-icon" i-mingcute:warning-line />
      <p>{{ errorMessage }}</p>
      <div class="space-state-actions">
        <button type="button" class="space-primary-button" @click="loadSpace">
          重试
        </button>
        <button type="button" class="space-secondary-button" @click="openOriginalPage">
          原站打开
        </button>
      </div>
    </section>

    <template v-else>
      <header class="space-hero">
        <div class="space-profile-row">
          <img class="space-avatar" :src="normalizePic(info?.face)" alt="" referrerpolicy="no-referrer">
          <div class="space-profile-main">
            <h1>{{ authorName }}</h1>
            <div class="space-badges">
              <span v-if="info?.official?.title">{{ info.official.title }}</span>
              <span v-if="info?.vip?.label?.text">{{ info.vip.label.text }}</span>
              <span v-if="typeof info?.level === 'number'">LV{{ info.level }}</span>
            </div>
          </div>
          <button
            type="button"
            class="space-follow-button"
            :class="{ 'space-follow-button--active': isFollowing }"
            :disabled="followLoading"
            @click="toggleFollow"
          >
            {{ followLoading ? '处理中' : isFollowing ? '已关注' : '关注' }}
          </button>
        </div>

        <p v-if="info?.sign" class="space-sign">
          {{ info.sign }}
        </p>

        <div class="space-stats">
          <div>
            <strong>{{ formatCount(stat.following) }}</strong>
            <span>关注</span>
          </div>
          <div>
            <strong>{{ formatCount(stat.follower) }}</strong>
            <span>粉丝</span>
          </div>
          <div>
            <strong>{{ formatCount(stat.like_num ?? stat.likes) }}</strong>
            <span>获赞</span>
          </div>
        </div>
      </header>

      <nav class="space-tabs" aria-label="空间内容">
        <button
          type="button"
          class="space-tab"
          :class="{ 'space-tab--active': activeTab === 'videos' }"
          @click="activeTab = 'videos'"
        >
          视频
        </button>
        <button
          type="button"
          class="space-tab"
          :class="{ 'space-tab--active': activeTab === 'moments' }"
          @click="activeTab = 'moments'"
        >
          动态
        </button>
        <button type="button" class="space-original-button" @click="openOriginalPage">
          原站
        </button>
      </nav>

      <p v-if="errorMessage" class="space-inline-error">
        {{ errorMessage }}
      </p>

      <section v-show="activeTab === 'videos'" class="space-video-list">
        <button
          v-for="video in videos"
          :key="video.bvid || video.aid"
          type="button"
          class="space-video-card"
          @click="openVideo(video)"
        >
          <div class="space-video-cover">
            <img v-if="video.pic" :src="video.pic" alt="" referrerpolicy="no-referrer">
            <span v-if="video.length" class="space-video-duration">{{ video.length }}</span>
          </div>
          <div class="space-video-body">
            <h2>{{ video.title }}</h2>
            <div class="space-video-meta">
              <span i-mingcute:play-circle-line />
              <span>{{ formatCount(video.play) }}</span>
              <span>{{ formatDate(video.created) }}</span>
            </div>
          </div>
        </button>

        <div v-if="!loading && videos.length === 0" class="space-empty">
          暂无投稿视频
        </div>
      </section>

      <section v-show="activeTab === 'moments'" class="space-moment-list">
        <button
          v-for="moment in moments"
          :key="moment.id"
          type="button"
          class="space-moment-card"
          @click="openMoment(moment)"
        >
          <img v-if="moment.cover" class="space-moment-cover" :src="moment.cover" alt="" referrerpolicy="no-referrer">
          <div class="space-moment-body">
            <div class="space-moment-type">
              {{ moment.kind === 'article' ? '专栏' : moment.kind === 'live' ? '直播' : '视频动态' }}
            </div>
            <h2>{{ moment.title }}</h2>
            <div class="space-video-meta">
              <span>{{ moment.pubTime }}</span>
              <span v-if="moment.viewStr">{{ moment.viewStr }}播放</span>
            </div>
          </div>
        </button>

        <div v-if="!loading && moments.length === 0" class="space-empty">
          暂无动态
        </div>
      </section>

      <div v-if="loadingMore" class="space-loading-more">
        加载中
      </div>
      <div v-else-if="!canLoadMore" class="space-loading-more">
        已经到底了
      </div>
    </template>
  </main>
</template>

<style lang="scss" scoped>
.mobile-space-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 760px;
  min-height: calc(100dvh - var(--bew-top-bar-height) - 120px);
  margin: 0 auto;
  color: var(--bew-text-1);
}

.space-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 54dvh;
  color: var(--bew-text-2);
  text-align: center;
}

.space-state-icon {
  width: 44px;
  height: 44px;
  color: var(--bew-theme-color);
}

.space-state-actions {
  display: flex;
  gap: 10px;
}

.space-spinner {
  width: 34px;
  height: 34px;
  border: 3px solid var(--bew-fill-2);
  border-top-color: var(--bew-theme-color);
  border-radius: 999px;
  animation: space-spin 0.85s linear infinite;
}

.space-hero {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: 18px;
}

.space-profile-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.space-avatar {
  width: 68px;
  height: 68px;
  object-fit: cover;
  background: var(--bew-fill-2);
  border-radius: 50%;
}

.space-profile-main {
  min-width: 0;

  h1 {
    margin: 0;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.space-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;

  span {
    padding: 3px 8px;
    color: var(--bew-text-2);
    font-size: 11px;
    line-height: 1.2;
    background: var(--bew-fill-2);
    border-radius: 999px;
  }
}

.space-follow-button,
.space-primary-button,
.space-secondary-button,
.space-original-button {
  min-height: 36px;
  padding: 0 14px;
  color: var(--bew-text-1);
  font-weight: 600;
  background: var(--bew-fill-2);
  border: 0;
  border-radius: 999px;
}

.space-follow-button {
  color: white;
  background: var(--bew-theme-color);
}

.space-follow-button--active,
.space-secondary-button,
.space-original-button {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.space-sign {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: 13px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.space-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  div {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 10px;
    text-align: center;
    background: var(--bew-fill-1);
    border-radius: 14px;
  }

  strong {
    color: var(--bew-text-1);
    font-size: 16px;
  }

  span {
    color: var(--bew-text-3);
    font-size: 12px;
  }
}

.space-tabs {
  position: sticky;
  top: calc(env(safe-area-inset-top, 0px) + var(--bew-top-bar-height) + 4px);
  z-index: 2;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  background: color-mix(in oklab, var(--bew-bg) 88%, transparent);
  border: 1px solid var(--bew-border-color);
  border-radius: 16px;
  backdrop-filter: blur(14px);
}

.space-tab {
  flex: 1 1 0;
  min-height: 38px;
  color: var(--bew-text-2);
  font-weight: 700;
  background: transparent;
  border: 0;
  border-radius: 12px;
}

.space-tab--active {
  color: var(--bew-text-1);
  background: var(--bew-elevated-solid);
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
}

.space-original-button {
  flex: 0 0 auto;
}

.space-inline-error {
  margin: 0;
  padding: 10px 12px;
  color: var(--bew-error-color);
  font-size: 13px;
  background: color-mix(in oklab, var(--bew-error-color) 12%, transparent);
  border-radius: 12px;
}

.space-video-list,
.space-moment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.space-video-card,
.space-moment-card {
  display: grid;
  grid-template-columns: 142px minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  padding: 0;
  overflow: hidden;
  color: inherit;
  text-align: left;
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: 16px;
}

.space-video-cover,
.space-moment-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--bew-fill-2);
}

.space-moment-cover {
  height: 100%;
  object-fit: cover;
}

.space-video-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.space-video-duration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 6px;
  color: white;
  font-size: 11px;
  background: rgb(0 0 0 / 62%);
  border-radius: 6px;
}

.space-video-body,
.space-moment-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px 10px 10px 0;

  h2 {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: 14px;
    font-weight: 650;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}

.space-moment-type {
  width: fit-content;
  padding: 2px 7px;
  color: var(--bew-theme-color);
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in oklab, var(--bew-theme-color) 12%, transparent);
  border-radius: 999px;
}

.space-video-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  color: var(--bew-text-3);
  font-size: 12px;

  span[i-mingcute\:play-circle-line] {
    width: 14px;
    height: 14px;
  }
}

.space-empty,
.space-loading-more {
  padding: 24px 12px;
  color: var(--bew-text-3);
  font-size: 13px;
  text-align: center;
}

@keyframes space-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (width <= 430px) {
  .mobile-space-page {
    gap: 12px;
  }

  .space-hero {
    padding: 14px;
    border-radius: 16px;
  }

  .space-avatar {
    width: 58px;
    height: 58px;
  }

  .space-profile-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .space-follow-button {
    grid-column: 2;
    width: fit-content;
  }

  .space-video-card,
  .space-moment-card {
    grid-template-columns: 128px minmax(0, 1fr);
  }
}
</style>
