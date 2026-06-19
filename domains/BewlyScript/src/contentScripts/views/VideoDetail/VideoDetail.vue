<script setup lang="ts">
import { useEventListener, useTitle } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { parseDanmakuXml, parseMobileVideoUrl, selectPlayableVideoUrl, type MobileDanmakuItem } from '~/userscript/mobile-video'
import api from '~/utils/api'

const loading = ref(false)
const error = ref('')
const videoInfo = ref<any>()
const comments = ref<any[]>([])
const danmakuItems = ref<MobileDanmakuItem[]>([])
const playUrl = ref('')
const currentBvid = ref('')
const selectedCid = ref<number>()
const selectedQuality = ref<number>(80)
const qualityOptions = ref<Array<{ quality: number, label: string }>>([])
const videoRef = ref<HTMLVideoElement>()
const shellRef = ref<HTMLElement>()
const playing = ref(false)
const muted = ref(false)
const duration = ref(0)
const currentTime = ref(0)
const playbackRate = ref(1)
const danmakuEnabled = ref(true)
const danmakuOpacity = ref(0.86)
const danmakuSize = ref(14)

const videoPages = computed(() => videoInfo.value?.pages ?? [])
const owner = computed(() => videoInfo.value?.owner)
const title = computed(() => videoInfo.value?.title || '视频详情')
const originalUrl = computed(() => currentBvid.value ? `https://m.bilibili.com/video/${currentBvid.value}` : location.href)
const progress = computed(() => duration.value > 0 ? currentTime.value / duration.value * 100 : 0)

const visibleDanmaku = computed(() => {
  if (!danmakuEnabled.value)
    return []

  return danmakuItems.value
    .filter(item => item.time <= currentTime.value && currentTime.value - item.time <= 4)
    .slice(-10)
})

useTitle(computed(() => `${title.value} - BewlyScript`))

function formatNumber(value: unknown): string {
  const number = Number(value)
  if (!Number.isFinite(number))
    return '0'
  if (number >= 10000)
    return `${(number / 10000).toFixed(number >= 100000 ? 0 : 1)}万`
  return String(number)
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0)
    return '00:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

async function loadVideoDetail() {
  const route = parseMobileVideoUrl(location.href)
  if (!route) {
    error.value = '无法解析当前视频地址'
    return
  }

  loading.value = true
  error.value = ''
  currentBvid.value = route.bvid
  try {
    const response = await api.video.getVideoInfo({ bvid: route.bvid })
    if (response?.code !== 0 || !response?.data)
      throw new Error(response?.message || '视频信息加载失败')

    videoInfo.value = response.data
    const matchedPage = response.data.pages?.find((page: any) => Number(page.cid) === route.cid)
      ?? response.data.pages?.find((page: any) => Number(page.page) === route.page)
      ?? response.data.pages?.[0]
    selectedCid.value = Number(matchedPage?.cid || response.data.cid)

    await Promise.all([
      loadPlayUrl(),
      loadDanmaku(),
      loadComments(),
    ])
  }
  catch (err) {
    error.value = err instanceof Error ? err.message : '视频详情加载失败'
  }
  finally {
    loading.value = false
  }
}

async function loadPlayUrl() {
  if (!currentBvid.value || !selectedCid.value)
    return

  const previousTime = currentTime.value
  playUrl.value = ''
  const response = await api.video.getVideoPreview({
    bvid: currentBvid.value,
    cid: selectedCid.value,
    qn: selectedQuality.value,
  })
  const playable = selectPlayableVideoUrl(response)
  if (!playable)
    throw new Error('没有可播放的视频流')

  playUrl.value = playable.url
  const formats = response?.data?.support_formats
  if (Array.isArray(formats)) {
    qualityOptions.value = formats
      .map((format: any) => ({
        quality: Number(format.quality),
        label: format.new_description || format.display_desc || `${format.quality}P`,
      }))
      .filter((format: { quality: number }) => Number.isFinite(format.quality))
  }
  if (playable.quality)
    selectedQuality.value = playable.quality

  await nextTick()
  if (videoRef.value && previousTime > 0)
    videoRef.value.currentTime = Math.min(previousTime, videoRef.value.duration || previousTime)
}

async function loadDanmaku() {
  if (!selectedCid.value)
    return

  try {
    const xml = await api.video.getDanmakuXml({ oid: selectedCid.value })
    danmakuItems.value = typeof xml === 'string' ? parseDanmakuXml(xml) : []
  }
  catch {
    danmakuItems.value = []
  }
}

async function loadComments() {
  const aid = videoInfo.value?.aid
  if (!aid)
    return

  try {
    const response = await api.video.getVideoComments({ oid: aid, type: 1, pn: 1, ps: 12 })
    comments.value = [
      ...(response?.data?.hots ?? []),
      ...(response?.data?.replies ?? []),
    ].slice(0, 12)
  }
  catch {
    comments.value = []
  }
}

