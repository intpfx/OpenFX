<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { shouldPreferTouchMode } from '~/userscript/mobile'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import ChannelsPop from './pops/ChannelsPop.vue'
import TopBarPinnedChannels from './TopBarPinnedChannels.vue'

const props = defineProps<{
  forceWhiteIcon: boolean
}>()

const { handleClickTopBarItem, setupTopBarItemHoverEvent } = useTopBarInteraction()
const topBarStore = useTopBarStore()
const { popupVisible } = storeToRefs(topBarStore)
const logo = ref<HTMLElement | null>(null)

const channels = setupTopBarItemHoverEvent('channels')

const channelLogoColor = computed(() => {
  return props.forceWhiteIcon ? 'white' : 'var(--bew-theme-color)'
})

const preferTouchMode = computed(() => {
  return shouldPreferTouchMode(settings.value.touchScreenOptimization)
})
</script>

<template>
  <div
    flex="inline xl:1 items-center gap-2"
    pos="relative"
    z-1
    class="top-bar-logo"
  >
    <div
      flex="~ items-center gap-2 shrink-0"
      z-1
    >
      <div
        ref="channels"
        relative w-fit
      >
        <a
          ref="logo"
          href="//www.bilibili.com"
          target="_top"
          class="group logo"
          :class="{
            activated: popupVisible.channels,
            'touch-mode': preferTouchMode,
          }"
          grid="~ place-items-center"
          rounded="46px"
          duration-300
          h-46px
          px-2
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'channels')"
        >
          <Logo
            class="channel-logo"
            :size="98"
            :color="channelLogoColor"
            :glow="false"
          />
        </a>

        <Transition name="slide-in">
          <ChannelsPop
            v-if="popupVisible.channels"
            class="bew-popover"
            pos="!absolute !left-0 !top-50px"
            transform="!translate-x-0"
            z="!999"
          />
        </Transition>
      </div>

      <!-- 首页按钮（仅在触屏模式下显示） -->
      <a
        v-if="preferTouchMode && settings.showHomeButtonInTouchMode"
        href="//www.bilibili.com"
        target="_top"
        class="group home-button touch-mode"
        grid="~ place-items-center"
        rounded="46px"
        duration-300
        w-46px h-46px
        bg="$bew-fill-1 active:$bew-fill-2"
        shrink-0
      >
        <div
          class="i-mingcute:home-3-fill home-icon"
          w="24px" h="24px"
          :style="{
            color: forceWhiteIcon ? 'white' : 'var(--bew-theme-color)',
            filter: forceWhiteIcon
              ? 'drop-shadow(0 0 4px rgba(0, 0, 0, 0.6))'
              : 'drop-shadow(0 0 4px var(--bew-theme-color-60))',
          }"
        />
      </a>
    </div>
    <TopBarPinnedChannels :force-white-icon="forceWhiteIcon" />
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.bew-popover {
  position: fixed;
  z-index: 999;
}

.logo {
  width: 118px;

  &.activated {
    background-color: transparent;
  }

  .channel-logo {
    filter: none !important;
    transition: filter 0.3s ease;
  }

  &:not(.touch-mode):hover .channel-logo,
  &.activated .channel-logo {
    filter: drop-shadow(0 0 2px var(--bew-theme-color-20)) drop-shadow(0 0 8px var(--bew-theme-color-60))
      drop-shadow(0 0 34px var(--bew-theme-color-80)) !important;
  }
}

.home-button {
  .home-icon {
    transition: all 0.3s;
  }

  &:not(.touch-mode):hover .home-icon {
    color: white !important;
    filter: none !important;
  }
}

.top-bar-logo {
  min-width: 0;
  flex: 0 1 auto;
}

@media (max-width: 700px) {
  .top-bar-logo {
    flex: 0 0 auto;
  }

  .logo {
    width: 76px;
    height: 44px;
    padding-inline: 0;
  }

  .logo .channel-logo {
    width: 76px !important;
    height: auto !important;
  }

  .home-button {
    width: 40px;
    height: 40px;
  }
}
</style>
