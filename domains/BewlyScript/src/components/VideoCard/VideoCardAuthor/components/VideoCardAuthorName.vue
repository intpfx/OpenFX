<script lang="ts" setup>
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'
import { isMobileUserscriptRuntimePage, openMobileUrlInCurrentPage } from '~/userscript/mobile'

import type { Author } from '../../types'

const { author } = defineProps<{
  author?: Author | Author[]
}>()

const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())

const authorJumpUrl = computed(() => getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))

function handleAuthorClick(event: MouseEvent | KeyboardEvent, url: string) {
  event.preventDefault()
  event.stopPropagation()
  if (isMobileUserscriptPage.value) {
    openMobileUrlInCurrentPage(url)
  }
  else {
    window.location.href = url
  }
}
</script>

<template>
  <component
    :is="isMobileUserscriptPage ? 'span' : 'a'"
    class="channel-name"
    cursor-pointer mr-4
    :href="isMobileUserscriptPage ? undefined : authorJumpUrl"
    :role="isMobileUserscriptPage ? 'link' : undefined"
    :tabindex="isMobileUserscriptPage ? 0 : undefined"
    @click.stop="handleAuthorClick($event, authorJumpUrl)"
    @auxclick.stop="handleAuthorClick($event, authorJumpUrl)"
    @keydown.enter.stop="handleAuthorClick($event, authorJumpUrl)"
    @keydown.space.stop="handleAuthorClick($event, authorJumpUrl)"
  >
    <span>
      <span v-if="Array.isArray(author) && author.length > 1">
        {{ $t('video_card.group_contribution', { firstAuthor: author[0]?.name ?? '', num: author.length }) }}
      </span>
      <span v-else>
        {{ Array.isArray(author) ? author[0].name : author?.name }}
      </span>
    </span>
  </component>
</template>

<style scoped>
@media (hover: hover) and (pointer: fine) {
  .channel-name:hover {
    color: var(--bew-theme-color);
  }
}
</style>