async function changePage(cid: number) {
  if (cid === selectedCid.value)
    return
  selectedCid.value = cid
  currentTime.value = 0
  await Promise.all([loadPlayUrl(), loadDanmaku()])
}

async function changeQuality() {
  await loadPlayUrl()
}

function togglePlayback() {
  const video = videoRef.value
  if (!video)
    return
  if (video.paused)
    void video.play()
  else
    video.pause()
}

function seek(event: Event) {
  const video = videoRef.value
  const value = Number((event.target as HTMLInputElement).value)
  if (!video || !Number.isFinite(value))
    return
  video.currentTime = value / 100 * (duration.value || 0)
}

function setRate(event: Event) {
  const rate = Number((event.target as HTMLSelectElement).value)
  if (!videoRef.value || !Number.isFinite(rate))
    return
  playbackRate.value = rate
  videoRef.value.playbackRate = rate
}

function toggleMute() {
  if (!videoRef.value)
    return
  videoRef.value.muted = !videoRef.value.muted
  muted.value = videoRef.value.muted
}

async function enterFullscreen() {
  const target = shellRef.value ?? videoRef.value
  if (target?.requestFullscreen)
    await target.requestFullscreen()
}

async function enterPictureInPicture() {
  const video = videoRef.value
  if (video && document.pictureInPictureEnabled && !video.disablePictureInPicture)
    await video.requestPictureInPicture()
}

function openOriginalPage() {
  location.href = originalUrl.value
}

function goBack() {
  if (history.length > 1) {
    history.back()
    return
  }
  location.href = 'https://m.bilibili.com/'
}

useEventListener(window, 'pushstate', loadVideoDetail)
useEventListener(window, 'popstate', loadVideoDetail)

watch(selectedCid, () => {
  const url = new URL(location.href)
  if (selectedCid.value)
    url.searchParams.set('cid', String(selectedCid.value))
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
})

onMounted(loadVideoDetail)
</script>

<template>
  <section class="mobile-video-detail">
    <header class="mobile-video-header">
      <button type="button" class="icon-button" aria-label="返回" @click="goBack">
        <div i-mingcute:left-line />
      </button>
      <div class="mobile-video-header__title">
        {{ title }}
      </div>
      <button type="button" class="icon-button" aria-label="原站打开" @click="openOriginalPage">
        <div i-mingcute:external-link-line />
      </button>
    </header>

    <div v-if="loading" class="mobile-video-state">
      正在加载视频
    </div>

    <div v-else-if="error" class="mobile-video-state mobile-video-state--error">
      <p>{{ error }}</p>
      <button type="button" @click="openOriginalPage">
        用原站打开
      </button>
    </div>

    <template v-else>
      <div ref="shellRef" class="mobile-video-player">
        <video
          ref="videoRef"
          class="mobile-video-player__media"
          :src="playUrl"
          playsinline
          preload="metadata"
          @play="playing = true"
          @pause="playing = false"
          @loadedmetadata="duration = videoRef?.duration || 0"
          @timeupdate="currentTime = videoRef?.currentTime || 0"
          @volumechange="muted = !!videoRef?.muted"
          @click="togglePlayback"
        />

        <div v-if="danmakuEnabled" class="mobile-danmaku-layer" :style="{ '--danmaku-opacity': danmakuOpacity, '--danmaku-size': `${danmakuSize}px` }">
          <div
            v-for="(item, index) in visibleDanmaku"
            :key="`${item.time}-${index}-${item.text}`"
            class="mobile-danmaku-item"
            :style="{ top: `${8 + (index % 8) * 11}%` }"
          >
            {{ item.text }}
          </div>
        </div>

        <div class="mobile-video-controls">
          <div class="mobile-video-controls__row">
            <button type="button" class="control-button" @click="togglePlayback">
              <div :class="playing ? 'i-mingcute:pause-fill' : 'i-mingcute:play-fill'" />
            </button>
            <span class="time-label">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
            <button type="button" class="control-button" @click="toggleMute">
              <div :class="muted ? 'i-mingcute:volume-mute-fill' : 'i-mingcute:volume-fill'" />
            </button>
            <button type="button" class="control-button" @click="enterPictureInPicture">
              <div i-mingcute:pic-line />
            </button>
            <button type="button" class="control-button" @click="enterFullscreen">
              <div i-mingcute:fullscreen-line />
            </button>
          </div>

          <input class="progress-range" type="range" min="0" max="100" step="0.1" :value="progress" @input="seek">

          <div class="mobile-video-controls__row mobile-video-controls__row--settings">
            <select v-model.number="selectedQuality" class="mobile-select" @change="changeQuality">
              <option v-for="quality in qualityOptions" :key="quality.quality" :value="quality.quality">
                {{ quality.label }}
              </option>
            </select>
            <select class="mobile-select" :value="playbackRate" @change="setRate">
              <option :value="0.75">0.75x</option>
              <option :value="1">1.0x</option>
              <option :value="1.25">1.25x</option>
              <option :value="1.5">1.5x</option>
              <option :value="2">2.0x</option>
            </select>
            <label class="mobile-toggle">
              <input v-model="danmakuEnabled" type="checkbox">
              弹幕
            </label>
          </div>
        </div>
      </div>

      <article class="mobile-video-info">
        <h1>{{ title }}</h1>
        <div class="mobile-video-meta">
          <span>{{ formatNumber(videoInfo?.stat?.view) }} 播放</span>
          <span>{{ formatNumber(videoInfo?.stat?.danmaku) }} 弹幕</span>
          <span>{{ formatNumber(videoInfo?.stat?.like) }} 点赞</span>
        </div>

        <a v-if="owner" class="mobile-video-owner" :href="`https://m.bilibili.com/space/${owner.mid}`">
          <img :src="owner.face" :alt="owner.name">
          <div>
            <strong>{{ owner.name }}</strong>
            <span>进入空间</span>
          </div>
        </a>

        <div v-if="videoPages.length > 1" class="mobile-video-pages">
          <button
            v-for="page in videoPages"
            :key="page.cid"
            type="button"
            :class="{ active: Number(page.cid) === selectedCid }"
            @click="changePage(Number(page.cid))"
          >
            P{{ page.page }} {{ page.part }}
          </button>
        </div>

        <p v-if="videoInfo?.desc" class="mobile-video-desc">
          {{ videoInfo.desc }}
        </p>
      </article>

      <section class="mobile-video-comments">
        <h2>评论</h2>
        <div v-if="comments.length === 0" class="mobile-empty">
          暂无评论数据
        </div>
        <article v-for="comment in comments" :key="comment.rpid || comment.ctime" class="mobile-comment">
          <img :src="comment.member?.avatar" :alt="comment.member?.uname">
          <div>
            <strong>{{ comment.member?.uname || '用户' }}</strong>
            <p>{{ comment.content?.message }}</p>
          </div>
        </article>
      </section>
    </template>
  </section>
