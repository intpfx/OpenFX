const MOBILE_NATIVE_MANAGED_ATTR = 'data-bewly-mobile-native-managed'
const MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR = 'data-bewly-mobile-previous-aria-hidden'

let mobileNativeContentObserver: MutationObserver | undefined

function applyMobileNativeContentHidden(hidden: boolean): void {
  const body = document.body
  if (!body)
    return

  Array.from(body.children).forEach((child) => {
    if (!(child instanceof HTMLElement) || child.id === 'bewly')
      return

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

    const previousAriaHidden = child.getAttribute(MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR)
    if (previousAriaHidden !== null)
      child.setAttribute('aria-hidden', previousAriaHidden)
    else
      child.removeAttribute('aria-hidden')

    child.removeAttribute(MOBILE_NATIVE_PREVIOUS_ARIA_HIDDEN_ATTR)
    child.removeAttribute(MOBILE_NATIVE_MANAGED_ATTR)
    child.inert = false
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

interface GmOpenInTabOptions {
  active?: boolean
}

interface GmApi {
  openInTab?: (url: string, options?: boolean | GmOpenInTabOptions) => unknown
}

export const MOBILE_OPEN_IN_PAGE_EVENT = 'bewly-mobile-open-in-page'
export const MOBILE_LINK_MANAGED_ATTR = 'data-bewly-mobile-link-managed'
export const BILIBILI_LOGIN_URL = 'https://passport.bilibili.com/login'

function normalizeMobileNavigationUrl(url: string): string {
  return normalizeBilibiliUrlForCurrentSurface(url)
}

function shouldKeepMobileNavigationInCurrentTab(url: string = location.href): boolean {
  return isMobileUserscriptRuntimePage(url)
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

export function openBilibiliLoginPage(): void {
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
    if (!anchor.closest('#bewly'))
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
}

html[data-bewly-mobile="true"] body {
  background: var(--native-bg) !important;
}

html[data-bewly-mobile="true"]:not([data-bewly-mobile-page-kind="other"]):not([data-bewly-mobile-mounted="true"]) body > :not(#bewly) {
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

export function injectMobileNativeHeaderCSS(url: string = location.href): HTMLStyleElement | undefined {
  const style = document.createElement('style')
  style.textContent = MOBILE_NATIVE_HEADER_CSS
  document.documentElement.appendChild(style)
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
}

export const MOBILE_BILIBILI_HOST = 'm.bilibili.com'
export const DESKTOP_BILIBILI_HOST = 'www.bilibili.com'
export const SPACE_BILIBILI_HOST = 'space.bilibili.com'

export function isMobileBilibiliPage(url: string = location.href): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === MOBILE_BILIBILI_HOST
  }
  catch {
    return false
  }
}

export function isDesktopBilibiliPage(url: string = location.href): boolean {
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

export function classifyMobileBilibiliPage(url: string = location.href): MobileBilibiliPageKind {
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

export function classifyMobileTakeoverBilibiliPage(url: string = location.href): MobileBilibiliPageKind {
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

export function isMobileBilibiliHomePage(url: string = location.href): boolean {
  return classifyMobileBilibiliPage(url) === 'home'
}

export function isDesktopBilibiliHomePage(url: string = location.href): boolean {
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

export function shouldHideMobileNativeContentForPage(url: string = location.href): boolean {
  if (!isDesktopPortraitUserscriptRuntimePage(url))
    return false

  const mobilePageKind = classifyMobileTakeoverBilibiliPage(url)
  return mobilePageKind !== 'video' && mobilePageKind !== 'other'
}

export function isBilibiliVideoDetailPage(url: string = location.href): boolean {
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

export function isUserscriptRuntime(): boolean {
  return Boolean((globalThis as { __BEWLYSCRIPT__?: boolean }).__BEWLYSCRIPT__)
}

function hasNarrowMobileViewport(): boolean {
  if (typeof window === 'undefined')
    return false

  return window.innerWidth > 0 && window.innerWidth <= 700
}

function hasMobileUserscriptPageMarker(): boolean {
  if (typeof document === 'undefined')
    return false

  return document.documentElement.getAttribute('data-bewly-mobile') === 'true'
    || document.documentElement.getAttribute('data-bewly-mobile-mounted') === 'true'
    || Boolean(document.querySelector('[data-bewly-mobile-userscript="true"]'))
}

export function isDesktopPortraitUserscriptRuntimePage(url: string = location.href): boolean {
  if (!isDesktopBilibiliPage(url))
    return false
  if (!hasNarrowMobileViewport())
    return false

  const pageKind = classifyMobileTakeoverBilibiliPage(url)
  if (pageKind === 'other' && !isDesktopBilibiliHomePage(url))
    return false

  return isUserscriptRuntime() || hasMobileUserscriptPageMarker()
}

export function isMobileUserscriptRuntimePage(url: string = location.href): boolean {
  return isDesktopPortraitUserscriptRuntimePage(url)
}

export function shouldUseMobileVideoDetailLayout(url: string = location.href): boolean {
  return isBilibiliVideoDetailPage(url) && isDesktopBilibiliPage(url) && hasNarrowMobileViewport()
}

export function normalizeBilibiliUrlForCurrentSurface(targetUrl: string, currentUrl: string = location.href): string {
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

export function getBewlyUserscriptHomeUrl(page?: string, url: string = location.href): string {
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

export const MOBILE_VIDEO_DETAIL_CSS = `
  html[data-bewly-mobile-video-detail="true"] {
    color-scheme: dark;
    background: #101114 !important;
    --bewly-mobile-detail-bg: #101114;
    --bewly-mobile-detail-bg-soft: #121418;
    --bewly-mobile-detail-surface: #181a1f;
    --bewly-mobile-detail-elevated: #1c1f25;
    --bewly-mobile-detail-elevated-2: #242832;
    --bewly-mobile-detail-text: #f2f3f5;
    --bewly-mobile-detail-text-muted: #a9adb7;
    --bewly-mobile-detail-text-subtle: #7f8591;
    --bewly-mobile-detail-border: rgba(255, 255, 255, 0.08);
    --bewly-mobile-detail-separator: rgba(255, 255, 255, 0.065);
    --bewly-mobile-detail-accent: #00a1d6;
    --bewly-mobile-detail-inline-pad: 10px;
    --bewly-mobile-detail-radius: 16px;
    --bewly-mobile-player-fixed-top: env(safe-area-inset-top, 0px);
    --bewly-mobile-player-fixed-height: calc((100vw - (var(--bewly-mobile-detail-inline-pad) * 2)) * 9 / 16);
    --bewly-mobile-player-flow-offset: calc(var(--bewly-mobile-player-fixed-height) + var(--bewly-mobile-player-fixed-top) + 8px);
    --bewly-mobile-detail-action-left: var(--bewly-mobile-detail-inline-pad);
    --bewly-mobile-detail-toolbar-left: 0px;
    --bewly-mobile-detail-toolbar-gap: 6px;
    --bewly-mobile-detail-comment-min: 104px;
    --bewly-mobile-detail-comment-max: 172px;
    --bewly-mobile-detail-action-min: 42px;
    --bewly-mobile-detail-action-max: 58px;
    --bewly-mobile-detail-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
  }

  html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"] {
    --bewly-mobile-detail-action-left: var(--bewly-mobile-detail-inline-pad);
    --bewly-mobile-detail-toolbar-left: calc(74px + env(safe-area-inset-left, 0px));
    --bewly-mobile-detail-toolbar-gap: 5px;
    --bewly-mobile-detail-comment-min: 92px;
    --bewly-mobile-detail-comment-max: 146px;
    --bewly-mobile-detail-action-min: 38px;
    --bewly-mobile-detail-action-max: 52px;
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
    padding: var(--bewly-mobile-player-flow-offset) var(--bewly-mobile-detail-inline-pad) calc(62px + env(safe-area-inset-bottom, 0px)) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .right-container,
  html[data-bewly-mobile-video-detail="true"] .right-container-inner,
  html[data-bewly-mobile-video-detail="true"] .video-right-container {
    order: 42 !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 0 !important;
    background: transparent !important;
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
    width: calc(100vw - (var(--bewly-mobile-detail-inline-pad) * 2)) !important;
    min-width: 0 !important;
    max-width: calc(100vw - (var(--bewly-mobile-detail-inline-pad) * 2)) !important;
    margin: 2px auto 10px !important;
    background: #000 !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: var(--bewly-mobile-detail-radius) !important;
    overflow: hidden !important;
    pointer-events: auto !important;
    box-shadow: var(--bewly-mobile-detail-shadow) !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer)[data-bewly-mobile-player-card="true"] {
    order: 8 !important;
    position: fixed !important;
    top: var(--bewly-mobile-player-fixed-top) !important;
    left: var(--bewly-mobile-detail-inline-pad) !important;
    right: var(--bewly-mobile-detail-inline-pad) !important;
    z-index: 2147482500 !important;
    width: calc(100vw - (var(--bewly-mobile-detail-inline-pad) * 2)) !important;
    max-width: calc(100vw - (var(--bewly-mobile-detail-inline-pad) * 2)) !important;
    height: var(--bewly-mobile-player-fixed-height) !important;
    max-height: var(--bewly-mobile-player-fixed-height) !important;
    margin: 0 !important;
    isolation: isolate !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"] :is(#bilibili-player, #bilibiliPlayer, .bpx-docker, .bpx-player-container, .bpx-player-primary-area, .bpx-player-video-area, .bpx-player-video-wrap, .bilibili-player-video-wrap, .bilibili-player-video-area) {
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
    object-fit: cover !important;
    object-position: center center !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] {
    cursor: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-wrap {
    top: auto !important;
    bottom: 0 !important;
    z-index: 88 !important;
    width: 100% !important;
    height: 46px !important;
    overflow: visible !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-entity {
    display: block !important;
    width: 100% !important;
    height: 46px !important;
    margin: 0 !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom {
    display: flex !important;
    position: relative !important;
    z-index: 2 !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 6px !important;
    box-sizing: border-box !important;
    width: 100% !important;
    height: 46px !important;
    margin: 0 !important;
    padding: 0 8px !important;
    overflow: hidden !important;
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom-left,
  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom-right {
    min-width: 0 !important;
    height: 46px !important;
    display: flex !important;
    align-items: center !important;
    gap: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom-left {
    flex: 1 1 auto !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom-center {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-bottom-right {
    flex: 0 0 auto !important;
    max-width: fit-content !important;
    margin-left: auto !important;
    overflow: visible !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] :is(.bpx-player-ctrl-prev, .bpx-player-ctrl-next, .bpx-player-ctrl-viewpoint, .bpx-player-ctrl-eplist, .bpx-player-ctrl-setting, .bpx-player-ctrl-pip, .bpx-player-ctrl-wide, .bpx-player-ctrl-web) {
    display: none !important;
    visibility: hidden !important;
    flex: 0 0 0 !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] :is(.bpx-player-ctrl-play, .bpx-player-ctrl-time, .bpx-player-ctrl-quality, .bpx-player-ctrl-playbackrate, .bpx-player-ctrl-volume, .bpx-player-ctrl-full) {
    flex: 0 0 auto !important;
    margin: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-ctrl-time {
    max-width: 92px !important;
    padding: 0 2px !important;
    overflow: hidden !important;
    color: rgba(255, 255, 255, 0.92) !important;
    font-size: 11px !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-control-mask {
    display: block !important;
    bottom: 0 !important;
    z-index: 1 !important;
    width: 100% !important;
    height: 76px !important;
    opacity: 0.58 !important;
    pointer-events: none !important;
  }

  @media (max-width: 380px) {
    html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] .bpx-player-ctrl-time {
      width: 42px !important;
      max-width: 42px !important;
    }

    html[data-bewly-mobile-video-detail="true"] .bpx-player-container[data-bewly-mobile-player-controls-visible="true"] :is(.bpx-player-ctrl-time-divide, .bpx-player-ctrl-time-duration, .bpx-player-ctrl-quality) {
      display: none !important;
    }
  }

  html[data-bewly-mobile-video-detail="true"] .bpx-player-sending-bar,
  html[data-bewly-mobile-video-detail="true"] .bilibili-player-video-sendbar,
  html[data-bewly-mobile-video-detail="true"] .bilibili-player-video-inputbar {
    display: none !important;
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
    grid-template-columns: 40px minmax(0, 1fr) auto !important;
    grid-auto-rows: min-content !important;
    align-items: center !important;
    column-gap: 10px !important;
    row-gap: 2px !important;
    min-height: 56px !important;
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
    flex: 0 0 40px !important;
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    border-radius: 50% !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > img,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > picture,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:first-child,
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:first-child img {
    flex: 0 0 40px !important;
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    object-fit: cover !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] > a[href*="space.bilibili.com"]:not(:first-child) {
    flex: 1 1 calc(100% - 58px) !important;
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

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"] a[href*="message.bilibili.com"] {
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
    height: 56px !important;
    min-height: 56px !important;
    max-height: 56px !important;
    margin: 2px 0 6px !important;
    padding: 5px 4px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-display-name]::before {
    content: attr(data-bewly-mobile-author-display-name);
    position: absolute !important;
    left: 52px !important;
    right: 126px !important;
    top: 7px !important;
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
    left: 4px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-avatar="true"],
  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-avatar="true"] :is(img, picture, .bili-avatar, .avatar, .face, .up-avatar, .up-info-avatar, .up-cover, .staff-avatar) {
    width: 40px !important;
    height: 40px !important;
    min-width: 40px !important;
    max-width: 40px !important;
    min-height: 40px !important;
    max-height: 40px !important;
    border-radius: 50% !important;
    overflow: hidden !important;
    object-fit: cover !important;
    display: block !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"] [data-bewly-mobile-author-info="true"] {
    position: absolute !important;
    left: 52px !important;
    right: 126px !important;
    top: 34px !important;
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
    right: 4px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    width: 118px !important;
    max-width: 118px !important;
    min-width: 118px !important;
    height: 32px !important;
    max-height: 32px !important;
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
    min-width: 42px !important;
    min-height: 30px !important;
    height: 30px !important;
    margin: 0 !important;
    padding: 0 9px !important;
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
    min-width: 58px !important;
    padding-inline: 10px !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(.new-charge-btn) {
    min-width: 46px !important;
    padding-inline: 9px !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-author-actions="true"] :is(button, a, .follow-btn, .follow-button, .btn-follow, .not-follow, .new-charge-btn) * {
    max-width: none !important;
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] #arc_toolbar_report,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-container {
    order: 30 !important;
    position: fixed !important;
    left: var(--bewly-mobile-detail-toolbar-left) !important;
    right: 0 !important;
    bottom: 0 !important;
    z-index: 2147483000 !important;
    width: auto !important;
    min-width: 0 !important;
    min-height: calc(62px + env(safe-area-inset-bottom, 0px)) !important;
    height: auto !important;
    margin: 0 !important;
    padding: 8px var(--bewly-mobile-detail-inline-pad) calc(8px + env(safe-area-inset-bottom, 0px)) var(--bewly-mobile-detail-action-left) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: var(--bewly-mobile-detail-toolbar-gap) !important;
    overflow-x: hidden !important;
    overflow-y: hidden !important;
    border: 0 !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 18px 18px 0 0 !important;
    background: rgba(19, 21, 26, 0.94) !important;
    box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.24) !important;
    backdrop-filter: blur(22px) saturate(1.18) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.18) !important;
    overscroll-behavior-x: contain !important;
    scrollbar-width: none;
  }

  html[data-bewly-mobile-video-detail="true"] #arc_toolbar_report::-webkit-scrollbar,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-container::-webkit-scrollbar {
    display: none;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-video-back="true"] {
    order: -10 !important;
    position: relative !important;
    flex: 0 0 46px !important;
    width: 46px !important;
    height: 46px !important;
    min-width: 46px !important;
    min-height: 46px !important;
    margin: 0 !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.075) !important;
    color: #fff !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
    font-size: 0 !important;
    line-height: 0 !important;
    -webkit-tap-highlight-color: transparent !important;
    pointer-events: auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-video-back="true"]::before {
    content: "";
    width: 10px !important;
    height: 10px !important;
    margin-left: 3px !important;
    display: block !important;
    border-left: 2px solid currentColor !important;
    border-bottom: 2px solid currentColor !important;
    transform: rotate(45deg) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-video-back="true"]:active {
    transform: scale(0.94) !important;
    background: rgba(255, 255, 255, 0.12) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-toolbar-action-hidden="true"],
  html[data-bewly-mobile-video-detail="true"] #arc_toolbar_report .video-toolbar-right,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-container .video-toolbar-right {
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

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-main {
    width: auto !important;
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 4px !important;
    flex-wrap: nowrap !important;
    flex: 0 0 auto !important;
  }

  html[data-bewly-mobile-video-detail="true"] .video-toolbar-left-item,
  html[data-bewly-mobile-video-detail="true"] .video-toolbar-right-item,
  html[data-bewly-mobile-video-detail="true"] .toolbar-left-item-wrap > .video-toolbar-left-item {
    flex: 1 1 48px !important;
    width: auto !important;
    min-width: var(--bewly-mobile-detail-action-min) !important;
    max-width: var(--bewly-mobile-detail-action-max) !important;
    height: 46px !important;
    padding: 0 5px !important;
    border: 0 !important;
    border-radius: 16px !important;
    background: transparent !important;
    color: var(--bewly-mobile-detail-text) !important;
    box-shadow: none !important;
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
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask {
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

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp {
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
    max-height: min(86dvh, 720px) !important;
    margin: 0 !important;
    padding: 26px max(16px, env(safe-area-inset-right, 0px)) calc(18px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)) !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 16px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-bottom: 0 !important;
    border-radius: 24px 24px 0 0 !important;
    background: var(--bewly-mobile-detail-elevated) !important;
    color: var(--bewly-mobile-detail-text) !important;
    box-shadow: 0 -18px 42px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important;
    scrollbar-width: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-drawer="true"] {
    padding-top: 48px !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp:is([data-bewly-mobile-login-dragging="true"], [data-bewly-mobile-login-settling="true"], [data-bewly-mobile-login-closing="true"]) {
    will-change: transform !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp::-webkit-scrollbar {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp::before {
    content: "";
    position: absolute !important;
    top: 9px !important;
    left: 50% !important;
    width: 42px !important;
    height: 4px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.24) !important;
    transform: translateX(-50%) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-drawer="true"]::before {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask [data-bewly-mobile-login-drag-handle="true"] {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 2 !important;
    width: 100% !important;
    height: 44px !important;
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

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask [data-bewly-mobile-login-drag-handle="true"]::before {
    content: "" !important;
    position: absolute !important;
    top: 14px !important;
    left: 50% !important;
    width: 48px !important;
    height: 5px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.26) !important;
    transform: translateX(-50%) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-content-wp[data-bewly-mobile-login-dragging="true"] [data-bewly-mobile-login-drag-handle="true"] {
    cursor: grabbing !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-close-icon {
    position: absolute !important;
    top: 12px !important;
    right: max(12px, env(safe-area-inset-right, 0px)) !important;
    z-index: 4 !important;
    width: 34px !important;
    height: 34px !important;
    margin: 0 !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: var(--bewly-mobile-detail-text) !important;
    -webkit-tap-highlight-color: transparent !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-line {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-wp,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-login-right-wp,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-agreement-wp {
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

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-login-right-wp {
    order: 1 !important;
    flex-direction: column !important;
    align-items: stretch !important;
    padding-top: 10px !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .bili-mini-login-right-wp[data-bewly-mobile-login-methods="true"] {
    display: flex !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-tab-wp {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 0 18px !important;
    display: flex !important;
    justify-content: center !important;
    gap: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-tab-item {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    max-width: 150px !important;
    text-align: center !important;
    color: rgba(242, 243, 245, 0.76) !important;
    font-size: 18px !important;
    line-height: 24px !important;
    font-weight: 700 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-tab-item.active-tab {
    color: var(--bewly-mobile-detail-accent) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-tab-line {
    background: rgba(255, 255, 255, 0.14) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask :is(.login-pwd-wp, .login-sms-wp, .tab__form, .form__item, .btn_wp, .login-sns-wp) {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask :is(input, button, .btn_primary, .btn_other) {
    max-width: 100% !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .tab__form {
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

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .tab__form::before,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .tab__form::after {
    content: none !important;
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item {
    height: 50px !important;
    min-height: 50px !important;
    max-height: 50px !important;
    margin: 0 !important;
    padding: 0 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 0 !important;
    border: 0 !important;
    border-radius: 14px !important;
    background: rgba(255, 255, 255, 0.055) !important;
    box-shadow: none !important;
    outline: 0 !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item + .form__item {
    margin-top: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item::before,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item::after {
    content: none !important;
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item:focus-within {
    background: rgba(255, 255, 255, 0.075) !important;
    box-shadow: none !important;
    outline: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > :is(.form_info, .login-sms-wp__cid),
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > div:first-child:not(.eye-btn):not(.clickable):not(.forget-tip):not(.login-sms-wp__vertical-line):not(.login-sms-send) {
    flex: 0 0 60px !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    color: rgba(242, 243, 245, 0.86) !important;
    font-size: 14px !important;
    line-height: 20px !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > .eye-btn {
    flex: 0 0 32px !important;
    width: 32px !important;
    height: 32px !important;
    margin: 0 0 0 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    opacity: 0.64 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > .eye-btn.eye-btn.eye-btn {
    flex-basis: 32px !important;
    width: 32px !important;
    min-width: 32px !important;
    max-width: 32px !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > .clickable {
    flex: 0 0 auto !important;
    margin-left: 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: var(--bewly-mobile-detail-accent) !important;
    font-size: 13px !important;
    line-height: 18px !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > .forget-tip {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item > .forget-tip.forget-tip.forget-tip {
    display: none !important;
    visibility: hidden !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item input {
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
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 15px !important;
    line-height: 50px !important;
    caret-color: var(--bewly-mobile-detail-accent) !important;
    box-shadow: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .form__item input::placeholder {
    color: rgba(242, 243, 245, 0.42) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-sms-wp__cid {
    flex: 0 0 62px !important;
    height: 50px !important;
    gap: 7px !important;
    cursor: pointer !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-sms-wp__cid img {
    position: static !important;
    width: 12px !important;
    height: 12px !important;
    margin: 1px 0 0 !important;
    opacity: 0.72 !important;
    filter: invert(1) opacity(0.78) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-sms-wp__vertical-line {
    flex: 0 0 1px !important;
    width: 1px !important;
    height: 24px !important;
    margin: 0 10px !important;
    background: rgba(255, 255, 255, 0.1) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-sms-send {
    flex: 0 0 auto !important;
    min-width: 86px !important;
    height: 34px !important;
    padding: 0 10px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 10px !important;
    color: var(--bewly-mobile-detail-accent) !important;
    background: rgba(0, 174, 236, 0.1) !important;
    font-size: 13px !important;
    line-height: 18px !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-sms-send.disable {
    color: rgba(242, 243, 245, 0.5) !important;
    background: rgba(255, 255, 255, 0.055) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .btn_wp {
    margin-top: 14px !important;
    display: flex !important;
    gap: 10px !important;
    justify-content: stretch !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask :is(.btn_primary, .btn_other) {
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

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .btn_primary {
    color: #fff !important;
    background: linear-gradient(135deg, #00aeec, #12b7f5) !important;
    box-shadow: 0 10px 22px rgba(0, 174, 236, 0.24) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .btn_other {
    color: rgba(242, 243, 245, 0.82) !important;
    background: rgba(255, 255, 255, 0.055) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-wp {
    order: 2 !important;
    display: none !important;
    grid-template-columns: 106px minmax(0, 1fr) !important;
    grid-template-areas: "title title" "qr desc" !important;
    align-items: center !important;
    gap: 10px 12px !important;
    padding: 13px !important;
    border: 1px solid rgba(255, 255, 255, 0.07) !important;
    border-radius: 18px !important;
    background: rgba(255, 255, 255, 0.045) !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-title {
    grid-area: title !important;
    width: auto !important;
    margin: 0 !important;
    text-align: left !important;
    color: var(--bewly-mobile-detail-text) !important;
    font-size: 15px !important;
    line-height: 20px !important;
    font-weight: 700 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-box {
    grid-area: qr !important;
    width: 106px !important;
    height: 106px !important;
    min-width: 106px !important;
    min-height: 106px !important;
    margin: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp:hover,
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp:hover .login-scan-box {
    transform: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp > :not(.login-scan-box),
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-hover-wp :is(.scan-tips-icon, .login-client-qr-code, .login-icon, .login-scan-tips, .qrcode-tips) {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    width: 0 !important;
    height: 0 !important;
    pointer-events: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-box > div:not(.login_qrcode_tip),
  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-box > img {
    width: 96px !important;
    height: 96px !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login_qrcode_tip {
    inset: 0 !important;
    width: 106px !important;
    height: 106px !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login_qrcode_tip img {
    width: 34px !important;
    height: 34px !important;
    max-width: 34px !important;
    max-height: 34px !important;
    object-fit: contain !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login_qrcode_tip span {
    max-width: 92px !important;
    color: rgba(31, 35, 41, 0.66) !important;
    font-size: 11px !important;
    line-height: 1.25 !important;
    text-align: center !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-desc {
    grid-area: desc !important;
    width: auto !important;
    margin: 0 !important;
    color: rgba(242, 243, 245, 0.78) !important;
    text-align: left !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-agreement-wp {
    order: 3 !important;
    color: rgba(242, 243, 245, 0.7) !important;
    text-align: center !important;
    font-size: 12px !important;
    line-height: 1.55 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-agreement-wp p {
    margin: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-agreement-wp :is(a, span) {
    color: var(--bewly-mobile-detail-accent) !important;
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
    color: var(--bewly-mobile-detail-text) !important;
  }

  html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-comment-composer="true"],
  html[data-bewly-mobile-video-detail="true"] :is(.reply-box, .reply-box-wrap, .reply-box-warp, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .reply-textarea),
  html[data-bewly-mobile-video-detail="true"] :is(#comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.reply-box, .reply-box-wrap, .reply-box-warp, .comment-box, .comment-input, .comment-input-wrapper, .comment-send, .comment-send-box, .comment-send-lite, .comment-publish, .bili-comment-publish, .bili-comment-box, .bili-comment-reply-box, .fixed-reply-box, .textarea-container, .reply-textarea, textarea),
  html[data-bewly-mobile-video-detail="true"] :is(#comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(form, div, section):not(#comment-module):not(#comment-body):not(#commentapp):not(.commentapp):not(.comment-container):not(.bili-comment-container):not(.bb-comment):has(:is(textarea, input, [contenteditable="true"], [role="textbox"], [placeholder*="评论"], [placeholder*="发一条"], [class*="textarea"], [class*="input"], [class*="editor"])) {
    display: none !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(#comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.no-more, .no-more-comment, .no-more-comments, .nomore, .end, .comment-end, .reply-end, .list-end, .bottom-page, .bili-comment-end) {
    min-height: 0 !important;
    margin: 10px 0 8px !important;
    padding: 0 !important;
  }

  html[data-bewly-mobile-video-detail="true"] :is(#comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment) :is(.comment-list, .reply-list, .bili-comment-list, .list, .items) {
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
