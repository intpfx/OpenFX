<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, useSlots, watch, watchEffect } from 'vue'

import { useBewlyApp } from '~/composables/useAppProvider'
import { useVideoCardSharedStyles } from '~/composables/useVideoCardSharedStyles'
import { settings } from '~/logic'
import { isMobileUserscriptRuntimePage, shouldEnableHoverInteractions } from '~/userscript/mobile'

import VideoCardCover from './components/VideoCardCover.vue'
import VideoCardInfo from './components/VideoCardInfo.vue'
import { registerAutoPreviewCandidate } from './composables/autoPreviewCoordinator'
import { useVideoCardLogic } from './composables/useVideoCardLogic'
import type { Video } from './types'
import VideoCardAuthorAvatar from './VideoCardAuthor/components/VideoCardAuthorAvatar.vue'
import VideoCardContextMenu from './VideoCardContextMenu/VideoCardContextMenu.vue'

const props = withDefaults(defineProps<Props>(), {
  showWatcherLater: true,
  type: 'common',
  moreBtn: true,
})

interface Props {
  skeleton?: boolean
  video?: Video
  type?: 'rcmd' | 'appRcmd' | 'bangumi' | 'common'
  showWatcherLater?: boolean
  showPreview?: boolean
  moreBtn?: boolean
  hideAuthor?: boolean
  isFollowingPage?: boolean
  customClickHandler?: (event: MouseEvent) => void
}

const autoPreviewActive = ref(false)
const slots = useSlots()

// 数据现在在转换阶段已经完成 HTML 解码，直接使用 props
const logic = useVideoCardLogic(() => ({
  ...props,
  autoPreviewActive: autoPreviewActive.value,
}))
const { mainAppRef } = useBewlyApp()

// 使用共享样式（避免每个卡片重复计算）
const { titleFontSizeClass, titleStyle, metaFontSizeClass } = useVideoCardSharedStyles()

const hoverInteractionsEnabled = computed(() => shouldEnableHoverInteractions(settings.value.touchScreenOptimization))
const isMobileUserscriptPage = isMobileUserscriptRuntimePage()

const showCoverAuthorAvatar = computed(() =>
  !props.hideAuthor
  && !slots.coverTopLeft
  && Boolean(props.video?.author),
)

const hoverPreviewOnCoverOnly = computed(() =>
  Boolean(
    hoverInteractionsEnabled.value
    && props.showPreview
    && settings.value.enableVideoPreview
    && settings.value.onlyCoverVideoPreview,
  ),
)

const linkEvents = computed(() => ({
  click: props.customClickHandler || logic.handleClick,
  ...(hoverInteractionsEnabled.value && !hoverPreviewOnCoverOnly.value
    ? {
        mouseenter: logic.handleMouseEnter,
        mouseleave: logic.handelMouseLeave,
      }
    : {}),
}))

const coverEvents = computed(() =>
  hoverInteractionsEnabled.value && hoverPreviewOnCoverOnly.value
    ? {
        mouseenter: logic.handleMouseEnter,
        mouseleave: logic.handelMouseLeave,
      }
    : {},
)

let unregisterAutoPreviewCandidate: (() => void) | undefined

function cleanupAutoPreviewObserver() {
  unregisterAutoPreviewCandidate?.()
  unregisterAutoPreviewCandidate = undefined
  autoPreviewActive.value = false
}

function setupAutoPreviewObserver() {
  cleanupAutoPreviewObserver()

  if (!props.showPreview
    || !settings.value.enableVideoPreview
    || hoverInteractionsEnabled.value
    || !logic.cardRootRef.value) {
    return
  }

  unregisterAutoPreviewCandidate = registerAutoPreviewCandidate(logic.cardRootRef.value, (active) => {
    autoPreviewActive.value = active
  })
}

watch(
  [() => props.showPreview, () => settings.value.enableVideoPreview, hoverInteractionsEnabled, () => logic.cardRootRef.value],
  () => {
    nextTick(() => {
      setupAutoPreviewObserver()
    })
  },
  { immediate: true, flush: 'post' },
)

onUnmounted(() => {
  cleanupAutoPreviewObserver()
})

const primaryTags = computed(() => {
  const video = props.video
  if (!video)
    return []
  const { tag } = video
  if (!tag)
    return []
  if (Array.isArray(tag))
    return tag.filter(Boolean)
  return [tag]
})

// Highlight tags calculation - 使用查找表优化性能
const LIKE_RATIO_THRESHOLDS = [
  { view: 1_000_000, ratio: 0.01 },
  { view: 200_000, ratio: 0.025 },
  { view: 100_000, ratio: 0.04 },
  { view: 10_000, ratio: 0.05 },
] as const

const DANMAKU_RATIO_THRESHOLDS = [
  { view: 1_000_000, ratio: 0.001 },
  { view: 200_000, ratio: 0.0025 },
  { view: 100_000, ratio: 0.004 },
  { view: 0, ratio: 0.005 },
] as const

