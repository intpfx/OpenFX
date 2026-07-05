import { describe, expect, it } from 'vitest'

import buildUserscriptSource from '../../scripts/build-userscript.ts?raw'
import apiVideoSource from '../background/messageListeners/api/video.ts?raw'
import aLinkSource from '../components/ALink.vue?raw'
import iframeDrawerSource from '../components/IframeDrawer.vue?raw'
import userPanelPopSource from '../components/TopBar/components/pops/UserPanelPop.vue?raw'
import topBarRightSource from '../components/TopBar/components/TopBarRight.vue?raw'
import topBarSearchSource from '../components/TopBar/components/TopBarSearch.vue?raw'
import videoCardCoverSource from '../components/VideoCard/components/VideoCardCover.vue?raw'
import videoCardAuthorAvatarSource from '../components/VideoCard/VideoCardAuthor/components/VideoCardAuthorAvatar.vue?raw'
import videoCardAuthorNameSource from '../components/VideoCard/VideoCardAuthor/components/VideoCardAuthorName.vue?raw'
import videoCardContextMenuSource from '../components/VideoCard/VideoCardContextMenu/VideoCardContextMenu.vue?raw'
import videoCardGridSource from '../components/VideoCardGrid.vue?raw'
import mobileBottomDrawerDragSource from '../composables/useMobileBottomDrawerDrag.ts?raw'
import contentScriptSource from '../contentScripts/index.ts?raw'
import { createMobileVideoDetailFramePlayerViewState, formatMobileVideoDetailFrameTime } from '../contentScripts/mobileVideoFramePlayerState'
import mobileVideoFramePlayerStateSource from '../contentScripts/mobileVideoFramePlayerState.ts?raw'
import appViewSource from '../contentScripts/views/App.vue?raw'
import mobileVideoDetailSource from '../contentScripts/views/VideoDetail/VideoDetail.vue?raw'
import { AppPage } from '../enums/appEnums'
import topBarStoreSource from '../stores/topBarStore.ts?raw'
import {
  BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM,
  BEWLY_MOBILE_VIDEO_DRAWER_PARAM,
  classifyMobileBilibiliPage,
  classifyMobileTakeoverBilibiliPage,
  ensureMobileUserscriptViewportMeta,
  getBewlyMobileLoginUrl,
  getBewlyMobileVideoDrawerHomeUrl,
  getBewlyUserscriptHomeUrl,
  hasBewlyMobileLoginIntent,
  hasBewlyMobileVideoDrawerFrameMarker,
  injectMobileNativeHeaderCSS,
  isBilibiliLoginUrl,
  isBilibiliVideoDetailPage,
  isDesktopPortraitUserscriptRuntimePage,
  isMobileBilibiliHomePage,
  isMobileBilibiliPage,
  isMobileUserscriptRuntimePage,
  markBewlyMobileVideoDrawerFrameUrl,
  MOBILE_NATIVE_HEADER_CSS,
  MOBILE_USERSCRIPT_VIEWPORT_CONTENT,
  MOBILE_VIDEO_DETAIL_CSS,
  MOBILE_VIDEO_DETAIL_FRAME_CSS,
  normalizeBilibiliUrlForCurrentSurface,
  removeMobileNativeHeaderCSS,
  restoreMobileUserscriptViewportMeta,
  shouldEnableHoverInteractions,
  shouldHideMobileNativeContentForPage,
  shouldOpenMobileVideoDetailAsDrawer,
  shouldPreferTouchMode,
  shouldUseMobileVideoDetailLayout,
} from '../userscript/mobile'
import mobileSource from '../userscript/mobile.ts?raw'
import mobileDesktopFallbackSource from '../userscript/mobile-desktop-fallback.ts?raw'
import { getMobileRouteAppPage, isCoreMobileRoute, parseMobileRoute } from '../userscript/mobile-route'
import { parseDanmakuXml, parseMobileVideoUrl, selectPlayableVideoUrl } from '../userscript/mobile-video'
import bilibiliTopBarSource from '../utils/bilibiliTopBar.ts?raw'

type TestOrientationType = 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'

interface TestScreenWithOrientation {
  orientation?: {
    type?: string
  }
}

interface TestWindowWithLegacyOrientation {
  orientation?: number
}

function withViewportSize(width: number, height: number, callback: () => void) {
  const originalWidth = window.innerWidth
  const originalHeight = window.innerHeight
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })

  try {
    callback()
  }
  finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalHeight,
    })
  }
}

function withDeviceOrientation(type: TestOrientationType, legacyAngle: number, callback: () => void) {
  const screenWithOrientation = screen as unknown as TestScreenWithOrientation
  const windowWithOrientation = window as unknown as TestWindowWithLegacyOrientation
  const originalScreenOrientationDescriptor = Object.getOwnPropertyDescriptor(screenWithOrientation, 'orientation')
  const originalWindowOrientationDescriptor = Object.getOwnPropertyDescriptor(windowWithOrientation, 'orientation')

  Object.defineProperty(screenWithOrientation, 'orientation', {
    configurable: true,
    value: { type },
  })
  Object.defineProperty(windowWithOrientation, 'orientation', {
    configurable: true,
    value: legacyAngle,
  })

  try {
    callback()
  }
  finally {
    if (originalScreenOrientationDescriptor) {
      Object.defineProperty(screenWithOrientation, 'orientation', originalScreenOrientationDescriptor)
    }
    else {
      delete screenWithOrientation.orientation
    }

    if (originalWindowOrientationDescriptor) {
      Object.defineProperty(windowWithOrientation, 'orientation', originalWindowOrientationDescriptor)
    }
    else {
      delete windowWithOrientation.orientation
    }
  }
}

function withOrientationMediaQuery(portrait: boolean, landscape: boolean, callback: () => void) {
  const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')

  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: query === '(orientation: portrait)' ? portrait : query === '(orientation: landscape)' ? landscape : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })

  try {
    callback()
  }
  finally {
    if (originalMatchMediaDescriptor)
      Object.defineProperty(globalThis, 'matchMedia', originalMatchMediaDescriptor)
    else
      delete (globalThis as { matchMedia?: Window['matchMedia'] }).matchMedia
  }
}

function withUserscriptRuntime(callback: () => void) {
  const globalObject = globalThis as { __BEWLYSCRIPT__?: boolean }
  const previousValue = globalObject.__BEWLYSCRIPT__
  globalObject.__BEWLYSCRIPT__ = true

  try {
    callback()
  }
  finally {
    if (previousValue === undefined)
      delete globalObject.__BEWLYSCRIPT__
    else
      globalObject.__BEWLYSCRIPT__ = previousValue
  }
}

