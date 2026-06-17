<script lang="ts" setup>
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'
import { isMobileUserscriptRuntimePage, openMobileUrlInCurrentPage } from '~/userscript/mobile'

import type { Author } from '../../types'

defineProps<{
  author?: Author | Author[]
}>()

function handleAuthorClick(event: MouseEvent, url: string) {
  if (openMobileUrlInCurrentPage(url)) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const authorLinkTarget = computed(() => isMobileUserscriptRuntimePage() ? '_self' : '_blank')
</script>

<template>
  <a
    class="channel-name"
    cursor-pointer mr-4
    :href="getAuthorJumpUrl(Array.isArray(author) ? author[0] : author)"
    :target="authorLinkTarget"
    @click.stop="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
    @auxclick="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
  >
    <span>
      <span v-if="Array.isArray(author) && author.length > 1">
        {{ $t('video_card.group_contribution', { firstAuthor: author[0].name, num: author.length }) }}
      </span>
      <span v-else>
        {{ Array.isArray(author) ? author[0].name : author?.name }}
      </span>
    </span>
  </a>
</template>

<style scoped>
@media (hover: hover) and (pointer: fine) {
  .channel-name:hover {
    color: var(--bew-theme-color);
  }
}
</style>