const highlightTags = computed(() => {
  if (!props.video)
    return [] as string[]

  // 如果设置为不显示推荐标签，则不显示插件计算的标签
  if (!settings.value.showVideoCardRecommendTag)
    return [] as string[]

  const tags: string[] = []
  const stats = logic.videoStatNumbers.value
  const viewCount = stats.view ?? 0

  if (viewCount <= 0)
    return tags

  if (viewCount >= 10_000) {
    const likeCount = stats.like ?? 0
    const likeRatio = likeCount / viewCount

    // 使用查找表快速判断是否高赞
    const likeThreshold = LIKE_RATIO_THRESHOLDS.find(t => viewCount >= t.view)
    if (likeThreshold && likeRatio >= likeThreshold.ratio) {
      tags.push('高赞')
    }

    const danmakuCount = stats.danmaku ?? 0
    const danmakuRatio = danmakuCount / viewCount

    // 使用查找表快速判断是否高互动
    const danmakuThreshold = DANMAKU_RATIO_THRESHOLDS.find(t => viewCount >= t.view)
    if (danmakuThreshold && danmakuRatio > danmakuThreshold.ratio) {
      tags.push('高互动')
    }
  }

  const durationTag = props.video ? getDurationHighlight(props.video) : undefined

  if (durationTag)
    tags.push(durationTag)

  // 百万播放标签 - 只有在外部tag没有播放字眼时显示，且优先级最后
  if (viewCount >= 1_000_000) {
    const hasPlayKeyword = primaryTags.value.some(tag => /播放|观看|views?|play/i.test(tag))
    if (!hasPlayKeyword)
      tags.push('百万播放')
  }

  // 如果传入了2个或更多Tag，则不显示推荐tag
  if (primaryTags.value.length >= 2) {
    return []
  }
  else if (primaryTags.value.length > 0) {
    // tags只返回一个
    return tags.slice(0, 1)
  }
  else {
    // 最多返回2个，避免越界
    return tags.slice(0, 2)
  }
})

function getDurationHighlight(video: Video) {
  const durationInSeconds = getDurationInSeconds(video)

  if (!durationInSeconds)
    return

  if (durationInSeconds >= 40 * 60)
    return '超长视频'

  if (durationInSeconds >= 20 * 60)
    return '长视频'
}

function getDurationInSeconds(video: Video) {
  const { duration } = video
  if (typeof duration === 'number' && duration > 0)
    return duration

  return parseDurationStr(video.durationStr)
}

function parseDurationStr(durationStr?: string) {
  if (!durationStr)
    return

  const parts = durationStr.split(':').map(part => Number(part))
  if (parts.some(part => Number.isNaN(part)))
    return

  let seconds = 0
  for (const value of parts)
    seconds = seconds * 60 + value

  return seconds
}

const coverImageUrl = computed(() =>
  props.video ? `${logic.removeHttpFromUrl(props.video.cover)}@672w_378h_1c_!web-home-common-cover` : '',
)

const infoComponentRef = ref()

// 图片加载状态：用于等待图片加载完成后才显示真实内容
const imageLoaded = ref(false)

// Cover 骨架屏状态：只依赖数据骨架屏，让图片能立即开始加载
const coverSkeleton = computed(() => props.skeleton)

// Info 骨架屏状态：只依赖数据骨架屏，不等待图片加载
// 这避免了滚动时图片加载触发的大量 DOM 重构
const infoSkeleton = computed(() => props.skeleton)

// 监听skeleton prop变化，重置imageLoaded状态
watch(() => props.skeleton, (newVal) => {
  if (newVal) {
    // 变成骨架屏时，重置图片加载状态
    imageLoaded.value = false
  }
})

// 处理图片加载完成
function handleImageLoaded() {
  imageLoaded.value = true
}

// Expose moreBtnRef from child component
watchEffect(() => {
  if (infoComponentRef.value?.moreBtnRef) {
    logic.moreBtnRef.value = infoComponentRef.value.moreBtnRef
  }
})

provide('getVideoType', () => props.type!)
</script>

