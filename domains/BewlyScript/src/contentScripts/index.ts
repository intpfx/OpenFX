import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { localSettings, settings } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import {
  BEWLY_MOBILE_LOGIN_INTENT_PARAM,
  BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM,
  BEWLY_MOBILE_VIDEO_DRAWER_PARAM,
  getBewlyMobileLoginUrl,
  hasBewlyMobileVideoDrawerFrameMarker,
  hasBewlyMobileLoginIntent,
  injectMobileNativeHeaderCSS,
  installMobileNoNewTabGuard,
  isMobileUserscriptRuntimePage,
  isUserscriptRuntime,
  markBewlyMobileVideoDrawerFrameUrl,
  MOBILE_OPEN_LOGIN_DRAWER_EVENT,
  MOBILE_USERSCRIPT_SHADOW_CSS,
  MOBILE_VIDEO_DETAIL_CSS,
  MOBILE_VIDEO_DETAIL_FRAME_CSS,
  openMobileUrlInCurrentPage,
  setMobileNativeContentHidden,
  shouldOpenMobileVideoDetailAsDrawer,
  shouldHideMobileNativeContentForPage,
  shouldUseMobileVideoDetailLayout,
} from '~/userscript/mobile'
import { sanitizeInlineSvg } from '~/userscript/svg-sanitizer'
import { applyBewlyWidescreen, exitBewlyWidescreen } from '~/utils/bewlyWidescreen'
import { cleanupBilibiliScripts } from '~/utils/bilibiliScriptCleanup'
import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, resetBilibiliTopBarInlineStyles, setupLoginButtonClickHandlers } from '~/utils/bilibiliTopBar'
import { initFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { runWhenIdle } from '~/utils/lazyLoad'
import { getLocalWallpaper, hasLocalWallpaper, isLocalWallpaperUrl } from '~/utils/localWallpaper'
import { compareVersions, injectCSS, isElectron, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage } from '~/utils/main'
import { applyAutoPlayByVideoType, applyDefaultDanmakuState, defaultMode, handleVideoPageNavigation, isCollectionVideo, isPlayerDisplayModeReady, isVideoPage, startAutoExitFullscreenMonitoring, startAutoPlayUserChangeMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { initRandomPlay, resetRandomPlayInitialization } from '~/utils/randomPlay'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'

import { version } from '../../package.json'
import { initAudioInterceptor, setupSettingsWatcher } from './audioInterceptor'
import { setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import { createMobileVideoDetailFramePlayerViewState } from './mobileVideoFramePlayerState'
import App from './views/App.vue'
import { initVolumeNormalizationControl } from './volumeNormalizationControl'

const isFirefox: boolean = /Firefox/i.test(navigator.userAgent)
const isElectronEnv = isElectron()

const currentUrl = document.URL
const isMobileUserscriptPage = !isInIframe() && isUserscriptRuntime() && isMobileUserscriptRuntimePage(currentUrl)
const shouldRedirectMobileVideoDetailToDrawer = canRedirectMobileVideoDetailToDrawer() && shouldOpenMobileVideoDetailAsDrawer(currentUrl)
const shouldHideMobileNativeContent = isMobileUserscriptPage && !shouldRedirectMobileVideoDetailToDrawer && shouldHideMobileNativeContentForPage(currentUrl)
const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_ATTR = 'data-bewly-mobile-video-drawer-host-fallback'
const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_DELAY_MS = 900
const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_RETRY_DELAYS_MS = [120, 360, 720, 1200, 1800]
const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_CLOSE_THRESHOLD_PX = 86
const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_FAST_VELOCITY_PX_PER_MS = 0.42
const ENABLE_MOBILE_VIDEO_DRAWER_HOST_FALLBACK = false

function isBewlyMobileVideoDetailDrawerFrame(): boolean {
  return isInIframe()
    && (
      hasBewlyMobileVideoDrawerFrameMarker()
      || location.search.includes(`${BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM}=1`)
      || document.referrer.includes(BEWLY_MOBILE_VIDEO_DRAWER_PARAM)
    )
}

function canRedirectMobileVideoDetailToDrawer(): boolean {
  const canAutoRedirect = isUserscriptRuntime() && !isBewlyMobileVideoDetailDrawerFrame()
  return canAutoRedirect && false
}

function shouldUseMobileVideoDetailLayoutForCurrentDocument(url: string = location.href): boolean {
  if (!isInIframe() && shouldRedirectMobileVideoDetailToDrawer)
    return false

  return shouldUseMobileVideoDetailLayout(url)
}

if (ENABLE_MOBILE_VIDEO_DRAWER_HOST_FALLBACK)
  scheduleMobileVideoDrawerHostFallback()

function getMobileVideoDrawerHostIntent(url: string = location.href): string | undefined {
  try {
    return new URL(url, location.href).searchParams.get(BEWLY_MOBILE_VIDEO_DRAWER_PARAM) ?? undefined
  }
  catch {
    return undefined
  }
}

function isMobileVideoDrawerHostFallbackRuntimePage(url: string = location.href): boolean {
  if (isInIframe() || !isUserscriptRuntime() || !getMobileVideoDrawerHostIntent(url))
    return false

  try {
    const parsed = new URL(url, location.href)
    return parsed.protocol === 'https:'
      && (parsed.hostname === 'www.bilibili.com' || parsed.hostname === 'bilibili.com')
  }
  catch {
    return false
  }
}

function consumeMobileVideoDrawerHostIntentParam(): void {
  try {
    const current = new URL(location.href)
    if (!current.searchParams.has(BEWLY_MOBILE_VIDEO_DRAWER_PARAM))
      return

    current.searchParams.delete(BEWLY_MOBILE_VIDEO_DRAWER_PARAM)
    if (!current.searchParams.get('page'))
      current.searchParams.set('page', 'Home')

    history.replaceState(history.state, '', `${current.pathname}${current.search}${current.hash}`)
    window.dispatchEvent(new Event('replacestate'))
  }
  catch {
    // Keep the current URL if Safari refuses history updates in a transient state.
  }
}

function shouldInstallMobileVideoDrawerHostFallback(): boolean {
  return isMobileVideoDrawerHostFallbackRuntimePage()
    && !document.querySelector(`[${MOBILE_VIDEO_DRAWER_HOST_FALLBACK_ATTR}="true"]`)
}

function applyMobileVideoDrawerHostFallbackStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value, 'important')
  })
}

function resetMobileVideoDrawerHostDocument(): HTMLElement | null {
  try {
    document.documentElement.setAttribute('data-bewly-mobile-video-drawer-host-fallback-page', 'true')
    document.documentElement.style.setProperty('background', '#101114', 'important')
    document.documentElement.style.setProperty('overflow', 'hidden', 'important')
    document.documentElement.style.setProperty('width', '100%', 'important')
    document.documentElement.style.setProperty('height', '100%', 'important')
    if (document.body) {
      document.body.setAttribute('data-bewly-mobile-video-drawer-host-shell', 'true')
      document.body.style.setProperty('background', '#101114', 'important')
      document.body.style.setProperty('margin', '0', 'important')
      document.body.style.setProperty('overflow', 'hidden', 'important')
      document.body.style.setProperty('width', '100%', 'important')
      document.body.style.setProperty('min-height', '100%', 'important')
    }
  }
  catch {
    // Keep installing the drawer even if Safari refuses style mutations during startup.
  }

  return document.body ?? document.documentElement
}

function getMobileVideoDrawerFrameLoadingHtml(): string {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{width:100%;height:100%;margin:0;background:#101114;color:#c9d1dd;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}body{display:grid;place-items:center;}</style></head><body>正在打开视频详情...</body></html>'
}

function closeMobileVideoDrawerHostFallback(root: HTMLElement, restoreNativeContent = true): void {
  root.setAttribute('data-bewly-mobile-video-drawer-host-fallback-closing', 'true')
  root.style.setProperty('transition', 'transform 220ms cubic-bezier(0.32, 0, 0.67, 0)', 'important')
  root.style.setProperty('transform', 'translate3d(0, 100%, 0)', 'important')
  window.setTimeout(() => {
    root.remove()
    if (restoreNativeContent)
      setMobileNativeContentHidden(false)
  }, 230)
}

function bindMobileVideoDrawerHostFallbackDrag(root: HTMLElement, handle: HTMLElement): void {
  let pointerId: number | undefined
  let startY = 0
  let lastY = 0
  let lastTime = 0

  const clearPointer = () => {
    pointerId = undefined
    root.removeAttribute('data-bewly-mobile-video-drawer-host-fallback-dragging')
  }

  const setTranslateY = (value: number, transition = 'none') => {
    const offset = Math.max(0, value)
    root.style.setProperty('transition', transition, 'important')
    root.style.setProperty('transform', `translate3d(0, ${offset}px, 0)`, 'important')
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0)
      return

    pointerId = event.pointerId
    startY = event.clientY
    lastY = event.clientY
    lastTime = performance.now()
    root.setAttribute('data-bewly-mobile-video-drawer-host-fallback-dragging', 'true')
    handle.setPointerCapture(event.pointerId)
    setTranslateY(0)
    event.preventDefault()
    event.stopPropagation()
  }, { passive: false })

  handle.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId)
      return

    const now = performance.now()
    lastY = event.clientY
    lastTime = now
    setTranslateY(event.clientY - startY)
    event.preventDefault()
    event.stopPropagation()
  }, { passive: false })

  const finishDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId)
      return

    const offset = Math.max(0, event.clientY - startY)
    const elapsed = Math.max(1, performance.now() - lastTime)
    const velocity = Math.max(0, event.clientY - lastY) / elapsed
    if (handle.hasPointerCapture(event.pointerId))
      handle.releasePointerCapture(event.pointerId)
    clearPointer()

    if (offset >= MOBILE_VIDEO_DRAWER_HOST_FALLBACK_CLOSE_THRESHOLD_PX || velocity >= MOBILE_VIDEO_DRAWER_HOST_FALLBACK_FAST_VELOCITY_PX_PER_MS) {
      closeMobileVideoDrawerHostFallback(root)
    }
    else {
      setTranslateY(0, 'transform 180ms cubic-bezier(0.2, 0, 0, 1)')
      window.setTimeout(() => {
        root.style.removeProperty('transition')
        root.style.removeProperty('transform')
      }, 190)
    }

    event.preventDefault()
    event.stopPropagation()
  }

  handle.addEventListener('pointerup', finishDrag)
  handle.addEventListener('pointercancel', finishDrag)
}

function installMobileVideoDrawerHostFallback(drawerUrl: string): boolean {
  consumeMobileVideoDrawerHostIntentParam()
  const mountTarget = resetMobileVideoDrawerHostDocument()
  if (!mountTarget || document.querySelector(`[${MOBILE_VIDEO_DRAWER_HOST_FALLBACK_ATTR}="true"]`))
    return false

  const root = document.createElement('section')
  root.setAttribute(MOBILE_VIDEO_DRAWER_HOST_FALLBACK_ATTR, 'true')
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '视频详情')
  applyMobileVideoDrawerHostFallbackStyles(root, {
    'background': '#101114',
    'color': '#f2f3f5',
    'display': 'grid',
    'grid-template-rows': 'clamp(18px, 3.5dvh, 24px) minmax(0, 1fr)',
    'height': '100dvh',
    'inset': '0',
    'overflow': 'hidden',
    'pointer-events': 'auto',
    'position': 'fixed',
    'touch-action': 'none',
    'width': '100vw',
    'z-index': '2147483200',
  })

  const handle = document.createElement('button')
  handle.type = 'button'
  handle.setAttribute('aria-label', '下滑关闭视频详情')
  applyMobileVideoDrawerHostFallbackStyles(handle, {
    'appearance': 'none',
    '-webkit-appearance': 'none',
    'background': 'transparent',
    'border': '0',
    'display': 'grid',
    'height': '100%',
    'margin': '0',
    'padding': '0',
    'place-items': 'center',
    'touch-action': 'none',
    'width': '100%',
  })

  const handleBar = document.createElement('span')
  applyMobileVideoDrawerHostFallbackStyles(handleBar, {
    'background': 'rgba(255, 255, 255, 0.36)',
    'border-radius': '999px',
    'display': 'block',
    'height': 'clamp(4px, 0.8dvh, 5px)',
    'width': 'clamp(40px, 12vw, 54px)',
  })
  handle.append(handleBar)

  const iframe = document.createElement('iframe')
  iframe.title = '视频详情'
  iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  iframe.srcdoc = getMobileVideoDrawerFrameLoadingHtml()
  applyMobileVideoDrawerHostFallbackStyles(iframe, {
    'background': '#101114',
    'border': '0',
    'display': 'block',
    'height': '100%',
    'width': '100%',
  })

  root.append(handle, iframe)
  mountTarget.append(root)
  setMobileNativeContentHidden(true)
  bindMobileVideoDrawerHostFallbackDrag(root, handle)
  window.setTimeout(() => {
    iframe.src = markBewlyMobileVideoDrawerFrameUrl(drawerUrl)
  }, 120)
  return true
}

function scheduleMobileVideoDrawerHostFallback(): void {
  if (!shouldInstallMobileVideoDrawerHostFallback())
    return

  const tryInstall = (retryIndex = 0) => {
    const drawerUrl = getMobileVideoDrawerHostIntent()
    if (!drawerUrl || !shouldInstallMobileVideoDrawerHostFallback())
      return

    if (!document.body) {
      const retryDelay = MOBILE_VIDEO_DRAWER_HOST_FALLBACK_RETRY_DELAYS_MS[retryIndex]
      if (retryDelay === undefined)
        return

      window.setTimeout(() => {
        tryInstall(retryIndex + 1)
      }, retryDelay)
      return
    }

    installMobileVideoDrawerHostFallback(drawerUrl)
  }

  window.setTimeout(() => {
    tryInstall()
  }, MOBILE_VIDEO_DRAWER_HOST_FALLBACK_DELAY_MS)
}

let mobileVideoDetailStyleEl: HTMLStyleElement | undefined
let mobileVideoDetailFrameStyleEl: HTMLStyleElement | undefined
let mobileVideoDetailNavigationGuardInstalled = false
let mobileVideoDetailStructureObserver: MutationObserver | undefined
let mobileVideoDetailStructureTimer: ReturnType<typeof setTimeout> | undefined
let mobileVideoDetailStructureRetryCount = 0
let mobileVideoDetailFrameObserver: MutationObserver | undefined
let mobileVideoDetailFrameTimer: ReturnType<typeof setTimeout> | undefined
let mobileVideoDetailFrameRetryCount = 0
let mobileVideoDetailFrameClickHandler: ((event: MouseEvent) => void) | undefined
let mobileVideoDetailFrameViewportHandler: (() => void) | undefined
let mobileLoginDrawerEnhancementObserver: MutationObserver | undefined
let mobileLoginDrawerEnhancementTimer: ReturnType<typeof setTimeout> | undefined

const MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_ATTR = 'data-bewly-mobile-login-previous-display'
const MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_PRIORITY_ATTR = 'data-bewly-mobile-login-previous-display-priority'
const MOBILE_VIDEO_DETAIL_LOGIN_DRAG_HANDLE_ATTR = 'data-bewly-mobile-login-drag-handle'
const MOBILE_VIDEO_DETAIL_COMMENT_COMPOSER_ATTR = 'data-bewly-mobile-comment-composer'
const MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_STYLE_ATTR = 'data-bewly-mobile-comment-shadow-style'
const MOBILE_NATIVE_CONTENT_MANAGED_ATTR = 'data-bewly-mobile-native-managed'
const MOBILE_NATIVE_CONTENT_PREVIOUS_ARIA_HIDDEN_ATTR = 'data-bewly-mobile-previous-aria-hidden'
const MOBILE_VIDEO_DETAIL_LOGIN_DRAG_THRESHOLD_PX = 72
const MOBILE_VIDEO_DETAIL_LOGIN_FAST_DRAG_THRESHOLD_PX = 36
const MOBILE_VIDEO_DETAIL_LOGIN_FAST_DRAG_VELOCITY_PX_PER_MS = 0.42
const MOBILE_VIDEO_DETAIL_LOGIN_REBOUND_TRANSITION = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)'
const MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_TRANSITION = 'transform 220ms cubic-bezier(0.32, 0, 0.67, 0)'
const MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_ANIMATION_MS = 230
const MOBILE_LOGIN_NATIVE_FALLBACK_MS = 900
const MOBILE_LOGIN_NATIVE_TRIGGER_RETRY_DELAYS_MS = [0, 120, 280, 520]
const MOBILE_LOGIN_NATIVE_ACCESS_RESTORE_MS = 1400
const MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR = 'data-bewly-mobile-player-card'
const MOBILE_VIDEO_DETAIL_MEDIA_ORIENTATION_ATTR = 'data-bewly-mobile-video-media-orientation'
const MOBILE_VIDEO_DETAIL_PLAYER_MEDIA_ORIENTATION_ATTR = 'data-bewly-mobile-player-media-orientation'
const MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR = '#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_ROOT_ATTR = 'data-bewly-mobile-frame-player-root'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR = 'data-bewly-mobile-frame-player-toolbar'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SOURCE_ATTR = 'data-bewly-mobile-frame-player-source'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPEED_MENU_ATTR = 'data-bewly-mobile-frame-player-speed-menu'
const MOBILE_VIDEO_DETAIL_FRAME_DANMAKU_HIDDEN_ATTR = 'data-bewly-mobile-frame-danmaku-hidden'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SHEET_OPEN_ATTR = 'data-bewly-mobile-frame-player-sheet-open'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_DETACHED_ATTR = 'data-bewly-mobile-frame-player-detached'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR = 'data-bewly-mobile-frame-player-controls-visible'
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPACER_ATTR = 'data-bewly-mobile-frame-player-spacer'
const MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR = 'data-bewly-mobile-video-detail-frame-overlay'
const MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR = 'data-bewly-mobile-frame-web-fullscreen'
const MOBILE_VIDEO_DETAIL_BACK_BUTTON_ATTR = 'data-bewly-mobile-video-back'
const MOBILE_VIDEO_DETAIL_TOOLBAR_BACK_HIDDEN_ATTR = 'data-bewly-mobile-toolbar-back-hidden'
const MOBILE_VIDEO_DETAIL_FRAME_ENHANCEMENT_RETRY_MS = 300
const MOBILE_VIDEO_DETAIL_FRAME_ENHANCEMENT_MAX_RETRIES = 20
const MOBILE_VIDEO_DETAIL_FRAME_CONTROLS_IDLE_MS = 4800
const MOBILE_VIDEO_DETAIL_FRAME_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2]
const MOBILE_VIDEO_DETAIL_FRAME_NATIVE_CONTROL_BAR_SELECTOR = [
  '.bpx-player-control-bottom',
  '.bpx-player-control-wrap',
  '.bilibili-player-video-control',
  '.bilibili-player-video-control-bottom',
  '.squirtle-controller',
  '[class*="control-bottom"]',
  '[class*="controller"]',
].join(',')
const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_VERSION = 'control-row-icon-v11-main-row-safe-labels'

const MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_CSS = `
  :host {
    color-scheme: dark !important;
    background: transparent !important;
    color: var(--bewly-mobile-comment-text, #e8ecf2) !important;
  }

  :host,
  #header,
  #contents,
  #body,
  #main,
  #content,
  #footer,
  #replies,
  #reply-container,
  #new,
  #feed,
  #div,
  #end,
  .bottombar,
  bili-comments-header-renderer,
  bili-comment-thread-renderer,
  bili-comment-renderer,
  bili-comment-replies-renderer,
  bili-comment-action-buttons-renderer,
  bili-comment-user-info,
  bili-rich-text,
  bili-comment-box {
    background-color: #0f1115 !important;
    background-image: none !important;
    color: var(--bewly-mobile-comment-text, #e8ecf2) !important;
  }

  #contents {
    min-height: 0 !important;
    height: auto !important;
    padding-bottom: 0 !important;
  }

  #limit-mask {
    position: static !important;
    inset: auto !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 6px 0 0 !important;
    padding: 10px 0 14px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: transparent !important;
    background-image: none !important;
  }

  #limit-mask-wall,
  #limit-mask-wall::before,
  #limit-mask-wall::after {
    content: none !important;
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    background: transparent !important;
    background-image: none !important;
  }

  #limit-mask-tip {
    position: static !important;
    inset: auto !important;
    transform: none !important;
    width: min(88%, 320px) !important;
    max-width: 320px !important;
    min-height: 46px !important;
    height: 46px !important;
    margin: 0 auto !important;
    padding: 0 14px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: #1d222a !important;
    border: 1px solid rgba(91, 200, 244, 0.36) !important;
    border-radius: 12px !important;
    box-shadow: none !important;
    color: var(--bewly-mobile-comment-link, #5bc8f4) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
    line-height: 1.2 !important;
    text-align: center !important;
  }

  #end,
  .bottombar,
  #footer,
  bili-comment-action-buttons-renderer {
    color: var(--bewly-mobile-comment-muted, #a7b0bd) !important;
  }

  a {
    color: var(--bewly-mobile-comment-link, #5bc8f4) !important;
  }

  * {
    border-color: var(--bewly-mobile-detail-separator, rgba(255, 255, 255, 0.08)) !important;
  }
`

const MOBILE_NATIVE_LOGIN_TRIGGER_SELECTORS = [
  '.bili-header .right-entry__outside.go-login-btn',
  '.bili-header .go-login-btn',
  '.bili-header .header-login-entry',
  '.bili-header .login-panel-popover .login-btn',
  '.bili-header .login-btn',
  '.bili-header [class*="login-btn"]',
  '#biliMainHeader .login-btn',
  '#internationalHeader .login-btn',
  '#i_cecream .bili-header .go-login-btn',
  '#i_cecream .bili-header .header-login-entry',
  '.bili-header [class*="login"]',
  '.login-btn',
]

type BewlyScriptWindow = Window & {
  __BEWLYSCRIPT_STYLE_CSS__?: string
}

interface MobileNativeLoginAccessSnapshot {
  element: HTMLElement
  ariaHidden: string | null
  inert: boolean
  pointerEvents: string
  pointerEventsPriority: string
  visibility: string
  visibilityPriority: string
}

type MobileVideoDetailFullscreenVideoElement = HTMLVideoElement

function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

function isVisibleMobileLoginElement(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden')
    return false

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function hasVisibleNativeLoginDrawer(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('.bili-mini-mask .bili-mini-content-wp')).some(isVisibleMobileLoginElement)
}

function restoreMobileNativeManagedElement(element: HTMLElement): void {
  const previousAriaHidden = element.getAttribute(MOBILE_NATIVE_CONTENT_PREVIOUS_ARIA_HIDDEN_ATTR)
  if (previousAriaHidden !== null)
    element.setAttribute('aria-hidden', previousAriaHidden)
  else
    element.removeAttribute('aria-hidden')

  element.removeAttribute(MOBILE_NATIVE_CONTENT_PREVIOUS_ARIA_HIDDEN_ATTR)
  element.removeAttribute(MOBILE_NATIVE_CONTENT_MANAGED_ATTR)
  element.inert = false
}

function restoreMobileNativeLoginAccess(snapshots: MobileNativeLoginAccessSnapshot[]): void {
  snapshots.forEach((snapshot) => {
    snapshot.element.inert = snapshot.inert

    if (snapshot.ariaHidden === null)
      snapshot.element.removeAttribute('aria-hidden')
    else
      snapshot.element.setAttribute('aria-hidden', snapshot.ariaHidden)

    if (snapshot.pointerEvents)
      snapshot.element.style.setProperty('pointer-events', snapshot.pointerEvents, snapshot.pointerEventsPriority)
    else
      snapshot.element.style.removeProperty('pointer-events')

    if (snapshot.visibility)
      snapshot.element.style.setProperty('visibility', snapshot.visibility, snapshot.visibilityPriority)
    else
      snapshot.element.style.removeProperty('visibility')
  })
}

function keepMobileNativeLoginTriggerAccessible(trigger: HTMLElement): MobileNativeLoginAccessSnapshot[] {
  const snapshots: MobileNativeLoginAccessSnapshot[] = []
  let current: HTMLElement | null = trigger

  while (current && current !== document.documentElement) {
    snapshots.push({
      element: current,
      ariaHidden: current.getAttribute('aria-hidden'),
      inert: current.inert,
      pointerEvents: current.style.getPropertyValue('pointer-events'),
      pointerEventsPriority: current.style.getPropertyPriority('pointer-events'),
      visibility: current.style.getPropertyValue('visibility'),
      visibilityPriority: current.style.getPropertyPriority('visibility'),
    })

    current.inert = false
    if (current.getAttribute('aria-hidden') === 'true')
      current.removeAttribute('aria-hidden')
    current.style.setProperty('pointer-events', 'auto', 'important')
    current.style.setProperty('visibility', 'visible', 'important')
    current = current.parentElement
  }

  window.setTimeout(() => {
    restoreMobileNativeLoginAccess(snapshots)
  }, MOBILE_LOGIN_NATIVE_ACCESS_RESTORE_MS)

  return snapshots
}

function getMobileNativeLoginSignature(element: HTMLElement): string {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.className,
    element.parentElement?.className,
  ].join(' ')
}

function isMobileNativeLoginTriggerCandidate(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('#bewly, .bili-mini-mask'))
    return false

  if (element.closest('.bili-header')) {
    if (element.matches('.go-login-btn, .go-login-btn *, .header-login-entry, .header-login-entry *, .login-btn, .login-btn *, [class*="login-btn"], [class*="login-btn"] *'))
      return true
  }

  return /登录|login/i.test(getMobileNativeLoginSignature(element))
}

function getMobileNativeLoginClickableElement(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>('.go-login-btn, .login-btn, .right-entry__outside, .header-login-entry') ?? element
}

function navigateToMobileLoginPage(): void {
  if (hasBewlyMobileLoginIntent(location.href))
    return

  const loginUrl = getBewlyMobileLoginUrl(location.href)
  if (typeof location.assign === 'function') {
    location.assign(loginUrl)
    return
  }

  location.href = loginUrl
}

function getMobileNativeLoginTrigger(doc: Document = document): HTMLElement | undefined {
  ensureOriginalBilibiliTopBarAppended(doc)
  resetBilibiliTopBarInlineStyles(doc)

  for (const selector of MOBILE_NATIVE_LOGIN_TRIGGER_SELECTORS) {
    const trigger = Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(isMobileNativeLoginTriggerCandidate)

    if (trigger)
      return getMobileNativeLoginClickableElement(trigger)
  }

  return undefined
}

function dispatchMobileNativeLoginTap(trigger: HTMLElement): void {
  const rect = trigger.getBoundingClientRect()
  const clientX = rect.width > 0 ? rect.left + rect.width / 2 : 1
  const clientY = rect.height > 0 ? rect.top + rect.height / 2 : 1
  const mouseEventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    view: window,
  }

  if (typeof PointerEvent !== 'undefined') {
    const pointerEventInit: PointerEventInit = {
      ...mouseEventInit,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    }
    trigger.dispatchEvent(new PointerEvent('pointerdown', pointerEventInit))
    trigger.dispatchEvent(new PointerEvent('pointerup', pointerEventInit))
  }

  trigger.dispatchEvent(new MouseEvent('mousedown', mouseEventInit))
  trigger.dispatchEvent(new MouseEvent('mouseup', mouseEventInit))
  trigger.click()
}

function tryOpenMobileNativeLoginDrawerOnce(): boolean {
  const trigger = getMobileNativeLoginTrigger()
  if (!trigger)
    return false

  keepMobileNativeLoginTriggerAccessible(trigger)
  dispatchMobileNativeLoginTap(trigger)
  scheduleMobileLoginDrawerEnhancement(80)
  return true
}

function openMobileNativeLoginDrawer(): boolean {
  if (!isMobileUserscriptPage)
    return false

  let hasSeenDrawer = hasVisibleNativeLoginDrawer()
  const rememberVisibleDrawer = () => {
    if (hasVisibleNativeLoginDrawer())
      hasSeenDrawer = true
  }

  MOBILE_LOGIN_NATIVE_TRIGGER_RETRY_DELAYS_MS.forEach((delay) => {
    window.setTimeout(() => {
      rememberVisibleDrawer()
      if (!hasSeenDrawer)
        tryOpenMobileNativeLoginDrawerOnce()
      window.setTimeout(rememberVisibleDrawer, 90)
    }, delay)
  })

  window.setTimeout(() => {
    scheduleMobileLoginDrawerEnhancement()
    rememberVisibleDrawer()
    if (!hasSeenDrawer && !hasVisibleNativeLoginDrawer())
      navigateToMobileLoginPage()
  }, MOBILE_LOGIN_NATIVE_FALLBACK_MS)
  return true
}

function handleMobileOpenLoginDrawer(event: Event): void {
  if (!isMobileUserscriptPage)
    return

  event.preventDefault()
  if (!openMobileNativeLoginDrawer())
    navigateToMobileLoginPage()
}

function clearMobileLoginIntentFromUrl(): void {
  if (!hasBewlyMobileLoginIntent(location.href))
    return

  const current = new URL(location.href)
  current.searchParams.delete(BEWLY_MOBILE_LOGIN_INTENT_PARAM)
  const nextUrl = `${current.pathname}${current.search}${current.hash}`
  history.replaceState(history.state, '', nextUrl)
}

function scheduleMobileLoginIntentDrawer(): void {
  if (!hasBewlyMobileLoginIntent(location.href))
    return

  window.setTimeout(() => {
    openMobileNativeLoginDrawer()
    window.setTimeout(() => {
      if (hasVisibleNativeLoginDrawer())
        clearMobileLoginIntentFromUrl()
    }, MOBILE_LOGIN_NATIVE_FALLBACK_MS + 120)
  }, 80)
}

function getMobileVideoDetailFrameCssForCurrentPage(): string {
  if (isInIframe())
    return MOBILE_VIDEO_DETAIL_FRAME_CSS

  return MOBILE_VIDEO_DETAIL_FRAME_CSS.replaceAll(
    'html[data-bewly-mobile-video-detail-frame="true"]',
    'html[data-bewly-mobile-video-detail="true"]',
  )
}

function shouldUseMobileVideoDetailFrameOverlay(): boolean {
  return shouldUseMobileVideoDetailLayoutForCurrentDocument()
}

function removeMobileVideoDetailFrameRootMarkers(): void {
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_ROOT_ATTR}="true"]`).forEach((root) => {
    root.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_ROOT_ATTR)
    root.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_DANMAKU_HIDDEN_ATTR)
  })
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPACER_ATTR}="true"]`).forEach(spacer => spacer.remove())
}

function syncMobileVideoDetailFrameOverlayState(): boolean {
  const shouldUseOverlay = shouldUseMobileVideoDetailFrameOverlay()
  document.documentElement.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR, shouldUseOverlay)

  if (!shouldUseOverlay) {
    closeMobileVideoDetailFramePanels()
    removeMobileVideoDetailFrameToolbars()
    removeMobileVideoDetailFrameRootMarkers()
  }

  return shouldUseOverlay
}

function syncMobileVideoDetailLayout(url: string = location.href): void {
  const shouldApply = shouldUseMobileVideoDetailLayoutForCurrentDocument(url)

  if (!shouldApply) {
    document.documentElement.removeAttribute('data-bewly-mobile-video-detail')
    document.documentElement.removeAttribute('data-bewly-mobile-video-detail-frame')
    document.documentElement.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR)
    document.documentElement.removeAttribute(MOBILE_VIDEO_DETAIL_MEDIA_ORIENTATION_ATTR)
    stopMobileVideoDetailStructureEnhancement()
    stopMobileVideoDetailFrameEnhancement()
    removeMobileVideoDetailStyleIfUnused()
    removeMobileVideoDetailFrameStyle()
    return
  }

  if (isInIframe()) {
    document.documentElement.setAttribute('data-bewly-mobile-video-detail', 'true')
    document.documentElement.setAttribute('data-bewly-mobile-video-detail-frame', 'true')
    if (!mobileVideoDetailStyleEl?.isConnected)
      mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)
    if (!mobileVideoDetailFrameStyleEl?.isConnected)
      mobileVideoDetailFrameStyleEl = injectCSS(getMobileVideoDetailFrameCssForCurrentPage())
    startMobileVideoDetailStructureEnhancement()
    startMobileVideoDetailFrameEnhancement()
    installMobileVideoDetailNavigationGuard()
    return
  }

  document.documentElement.setAttribute('data-bewly-mobile-video-detail', 'true')
  document.documentElement.removeAttribute('data-bewly-mobile-video-detail-frame')
  if (!mobileVideoDetailStyleEl?.isConnected)
    mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)
  if (!mobileVideoDetailFrameStyleEl?.isConnected)
    mobileVideoDetailFrameStyleEl = injectCSS(getMobileVideoDetailFrameCssForCurrentPage())

  installMobileVideoDetailNavigationGuard()
  startMobileVideoDetailStructureEnhancement()
  startMobileVideoDetailFrameEnhancement()
}

function removeMobileVideoDetailStyleIfUnused(): void {
  if (isMobileUserscriptPage)
    return

  mobileVideoDetailStyleEl?.remove()
  mobileVideoDetailStyleEl = undefined
}

function removeMobileVideoDetailFrameStyle(): void {
  mobileVideoDetailFrameStyleEl?.remove()
  mobileVideoDetailFrameStyleEl = undefined
}

function stopMobileVideoDetailStructureEnhancement(): void {
  mobileVideoDetailStructureObserver?.disconnect()
  mobileVideoDetailStructureObserver = undefined
  mobileVideoDetailStructureRetryCount = 0
  if (mobileVideoDetailStructureTimer) {
    clearTimeout(mobileVideoDetailStructureTimer)
    mobileVideoDetailStructureTimer = undefined
  }
  restoreMobileVideoDetailLoginDrawer()
  removeMobileVideoDetailBackButton()
}

function rememberMobileVideoDetailLoginDisplay(element: HTMLElement): void {
  if (element.hasAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_ATTR))
    return

  element.setAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_ATTR, element.style.getPropertyValue('display'))
  element.setAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_PRIORITY_ATTR, element.style.getPropertyPriority('display'))
}

function restoreMobileVideoDetailLoginDrawer(): void {
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_LOGIN_DRAG_HANDLE_ATTR}="true"]`).forEach((element) => {
    element.remove()
  })

  document.querySelectorAll<HTMLElement>('[data-bewly-mobile-login-methods="true"], [data-bewly-mobile-login-form="true"]').forEach((element) => {
    const previousDisplay = element.getAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_ATTR)
    const previousPriority = element.getAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_PRIORITY_ATTR)

    if (previousDisplay === null)
      element.style.removeProperty('display')
    else if (previousDisplay)
      element.style.setProperty('display', previousDisplay, previousPriority === 'important' ? 'important' : '')
    else
      element.style.removeProperty('display')

    element.removeAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_ATTR)
    element.removeAttribute(MOBILE_VIDEO_DETAIL_LOGIN_PREVIOUS_DISPLAY_PRIORITY_ATTR)
    element.removeAttribute('data-bewly-mobile-login-methods')
    element.removeAttribute('data-bewly-mobile-login-form')
  })

  document.querySelectorAll<HTMLElement>('[data-bewly-mobile-login-drawer="true"]').forEach((element) => {
    element.removeAttribute('data-bewly-mobile-login-dragging')
    element.removeAttribute('data-bewly-mobile-login-settling')
    element.removeAttribute('data-bewly-mobile-login-closing')
    element.style.removeProperty('transform')
    element.style.removeProperty('transition')
    element.removeAttribute('data-bewly-mobile-login-drawer')
  })

  document.querySelectorAll<HTMLElement>('[data-bewly-mobile-login-scan="true"]').forEach((element) => {
    element.removeAttribute('data-bewly-mobile-login-scan')
  })
}

function closeMobileVideoDetailLoginDrawer(drawer: HTMLElement): void {
  const mask = drawer.closest<HTMLElement>('.bili-mini-mask')
  const nativeClose = drawer.querySelector<HTMLElement>('.bili-mini-close-icon')
  if (nativeClose) {
    nativeClose.click()
    requestAnimationFrame(() => {
      if (mask && isMobileVideoDetailLoginElementVisible(mask))
        mask.style.setProperty('display', 'none', 'important')
    })
    return
  }

  if (mask)
    mask.style.setProperty('display', 'none', 'important')
}

function applyMobileVideoDetailLoginDrawerOffset(drawer: HTMLElement, offsetY: number, transition?: string): void {
  const clampedOffset = Math.max(0, Math.min(offsetY, window.innerHeight))
  drawer.style.setProperty('transition', transition ?? 'none', 'important')
  drawer.style.setProperty('transform', `translate3d(0, ${clampedOffset}px, 0)`, 'important')
}

function clearMobileVideoDetailLoginDrawerMotion(drawer: HTMLElement): void {
  drawer.removeAttribute('data-bewly-mobile-login-settling')
  drawer.removeAttribute('data-bewly-mobile-login-closing')
  drawer.style.removeProperty('transform')
  drawer.style.removeProperty('transition')
}

function reboundMobileVideoDetailLoginDrawer(drawer: HTMLElement): void {
  drawer.removeAttribute('data-bewly-mobile-login-closing')
  drawer.setAttribute('data-bewly-mobile-login-settling', 'true')
  applyMobileVideoDetailLoginDrawerOffset(drawer, 0, MOBILE_VIDEO_DETAIL_LOGIN_REBOUND_TRANSITION)
  window.setTimeout(() => {
    if (drawer.isConnected)
      clearMobileVideoDetailLoginDrawerMotion(drawer)
  }, 190)
}

function animateMobileVideoDetailLoginDrawerClose(drawer: HTMLElement): void {
  const rect = drawer.getBoundingClientRect()
  const closeOffset = Math.max(rect.height, window.innerHeight - rect.top + 16)
  drawer.removeAttribute('data-bewly-mobile-login-settling')
  drawer.setAttribute('data-bewly-mobile-login-closing', 'true')
  applyMobileVideoDetailLoginDrawerOffset(drawer, closeOffset, MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_TRANSITION)
  window.setTimeout(() => {
    closeMobileVideoDetailLoginDrawer(drawer)
  }, MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_ANIMATION_MS)
}

function ensureMobileVideoDetailLoginDragHandle(drawer: HTMLElement): void {
  const existingHandle = drawer.querySelector<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_LOGIN_DRAG_HANDLE_ATTR}="true"]`)
  if (existingHandle?.isConnected)
    return

  const handle = document.createElement('button')
  handle.type = 'button'
  handle.setAttribute(MOBILE_VIDEO_DETAIL_LOGIN_DRAG_HANDLE_ATTR, 'true')
  handle.setAttribute('aria-label', '下滑关闭登录面板')

  let activePointerId: number | undefined
  let startY = 0
  let lastY = 0
  let startedAt = 0

  function removeWindowDragListeners() {
    window.removeEventListener('pointermove', trackDrag)
    window.removeEventListener('pointerup', finishDrag)
    window.removeEventListener('pointercancel', cancelDrag)
  }

  function resetDragState() {
    activePointerId = undefined
    drawer.removeAttribute('data-bewly-mobile-login-dragging')
    removeWindowDragListeners()
  }

  function trackDrag(event: PointerEvent) {
    if (activePointerId !== event.pointerId)
      return

    lastY = event.clientY
    applyMobileVideoDetailLoginDrawerOffset(drawer, lastY - startY)
    if (lastY >= startY) {
      event.preventDefault()
    }
  }

  function cancelDrag(event: PointerEvent) {
    if (activePointerId === event.pointerId) {
      resetDragState()
      reboundMobileVideoDetailLoginDrawer(drawer)
    }
  }

  function finishDrag(event: PointerEvent) {
    if (activePointerId !== event.pointerId)
      return

    lastY = event.clientY
    const deltaY = lastY - startY
    const elapsedMs = Math.max(1, performance.now() - startedAt)
    const velocity = deltaY / elapsedMs

    resetDragState()

    if (deltaY >= MOBILE_VIDEO_DETAIL_LOGIN_DRAG_THRESHOLD_PX || (deltaY >= MOBILE_VIDEO_DETAIL_LOGIN_FAST_DRAG_THRESHOLD_PX && velocity >= MOBILE_VIDEO_DETAIL_LOGIN_FAST_DRAG_VELOCITY_PX_PER_MS))
      animateMobileVideoDetailLoginDrawerClose(drawer)
    else
      reboundMobileVideoDetailLoginDrawer(drawer)
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0)
      return

    removeWindowDragListeners()
    activePointerId = event.pointerId
    startY = event.clientY
    lastY = event.clientY
    startedAt = performance.now()
    drawer.setAttribute('data-bewly-mobile-login-dragging', 'true')
    drawer.removeAttribute('data-bewly-mobile-login-settling')
    drawer.removeAttribute('data-bewly-mobile-login-closing')
    applyMobileVideoDetailLoginDrawerOffset(drawer, 0)
    handle.setPointerCapture(event.pointerId)
    window.addEventListener('pointermove', trackDrag, { passive: false })
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', cancelDrag)
    event.preventDefault()
  }, { passive: false })

  handle.addEventListener('pointermove', trackDrag, { passive: false })
  handle.addEventListener('pointerup', finishDrag)
  handle.addEventListener('pointercancel', cancelDrag)

  drawer.prepend(handle)
}

