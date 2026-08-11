import { getRuntimeLocationHref } from '~/runtime/location'

const MOBILE_NATIVE_MANAGED_ATTR = 'data-bewly-mobile-native-managed'
const MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR = 'data-bewly-mobile-previous-aria-hidden'
const MOBILE_NATIVE_INTERACTIVE_OVERLAY_SELECTOR = '.bili-mini-mask, .bili-mini, .geetest_panel, .geetest_panel_ghost, [data-bewly-mobile-video-drawer-host-fallback="true"]'
const MOBILE_VIEWPORT_MANAGED_ATTR = 'data-bewly-mobile-viewport-managed'
const MOBILE_VIEWPORT_CREATED_ATTR = 'data-bewly-mobile-viewport-created'
const MOBILE_VIEWPORT_PREVIOUS_CONTENT_ATTR = 'data-bewly-mobile-viewport-previous-content'

export const MOBILE_USERSCRIPT_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

let mobileNativeContentObserver: MutationObserver | undefined
let mobileViewportZoomGuardInstalled = false

function getViewportMeta(): HTMLMetaElement | undefined {
  if (typeof document === 'undefined')
    return undefined

  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta')).find((meta) => {
    return meta.name.toLowerCase() === 'viewport'
  })
}

export function ensureMobileUserscriptViewportMeta(): HTMLMetaElement | undefined {
  if (typeof document === 'undefined' || !document.head)
    return undefined

  let viewport = getViewportMeta()

  if (!viewport) {
    viewport = document.createElement('meta')
    viewport.name = 'viewport'
    viewport.setAttribute(MOBILE_VIEWPORT_CREATED_ATTR, 'true')
    document.head.prepend(viewport)
  }

  if (viewport.getAttribute(MOBILE_VIEWPORT_MANAGED_ATTR) !== 'true') {
    const previousContent = viewport.getAttribute('content')
    if (previousContent !== null)
      viewport.setAttribute(MOBILE_VIEWPORT_PREVIOUS_CONTENT_ATTR, previousContent)
  }

  viewport.setAttribute(MOBILE_VIEWPORT_MANAGED_ATTR, 'true')
  viewport.setAttribute('content', MOBILE_USERSCRIPT_VIEWPORT_CONTENT)
  return viewport
}

export function restoreMobileUserscriptViewportMeta(): void {
  const viewport = getViewportMeta()
  if (!viewport || viewport.getAttribute(MOBILE_VIEWPORT_MANAGED_ATTR) !== 'true')
    return

  if (viewport.getAttribute(MOBILE_VIEWPORT_CREATED_ATTR) === 'true') {
    viewport.remove()
    return
  }

  const previousContent = viewport.getAttribute(MOBILE_VIEWPORT_PREVIOUS_CONTENT_ATTR)
  if (previousContent !== null)
    viewport.setAttribute('content', previousContent)
  else
    viewport.removeAttribute('content')

  viewport.removeAttribute(MOBILE_VIEWPORT_MANAGED_ATTR)
  viewport.removeAttribute(MOBILE_VIEWPORT_CREATED_ATTR)
  viewport.removeAttribute(MOBILE_VIEWPORT_PREVIOUS_CONTENT_ATTR)
}

function preventMobilePageZoom(event: Event): void {
  event.preventDefault()
}

function preventMobileMultiTouchZoom(event: TouchEvent): void {
  if (event.touches.length > 1)
    event.preventDefault()
}

function preventDesktopWheelZoom(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey)
    event.preventDefault()
}

export function installMobileUserscriptZoomGuard(): void {
  if (typeof document === 'undefined' || mobileViewportZoomGuardInstalled)
    return

  mobileViewportZoomGuardInstalled = true
  document.addEventListener('gesturestart', preventMobilePageZoom, { passive: false })
  document.addEventListener('gesturechange', preventMobilePageZoom, { passive: false })
  document.addEventListener('gestureend', preventMobilePageZoom, { passive: false })
  document.addEventListener('touchmove', preventMobileMultiTouchZoom, { passive: false })
  window.addEventListener('wheel', preventDesktopWheelZoom, { passive: false })
}

export function removeMobileUserscriptZoomGuard(): void {
  if (typeof document === 'undefined' || !mobileViewportZoomGuardInstalled)
    return

  mobileViewportZoomGuardInstalled = false
  document.removeEventListener('gesturestart', preventMobilePageZoom)
  document.removeEventListener('gesturechange', preventMobilePageZoom)
  document.removeEventListener('gestureend', preventMobilePageZoom)
  document.removeEventListener('touchmove', preventMobileMultiTouchZoom)
  window.removeEventListener('wheel', preventDesktopWheelZoom)
}

function isMobileNativeInteractiveOverlay(element: HTMLElement): boolean {
  return element.matches(MOBILE_NATIVE_INTERACTIVE_OVERLAY_SELECTOR)
}

function restoreMobileNativeContentElement(element: HTMLElement): void {
  const previousAriaHidden = element.getAttribute(MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR)
  if (previousAriaHidden !== null)
    element.setAttribute('aria-hidden', previousAriaHidden)
  else
    element.removeAttribute('aria-hidden')

  element.removeAttribute(MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR)
  element.removeAttribute(MOBILE_NATIVE_MANAGED_ATTR)
  element.inert = false
}

function applyMobileNativeContentHidden(hidden: boolean): void {
  const body = document.body
  if (!body)
    return

  Array.from(body.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.id === 'bewly')
      return

    if (isMobileNativeInteractiveOverlay(child)) {
      restoreMobileNativeContentElement(child)
      return
    }

    if (hidden) {
      if (!child.hasAttribute(MOBILE_NATIVE_MANAGED_ATTR)) {
        const previousAriaHidden = child.getAttribute('aria-hidden')
        if (previousAriaHidden !== null)
          child.setAttribute(MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR, previousAriaHidden)
        child.setAttribute(MOBILE_NATIVE_MANAGED_ATTR, 'true')
      }

      child.setAttribute('aria-hidden', 'true')
      child.inert = true
      return
    }

    if (child.getAttribute(MOBILE_NATIVE_MANAGED_ATTR) !== 'true')
      return

    restoreMobileNativeContentElement(child)
  })
}

function startMobileNativeContentObserver(): void {
  if (mobileNativeContentObserver || typeof MutationObserver === 'undefined' || !document.body)
    return

  mobileNativeContentObserver = new MutationObserver(() => {
    applyMobileNativeContentHidden(true)
  })
  mobileNativeContentObserver.observe(document.body, { childList: true })
}

function stopMobileNativeContentObserver(): void {
  mobileNativeContentObserver?.disconnect()
  mobileNativeContentObserver = undefined
}

export function setMobileNativeContentHidden(hidden: boolean): void {
  applyMobileNativeContentHidden(hidden)

  if (hidden)
    startMobileNativeContentObserver()
  else
    stopMobileNativeContentObserver()
}

let mobileNoNewTabGuardInstalled = false
let originalWindowOpen: typeof window.open | undefined
let mobileLinkTargetObserver: MutationObserver | undefined

export const MOBILE_BILIBILI_HOST = 'm.bilibili.com'
export const DESKTOP_BILIBILI_HOST = 'www.bilibili.com'
export const SPACE_BILIBILI_HOST = 'space.bilibili.com'

interface GmOpenInTabOptions {
  active?: boolean
}

interface GmApi {
  openInTab?: (url: string, options?: boolean | GmOpenInTabOptions) => unknown
}

export const MOBILE_OPEN_IN_PAGE_EVENT = 'bewly-mobile-open-in-page'
export const MOBILE_OPEN_LOGIN_DRAWER_EVENT = 'bewly-mobile-open-login-drawer'
export const MOBILE_LINK_MANAGED_ATTR = 'data-bewly-mobile-link-managed'
export const BEWLY_MOBILE_LOGIN_INTENT_PARAM = 'bewlyLogin'
export const BEWLY_MOBILE_VIDEO_DRAWER_PARAM = 'bewlyVideoDrawer'
export const BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM = 'bewlyVideoDrawerFrame'
export const BILIBILI_LOGIN_URL = 'https://passport.bilibili.com/login'

export interface OpenBilibiliLoginPageOptions {
  forcePage?: boolean
}

function normalizeMobileNavigationUrl(url: string): string {
  return normalizeBilibiliUrlForCurrentSurface(url)
}

function shouldKeepMobileNavigationInCurrentTab(url: string = getRuntimeLocationHref()): boolean {
  return isMobileUserscriptRuntimePage(url) || hasBewlyMobileLoginIntent(url)
}

export function openMobileUrlInCurrentPage(url: string): boolean {
  if (!shouldKeepMobileNavigationInCurrentTab())
    return false

  const event = new CustomEvent(MOBILE_OPEN_IN_PAGE_EVENT, {
    detail: { url: normalizeMobileNavigationUrl(url) },
    cancelable: true,
  })
  window.dispatchEvent(event)
  return true
}

export function openMobileLoginDrawer(): boolean {
  if (typeof window === 'undefined' || !shouldKeepMobileNavigationInCurrentTab())
    return false

  const event = new CustomEvent(MOBILE_OPEN_LOGIN_DRAWER_EVENT, {
    cancelable: true,
    detail: { url: BILIBILI_LOGIN_URL },
  })
  return !window.dispatchEvent(event)
}

export function isBilibiliLoginUrl(url: string): boolean {
  try {
    const parsed = typeof location === 'undefined' ? new URL(url) : new URL(url, location.href)
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return parsed.protocol === 'https:'
      && parsed.hostname === 'passport.bilibili.com'
      && (pathname === '/login' || pathname.startsWith('/login/') || pathname.includes('/passport/login'))
  }
  catch {
    return false
  }
}

export function getBewlyMobileLoginUrl(currentUrl: string = getRuntimeLocationHref()): string {
  void currentUrl
  const target = new URL(`https://${DESKTOP_BILIBILI_HOST}/`)
  target.searchParams.set(BEWLY_MOBILE_LOGIN_INTENT_PARAM, '1')
  return target.toString()
}

export function hasBewlyMobileLoginIntent(url: string = getRuntimeLocationHref()): boolean {
  try {
    const parsed = typeof location === 'undefined' ? new URL(url) : new URL(url, location.href)
    if (parsed.protocol !== 'https:' || parsed.hostname !== DESKTOP_BILIBILI_HOST)
      return false

    return parsed.searchParams.get(BEWLY_MOBILE_LOGIN_INTENT_PARAM) === '1'
  }
  catch {
    return false
  }
}

export function openMobileExternalUrl(url: string, target: string = '_blank'): boolean {
  const normalizedUrl = normalizeMobileNavigationUrl(url)
  const gm = (globalThis as { GM?: GmApi }).GM

  if (gm?.openInTab) {
    gm.openInTab(normalizedUrl, { active: target !== '_blank' })
    return true
  }

  if (!shouldKeepMobileNavigationInCurrentTab()) {
    window.open(normalizedUrl, target, 'noopener,noreferrer')
    return true
  }

  return false
}

function navigateCurrentPage(url: string): void {
  if (typeof location.assign === 'function') {
    location.assign(url)
    return
  }

  location.href = url
}

export function openBilibiliLoginPage(options: OpenBilibiliLoginPageOptions = {}): void {
  if (!options.forcePage && openMobileLoginDrawer())
    return

  if (shouldKeepMobileNavigationInCurrentTab()) {
    navigateCurrentPage(getBewlyMobileLoginUrl())
    return
  }

  if (options.forcePage) {
    navigateCurrentPage(BILIBILI_LOGIN_URL)
    return
  }

  if (openMobileExternalUrl(BILIBILI_LOGIN_URL, '_self'))
    return

  navigateCurrentPage(BILIBILI_LOGIN_URL)
}

function getMobileNavigableAnchorHref(anchor: HTMLAnchorElement): string | undefined {
  const rawHref = anchor.getAttribute('href')?.trim()
  if (!rawHref)
    return undefined

  if (
    rawHref.startsWith('#')
    || /^javascript:/i.test(rawHref)
    || /^(?:mailto|tel|sms):/i.test(rawHref)
  ) {
    return undefined
  }

  return anchor.href
}

function getMobileClickComposedPath(event: MouseEvent): EventTarget[] {
  return typeof event.composedPath === 'function' ? event.composedPath() : []
}

function getAnchorFromMobileClick(event: MouseEvent, path: EventTarget[]): HTMLAnchorElement | undefined {
  const pathAnchor = path.find((item): item is HTMLAnchorElement => item instanceof HTMLAnchorElement)
  if (pathAnchor)
    return pathAnchor

  const target = event.target
  if (!(target instanceof Element))
    return undefined

  const anchor = target.closest('a[href]')
  return anchor instanceof HTMLAnchorElement ? anchor : undefined
}

function hasManagedMobileLinkInPath(path: EventTarget[]): boolean {
  return path.some(item => item instanceof HTMLElement && item.hasAttribute(MOBILE_LINK_MANAGED_ATTR))
}

function isInsideBewlyFromMobileClick(anchor: HTMLAnchorElement, path: EventTarget[]): boolean {
  return path.some(item => item instanceof HTMLElement && item.id === 'bewly')
    || !!anchor.closest('#bewly')
}

function shouldForceMobileCurrentPageTarget(anchor: HTMLAnchorElement): boolean {
  if (anchor.closest('#bewly'))
    return true

  const href = getMobileNavigableAnchorHref(anchor)
  return Boolean(href && isBilibiliVideoDetailPage(href))
}

