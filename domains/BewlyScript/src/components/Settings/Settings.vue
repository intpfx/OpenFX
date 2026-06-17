<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { shouldEnableHoverInteractions } from '~/userscript/mobile'
import { createTransformer } from '~/utils/transformer'

import type { MenuItem } from './types'
import { MenuType } from './types'

const emit = defineEmits(['close'])

const { t } = useI18n()

const settingsMenu = {
  [MenuType.PluginComponentsAndPages]: defineAsyncComponent(() => import('./PluginComponentsAndPages/PluginComponentsAndPages.vue')),
  [MenuType.BilibiliFeaturesEnhancement]: defineAsyncComponent(() => import('./BilibiliFeaturesEnhancement/BilibiliFeaturesEnhancement.vue')),
  [MenuType.Appearance]: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  [MenuType.Shortcuts]: defineAsyncComponent(() => import('./Shortcuts/Shortcuts.vue')),
  [MenuType.Compatibility]: defineAsyncComponent(() => import('./Compatibility/Compatibility.vue')),
}
const activatedMenuItem = ref<MenuType>(MenuType.PluginComponentsAndPages)
const settingsWindow = ref<HTMLDivElement>()
const hoverInteractionsEnabled = computed(() => shouldEnableHoverInteractions(settings.value.touchScreenOptimization))

useEventListener(window, 'resize', () => {
  createTransformer(settingsWindow, {
    x: '50%',
    y: '50%',
    notrigger: true,
    centerTarget: {
      x: true,
      y: true,
    },
  })
})

const scrollViewportRef = ref<HTMLElement>()

watch(
  () => activatedMenuItem.value,
  () => {
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

const settingsMenuItems: MenuItem[] = [
  {
    value: MenuType.PluginComponentsAndPages,
    icon: 'i-mingcute:plugin-2-line',
    iconActivated: 'i-mingcute:plugin-2-fill',
    titleKey: 'settings.menu_plugin_components_and_pages',
  },
  {
    value: MenuType.BilibiliFeaturesEnhancement,
    icon: 'i-mingcute:tv-2-line',
    iconActivated: 'i-mingcute:tv-2-fill',
    titleKey: 'settings.menu_bilibili_features_enhancement',
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-mingcute:paint-brush-line',
    iconActivated: 'i-mingcute:paint-brush-fill',
  },
  {
    value: MenuType.Shortcuts,
    icon: 'i-mingcute:keyboard-line',
    iconActivated: 'i-mingcute:keyboard-fill',
    titleKey: 'settings.shortcuts.title',
  },
  {
    value: MenuType.Compatibility,
    icon: 'i-mingcute:polygon-line',
    iconActivated: 'i-mingcute:polygon-fill',
    titleKey: 'settings.menu_compatibility',
  },
]

const title = computed(() => {
  const currentMenuItem = settingsMenuItems.find(item => item.value === activatedMenuItem.value)
  return currentMenuItem ? t(currentMenuItem.titleKey) : t('settings.title')
})

function handleClose() {
  emit('close')
}

function changeMenuItem(menuItem: MenuType) {
  activatedMenuItem.value = menuItem
}
</script>

<template>
  <div class="settings-overlay fixed w-full h-full top-0 left-0">
    <div
      class="fixed w-full h-full top-0 left-0"
      @click="handleClose"
    />
    <div
      id="settings-window"
      ref="settingsWindow"
      class="settings-window"
      pos="fixed top-1/2 left-1/2" w="90%" h="90%"
      max-w-1000px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-sidebar"
        :class="{ group: hoverInteractionsEnabled }"
        shrink-0 p="x-4" pos="absolute xl:left--84px left--44px" z-2
      >
        <ul
          class="settings-menu"
          :class="hoverInteractionsEnabled
            ? 'rounded-30px bg-$bew-content-alt group-hover:rounded-25px group-hover:bg-$bew-elevated dark:bg-$bew-elevated dark-group-hover:bg-$bew-elevated group-hover:scale-105'
            : 'rounded-25px bg-$bew-elevated dark:bg-$bew-elevated'"
          style="
            box-shadow: var(--bew-shadow-4);
          "
          relative flex="~ gap-2 col" p-2 duration-300 overflow-hidden antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            style="
              box-shadow: var(--bew-shadow-edge-glow-2);
              backdrop-filter: var(--bew-filter-glass-2);
            "
            pos="absolute top-0 left-0" z--1
            w-full h-full pointer-events-none
            border="1 $bew-border-color"
            rounded-inherit duration-inherit
          />

          <li v-for="menuItem in settingsMenuItems" :key="menuItem.value">
            <a
              class="settings-menu-link"
              :class="[
                hoverInteractionsEnabled ? 'w-40px group-hover:w-190px' : 'w-190px',
                { 'menu-item-activated': menuItem.value === activatedMenuItem },
              ]"
              cursor-pointer h-40px
              rounded-30px flex items-center overflow-x-hidden
              duration-300 bg="hover:$bew-fill-2"
              @click="changeMenuItem(menuItem.value)"
            >
              <div
                v-show="menuItem.value !== activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.icon"
              />
              <div
                v-show="menuItem.value === activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.iconActivated"
              />
              <div flex="~ items-center gap-2" shrink-0>
                <span>{{ $t(menuItem.titleKey) }}</span>
                <span
                  v-if="menuItem.badge"
                  text="xs"
                  bg="orange-500/20"
                  px-2 py-0.5
                  rounded-full
                  text-orange-500
                  fw-500
                >
                  {{ menuItem.badge }}
                </span>
              </div>
            </a>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content"
        style="
          --un-shadow: var(--bew-shadow-4), var(--bew-shadow-edge-glow-2);
          backdrop-filter: var(--bew-filter-glass-2);
        "
        relative overflow="x-hidden" w-full h-full bg="$bew-elevated-alt"
        shadow rounded="$bew-radius" border="1 $bew-border-color"
      >
        <header
          flex justify-between items-center w-full h-80px
          pos="fixed top-0 left-0" p="x-11"
          z-1 rounded="t-$bew-radius"
          style="
            text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
          "
        >
          <!-- Mask -->
          <div
            pos="absolute top-0 left-0" w-inherit h-inherit pointer-events-none
            :style="{
              maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, black 0, transparent 100%)' : 'none',
              WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, black 0, transparent 100%)' : 'none',
              backdropFilter: 'blur(6px)',
            }"
            z--1 rounded-inherit
          />
          <div class="settings-title" text="3xl" fw-bold>
            {{ title }}
          </div>
          <div
            style="
              backdrop-filter: var(--bew-filter-glass-1);
              box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-2);
            "
            text="!16px hover:$bew-theme-color" w="32px" h="32px"
            flex="~ items-center justify-center shrink-0"
            bg="$bew-elevated dark:$bew-fill-1 hover:$bew-theme-color-30"
            rounded-8 cursor="pointer" border="1 $bew-border-color" box-border
            duration-300
            @click="handleClose"
          >
            <div i-ic-baseline-clear />
          </div>
        </header>
        <div
          ref="scrollViewportRef"
          class="settings-scroll-viewport"
          :style="{
            maskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 80px 30%)' : 'none',
            WebkitMaskImage: settings.enableFrostedGlass ? 'linear-gradient(to bottom, transparent 0%, black 80px 30%)' : 'none',
            scrollbarGutter: 'stable',
          }"
          h-inherit of-y-auto of-x-hidden
          style="padding-top: 80px;"
        >
          <main w-full min-h="[calc(100%-80px)]" p="x-12 b-10">
            <!-- <div h-80px mt--8 /> -->

            <Transition name="page-fade">
              <Component :is="settingsMenu[activatedMenuItem as keyof typeof settingsMenu]" />
            </Transition>
          </main>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.menu-item-activated {
  --uno: "text-$bew-text-auto bg-$bew-theme-color-auto";
}