function isMobileVideoDetailLoginElementVisible(element: HTMLElement): boolean {
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden')
    return false

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function forceMobileVideoDetailLoginDisplay(element: HTMLElement, display: 'block' | 'flex'): void {
  rememberMobileVideoDetailLoginDisplay(element)
  element.setAttribute('data-bewly-mobile-login-form', 'true')
  element.style.setProperty('display', display, 'important')
}

function hasVisibleMobileVideoDetailLoginForm(drawer: HTMLElement): boolean {
  return Array.from(drawer.querySelectorAll<HTMLElement>('.tab__form .form__item, .tab__form input')).some((element) => {
    return isMobileVideoDetailLoginElementVisible(element)
  })
}

function restoreMobileVideoDetailLoginCommentComposerMisfires(drawer: HTMLElement): void {
  drawer.querySelectorAll<HTMLElement>(`.tab__form [${MOBILE_VIDEO_DETAIL_COMMENT_COMPOSER_ATTR}="true"]`).forEach((element) => {
    element.removeAttribute(MOBILE_VIDEO_DETAIL_COMMENT_COMPOSER_ATTR)

    if (element.matches('.form__item')) {
      forceMobileVideoDetailLoginDisplay(element, 'flex')
      return
    }

    element.style.removeProperty('display')
  })
}

function normalizeMobileVideoDetailLoginForms(drawer: HTMLElement): void {
  if (!hasVisibleMobileVideoDetailLoginForm(drawer)) {
    drawer.querySelectorAll<HTMLElement>('.login-pwd-wp, .tab__form').forEach((form) => {
      forceMobileVideoDetailLoginDisplay(form, 'block')
    })
  }

  drawer.querySelectorAll<HTMLElement>('.tab__form').forEach((form) => {
    if (!isMobileVideoDetailLoginElementVisible(form))
      return

    form.querySelectorAll<HTMLElement>('.form__item').forEach((item) => {
      forceMobileVideoDetailLoginDisplay(item, 'flex')
    })
  })
}

function findMobileVideoDetailMainColumn(): HTMLElement | undefined {
  const selectors = [
    '.left-container',
    '.left-container-v1',
    '.left-container-under-player',
    '.video-left-container',
    '.video-main',
    '.media-left',
    '.video-container',
    '.video-container-v1',
    '#app',
    '#i_cecream',
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement && containsMobileVideoDetailPlayerLikeContent(element))
      return element
  }

  return undefined
}

function containsMobileVideoDetailPlayerLikeContent(element: HTMLElement): boolean {
  return Boolean(element.querySelector('video, canvas, #playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player, [aria-label*="播放器"]'))
}

function findMobileVideoDetailPlayerFromMedia(): HTMLElement | undefined {
  const media = document.querySelector('video, canvas')
  if (!(media instanceof HTMLElement))
    return undefined

  const explicitPlayer = media.closest(MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR)
  if (explicitPlayer instanceof HTMLElement)
    return explicitPlayer

  const classedPlayer = media.closest('[class*="player" i], [class*="Player"], [id*="player" i], [id*="Player"]')
  if (classedPlayer instanceof HTMLElement)
    return classedPlayer

  const labelledPlayer = media.closest('[aria-label*="播放器"]')
  if (labelledPlayer instanceof HTMLElement)
    return labelledPlayer

  let current = media.parentElement
  let best: HTMLElement | undefined
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  while (current && current !== document.body) {
    const rect = current.getBoundingClientRect()
    if (rect.width >= Math.min(160, viewportWidth * 0.45) && rect.height >= 80)
      best = current
    if (rect.width >= viewportWidth * 0.92 && rect.height >= 120)
      break
    current = current.parentElement
  }

  return best
}

function findMobileVideoDetailPlayer(): HTMLElement | undefined {
  const player = document.querySelector(MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR)
    ?? findMobileVideoDetailPlayerFromMedia()
  if (!(player instanceof HTMLElement))
    return findMobileVideoDetailPlayerFromMedia()

  const wrapper = player.closest(MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR)
  return wrapper instanceof HTMLElement ? wrapper : player
}

function markMobileVideoDetailPlayerCard(player: HTMLElement): void {
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR}="true"]`).forEach((element) => {
    if (element === player)
      return

    element.removeAttribute(MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR)
    element.removeAttribute(MOBILE_VIDEO_DETAIL_PLAYER_MEDIA_ORIENTATION_ATTR)
  })

  player.setAttribute(MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR, 'true')
}

function findMobileVideoDetailFullscreenVideo(playerWrapper: HTMLElement): MobileVideoDetailFullscreenVideoElement | undefined {
  const video = playerWrapper.querySelector('video') ?? (isInIframe() ? findMobileVideoDetailFrameVideo() : undefined)
  return video instanceof HTMLVideoElement
    ? video as MobileVideoDetailFullscreenVideoElement
    : undefined
}

function getMobileVideoDetailMediaOrientation(video: HTMLVideoElement): 'landscape' | 'portrait' | 'square' | undefined {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return undefined
  if (height > width * 1.08)
    return 'portrait'
  if (width > height * 1.08)
    return 'landscape'
  return 'square'
}

function syncMobileVideoDetailPlayerMediaOrientation(playerWrapper: HTMLElement): void {
  const video = findMobileVideoDetailFullscreenVideo(playerWrapper)
  const orientation = video ? getMobileVideoDetailMediaOrientation(video) : undefined
  if (orientation) {
    document.documentElement.setAttribute(MOBILE_VIDEO_DETAIL_MEDIA_ORIENTATION_ATTR, orientation)
    playerWrapper.setAttribute(MOBILE_VIDEO_DETAIL_PLAYER_MEDIA_ORIENTATION_ATTR, orientation)
    return
  }

  playerWrapper.removeAttribute(MOBILE_VIDEO_DETAIL_PLAYER_MEDIA_ORIENTATION_ATTR)
  document.documentElement.removeAttribute(MOBILE_VIDEO_DETAIL_MEDIA_ORIENTATION_ATTR)
  if (!video)
    return

  const sync = () => syncMobileVideoDetailPlayerMediaOrientation(playerWrapper)
  video.addEventListener('loadedmetadata', sync, { once: true })
  video.addEventListener('loadeddata', sync, { once: true })
  video.addEventListener('resize', sync, { once: true })
}

function isMobileVideoDetailFrameWebFullscreen(root: HTMLElement): boolean {
  return root.getAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR) === 'true'
}

function setMobileVideoDetailFrameWebFullscreen(root: HTMLElement, enabled: boolean): void {
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR}="true"]`).forEach((element) => {
    if (element !== root) {
      element.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR)
      if (element.hasAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_ROOT_ATTR))
        applyMobileVideoDetailFrameRootInlineStyles(element)
    }
  })

  root.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR, enabled)
  document.documentElement.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR, enabled)
  applyMobileVideoDetailFrameRootInlineStyles(root)
}

function requestMobileVideoDetailWebFullscreen(playerWrapper: HTMLElement): boolean {
  setMobileVideoDetailFrameWebFullscreen(playerWrapper, !isMobileVideoDetailFrameWebFullscreen(playerWrapper))
  const toolbar = playerWrapper.querySelector<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"]`)
  toolbar?.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR, 'true')
  closeMobileVideoDetailFramePanels()
  return true
}

function findMobileVideoDetailFrameVideo(): MobileVideoDetailFullscreenVideoElement | undefined {
  const videos = Array.from(document.querySelectorAll('video'))
    .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement)

  return videos.find((video) => {
    const rect = video.getBoundingClientRect()
    return rect.width >= 120 && rect.height >= 80
  }) as MobileVideoDetailFullscreenVideoElement | undefined
}

function findMobileVideoDetailFramePlayerRoot(video: HTMLVideoElement): HTMLElement {
  const rootSelectors = [
    '#playerWrap',
    '.player-wrap',
    '#bilibili-player',
    '#bilibiliPlayer',
    '.bpx-player-container',
    '.mplayer',
    '.mplayer-container',
    '.squirtle-video-player',
    '.squirtle-video-wrap',
  ]

  let firstSpecificRoot: HTMLElement | undefined
  for (const selector of rootSelectors) {
    const root = video.closest(selector)
    if (!(root instanceof HTMLElement))
      continue

    firstSpecificRoot ??= root
    if (hasMobileVideoDetailFrameNativeControlBar(root))
      return root
  }

  const controlledRoot = Array.from(document.querySelectorAll<HTMLElement>('[class*="player"], [class*="Player"]'))
    .find(root => root.contains(video) && hasMobileVideoDetailFrameNativeControlBar(root))
  if (controlledRoot)
    return controlledRoot

  const fallbackRoot = video.closest('[class*="player"], [class*="Player"]')
  return firstSpecificRoot ?? (fallbackRoot instanceof HTMLElement ? fallbackRoot : video.parentElement ?? document.body)
}

function findMobileVideoDetailFrameOverlayRoot(video: HTMLVideoElement): HTMLElement {
  const markedPlayer = document.querySelector(`[${MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR}="true"]`)
  if (markedPlayer instanceof HTMLElement && markedPlayer.contains(video))
    return markedPlayer

  const player = findMobileVideoDetailPlayer()
  if (player?.contains(video))
    return player

  return findMobileVideoDetailFramePlayerRoot(video)
}

function ensureMobileVideoDetailFramePlayerSpacer(root: HTMLElement): void {
  if (!root.parentElement)
    return

  const nextElement = root.nextElementSibling
  let spacer: HTMLElement
  if (nextElement instanceof HTMLElement && nextElement.getAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPACER_ATTR) === 'true') {
    spacer = nextElement
  }
  else {
    spacer = document.createElement('div')
    spacer.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPACER_ATTR, 'true')
    root.after(spacer)
  }

  setMobileVideoDetailImportantStyles(spacer, {
    'display': 'block',
    'flex': '0 0 auto',
    'height': 'calc(var(--bewly-mobile-player-fixed-height) + 10px)',
    'margin': '0',
    'min-height': 'calc(var(--bewly-mobile-player-fixed-height) + 10px)',
    'order': '9',
    'padding': '0',
    'pointer-events': 'none',
    'width': '100%',
  })
}

function hasMobileVideoDetailFrameNativeControlBar(root: HTMLElement): boolean {
  return Boolean(root.querySelector(MOBILE_VIDEO_DETAIL_FRAME_NATIVE_CONTROL_BAR_SELECTOR))
}

function removeMobileVideoDetailFrameToolbars(): void {
  document
    .querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"]`)
    .forEach(toolbar => toolbar.remove())
  document
    .querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-floating="true"]')
    .forEach(element => element.remove())
}

function shouldRebuildMobileVideoDetailFrameToolbar(toolbar: HTMLElement): boolean {
  return toolbar.getAttribute('data-bewly-mobile-frame-player-kind') !== 'app-like'
    || toolbar.getAttribute('data-bewly-mobile-frame-player-version') !== MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_VERSION
    || !toolbar.querySelector('[data-bewly-mobile-frame-player-action="play-toggle"]')
    || !toolbar.querySelector('[data-bewly-mobile-frame-player-action="danmaku"]')
    || !toolbar.querySelector('[data-bewly-mobile-frame-player-action="fullscreen"]')
}

function setMobileVideoDetailFrameDanmakuHidden(root: HTMLElement, hidden: boolean): void {
  root.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_DANMAKU_HIDDEN_ATTR, hidden)
}

function isMobileVideoDetailFrameDanmakuHidden(root: HTMLElement): boolean {
  return root.hasAttribute(MOBILE_VIDEO_DETAIL_FRAME_DANMAKU_HIDDEN_ATTR)
}

function setMobileVideoDetailFramePlaybackRate(video: HTMLVideoElement, rate: number): void {
  try {
    video.playbackRate = rate
  }
  catch {
    return
  }

  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"] [data-bewly-mobile-frame-player-speed-option]`).forEach((option) => {
    option.toggleAttribute('data-bewly-mobile-frame-player-selected', option.getAttribute('data-bewly-mobile-frame-player-speed-option') === String(rate))
  })
}

function closeMobileVideoDetailFrameActionSheets(except?: HTMLElement): void {
  document.querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-actions="true"]').forEach((sheet) => {
    if (sheet !== except)
      sheet.hidden = true
  })
}

function closeMobileVideoDetailFramePanels(except?: HTMLElement): void {
  closeMobileVideoDetailFrameActionSheets(except)
  document
    .querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"]`)
    .forEach((toolbar) => {
      toolbar.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SHEET_OPEN_ATTR)
    })
  document
    .querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-scrim="true"]')
    .forEach((scrim) => {
      scrim.hidden = true
    })
}

function installMobileVideoDetailFrameSheetDrag(sheet: HTMLElement, handle: HTMLElement, closeSheet: () => void): void {
  let pointerId: number | undefined
  let startY = 0
  let lastY = 0
  let lastAt = 0

  const resetSheetPosition = () => {
    sheet.style.removeProperty('transition')
    sheet.style.removeProperty('transform')
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0)
      return

    pointerId = event.pointerId
    startY = event.clientY
    lastY = event.clientY
    lastAt = performance.now()
    sheet.style.setProperty('transition', 'none')
    handle.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  })

  handle.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId)
      return

    lastY = event.clientY
    lastAt = performance.now()
    const deltaY = Math.max(0, event.clientY - startY)
    sheet.style.setProperty('transform', `translateY(${deltaY}px)`)
    event.preventDefault()
    event.stopPropagation()
  })

  const finishDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId)
      return

    const deltaY = Math.max(0, event.clientY - startY)
    const elapsed = Math.max(1, performance.now() - lastAt)
    const velocity = Math.max(0, event.clientY - lastY) / elapsed
    pointerId = undefined
    if (handle.hasPointerCapture(event.pointerId))
      handle.releasePointerCapture(event.pointerId)

    if (deltaY > MOBILE_VIDEO_DETAIL_LOGIN_DRAG_THRESHOLD_PX || velocity > MOBILE_VIDEO_DETAIL_LOGIN_FAST_DRAG_VELOCITY_PX_PER_MS) {
      closeSheet()
    }
    else {
      sheet.style.setProperty('transition', MOBILE_VIDEO_DETAIL_LOGIN_REBOUND_TRANSITION)
      sheet.style.setProperty('transform', 'translateY(0)')
      window.setTimeout(resetSheetPosition, 190)
    }

    event.preventDefault()
    event.stopPropagation()
  }

  handle.addEventListener('pointerup', finishDrag)
  handle.addEventListener('pointercancel', finishDrag)
}

function getMobileVideoDetailFrameTitle(): string {
  const title = document.querySelector('h1')?.textContent?.trim()
    || document.querySelector('[title]')?.getAttribute('title')?.trim()
    || document.title.replace(/_哔哩哔哩_bilibili$/, '').trim()

  return title || '视频详情'
}

function setMobileVideoDetailImportantStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value, 'important')
  })
}

function applyMobileVideoDetailFrameButtonStyles(button: HTMLElement, styles: Record<string, string> = {}): void {
  setMobileVideoDetailImportantStyles(button, {
    'align-items': 'center',
    'appearance': 'none',
    '-webkit-appearance': 'none',
    'background': 'rgba(10, 12, 16, 0.72)',
    'border': '0',
    'border-radius': '999px',
    'box-shadow': '0 2px 10px rgba(0, 0, 0, 0.35)',
    'color': 'rgba(255, 255, 255, 0.96)',
    'display': 'inline-flex',
    'font': '750 clamp(12px, 3.3vw, 14px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    'height': 'clamp(34px, 7dvh, 42px)',
    'justify-content': 'center',
    'margin': '0',
    'min-width': 'clamp(38px, 10vw, 46px)',
    'padding': '0 clamp(8px, 2vw, 10px)',
    'pointer-events': 'auto',
    'touch-action': 'manipulation',
    'visibility': 'visible',
    'white-space': 'nowrap',
    ...styles,
  })
}

type MobileVideoDetailFrameIconName = 'danmaku' | 'danmaku-off' | 'fullscreen' | 'pause' | 'play'