function handleMobileNoNewTabClick(event: MouseEvent): void {
  if (!shouldKeepMobileNavigationInCurrentTab())
    return

  const path = getMobileClickComposedPath(event)
  const anchor = getAnchorFromMobileClick(event, path)
  if (!anchor)
    return

  if (hasManagedMobileLinkInPath(path))
    return

  const href = getMobileNavigableAnchorHref(anchor)
  if (!href)
    return

  const requestsNewContext = anchor.target === '_blank'
    || anchor.target === '_self'
    || anchor.target === '_top'
    || anchor.target === '_parent'
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.button === 1
  const isInsideBewly = isInsideBewlyFromMobileClick(anchor, path)

  if (isBilibiliLoginUrl(href) && openMobileLoginDrawer()) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (isBilibiliVideoDetailPage(href)) {
    event.preventDefault()
    event.stopPropagation()
    openMobileUrlInCurrentPage(href)
    return
  }

  if (!requestsNewContext && !isInsideBewly)
    return

  event.preventDefault()
  event.stopPropagation()
  openMobileUrlInCurrentPage(href)
}

function applyMobileCurrentPageTargets(root: ParentNode = document): void {
  if (!shouldKeepMobileNavigationInCurrentTab())
    return

  const anchors = root instanceof HTMLAnchorElement
    ? [root]
    : Array.from(root.querySelectorAll?.('a[target="_blank"], a[target="_top"], a[target="_parent"]') ?? [])

  anchors.forEach((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement))
      return
    if (!shouldForceMobileCurrentPageTarget(anchor))
      return
    anchor.target = '_self'
  })
}

function startMobileLinkTargetObserver(): void {
  if (mobileLinkTargetObserver || typeof MutationObserver === 'undefined')
    return

  applyMobileCurrentPageTargets()
  mobileLinkTargetObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        applyMobileCurrentPageTargets(record.target)
        return
      }

      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLAnchorElement || node instanceof HTMLElement)
          applyMobileCurrentPageTargets(node)
      })
    })
  })
  mobileLinkTargetObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['target'] })
}

export function installMobileNoNewTabGuard(): void {
  if (mobileNoNewTabGuardInstalled || typeof window === 'undefined')
    return

  mobileNoNewTabGuardInstalled = true
  originalWindowOpen = window.open.bind(window)

  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const urlString = typeof url === 'string' ? url : url?.toString()

    if (urlString && shouldKeepMobileNavigationInCurrentTab()) {
      openMobileUrlInCurrentPage(urlString)
      return window
    }

    return originalWindowOpen?.(url, target, features) ?? null
  }) as typeof window.open

  document.addEventListener('click', handleMobileNoNewTabClick, true)
  document.addEventListener('auxclick', handleMobileNoNewTabClick, true)
  startMobileLinkTargetObserver()
}

export const MOBILE_NATIVE_HEADER_CSS = `
/* ── Dark-theme native m.bilibili.com header when BewlyScript is active ── */
html[data-bewly-mobile="true"] {
  /* explicit fallback for native elements that reference Bewly css vars */
  color-scheme: dark;
  background: #101114 !important;
  --native-bg: #101114;
  --native-elevated: #18191d;
  --native-text-1: #e2e2e6;
  --native-text-2: #98989f;
  --native-border: #2c2c30;
  --bewly-mobile-detail-elevated: #1c1f25;
  --bewly-mobile-detail-text: #f2f3f5;
  --bewly-mobile-detail-accent: #00a1d6;
  --bewly-mobile-login-bg: #fff;
  --bewly-mobile-login-text: #18191c;
  --bewly-mobile-login-muted: #6f7682;
  --bewly-mobile-login-subtle: #8d96a3;
  --bewly-mobile-login-placeholder: #9aa2ad;
  --bewly-mobile-login-border: rgba(24, 25, 28, 0.12);
  --bewly-mobile-login-border-strong: rgba(251, 114, 153, 0.45);
  --bewly-mobile-login-field-bg: #f7f8fa;
  --bewly-mobile-login-accent: #fb7299;
  --bewly-mobile-detail-radius: clamp(14px, 4vw, 20px);
  --bewly-mobile-login-drawer-max-height: min(86dvh, calc(100dvh - env(safe-area-inset-top, 0px)));
  --bewly-mobile-login-drawer-pad-top: clamp(22px, 4.8dvh, 26px);
  --bewly-mobile-login-drawer-pad-inline: clamp(14px, 4vw, 16px);
  --bewly-mobile-login-drawer-pad-bottom: clamp(16px, 3dvh, 18px);
  --bewly-mobile-login-drag-height: clamp(38px, 6dvh, 44px);
  --bewly-mobile-login-drag-width: clamp(38px, 12vw, 48px);
  --bewly-mobile-login-drag-thickness: clamp(4px, 1.2vw, 5px);
  --bewly-mobile-login-control-size: clamp(28px, 8vw, 32px);
  touch-action: pan-x pan-y;
  -webkit-text-size-adjust: 100%;
}

html[data-bewly-mobile="true"] body {
  background: var(--native-bg) !important;
  touch-action: pan-x pan-y;
  -webkit-text-size-adjust: 100%;
}

html[data-bewly-mobile="true"]:not([data-bewly-mobile-page-kind="video"]):not([data-bewly-mobile-page-kind="other"]):not([data-bewly-mobile-video-detail="true"]):not([data-bewly-mobile-mounted="true"]) body > :not(#bewly) {
  opacity: 0 !important;
  pointer-events: none !important;
}

html[data-bewly-mobile="true"] body > [data-bewly-mobile-native-managed="true"] {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  user-select: none !important;
}

/* .m-head — 顶部外层容器 */
html[data-bewly-mobile="true"] .m-head {
  background: var(--native-bg) !important;
}

/* .m-navbar — logo + right section 行 */
html[data-bewly-mobile="true"] .m-navbar {
  background: var(--native-bg) !important;
}

/* 搜索图标 */
html[data-bewly-mobile="true"] .m-navbar .search svg {
  color: var(--native-text-1) !important;
  fill: var(--native-text-1) !important;
}

/* 头像区域（未登录的登录按钮） */
html[data-bewly-mobile="true"] .m-navbar .face .login svg,
html[data-bewly-mobile="true"] .m-navbar .face svg {
  color: var(--native-text-1) !important;
  fill: var(--native-text-1) !important;
}

/* 下载App */
html[data-bewly-mobile="true"] .m-navbar .m-nav-openapp {
  color: var(--native-text-1) !important;
}

/* .channel-menu — 分类频道 tab 栏（保留，只做配色适配） */
html[data-bewly-mobile="true"] .channel-menu {
  background: var(--native-elevated) !important;
  border-top: 1px solid var(--native-border) !important;
  border-bottom: 1px solid var(--native-border) !important;
}

/* 频道 tab 链接 */
html[data-bewly-mobile="true"] .channel-menu .v-switcher__header__tabs__item {
  color: var(--native-text-2) !important;
}

/* 当前选中的频道 tab */
html[data-bewly-mobile="true"] .channel-menu .v-switcher__header__tabs__item.is-active,
html[data-bewly-mobile="true"] .channel-menu .v-switcher__header__tabs__item.router-link-exact-active {
  color: var(--native-text-1) !important;
  background: transparent !important;
}

/* 频道栏底部分隔线 */
html[data-bewly-mobile="true"] .channel-menu .v-switcher__header__bottom {
  background: var(--native-bg) !important;
}

/* 展开箭头 */
html[data-bewly-mobile="true"] .channel-menu .icon-expand svg,
html[data-bewly-mobile="true"] .channel-menu .v-switcher__header__after svg {
  color: var(--native-text-2) !important;
  fill: var(--native-text-2) !important;
}
`

export function injectMobileNativeHeaderCSS(url: string = getRuntimeLocationHref()): HTMLStyleElement | undefined {
  const style = document.createElement('style')
  style.textContent = MOBILE_NATIVE_HEADER_CSS
  document.documentElement.appendChild(style)
  ensureMobileUserscriptViewportMeta()
  installMobileUserscriptZoomGuard()
  document.documentElement.setAttribute('data-bewly-mobile', 'true')
  document.documentElement.setAttribute('data-bewly-mobile-page-kind', classifyMobileTakeoverBilibiliPage(url))
  return style
}

export function removeMobileNativeHeaderCSS(styleEl: HTMLStyleElement | undefined): void {
  if (styleEl?.isConnected)
    document.documentElement.removeChild(styleEl)
  setMobileNativeContentHidden(false)
  document.documentElement.removeAttribute('data-bewly-mobile')
  document.documentElement.removeAttribute('data-bewly-mobile-page-kind')
  document.documentElement.removeAttribute('data-bewly-mobile-mounted')
  removeMobileUserscriptZoomGuard()
  restoreMobileUserscriptViewportMeta()
}

export function isMobileBilibiliPage(url: string = getRuntimeLocationHref()): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === MOBILE_BILIBILI_HOST
  }
  catch {
    return false
  }
}

export function isDesktopBilibiliPage(url: string = getRuntimeLocationHref()): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === DESKTOP_BILIBILI_HOST
  }
  catch {
    return false
  }
}

export type MobileBilibiliPageKind = 'home' | 'video' | 'search' | 'space' | 'moments' | 'other'

function classifyCoreBilibiliPath(pathname: string): MobileBilibiliPageKind {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/'

  if (normalizedPathname === '/' || normalizedPathname === '/index.html')
    return 'home'
  if (normalizedPathname.startsWith('/video/'))
    return 'video'
  if (normalizedPathname.startsWith('/search'))
    return 'search'
  if (normalizedPathname.startsWith('/space/'))
    return 'space'
  if (normalizedPathname.startsWith('/dynamic') || normalizedPathname.startsWith('/opus/'))
    return 'moments'

  return 'other'
}

export function classifyMobileBilibiliPage(url: string = getRuntimeLocationHref()): MobileBilibiliPageKind {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== MOBILE_BILIBILI_HOST)
      return 'other'

    return classifyCoreBilibiliPath(parsed.pathname)
  }
  catch {
    return 'other'
  }
}

export function classifyMobileTakeoverBilibiliPage(url: string = getRuntimeLocationHref()): MobileBilibiliPageKind {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:')
      return 'other'
    if (parsed.hostname !== MOBILE_BILIBILI_HOST && parsed.hostname !== DESKTOP_BILIBILI_HOST)
      return 'other'

    return classifyCoreBilibiliPath(parsed.pathname)
  }
  catch {
    return 'other'
  }
}

export function isMobileBilibiliHomePage(url: string = getRuntimeLocationHref()): boolean {
  return classifyMobileBilibiliPage(url) === 'home'
}

export function isDesktopBilibiliHomePage(url: string = getRuntimeLocationHref()): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:')
      return false
    if (parsed.hostname !== DESKTOP_BILIBILI_HOST && parsed.hostname !== 'bilibili.com')
      return false

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return pathname === '/' || pathname === '/index.html'
  }
  catch {
    return false
  }
}

export function shouldHideMobileNativeContentForPage(url: string = getRuntimeLocationHref()): boolean {
  if (!isDesktopPortraitUserscriptRuntimePage(url))
    return false

  const mobilePageKind = classifyMobileTakeoverBilibiliPage(url)
  return mobilePageKind !== 'video' && mobilePageKind !== 'other'
}

export function isBilibiliVideoDetailPage(url: string = getRuntimeLocationHref()): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:')
      return false
    if (parsed.hostname !== MOBILE_BILIBILI_HOST && parsed.hostname !== DESKTOP_BILIBILI_HOST && parsed.hostname !== 'bilibili.com')
      return false

    const pathname = parsed.pathname.replace(/\/+$/, '')
    return pathname.startsWith('/video/') || pathname.startsWith('/bangumi/play/')
  }
  catch {
    return false
  }
}

interface BewlyUserscriptRuntimeGlobal {
  __BEWLYSCRIPT__?: boolean
}

export function isUserscriptRuntime(): boolean {
  return Boolean((globalThis as BewlyUserscriptRuntimeGlobal).__BEWLYSCRIPT__)
    || (typeof window !== 'undefined' && Boolean((window as unknown as BewlyUserscriptRuntimeGlobal).__BEWLYSCRIPT__))
}

interface ScreenWithOptionalOrientation {
  orientation?: {
    type?: string
  }
}

interface WindowWithLegacyOrientation {
  orientation?: number
}

function getScreenOrientationType(): string | undefined {
  if (typeof screen === 'undefined')
    return undefined

  const orientation = (screen as ScreenWithOptionalOrientation).orientation
  return typeof orientation?.type === 'string' ? orientation.type : undefined
}

function getLegacyWindowOrientation(): number | undefined {
  if (typeof window === 'undefined')
    return undefined

  const orientation = (window as unknown as WindowWithLegacyOrientation).orientation
  return typeof orientation === 'number' ? orientation : undefined
}

function getViewportOrientationFallback(): boolean {
  if (typeof window === 'undefined')
    return false

  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  return viewportWidth > 0 && viewportHeight > 0 && viewportHeight >= viewportWidth
}

function getViewportOrientation(): boolean | undefined {
  if (typeof window === 'undefined')
    return undefined

  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight

  if (viewportWidth <= 0 || viewportHeight <= 0)
    return undefined

  if (Math.abs(viewportHeight - viewportWidth) < 24)
    return undefined

  if (viewportHeight >= viewportWidth)
    return true

  if (viewportWidth <= 980 && viewportWidth < viewportHeight * 1.45)
    return true

  return false
}

