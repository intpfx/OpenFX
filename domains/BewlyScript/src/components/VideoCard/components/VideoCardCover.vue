<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type flvjs from 'flv.js'
import type { ErrorData, Events } from 'hls.js'
import Hls from 'hls.js'

import Button from '~/components/Button.vue'
import LazyPicture from '~/components/LazyPicture.vue'
import Tooltip from '~/components/Tooltip.vue'
import { settings } from '~/logic'
import { shouldEnableHoverInteractions, shouldPreferTouchMode } from '~/userscript/mobile'

import type { Video } from '../types'

interface Props {
  skeleton?: boolean
  video?: Video
  horizontal?: boolean
  removed: boolean
  isHover: boolean
  previewActive?: boolean
  previewVideoUrl: string
  isInWatchLater: boolean
  showWatcherLater: boolean
  coverTopLeftAlwaysVisible?: boolean
  coverImageUrl: string
  coverStatValues?: {
    view: string
    danmaku: string
    like: string
    duration: string
    published: string
  }
  coverStatsVisibility?: {
    view: boolean
    danmaku: boolean
    like: boolean
    duration: boolean
    published: boolean
  }
  hasCoverStats?: boolean
  shouldHideCoverStats?: boolean
  coverStatsStyle?: Record<string, string>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  toggleWatchLater: []
  undo: []
  imageLoaded: []
}>()

const previewShellRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const isLoadingStream = ref<boolean>(false)
const isPreviewFullscreen = ref<boolean>(false)
const showVideoControls = ref<boolean>(false)
const previewPlaying = ref<boolean>(false)
const previewMuted = ref<boolean>(true)
const previewDuration = ref<number>(0)
const previewCurrentTime = ref<number>(0)
const preferTouchMode = computed(() => shouldPreferTouchMode(settings.value.touchScreenOptimization))
const hoverInteractionsEnabled = computed(() => shouldEnableHoverInteractions(settings.value.touchScreenOptimization))
const shouldEnableVideoControls = computed(() => settings.value.enableVideoCtrlBarOnVideoCard && !props.video?.roomid)
const coverTopLeftVisible = computed(() => preferTouchMode.value || Boolean(props.coverTopLeftAlwaysVisible))
const watchLaterButtonStyle = computed(() => ({}))
const previewProgress = computed(() => previewDuration.value > 0 ? previewCurrentTime.value / previewDuration.value * 100 : 0)
const previewTimeLabel = computed(() => `${formatPreviewTime(previewCurrentTime.value)} / ${formatPreviewTime(previewDuration.value)}`)
let hls: Hls | null = null
let flvPlayer: flvjs.Player | null = null
let controlsHideTimeout: number | null = null

function formatPreviewTime(value: number) {
  if (!Number.isFinite(value) || value <= 0)
    return '00:00'

  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function clearControlsHideTimeout() {
  if (controlsHideTimeout !== null) {
    clearTimeout(controlsHideTimeout)
    controlsHideTimeout = null
  }
}

function scheduleControlsHide() {
  clearControlsHideTimeout()
  if (!previewPlaying.value || isLoadingStream.value || isPreviewFullscreen.value)
    return

  controlsHideTimeout = window.setTimeout(() => {
    showVideoControls.value = false
  }, 3000)
}

function showControlsTemporarily() {
  if (!shouldEnableVideoControls.value)
    return

  showVideoControls.value = true
  if (isPreviewFullscreen.value) {
    clearControlsHideTimeout()
    return
  }

  scheduleControlsHide()
}

function handlePreviewMouseMove() {
  if (!shouldEnableVideoControls.value || !props.previewVideoUrl)
    return

  if (!props.previewActive && !isPreviewFullscreen.value)
    return

  showControlsTemporarily()
}

function resetVideoElement(videoEl: HTMLVideoElement) {
  videoEl.pause()
  videoEl.removeAttribute('src')
  videoEl.load()
  previewPlaying.value = false
  previewCurrentTime.value = 0
  previewDuration.value = 0
}

function stopPreview(videoEl: HTMLVideoElement) {
  cleanupPlayers()
  clearControlsHideTimeout()
  showVideoControls.value = false
  resetVideoElement(videoEl)
}

function getFullscreenElement() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null
  }

  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