function createMobileVideoDetailFrameIcon(name: MobileVideoDetailFrameIconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '1em')
  svg.setAttribute('height', '1em')
  svg.style.setProperty('display', 'block', 'important')
  svg.style.setProperty('pointer-events', 'none', 'important')

  const appendPath = (attrs: Record<string, string>) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    Object.entries(attrs).forEach(([key, value]) => path.setAttribute(key, value))
    svg.append(path)
  }

  if (name === 'play') {
    appendPath({ d: 'M8 5.6v12.8L18.2 12 8 5.6Z', fill: 'currentColor' })
    return svg
  }

  if (name === 'pause') {
    appendPath({ d: 'M7 5h3.2v14H7V5Zm6.8 0H17v14h-3.2V5Z', fill: 'currentColor' })
    return svg
  }

  if (name === 'fullscreen') {
    appendPath({ d: 'M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M4 15.5V20h4.5', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2.3' })
    return svg
  }

  appendPath({ d: 'M5.4 6.2h13.2a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H9.2l-3.8 2.4v-2.4a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2Z', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '1.9' })
  appendPath({ d: 'M8 10.2v3.1M12 10.2v3.1M16 10.2v3.1', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': '1.9' })
  if (name === 'danmaku-off')
    appendPath({ d: 'M4.5 4.5 19.5 19.5', fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-width': '2.1' })
  return svg
}

function setMobileVideoDetailFrameIconButton(button: HTMLElement, name: MobileVideoDetailFrameIconName): void {
  button.replaceChildren(createMobileVideoDetailFrameIcon(name))
}

function applyMobileVideoDetailFrameRootInlineStyles(root: HTMLElement): void {
  const isWebFullscreen = isMobileVideoDetailFrameWebFullscreen(root)
  setMobileVideoDetailImportantStyles(root, {
    'background': '#000',
    'border': '0',
    'border-radius': '0',
    'box-shadow': 'none',
    'height': isWebFullscreen ? '100dvh' : 'var(--bewly-mobile-player-fixed-height)',
    'left': '0',
    'margin': '0',
    'max-height': isWebFullscreen ? '100dvh' : 'var(--bewly-mobile-player-fixed-height)',
    'max-width': '100vw',
    'min-height': '0',
    'min-width': '0',
    'overflow': 'hidden',
    'position': 'fixed',
    'right': '0',
    'top': isWebFullscreen ? '0' : 'var(--bewly-mobile-player-fixed-top, 0px)',
    'width': '100vw',
    'z-index': isWebFullscreen ? '2147483100' : '2147482500',
  })
}

function isMobileVideoDetailFrameVideoVisibleInsideRoot(video: HTMLVideoElement, root: HTMLElement): boolean {
  const videoRect = video.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight

  if (videoRect.width < 80 || videoRect.height < 48 || rootRect.width < 80 || rootRect.height < 48)
    return false

  const visibleWidth = Math.min(videoRect.right, rootRect.right, viewportWidth) - Math.max(videoRect.left, rootRect.left, 0)
  const visibleHeight = Math.min(videoRect.bottom, rootRect.bottom, viewportHeight) - Math.max(videoRect.top, rootRect.top, 0)
  return visibleWidth >= Math.min(80, videoRect.width * 0.45) && visibleHeight >= Math.min(48, videoRect.height * 0.45)
}

function ensureMobileVideoDetailFrameToolbar(): boolean {
  if (!shouldUseMobileVideoDetailLayoutForCurrentDocument())
    return false

  if (!syncMobileVideoDetailFrameOverlayState())
    return true

  const video = findMobileVideoDetailFrameVideo()
  if (!video)
    return false

  const root = findMobileVideoDetailFrameOverlayRoot(video)
  markMobileVideoDetailPlayerCard(root)
  syncMobileVideoDetailPlayerMediaOrientation(root)
  root.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_ROOT_ATTR, 'true')
  applyMobileVideoDetailFrameRootInlineStyles(root)
  ensureMobileVideoDetailFramePlayerSpacer(root)

  const videoSourceKey = video.currentSrc || video.src || location.href
  let toolbar = document.querySelector<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"]`)
  if (toolbar && toolbar.getAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SOURCE_ATTR) !== videoSourceKey) {
    removeMobileVideoDetailFrameToolbars()
    toolbar = null
  }
  if (toolbar && toolbar.parentElement !== root) {
    toolbar.remove()
    toolbar = null
  }

  if (toolbar && shouldRebuildMobileVideoDetailFrameToolbar(toolbar)) {
    toolbar.remove()
    document.querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-floating="true"]').forEach(element => element.remove())
    toolbar = null
  }

  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR, 'true')
    toolbar.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SOURCE_ATTR, videoSourceKey)
    toolbar.setAttribute('data-bewly-mobile-frame-player-kind', 'app-like')
    toolbar.setAttribute('data-bewly-mobile-frame-player-version', MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_VERSION)
    setMobileVideoDetailImportantStyles(toolbar, {
      'background': 'transparent',
      'bottom': '0',
      'border': '0',
      'border-radius': '0',
      'box-shadow': 'none',
      'color': '#fff',
      'display': 'block',
      'height': '100%',
      'left': '0',
      'margin': '0',
      'max-height': '100%',
      'opacity': '1',
      'overflow': 'hidden',
      'pointer-events': 'none',
      'position': 'absolute',
      'right': '0',
      'top': '0',
      'touch-action': 'manipulation',
      'visibility': 'visible',
      'width': '100%',
      'z-index': '30',
    })
    document.querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-floating="true"]').forEach(element => element.remove())

    let syncToolbar = () => {}
    const handledActivationEvents = new WeakSet<Event>()
    const bindMobileVideoDetailFrameActivation = (element: HTMLElement, action: () => void) => {
      let lastActivationAt = 0
      const activate = (event: Event) => {
        if (handledActivationEvents.has(event))
          return
        if (event instanceof PointerEvent && event.pointerType === 'mouse' && event.button !== 0)
          return
        if (event instanceof MouseEvent && event.button !== 0)
          return
        if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ')
          return

        event.preventDefault()
        event.stopPropagation()
        handledActivationEvents.add(event)

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (now - lastActivationAt < 320)
          return

        lastActivationAt = now
        action()
      }

      element.addEventListener('pointerdown', activate, { passive: false })
      element.addEventListener('pointerup', activate, { passive: false })
      element.addEventListener('mousedown', activate)
      element.addEventListener('mouseup', activate)
      element.addEventListener('touchend', activate, { passive: false })
      element.addEventListener('click', activate)
      element.addEventListener('keydown', activate)
    }

    const scrim = document.createElement('button')
    scrim.type = 'button'
    scrim.hidden = true
    scrim.setAttribute('aria-label', '关闭播放设置')
    scrim.setAttribute('data-bewly-mobile-frame-player-scrim', 'true')
    scrim.setAttribute('data-bewly-mobile-frame-player-floating', 'true')
    setMobileVideoDetailImportantStyles(scrim, {
      'background': 'rgba(0, 0, 0, 0.58)',
      'border': '0',
      'border-radius': '0',
      'display': 'none',
      'height': '100dvh',
      'inset': '0',
      'margin': '0',
      'padding': '0',
      'pointer-events': 'auto',
      'position': 'fixed',
      'touch-action': 'none',
      'width': '100vw',
      'z-index': '2147483001',
    })

    const topBar = document.createElement('div')
    topBar.setAttribute('data-bewly-mobile-frame-player-topbar', 'true')
    setMobileVideoDetailImportantStyles(topBar, {
      'align-items': 'center',
      'background': 'linear-gradient(to bottom, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.48) 62%, transparent)',
      'display': 'grid',
      'gap': 'clamp(7px, 2vw, 12px)',
      'grid-template-columns': 'minmax(0, 1fr) auto',
      'left': '0',
      'min-height': 'clamp(48px, 8.5dvh, 58px)',
      'padding': 'max(clamp(7px, 1.6dvh, 10px), env(safe-area-inset-top, 0px)) max(clamp(10px, 3vw, 16px), env(safe-area-inset-right, 0px)) clamp(14px, 3dvh, 18px) max(clamp(10px, 3vw, 16px), env(safe-area-inset-left, 0px))',
      'pointer-events': 'auto',
      'position': 'absolute',
      'right': '0',
      'top': '0',
      'visibility': 'visible',
      'z-index': '3',
    })

    const titleLabel = document.createElement('span')
    titleLabel.textContent = getMobileVideoDetailFrameTitle()
    titleLabel.setAttribute('data-bewly-mobile-frame-player-title', 'true')
    setMobileVideoDetailImportantStyles(titleLabel, {
      'color': 'rgba(255, 255, 255, 0.96)',
      'display': 'block',
      'font': '750 clamp(13px, 3.8vw, 16px) / 1.2 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      'min-width': '0',
      'overflow': 'hidden',
      'text-overflow': 'ellipsis',
      'text-shadow': '0 1px 3px rgba(0, 0, 0, 0.9)',
      'white-space': 'nowrap',
    })

    const topMoreButton = document.createElement('button')
    topMoreButton.type = 'button'
    topMoreButton.textContent = '•••'
    topMoreButton.setAttribute('aria-label', '播放设置')
    topMoreButton.setAttribute('data-bewly-mobile-frame-player-action', 'more')
    applyMobileVideoDetailFrameButtonStyles(topMoreButton)

    topBar.append(titleLabel, topMoreButton)

    const mainBar = document.createElement('div')
    mainBar.setAttribute('data-bewly-mobile-frame-player-mainbar', 'true')
    setMobileVideoDetailImportantStyles(mainBar, {
      'align-items': 'center',
      'background': 'linear-gradient(to top, rgba(0, 0, 0, 0.86), rgba(0, 0, 0, 0.44) 72%, transparent)',
      'border': '0',
      'border-radius': '0',
      'bottom': '0',
      'box-shadow': 'none',
      'display': 'grid',
      'gap': 'clamp(6px, 1.6vw, 9px)',
      'grid-template-areas': '"play progress danmaku fullscreen"',
      'grid-template-columns': 'auto minmax(0, 1fr) auto auto',
      'left': '0',
      'min-height': 'clamp(58px, 10dvh, 72px)',
      'padding': 'clamp(16px, 4dvh, 24px) max(clamp(8px, 2.4vw, 12px), env(safe-area-inset-right, 0px)) max(clamp(8px, 2.2dvh, 14px), env(safe-area-inset-bottom, 0px)) max(clamp(8px, 2.4vw, 12px), env(safe-area-inset-left, 0px))',
      'pointer-events': 'auto',
      'position': 'absolute',
      'right': '0',
      'visibility': 'visible',
      'width': '100%',
      'z-index': '3',
    })

    const playButton = document.createElement('button')
    playButton.type = 'button'
    playButton.setAttribute('aria-label', '切换播放')
    playButton.setAttribute('data-bewly-mobile-frame-player-action', 'play-toggle')
    setMobileVideoDetailFrameIconButton(playButton, 'pause')
    applyMobileVideoDetailFrameButtonStyles(playButton, {
      'background': 'rgba(251, 114, 153, 0.92)',
      'box-shadow': '0 3px 12px rgba(251, 114, 153, 0.32), 0 1px 8px rgba(0, 0, 0, 0.28)',
      'color': '#fff',
      'display': 'grid',
      'font-size': 'clamp(17px, 4.5vw, 22px)',
      'grid-area': 'play',
      'height': 'clamp(40px, 7.8dvh, 46px)',
      'min-width': '0',
      'opacity': '1',
      'padding': '0',
      'place-items': 'center',
      'position': 'relative',
      'width': 'clamp(40px, 10.8vw, 46px)',
      'z-index': '5',
    })
    const togglePlayback = () => {
      if (video.paused)
        void video.play()
      else
        video.pause()
    }
    bindMobileVideoDetailFrameActivation(playButton, togglePlayback)

    const mainDanmakuButton = document.createElement('button')
    mainDanmakuButton.type = 'button'
    mainDanmakuButton.setAttribute('aria-label', '显示或隐藏弹幕')
    mainDanmakuButton.setAttribute('data-bewly-mobile-frame-player-action', 'danmaku')
    setMobileVideoDetailFrameIconButton(mainDanmakuButton, 'danmaku')
    applyMobileVideoDetailFrameButtonStyles(mainDanmakuButton, {
      'flex': '0 0 clamp(32px, 8.4vw, 36px)',
      'font-size': 'clamp(16px, 4.2vw, 20px)',
      'grid-area': 'danmaku',
      'height': 'clamp(36px, 7.2dvh, 42px)',
      'min-width': '0',
      'padding': '0',
      'width': 'clamp(36px, 9.6vw, 42px)',
    })
    bindMobileVideoDetailFrameActivation(mainDanmakuButton, () => {
      setMobileVideoDetailFrameDanmakuHidden(root, !isMobileVideoDetailFrameDanmakuHidden(root))
      syncToolbar()
    })

    const timeLabel = document.createElement('span')
    timeLabel.setAttribute('data-bewly-mobile-frame-player-time', 'true')
    setMobileVideoDetailImportantStyles(timeLabel, {
      'color': 'rgba(255, 255, 255, 0.94)',
      'flex': '0 0 auto',
      'font': '650 clamp(11px, 3vw, 13px) / 1.1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      'min-width': 'max-content',
      'text-align': 'left',
      'text-shadow': '0 1px 3px rgba(0, 0, 0, 0.9)',
      'white-space': 'nowrap',
    })

    const progressWrap = document.createElement('div')
    progressWrap.setAttribute('data-bewly-mobile-frame-player-progress-wrap', 'true')
    setMobileVideoDetailImportantStyles(progressWrap, {
      'align-items': 'center',
      'display': 'grid',
      'gap': 'clamp(6px, 1.7vw, 8px)',
      'grid-area': 'progress',
      'grid-template-columns': 'auto minmax(0, 1fr)',
      'min-width': '0',
      'visibility': 'visible',
    })

    const progress = document.createElement('input')
    progress.type = 'range'
    progress.min = '0'
    progress.max = '1000'
    progress.value = '0'
    progress.setAttribute('aria-label', '播放进度')
    progress.setAttribute('data-bewly-mobile-frame-player-progress', 'true')
    setMobileVideoDetailImportantStyles(progress, {
      'accent-color': '#fb7299',
      'display': 'block',
      'height': 'clamp(20px, 4.2dvh, 26px)',
      'margin': '0',
      'min-width': '0',
      'pointer-events': 'auto',
      'touch-action': 'pan-x',
      'width': '100%',
    })
    progress.addEventListener('input', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0)
        return

      video.currentTime = (Number(progress.value) / 1000) * duration
    })

    progressWrap.append(timeLabel, progress)

    const fullscreenButton = document.createElement('button')
    fullscreenButton.type = 'button'
    fullscreenButton.setAttribute('aria-label', '进入网页全屏')
    fullscreenButton.setAttribute('data-bewly-mobile-frame-player-action', 'fullscreen')
    setMobileVideoDetailFrameIconButton(fullscreenButton, 'fullscreen')
    applyMobileVideoDetailFrameButtonStyles(fullscreenButton, {
      'flex': '0 0 clamp(32px, 8.4vw, 36px)',
      'font-size': 'clamp(17px, 4.5vw, 22px)',
      'grid-area': 'fullscreen',
      'height': 'clamp(36px, 7.2dvh, 42px)',
      'min-width': '0',
      'padding': '0',
      'width': 'clamp(36px, 9.6vw, 42px)',
    })
    bindMobileVideoDetailFrameActivation(fullscreenButton, () => {
      requestMobileVideoDetailWebFullscreen(root)
    })

    mainBar.append(playButton, progressWrap, mainDanmakuButton, fullscreenButton)

    const actionSheet = document.createElement('div')
    actionSheet.hidden = true
    actionSheet.setAttribute('data-bewly-mobile-frame-player-actions', 'true')
    actionSheet.setAttribute('data-bewly-mobile-frame-player-floating', 'true')
    setMobileVideoDetailImportantStyles(actionSheet, {
      'background': '#171a21',
      'border': '0',
      'border-radius': '18px 18px 0 0',
      'bottom': '0',
      'box-shadow': '0 -18px 42px rgba(0, 0, 0, 0.42)',
      'color': '#f4f6f8',
      'display': 'none',
      'gap': '0',
      'left': '0',
      'margin': '0',
      'max-height': 'min(68dvh, 560px)',
      'overflow-x': 'hidden',
      'overflow-y': 'auto',
      'padding': '10px max(16px, env(safe-area-inset-right, 0px)) max(18px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
      'pointer-events': 'auto',
      'position': 'fixed',
      'right': '0',
      'z-index': '2147483002',
    })

    const sheetHandle = document.createElement('div')
    sheetHandle.setAttribute('data-bewly-mobile-frame-player-sheet-handle', 'true')
    setMobileVideoDetailImportantStyles(sheetHandle, {
      'background': 'rgba(255, 255, 255, 0.24)',
      'border-radius': '999px',
      'cursor': 'grab',
      'height': '5px',
      'justify-self': 'center',
      'margin': '0 0 14px',
      'touch-action': 'none',
      'width': 'clamp(36px, 12vw, 52px)',
    })

    const sheetTitle = document.createElement('div')
    sheetTitle.textContent = '播放设置'
    sheetTitle.setAttribute('data-bewly-mobile-frame-player-sheet-title', 'true')
    setMobileVideoDetailImportantStyles(sheetTitle, {
      'color': '#f4f6f8',
      'font': '750 clamp(15px, 4.2vw, 18px) / 1.2 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      'padding': '0 0 10px',
    })

    const speedRow = document.createElement('div')
    speedRow.setAttribute('data-bewly-mobile-frame-player-setting-row', 'true')
    setMobileVideoDetailImportantStyles(speedRow, {
      'align-items': 'center',
      'background': '#1d222a',
      'border-bottom': '1px solid rgba(255, 255, 255, 0.09)',
      'border-radius': '12px 12px 0 0',
      'color': '#f4f6f8',
      'display': 'grid',
      'font': '650 clamp(14px, 3.9vw, 16px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      'gap': 'clamp(12px, 3.5vw, 18px)',
      'grid-template-columns': 'auto minmax(0, 1fr)',
      'min-height': 'clamp(54px, 9.5dvh, 66px)',
      'padding': '0 0 0 clamp(12px, 3.6vw, 18px)',
    })

    const speedLabel = document.createElement('span')
    speedLabel.textContent = '倍速'

    const speedGroup = document.createElement('div')
    speedGroup.setAttribute('data-bewly-mobile-frame-player-speed-group', 'true')
    setMobileVideoDetailImportantStyles(speedGroup, {
      'min-width': '0',
    })

    const speedMenu = document.createElement('div')
    speedMenu.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPEED_MENU_ATTR, 'true')
    setMobileVideoDetailImportantStyles(speedMenu, {
      'display': 'grid',
      'gap': '0',
      'grid-template-columns': 'repeat(5, minmax(0, 1fr))',
      'min-width': '0',
    })

    MOBILE_VIDEO_DETAIL_FRAME_PLAYBACK_RATES.forEach((rate) => {
      const option = document.createElement('button')
      option.type = 'button'
      option.textContent = `${rate}x`
      option.setAttribute('data-bewly-mobile-frame-player-speed-option', String(rate))
      applyMobileVideoDetailFrameButtonStyles(option, {
        'background': 'transparent',
        'border-radius': '0',
        'box-shadow': 'none',
        'color': '#b9c0ca',
        'height': 'clamp(40px, 7dvh, 48px)',
        'min-width': '0',
        'padding': '0',
        'width': '100%',
      })
      bindMobileVideoDetailFrameActivation(option, () => {
        setMobileVideoDetailFramePlaybackRate(video, rate)
      })
      speedMenu.append(option)
    })

    speedGroup.append(speedMenu)
    speedRow.append(speedLabel, speedGroup)

    const createActionButton = (label: string, action: () => void, iconName?: MobileVideoDetailFrameIconName) => {
      const button = document.createElement('button')
      button.type = 'button'
      if (iconName) {
        button.setAttribute('aria-label', label)
        button.title = label
        setMobileVideoDetailFrameIconButton(button, iconName)
      }
      else {
        button.textContent = label
      }
      const actionButtonStyles: Record<string, string> = {
        'background': '#2a303a',
        'color': '#c7ced8',
        'height': iconName ? 'clamp(38px, 7dvh, 44px)' : 'clamp(34px, 6.2dvh, 42px)',
        'justify-self': 'end',
        'margin-right': 'clamp(10px, 3vw, 16px)',
        'min-width': iconName ? '0' : 'clamp(64px, 18vw, 86px)',
        'padding': iconName ? '0' : '0 clamp(6px, 1.8vw, 9px)',
      }
      if (iconName)
        actionButtonStyles.width = 'clamp(38px, 9.8vw, 44px)'
      applyMobileVideoDetailFrameButtonStyles(button, actionButtonStyles)
      bindMobileVideoDetailFrameActivation(button, action)
      return button
    }

    const createSettingRow = (label: string, actionButton: HTMLButtonElement) => {
      const row = document.createElement('div')
      row.setAttribute('data-bewly-mobile-frame-player-setting-row', 'true')
      setMobileVideoDetailImportantStyles(row, {
        'align-items': 'center',
        'background': '#1d222a',
        'border-bottom': '1px solid rgba(255, 255, 255, 0.09)',
        'color': '#f4f6f8',
        'display': 'grid',
        'font': '650 clamp(14px, 3.9vw, 16px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
        'gap': 'clamp(12px, 3.5vw, 18px)',
        'grid-template-columns': 'auto minmax(0, 1fr)',
        'min-height': 'clamp(54px, 9.5dvh, 66px)',
        'padding': '0 0 0 clamp(12px, 3.6vw, 18px)',
      })
      const text = document.createElement('span')
      text.textContent = label
      row.append(text, actionButton)
      return row
    }

    const sheetFullscreenButton = createActionButton('网页全屏', () => {
      closeMobileVideoDetailFramePanels()
      requestMobileVideoDetailWebFullscreen(root)
    }, 'fullscreen')
    sheetFullscreenButton.setAttribute('aria-label', '进入网页全屏')
    sheetFullscreenButton.title = '进入网页全屏'
    sheetFullscreenButton.setAttribute('data-bewly-mobile-frame-player-action', 'fullscreen-web-sheet')

    actionSheet.append(
      sheetHandle,
      sheetTitle,
      speedRow,
      createSettingRow('网页全屏', sheetFullscreenButton),
    )

    const currentToolbar = toolbar
    currentToolbar.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR, 'true')

    let controlsIdleTimer: number | undefined
    let controlsIdleToken = 0
    const clearControlsIdleTimer = () => {
      controlsIdleToken += 1
      if (!controlsIdleTimer)
        return

      window.clearTimeout(controlsIdleTimer)
      controlsIdleTimer = undefined
    }

    const hasVisibleControls = () => currentToolbar.hasAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR)

    const setMobileVideoDetailFrameControlGroupVisible = (element: HTMLElement, visible: boolean, hiddenTransform: string) => {
      setMobileVideoDetailImportantStyles(element, {
        'opacity': visible ? '1' : '0',
        'pointer-events': visible ? 'auto' : 'none',
        'transform': visible ? 'translateY(0)' : hiddenTransform,
      })
    }

    const setControlsVisible = (visible: boolean) => {
      currentToolbar.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR, visible)
      setMobileVideoDetailFrameControlGroupVisible(topBar, visible, 'translateY(-8px)')
      setMobileVideoDetailFrameControlGroupVisible(mainBar, visible, 'translateY(10px)')
    }

    const scheduleControlsAutoHide = () => {
      clearControlsIdleTimer()
      if (video.paused || !actionSheet.hidden) {
        setControlsVisible(true)
        return
      }

      const scheduledControlsIdleToken = controlsIdleToken + 1
      controlsIdleToken = scheduledControlsIdleToken
      controlsIdleTimer = window.setTimeout(() => {
        controlsIdleTimer = undefined
        if (scheduledControlsIdleToken === controlsIdleToken && !video.paused && actionSheet.hidden)
          setControlsVisible(false)
      }, MOBILE_VIDEO_DETAIL_FRAME_CONTROLS_IDLE_MS)
    }

    const revealControls = () => {
      setControlsVisible(true)
      scheduleControlsAutoHide()
    }

    const syncControlsVisibilityForState = () => {
      if (video.paused || !actionSheet.hidden) {
        clearControlsIdleTimer()
        setControlsVisible(true)
        return
      }

      if (hasVisibleControls() && !controlsIdleTimer)
        scheduleControlsAutoHide()
    }

    const setSheetOpen = (open: boolean, animated = false) => {
      if (open) {
        revealControls()
        actionSheet.style.removeProperty('transition')
        actionSheet.style.removeProperty('transform')
        scrim.style.removeProperty('transition')
        scrim.style.removeProperty('opacity')
        actionSheet.hidden = false
        scrim.hidden = false
        actionSheet.style.setProperty('display', 'grid', 'important')
        scrim.style.setProperty('display', 'block', 'important')
        currentToolbar.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SHEET_OPEN_ATTR, 'true')
        return
      }

      currentToolbar.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SHEET_OPEN_ATTR)
      if (!animated) {
        actionSheet.hidden = true
        scrim.hidden = true
        actionSheet.style.setProperty('display', 'none', 'important')
        scrim.style.setProperty('display', 'none', 'important')
        actionSheet.style.removeProperty('transition')
        actionSheet.style.removeProperty('transform')
        scrim.style.removeProperty('transition')
        scrim.style.removeProperty('opacity')
        scheduleControlsAutoHide()
        return
      }

      actionSheet.style.setProperty('transition', MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_TRANSITION)
      actionSheet.style.setProperty('transform', 'translateY(100%)')
      scrim.style.setProperty('transition', 'opacity 180ms cubic-bezier(0.32, 0, 0.67, 0)')
      scrim.style.setProperty('opacity', '0')
      window.setTimeout(() => {
        actionSheet.hidden = true
        scrim.hidden = true
        actionSheet.style.setProperty('display', 'none', 'important')
        scrim.style.setProperty('display', 'none', 'important')
        actionSheet.style.removeProperty('transition')
        actionSheet.style.removeProperty('transform')
        scrim.style.removeProperty('transition')
        scrim.style.removeProperty('opacity')
        scheduleControlsAutoHide()
      }, MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_ANIMATION_MS)
    }

    const toggleSheet = () => {
      const willOpen = actionSheet.hidden
      closeMobileVideoDetailFramePanels(actionSheet)
      setSheetOpen(willOpen)
    }

    const runMobileVideoDetailFramePlayerAction = (actionName: string, source?: HTMLElement): boolean => {
      if (actionName === 'play-toggle') {
        togglePlayback()
        return true
      }
      if (actionName === 'danmaku') {
        setMobileVideoDetailFrameDanmakuHidden(root, !isMobileVideoDetailFrameDanmakuHidden(root))
        syncToolbar()
        return true
      }
      if (actionName === 'fullscreen' || actionName === 'fullscreen-web-sheet') {
        closeMobileVideoDetailFramePanels()
        requestMobileVideoDetailWebFullscreen(root)
        syncToolbar()
        return true
      }
      if (actionName === 'more') {
        toggleSheet()
        return true
      }
      const rate = source?.getAttribute('data-bewly-mobile-frame-player-speed-option')
      if (rate) {
        setMobileVideoDetailFramePlaybackRate(video, Number(rate))
        syncToolbar()
        return true
      }

      return false
    }

    const handleDelegatedFramePlayerActivation = (event: Event) => {
      if (handledActivationEvents.has(event))
        return
      if (event instanceof PointerEvent && event.pointerType === 'mouse' && event.button !== 0)
        return
      if (event instanceof MouseEvent && event.button !== 0)
        return
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ')
        return

      const target = event.target
      if (!(target instanceof Element))
        return

      const actionTarget = target.closest<HTMLElement>('[data-bewly-mobile-frame-player-action], [data-bewly-mobile-frame-player-speed-option]')
      if (!actionTarget)
        return

      const actionName = actionTarget.getAttribute('data-bewly-mobile-frame-player-action') ?? ''
      if (!runMobileVideoDetailFramePlayerAction(actionName, actionTarget))
        return

      event.preventDefault()
      event.stopPropagation()
      handledActivationEvents.add(event)
    }

    ;[toolbar, actionSheet].forEach((surface) => {
      surface.addEventListener('pointerdown', handleDelegatedFramePlayerActivation, { passive: false })
      surface.addEventListener('pointerup', handleDelegatedFramePlayerActivation, { passive: false })
      surface.addEventListener('mousedown', handleDelegatedFramePlayerActivation)
      surface.addEventListener('mouseup', handleDelegatedFramePlayerActivation)
      surface.addEventListener('touchend', handleDelegatedFramePlayerActivation, { passive: false })
      surface.addEventListener('click', handleDelegatedFramePlayerActivation)
      surface.addEventListener('keydown', handleDelegatedFramePlayerActivation)
    })

    bindMobileVideoDetailFrameActivation(topMoreButton, toggleSheet)
    bindMobileVideoDetailFrameActivation(scrim, () => {
      setSheetOpen(false, true)
    })
    installMobileVideoDetailFrameSheetDrag(actionSheet, sheetHandle, () => setSheetOpen(false, true))
    root.addEventListener('pointerdown', revealControls, { capture: true })

    syncToolbar = () => {
      titleLabel.textContent = getMobileVideoDetailFrameTitle()

      const isVideoVisible = isMobileVideoDetailFrameVideoVisibleInsideRoot(video, root)
      currentToolbar.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_DETACHED_ATTR, !isVideoVisible)
      if (!isVideoVisible)
        closeMobileVideoDetailFramePanels()

      const viewState = createMobileVideoDetailFramePlayerViewState({
        currentTime: video.currentTime,
        danmakuHidden: isMobileVideoDetailFrameDanmakuHidden(root),
        duration: video.duration,
        paused: video.paused,
        playbackRate: video.playbackRate,
      })

      playButton.hidden = false
      playButton.style.setProperty('display', 'grid', 'important')
      playButton.setAttribute('aria-label', viewState.playButtonAriaLabel === '播放' ? '播放视频' : '暂停视频')
      setMobileVideoDetailFrameIconButton(playButton, viewState.playButtonAriaLabel === '播放' ? 'play' : 'pause')
      timeLabel.textContent = viewState.timeText
      progress.value = viewState.progressValue
      speedMenu.querySelectorAll<HTMLElement>('[data-bewly-mobile-frame-player-speed-option]').forEach((option) => {
        option.toggleAttribute('data-bewly-mobile-frame-player-selected', option.getAttribute('data-bewly-mobile-frame-player-speed-option') === viewState.selectedRate)
      })
      mainDanmakuButton.setAttribute('aria-label', viewState.danmakuLabel)
      mainDanmakuButton.toggleAttribute('data-bewly-mobile-frame-player-active', viewState.danmakuActive)
      setMobileVideoDetailFrameIconButton(mainDanmakuButton, viewState.danmakuActive ? 'danmaku' : 'danmaku-off')
      syncControlsVisibilityForState()
    }

    toolbar.append(topBar, mainBar)
    root.append(toolbar)
    ;(document.body ?? root).append(scrim, actionSheet)

    ;['timeupdate', 'durationchange', 'loadedmetadata', 'seeking', 'seeked', 'emptied', 'waiting', 'canplay', 'play', 'pause', 'ratechange', 'volumechange'].forEach((eventName) => {
      video.addEventListener(eventName, syncToolbar)
    })
    window.addEventListener('scroll', syncToolbar, { capture: true, passive: true })
    window.visualViewport?.addEventListener('scroll', syncToolbar, { passive: true })
    syncToolbar()
  }

  return true
}

