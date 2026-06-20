<script lang="ts" setup>
import { isMobileUserscriptRuntimePage, openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { removeHttpFromUrl } from '~/utils/main'

import type { Author } from '../../types'
import { getAuthorJumpUrl } from '../../utils'

const props = withDefaults(defineProps<{
  author: Author | Author[]
  maxCount?: number
  isLive?: boolean
  compact?: boolean
  size?: number
}>(), {
  maxCount: 3, // 最多显示的头像数量
  compact: false,
})

// 限制显示的头像数量，最多显示 maxCount 个
const displayedAvatars = computed(() => {
  if (Array.isArray(props.author))
    return props.author?.slice(0, props.maxCount) || []
  else
    return [props.author]
})

const singleAvatarSize = computed(() => props.size ?? 34)
const stackedAvatarSize = 28

const avatarRootStyle = computed(() => {
  if (Array.isArray(props.author) && props.author.length > 1) {
    return {
      width: `${28 + (displayedAvatars.value?.length) * 6}px`,
      height: `${stackedAvatarSize}px`,
    }
  }

  return {
    width: `${singleAvatarSize.value}px`,
    height: `${singleAvatarSize.value}px`,
  }
})

function getAvatarItemStyle(index: number) {
  const stacked = displayedAvatars.value.length > 1
  const size = stacked ? stackedAvatarSize : singleAvatarSize.value

  return {
    zIndex: displayedAvatars.value.length - index,
    left: `${index * 6}px`,
    width: `${size}px`,
    height: `${size}px`,
  }
}

const followedBadgeStyle = computed(() => ({
  top: `${singleAvatarSize.value - 13}px`,
  left: `${singleAvatarSize.value - 12}px`,
}))

const liveBadgeStyle = computed(() => ({
  top: `${singleAvatarSize.value - 16}px`,
  left: `${singleAvatarSize.value - 12}px`,
}))
const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())

// 检查是否是课堂类型（使用特殊标记）
const isKetang = computed(() => {
  if (Array.isArray(props.author))
    return false
  return props.author?.authorFace === '__ketang_icon__'
})

function handleAuthorClick(event: MouseEvent | KeyboardEvent, url: string) {
  if (!isMobileUserscriptPage.value)
    return

  event.preventDefault()
  event.stopPropagation()
  openMobileUrlInCurrentPage(url)
}

const authorLinkTarget = computed(() => isMobileUserscriptPage.value ? undefined : '_blank')
</script>

<template>
  <!-- 课堂图标 -->
  <div
    v-if="isKetang"
    :style="{
      width: `${singleAvatarSize}px`,
      height: `${singleAvatarSize}px`,
    }"
    :class="compact ? 'mr-2' : 'mr-4'"
    pos="relative"
    shrink-0
  >
    <div
      class="ketang-icon"
      w-34px h-34px
      rounded="1/2"
      bg="$bew-theme-color-10"
      grid="~ place-items-center"
    >
      <div i-mingcute:book-2-line text="xl $bew-theme-color" />
    </div>
  </div>

  <!-- 普通头像 -->
  <div
    v-else
    :style="avatarRootStyle"
    :class="compact ? 'mr-2' : 'mr-4'"
    pos="relative"
    shrink-0
  >
    <component
      :is="isMobileUserscriptPage ? 'span' : 'a'"
      v-for="(item, index) in displayedAvatars"
      :key="index"
      :href="isMobileUserscriptPage ? undefined : getAuthorJumpUrl(item)"
      :target="authorLinkTarget"
      :role="isMobileUserscriptPage ? 'link' : undefined"
      :tabindex="isMobileUserscriptPage ? 0 : undefined"
      :aria-label="item.name ? `进入 ${item.name} 的空间` : '进入 UP 主空间'"
      rounded="1/2"
      object="center cover" bg="$bew-skeleton" cursor="pointer"
      position-absolute top-0 inline-block
      :style="{
        ...getAvatarItemStyle(index),
      }"
      :class="{ live: isLive }"
      @pointerdown.stop
      @mousedown.stop
      @touchstart.stop
      @click.stop="handleAuthorClick($event, getAuthorJumpUrl(item))"
      @auxclick.stop="handleAuthorClick($event, getAuthorJumpUrl(item))"
      @keydown.enter.stop="handleAuthorClick($event, getAuthorJumpUrl(item))"
      @keydown.space.stop="handleAuthorClick($event, getAuthorJumpUrl(item))"
    >
      <!-- Avatar -->
      <Picture
        :src="`${removeHttpFromUrl(item.authorFace)}@50w_50h_1c`"
        loading="lazy"
        w-full h-full
        aspect-ratio="1/1"
        rounded="1/2"
      />

      <!-- Following Flag -->
      <div
        v-if="item.followed && !Array.isArray(author)"
        pos="absolute"
        w-14px h-14px
        :style="followedBadgeStyle"
        bg="$bew-theme-color"
        border="2 outset solid white"
        rounded="1/2"
        grid place-items-center
      >
        <div color-white text-sm class="i-mingcute:check-fill w-8px h-8px" />
      </div>
      <div
        v-else-if="isLive"
        pos="absolute"
        w-14px h-14px
        :style="liveBadgeStyle"
        bg="$bew-theme-color"
        rounded="1/2" grid place-items-center
      >
        <div color-white text-sm class="i-svg-spinners:pulse-3 w-12px h-12px" />
      </div>
    </component>

    <!-- More avatars not shown -->
    <span
      v-if="Array.isArray(author) && author.length > maxCount"
      pos="absolute right--4px"
      w="28px" h="28px"
      bg="$bew-skeleton"
      rounded="1/2"
      flex="~ items-center justify-end"
    >
      <span text="sm $bew-text-2" mr-1px>+</span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.live {
  --uno: "p-2px box-border border-2 border-$bew-theme-color-60";
}
</style>