function syncPreviewFullscreenState() {
  const fullscreenElement = getFullscreenElement()
  const isFullscreen = Boolean(
    (previewShellRef.value && fullscreenElement === previewShellRef.value)
    || (videoRef.value && fullscreenElement === videoRef.value),
  )

  if (isPreviewFullscreen.value === isFullscreen)
    return

  isPreviewFullscreen.value = isFullscreen

  if (isFullscreen) {
    clearControlsHideTimeout()
    showVideoControls.value = true
    return
  }

  if (!videoRef.value)
    return

  if (!props.previewActive || !props.previewVideoUrl) {
    stopPreview(videoRef.value)
    return
  }

  showControlsTemporarily()
}

function cleanupPlayers() {
  if (hls) {
    hls.destroy()
    hls = null
  }
  if (flvPlayer) {
    flvPlayer.pause()
    flvPlayer.unload()
    flvPlayer.detachMediaElement()
    flvPlayer.destroy()
    flvPlayer = null
  }
  isLoadingStream.value = false
}

function syncPreviewMediaState() {
  const videoEl = videoRef.value
  if (!videoEl)
    return

  previewPlaying.value = !videoEl.paused
  previewMuted.value = videoEl.muted
  previewDuration.value = Number.isFinite(videoEl.duration) ? videoEl.duration : 0
  previewCurrentTime.value = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0
}

function togglePreviewPlayback() {
  const videoEl = videoRef.value
  if (!videoEl)
    return

  showControlsTemporarily()
  if (videoEl.paused) {
    videoEl.play().catch(() => {
      // Ignore autoplay errors
    })
    return
  }

  videoEl.pause()
  showVideoControls.value = true
}

function handlePreviewPlay() {
  previewPlaying.value = true
  isLoadingStream.value = false
  showControlsTemporarily()
}

function handlePreviewPause() {
  previewPlaying.value = false
  showVideoControls.value = true
  clearControlsHideTimeout()
}

function handlePreviewWaiting() {
  isLoadingStream.value = true
  showVideoControls.value = true
}

function handlePreviewCanPlay() {
  isLoadingStream.value = false
  showControlsTemporarily()
}

function handlePreviewSeek(event: Event) {
  event.stopPropagation()
  const videoEl = videoRef.value
  const nextProgress = Number((event.target as HTMLInputElement).value)
  if (!videoEl || !Number.isFinite(nextProgress) || previewDuration.value <= 0)
    return

  videoEl.currentTime = nextProgress / 100 * previewDuration.value
  previewCurrentTime.value = videoEl.currentTime
  showControlsTemporarily()
}

function togglePreviewMute() {
  const videoEl = videoRef.value
  if (!videoEl)
    return

  videoEl.muted = !videoEl.muted
  previewMuted.value = videoEl.muted
  showControlsTemporarily()
}

async function enterPreviewFullscreen() {
  const shell = previewShellRef.value
  const videoEl = videoRef.value as (HTMLVideoElement & {
    webkitEnterFullscreen?: () => void
  }) | null
  const fullscreenTarget = shell ?? videoEl

  showControlsTemporarily()

  if (fullscreenTarget?.requestFullscreen) {
    await fullscreenTarget.requestFullscreen()
    return
  }

  videoEl?.webkitEnterFullscreen?.()
}

