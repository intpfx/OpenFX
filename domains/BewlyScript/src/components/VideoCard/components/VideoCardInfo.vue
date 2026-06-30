<script setup lang="ts">
import { computed, ref } from 'vue'

import { isMobileUserscriptRuntimePage, openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { calcTimeSince } from '~/utils/dataFormatter'

import type { Video } from '../types'
import VideoCardAuthorName from '../VideoCardAuthor/components/VideoCardAuthorName.vue'

interface Props {
  video?: Video
  videoUrl?: string
  moreBtn: boolean
  showVideoOptions: boolean
  titleFontSizeClass: string
  titleStyle: Record<string, string | number>
  metaFontSizeClass: string
  highlightTags: string[]
  hideAuthor?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  moreBtnClick: [event: MouseEvent]
}>()

const moreBtnRef = ref<HTMLDivElement | null>(null)

defineExpose({
  moreBtnRef,
})

const primaryTags = computed(() => {
  const tag = props.video?.tag
  if (!tag)
    return []
  if (Array.isArray(tag))
    return tag.filter(Boolean)
  return [tag]
})

const MAX_LEADING_TAG_COUNT = 2

const visiblePrimaryTags = computed(() =>
  primaryTags.value.slice(0, MAX_LEADING_TAG_COUNT),
)

const visibleHighlightTags = computed(() => {
  const remainingCount = MAX_LEADING_TAG_COUNT - visiblePrimaryTags.value.length
  if (remainingCount <= 0)
    return []
  return props.highlightTags.slice(0, remainingCount)
})

const hasVisibleMeta = computed(() =>
  visiblePrimaryTags.value.length > 0
  || visibleHighlightTags.value.length > 0
  || Boolean(props.video?.publishedTimestamp)
  || Boolean(props.video?.capsuleText)
  || props.video?.type === 'vertical'
  || props.video?.type === 'bangumi',
)

const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())

function handleTitleClick(event: MouseEvent) {
  if (!props.videoUrl)
    return

  if (openMobileUrlInCurrentPage(props.videoUrl)) {
    event.preventDefault()
    event.stopPropagation()
  }
}
</script>

<template>
  <div
    v-if="video"
    class="video-card-summary"
    :class="{ 'video-card-summary--meta-only': hideAuthor || !video.author }"
  >
    <div class="video-card-summary__body">
      <div class="video-card-title-line">
        <h3
          :class="[
            video.liveStatus === 1 ? 'keep-one-line' : 'keep-two-lines',
            'video-card-title',
            titleFontSizeClass,
          ]"
          text="overflow-ellipsis $bew-text-1"
          :style="titleStyle"
          cursor="pointer"
          :title="video.title"
        >
          <a
            :href="videoUrl"
            :target="isMobileUserscriptPage ? '_self' : '_blank'"
            @click="handleTitleClick"
            @auxclick="handleTitleClick"
          >
            {{ video.title }}
          </a>
        </h3>

        <div
          v-if="moreBtn"
          ref="moreBtnRef"
          class="video-card__more-btn"
          :class="[
            { 'more-active': showVideoOptions },
            'overflow-hidden rounded-full',
          ]"
          bg="active:$bew-fill-3"
          shrink-0 w-36px h-36px
          grid place-items-center cursor-pointer rounded="50%"
          duration-300
          @click.stop.prevent="emit('moreBtnClick', $event)"
        >
          <div i-mingcute:more-2-line text="xl" />
        </div>
      </div>

      <div
        v-if="!hideAuthor || hasVisibleMeta"
        class="video-card-author-line"
        :class="[
          metaFontSizeClass,
          { 'video-card-author-line--meta-only': hideAuthor || !video.author },
        ]"
      >
        <VideoCardAuthorName
          v-if="!hideAuthor && video.author"
          :author="video.author"
        />

        <div
          v-if="hasVisibleMeta"
          class="video-card-meta-row"
        >
          <span
            v-for="primaryTag in visiblePrimaryTags"
            :key="`primary-${primaryTag}`"
            class="video-card-meta__chip"
            text="$bew-theme-color"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            bg="$bew-theme-color-20"
          >
            {{ primaryTag }}
          </span>

          <span
            v-for="extraTag in visibleHighlightTags"
            :key="`highlight-${extraTag}`"
            class="video-card-meta__chip"
            text="$bew-theme-color"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            bg="$bew-theme-color-20"
          >
            {{ extraTag }}
          </span>

          <span
            v-if="video.publishedTimestamp || video.capsuleText"
            class="video-card-meta__chip"
            bg="$bew-fill-1"
            p="x-2"
            lh-6
            rounded="$bew-radius"
            text="$bew-text-3"
          >
            {{ video.publishedTimestamp ? calcTimeSince(video.publishedTimestamp * 1000) : video.capsuleText?.trim() }}
          </span>

          <span
            v-if="video.type === 'vertical' || video.type === 'bangumi'"
            text="$bew-text-2"
            grid="~ place-items-center"
          >
            <div v-if="video.type === 'vertical'" i-mingcute:cellphone-2-line />
            <div v-else-if="video.type === 'bangumi'" i-mingcute:movie-line />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.video-card-title {
  &.keep-two-lines {
    min-height: calc(var(--bew-title-line-height, 1.35) * 2em);
  }
  &.keep-one-line {
    min-height: auto;
  }
}

