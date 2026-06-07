<script setup lang="ts">
import { useDark } from '~/composables/useDark'
import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { isLocalWallpaperUrl, resolveWallpaperUrl } from '~/utils/localWallpaper'
import { hexToHSL } from '~/utils/main'
import { cleanupExpiredCache, getOrCacheWallpaper } from '~/utils/wallpaperCache'

defineProps<{ activatedPage: AppPage }>()

const { isDark } = useDark()

// 组件挂载时清理过期缓存
onMounted(() => {
  cleanupExpiredCache()
  setAppWallpaperMaskingOpacity()
})

// 计算解析后的壁纸URL(支持本地壁纸和缓存控制)
const resolvedWallpaper = ref('')

// 解析全局壁纸
async function resolveGlobalWallpaper() {
  const originalUrl = settings.value.wallpaper

  // 如果是本地壁纸,直接解析,不使用URL缓存
  if (isLocalWallpaperUrl(originalUrl)) {
    resolvedWallpaper.value = resolveWallpaperUrl(originalUrl) || ''
    return
  }

  // 如果是普通URL,使用缓存控制
  if (originalUrl) {
    resolvedWallpaper.value = await getOrCacheWallpaper(originalUrl, settings.value.wallpaperCacheTime)
  }
  else {
    resolvedWallpaper.value = ''
  }
}

// 监听设置变化,重新解析壁纸
watch(() => [settings.value.wallpaper, settings.value.wallpaperCacheTime], ([, newCacheTime], oldValue) => {
  // 如果缓存时间改变,用新的缓存时间清理可能已过期的缓存
  if (oldValue && newCacheTime !== oldValue[1]) {
    cleanupExpiredCache(newCacheTime as number)
  }
  resolveGlobalWallpaper()
}, { immediate: true })

// 计算当前页面使用的壁纸URL
const currentWallpaperUrl = computed(() => {
  return resolvedWallpaper.value
})

const themeColorHsl = computed(() => {
  return hexToHSL(settings.value.themeColor).replace('hsl(', '').replace(')', '')
})
const themeColorHue = computed((): number => {
  return Number(themeColorHsl.value.split(',')[0]) || 0
})
const themeColorSaturation = computed((): number => {
  return Number(themeColorHsl.value.split(',')[1].replace('%', '')) || 0
})
const themeColorLightness = computed((): number => {
  return Number(themeColorHsl.value.split(',')[2].replace('%', '')) || 0
})
const themeColorLinearGradientBackground = computed((): string => {
  return `linear-gradient(180deg, 
    transparent 0% 44%,
    hsla(${themeColorHue.value}, ${themeColorSaturation.value + 20}%, ${themeColorLightness.value}%, 0.4) 62%, 
    hsl(${themeColorHue.value}, ${themeColorSaturation.value}%, ${themeColorLightness.value}%) 80%,
    hsl(${themeColorHue.value}, ${themeColorSaturation.value}%, 100%) 100%)`
})

watch(() => settings.value.wallpaperMaskOpacity, () => {
  setAppWallpaperMaskingOpacity()
})

function setAppWallpaperMaskingOpacity() {
  const bewlyElement = document.querySelector('#bewly') as HTMLElement
  bewlyElement.style.setProperty('--bew-homepage-bg-mask-opacity', `${settings.value.wallpaperMaskOpacity}%`)
}
</script>

<template>
  <div>
    <!-- linear gradient background -->
    <Transition name="fade">
      <div
        v-if="settings.useLinearGradientThemeColorBackground && isDark"
        :style="{
          opacity: 0.4,
          background: themeColorLinearGradientBackground,
        }"
        pos="absolute top-0 left-0" w-full h-full z-0 pointer-events-none
      />
    </Transition>

    <div>
      <!-- background -->
      <div
        :style="{ backgroundImage: `url('${currentWallpaperUrl}')` }"
        pos="absolute top-0 left-0" w-full h-full duration-300 bg="cover center $bew-homepage-bg"
        z--1
      />

      <!-- background mask -->
      <Transition name="fade">
        <div
          v-if="settings.enableWallpaperMasking"
          pos="absolute top-0 left-0" w-full h-full pointer-events-none bg="$bew-homepage-bg-mask"
          duration-300 z--1
          :style="{
            backdropFilter: `blur(${settings.wallpaperBlurIntensity}px)`,
          }"
        />
      </Transition>
    </div>
  </div>
</template>