<template>
  <div
    :ref="(el) => logic.cardRootRef.value = el as HTMLElement"
    class="video-card-container mb-3"
    :style="{ minHeight: '0px' }"
    duration-300 ease-in-out
    rounded="$bew-radius"
    :class="[
      skeleton ? 'video-card-container--skeleton' : 'video-card-container--interactive',
      'video-card-container--overlay',
    ]"
  >
    <div
      class="video-card group"
      w="full"
      rounded="$bew-radius"
    >
      <component
        :is="coverSkeleton ? 'div' : 'ALink'"
        v-bind="coverSkeleton ? {} : {
          href: logic.videoUrl.value,
          type: 'videoCard',
          customClickEvent: Boolean(props.customClickHandler) || isMobileUserscriptPage,
          customClickEventIncludesModifiers: Boolean(props.customClickHandler),
        }"
        v-on="coverSkeleton ? {} : linkEvents"
      >
        <!-- Cover -->
        <div
          class="vertical-card-cover"
          v-on="coverSkeleton ? {} : coverEvents"
        >
          <VideoCardCover
            :skeleton="coverSkeleton"
            :video="props.video"
            :removed="logic.removed.value"
            :preview-active="logic.previewRequested.value"
            :preview-video-url="logic.previewVideoUrl.value || ''"
            :is-in-watch-later="logic.isInWatchLater.value"
            :show-watcher-later="showWatcherLater"
            :cover-image-url="coverImageUrl"
            @toggle-watch-later="logic.toggleWatchLater"
            @undo="logic.handleUndo"
            @image-loaded="handleImageLoaded"
          >
            <template #coverTopLeft>
              <slot name="coverTopLeft" />
              <VideoCardAuthorAvatar
                v-if="showCoverAuthorAvatar && props.video?.author"
                class="video-card-cover-author-avatar"
                :author="props.video.author"
                :is-live="props.video.liveStatus === 1"
                :size="50"
                compact
              />
            </template>
          </VideoCardCover>
        </div>

        <!-- Other Information -->
        <VideoCardInfo
          v-if="!logic.removed.value && !infoSkeleton"
          ref="infoComponentRef"
          :video="props.video"
          :video-url="logic.videoUrl.value"
          :more-btn="moreBtn"
          :show-video-options="logic.showVideoOptions.value"
          :title-font-size-class="titleFontSizeClass"
          :title-style="titleStyle"
          :meta-font-size-class="metaFontSizeClass"
          :highlight-tags="highlightTags"
          :hide-author="hideAuthor"
          @more-btn-click="logic.handleMoreBtnClick"
        />
      </component>
    </div>

    <!-- context menu -->
    <Teleport
      v-if="logic.showVideoOptions.value && props.video"
      :to="mainAppRef"
    >
      <VideoCardContextMenu
        :video="{
          ...props.video,
          url: logic.videoUrl.value,
        }"
        :context-menu-styles="logic.videoOptionsFloatingStyles.value"
        :is-following-page="props.isFollowingPage"
        @close="logic.showVideoOptions.value = false"
        @removed="logic.handleRemoved"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
/* ✅ 性能优化：移除Container Query，减少11,206个容器的查询计算开销 */
.video-card-container {
  /* ❌ 移除 container-type 和 container-name，避免大规模容器查询计算 */
  /* container-type: inline-size; */
  /* container-name: video-card; */

  /* ✅ 增强 containment：移除 paint 以允许 hover 背景向外扩展 */
  contain: layout style;
  min-width: 0;

  /**
   * 关键优化：让浏览器跳过 offscreen 子树的 layout/style/paint。
   * 使用 content-visibility: auto 大幅减少 11k 卡片的渲染开销。
   */
  content-visibility: auto;
  contain-intrinsic-size: 360px 260px;

  /* 防止字体加载导致的layout shift */
  text-rendering: optimizeSpeed;
  /* 防止字体度量变化 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* 防止骨架屏和真实内容切换时的布局偏移：
     确保容器在加载过程中保持稳定的最小高度 */
  min-height: fit-content;
}

:global(.bewly-page-content--mobile) .video-card-container {
  contain-intrinsic-size: 320px 220px;
  min-height: 0;
  margin-bottom: 6px !important;
}

.video-card-container--overlay {
  content-visibility: visible;
  contain-intrinsic-size: auto;
  min-height: 0;
}

:global(.bewly-page-content--mobile) .video-card {
  overflow: hidden;
  border-radius: var(--bew-radius);
}

.video-card-cover-author-avatar {
  margin: 8px 0 0 8px !important;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.45));
}

.video-card-cover-author-avatar :deep(a) {
  background: color-mix(in oklab, var(--bew-elevated-solid), transparent 12%);
  border: 2px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(8px);
}

/* 骨架屏状态：禁用交互 */
.video-card-container--skeleton {
  pointer-events: none;
}

/* hover/active 效果全部在最外层容器，background-color + box-shadow 同一元素同步动画，无时序差 */
.video-card-container--interactive {
  position: relative;
  /* 零值初始状态，确保 box-shadow 能正确插值过渡 */
  background-color: transparent;
  box-shadow: 0 0 0 0 transparent;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

/* 只在支持 hover 的设备上启用 hover 效果（避免触屏设备的性能损失） */
@media (hover: hover) and (pointer: fine) {
  .video-card-container--interactive:hover {
    background-color: var(--bew-fill-2);
    box-shadow: 0 0 0 6px var(--bew-fill-2);
  }
}

.video-card-container--interactive:active {
  background-color: var(--bew-fill-3);
  box-shadow: 0 0 0 6px var(--bew-fill-3);
}

.vertical-card-cover {
  --uno: "w-full";
}

.bew-title-auto {
  /* 使用固定的响应式字体大小，不使用容器查询单位 */
  font-size: clamp(12px, 2.5vw, 18px);
  line-height: clamp(1.15, 1.35, 1.5);
}

.video-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--bew-radius);
}

</style>