function scheduleMobileVideoDetailFrameEnhancement(delay = 0): void {
  if (mobileVideoDetailFrameTimer)
    clearTimeout(mobileVideoDetailFrameTimer)

  mobileVideoDetailFrameTimer = setTimeout(() => {
    mobileVideoDetailFrameTimer = undefined
    const enhanced = ensureMobileVideoDetailFrameToolbar()
    if (enhanced || mobileVideoDetailFrameRetryCount >= MOBILE_VIDEO_DETAIL_FRAME_ENHANCEMENT_MAX_RETRIES)
      return

    mobileVideoDetailFrameRetryCount += 1
    scheduleMobileVideoDetailFrameEnhancement(MOBILE_VIDEO_DETAIL_FRAME_ENHANCEMENT_RETRY_MS)
  }, delay)
}

function startMobileVideoDetailFrameEnhancement(): void {
  mobileVideoDetailFrameRetryCount = 0
  scheduleMobileVideoDetailFrameEnhancement()

  if (!mobileVideoDetailFrameViewportHandler) {
    mobileVideoDetailFrameViewportHandler = () => {
      scheduleMobileVideoDetailFrameEnhancement(80)
    }
    window.addEventListener('resize', mobileVideoDetailFrameViewportHandler)
    window.visualViewport?.addEventListener('resize', mobileVideoDetailFrameViewportHandler)
    screen.orientation?.addEventListener?.('change', mobileVideoDetailFrameViewportHandler)
  }

  if (mobileVideoDetailFrameObserver || typeof MutationObserver === 'undefined' || !document.body)
    return

  mobileVideoDetailFrameObserver = new MutationObserver(() => {
    scheduleMobileVideoDetailFrameEnhancement(80)
  })
  mobileVideoDetailFrameObserver.observe(document.body, { childList: true, subtree: true })

  if (!mobileVideoDetailFrameClickHandler) {
    mobileVideoDetailFrameClickHandler = (event) => {
      if (
        event.target instanceof Element
        && event.target.closest(`[${MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR}="true"], [data-bewly-mobile-frame-player-actions="true"]`)
      ) {
        return
      }

      closeMobileVideoDetailFramePanels()
    }
    document.addEventListener('click', mobileVideoDetailFrameClickHandler, { capture: true })
  }
}

function stopMobileVideoDetailFrameEnhancement(): void {
  mobileVideoDetailFrameObserver?.disconnect()
  mobileVideoDetailFrameObserver = undefined
  mobileVideoDetailFrameRetryCount = 0
  if (mobileVideoDetailFrameTimer) {
    clearTimeout(mobileVideoDetailFrameTimer)
    mobileVideoDetailFrameTimer = undefined
  }
  if (mobileVideoDetailFrameClickHandler) {
    document.removeEventListener('click', mobileVideoDetailFrameClickHandler, { capture: true })
    mobileVideoDetailFrameClickHandler = undefined
  }
  if (mobileVideoDetailFrameViewportHandler) {
    window.removeEventListener('resize', mobileVideoDetailFrameViewportHandler)
    window.visualViewport?.removeEventListener('resize', mobileVideoDetailFrameViewportHandler)
    screen.orientation?.removeEventListener?.('change', mobileVideoDetailFrameViewportHandler)
    mobileVideoDetailFrameViewportHandler = undefined
  }

  document.documentElement.removeAttribute(MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR)
  removeMobileVideoDetailFrameToolbars()
  removeMobileVideoDetailFrameRootMarkers()
}

function isMobileVideoDetailProtectedModule(element: HTMLElement): boolean {
  return Boolean(element.matches('#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, [data-bewly-mobile-author-card="true"], .up-panel-container, .up-info-container, .members-info-container, .video-staffs-container, #arc_toolbar_report, .video-toolbar-container, bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment, .video-info-container, #viewbox_report, .media-info, .media-info-container, .desc-info, .basic-desc-info, .video-desc-container, .video-desc, .desc-v2, #v_desc, .tag-area, #v_tag, .video-tag-container'))
}

function containsMobileVideoDetailProtectedContent(element: HTMLElement): boolean {
  return Boolean(element.querySelector('video, #bilibili-player, #bilibiliPlayer, .bpx-player-container, [data-bewly-mobile-author-card="true"], .up-panel-container, .up-info-container, .members-info-container, .video-staffs-container, bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment'))
}

function findMobileVideoDetailHiddenModuleBoundary(root: HTMLElement, candidate: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement = candidate

  while (current.parentElement && current.parentElement !== root) {
    const parent = current.parentElement
    if (isMobileVideoDetailProtectedModule(parent) || containsMobileVideoDetailProtectedContent(parent))
      break

    const text = parent.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text.length > 520)
      break

    current = parent
  }

  if (isMobileVideoDetailProtectedModule(current) || containsMobileVideoDetailProtectedContent(current))
    return undefined

  return current
}

function markMobileVideoDetailHiddenModules(root: HTMLElement): void {
  const structuralSelectors = [
    '#danmukuBox',
    '#danmakuBox',
    '.danmaku-box',
    '.danmaku-list',
    '.danmu-list',
    '.dm-list',
    '.bpx-player-dm-list',
    '.bpx-player-dm-wrap',
    '.base-video-sections-v1',
    '.video-sections-v1',
    '.video-sections-container',
    '.video-section-list',
    '.video-pod',
    '.video-pod__body',
    '.video-pod__header',
    '#multi_page',
    '.multi-page',
    '.anthology',
    '.playlist-container',
    '.series-container',
    '.video-series',
  ].join(',')

  root.querySelectorAll<HTMLElement>(structuralSelectors).forEach((candidate) => {
    if (!containsMobileVideoDetailProtectedContent(candidate))
      candidate.setAttribute('data-bewly-mobile-detail-hidden-module', 'true')
  })

  const candidates = Array.from(root.querySelectorAll<HTMLElement>('a, button, div, section, header, span'))
  candidates.forEach((candidate) => {
    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text)
      return

    const isDanmakuPanel = /^弹幕列表(?:\s|$|[：:])/.test(text)
    const isCollectionCard = text.includes('订阅合集') || /合集.*\(\d+\/\d+\)/.test(text)
    if (!isDanmakuPanel && !isCollectionCard)
      return

    const boundary = findMobileVideoDetailHiddenModuleBoundary(root, candidate)
    boundary?.setAttribute('data-bewly-mobile-detail-hidden-module', 'true')
  })
}

function markMobileVideoDetailContextChips(root: HTMLElement): void {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('a, button, div, section, span'))
  const matches = candidates.filter((candidate) => {
    const text = candidate.textContent?.replace(/\s+/g, ' ').trim()
    return Boolean(text && text.length <= 80 && /^发现《.+》$/.test(text))
  })

  matches.forEach((candidate) => {
    if (matches.some(other => other !== candidate && candidate.contains(other)))
      return
    candidate.setAttribute('data-bewly-mobile-context-chip', 'true')
  })
}

function markMobileVideoDetailExpandControls(root: HTMLElement): void {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('a, button, div, section, span'))
  const matches = candidates.filter((candidate) => {
    const text = candidate.textContent?.replace(/\s+/g, '').trim()
    return text === '展开更多' || text === '收起'
  })

  matches.forEach((candidate) => {
    if (matches.some(other => other !== candidate && candidate.contains(other)))
      return
    candidate.setAttribute('data-bewly-mobile-expand-control', 'true')

    const descriptionContainer = candidate.closest('.desc-info, .basic-desc-info, .video-desc-container, .video-desc, .desc-v2, #v_desc')
    if (
      descriptionContainer instanceof HTMLElement
      && descriptionContainer !== candidate
      && descriptionContainer.parentElement
      && candidate.parentElement !== descriptionContainer.parentElement
    ) {
      descriptionContainer.parentElement.insertBefore(candidate, descriptionContainer.nextSibling)
    }
  })
}