describe('mobile userscript support', () => {
  it('matches the mobile Bilibili host', () => {
    expect(isMobileBilibiliPage('https://m.bilibili.com/')).toBe(true)
    expect(isMobileBilibiliPage('https://m.bilibili.com/video/BV123')).toBe(true)
  })

  it('does not match desktop or insecure hosts as mobile pages', () => {
    expect(isMobileBilibiliPage('https://www.bilibili.com/')).toBe(false)
    expect(isMobileBilibiliPage('http://m.bilibili.com/')).toBe(false)
    expect(isMobileBilibiliPage('https://example.com/')).toBe(false)
  })

  it('classifies common mobile pages', () => {
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/')).toBe('home')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/index.html?foo=1')).toBe('home')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/video/BV123')).toBe('video')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/bangumi/play/ep123')).toBe('other')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/search?keyword=test')).toBe('search')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/space/123')).toBe('space')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/opus/123')).toBe('moments')
    expect(classifyMobileBilibiliPage('https://www.bilibili.com/')).toBe('other')
  })

  it('classifies core takeover pages across mobile and narrow desktop surfaces', () => {
    expect(classifyMobileTakeoverBilibiliPage('https://m.bilibili.com/video/BV123')).toBe('video')
    expect(classifyMobileTakeoverBilibiliPage('https://www.bilibili.com/video/BV123')).toBe('video')
    expect(classifyMobileTakeoverBilibiliPage('https://www.bilibili.com/search?keyword=test')).toBe('search')
    expect(classifyMobileTakeoverBilibiliPage('https://www.bilibili.com/space/123')).toBe('space')
    expect(classifyMobileTakeoverBilibiliPage('https://www.bilibili.com/opus/123')).toBe('moments')
    expect(classifyMobileTakeoverBilibiliPage('https://space.bilibili.com/123')).toBe('other')
  })

  it('marks mobile native CSS with the current page kind', () => {
    const style = injectMobileNativeHeaderCSS('https://m.bilibili.com/video/BV123')

    expect(style?.textContent).toContain(':not([data-bewly-mobile-page-kind="video"])')
    expect(style?.textContent).toContain(':not([data-bewly-mobile-page-kind="other"])')
    expect(style?.textContent).toContain(':not([data-bewly-mobile-video-detail="true"])')
    expect(document.documentElement.getAttribute('data-bewly-mobile')).toBe('true')
    expect(document.documentElement.getAttribute('data-bewly-mobile-page-kind')).toBe('video')
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(MOBILE_USERSCRIPT_VIEWPORT_CONTENT)

    removeMobileNativeHeaderCSS(style)
  })

  it('forces a device-width viewport for the real iPhone desktop-site userscript surface', () => {
    document.querySelectorAll('meta').forEach((meta) => {
      if (meta.name.toLowerCase() === 'viewport')
        meta.remove()
    })

    const viewport = ensureMobileUserscriptViewportMeta()

    expect(viewport?.name).toBe('viewport')
    expect(viewport?.getAttribute('content')).toBe(MOBILE_USERSCRIPT_VIEWPORT_CONTENT)
    expect(MOBILE_USERSCRIPT_VIEWPORT_CONTENT).toContain('minimum-scale=1')
    expect(MOBILE_USERSCRIPT_VIEWPORT_CONTENT).toContain('maximum-scale=1')
    expect(MOBILE_USERSCRIPT_VIEWPORT_CONTENT).toContain('user-scalable=no')
    expect(document.head.firstElementChild).toBe(viewport)

    restoreMobileUserscriptViewportMeta()
    expect(document.querySelector('meta[name="viewport"]')).toBeNull()
  })

  it('restores an existing viewport after mobile userscript cleanup', () => {
    document.querySelectorAll('meta').forEach((meta) => {
      if (meta.name.toLowerCase() === 'viewport')
        meta.remove()
    })

    const existingViewport = document.createElement('meta')
    existingViewport.name = 'viewport'
    existingViewport.setAttribute('content', 'width=980')
    document.head.appendChild(existingViewport)

    const viewport = ensureMobileUserscriptViewportMeta()

    expect(viewport).toBe(existingViewport)
    expect(existingViewport.getAttribute('content')).toBe(MOBILE_USERSCRIPT_VIEWPORT_CONTENT)

    restoreMobileUserscriptViewportMeta()
    expect(existingViewport.getAttribute('content')).toBe('width=980')
    expect(existingViewport.hasAttribute('data-bewly-mobile-viewport-managed')).toBe(false)
    existingViewport.remove()
  })

  it('detects mobile home without broadening desktop homepage matching', () => {
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/')).toBe(true)
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/video/BV123')).toBe(false)
  })

  it('hides native desktop content only for portrait Bewly shell pages', () => {
    withUserscriptRuntime(() => {
      withDeviceOrientation('portrait-primary', 0, () => {
        withViewportSize(402, 844, () => {
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/?page=Home')).toBe(true)
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/video/BV123')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/video/BV123')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/search?keyword=test')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/search?keyword=test')).toBe(true)
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/space/123')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/space/123')).toBe(true)
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/dynamic')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/account/history')).toBe(false)
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/bangumi/play/ep123')).toBe(false)
        })
      })
    })

    withUserscriptRuntime(() => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(844, 402, () => {
          expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/?page=Home')).toBe(false)
        })
      })
    })
  })

  it('parses desktop routes into Bewly pages and leaves m-site routes unsupported', () => {
    expect(parseMobileRoute('https://m.bilibili.com/')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://m.bilibili.com/?page=History')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://www.bilibili.com/')).toMatchObject({ kind: 'home', page: AppPage.Home })
    expect(parseMobileRoute('https://www.bilibili.com/?page=Favorites')).toMatchObject({ kind: 'bewly-page', page: AppPage.Favorites })
    expect(parseMobileRoute('https://m.bilibili.com/video/BV123?p=2')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://www.bilibili.com/video/BV123?p=2')).toMatchObject({ kind: 'unsupported', bvid: 'BV123' })
    expect(parseMobileRoute('https://m.bilibili.com/search?keyword=test')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://www.bilibili.com/search?keyword=test')).toMatchObject({ kind: 'search', page: AppPage.SearchResults, keyword: 'test' })
    expect(parseMobileRoute('https://m.bilibili.com/space/123')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://www.bilibili.com/space/123')).toMatchObject({ kind: 'space', page: AppPage.Space, mid: '123' })
    expect(parseMobileRoute('https://m.bilibili.com/dynamic')).toMatchObject({ kind: 'unsupported' })
    expect(parseMobileRoute('https://www.bilibili.com/dynamic')).toMatchObject({ kind: 'moments', page: AppPage.Moments })
    expect(parseMobileRoute('https://m.bilibili.com/opus/456')).toMatchObject({ kind: 'unsupported' })
  })

  it('keeps unsupported mobile routes outside the takeover shell', () => {
    expect(isCoreMobileRoute('https://m.bilibili.com/video/BV123')).toBe(false)
    expect(isCoreMobileRoute('https://www.bilibili.com/video/BV123')).toBe(false)
    expect(isCoreMobileRoute('https://m.bilibili.com/search?keyword=test')).toBe(false)
    expect(isCoreMobileRoute('https://m.bilibili.com/space/123')).toBe(false)
    expect(isCoreMobileRoute('https://m.bilibili.com/account/history')).toBe(false)
    expect(parseMobileRoute('https://m.bilibili.com/bangumi/play/ep123')).toMatchObject({ kind: 'unsupported' })
    expect(getMobileRouteAppPage('https://m.bilibili.com/account/history')).toBeUndefined()
  })

  it('parses mobile video URL state', () => {
    expect(parseMobileVideoUrl('https://m.bilibili.com/video/BV123?p=2&cid=456#reply')).toEqual({
      bvid: 'BV123',
      page: 2,
      cid: 456,
    })
    expect(parseMobileVideoUrl('https://www.bilibili.com/video/BV123?p=3&cid=789')).toEqual({
      bvid: 'BV123',
      page: 3,
      cid: 789,
    })
    expect(parseMobileVideoUrl('https://m.bilibili.com/video/BV123?p=bad')).toEqual({
      bvid: 'BV123',
      page: 1,
      cid: undefined,
    })
    expect(parseMobileVideoUrl('https://m.bilibili.com/search?keyword=test')).toBeUndefined()
    expect(parseMobileVideoUrl('https://m.bilibili.com/bangumi/play/ep123')).toBeUndefined()
  })

  it('selects playable MP4 durl responses and falls back cleanly', () => {
    expect(selectPlayableVideoUrl({
      data: {
        quality: 80,
        format: 'mp4',
        support_formats: [{ quality: 80, new_description: '1080P' }],
        durl: [{ url: 'https://example.com/video.mp4' }],
      },
    })).toEqual({
      url: 'https://example.com/video.mp4',
      quality: 80,
      description: '1080P',
    })

    expect(selectPlayableVideoUrl({
      data: {
        quality: 64,
        durl: [{ backup_url: ['https://example.com/backup.mp4'] }],
      },
    })).toMatchObject({ url: 'https://example.com/backup.mp4', quality: 64 })

    expect(selectPlayableVideoUrl({ code: -403, message: 'denied', data: {} })).toBeUndefined()
    expect(selectPlayableVideoUrl({ data: { durl: [] } })).toBeUndefined()
  })

  it('parses danmaku XML into a readonly track', () => {
    expect(parseDanmakuXml('<i><d p="1.5,1,25,16777215,0,0,0,0">hello</d></i>')).toEqual([{
      time: 1.5,
      mode: 1,
      size: 25,
      color: 16777215,
      text: 'hello',
    }])

    expect(parseDanmakuXml('<i></i>')).toEqual([])
    expect(parseDanmakuXml('<i><d p="bad">broken</i>')).toEqual([])
  })

  it('identifies Bilibili video detail pages across mobile and desktop hosts', () => {
    expect(isBilibiliVideoDetailPage('https://m.bilibili.com/video/BV123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://www.bilibili.com/video/BV123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://www.bilibili.com/bangumi/play/ep123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://m.bilibili.com/search?keyword=test')).toBe(false)
    expect(isBilibiliVideoDetailPage('https://example.com/video/BV123')).toBe(false)
  })

  it('uses the mobile video detail layout only for portrait desktop video surfaces', () => {
    withDeviceOrientation('portrait-primary', 0, () => {
      withViewportSize(402, 844, () => {
        expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/video/BV123')).toBe(false)
        expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
        expect(shouldOpenMobileVideoDetailAsDrawer('https://www.bilibili.com/video/BV123')).toBe(true)
      })
    })

    withDeviceOrientation('landscape-primary', 90, () => {
      withViewportSize(844, 402, () => {
        expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(false)
        expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/search?keyword=test')).toBe(false)
      })
    })

    withOrientationMediaQuery(true, false, () => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(402, 844, () => {
          expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
        })
      })
    })

    withOrientationMediaQuery(false, true, () => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(402, 844, () => {
          expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
        })
      })
    })

    withOrientationMediaQuery(false, true, () => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(980, 874, () => {
          expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
        })
        withViewportSize(980, 700, () => {
          expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
        })
      })
    })

    withOrientationMediaQuery(false, true, () => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(980, 874, () => {
          expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
          expect(shouldOpenMobileVideoDetailAsDrawer('https://www.bilibili.com/video/BV123')).toBe(true)
        })
      })
    })

    withDeviceOrientation('landscape-primary', 90, () => {
      withViewportSize(844, 402, () => {
        expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(false)
      })
    })
  })

  it('builds a mobile home drawer intent for direct portrait video entries', () => {
    expect(BEWLY_MOBILE_VIDEO_DRAWER_PARAM).toBe('bewlyVideoDrawer')
    expect(getBewlyMobileVideoDrawerHomeUrl('https://m.bilibili.com/video/BV123?p=2', 'https://www.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Home&bewlyVideoDrawer=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV123%3Fp%3D2')
  })

  it('marks video iframe URLs so drawer frames do not redirect themselves again', () => {
    expect(BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM).toBe('bewlyVideoDrawerFrame')
    const drawerFrameUrl = markBewlyMobileVideoDrawerFrameUrl('https://m.bilibili.com/video/BV123?p=2', 'https://www.bilibili.com/')
    expect(drawerFrameUrl).toBe('https://www.bilibili.com/video/BV123?p=2&bewlyVideoDrawerFrame=1')
    expect(hasBewlyMobileVideoDrawerFrameMarker(drawerFrameUrl)).toBe(true)
    expect(hasBewlyMobileVideoDrawerFrameMarker('https://www.bilibili.com/video/BV123?p=2')).toBe(false)
  })

  it('turns the native desktop login modal into a narrow bottom drawer', () => {
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain(':is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-content-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('align-items: flex-end')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-login-drawer-max-height: min(86dvh')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: var(--bewly-mobile-login-drawer-max-height) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('border-radius: var(--bewly-mobile-detail-radius) var(--bewly-mobile-detail-radius) 0 0')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('env(safe-area-inset-bottom')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-drawer="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('padding-top: calc(var(--bewly-mobile-login-drag-height)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('data-bewly-mobile-login-settling')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('data-bewly-mobile-login-closing')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('will-change: transform !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-drag-handle="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: var(--bewly-mobile-login-drag-height) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: var(--bewly-mobile-login-drag-width) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('touch-action: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('cursor: grabbing !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.login-scan-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-login-right-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-methods="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain(':is(html[data-bewly-mobile="true"], html[data-bewly-mobile-video-detail="true"]) .bili-mini-mask .login-scan-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.form__item:focus-within')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-mask .tab__form')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: auto !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('row-gap: 10px')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.tab__form::before')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('background: transparent !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.form__item + .form__item')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.form__item::before')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('border: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.login-sms-send')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.form__item > .forget-tip')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.form__item > .eye-btn')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 50px')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.btn_primary')
    expect(MOBILE_NATIVE_HEADER_CSS).toContain('--bewly-mobile-login-text: #18191c')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-login-text: #18191c')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-login-placeholder: #9aa2ad')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('background: var(--bewly-mobile-login-bg) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color: var(--bewly-mobile-login-text) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-close-icon::before')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('content: "\\00d7" !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.login-tab-item:not(.active-tab)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color: var(--bewly-mobile-login-subtle) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color: var(--bewly-mobile-login-placeholder) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('opacity: 1 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.login-agreement-wp p')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color: var(--bewly-mobile-login-muted) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('background: rgba(251, 114, 153, 0.1) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-mask .login-sns-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('pointer-events: none !important')
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailLoginForms')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailLoginDragHandle')
    expect(contentScriptSource).toContain('closeMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('forceMobileVideoDetailLoginDisplay')
    expect(contentScriptSource).toContain('applyMobileVideoDetailLoginDrawerOffset')
    expect(contentScriptSource).toContain('reboundMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('animateMobileVideoDetailLoginDrawerClose')
    expect(contentScriptSource).toContain(`translate3d(0, \${clampedOffset}px, 0)`)
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_REBOUND_TRANSITION')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_TRANSITION')
    expect(contentScriptSource).toContain('setPointerCapture')
    expect(contentScriptSource).toContain('window.addEventListener(\'pointerup\', finishDrag)')
    expect(contentScriptSource).toContain('mask.style.setProperty(\'display\', \'none\', \'important\')')
    expect(contentScriptSource).toContain('lastY = event.clientY')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_DRAG_THRESHOLD_PX')
    expect(contentScriptSource).toContain('.bili-mini-login-right-wp')
    expect(contentScriptSource).toContain('.tab__form .form__item, .tab__form input')
    expect(contentScriptSource).toContain('.login-pwd-wp, .tab__form')
    expect(contentScriptSource).toContain('forceMobileVideoDetailLoginDisplay(item, \'flex\')')
    expect(contentScriptSource).toContain('style.setProperty(\'display\', \'flex\', \'important\')')
    expect(contentScriptSource).toContain('element.style.setProperty(\'display\', display, \'important\')')
    expect(contentScriptSource).toContain('startMobileLoginDrawerEnhancement()')
    expect(contentScriptSource).toContain('window.addEventListener(MOBILE_OPEN_LOGIN_DRAWER_EVENT, handleMobileOpenLoginDrawer)')
    expect(contentScriptSource).toContain('mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)')
  })

  it('treats portrait desktop core pages as the portrait userscript surface without enabling m-site takeover', () => {
    withUserscriptRuntime(() => {
      withDeviceOrientation('portrait-primary', 0, () => {
        withViewportSize(402, 844, () => {
          expect(isMobileUserscriptRuntimePage('https://m.bilibili.com/?page=Home')).toBe(false)
          expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(true)
          expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/search?keyword=test')).toBe(true)
          expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/video/BV123')).toBe(true)
          expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/read/cv123')).toBe(false)
        })
      })
    })

    withUserscriptRuntime(() => {
      withDeviceOrientation('landscape-primary', 90, () => {
        withViewportSize(844, 402, () => {
          expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(false)
        })
      })
    })
  })

  it('keeps Bewly page URLs on the desktop Bilibili surface', () => {
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://m.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://www.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
  })

  it('keeps mobile login fallback on a Bewly-controlled desktop login intent', () => {
    expect(getBewlyMobileLoginUrl('https://m.bilibili.com/')).toBe('https://www.bilibili.com/?bewlyLogin=1')
    expect(hasBewlyMobileLoginIntent('https://www.bilibili.com/?bewlyLogin=1')).toBe(true)
    expect(hasBewlyMobileLoginIntent('https://www.bilibili.com/?bewlyLogin=0')).toBe(false)
    expect(hasBewlyMobileLoginIntent('https://passport.bilibili.com/login')).toBe(false)
    expect(isBilibiliLoginUrl('https://passport.bilibili.com/login')).toBe(true)
    expect(isBilibiliLoginUrl('https://passport.bilibili.com/h5-app/passport/login')).toBe(true)
  })

  it('normalizes bilibili URLs to the desktop surface host', () => {
    expect(normalizeBilibiliUrlForCurrentSurface('https://www.bilibili.com/video/BV123', 'https://m.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123?t=8&p=2', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123?t=8&p=2')
    expect(normalizeBilibiliUrlForCurrentSurface('https://space.bilibili.com/123', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/space/123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://space.bilibili.com/123/dynamic?spm_id_from=333#reply', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/space/123/dynamic?spm_id_from=333#reply')
    expect(parseMobileRoute(normalizeBilibiliUrlForCurrentSurface('https://space.bilibili.com/123', 'https://www.bilibili.com/'))).toMatchObject({ kind: 'space', page: AppPage.Space, mid: '123' })
  })

  it('normalizes protocol-relative and relative URLs before mobile drawer routing', () => {
    expect(normalizeBilibiliUrlForCurrentSurface('//account.bilibili.com/account/record?type=exp', 'https://m.bilibili.com/')).toBe('https://account.bilibili.com/account/record?type=exp')
    expect(normalizeBilibiliUrlForCurrentSurface('/video/BV123', 'https://m.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('/video/BV123', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
  })

  it('prefers touch mode when hover capability is unavailable', () => {
    expect(shouldPreferTouchMode(false, { canHover: false, finePointer: false }, false)).toBe(true)
    expect(shouldEnableHoverInteractions(false, { canHover: false, finePointer: false }, false)).toBe(false)
  })

  it('keeps hover interactions on fine-pointer desktop environments', () => {
    expect(shouldPreferTouchMode(false, { canHover: true, finePointer: true }, false)).toBe(false)
    expect(shouldEnableHoverInteractions(false, { canHover: true, finePointer: true }, false)).toBe(true)
  })

  it('forces touch mode for mobile userscript pages even if settings are off', () => {
    expect(shouldPreferTouchMode(false, { canHover: true, finePointer: true }, true)).toBe(true)
    expect(shouldEnableHoverInteractions(false, { canHover: true, finePointer: true }, true)).toBe(false)
  })

  it('keeps mobile account taps clickable instead of swallowing the follow-up click', () => {
    const pointerDownHandler = topBarSearchSource.match(/function handleMobileAccountPointerDown\(event: Event\) \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(pointerDownHandler).toContain('event.stopPropagation()')
    expect(pointerDownHandler).not.toContain('event.preventDefault()')
    expect(topBarSearchSource).toContain('openMobileLoginDrawer()')
    expect(topBarSearchSource).toContain('topBarStore.scheduleLoginStateRefresh()')
    expect(topBarSearchSource).not.toContain('openBilibiliLoginPage({ forcePage: true })')
    expect(topBarSearchSource).toContain('function openMobileUserPanelDrawer(event?: Event)')
    expect(topBarSearchSource).toContain('showMobileUserPanelDrawer.value = true')
    expect(topBarSearchSource).toContain('class="mobile-search-user-panel-mask"')
    expect(topBarSearchSource).toContain('<UserPanelPop')
    expect(topBarSearchSource).toContain(':user-info="userInfo"')
    expect(topBarSearchSource).not.toContain('mobileSpaceUrl')
    expect(topBarSearchSource).not.toContain('openMobileUrlInCurrentPage(mobileSpaceUrl.value)')
    expect(topBarSearchSource).not.toContain('showMobileLoginPanel.value = true')
    expect(topBarSearchSource).not.toContain('class="mobile-login-panel"')
  })

  it('keeps the portrait user panel reachable with a single mobile logout action', () => {
    expect(topBarRightSource).toContain('class="mobile-user-panel-mask"')
    expect(topBarRightSource).toContain('UserPanelPop')
    expect(topBarRightSource).toContain('topBarStore.scheduleLoginStateRefresh()')
    expect(userPanelPopSource).toContain('props.userInfo.mid ? String(props.userInfo.mid) : getUserID()')
    expect(userPanelPopSource).toContain('class="mobile-user-panel-logout"')
    expect(userPanelPopSource).toContain('useMobileBottomDrawerDrag')
    expect(userPanelPopSource).toContain('class="mobile-user-panel-drag-handle"')
    expect(userPanelPopSource).toContain('@pointerdown="handleMobileDrawerPointerDown"')
    expect(userPanelPopSource).toContain(':style="mobileDrawerStyle"')
    expect(userPanelPopSource).toContain('v-if="isMobileUserscriptPage"')
    expect(userPanelPopSource).toContain('@click.stop="logout()"')
    expect(userPanelPopSource).toContain('class="desktop-user-panel-logout"')
    expect(userPanelPopSource).toContain('v-if="!isMobileUserscriptPage"')
    expect(userPanelPopSource).toContain('topbar.user_dropdown.log_out')
  })

  it('treats logged-out nav payloads as logged out before showing avatar UI', () => {
    expect(topBarStoreSource).toContain('const isLogin = ref<boolean>(false)')
    expect(topBarStoreSource).toContain('data.isLogin !== false && Number(data.mid) > 0')
    expect(topBarStoreSource).toContain('res.code === -101 || res.code === 0')
    expect(topBarStoreSource).toContain('resetUserInfo()')
    expect(topBarStoreSource).toContain('scheduleLoginStateRefresh')
    expect(topBarStoreSource).toContain('hydrateUserAvatarFromSpaceInfo')
    expect(topBarStoreSource).toContain('api.user.getSpaceInfo({ mid })')
    expect(topBarStoreSource).toContain('USER_AVATAR_REFRESH_DELAYS_MS')
    expect(topBarStoreSource).toContain('hydrateUserAvatarFromSpaceInfo(true)')
    expect(topBarStoreSource).toContain('scheduleUserAvatarRefresh')
    expect(topBarStoreSource).toContain('clearUserAvatarRefreshTimers')
    expect(topBarStoreSource).toContain('refreshUserAvatar')
    expect(appViewSource).toContain('initializeMobileShellAccountData')
    expect(appViewSource).toContain('await topBarStore.initData()')
    expect(appViewSource).toContain('topBarStore.startUpdateTimer()')
    expect(topBarRightSource).toContain('const { getUnreadMessageCount, checkBCoinReceiveStatus, refreshUserAvatar } = topBarStore')
    expect(topBarRightSource).toContain('refreshUserAvatar()')
    expect(topBarRightSource).toContain('class="avatar-img__image"')
    expect(topBarRightSource).toContain('referrerpolicy="no-referrer-when-downgrade"')
    expect(topBarRightSource).toContain('@error="avatarLoadFailed = true"')
    expect(topBarSearchSource).toContain('const { refreshUserAvatar } = topBarStore')
    expect(topBarSearchSource).toContain('mobileAccountResolving')
    expect(topBarSearchSource).toContain('await topBarStore.getUserInfo()')
    expect(topBarSearchSource).toContain('openMobileUserPanelDrawer()')
    expect(topBarSearchSource).toContain('refreshUserAvatar()')
    expect(topBarSearchSource).toContain('class="mobile-search-account-button__avatar-img"')
    expect(topBarSearchSource).toContain('referrerpolicy="no-referrer-when-downgrade"')
    expect(topBarSearchSource).toContain('@error="mobileAvatarLoadFailed = true"')
  })

  it('uses real draggable top zones for portrait bottom drawers', () => {
    expect(mobileBottomDrawerDragSource).toContain('export function useMobileBottomDrawerDrag')
    expect(mobileBottomDrawerDragSource).toContain('window.addEventListener(\'pointermove\', handlePointerMove')
    expect(mobileBottomDrawerDragSource).toContain('transform: `translate3d(0, ')
    expect(mobileBottomDrawerDragSource).toContain('offsetY.value')
    expect(mobileBottomDrawerDragSource).toContain('px, 0)`')
    expect(mobileBottomDrawerDragSource).toContain('void options.onClose()')
    expect(userPanelPopSource).toContain('v-bind="mobileDrawerStateAttrs"')
    expect(iframeDrawerSource).toContain('useMobileBottomDrawerDrag')
    expect(iframeDrawerSource).toContain('class="iframe-drawer-drag-handle"')
    expect(iframeDrawerSource).toContain('@pointerdown="handleMobileDrawerPointerDown"')
    expect(iframeDrawerSource).toContain(':style="isMobileUserscriptPage ? mobileDrawerMotionStyle : undefined"')
    expect(iframeDrawerSource).toContain('...mobileDrawerMotionStyle.value')
    expect(iframeDrawerSource).toContain('background: color-mix(in oklab, var(--bew-bg) 94%, transparent) !important')
    expect(iframeDrawerSource).toContain('allowfullscreen')
    expect(iframeDrawerSource).toContain('if (!isMobileUserscriptPage)\n    history.pushState(null, \'\', props.url)')
    expect(iframeDrawerSource).toContain('if (!isMobileUserscriptPage)\n    history.replaceState(null, \'\', newUrl.replace(/\\/$/, \'\'))')
    expect(iframeDrawerSource).toContain('if (isMobileUserscriptPage)\n    return')
    expect(iframeDrawerSource).not.toContain('iframe-drawer-mobile-return')
    expect(videoCardContextMenuSource).toContain('useMobileBottomDrawerDrag')
    expect(videoCardContextMenuSource).toContain('class="context-menu-drawer-handle"')
    expect(videoCardContextMenuSource).toContain('@pointerdown="handleContextMenuDrawerPointerDown"')
    expect(videoCardContextMenuSource).toContain(':style="isMobileUserscriptPage ? contextMenuDrawerStyle : contextMenuStyles"')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailLoginDragHandle(drawer)')
    expect(contentScriptSource).toContain('document.createElement(\'button\')')
    expect(contentScriptSource).toContain('handle.type = \'button\'')
    expect(contentScriptSource).toContain('handle.setAttribute(\'aria-label\', \'下滑关闭登录面板\')')
    expect(contentScriptSource).toContain('applyMobileVideoDetailLoginDrawerOffset(drawer, lastY - startY)')
    expect(contentScriptSource).toContain('animateMobileVideoDetailLoginDrawerClose(drawer)')
  })

  it('opens portrait login drawers through the optimized native Bilibili login modal', () => {
    expect(topBarRightSource).toContain('openMobileLoginDrawer()')
    expect(topBarRightSource).not.toContain('openBilibiliLoginPage({ forcePage: true })')
    expect(appViewSource).not.toContain('MOBILE_OPEN_LOGIN_DRAWER_EVENT')
    expect(appViewSource).not.toContain('showMobileLoginPanel')
    expect(appViewSource).not.toContain('<MobileLoginDrawer')
    expect(contentScriptSource).toContain('MOBILE_NATIVE_LOGIN_TRIGGER_SELECTORS')
    expect(contentScriptSource).toContain('.bili-header .right-entry__outside.go-login-btn')
    expect(contentScriptSource).toContain('.bili-header .header-login-entry')
    expect(contentScriptSource).toContain('MOBILE_LOGIN_NATIVE_FALLBACK_MS')
    expect(contentScriptSource).toContain('MOBILE_LOGIN_NATIVE_TRIGGER_RETRY_DELAYS_MS')
    expect(contentScriptSource).toContain('resetBilibiliTopBarInlineStyles')
    expect(contentScriptSource).toContain('keepMobileNativeLoginTriggerAccessible')
    expect(contentScriptSource).toContain('dispatchMobileNativeLoginTap')
    expect(contentScriptSource).toContain('new PointerEvent(\'pointerdown\'')
    expect(contentScriptSource).toContain('tryOpenMobileNativeLoginDrawerOnce')
    expect(contentScriptSource).toContain('function openMobileNativeLoginDrawer()')
    expect(contentScriptSource).toContain('trigger.click()')
    expect(contentScriptSource).toContain('window.setTimeout(() => {')
    expect(contentScriptSource).toContain('scheduleMobileLoginDrawerEnhancement(80)')
    expect(contentScriptSource).toContain('function navigateToMobileLoginPage()')
    expect(contentScriptSource).toContain('getBewlyMobileLoginUrl(location.href)')
    expect(contentScriptSource).toContain('scheduleMobileLoginIntentDrawer')
    expect(contentScriptSource).toContain('clearMobileLoginIntentFromUrl')
    expect(contentScriptSource).toContain('let hasSeenDrawer = hasVisibleNativeLoginDrawer()')
    expect(contentScriptSource).toContain('if (!hasSeenDrawer && !hasVisibleNativeLoginDrawer())')
    expect(contentScriptSource).toContain('function handleMobileOpenLoginDrawer(event: Event)')
    expect(contentScriptSource).toContain('if (!openMobileNativeLoginDrawer())')
    expect(bilibiliTopBarSource).toContain('if (isMobileUserscriptRuntimePage())')
    expect(bilibiliTopBarSource).toContain('return () => {}')
    expect(mobileSource).toContain('export const MOBILE_OPEN_LOGIN_DRAWER_EVENT')
    expect(mobileSource).toContain('export const BEWLY_MOBILE_LOGIN_INTENT_PARAM')
    expect(mobileSource).toContain('export function getBewlyMobileLoginUrl')
    expect(mobileSource).toContain('hasBewlyMobileLoginIntent(url)')
    expect(mobileSource).toContain('return !window.dispatchEvent(event)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('data-bewly-mobile-login-drawer')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailLoginMaskInteractive')
    expect(contentScriptSource).toContain('document.body.appendChild(mask)')
    expect(contentScriptSource).toContain('restoreMobileNativeManagedElement(mask)')
    expect(mobileSource).toContain('MOBILE_NATIVE_INTERACTIVE_OVERLAY_SELECTOR')
    expect(mobileSource).toContain('.bili-mini-mask')
    expect(mobileSource).toContain('restoreMobileNativeContentElement(child)')
    expect(topBarSearchSource).not.toContain('openBilibiliLoginPage({ forcePage: true })')
  })

  it('keeps portrait video cards single-column and opens video details in the drawer', () => {
    expect(videoCardGridSource).toContain('import { isMobileUserscriptRuntimePage }')
    expect(videoCardGridSource).toContain('if (isMobileUserscriptRuntimePage())\n    return 1')
    expect(videoCardGridSource).toContain('if (isMobileUserscriptRuntimePage())\n    return 12')
    expect(aLinkSource).toContain('isBilibiliVideoDetailPage(destinationUrl)')
    expect(aLinkSource).toContain('openIframeDrawer(destinationUrl)')
    expect(appViewSource).toContain('if (isBilibiliVideoDetailPage(destination.toString()))')
    expect(appViewSource).toContain('openIframeDrawer(destination.toString())')
    expect(appViewSource).toContain('BEWLY_MOBILE_VIDEO_DRAWER_PARAM')
    expect(appViewSource).toContain('consumeMobileVideoDrawerIntent')
    expect(appViewSource).toContain('const initialMobileVideoDrawerIntent = ref<string | null>(getMobileVideoDrawerIntentFromUrl())')
    expect(appViewSource).toContain('function getMobileVideoDrawerIntentFromUrl')
    expect(appViewSource).toContain('if (urlParams.has(BEWLY_MOBILE_VIDEO_DRAWER_PARAM))')
    expect(appViewSource).toContain('?? initialMobileVideoDrawerIntent.value')
    expect(appViewSource).toContain('initialMobileVideoDrawerIntent.value = null')
    expect(appViewSource).toContain('markBewlyMobileVideoDrawerFrameUrl(destination.toString())')
    expect(appViewSource).toContain('openIframeDrawer(normalizeBilibiliUrlForCurrentSurface(drawerUrl))')
    expect(contentScriptSource).toContain('const shouldRedirectMobileVideoDetailToDrawer = canRedirectMobileVideoDetailToDrawer() && shouldOpenMobileVideoDetailAsDrawer(currentUrl)')
    expect(contentScriptSource).toContain('const canAutoRedirect = isUserscriptRuntime() && !isBewlyMobileVideoDetailDrawerFrame()')
    expect(contentScriptSource).toContain('return canAutoRedirect && false')
    expect(contentScriptSource).toContain('function isBewlyMobileVideoDetailDrawerFrame')
    expect(contentScriptSource).toContain('hasBewlyMobileVideoDrawerFrameMarker()')
    // eslint-disable-next-line no-template-curly-in-string
    expect(contentScriptSource).toContain('location.search.includes(`${BEWLY_MOBILE_VIDEO_DRAWER_FRAME_PARAM}=1`)')
    expect(contentScriptSource).toContain('document.referrer.includes(BEWLY_MOBILE_VIDEO_DRAWER_PARAM)')
    expect(contentScriptSource).not.toContain('function redirectMobileVideoDetailToDrawerIfNeeded')
    expect(contentScriptSource).not.toContain('redirectMobileVideoDetailToDrawerIfNeeded')
    expect(contentScriptSource).not.toContain('for (const delay of [60, 240, 720])')
    expect(appViewSource).not.toContain('window.location.href = destination.toString()')
    expect(mobileSource).toContain('if (isBilibiliVideoDetailPage(href))')
    expect(mobileSource).toContain('openMobileUrlInCurrentPage(href)')
    expect(mobileSource).toContain('function shouldForceMobileCurrentPageTarget(anchor: HTMLAnchorElement): boolean')
    expect(mobileSource).toContain('return Boolean(href && isBilibiliVideoDetailPage(href))')
    expect(mobileSource).not.toContain('if (!anchor.closest(\'#bewly\'))\n      return')
    expect(mobileDesktopFallbackSource).toContain('function openBewlyVideoAsDrawerFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('homeUrl.searchParams.set("bewlyVideoDrawer", drawerUrl)')
    expect(mobileDesktopFallbackSource).toContain('homeUrl.hash = "bewlyVideoDrawer=" + encodeURIComponent(drawerUrl)')
    expect(mobileDesktopFallbackSource).toContain('if (openBewlyVideoAsDrawerFromPrelude())')
    expect(mobileDesktopFallbackSource).toContain('scheduleBewlyVideoDrawerPreludeRetry();')
    expect(mobileDesktopFallbackSource).toContain('function canRedirectBewlyVideoPageContext')
    expect(mobileDesktopFallbackSource).toContain('function isBewlyOwnVideoDrawerFrame')
    expect(mobileDesktopFallbackSource).toContain('searchParams.get("bewlyVideoDrawerFrame") === "1"')
    expect(mobileDesktopFallbackSource).toContain('return isBewlyTopLevelPage() && !isBewlyOwnVideoDrawerFrame();')
    expect(mobileDesktopFallbackSource).toContain('document.referrer.indexOf("bewlyVideoDrawer=") !== -1')
    expect(mobileDesktopFallbackSource).toContain('if (viewportWidth <= 980 && viewportWidth < viewportHeight * 1.45)')
    expect(mobileDesktopFallbackSource).toContain('function scheduleBewlyVideoDrawerHostFallbackFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('var bewlyVideoDrawerHostFallbackAttr = "data-bewly-mobile-video-drawer-host-fallback"')
    expect(mobileDesktopFallbackSource).toContain('var bewlyVideoDrawerHostFallbackStorageKey = "bewlyVideoDrawerHostFallbackIntent"')
    expect(mobileDesktopFallbackSource).toContain('var bewlyVideoDrawerHostFallbackInitialIntent = "";')
    expect(mobileDesktopFallbackSource).toContain('function persistBewlyVideoDrawerHostIntentFromPrelude(videoUrl)')
    expect(mobileDesktopFallbackSource).toContain('sessionStorage.setItem(bewlyVideoDrawerHostFallbackStorageKey, videoUrl)')
    expect(mobileDesktopFallbackSource).toContain('function getStoredBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('sessionStorage.getItem(bewlyVideoDrawerHostFallbackStorageKey)')
    expect(mobileDesktopFallbackSource).toContain('function clearStoredBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('sessionStorage.removeItem(bewlyVideoDrawerHostFallbackStorageKey)')
    expect(mobileDesktopFallbackSource).toContain('function getHashedBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('new URLSearchParams(hash).get("bewlyVideoDrawer")')
    expect(mobileDesktopFallbackSource).toContain('persistBewlyVideoDrawerHostIntentFromPrelude(drawerUrl)')
    expect(mobileDesktopFallbackSource).toContain('get("bewlyVideoDrawer")\n        || getHashedBewlyVideoDrawerHostIntentFromPrelude()\n        || getStoredBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('function rememberBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('function getRememberedBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('&& !!getRememberedBewlyVideoDrawerHostIntentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('function installBewlyVideoDrawerHostFallbackFromPrelude(drawerUrl)')
    expect(mobileDesktopFallbackSource).toContain('function resetBewlyVideoDrawerHostDocumentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('document.body.setAttribute("data-bewly-mobile-video-drawer-host-shell", "true")')
    expect(mobileDesktopFallbackSource).toContain('if (document.body) {\n        return installBewlyVideoDrawerHostFallbackFromPrelude(drawerUrl);')
    expect(mobileDesktopFallbackSource).toContain('var initialDrawerUrl = rememberBewlyVideoDrawerHostIntentFromPrelude();')
    expect(mobileDesktopFallbackSource).toContain('var drawerUrl = getRememberedBewlyVideoDrawerHostIntentFromPrelude() || initialDrawerUrl;')
    expect(mobileDesktopFallbackSource).not.toContain('document.open();')
    expect(mobileDesktopFallbackSource).not.toContain('document.write(')
    expect(mobileDesktopFallbackSource).not.toContain('document.close();')
    expect(mobileDesktopFallbackSource).toContain('var mountTarget = resetBewlyVideoDrawerHostDocumentFromPrelude()')
    expect(mobileDesktopFallbackSource).toContain('mountTarget.appendChild(root)')
    expect(mobileDesktopFallbackSource).toContain('consumeBewlyVideoDrawerHostIntentFromPrelude();')
    expect(mobileDesktopFallbackSource).toContain('clearStoredBewlyVideoDrawerHostIntentFromPrelude();')
    expect(mobileDesktopFallbackSource).toContain('var hasHashIntent = current.hash.indexOf("bewlyVideoDrawer=") !== -1;')
    expect(mobileDesktopFallbackSource).toContain('current.hash = "";')
    expect(mobileDesktopFallbackSource).toContain('iframe.removeAttribute("srcdoc")')
    expect(mobileDesktopFallbackSource).toContain('iframe.src = markBewlyVideoDrawerFrameUrlFromPrelude(drawerUrl)')
    expect(mobileDesktopFallbackSource).toContain('var enableBewlyVideoDrawerHostFallback = true;')
    expect(mobileDesktopFallbackSource).toContain('if (enableBewlyVideoDrawerHostFallback && scheduleBewlyVideoDrawerHostFallbackFromPrelude())')
    expect(mobileDesktopFallbackSource).toContain('return;')
  })

  it('keeps mobile author taps from falling through to the video card link', () => {
    expect(videoCardAuthorAvatarSource).toContain(':is="isMobileUserscriptPage ? \'span\' : \'a\'"')
    expect(videoCardAuthorAvatarSource).toContain('@pointerdown.stop')
    expect(videoCardAuthorAvatarSource).toContain('@click.stop="handleAuthorClick')
    expect(videoCardAuthorNameSource).toContain(':is="isMobileUserscriptPage ? \'span\' : \'a\'"')
    expect(videoCardAuthorNameSource).toContain('@click.stop="handleAuthorClick')
  })

  it('uses the custom inline player for mobile video-card previews', () => {
    expect(videoCardCoverSource).toContain('playsinline')
    expect(videoCardCoverSource).toContain('webkit-playsinline')
    expect(videoCardCoverSource).toContain('data-bewly-video-card-player="custom"')
    expect(videoCardCoverSource).toContain('@click.prevent.stop="togglePreviewPlayback"')
    expect(videoCardCoverSource).toContain('if (!previewPlaying.value || isLoadingStream.value || isPreviewFullscreen.value)')
    expect(videoCardCoverSource).not.toContain(':controls=')
  })

  it('loads mobile video detail comments with the currently populated reply mode', () => {
    expect(apiVideoSource).toContain('sort: 2')
    expect(apiVideoSource).toContain('\'User-Agent\': \'Mozilla/5.0')
    expect(mobileVideoDetailSource).toContain('commentsLoading')
    expect(mobileVideoDetailSource).toContain('commentsError')
    expect(mobileVideoDetailSource).toContain('sort: 2')
    expect(contentScriptSource).toContain('hideMobileVideoDetailCommentComposerElement')
    expect(contentScriptSource).not.toContain('openMobileVideoDetailCommentEditor')
    expect(contentScriptSource).toContain('data-bewly-mobile-comment-composer-open')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_COMMENT_COMPOSER_ATTR')
    expect(contentScriptSource).toContain('restoreMobileVideoDetailLoginCommentComposerMisfires(drawer)')
    expect(contentScriptSource).toContain('element.closest(\'.bili-mini-mask, [data-bewly-mobile-login-drawer="true"]\')')
    expect(contentScriptSource).toContain('forceMobileVideoDetailLoginDisplay(element, \'flex\')')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-comment-composer-open="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-toolbar-comment-entry="true"] {\n    display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('touch-action: manipulation !important')
  })

  it('derives mobile frame player UI state without DOM coupling', () => {
    expect(formatMobileVideoDetailFrameTime(61.9)).toBe('1:01')
    expect(formatMobileVideoDetailFrameTime(Number.NaN)).toBe('0:00')

    expect(createMobileVideoDetailFramePlayerViewState({
      currentTime: 45,
      danmakuHidden: true,
      duration: 90,
      paused: false,
      playbackRate: 1.5,
    })).toEqual({
      danmakuActive: false,
      danmakuLabel: '打开弹幕',
      playButtonAriaLabel: '暂停',
      progressValue: '500',
      selectedRate: '1.5',
      timeText: '0:45 / 1:30',
    })
  })

  it('keeps mobile video detail player controls usable on touch screens', () => {
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_BACK_BUTTON_ATTR')
    expect(contentScriptSource).toContain('removeMobileVideoDetailBackButton')
    expect(contentScriptSource).not.toContain('ensureMobileVideoDetailBackButton')
    expect(contentScriptSource).not.toContain('navigateMobileVideoDetailBack')
    expect(contentScriptSource).not.toContain('location.assign(\'https://www.bilibili.com/?page=Home\')')
    expect(contentScriptSource).not.toContain('ensureMobileVideoDetailToolbarCommentEntry(toolbar)')
    expect(contentScriptSource).not.toContain('installMobileVideoDetailNativePlayerControls')
    expect(contentScriptSource).not.toContain('showMobileVideoDetailNativePlayerControls')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_PLAYER_MENU_CONTROL_SELECTOR')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_PLAYER_MENU_OPEN_ATTR')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_PLAYER_MENU_SURFACE_ATTR')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_PLAYER_MENU_ACTIVATION_RETRY_DELAYS_MS')
    expect(contentScriptSource).toContain('requestMobileVideoDetailWebFullscreen')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameWebFullscreen')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR')
    expect(contentScriptSource).toContain('root.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR, \'true\')')
    expect(contentScriptSource).toContain('document.documentElement.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR, \'true\')')
    expect(contentScriptSource).not.toContain('document.documentElement.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_ATTR')
    expect(contentScriptSource).not.toContain('.requestFullscreen')
    expect(contentScriptSource).not.toContain('webkitRequestFullscreen')
    expect(contentScriptSource).not.toContain('fullscreenTarget')
    expect(contentScriptSource).not.toContain('requestMobileVideoDetailNativeFullscreen')
    expect(contentScriptSource).not.toContain('webkitEnterFullscreen')
    expect(contentScriptSource).not.toContain('webkitSetPresentationMode')
    expect(contentScriptSource).toContain('const bindMobileVideoDetailFrameActivation = (element: HTMLElement, action: () => void) => {')
    expect(contentScriptSource).not.toContain('element.addEventListener(\'pointerdown\', activate, { passive: false })')
    expect(contentScriptSource).toContain('element.addEventListener(\'pointerup\', activate, { passive: false })')
    expect(contentScriptSource).not.toContain('element.addEventListener(\'mousedown\', activate)')
    expect(contentScriptSource).not.toContain('element.addEventListener(\'mouseup\', activate)')
    expect(contentScriptSource).toContain('element.addEventListener(\'touchend\', activate, { passive: false })')
    expect(contentScriptSource).toContain('element.addEventListener(\'click\', activate)')
    expect(contentScriptSource).toContain('element.addEventListener(\'keydown\', activate)')
    expect(contentScriptSource).toContain('const handleDelegatedFramePlayerActivation = (event: Event) => {')
    expect(contentScriptSource).not.toContain('surface.addEventListener(\'pointerdown\', handleDelegatedFramePlayerActivation, { passive: false })')
    expect(contentScriptSource).toContain('surface.addEventListener(\'pointerup\', handleDelegatedFramePlayerActivation, { passive: false })')
    expect(contentScriptSource).toContain('surface.addEventListener(\'click\', handleDelegatedFramePlayerActivation)')
    expect(contentScriptSource).toContain('runMobileVideoDetailFramePlayerAction(actionName, actionTarget)')
    expect(contentScriptSource).toContain('toggleMobileVideoDetailFrameDanmaku(root)')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_FRAME_NATIVE_WEB_FULLSCREEN_SELECTOR')
    expect(contentScriptSource).not.toContain('activateMobileVideoDetailFrameNativeControl(playerWrapper')
    expect(contentScriptSource).toContain('dockMobileVideoDetailFrameRootForWebFullscreen(root, enabled)')
    expect(contentScriptSource).toContain('restoreMobileVideoDetailFrameRootHome(root)')
    expect(contentScriptSource).toContain('mobileVideoDetailFrameLastFullscreenToggleAt')
    expect(contentScriptSource).toContain('now - mobileVideoDetailFrameLastFullscreenToggleAt < 650')
    expect(contentScriptSource).toContain('setMobileVideoDetailFramePageFullscreenLock(enabled)')
    expect(contentScriptSource).toContain('installMobileVideoDetailFrameVolumeGesture(root, video, videoSourceKey)')
    expect(contentScriptSource).not.toContain('fullscreenButton.textContent = \'全屏\'')
    expect(contentScriptSource).not.toContain('playButton.textContent = viewState.playButtonText')
    expect(contentScriptSource).toContain('const MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_VERSION')
    expect(contentScriptSource).toContain('control-row-page-fullscreen-v14')
    expect(contentScriptSource).toContain('function shouldRebuildMobileVideoDetailFrameToolbar')
    expect(contentScriptSource).toContain('playButton.type = \'button\'')
    expect(contentScriptSource).not.toContain('playButton.title = \'播放或暂停\'')
    expect(contentScriptSource).toContain('playButton.setAttribute(\'aria-label\', \'切换播放\')')
    expect(contentScriptSource).toContain('playButton.setAttribute(\'data-bewly-mobile-frame-player-action\', \'play-toggle\')')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameIconButton(playButton')
    const playButtonBlock = contentScriptSource.slice(
      contentScriptSource.indexOf('const playButton = document.createElement(\'button\')'),
      contentScriptSource.indexOf('const togglePlayback = () => {'),
    )
    expect(contentScriptSource).toContain('\'grid-template-areas\': \'"play progress danmaku fullscreen"\'')
    expect(contentScriptSource).toContain('\'grid-template-columns\': \'auto minmax(0, 1fr) auto auto\'')
    expect(playButtonBlock).toContain('\'display\': \'grid\'')
    expect(playButtonBlock).toContain('\'grid-area\': \'play\'')
    expect(playButtonBlock).toContain('\'position\': \'relative\'')
    expect(playButtonBlock).not.toContain('\'position\': \'absolute\'')
    expect(playButtonBlock).not.toContain('\'order\': \'-3\'')
    expect(playButtonBlock).not.toContain('\'transform\': \'translateY(-50%)\'')
    expect(playButtonBlock).not.toContain('rgba(251, 114, 153')
    expect(playButtonBlock).toContain('\'background\': \'rgba(10, 12, 16, 0.72)\'')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameIconButton(fullscreenButton, \'fullscreen\')')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameIconButton(mainDanmakuButton')
    expect(contentScriptSource).toContain('progressWrap.append(timeLabel, progress)')
    expect(contentScriptSource).toContain('mainBar.append(playButton, progressWrap, mainDanmakuButton, fullscreenButton)')
    expect(contentScriptSource).toContain('playButton.style.setProperty(\'display\', \'grid\', \'important\')')
    expect(contentScriptSource).toContain('viewState.playButtonAriaLabel === \'播放\' ? \'播放视频\' : \'暂停视频\'')
    expect(contentScriptSource).toContain('bindMobileVideoDetailFrameActivation(fullscreenButton')
    expect(contentScriptSource).toContain('bindMobileVideoDetailFrameActivation(button, action)')
    expect(contentScriptSource).toContain('createSettingRow(\'网页全屏\', sheetFullscreenButton)')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameIconButton(button, iconName)')
    expect(contentScriptSource).not.toContain('createSettingRow(\'静音播放\'')
    expect(contentScriptSource).not.toContain('createSettingRow(\'弹幕\'')
    expect(contentScriptSource).not.toContain('createSettingRow(\'循环播放\'')
    expect(contentScriptSource).not.toContain('createSettingRow(\'原生全屏\'')
    expect(contentScriptSource).not.toContain('data-bewly-mobile-frame-player-action\', \'mute\'')
    expect(contentScriptSource).not.toContain('data-bewly-mobile-frame-player-action\', \'loop\'')
    expect(contentScriptSource).toContain('const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_ATTR = \'data-bewly-mobile-video-drawer-host-fallback\'')
    expect(contentScriptSource).toContain('const MOBILE_VIDEO_DRAWER_HOST_FALLBACK_RETRY_DELAYS_MS')
    expect(contentScriptSource).toContain('function isMobileVideoDrawerHostFallbackRuntimePage')
    expect(contentScriptSource).toContain('&& (parsed.hostname === \'www.bilibili.com\' || parsed.hostname === \'bilibili.com\')')
    expect(contentScriptSource).toContain('function scheduleMobileVideoDrawerHostFallback')
    expect(contentScriptSource).toContain('tryInstall(retryIndex + 1)')
    expect(contentScriptSource).toContain('installMobileVideoDrawerHostFallback(drawerUrl)')
    expect(contentScriptSource).toContain('const ENABLE_MOBILE_VIDEO_DRAWER_HOST_FALLBACK = false')
    expect(contentScriptSource).toContain('if (ENABLE_MOBILE_VIDEO_DRAWER_HOST_FALLBACK)\n  scheduleMobileVideoDrawerHostFallback()')
    expect(contentScriptSource).toContain('function resetMobileVideoDrawerHostDocument')
    expect(contentScriptSource).toContain('document.body.setAttribute(\'data-bewly-mobile-video-drawer-host-shell\', \'true\')')
    expect(contentScriptSource).toContain('if (!document.body) {')
    expect(contentScriptSource).not.toContain('document.open()')
    expect(contentScriptSource).not.toContain('document.write(')
    expect(contentScriptSource).not.toContain('document.close()')
    expect(contentScriptSource).toContain('consumeMobileVideoDrawerHostIntentParam()')
    expect(contentScriptSource).toContain('const mountTarget = resetMobileVideoDrawerHostDocument()')
    expect(contentScriptSource).toContain('mountTarget.append(root)')
    expect(contentScriptSource).toContain('iframe.src = markBewlyMobileVideoDrawerFrameUrl(drawerUrl)')
    expect(contentScriptSource).toContain('bindMobileVideoDrawerHostFallbackDrag(root, handle)')
    expect(mobileSource).toContain('[data-bewly-mobile-video-drawer-host-fallback="true"]')
    expect(contentScriptSource).toContain('if (isInIframe())')
    expect(contentScriptSource).toContain('document.documentElement.setAttribute(\'data-bewly-mobile-video-detail\', \'true\')')
    expect(contentScriptSource).toContain('function shouldUseMobileVideoDetailLayoutForCurrentDocument')
    expect(contentScriptSource).toContain('if (!isInIframe() && shouldRedirectMobileVideoDetailToDrawer)')
    expect(contentScriptSource).toContain('const shouldApply = shouldUseMobileVideoDetailLayoutForCurrentDocument(url)')
    expect(contentScriptSource).toContain('document.documentElement.setAttribute(\'data-bewly-mobile-video-detail-frame\', \'true\')')
    expect(contentScriptSource).toContain('mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)')
    expect(contentScriptSource).toContain('getMobileVideoDetailFrameCssForCurrentPage')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_CSS.replaceAll')
    expect(contentScriptSource).toContain('mobileVideoDetailFrameStyleEl = injectCSS(getMobileVideoDetailFrameCssForCurrentPage())')
    expect(contentScriptSource).toContain('startMobileVideoDetailStructureEnhancement()')
    expect(contentScriptSource).toContain('startMobileVideoDetailFrameEnhancement()')
    expect(contentScriptSource).toContain('if (player) {\n    markMobileVideoDetailPlayerCard(player)')
    expect(contentScriptSource).toContain('syncMobileVideoDetailPlayerMediaOrientation(player)')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailFrameToolbar')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR')
    expect(mobileSource).toContain('globalThis.matchMedia?.(\'(orientation: portrait)\')')
    expect(mobileSource).toContain('globalThis.matchMedia?.(\'(orientation: landscape)\')')
    expect(mobileSource).toContain('if (viewportWidth <= 980 && viewportWidth < viewportHeight * 1.45)')
    expect(mobileDesktopFallbackSource).toContain('if (viewportWidth <= 980 && viewportWidth < viewportHeight * 1.45)')
    expect(mobileDesktopFallbackSource).toContain('function scheduleBewlyVideoDrawerPreludeRetry')
    expect(mobileDesktopFallbackSource).toContain('function isBewlyOwnVideoDrawerFrame')
    expect(mobileDesktopFallbackSource).toContain('document.referrer.indexOf("bewlyVideoDrawer=") !== -1')
    expect(mobileSource.indexOf('const portraitMediaQuery = globalThis.matchMedia?.(\'(orientation: portrait)\')')).toBeLessThan(
      mobileSource.indexOf('const screenOrientationType = getScreenOrientationType()'),
    )
    expect(contentScriptSource).toContain('syncMobileVideoDetailFrameOverlayState')
    expect(contentScriptSource).toContain('document.documentElement.setAttribute(MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR, \'true\')')
    expect(contentScriptSource).not.toContain('document.documentElement.toggleAttribute(MOBILE_VIDEO_DETAIL_FRAME_OVERLAY_ATTR')
    expect(contentScriptSource).toContain('if (!syncMobileVideoDetailFrameOverlayState())\n    return true')
    expect(contentScriptSource).toContain('window.visualViewport?.addEventListener(\'resize\', mobileVideoDetailFrameViewportHandler)')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYER_TOOLBAR_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYBACK_RATES')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_DANMAKU_HIDDEN_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYER_CONTROLS_VISIBLE_ATTR')
    expect(contentScriptSource).toContain('const MOBILE_VIDEO_DETAIL_FRAME_CONTROLS_IDLE_MS = 4800')
    expect(contentScriptSource).toContain('scheduleControlsAutoHide')
    expect(contentScriptSource).toContain('let controlsIdleToken = 0')
    expect(contentScriptSource).toContain('const scheduledControlsIdleToken = controlsIdleToken + 1')
    expect(contentScriptSource).toContain('scheduledControlsIdleToken === controlsIdleToken')
    expect(contentScriptSource).toContain('if (video.paused || !actionSheet.hidden) {')
    expect(contentScriptSource).toContain('if (scheduledControlsIdleToken === controlsIdleToken && !video.paused && actionSheet.hidden)\n          setControlsVisible(false)')
    expect(contentScriptSource).not.toContain('video.paused || !actionSheet.hidden || currentToolbar.hasAttribute(MOBILE_VIDEO_DETAIL_FRAME_PLAYER_DETACHED_ATTR)')
    expect(contentScriptSource).toContain('const setMobileVideoDetailFrameControlGroupVisible = (element: HTMLElement, visible: boolean, hiddenTransform: string) => {')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameControlGroupVisible(topBar, visible, \'translateY(-8px)\')')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameControlGroupVisible(mainBar, visible, \'translateY(10px)\')')
    expect(contentScriptSource).toContain('root.addEventListener(\'pointerdown\', revealControls, { capture: true })')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR')
    expect(contentScriptSource).toContain('function markMobileVideoDetailPlayerCard(player: HTMLElement): void')
    expect(contentScriptSource).toContain('player.setAttribute(MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR, \'true\')')
    expect(contentScriptSource).not.toContain('if (isInIframe())\n      player.setAttribute(MOBILE_VIDEO_DETAIL_PLAYER_CARD_ATTR, \'true\')')
    expect(contentScriptSource).toContain('if (isInIframe())\n    return')
    expect(contentScriptSource).toContain('#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, .bilibili-player')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR')
    expect(contentScriptSource).toContain('const labelledPlayer = media.closest(\'[aria-label*="播放器"]\')')
    expect(contentScriptSource).not.toContain('document.querySelector(MOBILE_VIDEO_DETAIL_PLAYER_ROOT_SELECTOR +')
    expect(contentScriptSource).toContain('findMobileVideoDetailPlayerFromMedia')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_MEDIA_ORIENTATION_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_PLAYER_MEDIA_ORIENTATION_ATTR')
    expect(contentScriptSource).toContain('getMobileVideoDetailMediaOrientation')
    expect(contentScriptSource).toContain('syncMobileVideoDetailPlayerMediaOrientation(player)')
    expect(contentScriptSource).toContain('video.videoWidth')
    expect(contentScriptSource).toContain('video.videoHeight')
    expect(contentScriptSource).toContain('#app')
    expect(contentScriptSource).toContain('#i_cecream')
    expect(contentScriptSource).toContain('hasMobileVideoDetailFrameNativeControlBar')
    expect(contentScriptSource).toContain('findMobileVideoDetailFrameOverlayRoot')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailFramePlayerSpacer(root)')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_VOLUME_GESTURE_THRESHOLD_PX')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_NATIVE_DUPLICATE_CONTROL_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_NATIVE_VIEWER_SOURCE_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_WEB_FULLSCREEN_LOCK_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_VIEWER_TEXT_PATTERN')
    expect(contentScriptSource).toContain('syncMobileVideoDetailFrameNativeControlVisibility(root)')
    expect(contentScriptSource).toContain('hideMobileVideoDetailFrameNativeDuplicateControl')
    expect(contentScriptSource).toContain('[class*="danmu" i], [class*="danmaku" i], [class*="barrage" i], [class*="dm" i]')
    expect(contentScriptSource).toContain('document.querySelectorAll<HTMLElement>(`[')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_NATIVE_DUPLICATE_CONTROL_ATTR}="true"], [')
    expect(contentScriptSource).toContain('const scopes = [root, document.body].filter')
    expect(contentScriptSource).toContain('findMobileVideoDetailFrameViewerText(root)')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-volume-hud')
    expect(contentScriptSource).toContain('isMobileVideoDetailFrameVideoVisibleInsideRoot(video, root)')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYER_DETACHED_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYER_SPACER_ATTR')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_FRAME_PLAYER_HOME_ATTR')
    expect(contentScriptSource).toContain('const mobileVideoDetailFrameRootHomes = new WeakMap<HTMLElement, HTMLElement>()')
    expect(contentScriptSource).toContain('removeMobileVideoDetailFrameToolbars')
    expect(contentScriptSource).toContain('[data-bewly-mobile-frame-player-floating="true"]')
    expect(contentScriptSource).toContain('const controlledRoot = Array.from(document.querySelectorAll<HTMLElement>(\'[class*="player"], [class*="Player"]\'))')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-kind')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-version')
    expect(contentScriptSource).toContain('app-like')
    expect(contentScriptSource).toContain('BEWLY_DRAWER_CLOSE_REQUEST')
    expect(contentScriptSource).toContain('getMobileVideoDetailFrameTitle')
    expect(contentScriptSource).toContain('titleLabel.textContent = getMobileVideoDetailFrameTitle()')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-topbar')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-scrim')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-sheet-handle')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-sheet-title')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-active')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-floating')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-mainbar')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-progress')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-actions')
    expect(contentScriptSource).toContain('data-bewly-mobile-frame-player-viewers')
    expect(contentScriptSource).toContain('bili-comments')
    expect(contentScriptSource).toContain('data-bewly-mobile-comment-shadow-style')
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailCommentShadowStyles')
    expect(contentScriptSource).toContain('#limit-mask {\n    position: static !important')
    expect(contentScriptSource).toContain('#limit-mask-wall')
    expect(contentScriptSource).toContain('#limit-mask-wall::before')
    expect(contentScriptSource).toContain('#limit-mask-wall::after')
    expect(contentScriptSource).toContain('width: min(88%, 320px) !important')
    expect(contentScriptSource).toContain('bili-comment-renderer')
    expect(contentScriptSource).toContain('bili-rich-text')
    expect(contentScriptSource).toContain('toolbar.append(topBar, mainBar)')
    expect(contentScriptSource).toContain('topBar.append(titleLabel, viewerLabel)')
    expect(contentScriptSource).not.toContain('topMoreButton')
    expect(contentScriptSource).not.toContain('data-bewly-mobile-frame-player-action\', \'more\'')
    expect(contentScriptSource).not.toContain('topBar.append(backButton')
    expect(contentScriptSource).not.toContain('data-bewly-mobile-frame-player-action\', \'back\'')
    expect(contentScriptSource).toContain('root.append(toolbar)')
    expect(contentScriptSource).toContain('(document.body ?? root).append(scrim, actionSheet)')
    expect(contentScriptSource).toContain('window.addEventListener(\'scroll\', syncToolbar, { capture: true, passive: true })')
    expect(contentScriptSource).toContain('createMobileVideoDetailFramePlayerViewState')
    expect(contentScriptSource).toContain('from \'./mobileVideoFramePlayerState\'')
    expect(contentScriptSource).toContain('installMobileVideoDetailFrameSheetDrag')
    expect(contentScriptSource).not.toContain('lastSheetToggleAt')
    expect(contentScriptSource).not.toContain('now - lastSheetToggleAt < 280')
    expect(contentScriptSource).toContain('closeMobileVideoDetailFramePanels')
    expect(mobileVideoFramePlayerStateSource).toContain('export function formatMobileVideoDetailFrameTime')
    expect(mobileVideoFramePlayerStateSource).toContain('export function createMobileVideoDetailFramePlayerViewState')
    expect(contentScriptSource).toContain('video.currentTime = (Number(progress.value) / 1000) * duration')
    expect(contentScriptSource).not.toContain('video.muted = !video.muted')
    expect(contentScriptSource).not.toContain('video.loop = !video.loop')
    expect(contentScriptSource).toContain('requestMobileVideoDetailWebFullscreen(root)')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-web-fullscreen="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-web-fullscreen="true"] body')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('overscroll-behavior: none !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('position: fixed !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('inset: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('transform: none !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-web-fullscreen-lock="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('height: 100dvh !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('object-fit: contain !important')
    expect(contentScriptSource).toContain('setMobileVideoDetailFrameDanmakuHidden(root')
    expect(contentScriptSource).not.toContain('closeMobileVideoDetailFrameSpeedMenus')
    expect(contentScriptSource).not.toContain('speedMenu.hidden')
    expect(contentScriptSource).not.toContain('openMobileVideoDetailFrameNativeQuality(root)')
    expect(contentScriptSource).not.toContain('selectMobileVideoDetailFrameNativeOption(root, label)')
    expect(contentScriptSource).not.toContain('withMobileVideoDetailFrameTemporaryNativeControlAccess')
    expect(contentScriptSource).not.toContain('showMobileVideoDetailNativePlayerMenu')
    expect(contentScriptSource).not.toContain('dispatchMobileVideoDetailNativePlayerMenuHover')
    expect(contentScriptSource).not.toContain('dispatchMobileVideoDetailNativePlayerMenuActivation')
    expect(contentScriptSource).not.toContain('activateMobileVideoDetailNativePlayerMenu')
    expect(contentScriptSource).toContain('toolbar.querySelectorAll<HTMLElement>(\'[data-bewly-mobile-toolbar-comment-entry="true"]\').forEach(entry => entry.remove())')
    expect(contentScriptSource).toContain('data-bewly-mobile-toolbar-action-hidden')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_TOOLBAR_FAVORITE_ATTR')
    expect(contentScriptSource).not.toContain('MOBILE_VIDEO_DETAIL_TOOLBAR_ACTION_HIDDEN_ATTR')
    expect(contentScriptSource).not.toContain('/收藏|favou?rite|collect|stow|star/i')
    expect(contentScriptSource).toContain('data-bewly-mobile-toolbar-back-hidden')
    expect(contentScriptSource).toContain('capture: true')
    expect(contentScriptSource).not.toContain('getMobileVideoDetailPlayerControlSignature')
    expect(contentScriptSource).not.toContain('isMobileVideoDetailQualityControlSignature')
    expect(contentScriptSource).not.toContain('isMobileVideoDetailSpeedControlSignature')
    expect(contentScriptSource).not.toContain('isMobileVideoDetailSubtitleControlSignature')
    expect(contentScriptSource).not.toContain('mobileVideoDetailDispatchingNativeMenuActivation')
    expect(contentScriptSource).not.toContain('player.setAttribute(\'data-bewly-mobile-player-card\'')
    expect(contentScriptSource).not.toContain('mainColumn.insertBefore(player')
    expect(contentScriptSource).not.toContain('hideMobileVideoDetailPrePlayerSiblings(player)')
    expect(contentScriptSource).not.toContain('hideMobileVideoDetailPlayerTopPromotions(player)')
    expect(contentScriptSource).not.toContain('hideMobileVideoDetailGlobalPrePlayerBlocks(player)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-player-card="true"] :is(#playerWrap, .player-wrap, #bilibili-player')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] #bewly')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] .right-container')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-top')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-height')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-height: min(calc(100vw * 9 / 16)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-media-orientation="portrait"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-height: min(calc(100vw * 16 / 9), calc(82dvh')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-flow-offset')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-flow-offset: 0px')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-detail-toolbar-left: 0px')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.left-container.scroll-sticky')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('position: static !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] [data-bewly-mobile-player-card="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('html[data-bewly-mobile-video-detail="true"] [aria-label*="播放器"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('position: sticky !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: 100vw !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-width: 100vw !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('border-radius: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('box-shadow: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-player-card="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [aria-label*="播放器"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('html[data-bewly-mobile-video-detail="true"][data-bewly-mobile-video-detail-frame="true"] [data-bewly-mobile-player-card="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('position: sticky !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('margin: 0 calc(50% - 50vw) 10px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('top: var(--bewly-mobile-player-fixed-top) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] #app')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('padding-top: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('padding: 0 var(--bewly-mobile-detail-inline-pad)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('z-index: 2147482500 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-player-card="true"] :is(#playerWrap, .player-wrap')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-player-card="true"]:is(#playerWrap, .player-wrap)')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('[data-bewly-mobile-video-back="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-toolbar-back-hidden="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: 100% !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('z-index: 20 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('[data-bewly-mobile-player-controls-visible="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('[data-bewly-mobile-player-menu-open="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('[data-bewly-mobile-player-menu-surface="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('.bpx-player-control-wrap')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('object-fit: contain !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-control-height')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-control-min-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-control-text-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-time-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-control-gap')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-controls-right-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-top-control-height')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-top-control-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('--bewly-mobile-player-bottom-actions-width')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('max-width: calc(100% - var(--bewly-mobile-player-controls-right-width)) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('max-width: var(--bewly-mobile-player-controls-right-width) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('.bpx-player-control-bottom::-webkit-scrollbar')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('top: clamp(6px, 1.6dvh, 10px) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('right: calc(var(--bewly-mobile-detail-inline-pad) + var(--bewly-mobile-player-bottom-actions-width)) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('pointer-events: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('margin: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-toolbar-comment-entry="true"] {\n    display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('[data-bewly-mobile-toolbar-favorite="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('top: calc(var(--bewly-mobile-player-fixed-top) + clamp(8px, 2dvh, 12px)) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('order: 56 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('min-height: clamp(42px, 7dvh, 52px) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('overflow-x: auto !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).not.toContain('order: 30 !important;\n    position: static !important;\n    width: 100% !important;\n    min-width: 0 !important;\n    min-height: 0 !important;\n    height: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('pointer-events: auto !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('html[data-bewly-mobile-video-detail-frame="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('.squirtle-quality-panel')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('.squirtle-subtitle-panel')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('.squirtle-volume-panel')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('[class*="quality"][class*="panel"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-toolbar="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('html[data-bewly-mobile-video-detail-frame="true"] [data-bewly-mobile-frame-player-toolbar="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] [data-bewly-mobile-frame-player-root="true"] :is(')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('html[data-bewly-mobile-video-detail-frame="true"] [data-bewly-mobile-frame-player-root="true"] :is(')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-toolbar="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-root="true"] {\n    position: fixed !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-spacer="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-home="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-toolbar="true"] {\n    position: absolute !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-toolbar="true"][data-bewly-mobile-frame-player-detached]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-toolbar="true"][data-bewly-mobile-frame-player-detached] {\n    opacity: 1 !important;\n    visibility: visible !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('[data-bewly-mobile-frame-player-toolbar="true"][data-bewly-mobile-frame-player-detached] {\n    opacity: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('height: 100% !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('touch-action: none !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-scrim="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('background: rgba(0, 0, 0, 0.58) !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-topbar="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('grid-template-columns: minmax(0, 1fr) auto !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-title="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-viewers="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-viewers="true"][hidden]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-native-duplicate-control="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-native-viewer-source="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('html[data-bewly-mobile-video-detail-frame="true"][data-bewly-mobile-video-detail-frame-overlay="true"] :is(')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bili-mini-mask')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bili-mini')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.mplayer-danmaku-switch')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[class*="danmu" i][class*="btn" i]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[class*="barrage" i][class*="button" i]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('display: none !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85)')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-mainbar="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain(':not([data-bewly-mobile-frame-player-controls-visible])')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('transform: translateY(10px) !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-progress="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-actions="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-sheet-handle="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-sheet-title="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('display: grid !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('grid-template-areas: "play progress danmaku fullscreen" !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('grid-template-columns: auto minmax(0, 1fr) auto auto !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('flex: 1 1 52px !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('flex: 0 0 clamp(32px, 8.4vw, 36px) !important')
    const frameMainbarCss = MOBILE_VIDEO_DETAIL_FRAME_CSS.slice(
      MOBILE_VIDEO_DETAIL_FRAME_CSS.indexOf('[data-bewly-mobile-frame-player-mainbar="true"] {'),
      MOBILE_VIDEO_DETAIL_FRAME_CSS.indexOf('[data-bewly-mobile-frame-player-toolbar="true"] [data-bewly-mobile-frame-player-topbar="true"]'),
    )
    expect(frameMainbarCss).toContain('env(safe-area-inset-left, 0px)) !important')
    expect(frameMainbarCss).not.toContain('calc(env(safe-area-inset-left, 0px) + 44px)')
    const playToggleCss = MOBILE_VIDEO_DETAIL_FRAME_CSS.slice(
      MOBILE_VIDEO_DETAIL_FRAME_CSS.indexOf('[data-bewly-mobile-frame-player-action="play-toggle"] {'),
      MOBILE_VIDEO_DETAIL_FRAME_CSS.indexOf('[data-bewly-mobile-frame-player-volume-hud="true"] {'),
    )
    expect(playToggleCss).not.toContain('position: absolute !important')
    expect(playToggleCss).not.toContain('transform: translateY(-50%)')
    expect(playToggleCss).not.toContain('order: -3 !important')
    expect(playToggleCss).toContain('display: grid !important')
    expect(playToggleCss).toContain('grid-area: play !important')
    expect(playToggleCss).not.toContain('background: rgba(251, 114, 153, 0.92) !important')
    expect(playToggleCss).toContain('background: rgba(10, 12, 16, 0.72) !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-volume-hud="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('max(clamp(48px, 12vw, 56px), calc(env(safe-area-inset-left, 0px) + 48px)) !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('border-radius: 18px 18px 0 0 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('background: #171a21 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('accent-color: #fb7299 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('color: #fb7299 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-active]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.squirtle-controller')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bpx-player-sending-bar')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bpx-player-video-inputbar')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bpx-player-sending-area')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('#bilibili-player-placeholder-bottom')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('.bpx-player-ctrl-back')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('visibility: hidden !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-player-speed-menu="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('[data-bewly-mobile-frame-danmaku-hidden]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).not.toContain('[data-bewly-mobile-frame-player-toggle-row="true"]')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('bottom: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_FRAME_CSS).toContain('env(safe-area-inset-bottom, 0px)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color-scheme: dark')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-detail-bg: #0f1115')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-comment-text: #e8ecf2')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('bili-comments')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.reply-content')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('color: var(--bewly-mobile-comment-text) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-detail-accent: #fb7299')
  })

  it('keeps the mobile video detail author card compact under the sticky player', () => {
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailAuthorCards')
    expect(contentScriptSource).toContain('.up-panel-container, .members-info-container, .video-staffs-container')
    expect(contentScriptSource).toContain('data-bewly-mobile-author-normalized')
    expect(contentScriptSource).toContain('data-bewly-mobile-author-avatar')
    expect(contentScriptSource).toContain('data-bewly-mobile-author-actions')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-detail-author-card-height: clamp(')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: var(--bewly-mobile-detail-author-card-height) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('min-height: var(--bewly-mobile-detail-author-card-height) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: var(--bewly-mobile-detail-author-card-height) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('grid-template-columns: var(--bewly-mobile-detail-author-avatar) minmax(0, 1fr) auto !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: var(--bewly-mobile-detail-author-avatar) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('left: calc(var(--bewly-mobile-detail-author-avatar)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('right: calc(var(--bewly-mobile-detail-author-button-width)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: var(--bewly-mobile-detail-author-button-width) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: calc(var(--bewly-mobile-detail-author-button-height) - 2px) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-author-card="true"] .new-charge-btn')
  })

  it('keeps the mobile login drawer viewport-responsive', () => {
    expect(mobileSource).toContain('--bewly-mobile-login-drawer-max-height: min(86dvh')
    expect(mobileSource).toContain('--bewly-mobile-login-drag-height: clamp(')
    expect(mobileSource).toContain('--bewly-mobile-login-control-size: clamp(')
    expect(mobileSource).toContain('installMobileUserscriptZoomGuard()')
    expect(mobileSource).toContain('removeMobileUserscriptZoomGuard()')
    expect(mobileSource).toContain('document.addEventListener(\'gesturestart\'')
    expect(mobileSource).toContain('event.touches.length > 1')
    expect(mobileSource).toContain('touch-action: pan-x pan-y')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: 100vw !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 100dvh !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: var(--bewly-mobile-login-drawer-max-height) !important')
  })

  it('hides the mobile video detail tag area so the intro follows the author card', () => {
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.video-tag-container')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('margin: 0 !important')
  })

  it('marks the userscript runtime in both page and content globals for Safari Userscripts', () => {
    expect(buildUserscriptSource).toContain('globalThis.__BEWLYSCRIPT__ = true')
    expect(buildUserscriptSource).toContain('globalObject.__BEWLYSCRIPT__ = true')
    expect(buildUserscriptSource).toContain('window.__BEWLYSCRIPT__ = true')
    expect(mobileSource).toContain('(globalThis as BewlyUserscriptRuntimeGlobal).__BEWLYSCRIPT__')
    expect(mobileSource).toContain('(window as unknown as BewlyUserscriptRuntimeGlobal).__BEWLYSCRIPT__')
  })
})