function hasPortraitDeviceOrientation(): boolean {
  if (typeof window === 'undefined')
    return false

  const viewportOrientation = getViewportOrientation()
  if (viewportOrientation !== undefined)
    return viewportOrientation

  const portraitMediaQuery = globalThis.matchMedia?.('(orientation: portrait)')
  const landscapeMediaQuery = globalThis.matchMedia?.('(orientation: landscape)')
  if (portraitMediaQuery?.matches)
    return true
  if (landscapeMediaQuery?.matches)
    return false

  const screenOrientationType = getScreenOrientationType()
  if (screenOrientationType)
    return screenOrientationType.startsWith('portrait')

  const legacyOrientation = getLegacyWindowOrientation()
  if (legacyOrientation !== undefined)
    return Math.abs(legacyOrientation) % 180 === 0

  return getViewportOrientationFallback()
}

function hasMobileUserscriptPageMarker(): boolean {
  if (typeof document === 'undefined')
    return false

  return document.documentElement.getAttribute('data-bewly-mobile') === 'true'
    || document.documentElement.getAttribute('data-bewly-mobile-mounted') === 'true'
    || Boolean(document.querySelector('[data-bewly-mobile-userscript="true"]'))
}

export function isDesktopPortraitUserscriptRuntimePage(url: string = getRuntimeLocationHref()): boolean {
  if (!isDesktopBilibiliPage(url))
    return false
  if (!hasPortraitDeviceOrientation())
    return false

  const pageKind = classifyMobileTakeoverBilibiliPage(url)
  if (pageKind === 'other' && !isDesktopBilibiliHomePage(url))
    return false

  return isUserscriptRuntime() || hasMobileUserscriptPageMarker()
}

export function isMobileUserscriptRuntimePage(url: string = getRuntimeLocationHref()): boolean {
  return isDesktopPortraitUserscriptRuntimePage(url)
}

export function shouldUseMobileVideoDetailLayout(url: string = getRuntimeLocationHref()): boolean {
  return isBilibiliVideoDetailPage(url) && isDesktopBilibiliPage(url) && hasPortraitDeviceOrientation()
}

export function shouldOpenMobileVideoDetailAsDrawer(url: string = getRuntimeLocationHref()): boolean {
  return shouldUseMobileVideoDetailLayout(url)
}

export function getBewlyMobileVideoDrawerHomeUrl(videoUrl: string = getRuntimeLocationHref(), currentUrl: string = getRuntimeLocationHref()): string {
  const normalizedVideoUrl = normalizeBilibiliUrlForCurrentSurface(videoUrl, currentUrl)
  const homeUrl = new URL('https://www.bilibili.com/', currentUrl)
  homeUrl.searchParams.set('page', 'Home')
  homeUrl.searchParams.set(BEWLY_MOBILE_VIDEO_DRAWER_PARAM, normalizedVideoUrl)
  return homeUrl.toString()
}

export function hasBewlyMobileVideoDrawerFrameMarker(url: string = getRuntimeLocationHref()): boolean {
  try {
    return new URL(url, location.href).searchParams.get(BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM) === '1'
  }
  catch {
    return false
  }
}

export function markBewlyMobileVideoDrawerFrameUrl(videoUrl: string, currentUrl: string = getRuntimeLocationHref()): string {
  const markedUrl = new URL(normalizeBilibiliUrlForCurrentSurface(videoUrl, currentUrl), currentUrl)
  markedUrl.searchParams.set(BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM, '1')
  return markedUrl.toString()
}

export function normalizeBilibiliUrlForCurrentSurface(targetUrl: string, currentUrl: string = getRuntimeLocationHref()): string {
  try {
    const parsedTarget = new URL(targetUrl, currentUrl)

    if (parsedTarget.hostname === SPACE_BILIBILI_HOST) {
      const spacePath = parsedTarget.pathname.replace(/^\/+/, '')
      parsedTarget.protocol = 'https:'
      parsedTarget.hostname = DESKTOP_BILIBILI_HOST
      parsedTarget.pathname = spacePath ? `/space/${spacePath}` : '/space'
      return parsedTarget.toString()
    }

    if (parsedTarget.hostname !== MOBILE_BILIBILI_HOST && parsedTarget.hostname !== DESKTOP_BILIBILI_HOST)
      return parsedTarget.toString()

    parsedTarget.protocol = 'https:'
    parsedTarget.hostname = DESKTOP_BILIBILI_HOST

    return parsedTarget.toString()
  }
  catch {
    return targetUrl
  }
}

export interface PointerCapabilities {
  canHover: boolean
  finePointer: boolean
}

export function getPointerCapabilities(
  matchMediaFn: ((query: string) => MediaQueryList) | undefined = globalThis.matchMedia?.bind(globalThis),
): PointerCapabilities {
  if (!matchMediaFn) {
    return {
      canHover: true,
      finePointer: true,
    }
  }

  return {
    canHover: matchMediaFn('(hover: hover)').matches || matchMediaFn('(any-hover: hover)').matches,
    finePointer: matchMediaFn('(pointer: fine)').matches || matchMediaFn('(any-pointer: fine)').matches,
  }
}

export function shouldPreferTouchMode(
  touchScreenOptimization: boolean,
  capabilities: PointerCapabilities = getPointerCapabilities(),
  mobileUserscriptPage: boolean = isMobileUserscriptRuntimePage(),
): boolean {
  if (touchScreenOptimization || mobileUserscriptPage)
    return true

  return !capabilities.canHover || !capabilities.finePointer
}

export function shouldEnableHoverInteractions(
  touchScreenOptimization: boolean,
  capabilities: PointerCapabilities = getPointerCapabilities(),
  mobileUserscriptPage: boolean = isMobileUserscriptRuntimePage(),
): boolean {
  return !shouldPreferTouchMode(touchScreenOptimization, capabilities, mobileUserscriptPage)
}

export function getBewlyUserscriptHomeUrl(page?: string, url: string = getRuntimeLocationHref()): string {
  void url
  const host = DESKTOP_BILIBILI_HOST
  const target = new URL(`https://${host}/`)
  if (page)
    target.searchParams.set('page', page)
  return target.toString()
}

export const MOBILE_USERSCRIPT_SHADOW_CSS = `
  :host {
    color-scheme: light dark;
  }

  :host([data-bewly-mobile-userscript="true"]) {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483000 !important;
    width: 100vw !important;
    height: 100dvh !important;
    overflow: visible !important;
    pointer-events: none !important;
    --bew-page-max-width: 100vw;
    --bew-top-bar-height: 60px;
    --bew-base-font-size: 14px;
  }

  :host([data-bewly-mobile-userscript="true"]) #bewly-wrapper {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    overflow: visible;
    pointer-events: none;
  }

  :host([data-bewly-mobile-userscript="true"]) #bewly-wrapper.mobile-userscript .bewly-scroll-viewport,
  :host([data-bewly-mobile-userscript="true"]) #bewly-wrapper.mobile-userscript .bewly-settings {
    pointer-events: auto;
  }

  @media (max-width: 900px) {
    .bewly-wrapper {
      max-width: 100vw;
      overflow-x: hidden;
    }

    .settings {
      max-width: 100vw;
    }
  }
`