function removeTrailingTagChevronText(element: HTMLElement): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    if (current instanceof Text)
      textNodes.push(current)
    current = walker.nextNode()
  }

  for (let index = textNodes.length - 1; index >= 0; index -= 1) {
    const textNode = textNodes[index]
    const text = textNode.textContent ?? ''
    if (!/[>›]\s*$/.test(text))
      continue

    textNode.textContent = text.replace(/\s*[>›]\s*$/, '')
    element.setAttribute('data-bewly-mobile-tag-chevron', 'true')
    return
  }
}

function normalizeMobileVideoDetailTagChevrons(root: HTMLElement): void {
  const tagContainers = Array.from(root.querySelectorAll<HTMLElement>('.tag-area, #v_tag, .video-tag-container'))
  tagContainers.forEach((tagContainer) => {
    const candidates = Array.from(tagContainer.querySelectorAll<HTMLElement>('a, button, .tag-link, .tag, .video-tag'))
    candidates.forEach((candidate) => {
      if (candidates.some(other => other !== candidate && candidate.contains(other)))
        return
      removeTrailingTagChevronText(candidate)
    })
  })
}

function normalizeMobileVideoDetailTagMoreControls(root: HTMLElement): void {
  const tagContainers = Array.from(root.querySelectorAll<HTMLElement>('.tag-area, #v_tag, .video-tag-container'))
  tagContainers.forEach((tagContainer) => {
    const candidates = Array.from(tagContainer.querySelectorAll<HTMLElement>('button, [role="button"], .more, .fold, .arrow, .expand'))
    candidates.forEach((candidate) => {
      const text = candidate.textContent?.replace(/\s+/g, '').trim().toLowerCase()
      if (!text || !['>', '\u203A', '\u2304', '\u2305', '\u2228', 'v', '展开', '更多'].includes(text))
        return

      candidate.setAttribute('data-bewly-mobile-tag-more', 'true')
      candidate.textContent = ''
    })
  })
}

function markMobileVideoDetailCommentComposers(root: HTMLElement): void {
  const commentRoots = Array.from(root.querySelectorAll<HTMLElement>('bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment'))
  commentRoots.forEach((commentRoot) => {
    const candidates = Array.from(commentRoot.querySelectorAll<HTMLElement>('form, div, section'))
    candidates.forEach((candidate) => {
      if (candidate === commentRoot)
        return
      if (candidate.querySelector('[data-bewly-mobile-comment-composer="true"]'))
        return
      if (candidate.querySelector('.reply-item, .comment-item, .bili-comment-item, .comment-list, .reply-list'))
        return

      const hasEditable = Boolean(candidate.querySelector('textarea, input, [contenteditable="true"], [placeholder*="评论"], [placeholder*="发一条"], [class*="textarea"], [class*="input"], [class*="editor"]'))
      const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const hasComposerCopy = /评论千万条|发一条|友善发言|这里是评论区|不是无人区|登录后发表评论|创造热评|快去创造|热评|妙评|神评|锐评/.test(text)
      const hasAvatarAndInputLike = Boolean(candidate.querySelector('img, .avatar, .bili-avatar, .face'))
        && Boolean(candidate.querySelector('[role="textbox"], [class*="reply"], [class*="comment"]'))

      if (!hasEditable && !hasComposerCopy && !hasAvatarAndInputLike)
        return

      const boundary = findMobileVideoDetailHiddenModuleBoundary(commentRoot, candidate) ?? candidate
      hideMobileVideoDetailCommentComposerElement(boundary)
    })
  })
}

function hideMobileVideoDetailCommentComposerElement(element: HTMLElement): void {
  if (element.closest('.bili-mini-mask, [data-bewly-mobile-login-drawer="true"]'))
    return

  if (element.hasAttribute('data-bewly-mobile-comment-composer-open'))
    return

  element.setAttribute(MOBILE_VIDEO_DETAIL_COMMENT_COMPOSER_ATTR, 'true')
  element.style.setProperty('display', 'none', 'important')
}

function markMobileVideoDetailStandaloneCommentComposers(root: MobileVideoDetailQueryableRoot): void {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('form, div, section'))
  candidates.forEach((candidate) => {
    if (candidate.hasAttribute('data-bewly-mobile-comment-composer'))
      return
    if (candidate.closest('[data-bewly-mobile-comment-composer="true"], #arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))
      return
    if (candidate.closest('.comment-item, .reply-item, .bili-comment-item'))
      return
    if (candidate.querySelector('.comment-item, .reply-item, .bili-comment-item, .comment-list, .reply-list, .bili-comment-list'))
      return

    const rect = candidate.getBoundingClientRect()
    const isComposerSized = rect.width >= 220 && rect.height >= 28 && rect.height <= 120
    if (!isComposerSized)
      return

    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text.length > 120)
      return

    const hasAvatar = Boolean(candidate.querySelector('img, picture, .avatar, .bili-avatar, .face, [class*="avatar"], [class*="Avatar"]'))
    const hasInputSurface = Boolean(candidate.querySelector('textarea, input, [contenteditable="true"], [role="textbox"], [placeholder*="评论"], [placeholder*="发一条"], [class*="input"], [class*="Input"], [class*="textarea"], [class*="Textarea"], [class*="editor"], [class*="Editor"]'))
    const hasComposerCopy = /评论千万条|发一条|友善发言|这里是评论区|不是无人区|登录后发表评论|创造热评|快去创造|热评|妙评|神评|锐评/.test(text)
      || (text.length <= 42 && /评论/.test(text))
    const hasCommentMeta = /回复|\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/.test(text)
    const looksLikeComposerShell = hasAvatar && text.length <= 90 && !hasCommentMeta

    if (!hasInputSurface && !hasComposerCopy && !looksLikeComposerShell)
      return
    if (!hasAvatar && !hasComposerCopy)
      return

    hideMobileVideoDetailCommentComposerElement(candidate)
  })
}

function hasMobileVideoDetailCommentComposerCopy(text: string): boolean {
  return /评论千万条|发一条|友善发言|这里是评论区|不是无人区|登录后发表评论|创造热评|快去创造|热评|妙评|神评|锐评|评论两句|评论走一走|打动人心的入场券/.test(text)
}

function containsMobileVideoDetailCommentList(element: HTMLElement): boolean {
  return Boolean(element.querySelector('.comment-item, .reply-item, .bili-comment-item, .comment-list, .reply-list, .bili-comment-list'))
}

type MobileVideoDetailQueryableRoot = HTMLElement | ShadowRoot

function getMobileVideoDetailAuthorDisplayName(card: HTMLElement): string | undefined {
  const nameElement = card.querySelector<HTMLElement>('.up-name, .up-info-name, .name, .info-name, a[href*="space.bilibili.com"]')
  const name = nameElement?.textContent?.replace(/\s+/g, ' ').trim()
  if (!name)
    return undefined

  return name.replace(/\s*(?:发消息|关注|充电).*$/, '').trim() || undefined
}

function normalizeMobileVideoDetailAuthorCards(root: MobileVideoDetailQueryableRoot): void {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('.up-panel-container, .members-info-container, .video-staffs-container, .up-info-container, .up-info, .upinfo'))

  candidates.forEach((candidate) => {
    if (candidate.parentElement?.closest('[data-bewly-mobile-author-card="true"]'))
      return

    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const hasSpaceLink = Boolean(candidate.querySelector('a[href*="space.bilibili.com"]'))
    const hasAvatar = Boolean(candidate.querySelector('.up-avatar, .up-avatar-wrap, .up-info-avatar, .avatar, .bili-avatar, .face, img'))
    const hasAuthorAction = Boolean(candidate.querySelector('.upinfo-btn-panel, .up-info__btn-panel, .follow-btn, .follow-button, .btn-follow, .not-follow, .new-charge-btn, a[href*="message.bilibili.com"]'))
    const hasAuthorCopy = /发消息|关注|充电|粉丝|up主|创作/i.test(text)
    if (!hasSpaceLink && !(hasAvatar && (hasAuthorAction || hasAuthorCopy)))
      return

    candidate.setAttribute('data-bewly-mobile-author-card', 'true')
    candidate.setAttribute('data-bewly-mobile-author-normalized', 'true')

    const displayName = getMobileVideoDetailAuthorDisplayName(candidate)
    if (displayName)
      candidate.setAttribute('data-bewly-mobile-author-display-name', displayName)

    const avatar = candidate.querySelector<HTMLElement>('.up-avatar-wrap, .up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, img')
    avatar?.setAttribute('data-bewly-mobile-author-avatar', 'true')

    const info = candidate.querySelector<HTMLElement>('.up-info__detail, .up-detail, .up-detail-top, .up-info-text, .staff-info, .video-staffs-info, .up-info--right')
    info?.setAttribute('data-bewly-mobile-author-info', 'true')

    const name = candidate.querySelector<HTMLElement>('.up-name, .up-info-name, .name, .info-name, a[href*="space.bilibili.com"]')
    name?.setAttribute('data-bewly-mobile-author-name', 'true')

    const description = candidate.querySelector<HTMLElement>('.up-description, .up-info-desc, .up-detail-bottom, .desc, .info-desc, .official')
    description?.setAttribute('data-bewly-mobile-author-description', 'true')

    const actions = candidate.querySelector<HTMLElement>('.up-info__btn-panel, .upinfo-btn-panel')
    actions?.setAttribute('data-bewly-mobile-author-actions', 'true')

    candidate.querySelectorAll<HTMLElement>('.teleport, .bili-dialog-m, .bili-dialog-bomb').forEach((residual) => {
      residual.setAttribute('data-bewly-mobile-author-residual', 'true')
    })
  })
}

function normalizeMobileVideoDetailCommentShadowStyles(root: MobileVideoDetailQueryableRoot): void {
  root.querySelectorAll<HTMLElement>('bili-comments, bili-comments-header-renderer, bili-comment-thread-renderer, bili-comment-renderer, bili-comment-replies-renderer, bili-comment-action-buttons-renderer, bili-comment-user-info, bili-rich-text, bili-comment-box').forEach((host) => {
    const shadowRoot = host.shadowRoot
    if (!shadowRoot)
      return

    let style = shadowRoot.querySelector<HTMLStyleElement>(`style[${MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_STYLE_ATTR}="true"]`)
    if (!style) {
      style = document.createElement('style')
      style.setAttribute(MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_STYLE_ATTR, 'true')
      shadowRoot.prepend(style)
    }

    if (style.textContent !== MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_CSS)
      style.textContent = MOBILE_VIDEO_DETAIL_COMMENT_SHADOW_CSS
  })
}

function collectMobileVideoDetailQueryableRoots(root: HTMLElement): MobileVideoDetailQueryableRoot[] {
  const roots: MobileVideoDetailQueryableRoot[] = [root]
  const visit = (queryRoot: MobileVideoDetailQueryableRoot) => {
    queryRoot.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (!element.shadowRoot)
        return

      roots.push(element.shadowRoot)
      visit(element.shadowRoot)
    })
  }

  visit(root)
  return roots
}

function markMobileVideoDetailKnownCommentComposerClasses(root: MobileVideoDetailQueryableRoot): void {
  root.querySelectorAll<HTMLElement>('.reply-box, .reply-box-wrap, .reply-box-warp, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .reply-textarea').forEach(hideMobileVideoDetailCommentComposerElement)
}

function getMobileVideoDetailComposedParent(element: HTMLElement): HTMLElement | null {
  if (element.parentElement)
    return element.parentElement

  const root = element.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement)
    return root.host

  return null
}

function isMobileVideoDetailAvatarLikeVisual(element: HTMLElement, containerRect: DOMRect): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width < 28 || rect.width > 66 || rect.height < 28 || rect.height > 66)
    return false
  if (Math.abs(rect.width - rect.height) > 10)
    return false
  if (rect.left > containerRect.left + 90)
    return false

  const style = getComputedStyle(element)
  return element.matches('img, picture, .avatar, .bili-avatar, .face, [class*="avatar"], [class*="Avatar"]')
    || style.borderRadius.includes('%')
    || Number.parseFloat(style.borderRadius) >= rect.width * 0.35
}

function isMobileVideoDetailInputBarLikeVisual(element: HTMLElement, containerRect: DOMRect): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width < 120 || rect.height < 12 || rect.height > 44)
    return false
  if (rect.left < containerRect.left + 56)
    return false

  const style = getComputedStyle(element)
  const hasHorizontalShape = rect.width >= rect.height * 4
  const hasRoundedShape = style.borderRadius.includes('%') || Number.parseFloat(style.borderRadius) >= 2
  const hasFilledSurface = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
  return hasHorizontalShape && (hasRoundedShape || hasFilledSurface)
}

function findMobileVideoDetailCompactVisualBoundary(seed: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = seed
  let boundary: HTMLElement | undefined

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.closest('[data-bewly-mobile-comment-composer="true"], #arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))
      break

    const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const rect = current.getBoundingClientRect()
    if (text.length <= 24 && rect.width >= 120 && rect.height >= 12 && rect.height <= 118)
      boundary = current

    const parent = getMobileVideoDetailComposedParent(current)
    if (!parent)
      break

    const parentRect = parent.getBoundingClientRect()
    if (boundary && (parentRect.height > 132 || parentRect.width < 120))
      break

    current = parent
  }

  return boundary
}

function markMobileVideoDetailVisualCommentComposerShells(root: MobileVideoDetailQueryableRoot): void {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'))

  candidates.forEach((candidate) => {
    if (candidate.hasAttribute('data-bewly-mobile-comment-composer'))
      return
    if (candidate.closest('[data-bewly-mobile-comment-composer="true"], #arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))
      return

    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text.length > 24)
      return

    const rect = candidate.getBoundingClientRect()
    if (candidate.localName === 'bili-comments-header-renderer' && text.length <= 8 && rect.width >= 220 && rect.height >= 34 && rect.height <= 80) {
      hideMobileVideoDetailCommentComposerElement(candidate)
      return
    }

    if (rect.width < 220 || rect.height < 34 || rect.height > 110)
      return

    const children = Array.from(candidate.querySelectorAll<HTMLElement>('*'))
    const hasAvatarVisual = children.some(child => isMobileVideoDetailAvatarLikeVisual(child, rect))
    const hasInputBarVisual = children.some(child => isMobileVideoDetailInputBarLikeVisual(child, rect))
    if (!hasAvatarVisual || !hasInputBarVisual)
      return

    hideMobileVideoDetailCommentComposerElement(candidate)
  })

  candidates.forEach((bar) => {
    if (bar.closest('[data-bewly-mobile-comment-composer="true"], #arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))
      return

    const text = bar.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text.length > 4)
      return

    const barRect = bar.getBoundingClientRect()
    if (!isMobileVideoDetailInputBarLikeVisual(bar, { left: barRect.left - 80 } as DOMRect))
      return

    const nearbyAvatar = candidates.find((candidate) => {
      if (candidate === bar || candidate.closest('[data-bewly-mobile-comment-composer="true"]'))
        return false

      const avatarRect = candidate.getBoundingClientRect()
      const verticalDelta = Math.abs((avatarRect.top + avatarRect.height / 2) - (barRect.top + barRect.height / 2))
      return verticalDelta <= 36
        && avatarRect.right <= barRect.left + 24
        && isMobileVideoDetailAvatarLikeVisual(candidate, {
          ...barRect,
          left: Math.min(barRect.left, avatarRect.left),
        } as DOMRect)
    })
    if (!nearbyAvatar)
      return

    const boundary = findMobileVideoDetailCompactVisualBoundary(bar) ?? bar
    hideMobileVideoDetailCommentComposerElement(boundary)
    hideMobileVideoDetailCommentComposerElement(nearbyAvatar)
  })
}

function findMobileVideoDetailCompactComposerBoundary(seed: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = seed
  let boundary: HTMLElement | undefined

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.closest('#arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))
      break

    if (isMobileVideoDetailProtectedModule(current))
      break

    const rect = current.getBoundingClientRect()
    const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const isCompactRow = rect.width >= 220 && rect.height >= 28 && rect.height <= 132
    const containsProtected = Boolean(current.querySelector('video, #bilibili-player, #bilibiliPlayer, .bpx-player-container, #arc_toolbar_report, .video-toolbar-container, [data-bewly-mobile-author-card="true"]'))

    if (isCompactRow && text.length <= 140 && !containsProtected && !containsMobileVideoDetailCommentList(current))
      boundary = current

    const parent = getMobileVideoDetailComposedParent(current)
    if (!parent)
      break

    const parentRect = parent.getBoundingClientRect()
    if (boundary && (parentRect.height > 152 || parentRect.width < 220))
      break

    current = parent
  }

  return boundary
}

function markMobileVideoDetailSeededCommentComposers(root: MobileVideoDetailQueryableRoot): void {
  const seeds = new Set<HTMLElement>()
  root.querySelectorAll<HTMLElement>('textarea, input[placeholder*="评论"], input[placeholder*="发一条"], input[placeholder*="热评"], [contenteditable="true"], [role="textbox"], [placeholder*="评论"], [placeholder*="发一条"], [placeholder*="热评"], [aria-label*="评论"]').forEach(seed => seeds.add(seed))

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    const text = current.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text && text.length <= 80 && hasMobileVideoDetailCommentComposerCopy(text) && current.parentElement)
      seeds.add(current.parentElement)
    current = walker.nextNode()
  }

  seeds.forEach((seed) => {
    if (seed.closest('[data-bewly-mobile-comment-composer="true"]'))
      return

    const boundary = findMobileVideoDetailCompactComposerBoundary(seed)
    if (boundary)
      hideMobileVideoDetailCommentComposerElement(boundary)
  })
}

function findMobileVideoDetailToolbar(): HTMLElement | undefined {
  const toolbar = document.querySelector('#arc_toolbar_report, .video-toolbar-container')
  return toolbar instanceof HTMLElement ? toolbar : undefined
}