async function setupPreviewVideo(url: string, videoEl: HTMLVideoElement) {
  // Check if URL is FLV stream
  if (url.includes('.flv')) {
    try {
      // 动态导入 flv.js 以避免构建时依赖问题
      const flvjsModule = await import('flv.js')
      const flvjs = flvjsModule.default

      if (flvjs.isSupported()) {
        // Cleanup previous players and clear video src
        cleanupPlayers()
        resetVideoElement(videoEl)

        isLoadingStream.value = true

        flvPlayer = flvjs.createPlayer({
          type: 'flv',
          url,
          isLive: true,
        }, {
          enableWorker: false, // 在扩展环境中禁用 worker
          enableStashBuffer: false, // 禁用存储缓冲，减少延迟
          stashInitialSize: 128, // 初始缓冲大小
          lazyLoad: false,
          lazyLoadMaxDuration: 1,
          seekType: 'range',
        })

        flvPlayer.attachMediaElement(videoEl)
        flvPlayer.load()

        flvPlayer.on(flvjs.Events.LOADING_COMPLETE, () => {
          isLoadingStream.value = false
        })

        flvPlayer.on(flvjs.Events.ERROR, (errorType, errorDetail) => {
          console.error('FLV Player error:', errorType, errorDetail)
          isLoadingStream.value = false
          cleanupPlayers()
        })

        // 当有数据可以播放时立即播放
        videoEl.addEventListener('loadeddata', () => {
          isLoadingStream.value = false
          videoEl.play().catch(() => {
            // Ignore autoplay errors
          })
        }, { once: true })

        videoEl.addEventListener('canplay', () => {
          if (isLoadingStream.value) {
            isLoadingStream.value = false
          }
        }, { once: true })
      }
    }
    catch (error) {
      console.error('Failed to load flv.js:', error)
      isLoadingStream.value = false
    }
  }
  // Check if URL is HLS stream (.m3u8)
  else if (url.includes('.m3u8') || url.includes('m3u8')) {
    if (Hls.isSupported()) {
      // Cleanup previous players and clear video src
      cleanupPlayers()
      resetVideoElement(videoEl)

      isLoadingStream.value = true

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // 优化配置以更快开始播放
        maxBufferLength: 10, // 减少缓冲长度
        maxMaxBufferLength: 20,
        liveSyncDurationCount: 2, // 减少直播同步计数
        liveMaxLatencyDurationCount: 5,
        maxBufferSize: 60 * 1000 * 1000, // 60MB
      })

      hls.loadSource(url)
      hls.attachMedia(videoEl)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isLoadingStream.value = false
        videoEl.play().catch(() => {
          // Ignore autoplay errors
        })
      })

      hls.on(Hls.Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        if (data.fatal) {
          isLoadingStream.value = false
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              // Try to recover from media errors
              hls?.recoverMediaError()
              break
            default:
              // For other fatal errors, cleanup
              cleanupPlayers()
              break
          }
        }
      })

      // 添加首帧加载事件
      hls.on(Hls.Events.BUFFER_APPENDED, () => {
        if (isLoadingStream.value) {
          isLoadingStream.value = false
        }
      })
    }
    // cSpell:ignore mpegurl
    else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      cleanupPlayers()
      resetVideoElement(videoEl)
      // Native HLS support (Safari)
      isLoadingStream.value = true
      videoEl.src = url

      const handleCanPlay = () => {
        isLoadingStream.value = false
        videoEl.removeEventListener('canplay', handleCanPlay)
      }

      videoEl.addEventListener('canplay', handleCanPlay)
      videoEl.play().catch(() => {
        isLoadingStream.value = false
        // Ignore autoplay errors
      })
    }
  }
  else {
    cleanupPlayers()
    resetVideoElement(videoEl)
    showControlsTemporarily()
    videoEl.src = url
    videoEl.load()
    videoEl.play().catch(() => {
      // Ignore autoplay errors
    })
  }
}

// Watch for preview URL and videoRef changes
watch([() => props.previewVideoUrl, () => props.previewActive, videoRef], ([url, previewActive, videoEl]) => {
  if (!videoEl)
    return

  if (!previewActive || !url) {
    if (isPreviewFullscreen.value)
      return

    stopPreview(videoEl)
    return
  }

  setupPreviewVideo(url, videoEl)
})

