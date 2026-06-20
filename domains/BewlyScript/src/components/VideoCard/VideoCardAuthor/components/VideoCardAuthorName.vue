<script lang="ts" setup>
import { getAuthorJumpUrl } from '~/components/VideoCard/utils'
import { isMobileUserscriptRuntimePage, openMobileUrlInCurrentPage } from '~/userscript/mobile'

import type { Author } from '../../types'

defineProps<{
  author?: Author | Author[]
}>()

const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())

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
  <component
    :is="isMobileUserscriptPage ? 'span' : 'a'"
    class="channel-name"
    cursor-pointer mr-4
    :href="isMobileUserscriptPage ? undefined : getAuthorJumpUrl(Array.isArray(author) ? author[0] : author)"
    :target="authorLinkTarget"
    :role="isMobileUserscriptPage ? 'link' : undefined"
    :tabindex="isMobileUserscriptPage ? 0 : undefined"
    @click.stop="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
    @auxclick.stop="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
    @keydown.enter.stop="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
    @keydown.space.stop="handleAuthorClick($event, getAuthorJumpUrl(Array.isArray(author) ? author[0] : author))"
  >
    <span>
      <span v-if="Array.isArray(author) && author.length > 1">
        {{ $t('video_card.group_contribution', { firstAuthor: author[0].name, num: author.length }) }}
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
