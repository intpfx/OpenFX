import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, ref } from 'vue'

interface MobileBottomDrawerDragOptions {
  enabled: () => boolean
  onClose: () => void | Promise<void>
  getCloseOffset?: () => number
  closeThresholdPx?: number
  fastCloseThresholdPx?: number
  fastCloseVelocityPxPerMs?: number
  reboundMs?: number
  closeMs?: number
}

const DEFAULT_CLOSE_THRESHOLD_PX = 76
const DEFAULT_FAST_CLOSE_THRESHOLD_PX = 34
const DEFAULT_FAST_CLOSE_VELOCITY_PX_PER_MS = 0.42
const DEFAULT_REBOUND_MS = 190
const DEFAULT_CLOSE_MS = 240

export function useMobileBottomDrawerDrag(options: MobileBottomDrawerDragOptions) {
  const offsetY = ref(0)
  const isDragging = ref(false)
  const isSettling = ref(false)
  const isClosing = ref(false)

  let activePointerId: number | undefined
  let startY = 0
  let lastY = 0
  let startedAt = 0
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const reboundMs = options.reboundMs ?? DEFAULT_REBOUND_MS
  const closeMs = options.closeMs ?? DEFAULT_CLOSE_MS

  const drawerStyle = computed<CSSProperties | undefined>(() => {
    if (!options.enabled())
      return undefined

    if (!isDragging.value && !isSettling.value && !isClosing.value && offsetY.value <= 0)
      return undefined

    return {
      transform: `translate3d(0, ${offsetY.value}px, 0)`,
      transition: isDragging.value
        ? 'none'
        : isClosing.value
          ? `transform ${closeMs}ms cubic-bezier(0.32, 0, 0.67, 0)`
          : `transform ${reboundMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      willChange: 'transform',
    }
  })

  const stateAttrs = computed(() => ({
    'data-bewly-mobile-drawer-dragging': isDragging.value ? 'true' : undefined,
    'data-bewly-mobile-drawer-settling': isSettling.value ? 'true' : undefined,
    'data-bewly-mobile-drawer-closing': isClosing.value ? 'true' : undefined,
  }))

  function clearMotionTimers() {
    if (settleTimer) {
      clearTimeout(settleTimer)
      settleTimer = undefined
    }
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
  }

  function removeWindowDragListeners() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
  }

  function resetDragState() {
    activePointerId = undefined
    isDragging.value = false
    removeWindowDragListeners()
  }

  function settleDrawer() {
    clearMotionTimers()
    activePointerId = undefined
    offsetY.value = 0
    isDragging.value = false
    isClosing.value = false
    isSettling.value = true

    settleTimer = setTimeout(() => {
      isSettling.value = false
      settleTimer = undefined
    }, reboundMs)
  }

  function closeDrawerWithMotion() {
    clearMotionTimers()
    activePointerId = undefined
    isDragging.value = false
    isSettling.value = false
    isClosing.value = true
    offsetY.value = Math.max(options.getCloseOffset?.() ?? window.innerHeight, window.innerHeight * 0.42)

    closeTimer = setTimeout(() => {
      closeTimer = undefined
      void options.onClose()
    }, closeMs)
  }

  function handlePointerMove(event: PointerEvent) {
    if (!options.enabled() || activePointerId !== event.pointerId)
      return

    lastY = event.clientY
    offsetY.value = Math.max(0, lastY - startY)

    if (lastY >= startY)
      event.preventDefault()
  }

  function handlePointerCancel(event: PointerEvent) {
    if (activePointerId !== event.pointerId)
      return

    resetDragState()
    settleDrawer()
  }

  function handlePointerUp(event: PointerEvent) {
    if (activePointerId !== event.pointerId)
      return

    lastY = event.clientY
    const deltaY = Math.max(0, lastY - startY)
    const elapsedMs = Math.max(1, performance.now() - startedAt)
    const velocity = deltaY / elapsedMs

    resetDragState()

    const closeThreshold = options.closeThresholdPx ?? DEFAULT_CLOSE_THRESHOLD_PX
    const fastCloseThreshold = options.fastCloseThresholdPx ?? DEFAULT_FAST_CLOSE_THRESHOLD_PX
    const fastCloseVelocity = options.fastCloseVelocityPxPerMs ?? DEFAULT_FAST_CLOSE_VELOCITY_PX_PER_MS

    if (deltaY >= closeThreshold || (deltaY >= fastCloseThreshold && velocity >= fastCloseVelocity))
      closeDrawerWithMotion()
    else
      settleDrawer()
  }

  function handlePointerDown(event: PointerEvent) {
    if (!options.enabled())
      return
    if (event.pointerType === 'mouse' && event.button !== 0)
      return

    clearMotionTimers()
    removeWindowDragListeners()
    activePointerId = event.pointerId
    startY = event.clientY
    lastY = event.clientY
    startedAt = performance.now()
    offsetY.value = 0
    isDragging.value = true
    isSettling.value = false
    isClosing.value = false

    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.setPointerCapture(event.pointerId)

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    event.preventDefault()
    event.stopPropagation()
  }

  onBeforeUnmount(() => {
    clearMotionTimers()
    removeWindowDragListeners()
  })

  return {
    drawerStyle,
    handlePointerDown,
    stateAttrs,
  }
}