watch([shouldEnableVideoControls, () => props.previewVideoUrl, () => props.previewActive], ([controlsEnabled, url, previewActive]) => {
  if (isPreviewFullscreen.value) {
    if (controlsEnabled && url)
      showVideoControls.value = true
    return
  }

  if (!controlsEnabled || !url || !previewActive) {
    clearControlsHideTimeout()
    showVideoControls.value = false
    return
  }

  showControlsTemporarily()
})

// Cleanup on unmount
onMounted(() => {
  document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncPreviewFullscreenState as EventListener)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncPreviewFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncPreviewFullscreenState as EventListener)
  clearControlsHideTimeout()
  cleanupPlayers()
})

// Shadow styles are now injected globally via CSS variables from App.vue
// No per-card computation needed - significant performance improvement!
</script>

<template>
  <div
    class="group/cover"
    :class="hoverInteractionsEnabled ? 'group-hover:z-2' : 'z-2'"
    shrink-0
    relative bg="$bew-skeleton" rounded="$bew-radius"
    overflow-hidden
    cursor-pointer
    style="aspect-ratio: 16 / 9; contain: layout style; will-change: auto;"
  >
    <!-- Skeleton mode -->
    <div
      v-if="skeleton"
      w-full h-full bg="$bew-skeleton" rounded="$bew-radius"
      style="aspect-ratio: 16 / 9;"
    />

    <!-- Normal mode -->
    <template v-else>
      <!-- Video cover -->
      <LazyPicture
        :src="coverImageUrl"
        loading="lazy"
        root-margin="96px"
        :show-skeleton="false"
        @loaded="emit('imageLoaded')"
      />

      <div
        v-if="removed"
        pos="absolute top-0 left-0" w-full h-fit aspect-video flex="~ col gap-2 items-center justify-center"
        bg="$bew-fill-4" backdrop-blur-20px mix-blend-luminosity rounded="$bew-radius" z-2
      >
        <p mb-2 color-white text-lg>
          {{ $t('video_card.video_removed') }}
        </p>
        <Button
          color="rgba(255,255,255,.35)" text-color="white" size="small"
          @click.prevent.stop="emit('undo')"
        >
          <template #left>
            <div i-mingcute-back-line text-lg />
          </template>
          {{ $t('common.undo') }}
        </Button>
      </div>

      <!-- Video preview -->
      <Transition v-if="!removed && settings.enableVideoPreview" name="fade">
        <div
          v-if="previewVideoUrl && previewActive"
          ref="previewShellRef"
          class="video-card-preview-shell"
          pos="absolute top-0 left-0" w-full aspect-video rounded="$bew-radius" bg-black
          @mousemove="handlePreviewMouseMove"
          @pointermove="handlePreviewMouseMove"
        >
          <video
            ref="videoRef"
            autoplay
            muted
            playsinline
            webkit-playsinline
            class="video-card-preview-media"
            :style="{ pointerEvents: shouldEnableVideoControls ? 'auto' : 'none' }"
            w-full h-full
            @play="handlePreviewPlay"
            @pause="handlePreviewPause"
            @waiting="handlePreviewWaiting"
            @canplay="handlePreviewCanPlay"
            @loadedmetadata="syncPreviewMediaState"
            @durationchange="syncPreviewMediaState"
            @timeupdate="syncPreviewMediaState"
            @volumechange="syncPreviewMediaState"
            @click.prevent.stop="togglePreviewPlayback"
            @dblclick.prevent.stop="enterPreviewFullscreen"
          />

          <Transition name="fade">
            <div
              v-if="shouldEnableVideoControls && showVideoControls"
              class="video-card-preview-controls"
              data-bewly-video-card-player="custom"
              @click.stop
              @pointerdown.stop
              @pointermove.stop
              @mousemove.stop
            >
              <button
                type="button"
                class="video-card-preview-control-button"
                :aria-label="previewPlaying ? '暂停' : '播放'"
                @click.prevent.stop="togglePreviewPlayback"
              >
                <Icon :icon="previewPlaying ? 'mingcute:pause-fill' : 'mingcute:play-fill'" />
              </button>

              <span class="video-card-preview-time">{{ previewTimeLabel }}</span>

              <input
                class="video-card-preview-range"
                type="range"
                min="0"
                max="100"
                step="0.1"
                :value="previewProgress"
                aria-label="预览进度"
                @input="handlePreviewSeek"
                @click.stop
                @pointerdown.stop
              >

              <button
                type="button"
                class="video-card-preview-control-button"
                :aria-label="previewMuted ? '取消静音' : '静音'"
                @click.prevent.stop="togglePreviewMute"
              >
                <Icon :icon="previewMuted ? 'mingcute:volume-mute-fill' : 'mingcute:volume-fill'" />
              </button>

              <button
                type="button"
                class="video-card-preview-control-button"
                aria-label="全屏"
                @click.prevent.stop="enterPreviewFullscreen"
              >
                <Icon icon="mingcute:fullscreen-line" />
              </button>
            </div>
          </Transition>

          <!-- Loading indicator -->
          <Transition name="fade">
            <div
              v-if="isLoadingStream"
              pos="absolute top-0 left-0"
              w-full h-full
              flex="~ items-center justify-center"
              bg="black/50"
              pointer-events-none
            >
              <div class="loading-spinner" />
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- Ranking Number -->
      <div
        v-if="video?.rank"
        pos="absolute top-0"
        p-2
        :class="hoverInteractionsEnabled ? 'opacity-100 group-hover:opacity-0' : 'opacity-100'"
        duration-300
      >
        <div
          v-if="Number(video.rank) <= 3"
          bg="$bew-theme-color" text-center lh-0 h-30px w-30px
          text-white rounded="1/2" shadow="$bew-shadow-1"
          border="1 $bew-theme-color"
          grid="~ place-content-center"
          text="xl" fw-bold
        >
          {{ video.rank }}
        </div>
        <div
          v-else
          bg="$bew-elevated-solid" text-center lh-30px h-30px w-30px
          rounded="1/2" shadow="$bew-shadow-1"
          border="1 $bew-border-color"
        >
          {{ video.rank }}
        </div>
      </div>

      <template v-if="!removed && video">
        <div
          :class="coverTopLeftVisible || !hoverInteractionsEnabled ? 'opacity-100' : 'opacity-0 group-hover/cover:opacity-100'"
          :transform="coverTopLeftVisible || !hoverInteractionsEnabled ? 'scale-100' : 'scale-70 group-hover/cover:scale-100'"
          duration-300
          pos="absolute top-0 left-0" z-2
          @click.stop=""
        >
          <slot name="coverTopLeft" />
        </div>

        <div
          v-if="video.liveStatus === 1"
          :class="hoverInteractionsEnabled ? 'group-hover:opacity-0' : 'opacity-100'"
          pos="absolute left-0 top-0" bg="$bew-theme-color" text="xs white" fw-bold
          p="x-2 y-1" m-1 inline-block rounded="$bew-radius" duration-300
        >
          LIVE
          <i i-svg-spinners:pulse-3 align-middle mt--0.2em />
        </div>

        <div
          v-if="video.badge && Object.keys(video.badge).length > 0"
          :class="hoverInteractionsEnabled ? 'group-hover:opacity-0' : 'opacity-100'"
          :style="{
            backgroundColor: video.badge.bgColor,
            color: video.badge.color,
          }"
          pos="absolute right-0 top-0" bg="$bew-theme-color" text="xs white"
          p="x-2 y-1" m-1 inline-block rounded="$bew-radius" duration-300
        >
          {{ video.badge.text }}
        </div>

        <!-- Watcher later button -->
        <div
          v-if="showWatcherLater"
          role="button"
          tabindex="0"
          :aria-label="isInWatchLater ? $t('common.added') : $t('common.save_to_watch_later')"
          pos="absolute top-0 right-0" z="2"
          p="x-2 y-1" m="1"
          rounded="$bew-radius"
          text="!white xl"
          bg="black opacity-60"
          :class="hoverInteractionsEnabled ? 'opacity-0 group-hover/cover:opacity-100' : 'opacity-100'"
          :transform="hoverInteractionsEnabled ? 'scale-70 group-hover/cover:scale-100' : 'scale-100'"
          :style="watchLaterButtonStyle"
          duration-300
          @click.prevent.stop="emit('toggleWatchLater')"
          @keydown.enter.prevent.stop="emit('toggleWatchLater')"
          @keydown.space.prevent.stop="emit('toggleWatchLater')"
        >
          <Tooltip v-if="!isInWatchLater" :content="$t('common.save_to_watch_later')" placement="bottom-right" type="dark">
            <div i-mingcute:carplay-line />
          </Tooltip>
          <Tooltip v-else :content="$t('common.added')" placement="bottom-right" type="dark">
            <Icon icon="line-md:confirm" />
          </Tooltip>
        </div>

        <!-- Cover stats (bottom overlay) -->
        <div
          v-if="hasCoverStats"
          class="video-card-cover-stats video-card-stats"
          :class="{
            'video-card-cover-stats--hidden': shouldHideCoverStats,
          }"
          :style="coverStatsStyle"
        >
          <div class="video-card-cover-stats__items">
            <span
              v-if="coverStatsVisibility?.published"
              class="video-card-cover-stats__item video-card-cover-stats__item--published"
            >
              <span class="video-card-cover-stats__value">{{ coverStatValues?.published }}</span>
            </span>

            <span
              v-if="coverStatsVisibility?.view"
              class="video-card-cover-stats__item cover-stat-view"
            >
              <Icon icon="mingcute:play-circle-line" class="video-card-cover-stats__icon" aria-hidden="true" />
              <span class="video-card-cover-stats__value">{{ coverStatValues?.view }}</span>
            </span>

            <span
              v-if="coverStatsVisibility?.danmaku"
              class="video-card-cover-stats__item cover-stat-danmaku"
            >
              <Icon icon="mingcute:danmaku-line" class="video-card-cover-stats__icon" aria-hidden="true" />
              <span class="video-card-cover-stats__value">{{ coverStatValues?.danmaku }}</span>
            </span>

            <span
              v-if="coverStatsVisibility?.like"
              class="video-card-cover-stats__item cover-stat-like"
            >
              <Icon icon="mingcute:thumb-up-2-line" class="video-card-cover-stats__icon" aria-hidden="true" />
              <span class="video-card-cover-stats__value">{{ coverStatValues?.like }}</span>
            </span>
          </div>

          <span
            v-if="coverStatsVisibility?.duration"
            class="video-card-cover-stats__item video-card-cover-stats__item--duration"
          >
            <span class="video-card-cover-stats__value">{{ coverStatValues?.duration }}</span>
          </span>
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.video-card-preview-shell {
  overflow: hidden;
}