export const MOBILE_VIDEO_DETAIL_FRAME_CSS = `
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] :is(
    #playerWrap,
    .player-wrap,
    #bilibili-player,
    #bilibiliPlayer,
    .bpx-player-container,
    .bpx-player-primary-area,
    .bpx-player-video-area,
    .bpx-player-video-wrap,
    .bilibili-player-video-wrap,
    .bilibili-player-video-area,
    .mplayer,
    .mplayer-container,
    .squirtle-video-wrap,
    .squirtle-video-player,
    [class*="player"],
    [class*="Player"]
  ) {
    overflow: visible !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"] {
    position: fixed !important;
    top: var(--bewly-mobile-player-fixed-top, 0px) !important;
    right: 0 !important;
    left: 0 !important;
    z-index: 2147482500 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    margin: 0 !important;
    background: #000 !important;
    overflow: hidden !important;
    isolation: isolate !important;
    touch-action: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"][data-bewly-mobile-frame-web-fullscreen="true"],
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"][data-bewly-mobile-frame-web-fullscreen="true"] body {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    margin: 0 !important;
    background: #000 !important;
    overflow: hidden !important;
    overscroll-behavior: none !important;
    touch-action: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"][data-bewly-mobile-frame-web-fullscreen-lock="true"],
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-web-fullscreen-lock="true"] {
    width: 100vw !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: 100dvh !important;
    overflow: hidden !important;
    overscroll-behavior: none !important;
    touch-action: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"][data-bewly-mobile-frame-web-fullscreen="true"] {
    position: fixed !important;
    inset: 0 !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    z-index: 2147483100 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    border-radius: 0 !important;
    background: #000 !important;
    isolation: isolate !important;
    overflow: hidden !important;
    touch-action: none !important;
    transform: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"][data-bewly-mobile-frame-web-fullscreen="true"] :is(
    .bpx-player-container,
    .bpx-player-primary-area,
    .bpx-player-video-area,
    .bpx-player-video-wrap,
    .bilibili-player-video-wrap,
    .bilibili-player-video-area,
    .mplayer,
    .mplayer-container,
    .squirtle-video-wrap,
    .squirtle-video-player
  ) {
    width: 100% !important;
    max-width: 100vw !important;
    height: 100% !important;
    max-height: 100dvh !important;
    margin: 0 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"][data-bewly-mobile-frame-web-fullscreen="true"] video {
    width: 100% !important;
    height: 100% !important;
    max-width: 100vw !important;
    max-height: 100dvh !important;
    object-fit: contain !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-spacer="true"] {
    display: block !important;
    flex: 0 0 auto !important;
    order: 9 !important;
    width: 100% !important;
    height: calc(var(--bewly-mobile-player-fixed-height) + 10px) !important;
    min-height: calc(var(--bewly-mobile-player-fixed-height) + 10px) !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-home="true"] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-native-duplicate-control="true"],
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-native-viewer-source="true"],
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] :is(
    .bpx-player-control-wrap,
    .bpx-player-control-bottom,
    .bilibili-player-video-control,
    .bilibili-player-video-control-bottom,
    .bpx-player-dm-setting,
    .bpx-player-dm-switch,
    .bpx-player-ctrl-danmaku,
    .bili-mini,
    .bili-mini-mask,
    .mplayer-danmaku,
    .mplayer-danmaku-btn,
    .mplayer-danmaku-switch,
    .mplayer-danmaku-setting,
    .bpx-player-sending-bar,
    .bpx-player-video-inputbar,
    .bpx-player-video-inputbar *,
    .bpx-player-video-inputbar-wrap,
    .bpx-player-dm-hint,
    .bpx-player-dm-btn-send,
    .bpx-player-sending-area,
    .bilibili-player-video-sendbar,
    .squirtle-controller,
    .mplayer-control,
    .mplayer-controller,
    .mplayer-control-bar,
    [class*="danmu" i][class*="switch" i],
    [class*="danmu" i][class*="setting" i],
    [class*="danmu" i][class*="toggle" i],
    [class*="danmu" i][class*="btn" i],
    [class*="danmu" i][class*="button" i],
    [class*="danmaku" i][class*="switch" i],
    [class*="danmaku" i][class*="setting" i],
    [class*="danmaku" i][class*="toggle" i],
    [class*="danmaku" i][class*="btn" i],
    [class*="danmaku" i][class*="button" i],
    [class*="barrage" i][class*="switch" i],
    [class*="barrage" i][class*="setting" i],
    [class*="barrage" i][class*="toggle" i],
    [class*="barrage" i][class*="btn" i],
    [class*="barrage" i][class*="button" i],
    [class*="dm" i][class*="switch" i],
    [class*="dm" i][class*="setting" i],
    [class*="dm" i][class*="toggle" i],
    [class*="dm" i][class*="btn" i],
    [class*="dm" i][class*="button" i],
    #bilibili-player-placeholder-bottom,
    #bilibili-player-placeholder-bottom-left,
    #bilibili-player-placeholder-bottom-right,
    #bilibili-player-placeholder-bottom *,
    #bilibili-player-placeholder-bottom-left *,
    #bilibili-player-placeholder-bottom-right *
  ),
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"] :is(
    .bpx-player-control-wrap,
    .bpx-player-control-bottom,
    .bilibili-player-video-control,
    .bilibili-player-video-control-bottom,
    .bpx-player-dm-setting,
    .bpx-player-dm-switch,
    .bpx-player-ctrl-danmaku,
    .mplayer-danmaku,
    .mplayer-danmaku-btn,
    .mplayer-danmaku-switch,
    .mplayer-danmaku-setting,
    .bpx-player-sending-bar,
    .bpx-player-video-inputbar,
    .bpx-player-video-inputbar *,
    .bpx-player-video-inputbar-wrap,
    .bpx-player-dm-wrap,
    .bpx-player-dm-hint,
    .bpx-player-dm-btn-send,
    .bpx-player-sending-area,
    .bilibili-player-video-sendbar,
    .bpx-player-ctrl-back,
    .bpx-player-video-btn-back,
    .bilibili-player-video-btn-back,
    .squirtle-back,
    .squirtle-controller,
    .mplayer-control,
    .mplayer-controller,
    .mplayer-control-bar,
    [class*="player"][class*="back" i],
    [class*="back" i][class*="player"],
    [class*="control" i][class*="bottom" i],
    [class*="control" i][class*="bar" i],
    [class*="controller" i],
    [class*="danmu" i][class*="switch" i],
    [class*="danmu" i][class*="setting" i],
    [class*="danmu" i][class*="toggle" i],
    [class*="danmu" i][class*="btn" i],
    [class*="danmu" i][class*="button" i],
    [class*="danmaku" i][class*="switch" i],
    [class*="danmaku" i][class*="setting" i],
    [class*="danmaku" i][class*="toggle" i],
    [class*="danmaku" i][class*="btn" i],
    [class*="danmaku" i][class*="button" i],
    [class*="barrage" i][class*="switch" i],
    [class*="barrage" i][class*="setting" i],
    [class*="barrage" i][class*="toggle" i],
    [class*="barrage" i][class*="btn" i],
    [class*="barrage" i][class*="button" i],
    [class*="dm" i][class*="switch" i],
    [class*="dm" i][class*="setting" i],
    [class*="dm" i][class*="toggle" i],
    [class*="dm" i][class*="btn" i],
    [class*="dm" i][class*="button" i],
    #bilibili-player-placeholder-bottom,
    #bilibili-player-placeholder-bottom-left,
    #bilibili-player-placeholder-bottom-right,
    #bilibili-player-placeholder-bottom *,
    #bilibili-player-placeholder-bottom-left *,
    #bilibili-player-placeholder-bottom-right *
  ) {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
    background: transparent !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-danmaku-hidden] :is(
    .bpx-player-row-dm-wrap,
    .bpx-player-dm-wrap,
    .bpx-player-dm-root,
    .bilibili-player-video-danmaku,
    .bilibili-player-video-danmaku-root,
    .squirtle-danmaku,
    [class*="danmaku"],
    [class*="danmu"]
  ) {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"] {
    position: absolute !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    top: 0 !important;
    z-index: 30 !important;
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    overflow: hidden !important;
    border: 0 !important;
    border-radius: 0 !important;
    pointer-events: none !important;
    touch-action: manipulation !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"][data-bewly-mobile-frame-player-detached] {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-scrim="true"] {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483001 !important;
    display: block !important;
    width: 100vw !important;
    height: 100dvh !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: rgba(0, 0, 0, 0.58) !important;
    pointer-events: auto !important;
    touch-action: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-scrim="true"][hidden] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-topbar="true"] {
    position: absolute !important;
    top: 0 !important;
    right: 0 !important;
    left: 0 !important;
    z-index: 2 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto !important;
    align-items: center !important;
    gap: clamp(7px, 2.1vw, 12px) !important;
    min-height: clamp(46px, 8.4dvh, 58px) !important;
    padding: max(clamp(7px, 1.6dvh, 10px), env(safe-area-inset-top, 0px)) max(clamp(10px, 3vw, 16px), env(safe-area-inset-right, 0px)) clamp(12px, 3dvh, 18px) max(clamp(10px, 3vw, 16px), env(safe-area-inset-left, 0px)) !important;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.76), rgba(0, 0, 0, 0.44) 64%, transparent) !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-title="true"] {
    min-width: 0 !important;
    overflow: hidden !important;
    color: rgba(255, 255, 255, 0.94) !important;
    font: 650 clamp(13px, 3.8vw, 16px) / 1.2 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 10px rgba(0, 0, 0, 0.45) !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-viewers="true"] {
    justify-self: end !important;
    max-width: 34vw !important;
    min-width: 0 !important;
    overflow: hidden !important;
    padding: clamp(5px, 1.4dvh, 7px) clamp(8px, 2.3vw, 11px) !important;
    border-radius: 999px !important;
    background: rgba(8, 10, 14, 0.46) !important;
    color: rgba(255, 255, 255, 0.94) !important;
    font: 650 clamp(11px, 3.2vw, 13px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
    text-overflow: ellipsis !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65) !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-viewers="true"][hidden] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-mainbar="true"] {
    position: absolute !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    z-index: 2 !important;
    display: grid !important;
    align-items: center !important;
    gap: clamp(6px, 1.6vw, 9px) !important;
    grid-template-areas: "play progress danmaku fullscreen" !important;
    grid-template-columns: auto minmax(0, 1fr) auto auto !important;
    min-height: clamp(58px, 10dvh, 72px) !important;
    padding: clamp(16px, 4dvh, 24px) max(clamp(8px, 2.4vw, 12px), env(safe-area-inset-right, 0px)) max(clamp(8px, 2.2dvh, 14px), env(safe-area-inset-bottom, 0px)) max(clamp(8px, 2.4vw, 12px), env(safe-area-inset-left, 0px)) !important;
    width: 100% !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0.42) 70%, transparent) !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"] [data-bewly-mobile-frame-player-topbar="true"],
  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"] [data-bewly-mobile-frame-player-mainbar="true"] {
    transition: opacity 180ms cubic-bezier(0.2, 0, 0, 1), transform 180ms cubic-bezier(0.2, 0, 0, 1) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"]:not([data-bewly-mobile-frame-player-controls-visible]):not([data-bewly-mobile-frame-player-sheet-open]) [data-bewly-mobile-frame-player-topbar="true"] {
    opacity: 0 !important;
    transform: translateY(-8px) !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"]:not([data-bewly-mobile-frame-player-controls-visible]):not([data-bewly-mobile-frame-player-sheet-open]) [data-bewly-mobile-frame-player-mainbar="true"] {
    opacity: 0 !important;
    transform: translateY(10px) !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"] :is(button, [role="button"]) {
    display: inline-grid !important;
    min-width: clamp(34px, 9.4vw, 44px) !important;
    height: clamp(32px, 6.2dvh, 42px) !important;
    padding: 0 clamp(6px, 1.8vw, 9px) !important;
    place-items: center !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: rgba(8, 10, 14, 0.46) !important;
    color: rgba(255, 255, 255, 0.96) !important;
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.24) !important;
    font: 750 clamp(12px, 3.3vw, 14px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
    white-space: nowrap !important;
    pointer-events: auto !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"] :is(button, [role="button"]):active {
    background: rgba(20, 24, 32, 0.88) !important;
    transform: scale(0.96) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-time="true"] {
    flex: 0 0 auto !important;
    min-width: max-content !important;
    color: rgba(255, 255, 255, 0.92) !important;
    font: 650 clamp(11px, 3vw, 13px) / 1.1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85) !important;
    white-space: nowrap !important;
    text-align: left !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-progress-wrap="true"] {
    display: grid !important;
    align-items: center !important;
    grid-area: progress !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    min-width: 0 !important;
    gap: clamp(6px, 1.7vw, 8px) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-action="play-toggle"] {
    position: relative !important;
    z-index: 5 !important;
    display: grid !important;
    grid-area: play !important;
    place-items: center !important;
    width: clamp(40px, 10.8vw, 46px) !important;
    min-width: 0 !important;
    height: clamp(40px, 7.8dvh, 46px) !important;
    padding: 0 !important;
    opacity: 1 !important;
    background: rgba(10, 12, 16, 0.72) !important;
    color: rgba(255, 255, 255, 0.96) !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35) !important;
    font-size: clamp(17px, 4.5vw, 22px) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-volume-hud="true"] {
    position: absolute !important;
    top: 50% !important;
    right: max(clamp(12px, 3.4vw, 20px), env(safe-area-inset-right, 0px)) !important;
    z-index: 32 !important;
    padding: clamp(8px, 2.2vw, 10px) clamp(12px, 3.4vw, 16px) !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: rgba(8, 10, 14, 0.72) !important;
    color: rgba(255, 255, 255, 0.96) !important;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.34) !important;
    font: 750 clamp(12px, 3.4vw, 15px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
    opacity: 0 !important;
    pointer-events: none !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65) !important;
    transform: translateY(-50%) !important;
    transition: opacity 140ms cubic-bezier(0.2, 0, 0, 1) !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-action="danmaku"] {
    grid-area: danmaku !important;
    flex: 0 0 clamp(32px, 8.4vw, 36px) !important;
    width: clamp(36px, 9.6vw, 42px) !important;
    min-width: 0 !important;
    height: clamp(36px, 7.2dvh, 42px) !important;
    padding: 0 !important;
    font-size: clamp(16px, 4.2vw, 20px) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-action="fullscreen"] {
    grid-area: fullscreen !important;
    flex: 0 0 clamp(32px, 8.4vw, 36px) !important;
    width: clamp(36px, 9.6vw, 42px) !important;
    min-width: 0 !important;
    height: clamp(36px, 7.2dvh, 42px) !important;
    padding: 0 !important;
    font-size: clamp(17px, 4.5vw, 22px) !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-progress="true"] {
    width: 100% !important;
    min-width: 0 !important;
    height: clamp(18px, 4dvh, 24px) !important;
    accent-color: #fb7299 !important;
    touch-action: pan-x !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-actions="true"] {
    position: fixed !important;
    right: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    z-index: 2147483002 !important;
    display: grid !important;
    gap: 0 !important;
    max-height: min(68dvh, 560px) !important;
    padding: 10px max(16px, env(safe-area-inset-right, 0px)) max(18px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    border: 0 !important;
    border-radius: 18px 18px 0 0 !important;
    background: #171a21 !important;
    color: #f4f6f8 !important;
    box-shadow: 0 -18px 42px rgba(0, 0, 0, 0.42) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    pointer-events: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-actions="true"][hidden] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-sheet-handle="true"] {
    justify-self: center !important;
    width: clamp(36px, 12vw, 52px) !important;
    height: 5px !important;
    margin: 0 0 14px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.24) !important;
    cursor: grab !important;
    touch-action: none !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-sheet-title="true"] {
    padding: 0 0 10px !important;
    color: #f4f6f8 !important;
    font: 750 clamp(15px, 4.2vw, 18px) / 1.2 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-setting-row="true"] {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center !important;
    gap: clamp(12px, 3.5vw, 18px) !important;
    min-height: clamp(54px, 9.5dvh, 66px) !important;
    padding: 0 0 0 clamp(12px, 3.6vw, 18px) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.09) !important;
    background: #1d222a !important;
    color: #f4f6f8 !important;
    font: 650 clamp(14px, 3.9vw, 16px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-setting-row="true"]:first-of-type {
    border-radius: 12px 12px 0 0 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-setting-row="true"]:last-child {
    border-bottom: 0 !important;
    border-radius: 0 0 12px 12px !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-speed-group="true"] {
    min-width: 0 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-speed-menu="true"] {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 0 !important;
    min-width: 0 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-speed-menu="true"] button {
    width: 100% !important;
    min-width: 0 !important;
    height: clamp(40px, 7dvh, 48px) !important;
    padding: 0 !important;
    border: 0 !important;
    border-right: 1px solid rgba(255, 255, 255, 0.10) !important;
    border-radius: 0 !important;
    background: transparent !important;
    color: #b9c0ca !important;
    box-shadow: none !important;
    font: 700 clamp(12px, 3.5vw, 14px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-speed-menu="true"] button:last-child {
    border-right: 0 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-speed-option][data-bewly-mobile-frame-player-selected] {
    background: transparent !important;
    color: #fb7299 !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-setting-row="true"] > button {
    justify-self: end !important;
    min-width: clamp(64px, 18vw, 86px) !important;
    height: clamp(34px, 6.2dvh, 42px) !important;
    margin-right: clamp(10px, 3vw, 16px) !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: #2a303a !important;
    color: #c7ced8 !important;
    font: 750 clamp(12px, 3.5vw, 14px) / 1 system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-setting-row="true"] > button[data-bewly-mobile-frame-player-active] {
    background: #fb7299 !important;
    color: #fff !important;
  }

  html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-action="danmaku"][data-bewly-mobile-frame-player-active] {
    color: #fb7299 !important;
  }

`

