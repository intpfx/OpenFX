import { OVERLAY_SCROLL_BAR_SCROLL, OVERLAY_SCROLL_STATE_CHANGE } from '~/constants/globalEvents'
import emitter from '~/utils/mitt'

interface AutoPreviewCandidate {
  id: symbol
  element: HTMLElement
  setActive: (active: boolean) => void
}

const candidates = new Map<symbol, AutoPreviewCandidate>()

let listenersAttached = false
let frameId: number | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null

function findScrollRoot(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement

  while (current) {
    const styles = window.getComputedStyle(current)
    if (/(auto|scroll|overlay)/.test(`${styles.overflowY} ${styles.overflow}`) && current.scrollHeight > current.clientHeight)
      return current

    current = current.parentElement
  }

  return null
}

function getRootRect(element: HTMLElement): DOMRect | { top: number, bottom: number, height: number } {
  const root = findScrollRoot(element)
  if (root)
    return root.getBoundingClientRect()

  return {
    top: 0,
    bottom: window.innerHeight,
    height: window.innerHeight,
  }
}

function visibleHeightWithinRoot(elementRect: DOMRect, rootRect: { top: number, bottom: number }): number {
  return Math.max(0, Math.min(elementRect.bottom, rootRect.bottom) - Math.max(elementRect.top, rootRect.top))
}

function updateActiveCandidate() {
  frameId = null

  let bestCandidate: AutoPreviewCandidate | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  candidates.forEach((candidate, id) => {
    if (!candidate.element.isConnected) {
      candidates.delete(id)
      return
    }

    const elementRect = candidate.element.getBoundingClientRect()
    const rootRect = getRootRect(candidate.element)
    const rootCenter = rootRect.top + rootRect.height / 2
    const visibleHeight = visibleHeightWithinRoot(elementRect, rootRect)

    if (visibleHeight <= 0)
      return

    const minimumVisibleHeight = Math.min(elementRect.height * 0.42, rootRect.height * 0.32)
    if (visibleHeight < minimumVisibleHeight)
      return

    const elementCenter = elementRect.top + elementRect.height / 2
    const distance = Math.abs(elementCenter - rootCenter)

    if (distance < bestDistance) {
      bestDistance = distance
      bestCandidate = candidate
    }
  })

  candidates.forEach(candidate => candidate.setActive(candidate === bestCandidate))
}

function scheduleUpdate(delay = 0) {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }

  if (delay > 0) {
    settleTimer = setTimeout(() => {
      scheduleUpdate()
    }, delay)
    return
  }

  if (frameId !== null)
    return

  frameId = requestAnimationFrame(updateActiveCandidate)
}

function handleScrollStateChange(scrolling: boolean) {
  scheduleUpdate(scrolling ? 0 : 80)
}

function handleScroll() {
  scheduleUpdate()
}

function attachListeners() {
  if (listenersAttached)
    return

  listenersAttached = true
  emitter.on(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  emitter.on(OVERLAY_SCROLL_STATE_CHANGE, handleScrollStateChange)
  window.addEventListener('resize', handleScroll)
  window.addEventListener('scroll', handleScroll, { passive: true })
}

function detachListeners() {
  if (!listenersAttached || candidates.size !== 0)
    return

  listenersAttached = false
  emitter.off(OVERLAY_SCROLL_BAR_SCROLL, handleScroll)
  emitter.off(OVERLAY_SCROLL_STATE_CHANGE, handleScrollStateChange)
  window.removeEventListener('resize', handleScroll)
  window.removeEventListener('scroll', handleScroll)

  if (frameId !== null) {
    cancelAnimationFrame(frameId)
    frameId = null
  }

  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

export function registerAutoPreviewCandidate(element: HTMLElement, setActive: (active: boolean) => void): () => void {
  const id = Symbol('auto-preview-candidate')
  candidates.set(id, { id, element, setActive })
  attachListeners()
  scheduleUpdate()

  return () => {
    const candidate = candidates.get(id)
    candidates.delete(id)
    candidate?.setActive(false)
    scheduleUpdate()
    detachListeners()
  }
}