@media (max-width: 700px) {
  .settings-overlay {
    pointer-events: auto;
  }

  .settings-window {
    top: auto !important;
    left: 0 !important;
    right: 0;
    bottom: 0;
    width: 100% !important;
    height: min(92dvh, calc(100dvh - 12px)) !important;
    max-width: none !important;
    max-height: none !important;
    transform: none !important;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 0 8px calc(env(safe-area-inset-bottom, 0px) + 8px);
    box-sizing: border-box;
  }

  .settings-sidebar {
    position: relative !important;
    left: auto !important;
    order: 2;
    width: 100%;
    padding: 8px 2px 0;
    box-sizing: border-box;
  }

  .settings-menu {
    display: flex !important;
    flex-direction: row !important;
    gap: 6px !important;
    width: 100%;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    border-radius: 18px !important;
    padding: 6px !important;
    scrollbar-width: none;
  }

  .settings-menu::-webkit-scrollbar {
    display: none;
  }

  .settings-menu-link {
    width: 44px !important;
    min-width: 44px;
    height: 40px !important;
  }

  .settings-menu-link span {
    display: none;
  }

  .settings-content {
    order: 1;
    height: calc(100% - 62px) !important;
    min-height: 0;
    border-radius: 18px !important;
  }

  .settings-content header {
    height: 60px !important;
    padding: 0 16px !important;
  }

  .settings-title {
    font-size: 20px !important;
    line-height: 1.2;
  }

  .settings-scroll-viewport {
    padding-top: 60px !important;
  }

  .settings-content main {
    padding: 0 14px 24px !important;
  }
}
</style>