function removeMobileVideoDetailBackButton(): void {
  document.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_BACK_BUTTON_ATTR}="true"]`).forEach((button) => {
    button.remove()
  })
}

function normalizeMobileVideoDetailToolbar(toolbar: HTMLElement): void {
  toolbar.setAttribute('data-bewly-mobile-action-bar', 'true')
  toolbar.querySelectorAll<HTMLElement>('[data-bewly-mobile-toolbar-comment-entry="true"]').forEach(entry => entry.remove())

  toolbar.querySelectorAll<HTMLElement>('[data-bewly-mobile-toolbar-favorite="true"], [data-bewly-mobile-toolbar-favorite-shell="true"], [data-bewly-mobile-toolbar-action-hidden="true"]').forEach((candidate) => {
    candidate.removeAttribute('data-bewly-mobile-toolbar-favorite')
    candidate.removeAttribute('data-bewly-mobile-toolbar-favorite-shell')
    candidate.removeAttribute('data-bewly-mobile-toolbar-action-hidden')
  })

  toolbar.querySelectorAll<HTMLElement>(`[${MOBILE_VIDEO_DETAIL_TOOLBAR_BACK_HIDDEN_ATTR}="true"]`).forEach((candidate) => {
    candidate.removeAttribute(MOBILE_VIDEO_DETAIL_TOOLBAR_BACK_HIDDEN_ATTR)
  })

  const candidates = Array.from(toolbar.querySelectorAll<HTMLElement>('a, button, [role="button"], .video-toolbar-left-item, .video-toolbar-right-item, .toolbar-left-item-wrap, [class*="back"], [class*="Back"]'))
  candidates.forEach((candidate) => {
    const signature = [
      candidate.textContent,
      candidate.getAttribute('aria-label'),
      candidate.getAttribute('title'),
      candidate.className,
    ].join(' ')

    if (/返回|back|go-?back|arrow-?left|left-?arrow/i.test(signature))
      candidate.setAttribute(MOBILE_VIDEO_DETAIL_TOOLBAR_BACK_HIDDEN_ATTR, 'true')
  })
}

function ensureMobileVideoDetailLoginMaskInteractive(drawer: HTMLElement): void {
  const mask = drawer.closest<HTMLElement>('.bili-mini-mask')
  if (!mask)
    return

  if (document.body && mask.parentElement !== document.body)
    document.body.appendChild(mask)

  restoreMobileNativeManagedElement(mask)
  mask.style.removeProperty('pointer-events')
  mask.style.removeProperty('visibility')
}

function normalizeMobileVideoDetailLoginDrawer(): void {
  document.querySelectorAll<HTMLElement>('.bili-mini-mask .bili-mini-content-wp').forEach((drawer) => {
    ensureMobileVideoDetailLoginMaskInteractive(drawer)
    drawer.setAttribute('data-bewly-mobile-login-drawer', 'true')
    ensureMobileVideoDetailLoginDragHandle(drawer)
    restoreMobileVideoDetailLoginCommentComposerMisfires(drawer)

    const loginMethods = drawer.querySelector<HTMLElement>('.bili-mini-login-right-wp')
    if (loginMethods) {
      rememberMobileVideoDetailLoginDisplay(loginMethods)
      loginMethods.setAttribute('data-bewly-mobile-login-methods', 'true')
      loginMethods.style.setProperty('display', 'flex', 'important')
    }

    normalizeMobileVideoDetailLoginForms(drawer)

    drawer.querySelector<HTMLElement>('.login-scan-wp')?.setAttribute('data-bewly-mobile-login-scan', 'true')
  })
}

function scheduleMobileLoginDrawerEnhancement(delay = 0): void {
  if (mobileLoginDrawerEnhancementTimer)
    clearTimeout(mobileLoginDrawerEnhancementTimer)

  mobileLoginDrawerEnhancementTimer = setTimeout(() => {
    mobileLoginDrawerEnhancementTimer = undefined
    normalizeMobileVideoDetailLoginDrawer()
  }, delay)
}

function startMobileLoginDrawerEnhancement(): void {
  scheduleMobileLoginDrawerEnhancement()

  if (mobileLoginDrawerEnhancementObserver || typeof MutationObserver === 'undefined' || !document.body)
    return

  mobileLoginDrawerEnhancementObserver = new MutationObserver(() => {
    scheduleMobileLoginDrawerEnhancement(80)
  })
  mobileLoginDrawerEnhancementObserver.observe(document.body, { childList: true, subtree: true })
}

function enhanceMobileVideoDetailStructure(): boolean {
  if (!shouldUseMobileVideoDetailLayoutForCurrentDocument())
    return false

  normalizeMobileVideoDetailLoginDrawer()

  const player = findMobileVideoDetailPlayer()
  if (player) {
    markMobileVideoDetailPlayerCard(player)
    syncMobileVideoDetailPlayerMediaOrientation(player)
  }

  const mainColumn = findMobileVideoDetailMainColumn()
  if (!mainColumn)
    return Boolean(player)

  const toolbar = findMobileVideoDetailToolbar()
  if (toolbar) {
    removeMobileVideoDetailBackButton()
    normalizeMobileVideoDetailToolbar(toolbar)
  }

  normalizeMobileVideoDetailCommentShadowStyles(mainColumn)
  normalizeMobileVideoDetailAuthorCards(mainColumn)
  markMobileVideoDetailContextChips(mainColumn)
  markMobileVideoDetailExpandControls(mainColumn)
  normalizeMobileVideoDetailTagChevrons(mainColumn)
  normalizeMobileVideoDetailTagMoreControls(mainColumn)
  markMobileVideoDetailHiddenModules(mainColumn)
  markMobileVideoDetailCommentComposers(mainColumn)
  markMobileVideoDetailStandaloneCommentComposers(mainColumn)
  markMobileVideoDetailKnownCommentComposerClasses(mainColumn)
  markMobileVideoDetailSeededCommentComposers(mainColumn)
  markMobileVideoDetailVisualCommentComposerShells(mainColumn)
  if (document.body) {
    normalizeMobileVideoDetailCommentShadowStyles(document.body)
    normalizeMobileVideoDetailAuthorCards(document.body)
    markMobileVideoDetailCommentComposers(document.body)
    markMobileVideoDetailStandaloneCommentComposers(document.body)
    markMobileVideoDetailKnownCommentComposerClasses(document.body)
    markMobileVideoDetailSeededCommentComposers(document.body)
    markMobileVideoDetailVisualCommentComposerShells(document.body)
    collectMobileVideoDetailQueryableRoots(document.body).forEach((queryRoot) => {
      if (queryRoot === document.body)
        return

      normalizeMobileVideoDetailCommentShadowStyles(queryRoot)
      normalizeMobileVideoDetailAuthorCards(queryRoot)
      markMobileVideoDetailKnownCommentComposerClasses(queryRoot)
      markMobileVideoDetailStandaloneCommentComposers(queryRoot)
      markMobileVideoDetailSeededCommentComposers(queryRoot)
      markMobileVideoDetailVisualCommentComposerShells(queryRoot)
    })
  }

  return Boolean(player || mainColumn)
}

function scheduleMobileVideoDetailStructureEnhancement(delay = 0): void {
  if (mobileVideoDetailStructureTimer)
    clearTimeout(mobileVideoDetailStructureTimer)

  mobileVideoDetailStructureTimer = setTimeout(() => {
    mobileVideoDetailStructureTimer = undefined
    const enhanced = enhanceMobileVideoDetailStructure()
    if (enhanced || mobileVideoDetailStructureRetryCount >= 12)
      return

    mobileVideoDetailStructureRetryCount += 1
    scheduleMobileVideoDetailStructureEnhancement(250)
  }, delay)
}

function startMobileVideoDetailStructureEnhancement(): void {
  mobileVideoDetailStructureRetryCount = 0
  scheduleMobileVideoDetailStructureEnhancement()

  if (mobileVideoDetailStructureObserver || typeof MutationObserver === 'undefined' || !document.body)
    return

  mobileVideoDetailStructureObserver = new MutationObserver(() => {
    scheduleMobileVideoDetailStructureEnhancement(80)
  })
  mobileVideoDetailStructureObserver.observe(document.body, { childList: true, subtree: true })
}

function getAnchorFromClick(event: MouseEvent): HTMLAnchorElement | undefined {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  const pathAnchor = path.find((item): item is HTMLAnchorElement => item instanceof HTMLAnchorElement)
  if (pathAnchor)
    return pathAnchor

  const target = event.target
  if (!(target instanceof Element))
    return undefined

  const anchor = target.closest('a[href]')
  return anchor instanceof HTMLAnchorElement ? anchor : undefined
}

function getNavigableHref(anchor: HTMLAnchorElement): string | undefined {
  const rawHref = anchor.getAttribute('href')?.trim()
  if (!rawHref)
    return undefined
  if (rawHref.startsWith('#') || /^javascript:/i.test(rawHref) || /^(?:mailto|tel|sms):/i.test(rawHref))
    return undefined

  return anchor.href
}

function navigateMobileDetailInFrame(url: string): void {
  try {
    location.assign(new URL(url, location.href).toString())
  }
  catch {
    location.assign(url)
  }
}

function installMobileVideoDetailNavigationGuard(): void {
  if (mobileVideoDetailNavigationGuardInstalled || !isInIframe())
    return

  mobileVideoDetailNavigationGuardInstalled = true
  const originalOpen = window.open.bind(window)

  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const urlString = typeof url === 'string' ? url : url?.toString()
    if (urlString && shouldUseMobileVideoDetailLayoutForCurrentDocument()) {
      navigateMobileDetailInFrame(urlString)
      return window
    }

    return originalOpen(url, target, features)
  }) as typeof window.open

  const handleClick = (event: MouseEvent) => {
    if (!shouldUseMobileVideoDetailLayoutForCurrentDocument())
      return

    const anchor = getAnchorFromClick(event)
    if (!anchor)
      return

    const href = getNavigableHref(anchor)
    if (!href)
      return

    const requestsNewContext = anchor.target === '_blank'
      || anchor.target === '_top'
      || anchor.target === '_parent'
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.button === 1

    if (!requestsNewContext)
      return

    event.preventDefault()
    event.stopPropagation()
    navigateMobileDetailInFrame(href)
  }

  document.addEventListener('click', handleClick, true)
  document.addEventListener('auxclick', handleClick, true)
}

function isSupportedPages(): boolean {
  if (isInIframe())
    return false
  if (isMobileUserscriptPage)
    return true
  if (
    // homepage
    isHomePage()
    // video or bangumi page
    || isVideoOrBangumiPage()
    // watchlater list page
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/list.*/.test(currentUrl)
    // popular page https://www.bilibili.com/v/popular/all
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/popular\/all.*/.test(currentUrl)
    // search page
    || /https?:\/\/search\.bilibili\.com\.*/.test(currentUrl)
    // moments page
    // https://github.com/BewlyBewly/BewlyBewly/issues/1246
    // https://github.com/BewlyBewly/BewlyBewly/issues/1256
    // https://github.com/BewlyBewly/BewlyBewly/issues/1266
    // https://github.com/keleus/BewlyCat/issues/150
    || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
    // moment detail
    || /https?:\/\/(?:www\.)?bilibili\.com\/opus\/.*/.test(currentUrl)
    // history page
    || /https?:\/\/(?:www\.)?bilibili\.com\/history.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/account\/history.*/.test(currentUrl)
    // watcher later page
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/#\/list.*/.test(currentUrl)
    || /https?:\/\/(?:www\.)?bilibili\.com\/watchlater\/list.*/.test(currentUrl)
    // user space page
    || /https?:\/\/space\.bilibili\.com\.*/.test(currentUrl)
    // notifications page
    || /https?:\/\/message\.bilibili\.com\.*/.test(currentUrl)
    // bilibili channel page b站分区页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/v\/(?!popular).*/.test(currentUrl)
    // bilibili channel page 新版本页面
    || /https?:\/\/(?:www\.)?bilibili\.com\/c\/(?!popular).*/.test(currentUrl)
    // anime page & chinese anime page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:anime|guochuang).*/.test(currentUrl)
    // channel page e.g. tv shows, movie, variety shows, mooc page
    || /https?:\/\/(?:www\.)?bilibili\.com\/(?:tv|movie|variety|mooc|documentary).*/.test(currentUrl)
    // article page
    || /https?:\/\/(?:www\.)?bilibili\.com\/read\/.*/.test(currentUrl)
    // 404 page
    || /^https?:\/\/(?:www\.)?bilibili\.com\/404.*$/.test(currentUrl)
    // creative center page 創作中心頁
    || /^https?:\/\/member\.bilibili\.com\/platform.*$/.test(currentUrl)
    // account settings page 帳號設定頁
    || /^https?:\/\/account\.bilibili\.com\/.*$/.test(currentUrl)
    // login page
    || /^https?:\/\/passport\.bilibili\.com\/login.*$/.test(currentUrl)
    // music center page 新歌熱榜 https://music.bilibili.com/pc/music-center/
    || /https?:\/\/music\.bilibili\.com\/pc\/music-center.*$/.test(currentUrl)
    // // blackboard 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/blackboard.*$/.test(currentUrl)
    // // judgement 存在和B站其他页面不一样的元素，需要独立适配
    // || /https?:\/\/(?:www\.)?bilibili\.com\/judgement.*$/.test(currentUrl)
  ) {
    return true
  }
  else {
    return false
  }
}

export function isSupportedIframePages(): boolean {
  if (
    isInIframe()
    && (
      // supports Bilibili page URLs recorded in the dock
      isHomePage()
      // Since `Open in drawer` will open the video page within an iframe, so we need to support the following pages
      || isVideoOrBangumiPage()
      || /https?:\/\/search\.bilibili\.com\/all.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/anime.*/.test(currentUrl)
      || /https?:\/\/space\.bilibili\.com\/\d+\/favlist.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/history.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/watchlater\/#\/list.*/.test(currentUrl)
      || /https?:\/\/www\.bilibili\.com\/watchlater\/list.*/.test(currentUrl)
      // moments page
      // https://github.com/BewlyBewly/BewlyBewly/issues/1246
      // https://github.com/BewlyBewly/BewlyBewly/issues/1256
      // https://github.com/BewlyBewly/BewlyBewly/issues/1266
      // https://github.com/keleus/BewlyCat/issues/150
      || /https?:\/\/t\.bilibili\.com(?!\/vote|\/share|\/pages\/nav).*/.test(currentUrl)
      // notifications page, for `Open the notifications page as a drawer`
      || isNotificationPage()
    )
  ) {
    return true
  }
  else {
    return false
  }
}

if (isElectronEnv) {
  console.warn('[BewlyScript] Detected Electron environment, extension disabled.')
}
else {
  // Fix `OverlayScrollbars` not working in Firefox
  // https://github.com/fingerprintjs/fingerprintjs/issues/683#issuecomment-881210244
  if (isFirefox) {
    window.requestIdleCallback = window.requestIdleCallback.bind(window)
    window.cancelIdleCallback = window.cancelIdleCallback.bind(window)
    window.requestAnimationFrame = window.requestAnimationFrame.bind(window)
    window.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
    window.setTimeout = window.setTimeout.bind(window)
    window.clearTimeout = window.clearTimeout.bind(window)
  }

  let beforeLoadedStyleEl: HTMLStyleElement | undefined
  let lastUrl = location.href
  let lastVideoNavigationKey = getVideoNavigationKey(location.href)
  let hasAppliedPlayerMode = false // 添加标志变量
  let playerModeRetryTimer: ReturnType<typeof setTimeout> | undefined
  let watchLaterButtonAdded = false // 标记稍后再看按钮是否已添加

  if (isSupportedPages() || isSupportedIframePages()) {
  // Always use dark mode if enabled, but let useDark() handle selective application
    if (settings.value.adaptToOtherPageStyles)
      useDark()

    if (isMobileUserscriptPage) {
      injectMobileNativeHeaderCSS()
      installMobileNoNewTabGuard()
      if (!mobileVideoDetailStyleEl?.isConnected)
        mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)
      startMobileLoginDrawerEnhancement()
      window.addEventListener(MOBILE_OPEN_LOGIN_DRAWER_EVENT, handleMobileOpenLoginDrawer)
      scheduleMobileLoginIntentDrawer()
    }
    syncMobileVideoDetailLayout()

    const shouldApplyFullStyles = settings.value.adaptToOtherPageStyles && !isFestivalPage() && !isMobileUserscriptPage
    if (shouldApplyFullStyles) {
      document.documentElement.classList.add('bewly-design')

      // Setup iframe photo viewer detector (only in iframe)
      if (isInIframe())
        setupIframePhotoViewerDetector()

      // Remove the Bilibili Evolved's dark mode style
      runWhenIdle(async () => {
        const darkModeStyle = document.head.querySelector('#dark-mode')
        if (darkModeStyle)
          document.head.removeChild(darkModeStyle)
      })
    }

    else {
      document.documentElement.classList.remove('bewly-design')
    }
  }

  if (settings.value.adaptToOtherPageStyles && isHomePage() && !isMobileUserscriptPage) {
    beforeLoadedStyleEl = injectCSS(`
    html.bewly-design {
      background-color: var(--bew-bg);
      transition: background-color 0.2s ease-in;
    }

    body {
      display: none;
    }
  `)

    // Add opacity transition effect for page loaded
    injectCSS(`
    body {
      transition: opacity 0.5s;
    }
  `)
    // Failsafe: never keep the page hidden for too long.
    setTimeout(() => {
      if (beforeLoadedStyleEl?.isConnected)
        document.documentElement.removeChild(beforeLoadedStyleEl)
    }, 4000)
  }

  window.addEventListener(BEWLY_MOUNTED, () => {
    if (isMobileUserscriptPage) {
      document.documentElement.setAttribute('data-bewly-mobile-mounted', 'true')
      if (shouldHideMobileNativeContent)
        setMobileNativeContentHidden(true)
    }

    if (beforeLoadedStyleEl) {
      document.documentElement.removeChild(beforeLoadedStyleEl)
      if (isVideoPage()) {
      // 根据设置应用默认播放器模式
        applyDefaultPlayerMode()
      }
    }
  })

  // 应用默认播放器模式
  function applyDefaultPlayerMode() {
    if (!isVideoOrBangumiPage()) {
      clearPlayerModeRetry()
      return
    }

    if (hasAppliedPlayerMode)
      return // 如果已经应用过，直接返回

    // 检查是否处于全屏或网页全屏状态（互动视频场景）
    const isInFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
    const webFullscreenBtn = document.querySelector('.bpx-player-ctrl-web,.bilibili-player-video-web-fullscreen') as HTMLElement
    const isInWebFullscreen = webFullscreenBtn?.classList.contains('bpx-state-entered')

    // 如果播放器已经在全屏状态，跳过应用模式（避免互动视频退出全屏）
    if (isInFullscreen || isInWebFullscreen) {
      hasAppliedPlayerMode = true // 标记已应用，避免重复检查
      return
    }

    const playerMode = settings.value.defaultVideoPlayerMode
    let targetPlayerMode = settings.value.keepCollectionVideoDefaultMode && isCollectionVideo()
      ? 'default'
      : playerMode
    if (isFestivalPage() && targetPlayerMode === 'bewlyWidescreen')
      targetPlayerMode = 'widescreen'

    if (!isPlayerDisplayModeReady(targetPlayerMode)) {
      schedulePlayerModeRetry()
      return
    }

    clearPlayerModeRetry()

    // 检查是否为合集视频且启用了保持默认模式
    if (targetPlayerMode === 'default' && settings.value.keepCollectionVideoDefaultMode) {
    // 合集视频强制使用默认模式
      defaultMode()
    }
    else if (!targetPlayerMode || targetPlayerMode === 'default') {
    // 默认模式也需要居中显示
      defaultMode()
    }
    else {
      switch (targetPlayerMode) {
        case 'bewlyWidescreen':
          applyBewlyWidescreen()
          break
        case 'webFullscreen':
          webFullscreen()
          break
        case 'widescreen':
          widescreen()
          break
      }
    }
    setupShortcutHandlers()
    applyDefaultDanmakuState()
    initVerticalVideoZoom()
    // 应用自动连播设置，延迟更长时间确保播放器完全初始化
    setTimeout(() => {
      applyAutoPlayByVideoType()
    }, 2000)
    // 启动自动退出全屏监听
    setTimeout(() => {
      startAutoExitFullscreenMonitoring()
    }, 2000)
    hasAppliedPlayerMode = true // 标记已应用

    // 延迟添加稍后再看按钮
    scheduleAddWatchLaterButton()
  }

  function clearPlayerModeRetry() {
    if (playerModeRetryTimer) {
      clearTimeout(playerModeRetryTimer)
      playerModeRetryTimer = undefined
    }
  }

  function schedulePlayerModeRetry() {
    if (playerModeRetryTimer)
      return

    playerModeRetryTimer = setTimeout(() => {
      playerModeRetryTimer = undefined
      applyDefaultPlayerMode()
    }, document.visibilityState === 'visible' ? 500 : 1000)
  }

  // 延迟添加稍后再看按钮
  function scheduleAddWatchLaterButton() {
  // 如果已经添加过或者设置未启用，直接返回
    if (watchLaterButtonAdded || !settings.value.externalWatchLaterButton) {
      return
    }

    // 等待播放器模式调整和滚动完成
    // RetryTask最多20次*500ms=10s，滚动最多3s，再加1s保险 = 14s
    // 实际上大部分情况会更快完成，这里取一个保守值
    setTimeout(() => {
      if (!watchLaterButtonAdded && settings.value.externalWatchLaterButton) {
        import('~/utils/watchLaterButton').then(({ addWatchLaterButton }) => {
          addWatchLaterButton()
          watchLaterButtonAdded = true
        }).catch(err => console.error('添加稍后再看按钮失败:', err))
      }
    }, 5000) // 5秒后添加，确保页面已完全稳定
  }

  // 初始化随机播放功能
  function initRandomPlayFeature() {
  // 只在视频页面初始化随机播放功能
    if (isVideoPage() && settings.value.enableRandomPlay) {
      initRandomPlay()
    }
  }

  function getVideoNavigationKey(url: string) {
    try {
      const urlObj = new URL(url)
      if (!isVideoOrBangumiPage(urlObj.href))
        return ''

      const semanticParams = [
        'avid',
        'bvid',
        'cid',
        'ep_id',
        'p',
        'page',
        'season_id',
      ]
      const params = new URLSearchParams()

      for (const param of semanticParams) {
        const value = urlObj.searchParams.get(param)
        if (value !== null)
          params.set(param, value)
      }

      const query = params.toString()
      return `${urlObj.origin}${urlObj.pathname}${query ? `?${query}` : ''}`
    }
    catch {
      return url.split('?')[0].split('#')[0]
    }
  }

  function checkForUrlChanges() {
    if (location.href !== lastUrl) {
      const currentVideoNavigationKey = getVideoNavigationKey(location.href)
      const isMeaningfulVideoNavigation = currentVideoNavigationKey !== lastVideoNavigationKey

      lastUrl = location.href
      lastVideoNavigationKey = currentVideoNavigationKey
      syncMobileVideoDetailLayout(location.href)

      if (isVideoOrBangumiPage()) {
        if (!isMeaningfulVideoNavigation) {
          scheduleUrlChangeCheck()
          return
        }

        exitBewlyWidescreen()
        resetVerticalVideoZoom()
        hasAppliedPlayerMode = false // URL变化时重置标志
        watchLaterButtonAdded = false // URL变化时重置稍后再看按钮标志
        // 不再重置用户手动修改标志，保持用户的自动播放偏好设置

        // 重置随机播放初始化状态，避免重复加载
        resetRandomPlayInitialization()

        applyDefaultPlayerMode()
        // 如果是视频页面内部跳转，延迟执行滚动
        if (isVideoOrBangumiPage()) {
          handleVideoPageNavigation()
        }
        // 重新初始化随机播放功能
        if (isVideoPage() && settings.value.enableRandomPlay) {
          setTimeout(() => {
            initRandomPlayFeature()
          }, 2000) // 延迟2秒初始化，确保页面完全加载
        }
      }
    }
    scheduleUrlChangeCheck()
  }

  function scheduleUrlChangeCheck() {
    if (document.visibilityState === 'visible')
      requestAnimationFrame(checkForUrlChanges)
    else
      setTimeout(checkForUrlChanges, 1000)
  }

  scheduleUrlChangeCheck()

  // 处理页面可见性变化
  function handleVisibilityChange() {
  // 当页面变为可见且是视频或番剧页面时，且尚未应用播放器模式
    if (document.visibilityState === 'visible'
      && (isVideoOrBangumiPage())
      && !hasAppliedPlayerMode) {
      applyDefaultPlayerMode()
    }
  }

  // 添加页面加载和可见性变化的监听
  window.addEventListener('load', () => {
    if (isVideoPage()) {
      applyDefaultPlayerMode()
      // 初始化随机播放功能
      if (settings.value.enableRandomPlay) {
        setTimeout(() => {
          initRandomPlayFeature()
        }, 3000) // 延迟3秒初始化，确保页面完全加载
      }
    }
    else if (isVideoOrBangumiPage()) {
      applyDefaultPlayerMode()
    }

    // 添加搜索页面视频卡片点击事件处理
    if (/https?:\/\/search\.bilibili\.com\.*/.test(location.href)) {
      setupBiliVideoCardClickHandler()
    }
  })

  // 添加bili-video-card点击事件处理
  function setupBiliVideoCardClickHandler() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement

      // 检查点击的是否是稍后再看按钮或其子元素
      const watchLaterButton = target.closest('.bili-watch-later, .bili-watch-later--wrap, .bili-watch-later__icon')
      if (watchLaterButton)
        return

      const linkElement = target.closest('.bili-video-card a, .bili-video-card__wrap a')

      if (linkElement instanceof HTMLAnchorElement) {
        event.preventDefault()

        const href = linkElement.href
        if (isMobileUserscriptRuntimePage()) {
          openMobileUrlInCurrentPage(href)
          return
        }

        window.location.href = href
      }
    }, true)
  }
  window.addEventListener('pageshow', () => {
    if ((isVideoOrBangumiPage()) && !hasAppliedPlayerMode) {
      applyDefaultPlayerMode()
    }
  })
  window.addEventListener('visibilitychange', handleVisibilityChange)

  // Set the original Bilibili top bar to `display: none` to prevent it from showing before the load
  // see: https://github.com/BewlyBewly/BewlyBewly/issues/967
  const removeOriginalTopBar = isMobileUserscriptPage ? undefined : injectCSS(`.bili-header, #biliMainHeader { visibility: hidden !important; }`)

  async function onDOMLoaded() {
    const changeHomePage = !isMobileUserscriptPage && !isInIframe() && isHomePage()

    // Hide the original Bilibili homepage and mount BewlyScript's optimized interface.
    if (changeHomePage) {
    // Capture the original top bar early so we can optionally re-attach it later.
      captureOriginalBilibiliTopBar(document)

      // 方案选择：
      // 方案 1: 清理脚本 + 删除 DOM（可能更彻底，但有风险）
      // 方案 2: CSS 隐藏（更安全，性能更好，推荐）

      // 推荐使用方案2：CSS隐藏
      // 使用 CSS 隐藏 B 站原始页面，保留 DOM 结构
      injectCSS(`
      /* Hide Bilibili's own page elements, preserving third-party extensions (e.g., Bili-Evolved) */
      body > #app,
      body > #i_cecream,
      .home-redesign-base,
      .bilibili-gate-root {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
      }
      /* Ensure the original top bar remains visible and properly positioned */
      /* The visibility/display will be controlled by .remove-top-bar class in removeTopBar.scss */
      .bili-header {
        position: relative !important;
        left: 0 !important;
        pointer-events: auto !important;
      }
    `)

      // 温和的脚本清理（可选，减少后台资源消耗）
      cleanupBilibiliScripts()

      ensureOriginalBilibiliTopBarAppended(document)

      // Setup login button click handlers for the original Bilibili top bar
      setupLoginButtonClickHandlers(document)

      // 如果要使用方案1（删除DOM），取消注释以下代码并注释掉上面的 CSS 方案：
    /*
    // 清理 B 站脚本资源，避免内存泄漏和性能问题
    cleanupBilibiliScripts()

    // 延迟一小段时间，让清理逻辑生效
    await new Promise(resolve => setTimeout(resolve, 100))

    // Remove the original Bilibili homepage
    document.body.innerHTML = ''

    // Remove the Bilibili Evolved homepage & Bilibili-Gate homepage
    injectCSS(`
      .home-redesign-base, .bilibili-gate-root {
        display: none !important;
      }
    `)

    ensureOriginalBilibiliTopBarAppended(document)
    */
    }

    if (isSupportedPages() || isSupportedIframePages()) {
    // Then inject the app
      if (isHomePage()) {
        injectApp()
      }
      else {
        await injectAppWhenIdle()
      }
    }

    // Reset the original Bilibili top bar display style
    if (removeOriginalTopBar)
      document.documentElement.removeChild(removeOriginalTopBar)

    // Initialize Audio Interceptor
    initAudioInterceptor()
    setupSettingsWatcher()
    initVolumeNormalizationControl()

    // Initialize Favorite Dialog Enhancement (for video pages)
    if (isVideoOrBangumiPage()) {
      initFavoriteDialogEnhancement()
    }
  }

  if (document.readyState !== 'loading')
    onDOMLoaded()
  else
    document.addEventListener('DOMContentLoaded', () => onDOMLoaded())

  function injectAppWhenIdle() {
    return new Promise<void>((resolve) => {
    // Inject app when idle
      runWhenIdle(async () => {
        injectApp()
        resolve()
      })
    })
  }

  function injectApp() {
    const bewlyElArr: NodeListOf<Element> = document.querySelectorAll('#bewly')
    if (bewlyElArr.length > 0) {
      bewlyElArr.forEach((el: Element) => {
        const elVersion = el.getAttribute('data-version') || '0.0.0'
        const elIsDev = el.getAttribute('data-dev') === 'true'

        // Remove bewly element if the version is less than the current version
        if (compareVersions(elVersion, version) < 0)
          el.remove()
        // Only the development mode element remains
        else if (!elIsDev)
          el.remove()
      })
    }

    // mount component to context window
    const container = document.createElement('div')
    container.id = 'bewly'
    container.setAttribute('data-version', version)
    container.setAttribute('data-dev', import.meta.env.DEV ? 'true' : 'false')
    if (isMobileUserscriptPage)
      container.setAttribute('data-bewly-mobile-userscript', 'true')

    // 立即设置Shadow DOM容器的基准颜色，确保Vue组件能够访问到正确的CSS变量
    if (settings.value.darkModeBaseColor) {
      container.style.setProperty('--bew-dark-base-color', settings.value.darkModeBaseColor)
    }

    const root = document.createElement('div')
    // Fix #69 https://github.com/hakadao/BewlyBewly/issues/69
    // https://medium.com/@emilio_martinez/shadow-dom-open-vs-closed-1a8cf286088a - open shadow dom
    const shadowDOM = container.attachShadow?.({ mode: 'open' }) || container
    const resetStyleEl = document.createElement('style')
    resetStyleEl.textContent = isMobileUserscriptPage ? `${RESET_BEWLY_CSS}\n${MOBILE_USERSCRIPT_SHADOW_CSS}` : `${RESET_BEWLY_CSS}`
    shadowDOM.appendChild(resetStyleEl)
    shadowDOM.appendChild(root)
    container.style.opacity = '0'
    container.style.transition = 'opacity 0.5s'

    const revealContainer = () => {
    // To prevent abrupt style transitions caused by sudden style changes
      setTimeout(() => {
        container.style.opacity = '1'
      }, 500)
    }

    if (isUserscriptRuntime()) {
      const styleEl = document.createElement('style')
      styleEl.textContent = (window as BewlyScriptWindow).__BEWLYSCRIPT_STYLE_CSS__ ?? ''
      shadowDOM.insertBefore(styleEl, root)
      requestAnimationFrame(revealContainer)
    }
    else {
      const styleEl = document.createElement('link')
      styleEl.setAttribute('rel', 'stylesheet')
      styleEl.setAttribute('href', browser.runtime.getURL('dist/contentScripts/style.css'))
      styleEl.onload = revealContainer
      shadowDOM.insertBefore(styleEl, root)
    }

    // startShadowDOMStyleInjection()

    // inject svg icons
    const svgDiv = document.createElement('div')
    svgDiv.innerHTML = sanitizeInlineSvg(SVG_ICONS)
    shadowDOM.appendChild(svgDiv)

    document.body.appendChild(container)

    const app = createApp(App)
    setupApp(app)
    app.mount(root)
  }

  // 发送设置更新到网页环境
  function sendSettingsToPage(settings: any) {
  // 将响应式对象转换为普通对象
    const serializedSettings = JSON.parse(JSON.stringify(settings))
    window.postMessage({
      type: 'BEWLY_SETTINGS_UPDATE',
      data: serializedSettings,
    }, '*')
  }

  // 监听设置变化
  watch(settings, (newSettings, oldSettings) => {
    sendSettingsToPage(newSettings)

    // 监听随机播放设置变化
    if (newSettings.enableRandomPlay !== undefined) {
      if (isVideoPage()) {
        if (newSettings.enableRandomPlay) {
        // 启用随机播放
          setTimeout(() => {
            initRandomPlayFeature()
          }, 1000)
        }
        else {
        // 禁用随机播放，重置状态
          resetRandomPlayInitialization()
        }
      }
    }

    // 监听自动播放设置变化
    if (isVideoPage()) {
    // 检查自动播放相关设置是否发生变化
      const autoPlaySettingsChanged = oldSettings && (
        newSettings.autoPlayMultipart !== oldSettings.autoPlayMultipart
        || newSettings.autoPlayCollection !== oldSettings.autoPlayCollection
        || newSettings.autoPlayRecommend !== oldSettings.autoPlayRecommend
        || newSettings.autoPlayPlaylist !== oldSettings.autoPlayPlaylist
      )

      if (autoPlaySettingsChanged) {
      // 自动播放设置发生变化，同步更新页面上的自动播放开关
      // 延迟时间增加，确保页面元素已经渲染
        setTimeout(() => {
          applyAutoPlayByVideoType()
        }, 1000)
      }
    }

    // 监听稍后再看按钮外置设置变化
    if (isVideoPage() && oldSettings) {
      if (newSettings.externalWatchLaterButton !== oldSettings.externalWatchLaterButton) {
        if (newSettings.externalWatchLaterButton) {
        // 启用稍后再看按钮
          watchLaterButtonAdded = false // 重置标志
          scheduleAddWatchLaterButton()
        }
        else {
        // 移除稍后再看按钮
          const existingButton = document.querySelector('.bewly-watch-later-btn')
          if (existingButton) {
            existingButton.remove()
            watchLaterButtonAdded = false
          }
        }
      }
    }
  }, { deep: true })

  // 监听来自网页环境的请求
  window.addEventListener('message', (event) => {
    if (event.source !== window)
      return

    const { type } = event.data

    if (type === 'BEWLY_REQUEST_SETTINGS') {
    // 发送当前设置到网页环境
      sendSettingsToPage(settings.value)
    }
  })

  // 监听来自父页面的黑暗模式切换消息（用于iframe跨域场景）
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent)
      return

    const { type, isDark, darkModeBaseColor } = event.data

    if (type === IFRAME_DARK_MODE_CHANGE) {
    // Check if we should apply selective dark mode (plugin UI only) on festival pages
      const isSelectiveDark = isFestivalPage()

      if (isDark) {
      // Always apply to plugin container if it exists
        const bewlyElement = document.querySelector('#bewly')
        if (bewlyElement) {
          bewlyElement.classList.add('dark')
        }

        // Only apply global styles if not on festival pages
        if (!isSelectiveDark) {
          document.documentElement.classList.add('dark')
          document.body?.classList.add('dark')
        }

        // 如果提供了深色模式基准颜色，则应用它
        if (darkModeBaseColor) {
          document.documentElement.style.setProperty('--bew-dark-base-color', darkModeBaseColor)
        }
      }
      else {
        const bewlyElement = document.querySelector('#bewly')
        if (bewlyElement) {
          bewlyElement.classList.remove('dark')
        }

        // Only remove global classes if not in selective mode
        if (!isSelectiveDark) {
          document.documentElement.classList.remove('dark')
          document.body?.classList.remove('dark')
        }
      }
    }
  }, { passive: true })

  // 验证和恢复本地壁纸
  function validateAndRestoreLocalWallpaper() {
    const localWallpaper = localSettings.value.locallyUploadedWallpaper
    if (localWallpaper?.isLocal && localWallpaper.id) {
      if (!hasLocalWallpaper(localWallpaper.id)) {
        localSettings.value.locallyUploadedWallpaper = null

        // 如果当前壁纸使用的是丢失的本地壁纸，也清理掉
        if (isLocalWallpaperUrl(settings.value.wallpaper)) {
          settings.value.wallpaper = ''
        }
      }
      else {
      // 如果本地壁纸存在，确保当前壁纸URL使用正确的格式
        const expectedUrl = `local-wallpaper:${localWallpaper.id}`
        const base64Data = getLocalWallpaper(localWallpaper.id)

        if (base64Data) {
        // 检查当前壁纸是否需要更新格式（从旧的base64格式迁移到新格式）
          if (settings.value.wallpaper.startsWith('data:image/') && settings.value.wallpaper === base64Data) {
            settings.value.wallpaper = expectedUrl
          }
        }
      }
    }
  }

  // 在应用启动时验证本地壁纸
  validateAndRestoreLocalWallpaper()

  // 启动自动播放用户修改监听
  startAutoPlayUserChangeMonitoring()

  // 为 iframe 中运行时添加 ESC 键监听（消息页面和视频页面）
  if (isInIframe() && (isNotificationPage() || isVideoOrBangumiPage())) {
    const pageType = isNotificationPage() ? 'message' : 'video'
    console.log(`[Bewly IFrame] ESC listener initialized for ${pageType} page`)

    window.addEventListener('keydown', (e: KeyboardEvent) => {
    // 只处理ESC键
      if (e.key !== 'Escape' && e.code !== 'Escape')
        return

      console.log('[Bewly IFrame] ESC key pressed in iframe')

      // 检查当前焦点元素
      const activeElement = document.activeElement
      const tagName = activeElement?.tagName?.toLowerCase()

      // 检查是否是输入框或可编辑元素
      const isInputElement = tagName === 'input'
        || tagName === 'textarea'
        || activeElement?.hasAttribute('contenteditable')

      console.log('[Bewly IFrame] Active element:', tagName, 'isInput:', isInputElement)

      // 如果焦点在输入框内，不处理ESC键，让用户正常使用
      if (isInputElement) {
        console.log('[Bewly IFrame] Focus in input element, ignoring ESC')
        return
      }

      // 视频页面：检查视频播放器是否处于网页全屏或宽屏状态
      if (isVideoOrBangumiPage()) {
        const webFullBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-web')
        const wideBtn = document.querySelector('.bpx-player-ctrl-btn.bpx-player-ctrl-wide')
        const isWebFull = webFullBtn?.classList.contains('bpx-state-entered')
        const isWide = wideBtn?.classList.contains('bpx-state-entered')

        console.log('[Bewly IFrame] Video state - webFull:', isWebFull, 'wide:', isWide)

        // 如果视频处于网页全屏或宽屏状态，让播放器自己处理ESC
        if (isWebFull || isWide) {
          console.log('[Bewly IFrame] Video in fullscreen/wide mode, letting player handle ESC')
          return
        }
      }

      // 焦点不在输入框，通知父窗口关闭抽屉
      console.log('[Bewly IFrame] Sending close request to parent')
      e.preventDefault()
      e.stopPropagation()

      window.parent.postMessage({
        type: 'BEWLY_DRAWER_CLOSE_REQUEST',
        source: 'iframe',
      }, '*')
    }, true) // 使用捕获阶段
  }
}