export const MOBILE_VIDEO_DETAIL_CSS = `
  html[data-bewly-mobile-video-detail="true"] {
    color-scheme: dark;
    background: #0f1115 !important;
    --bewly-mobile-detail-bg: #0f1115;
    --bewly-mobile-detail-bg-soft: #141820;
    --bewly-mobile-detail-surface: #171a21;
    --bewly-mobile-detail-elevated: #1d222a;
    --bewly-mobile-detail-elevated-2: #242a34;
    --bewly-mobile-detail-text: #f4f6f8;
    --bewly-mobile-detail-text-muted: #b9c0ca;
    --bewly-mobile-detail-text-subtle: #8f98a6;
    --bewly-mobile-detail-border: rgba(255, 255, 255, 0.12);
    --bewly-mobile-detail-separator: rgba(255, 255, 255, 0.08);
    --bewly-mobile-detail-accent: #fb7299;
    --bewly-mobile-comment-text: #e8ecf2;
    --bewly-mobile-comment-name: #f4f6f8;
    --bewly-mobile-comment-muted: #a7b0bd;
    --bewly-mobile-comment-link: #5bc8f4;
    --bewly-mobile-login-bg: #fff;
    --bewly-mobile-login-text: #18191c;
    --bewly-mobile-login-muted: #6f7682;
    --bewly-mobile-login-subtle: #8d96a3;
    --bewly-mobile-login-placeholder: #9aa2ad;
    --bewly-mobile-login-border: rgba(24, 25, 28, 0.12);
    --bewly-mobile-login-border-strong: rgba(251, 114, 153, 0.45);
    --bewly-mobile-login-field-bg: #f7f8fa;
    --bewly-mobile-login-accent: #fb7299;
    --bewly-mobile-detail-inline-pad: clamp(8px, 2.8vw, 16px);
    --bewly-mobile-detail-radius: clamp(14px, 4vw, 20px);
    --bewly-mobile-player-fixed-top: env(safe-area-inset-top, 0px);
    --bewly-mobile-player-fixed-height: min(calc(100vw * 9 / 16), calc(42dvh - env(safe-area-inset-top, 0px)));
    --bewly-mobile-player-flow-offset: 0px;
    --bewly-mobile-detail-action-left: var(--bewly-mobile-detail-inline-pad);
    --bewly-mobile-detail-toolbar-left: 0px;
    --bewly-mobile-detail-toolbar-gap: clamp(4px, 1.2vw, 8px);
    --bewly-mobile-detail-comment-min: clamp(82px, 28vw, 112px);
    --bewly-mobile-detail-comment-max: clamp(118px, 42vw, 172px);
    --bewly-mobile-detail-action-min: clamp(36px, 11vw, 44px);
    --bewly-mobile-detail-action-max: clamp(44px, 14vw, 58px);
    --bewly-mobile-detail-author-avatar: clamp(34px, 11vw, 40px);
    --bewly-mobile-detail-author-card-height: clamp(50px, 9dvh, 56px);
    --bewly-mobile-detail-author-button-width: clamp(92px, 30vw, 118px);
    --bewly-mobile-detail-author-button-height: clamp(28px, 5.8dvh, 32px);
    --bewly-mobile-detail-author-control-min: clamp(38px, 11vw, 42px);
    --bewly-mobile-detail-author-follow-min: clamp(52px, 16vw, 58px);
    --bewly-mobile-detail-author-charge-min: clamp(42px, 14vw, 46px);
    --bewly-mobile-login-drawer-max-height: min(86dvh, calc(100dvh - env(safe-area-inset-top, 0px)));
    --bewly-mobile-login-drawer-pad-top: clamp(22px, 4.8dvh, 26px);
    --bewly-mobile-login-drawer-pad-inline: clamp(14px, 4vw, 16px);
    --bewly-mobile-login-drawer-pad-bottom: clamp(16px, 3dvh, 18px);
    --bewly-mobile-login-drag-height: clamp(38px, 6dvh, 44px);
    --bewly-mobile-login-drag-width: clamp(38px, 12vw, 48px);
    --bewly-mobile-login-drag-thickness: clamp(4px, 1.2vw, 5px);
    --bewly-mobile-login-control-size: clamp(28px, 8vw, 32px);
    --bewly-mobile-detail-shadow: none;
  }

  html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-media-orientation="portrait"] {
    --bewly-mobile-player-fixed-height: min(calc(100vw * 16 / 9), calc(82dvh - env(safe-area-inset-top, 0px)));
  }

  html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-media-orientation="square"] {
    --bewly-mobile-player-fixed-height: min(100vw, calc(58dvh - env(safe-area-inset-top, 0px)));
  }

  html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] {
    --bewly-mobile-player-fixed-top: 0px;
    --bewly-mobile-player-flow-offset: 0px;
    --bewly-mobile-detail-action-left: var(--bewly-mobile-detail-inline-pad);
    --bewly-mobile-detail-toolbar-left: 0px;
    --bewly-mobile-detail-toolbar-gap: clamp(4px, 1vw, 6px);
    --bewly-mobile-detail-comment-min: clamp(76px, 25vw, 96px);
    --bewly-mobile-detail-comment-max: clamp(104px, 38vw, 146px);
    --bewly-mobile-detail-action-min: clamp(34px, 10vw, 40px);
    --bewly-mobile-detail-action-max: clamp(42px, 13vw, 52px);
  }

  html[data-bewly-mobile-video-detail="true"],
  html[data-bewly-mobile-video-detail="true"] body {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    min-height: 100% !important;
    margin: 0 !important;
    overflow-x: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] body {
    background: var(--bewly-mobile-detail-bg) !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 14px !important;
    -webkit-font-smoothing: antialiased;
    scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
  }

  html[data-bewly-mobile-video-detail="true"] #bewly {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] *,
  html[data-bewly-mobile-video-detail="true"] *::before,
  html[data-bewly-mobile-video-detail="true"] *::after {
    box-sizing: border-box !important;
  }

  html[data-bewly-mobile-video-detail="true"] #biliMainHeader,
  html[data-bewly-mobile-video-detail="true"] .bili-header,
  html[data-bewly-mobile-video-detail="true"] .bili-header__bar,
  html[data-bewly-mobile-video-detail="true"] #internationalHeader,
  html[data-bewly-mobile-video-detail="true"] .link-navbar,
  html[data-bewly-mobile-video-detail="true"] #home_nav,
  html[data-bewly-mobile-video-detail="true"] #bili-header-container,
  html[data-bewly-mobile-video-detail="true"] .m-head,
  html[data-bewly-mobile-video-detail="true"] .m-navbar,
  html[data-bewly-mobile-video-detail="true"] .open-app,
  html[data-bewly-mobile-video-detail="true"] .m-open-app,
  html[data-bewly-mobile-video-detail="true"] .m-float-openapp,
  html[data-bewly-mobile-video-detail="true"] .launch-app-btn,
  html[data-bewly-mobile-video-detail="true"] .download-app {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] #app,
  html[data-bewly-mobile-video-detail="true"] #i_cecream,
  html[data-bewly-mobile-video-detail="true"] #mirror-vdcon,
  html[data-bewly-mobile-video-detail="true"] .video-container,
  html[data-bewly-mobile-video-detail="true"] .video-container-v1,
  html[data-bewly-mobile-video-detail="true"] .video-page-container,
  html[data-bewly-mobile-video-detail="true"] .video-layout,
  html[data-bewly-mobile-video-detail="true"] .bili-wrapper,
  html[data-bewly-mobile-video-detail="true"] .bili-layout,
  html[data-bewly-mobile-video-detail="true"] .main-container {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: var(--bewly-mobile-detail-bg) !important;
  }

  html[data-bewly-mobile-video-detail="true"] #app,
  html[data-bewly-mobile-video-detail="true"] #i_cecream {
    display: flex !important;
    flex-direction: column !important;
    min-height: 100dvh !important;
    padding-top: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-container,
  html[data-bewly-mobile-video-detail="true"] .video-container-v1,
  html[data-bewly-mobile-video-detail="true"] .left-container,
  html[data-bewly-mobile-video-detail="true"] .left-container-v1,
  html[data-bewly-mobile-video-detail="true"] .left-container-under-player,
  html[data-bewly-mobile-video-detail="true"] .video-left-container,
  html[data-bewly-mobile-video-detail="true"] .video-main,
  html[data-bewly-mobile-video-detail="true"] .media-left {
    display: flex !important;
    flex-direction: column !important;
  }

  html[data-bewly-mobile-video-detail="true"] .left-container.scroll-sticky,
  html[data-bewly-mobile-video-detail="true"] .left-container-v1.scroll-sticky,
  html[data-bewly-mobile-video-detail="true"] .left-container-under-player.scroll-sticky,
  html[data-bewly-mobile-video-detail="true"] .video-left-container.scroll-sticky {
    position: static !important;
    top: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .left-container,
  html[data-bewly-mobile-video-detail="true"] .left-container-v1,
  html[data-bewly-mobile-video-detail="true"] .left-container-under-player,
  html[data-bewly-mobile-video-detail="true"] .video-left-container,
  html[data-bewly-mobile-video-detail="true"] .video-main,
  html[data-bewly-mobile-video-detail="true"] .media-left {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 var(--bewly-mobile-detail-inline-pad) calc(18px + env(safe-area-inset-bottom, 0px)) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .right-container,
  html[data-bewly-mobile-video-detail="true"] .right-container-inner,
  html[data-bewly-mobile-video-detail="true"] .video-right-container {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .right-container .recommend-container,
  html[data-bewly-mobile-video-detail="true"] .right-container .recommend-list,
  html[data-bewly-mobile-video-detail="true"] .right-container .recommend-list-v1,
  html[data-bewly-mobile-video-detail="true"] .right-container .rec-list,
  html[data-bewly-mobile-video-detail="true"] .right-container .next-play,
  html[data-bewly-mobile-video-detail="true"] .right-container [class*="recommend"],
  html[data-bewly-mobile-video-detail="true"] .right-container [class*="Recommend"],
  html[data-bewly-mobile-video-detail="true"] .right-container [class*="rec-list"],
  html[data-bewly-mobile-video-detail="true"] .right-container [class*="video-card"],
  html[data-bewly-mobile-video-detail="true"] .right-container [class*="ad-"],
  html[data-bewly-mobile-video-detail="true"] .recommend-container,
  html[data-bewly-mobile-video-detail="true"] .recommend-list,
  html[data-bewly-mobile-video-detail="true"] .recommend-list-v1,
  html[data-bewly-mobile-video-detail="true"] .rec-list,
  html[data-bewly-mobile-video-detail="true"] .next-play,
  html[data-bewly-mobile-video-detail="true"] .video-card-ad-small,
  html[data-bewly-mobile-video-detail="true"] .video-card-ad,
  html[data-bewly-mobile-video-detail="true"] .video-page-special-card-small,
  html[data-bewly-mobile-video-detail="true"] .video-page-game-card-small,
  html[data-bewly-mobile-video-detail="true"] .video-page-operator-card,
  html[data-bewly-mobile-video-detail="true"] .video-page-card-small,
  html[data-bewly-mobile-video-detail="true"] .ad-floor-exp,
  html[data-bewly-mobile-video-detail="true"] .ad-floor-cover,
  html[data-bewly-mobile-video-detail="true"] .activity-card,
  html[data-bewly-mobile-video-detail="true"] .activity-m,
  html[data-bewly-mobile-video-detail="true"] .banner-card,
  html[data-bewly-mobile-video-detail="true"] .game-card,
  html[data-bewly-mobile-video-detail="true"] [data-card-type*="ad"],
  html[data-bewly-mobile-video-detail="true"] [data-card-type*="game"],
  html[data-bewly-mobile-video-detail="true"] [class*="GameCard"],
  html[data-bewly-mobile-video-detail="true"] [class*="game-card"],
  html[data-bewly-mobile-video-detail="true"] [class*="OperatorCard"],
  html[data-bewly-mobile-video-detail="true"] [class*="operator-card"],
  html[data-bewly-mobile-video-detail="true"] [class*="ad-floor"],
  html[data-bewly-mobile-video-detail="true"] [class*="banner-card"],
  html[data-bewly-mobile-video-detail="true"] .ad-report,
  html[data-bewly-mobile-video-detail="true"] a[href*="cm.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] img[alt*="投直播切片"],
  html[data-bewly-mobile-video-detail="true"] .fixed-sidenav-storage,
  html[data-bewly-mobile-video-detail="true"] .float-nav,
  html[data-bewly-mobile-video-detail="true"] .palette-button-wrap,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-detail-hidden-module="true"],
  html[data-bewly-mobile-video-detail="true"] #danmukuBox,
  html[data-bewly-mobile-video-detail="true"] #danmakuBox,
  html[data-bewly-mobile-video-detail="true"] .danmaku-box,
  html[data-bewly-mobile-video-detail="true"] .danmaku-list,
  html[data-bewly-mobile-video-detail="true"] .danmu-list,
  html[data-bewly-mobile-video-detail="true"] .dm-list,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-dm-list,
  html[data-bewly-mobile-video-detail="true"] .base-video-sections-v1,
  html[data-bewly-mobile-video-detail="true"] .video-sections-v1,
  html[data-bewly-mobile-video-detail="true"] .video-sections-container,
  html[data-bewly-mobile-video-detail="true"] .video-section-list,
  html[data-bewly-mobile-video-detail="true"] .video-pod,
  html[data-bewly-mobile-video-detail="true"] .video-pod__body,
  html[data-bewly-mobile-video-detail="true"] .video-pod__header,
  html[data-bewly-mobile-video-detail="true"] #multi_page,
  html[data-bewly-mobile-video-detail="true"] .multi-page,
  html[data-bewly-mobile-video-detail="true"] .anthology,
  html[data-bewly-mobile-video-detail="true"] .playlist-container,
  html[data-bewly-mobile-video-detail="true"] .series-container,
  html[data-bewly-mobile-video-detail="true"] .video-series {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] #playerWrap,
  html[data-bewly-mobile-video-detail="true"] .player-wrap,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-container,
  html[data-bewly-mobile-video-detail="true"] #bilibili-player,
  html[data-bewly-mobile-video-detail="true"] #bilibiliPlayer {
    order: 10 !important;
    position: relative !important;
    z-index: 20 !important;
    width: 100vw !important;
    min-width: 0 !important;
    max-width: 100vw !important;
    margin: 0 calc(50% - 50vw) 10px !important;
    background: #000 !important;
    border: 0 !important;
    border-radius: 0 !important;
    overflow: hidden !important;
    pointer-events: auto !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"] {
    order: 8 !important;
    position: sticky !important;
    top: var(--bewly-mobile-player-fixed-top) !important;
    left: auto !important;
    right: auto !important;
    z-index: 2147482500 !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    margin: 0 calc(50% - 50vw) 10px !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    isolation: isolate !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"] :is(#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-docker, .bpx-player-container, .bpx-player-primary-area, .bpx-player-video-area, .bpx-player-video-wrap, .bilibili-player-video-wrap, .bilibili-player-video-area) {
    order: initial !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: inherit !important;
    box-shadow: none !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"] :is(video, canvas) {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
    object-position: center center !important;
  }

  html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-player-card="true"] {
    position: sticky !important;
    top: 0 !important;
    left: auto !important;
    right: auto !important;
    width: 100vw !important;
    max-width: 100vw !important;
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    margin: 0 calc(50% - 50vw) 10px !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-crop-top="true"] {
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-crop-top="true"] > * {
    transform: translateY(calc(-1 * var(--bewly-mobile-player-crop-offset, 0px))) !important;
    transform-origin: top center !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-pre-player-hidden="true"] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] #playerWrap,
  html[data-bewly-mobile-video-detail="true"] .player-wrap {
    aspect-ratio: 16 / 9 !important;
    height: auto !important;
    min-height: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"]:is(#playerWrap, .player-wrap) {
    aspect-ratio: auto !important;
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    min-height: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"] :is(#playerWrap, .player-wrap) {
    aspect-ratio: auto !important;
    height: 100% !important;
    max-height: 100% !important;
    min-height: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-primary-area,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-video-area,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-video-wrap,
  html[data-bewly-mobile-video-detail="true"] .bilibili-player-video-wrap,
  html[data-bewly-mobile-video-detail="true"] .bilibili-player-video-area {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container video,
  html[data-bewly-mobile-video-detail="true"] .bilibili-player video {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
    object-position: center center !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-info-container,
  html[data-bewly-mobile-video-detail="true"] #viewbox_report,
  html[data-bewly-mobile-video-detail="true"] .media-info,
  html[data-bewly-mobile-video-detail="true"] .media-info-container {
    order: 20 !important;
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 4px !important;
    padding: 0 4px !important;
    color: var(--bewly-mobile-detail-text) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-info-title,
  html[data-bewly-mobile-video-detail="true"] .video-info-title h1,
  html[data-bewly-mobile-video-detail="true"] h1.video-title,
  html[data-bewly-mobile-video-detail="true"] .video-title,
  html[data-bewly-mobile-video-detail="true"] #viewbox_report .title,
  html[data-bewly-mobile-video-detail="true"] [class*="mediainfo_mediaTitle"] {
    width: 100% !important;
    max-width: 100% !important;
    margin: 3px 0 8px !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 17px !important;
    font-weight: 650 !important;
    line-height: 1.34 !important;
    letter-spacing: 0 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-info-title h1,
  html[data-bewly-mobile-video-detail="true"] h1.video-title,
  html[data-bewly-mobile-video-detail="true"] #viewbox_report .title {
    display: -webkit-box !important;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-data,
  html[data-bewly-mobile-video-detail="true"] .video-info-detail-list,
  html[data-bewly-mobile-video-detail="true"] .video-info-meta,
  html[data-bewly-mobile-video-detail="true"] .pubdate,
  html[data-bewly-mobile-video-detail="true"] .copyright,
  html[data-bewly-mobile-video-detail="true"] .view,
  html[data-bewly-mobile-video-detail="true"] .dm {
    color: var(--bewly-mobile-detail-text-muted) !important;
    font-size: 12px !important;
    line-height: 1.45 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-data,
  html[data-bewly-mobile-video-detail="true"] .video-info-detail-list,
  html[data-bewly-mobile-video-detail="true"] .video-info-meta {
    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;
    gap: 5px 8px !important;
    margin: 0 0 7px !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-panel-container,
  html[data-bewly-mobile-video-detail="true"] .up-info-container,
  html[data-bewly-mobile-video-detail="true"] .up-info,
  html[data-bewly-mobile-video-detail="true"] .upinfo,
  html[data-bewly-mobile-video-detail="true"] .members-info-container,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container {
    order: 24 !important;
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 3px 0 6px !important;
    padding: 4px !important;
    display: flex !important;
    align-items: center !important;
    flex-wrap: wrap !important;
    gap: 6px 10px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] {
    order: 24 !important;
    position: relative !important;
    z-index: 1 !important;
    margin: 3px 0 6px !important;
    display: grid !important;
    grid-template-columns: var(--bewly-mobile-detail-author-avatar) minmax(0, 1fr) auto !important;
    grid-auto-rows: min-content !important;
    align-items: center !important;
    column-gap: clamp(8px, 2.6vw, 10px) !important;
    row-gap: 2px !important;
    min-height: var(--bewly-mobile-detail-author-card-height) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] {
    position: relative !important;
    transform: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > * {
    position: static !important;
    transform: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > img,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > picture,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:first-child {
    grid-column: 1 !important;
    grid-row: 1 / span 2 !important;
    align-self: center !important;
    justify-self: center !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] :is(.up-detail, .up-detail-top, .up-info-text, .staff-info, .video-staffs-info, .up-info--left, .up-info-right),
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:not(:first-child) {
    grid-column: 2 !important;
    grid-row: 1 / span 2 !important;
    min-width: 0 !important;
    width: auto !important;
    align-self: center !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] :is(.up-detail, .up-info-text, .staff-info, .video-staffs-info, .up-info--left, .up-info-right) {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    gap: 3px !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] :is(.upinfo-btn-panel, .follow-btn, .follow-button, .btn-follow, .not-follow, .new-charge-btn) {
    grid-column: 3 !important;
    grid-row: 1 / span 2 !important;
    align-self: center !important;
    justify-self: end !important;
    margin-left: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-panel-container .up-info-container,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .up-info,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .upinfo,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .up-info-container,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .up-info,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .upinfo,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .staff-info {
    width: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-info--left,
  html[data-bewly-mobile-video-detail="true"] .up-info-right,
  html[data-bewly-mobile-video-detail="true"] .up-detail,
  html[data-bewly-mobile-video-detail="true"] .up-detail-top,
  html[data-bewly-mobile-video-detail="true"] .up-detail-bottom,
  html[data-bewly-mobile-video-detail="true"] .up-description,
  html[data-bewly-mobile-video-detail="true"] .up-info-text,
  html[data-bewly-mobile-video-detail="true"] .staff-info,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-info,
  html[data-bewly-mobile-video-detail="true"] .up-info-container,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container {
    min-width: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-detail,
  html[data-bewly-mobile-video-detail="true"] .up-detail-top,
  html[data-bewly-mobile-video-detail="true"] .up-info--left,
  html[data-bewly-mobile-video-detail="true"] .up-info-right,
  html[data-bewly-mobile-video-detail="true"] .up-info-text,
  html[data-bewly-mobile-video-detail="true"] .staff-info,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-info {
    flex: 1 1 150px !important;
    max-width: 100% !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-panel-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] .up-info-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] .up-info :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] .upinfo :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] .members-info-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar),
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) {
    flex: 0 0 var(--bewly-mobile-detail-author-avatar) !important;
    width: var(--bewly-mobile-detail-author-avatar) !important;
    height: var(--bewly-mobile-detail-author-avatar) !important;
    min-width: var(--bewly-mobile-detail-author-avatar) !important;
    border-radius: 50% !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > img,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > picture,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:first-child,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:first-child img {
    flex: 0 0 var(--bewly-mobile-detail-author-avatar) !important;
    width: var(--bewly-mobile-detail-author-avatar) !important;
    height: var(--bewly-mobile-detail-author-avatar) !important;
    min-width: var(--bewly-mobile-detail-author-avatar) !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    object-fit: cover !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:not(:first-child) {
    flex: 1 1 calc(100% - var(--bewly-mobile-detail-author-avatar) - clamp(14px, 4vw, 18px)) !important;
    width: auto !important;
    min-width: 0 !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    line-height: 1.28 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-panel-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img,
  html[data-bewly-mobile-video-detail="true"] .up-info-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img,
  html[data-bewly-mobile-video-detail="true"] .up-info :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img,
  html[data-bewly-mobile-video-detail="true"] .upinfo :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img,
  html[data-bewly-mobile-video-detail="true"] .members-info-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container :is(.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar) img {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-name,
  html[data-bewly-mobile-video-detail="true"] .up-info-name,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .name,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .info-name,
  html[data-bewly-mobile-video-detail="true"] .up-info-container .name,
  html[data-bewly-mobile-video-detail="true"] .up-info-container .info-name,
  html[data-bewly-mobile-video-detail="true"] .up-info .name,
  html[data-bewly-mobile-video-detail="true"] .up-info .info-name,
  html[data-bewly-mobile-video-detail="true"] .upinfo .name,
  html[data-bewly-mobile-video-detail="true"] .upinfo .info-name,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .name,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .info-name,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .name,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .info-name,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] .up-info-container a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] .up-info a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] .upinfo a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] .members-info-container a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container a[href*="space.bilibili.com"] {
    max-width: 100% !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 14px !important;
    font-weight: 650 !important;
    line-height: 1.35 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .up-description,
  html[data-bewly-mobile-video-detail="true"] .up-info-desc,
  html[data-bewly-mobile-video-detail="true"] .up-detail-bottom,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .desc,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .info-desc,
  html[data-bewly-mobile-video-detail="true"] .up-panel-container .official,
  html[data-bewly-mobile-video-detail="true"] .up-info-container .desc,
  html[data-bewly-mobile-video-detail="true"] .up-info-container .info-desc,
  html[data-bewly-mobile-video-detail="true"] .up-info-container .official,
  html[data-bewly-mobile-video-detail="true"] .up-info .desc,
  html[data-bewly-mobile-video-detail="true"] .up-info .info-desc,
  html[data-bewly-mobile-video-detail="true"] .up-info .official,
  html[data-bewly-mobile-video-detail="true"] .upinfo .desc,
  html[data-bewly-mobile-video-detail="true"] .upinfo .info-desc,
  html[data-bewly-mobile-video-detail="true"] .upinfo .official,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .desc,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .info-desc,
  html[data-bewly-mobile-video-detail="true"] .members-info-container .official,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .desc,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .info-desc,
  html[data-bewly-mobile-video-detail="true"] .video-staffs-container .official {
    color: var(--bewly-mobile-detail-text-muted) !important;
    font-size: 12px !important;
    line-height: 1.5 !important;
    max-width: 100% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .upinfo-btn-panel,
  html[data-bewly-mobile-video-detail="true"] .follow-btn,
  html[data-bewly-mobile-video-detail="true"] .follow-button,
  html[data-bewly-mobile-video-detail="true"] .btn-follow {
    margin-left: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .follow-btn,
  html[data-bewly-mobile-video-detail="true"] .follow-button,
  html[data-bewly-mobile-video-detail="true"] .btn-follow,
  html[data-bewly-mobile-video-detail="true"] .not-follow,
  html[data-bewly-mobile-video-detail="true"] .new-charge-btn {
    min-height: 34px !important;
    min-width: 62px !important;
    padding: 0 11px !important;
    border-radius: 999px !important;
    font-weight: 650 !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] a[href*="message.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] .new-charge-btn,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] .charge-btn-loaded {
    display: none !important;
    min-height: 32px !important;
    padding: 0 12px !important;
    align-items: center !important;
    justify-content: center !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 999px !important;
    background: var(--bewly-mobile-detail-elevated) !important;
    color: var(--bewly-mobile-detail-text-muted) !important;
    font-size: 12px !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"] {
    position: relative !important;
    display: block !important;
    height: var(--bewly-mobile-detail-author-card-height) !important;
    min-height: var(--bewly-mobile-detail-author-card-height) !important;
    max-height: var(--bewly-mobile-detail-author-card-height) !important;
    margin: 2px 0 6px !important;
    padding: clamp(4px, 1.2dvh, 5px) clamp(3px, 1.2vw, 4px) !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-display-name]::before {
    content: attr(data-bewly-mobile-author-display-name);
    position: absolute !important;
    left: calc(var(--bewly-mobile-detail-author-avatar) + clamp(10px, 3vw, 12px)) !important;
    right: calc(var(--bewly-mobile-detail-author-button-width) + clamp(8px, 2vw, 12px)) !important;
    top: clamp(6px, 1.3dvh, 7px) !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 13px !important;
    font-weight: 750 !important;
    line-height: 16px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-residual="true"] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-avatar="true"] *,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"] *,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] * {
    position: static !important;
    inset: auto !important;
    float: none !important;
    transform: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"] [data-bewly-mobile-author-avatar="true"] {
    position: absolute !important;
    left: clamp(3px, 1.2vw, 4px) !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-avatar="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-avatar="true"] :is(img, picture, .bili-avatar, .avatar, .face, .up-avatar, .up-info-avatar, .up-cover, .staff-avatar) {
    width: var(--bewly-mobile-detail-author-avatar) !important;
    height: var(--bewly-mobile-detail-author-avatar) !important;
    min-width: var(--bewly-mobile-detail-author-avatar) !important;
    max-width: var(--bewly-mobile-detail-author-avatar) !important;
    min-height: var(--bewly-mobile-detail-author-avatar) !important;
    max-height: var(--bewly-mobile-detail-author-avatar) !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    object-fit: cover !important;
    display: block !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"] [data-bewly-mobile-author-info="true"] {
    position: absolute !important;
    left: calc(var(--bewly-mobile-detail-author-avatar) + clamp(10px, 3vw, 12px)) !important;
    right: calc(var(--bewly-mobile-detail-author-button-width) + clamp(8px, 2vw, 12px)) !important;
    top: calc(var(--bewly-mobile-detail-author-card-height) - clamp(20px, 3.8dvh, 22px)) !important;
    transform: translateY(-50%) !important;
    width: auto !important;
    height: 18px !important;
    min-width: 0 !important;
    max-height: 18px !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    gap: 1px !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"] > * {
    max-width: 100% !important;
    min-width: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-extra="true"] {
    display: block !important;
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"] a[href*="space.bilibili.com"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"] :is(.up-name, .up-info-name, .name, .info-name) {
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    line-height: 1.28 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-name="true"] {
    display: none !important;
    width: 100% !important;
    height: auto !important;
    min-height: 18px !important;
    opacity: 1 !important;
    visibility: visible !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 14px !important;
    font-weight: 750 !important;
    line-height: 1.28 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-description="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-info="true"] :is(.up-description, .up-info-desc, .up-detail-bottom, .desc, .info-desc, .official) {
    display: block !important;
    color: var(--bewly-mobile-detail-text-muted) !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"] [data-bewly-mobile-author-actions="true"] {
    position: absolute !important;
    right: clamp(3px, 1.2vw, 4px) !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: var(--bewly-mobile-detail-author-button-width) !important;
    max-width: var(--bewly-mobile-detail-author-button-width) !important;
    min-width: var(--bewly-mobile-detail-author-button-width) !important;
    height: var(--bewly-mobile-detail-author-button-height) !important;
    max-height: var(--bewly-mobile-detail-author-button-height) !important;
    display: flex !important;
    flex-flow: row nowrap !important;
    gap: 4px !important;
    align-items: center !important;
    justify-content: flex-end !important;
    overflow: visible !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"]:empty {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] .upinfo-btn-panel {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    display: flex !important;
    flex-flow: row nowrap !important;
    justify-content: flex-end !important;
    align-items: center !important;
    gap: 4px !important;
    overflow: visible !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] > :not(.upinfo-btn-panel),
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] .upinfo-btn-panel > *,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(button, a, .follow-btn, .follow-button, .btn-follow, .not-follow, .new-charge-btn) {
    flex: 0 0 auto !important;
    width: auto !important;
    max-width: none !important;
    min-width: var(--bewly-mobile-detail-author-control-min) !important;
    min-height: calc(var(--bewly-mobile-detail-author-button-height) - 2px) !important;
    height: calc(var(--bewly-mobile-detail-author-button-height) - 2px) !important;
    margin: 0 !important;
    padding: 0 clamp(7px, 2.4vw, 9px) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 999px !important;
    font-size: 11.5px !important;
    font-weight: 700 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    overflow: visible !important;
    text-overflow: clip !important;
    letter-spacing: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(.follow-btn, .follow-button, .btn-follow, .not-follow) {
    min-width: var(--bewly-mobile-detail-author-follow-min) !important;
    padding-inline: clamp(8px, 2.8vw, 10px) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(.new-charge-btn) {
    min-width: var(--bewly-mobile-detail-author-charge-min) !important;
    padding-inline: clamp(7px, 2.4vw, 9px) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(button, a, .follow-btn, .follow-button, .btn-follow, .not-follow, .new-charge-btn) * {
    max-width: none !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] #arc_toolbar_report,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-container {
    order: 56 !important;
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    min-height: clamp(42px, 7dvh, 52px) !important;
    height: auto !important;
    margin: 6px 0 8px !important;
    padding: 0 4px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: var(--bewly-mobile-detail-toolbar-gap) !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    scrollbar-width: none !important;
    pointer-events: auto !important;
    touch-action: pan-x manipulation !important;
    -webkit-overflow-scrolling: touch !important;
  }

  html[data-bewly-mobile-video-detail="true"] #arc_toolbar_report::-webkit-scrollbar,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-container::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-back-hidden="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-comment-entry="true"] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-comment-entry="true"] {
    flex: 1 1 138px !important;
    min-width: var(--bewly-mobile-detail-comment-min) !important;
    max-width: var(--bewly-mobile-detail-comment-max) !important;
    height: 46px !important;
    margin: 0 !important;
    padding: 0 12px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.075) !important;
    color: var(--bewly-mobile-detail-text) !important;
    font: inherit !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
    -webkit-tap-highlight-color: transparent !important;
    pointer-events: auto !important;
    touch-action: manipulation !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-comment-entry="true"]::before {
    content: "";
    width: 16px !important;
    height: 13px !important;
    display: inline-block !important;
    flex: 0 0 auto !important;
    border: 1.8px solid currentColor !important;
    border-radius: 5px !important;
    opacity: 0.88 !important;
    box-sizing: border-box !important;
    box-shadow: 5px 7px 0 -5px currentColor !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-comment-label="true"] {
    min-width: 0 !important;
    display: block !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 13px !important;
    line-height: 18px !important;
    font-weight: 650 !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-comment-entry="true"] {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-main {
    width: max-content !important;
    min-width: max-content !important;
    max-width: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    gap: var(--bewly-mobile-detail-toolbar-gap) !important;
    flex-wrap: nowrap !important;
    flex: 0 0 auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-item,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right-item,
  html[data-bewly-mobile-video-detail="true"] .toolbar-left-item-wrap > .video-toolbar-left-item {
    flex: 0 0 auto !important;
    width: auto !important;
    min-width: var(--bewly-mobile-detail-action-min) !important;
    max-width: none !important;
    height: clamp(40px, 6.6dvh, 48px) !important;
    min-height: clamp(40px, 6.6dvh, 48px) !important;
    margin: 0 !important;
    padding: 0 clamp(5px, 1.8vw, 8px) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: 0 !important;
    border-radius: 16px !important;
    background: transparent !important;
    color: var(--bewly-mobile-detail-text) !important;
    box-shadow: none !important;
    pointer-events: auto !important;
    -webkit-tap-highlight-color: transparent !important;
    transition: background-color 160ms ease, transform 160ms ease !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-item:active,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right-item:active,
  html[data-bewly-mobile-video-detail="true"] .toolbar-left-item-wrap > .video-toolbar-left-item:active {
    transform: scale(0.94) !important;
    background: rgba(255, 255, 255, 0.08) !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.video-toolbar-left-item, .video-toolbar-right-item, .toolbar-left-item-wrap > .video-toolbar-left-item):is(.on, .active, .is-active, .selected, .is-selected, .actived, .video-toolbar-left-item-active),
  html[data-bewly-mobile-video-detail="true"] :is(.video-toolbar-left-item, .video-toolbar-right-item, .toolbar-left-item-wrap > .video-toolbar-left-item)[aria-pressed="true"] {
    background: rgba(0, 161, 214, 0.14) !important;
    color: var(--bewly-mobile-detail-accent) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-item-text,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-item .text,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right-item .text {
    max-width: clamp(36px, 12vw, 56px) !important;
    min-width: 0 !important;
    display: block !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    color: inherit !important;
    font-size: 11px !important;
    line-height: 1.15 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask {
    position: fixed !important;
    inset: 0 !important;
    z-index: 2147483500 !important;
    width: 100vw !important;
    height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    align-items: flex-end !important;
    justify-content: center !important;
    overflow: hidden !important;
    background: rgba(0, 0, 0, 0.56) !important;
    backdrop-filter: blur(10px) saturate(1.08) !important;
    -webkit-backdrop-filter: blur(10px) saturate(1.08) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp {
    position: relative !important;
    inset: auto !important;
    left: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    flex: 0 0 auto !important;
    width: 100vw !important;
    min-width: 0 !important;
    max-width: 100vw !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: var(--bewly-mobile-login-drawer-max-height) !important;
    margin: 0 !important;
    padding: var(--bewly-mobile-login-drawer-pad-top) max(var(--bewly-mobile-login-drawer-pad-inline), env(safe-area-inset-right, 0px)) calc(var(--bewly-mobile-login-drawer-pad-bottom) + env(safe-area-inset-bottom, 0px)) max(var(--bewly-mobile-login-drawer-pad-inline), env(safe-area-inset-left, 0px)) !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 16px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    border: 1px solid rgba(24, 25, 28, 0.08) !important;
    border-bottom: 0 !important;
    border-radius: var(--bewly-mobile-detail-radius) var(--bewly-mobile-detail-radius) 0 0 !important;
    background: var(--bewly-mobile-login-bg) !important;
    color: var(--bewly-mobile-login-text) !important;
    box-shadow: 0 -18px 42px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
    scrollbar-width: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-drawer="true"] {
    padding-top: calc(var(--bewly-mobile-login-drag-height) + clamp(4px, 1dvh, 6px)) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp:is([data-bewly-mobile-login-dragging="true"], [data-bewly-mobile-login-settling="true"], [data-bewly-mobile-login-closing="true"]) {
    will-change: transform !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp::-webkit-scrollbar {
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp::before {
    content: "";
    position: absolute !important;
    top: 9px !important;
    left: 50% !important;
    width: var(--bewly-mobile-login-drag-width) !important;
    height: var(--bewly-mobile-login-drag-thickness) !important;
    border-radius: 999px !important;
    background: rgba(24, 25, 28, 0.2) !important;
    transform: translateX(-50%) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-drawer="true"]::before {
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask [data-bewly-mobile-login-drag-handle="true"] {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 2 !important;
    width: 100% !important;
    height: var(--bewly-mobile-login-drag-height) !important;
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
    border: 0 !important;
    background: transparent !important;
    cursor: grab !important;
    touch-action: none !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask [data-bewly-mobile-login-drag-handle="true"]::before {
    content: "" !important;
    position: absolute !important;
    top: clamp(12px, 2.4dvh, 14px) !important;
    left: 50% !important;
    width: var(--bewly-mobile-login-drag-width) !important;
    height: var(--bewly-mobile-login-drag-thickness) !important;
    border-radius: 999px !important;
    background: rgba(24, 25, 28, 0.22) !important;
    transform: translateX(-50%) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-dragging="true"] [data-bewly-mobile-login-drag-handle="true"] {
    cursor: grabbing !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-close-icon {
    position: absolute !important;
    top: 12px !important;
    right: max(12px, env(safe-area-inset-right, 0px)) !important;
    z-index: 4 !important;
    width: 40px !important;
    height: 40px !important;
    margin: 0 !important;
    border-radius: 50% !important;
    border: 1px solid rgba(24, 25, 28, 0.08) !important;
    background: rgba(24, 25, 28, 0.08) !important;
    color: var(--bewly-mobile-login-muted) !important;
    font-size: 0 !important;
    line-height: 0 !important;
    opacity: 1 !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-close-icon::before {
    content: "\\00d7" !important;
    position: absolute !important;
    inset: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: var(--bewly-mobile-login-muted) !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    font-size: 25px !important;
    line-height: 1 !important;
    font-weight: 500 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-line {
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-wp,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-login-right-wp,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-agreement-wp {
    position: relative !important;
    inset: auto !important;
    left: auto !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-login-right-wp {
    order: 1 !important;
    flex-direction: column !important;
    align-items: stretch !important;
    padding-top: 10px !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .bili-mini-login-right-wp[data-bewly-mobile-login-methods="true"] {
    display: flex !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-tab-wp {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 0 18px !important;
    display: flex !important;
    justify-content: center !important;
    gap: 0 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-tab-item {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    max-width: 150px !important;
    text-align: center !important;
    color: var(--bewly-mobile-login-subtle) !important;
    font-size: 18px !important;
    line-height: 24px !important;
    font-weight: 650 !important;
    opacity: 1 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-tab-item.active-tab {
    color: var(--bewly-mobile-login-accent) !important;
    font-weight: 750 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-tab-item:not(.active-tab) {
    color: var(--bewly-mobile-login-subtle) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-tab-line {
    background: var(--bewly-mobile-login-border-strong) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask :is(.login-pwd-wp, .login-sms-wp, .tab__form, .form__item, .btn_wp, .login-sns-wp) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sns-wp {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask :is(input, button, .btn_primary, .btn_other) {
    max-width: 100% !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .tab__form {
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    align-content: start !important;
    row-gap: 10px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    outline: 0 !important;
    overflow: visible !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .tab__form::before,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .tab__form::after {
    content: none !important;
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item {
    height: 50px !important;
    min-height: 50px !important;
    max-height: 50px !important;
    margin: 0 !important;
    padding: 0 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 0 !important;
    border: 1px solid var(--bewly-mobile-login-border) !important;
    border-radius: 14px !important;
    background: var(--bewly-mobile-login-field-bg) !important;
    box-shadow: none !important;
    outline: 0 !important;
    overflow: hidden !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item + .form__item {
    margin-top: 0 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item::before,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item::after {
    content: none !important;
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item:focus-within {
    border-color: var(--bewly-mobile-login-border-strong) !important;
    background: #fff !important;
    box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.1) !important;
    outline: 0 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > :is(.form_info, .login-sms-wp__cid),
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > div:first-child:not(.eye-btn):not(.clickable):not(.forget-tip):not(.login-sms-wp__vertical-line):not(.login-sms-send) {
    flex: 0 0 60px !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    color: var(--bewly-mobile-login-muted) !important;
    font-size: 14px !important;
    line-height: 20px !important;
    font-weight: 600 !important;
    opacity: 1 !important;
    white-space: nowrap !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > .eye-btn {
    flex: 0 0 var(--bewly-mobile-login-control-size) !important;
    width: var(--bewly-mobile-login-control-size) !important;
    height: var(--bewly-mobile-login-control-size) !important;
    margin: 0 0 0 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: var(--bewly-mobile-login-subtle) !important;
    opacity: 1 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > .eye-btn.eye-btn.eye-btn {
    flex-basis: var(--bewly-mobile-login-control-size) !important;
    width: var(--bewly-mobile-login-control-size) !important;
    min-width: var(--bewly-mobile-login-control-size) !important;
    max-width: var(--bewly-mobile-login-control-size) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > .clickable {
    flex: 0 0 auto !important;
    margin-left: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: var(--bewly-mobile-login-accent) !important;
    font-size: 13px !important;
    line-height: 18px !important;
    white-space: nowrap !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > .forget-tip {
    display: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item > .forget-tip.forget-tip.forget-tip {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item input {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: 0 !important;
    height: 50px !important;
    min-height: 50px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    outline: none !important;
    background: transparent !important;
    color: var(--bewly-mobile-login-text) !important;
    font-size: 15px !important;
    line-height: 50px !important;
    caret-color: var(--bewly-mobile-login-accent) !important;
    box-shadow: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .form__item input::placeholder {
    color: var(--bewly-mobile-login-placeholder) !important;
    opacity: 1 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sms-wp__cid {
    flex: 0 0 62px !important;
    height: 50px !important;
    gap: 7px !important;
    cursor: pointer !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sms-wp__cid img {
    position: static !important;
    width: 12px !important;
    height: 12px !important;
    margin: 1px 0 0 !important;
    opacity: 0.78 !important;
    filter: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sms-wp__vertical-line {
    flex: 0 0 1px !important;
    width: 1px !important;
    height: 24px !important;
    margin: 0 10px !important;
    background: var(--bewly-mobile-login-border) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sms-send {
    flex: 0 0 auto !important;
    min-width: 86px !important;
    height: 34px !important;
    padding: 0 10px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 10px !important;
    color: var(--bewly-mobile-login-accent) !important;
    background: rgba(251, 114, 153, 0.1) !important;
    font-size: 13px !important;
    line-height: 18px !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-sms-send.disable {
    color: #aeb4be !important;
    background: rgba(24, 25, 28, 0.05) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .btn_wp {
    margin-top: 14px !important;
    display: flex !important;
    gap: 10px !important;
    justify-content: stretch !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask :is(.btn_primary, .btn_other) {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 14px !important;
    font-size: 15px !important;
    line-height: 20px !important;
    font-weight: 700 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .btn_primary {
    color: #fff !important;
    background: linear-gradient(135deg, #fb7299, #ff8aae) !important;
    box-shadow: 0 10px 22px rgba(251, 114, 153, 0.24) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .btn_other {
    color: var(--bewly-mobile-login-accent) !important;
    background: rgba(251, 114, 153, 0.1) !important;
    border: 1px solid rgba(251, 114, 153, 0.22) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-wp {
    order: 2 !important;
    display: none !important;
    grid-template-columns: 106px minmax(0, 1fr) !important;
    grid-template-areas: "title title" "qr desc" !important;
    align-items: center !important;
    gap: 10px 12px !important;
    padding: 13px !important;
    border: 1px solid var(--bewly-mobile-login-border) !important;
    border-radius: 18px !important;
    background: var(--bewly-mobile-login-field-bg) !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-title {
    grid-area: title !important;
    width: auto !important;
    margin: 0 !important;
    text-align: left !important;
    color: var(--bewly-mobile-login-text) !important;
    font-size: 15px !important;
    line-height: 20px !important;
    font-weight: 700 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-box {
    grid-area: qr !important;
    width: 106px !important;
    height: 106px !important;
    min-width: 106px !important;
    min-height: 106px !important;
    margin: 0 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp:hover,
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp:hover .login-scan-box {
    transform: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp > :not(.login-scan-box),
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-hover-wp :is(.scan-tips-icon, .login-client-qr-code, .login-icon, .login-scan-tips, .qrcode-tips) {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    width: 0 !important;
    height: 0 !important;
    pointer-events: none !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-box > div:not(.login_qrcode_tip),
  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-box > img {
    width: 96px !important;
    height: 96px !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login_qrcode_tip {
    inset: 0 !important;
    width: 106px !important;
    height: 106px !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login_qrcode_tip img {
    width: 34px !important;
    height: 34px !important;
    max-width: 34px !important;
    max-height: 34px !important;
    object-fit: contain !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login_qrcode_tip span {
    max-width: 92px !important;
    color: rgba(31, 35, 41, 0.66) !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
    text-align: center !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-desc {
    grid-area: desc !important;
    width: auto !important;
    margin: 0 !important;
    color: var(--bewly-mobile-login-muted) !important;
    text-align: left !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-agreement-wp {
    order: 3 !important;
    color: var(--bewly-mobile-login-muted) !important;
    text-align: center !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
    opacity: 1 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-agreement-wp p {
    margin: 0 !important;
    color: var(--bewly-mobile-login-muted) !important;
    opacity: 1 !important;
  }

  :is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-agreement-wp :is(a, span) {
    color: var(--bewly-mobile-login-accent) !important;
    font-weight: 650 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .desc-info,
  html[data-bewly-mobile-video-detail="true"] .basic-desc-info,
  html[data-bewly-mobile-video-detail="true"] .video-desc-container,
  html[data-bewly-mobile-video-detail="true"] .video-desc,
  html[data-bewly-mobile-video-detail="true"] .desc-v2,
  html[data-bewly-mobile-video-detail="true"] #v_desc {
    order: 50 !important;
    width: 100% !important;
    max-width: 100% !important;
    max-height: 76px !important;
    margin: 6px 0 0 !important;
    padding: 0 4px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 13px !important;
    line-height: 1.55 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    overflow: hidden !important;
    position: relative !important;
    z-index: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.desc-info, .basic-desc-info, .video-desc-container, .video-desc, .desc-v2, #v_desc) > :not(a):not(button) {
    min-height: 0 !important;
    max-width: 100% !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-expand-control="true"] {
    order: 54 !important;
    min-height: 26px !important;
    margin: -1px 0 6px !important;
    padding: 0 4px !important;
    display: inline-flex !important;
    align-items: center !important;
    align-self: flex-start !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--bewly-mobile-detail-text-muted) !important;
    font-size: 12px !important;
    line-height: 18px !important;
    font-weight: 600 !important;
    -webkit-tap-highlight-color: rgba(255, 255, 255, 0.08) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-context-chip="true"] {
    order: 56 !important;
    max-width: 100% !important;
    min-height: 24px !important;
    margin: -1px 0 7px !important;
    padding: 0 4px !important;
    display: inline-flex !important;
    align-items: center !important;
    align-self: flex-start !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--bewly-mobile-detail-text-subtle) !important;
    font-size: 12px !important;
    line-height: 18px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(div, section, a):has(> [data-bewly-mobile-context-chip="true"]) {
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .tag-area,
  html[data-bewly-mobile-video-detail="true"] #v_tag,
  html[data-bewly-mobile-video-detail="true"] .video-tag-container {
    order: 60 !important;
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    position: relative !important;
    z-index: 1 !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain !important;
    scrollbar-width: none !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .tag-area::-webkit-scrollbar,
  html[data-bewly-mobile-video-detail="true"] #v_tag::-webkit-scrollbar,
  html[data-bewly-mobile-video-detail="true"] .video-tag-container::-webkit-scrollbar {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) > :not(:is(a, button, .tag-link, .tag, .video-tag)) {
    display: contents !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) :is(.tag-link, .tag, .video-tag):has(:is(.tag-link, .tag, .video-tag)) {
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) :is(a[href], .tag-link, .tag, .video-tag):not(:has(:is(.tag-link, .tag, .video-tag))) {
    flex: 0 0 auto !important;
    min-height: 26px !important;
    margin: 0 !important;
    padding: 3px 9px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.035) !important;
    color: var(--bewly-mobile-detail-text-subtle) !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    font-size: 11px !important;
    line-height: 16px !important;
    font-weight: 500 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) [data-bewly-mobile-tag-chevron="true"] {
    padding-right: 7px !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) [data-bewly-mobile-tag-chevron="true"]::after {
    content: "";
    width: 5px !important;
    height: 5px !important;
    margin-left: 2px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-right: 1.5px solid var(--bewly-mobile-detail-text-muted) !important;
    border-bottom: 1.5px solid var(--bewly-mobile-detail-text-muted) !important;
    transform: rotate(-45deg) translateY(-0.5px) !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) [data-bewly-mobile-tag-more="true"] {
    flex: 0 0 30px !important;
    width: 30px !important;
    min-width: 30px !important;
    max-width: 30px !important;
    height: 26px !important;
    min-height: 26px !important;
    max-height: 26px !important;
    margin: 0 !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: 1px solid rgba(255, 255, 255, 0.04) !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.035) !important;
    box-shadow: none !important;
    color: var(--bewly-mobile-detail-text-subtle) !important;
    font-size: 0 !important;
    line-height: 0 !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) [data-bewly-mobile-tag-more="true"]::before {
    content: "";
    width: 6px !important;
    height: 6px !important;
    border-right: 1.6px solid currentColor !important;
    border-bottom: 1.6px solid currentColor !important;
    transform: translateY(-2px) rotate(45deg) !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(.tag-area, #v_tag, .video-tag-container) :is(a[href], .tag-link, .tag, .video-tag) > :not(svg):not(path) {
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: inherit !important;
    font: inherit !important;
    line-height: inherit !important;
  }

  html[data-bewly-mobile-video-detail="true"] #comment-module,
  html[data-bewly-mobile-video-detail="true"] #comment-body,
  html[data-bewly-mobile-video-detail="true"] #commentapp,
  html[data-bewly-mobile-video-detail="true"] bili-comments,
  html[data-bewly-mobile-video-detail="true"] .commentapp,
  html[data-bewly-mobile-video-detail="true"] .comment-container,
  html[data-bewly-mobile-video-detail="true"] .bili-comment-container,
  html[data-bewly-mobile-video-detail="true"] .bb-comment {
    order: 70 !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 8px 0 0 !important;
    padding-top: 10px !important;
    padding-bottom: 0 !important;
    min-height: 0 !important;
    border-top: 1px solid var(--bewly-mobile-detail-separator) !important;
    background: transparent !important;
    color: var(--bewly-mobile-detail-text) !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(
    .comment-list,
    .reply-list,
    .bili-comment-list,
    .list,
    .items,
    .reply-item,
    .comment-item,
    .bili-comment-item,
    .root-reply-container,
    .sub-reply-container,
    .sub-reply-item,
    .bb-comment-item,
    [class*="ReplyItem"],
    [class*="reply-item"],
    [class*="CommentItem"],
    [class*="comment-item"]
  ) {
    background: transparent !important;
    color: var(--bewly-mobile-comment-text) !important;
    border-color: var(--bewly-mobile-detail-separator) !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(
    .reply-content,
    .comment-content,
    .root-reply,
    .sub-reply,
    .rich-text,
    .content,
    .text,
    p,
    [class*="content"],
    [class*="Content"],
    [class*="text"],
    [class*="Text"]
  ) {
    color: var(--bewly-mobile-comment-text) !important;
    opacity: 1 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(
    .user-name,
    .nickname,
    .reply-name,
    .comment-name,
    .name,
    [class*="nickname"],
    [class*="Nickname"],
    [class*="nick-name"],
    [class*="user-name"],
    [class*="reply-name"]
  ) {
    color: var(--bewly-mobile-comment-name) !important;
    opacity: 1 !important;
    font-weight: 650 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(
    .reply-time,
    .comment-time,
    .time,
    .reply-like,
    .reply-dislike,
    .reply-btn,
    .operation,
    .comment-info,
    .sub-info,
    .info,
    [class*="time"],
    [class*="Time"],
    [class*="operation"],
    [class*="Operation"]
  ) {
    color: var(--bewly-mobile-comment-muted) !important;
    opacity: 1 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) a {
    color: var(--bewly-mobile-comment-link) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-comment-composer="true"],
  html[data-bewly-mobile-video-detail="true"] :is(.reply-box, .reply-box-wrap, .reply-box-warp, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .reply-textarea),
  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.reply-box, .reply-box-wrap, .reply-box-warp, .comment-box, .comment-input, .comment-input-wrapper, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .textarea-container, .reply-textarea, textarea),
  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(form, div, section):not(bili-comments):not(#comment-module):not(#comment-body):not(#commentapp):not(.commentapp):not(.comment-container):not(.bili-comment-container):not(.bb-comment):has(:is(textarea, input, [contenteditable="true"], [role="textbox"], [placeholder*="评论"], [placeholder*="发一条"], [class*="textarea"], [class*="input"], [class*="editor"])) {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-comment-composer-open="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-comment-composer-open="true"] :is(.reply-box, .reply-box-wrap, .reply-box-warp, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .reply-textarea, .comment-box, .comment-input, .comment-input-wrapper, .textarea-container, textarea, input, [contenteditable="true"], [role="textbox"]) {
    visibility: visible !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.no-more, .no-more-comment, .no-more-comments, .nomore, .end, .comment-end, .reply-end, .list-end, .bottom-page, .bili-comment-end) {
    min-height: 0 !important;
    margin: 10px 0 8px !important;
    padding: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.comment-list, .reply-list, .bili-comment-list, .list, .items) {
    padding-bottom: 0 !important;
    margin-bottom: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] a {
    color: inherit;
    -webkit-tap-highlight-color: rgba(0, 161, 214, 0.22);
  }

  html[data-bewly-mobile-video-detail="true"] img,
  html[data-bewly-mobile-video-detail="true"] video,
  html[data-bewly-mobile-video-detail="true"] canvas {
    max-width: 100% !important;
  }

  html[data-bewly-mobile-video-detail="true"] input,
  html[data-bewly-mobile-video-detail="true"] textarea,
  html[data-bewly-mobile-video-detail="true"] button {
    font: inherit;
  }
`