</template>

<style scoped lang="scss">
.mobile-video-detail {
  min-height: 100dvh;
  background: #101114;
  color: #f2f3f5;
}

.mobile-video-header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: calc(52px + env(safe-area-inset-top, 0px));
  padding: env(safe-area-inset-top, 0px) 10px 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  background: rgba(16, 17, 20, 0.94);
  backdrop-filter: blur(18px);
}

.mobile-video-header__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
}

.icon-button,
.control-button {
  min-width: 44px;
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: inherit;
}

.mobile-video-state {
  min-height: 72dvh;
  padding: 80px 24px;
  display: grid;
  place-items: center;
  text-align: center;
  color: #a9adb7;
}

.mobile-video-state--error button {
  min-height: 42px;
  margin-top: 16px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #00a1d6;
  color: white;
  font-weight: 700;
}

.mobile-video-player {
  position: relative;
  background: #000;
}

.mobile-video-player__media {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
  background: #000;
  object-fit: contain;
}

.mobile-danmaku-layer {
  pointer-events: none;
  position: absolute;
  inset: 0 0 92px;
  overflow: hidden;
  opacity: var(--danmaku-opacity);
  font-size: var(--danmaku-size);
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
}

.mobile-danmaku-item {
  position: absolute;
  left: 100%;
  white-space: nowrap;
  animation: danmaku-slide 4s linear both;
}

@keyframes danmaku-slide {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(calc(-100vw - 100%));
  }
}

.mobile-video-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 10px 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.18));
}

.mobile-video-controls__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mobile-video-controls__row--settings {
  margin-top: 6px;
}

.time-label {
  flex: 1;
  color: #e6e7eb;
  font-size: 12px;
}

.progress-range {
  width: 100%;
  accent-color: #00a1d6;
}

.mobile-select,
.mobile-toggle {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #f2f3f5;
  font-size: 12px;
}

.mobile-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mobile-video-info,
.mobile-video-comments {
  padding: 16px 14px;
}

.mobile-video-info h1 {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 1.35;
}

.mobile-video-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #9da3ad;
  font-size: 12px;
}

.mobile-video-owner {
  margin: 14px 0;
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  text-decoration: none;
}

.mobile-video-owner img,
.mobile-comment img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
}

.mobile-video-owner div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mobile-video-owner span {
  color: #9da3ad;
  font-size: 12px;
}

.mobile-video-pages {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 10px;
}

.mobile-video-pages button {
  flex: 0 0 auto;
  max-width: 76vw;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-video-pages button.active {
  border-color: rgba(0, 161, 214, 0.5);
  background: rgba(0, 161, 214, 0.16);
  color: #5ed8ff;
}

.mobile-video-desc {
  margin: 8px 0 0;
  color: #c2c6cf;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.mobile-video-comments {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.mobile-video-comments h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

.mobile-comment {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mobile-comment strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.mobile-comment p,
.mobile-empty {
  margin: 0;
  color: #c2c6cf;
  font-size: 13px;
  line-height: 1.5;
}
</style>