.video-card-preview-media {
  display: block;
  background: #000;
  object-fit: cover;
}

.video-card-preview-controls {
  position: absolute;
  right: 8px;
  bottom: 8px;
  left: 8px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 7px 8px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(8, 10, 14, 0.74);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px) saturate(1.28);
  pointer-events: auto;
}

.video-card-preview-control-button {
  display: grid;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  place-items: center;
  color: currentColor;
  border: 0;
  border-radius: 999px;
  outline: none;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    transform 0.16s ease;
}

.video-card-preview-control-button:hover,
.video-card-preview-control-button:focus-visible {
  background: rgba(255, 255, 255, 0.2);
}

.video-card-preview-control-button:active {
  transform: scale(0.94);
}

.video-card-preview-control-button :deep(svg) {
  width: 17px;
  height: 17px;
}

.video-card-preview-time {
  flex: 0 0 auto;
  min-width: 70px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.video-card-preview-range {
  flex: 1 1 auto;
  min-width: 42px;
  height: 18px;
  accent-color: var(--bew-theme-color);
  cursor: pointer;
}

@media (max-width: 700px) {
  .video-card-preview-controls {
    right: 6px;
    bottom: 6px;
    left: 6px;
    gap: 6px;
    padding: 6px;
  }

  .video-card-preview-time {
    min-width: 62px;
    font-size: 10px;
  }

  .video-card-preview-control-button {
    flex-basis: 24px;
    width: 24px;
    height: 24px;
  }
}

.video-card-cover-stats {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.4rem;
  padding: calc(var(--video-card-stats-font-size, 0.75rem) * 0.55)
    calc(var(--video-card-stats-font-size, 0.75rem) * 0.6) calc(var(--video-card-stats-font-size, 0.75rem) * 0.45);
  color: #fff;
  font-size: var(--video-card-stats-font-size, 0.75rem);
  opacity: 1;
  transition: opacity 0.2s ease;
  pointer-events: none;
  /* 只让下面两个角继承圆角，上面保持直线 */
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
  /* 确保容器不会溢出 */
  overflow: hidden;
}

.video-card-cover-stats::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* 简化渐变：从6层减少到3层，提升性能 */
  background: var(
    --bew-video-card-shadow-gradient,
    linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.35) 50%, transparent 100%)
  );
  height: var(--bew-video-card-shadow-height-multiplier, calc(var(--video-card-stats-overlay-scale, 1.4) * 100%));
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
  pointer-events: none;
}

