export const MOBILE_BILIBILI_HOST = 'm.bilibili.com'

export function isMobileBilibiliPage(url: string = location.href): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === MOBILE_BILIBILI_HOST
  }
  catch {
    return false
  }
}

export type MobileBilibiliPageKind = 'home' | 'video' | 'search' | 'space' | 'moments' | 'other'

export function classifyMobileBilibiliPage(url: string = location.href): MobileBilibiliPageKind {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== MOBILE_BILIBILI_HOST)
      return 'other'

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    if (pathname === '/' || pathname === '/index.html')
      return 'home'
    if (pathname.startsWith('/video/') || pathname.startsWith('/bangumi/play/'))
      return 'video'
    if (pathname.startsWith('/search'))
      return 'search'
    if (pathname.startsWith('/space/'))
      return 'space'
    if (pathname.startsWith('/dynamic') || pathname.startsWith('/opus/'))
      return 'moments'

    return 'other'
  }
  catch {
    return 'other'
  }
}

export function isMobileBilibiliHomePage(url: string = location.href): boolean {
  return classifyMobileBilibiliPage(url) === 'home'
}

export function isUserscriptRuntime(): boolean {
  return Boolean((globalThis as { __BEWLYSCRIPT__?: boolean }).__BEWLYSCRIPT__)
}

export function isMobileUserscriptRuntimePage(url: string = location.href): boolean {
  return isUserscriptRuntime() && isMobileBilibiliPage(url)
}

export function getBewlyUserscriptHomeUrl(page?: string, url: string = location.href): string {
  const host = isMobileBilibiliPage(url) ? MOBILE_BILIBILI_HOST : 'www.bilibili.com'
  const target = new URL(`https://${host}/`)
  if (page)
    target.searchParams.set('page', page)
  return target.toString()
}

export function prepareMobileUserscriptDefaults(settingsValue: Record<string, unknown>): void {
  settingsValue.touchScreenOptimization = true
  settingsValue.dockPosition = 'bottom'
  settingsValue.autoHideDock = false
  settingsValue.halfHideDock = false
  settingsValue.autoHideTopBar = false
  settingsValue.alwaysUseTransparentTopBar = false
  settingsValue.videoPageTopBarConfig = 'alwaysHide'
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
    --bew-top-bar-height: 0px;
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
