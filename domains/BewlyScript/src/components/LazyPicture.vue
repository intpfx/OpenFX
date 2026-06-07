<script setup lang="ts">
/**
 * 优化的懒加载图片组件
 * 使用 Intersection Observer API 实现精确的懒加载控制
 * 只在图片即将进入视口时才开始加载，减少不必要的网络请求
 */

interface Props {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
  // rootMargin: 距离视口多少像素时开始加载，默认 150px
  rootMargin?: string
  // 是否在图片离开保留范围后释放 img/src
  releaseOffscreen?: boolean
  // 保留可视区域上下多少屏内的图片
  retainScreens?: number
  // 是否显示骨架屏动画
  showSkeleton?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  alt: '',
  loading: 'lazy',
  rootMargin: '150px', // 平衡预加载和性能
  releaseOffscreen: true,
  retainScreens: 3,
  showSkeleton: true,
})

const emit = defineEmits<{
  loaded: []
}>()

const imgRef = ref<HTMLElement>()
const isVisible = ref(false)
const isLoaded = ref(false)
const actualSrc = ref('')

// IntersectionObserver 实例
let observer: IntersectionObserver | null = null

function cleanupObserver() {
  observer?.disconnect()
  observer = null
}

// 开始加载图片
function startLoad() {
  isVisible.value = true
  actualSrc.value = props.src
}

function releaseImage() {
  if (!props.releaseOffscreen || props.loading === 'eager')
    return

  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
}

function getObserverRootMargin() {
  if (!props.releaseOffscreen)
    return props.rootMargin

  const screens = Number.isFinite(props.retainScreens) && props.retainScreens > 0
    ? props.retainScreens
    : 3

  return `${screens * 100}% 0px`
}

function isElementInRetainedRange(element: HTMLElement): boolean {
  const screens = Number.isFinite(props.retainScreens) && props.retainScreens > 0
    ? props.retainScreens
    : 3
  const margin = window.innerHeight * screens
  const rect = element.getBoundingClientRect()

  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin
}

// 如果是 eager 模式，立即加载
if (props.loading === 'eager') {
  isVisible.value = true
  actualSrc.value = props.src
}

onMounted(() => {
  // eager 模式直接加载
  if (props.loading === 'eager') {
    return
  }

  // 创建并绑定 IntersectionObserver 的函数
  const createObserver = () => {
    // 先断开之前的 observer，避免重复
    cleanupObserver()

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible.value) {
            startLoad()
          }
          else if (!entry.isIntersecting) {
            if (isVisible.value)
              releaseImage()
          }
        })
      },
      {
        rootMargin: getObserverRootMargin(),
        threshold: 0.01,
      },
    )

    if (imgRef.value) {
      observer.observe(imgRef.value)
    }
  }

  // 初次创建 observer
  createObserver()

  // 监听 imgRef.value，如果 DOM 刷新或替换，重新绑定 observer
  watch(
    () => imgRef.value,
    (newEl) => {
      if (newEl) {
        createObserver()
      }
    },
  )

  // 可选：强制检查保留范围内立即加载图片（解决刷新后顶部不显示问题）
  nextTick(() => {
    if (imgRef.value && !isVisible.value) {
      if (isElementInRetainedRange(imgRef.value)) {
        startLoad()
      }
    }
  })
})

onBeforeUnmount(() => {
  cleanupObserver()
  actualSrc.value = ''
  isVisible.value = false
  isLoaded.value = false
})

// 监听图片加载完成
function handleImageLoad() {
  isLoaded.value = true
  emit('loaded')
}

// 监听 src 变化（用于图片切换场景）
watch(() => props.src, (newSrc) => {
  if (isVisible.value) {
    actualSrc.value = newSrc
    isLoaded.value = false
  }
})
</script>

<template>
  <picture
    ref="imgRef"
    w-full max-w-full align-middle
    rounded="$bew-radius"
    style="aspect-ratio: 16 / 9; display: block; overflow: hidden; contain: layout style;"
  >
    <!-- 骨架屏 - 图片未可见时显示（仅当 showSkeleton 为 true 时） -->
    <div
      v-if="!isVisible && showSkeleton"
      w-full h-full
      bg="$bew-skeleton"
      rounded="$bew-radius"
      class="animate-pulse"
      style="aspect-ratio: 16 / 9;"
    />

    <!-- 实际图片 - 图片可见后加载 -->
    <template v-if="isVisible && actualSrc">
      <source :srcset="`${actualSrc}.avif`" type="image/avif">
      <source :srcset="`${actualSrc}.webp`" type="image/webp">
      <img
        :src="actualSrc"
        :alt="alt"
        loading="lazy"
        decoding="async"
        block w-full h-full
        rounded-inherit
        style="aspect-ratio: 16 / 9; object-fit: cover; object-position: center;"
        :style="{ opacity: isLoaded ? 1 : 0 }"
        class="image-transition"
        @load="handleImageLoad"
      >
    </template>
  </picture>
</template>

<style scoped>
.image-transition {
  transition: opacity 0.5s ease-out;
  will-change: opacity;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