.video-card-cover-stats > * {
  position: relative;
  z-index: 1;
}

.video-card-cover-stats__items {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  flex-wrap: nowrap;
  /* 不允许收缩，避免数字被截断 */
  flex-shrink: 0;
  /* 允许内容溢出，由容器查询控制显示 */
  min-width: 0;
}

.video-card-cover-stats__item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.video-card-cover-stats__icon {
  font-size: var(--video-card-stats-icon-size, calc(var(--video-card-stats-font-size, 0.75rem) * 1.1));
  color: currentColor;
}

.video-card-cover-stats__value {
  font-size: var(--video-card-stats-font-size, 0.75rem);
  line-height: 1;
}

.video-card-cover-stats__item--duration {
  margin-left: auto;
  font-size: var(--video-card-stats-font-size, 0.75rem);
  /* 时长固定在最右侧，不收缩 */
  flex-shrink: 0;
}

.video-card-cover-stats__item--published {
  min-width: 0;
  overflow: hidden;
}

.video-card-cover-stats__item--published .video-card-cover-stats__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 响应式显示控制已移至 VideoCard.vue 的 coverStatsVisibility 计算属性 */
/* 避免 CSS Container Query 在特定系统缩放（如 Windows 125%）下的性能问题 */

.video-card-cover-stats--hidden {
  opacity: 0;
  visibility: hidden;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ✅ 性能优化：从父组件 :deep() 移至本地 scoped，减少跨组件选择器匹配 */
/* 播放量和时长始终显示，弹幕和点赞在较宽屏幕显示 */
.cover-stat-view {
  display: inline-flex; /* 播放量始终显示 */
}

.cover-stat-danmaku,
.cover-stat-like {
  display: none; /* 默认隐藏弹幕和点赞 */
}

/* 使用媒体查询代替容器查询（性能更好） */
/* 屏幕宽度 > 768px 时显示弹幕 */
@media (min-width: 768px) {
  .cover-stat-danmaku {
    display: inline-flex;
  }
}

/* 屏幕宽度 > 1024px 时显示点赞 */
@media (min-width: 1024px) {
  .cover-stat-like {
    display: inline-flex;
  }
}
</style>