.video-card__more-btn {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
}

.video-card__more-btn::before,
.video-card__more-btn::after {
  border-radius: inherit;
}

.more-active {
  --uno: "opacity-100";
}

.video-card-summary {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--bew-radius);
  color: #fff;
  pointer-events: none;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
}

.video-card-summary::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent 32%),
    linear-gradient(to top, rgba(0, 0, 0, 0.78), transparent 48%);
  pointer-events: none;
}

.video-card-summary__body {
  position: relative;
  z-index: 1;
  display: block;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.video-card-title-line {
  position: absolute;
  right: 64px;
  bottom: 24px;
  left: 12px;
  display: block;
  min-width: 0;
  pointer-events: none;
}

.video-card-title-line .video-card-title {
  min-width: 0;
  min-height: auto;
  max-height: calc(1.25em * 2);
  color: #fff !important;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.25;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.9);
}

.video-card-title-line .video-card-title a {
  color: inherit;
  pointer-events: auto;
}

.video-card-title-line .video-card__more-btn {
  position: absolute;
  right: -54px;
  bottom: -5px;
  width: 42px !important;
  height: 42px !important;
  margin: 0 !important;
  color: #fff;
  background: rgba(0, 0, 0, 0.46);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.16),
    0 8px 20px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(10px);
  pointer-events: auto;
}

.video-card-author-line {
  position: absolute;
  top: 8px;
  right: 50px;
  left: 66px;
  display: flex;
  min-width: 0;
  min-height: 50px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.86);
  pointer-events: none;
}

.video-card-author-line--meta-only {
  right: 12px;
  left: 12px;
  min-height: 28px;
  justify-content: flex-start;
}

.video-card-author-line :deep(.channel-name) {
  min-width: 0;
  max-width: 100%;
  margin-right: 0;
  overflow: hidden;
  color: #fff;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
}

.video-card-meta-row {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}

.video-card-meta-row .video-card-meta__chip {
  flex: 0 0 auto;
  max-width: 100%;
  padding: 0 6px;
  color: rgba(255, 255, 255, 0.92) !important;
  background: rgba(0, 0, 0, 0.42) !important;
  border-radius: 999px;
  line-height: 18px;
  backdrop-filter: blur(8px);
}

.video-card-meta__chip {
  display: inline-flex;
  align-items: center;
  font-size: inherit;
  line-height: inherit;
  padding-block: calc(var(--bew-base-font-size) * 0.12);
  flex: 0 0 auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
