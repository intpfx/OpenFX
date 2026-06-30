import { describe, expect, it } from 'vitest'

import apiVideoSource from '../background/messageListeners/api/video.ts?raw'
import topBarSearchSource from '../components/TopBar/components/TopBarSearch.vue?raw'
import videoCardCoverSource from '../components/VideoCard/components/VideoCardCover.vue?raw'
import videoCardAuthorAvatarSource from '../components/VideoCard/VideoCardAuthor/components/VideoCardAuthorAvatar.vue?raw'
import videoCardAuthorNameSource from '../components/VideoCard/VideoCardAuthor/components/VideoCardAuthorName.vue?raw'
import contentScriptSource from '../contentScripts/index.ts?raw'
import mobileVideoDetailSource from '../contentScripts/views/VideoDetail/VideoDetail.vue?raw'
import { AppPage } from '../enums/appEnums'
import {
  classifyMobileBilibiliPage,
  classifyMobileTakeoverBilibiliPage,
  getBewlyUserscriptHomeUrl,
  injectMobileNativeHeaderCSS,
  isBilibiliVideoDetailPage,
  isDesktopPortraitUserscriptRuntimePage,
  isMobileBilibiliHomePage,
  isMobileBilibiliPage,
  isMobileUserscriptRuntimePage,
  MOBILE_VIDEO_DETAIL_CSS,
  normalizeBilibiliUrlForCurrentSurface,
  removeMobileNativeHeaderCSS,
  shouldEnableHoverInteractions,
  shouldHideMobileNativeContentForPage,
  shouldPreferTouchMode,
  shouldUseMobileVideoDetailLayout,
} from '../userscript/mobile'
import { getMobileRouteAppPage, isCoreMobileRoute, parseMobileRoute } from '../userscript/mobile-route'
import { parseDanmakuXml, parseMobileVideoUrl, selectPlayableVideoUrl } from '../userscript/mobile-video'

function withViewportWidth(width: number, callback: () => void) {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })

  try {
    callback()
  }
  finally {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalWidth,
    })
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

    expect(style?.textContent).toContain(':not([data-bewly-mobile-page-kind="other"])')
    expect(document.documentElement.getAttribute('data-bewly-mobile')).toBe('true')
    expect(document.documentElement.getAttribute('data-bewly-mobile-page-kind')).toBe('video')

    removeMobileNativeHeaderCSS(style)
  })

  it('detects mobile home without broadening desktop homepage matching', () => {
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/')).toBe(true)
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/video/BV123')).toBe(false)
  })

  it('hides native desktop content only for portrait Bewly shell pages', () => {
    withUserscriptRuntime(() => {
      withViewportWidth(402, () => {
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

    withUserscriptRuntime(() => {
      withViewportWidth(900, () => {
        expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/?page=Home')).toBe(false)
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

  it('uses the mobile video detail layout only for narrow desktop video surfaces', () => {
    withViewportWidth(402, () => {
      expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/video/BV123')).toBe(false)
      expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
    })

    withViewportWidth(900, () => {
      expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(false)
      expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/search?keyword=test')).toBe(false)
    })
  })

  it('turns the native desktop login modal into a narrow bottom drawer', () => {
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] .bili-mini-mask')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-content-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('align-items: flex-end')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('border-radius: 24px 24px 0 0')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('env(safe-area-inset-bottom')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-drawer="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('padding-top: 48px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('data-bewly-mobile-login-settling')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('data-bewly-mobile-login-closing')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('will-change: transform !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-drag-handle="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 44px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('touch-action: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('cursor: grabbing !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.login-scan-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bili-mini-login-right-wp')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-login-methods="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('html[data-bewly-mobile-video-detail="true"] .bili-mini-mask .login-scan-wp')
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
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('normalizeMobileVideoDetailLoginForms')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailLoginDragHandle')
    expect(contentScriptSource).toContain('closeMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('forceMobileVideoDetailLoginDisplay')
    expect(contentScriptSource).toContain('applyMobileVideoDetailLoginDrawerOffset')
    expect(contentScriptSource).toContain('reboundMobileVideoDetailLoginDrawer')
    expect(contentScriptSource).toContain('animateMobileVideoDetailLoginDrawerClose')
    expect(contentScriptSource).toContain('translate3d(0, ${clampedOffset}px, 0)')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_REBOUND_TRANSITION')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_CLOSE_TRANSITION')
    expect(contentScriptSource).toContain('setPointerCapture')
    expect(contentScriptSource).toContain("window.addEventListener('pointerup', finishDrag)")
    expect(contentScriptSource).toContain("mask.style.setProperty('display', 'none', 'important')")
    expect(contentScriptSource).toContain('lastY = event.clientY')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_LOGIN_DRAG_THRESHOLD_PX')
    expect(contentScriptSource).toContain('.bili-mini-login-right-wp')
    expect(contentScriptSource).toContain('.tab__form .form__item, .tab__form input')
    expect(contentScriptSource).toContain('.login-pwd-wp, .tab__form')
    expect(contentScriptSource).toContain("forceMobileVideoDetailLoginDisplay(item, 'flex')")
    expect(contentScriptSource).toContain("style.setProperty('display', 'flex', 'important')")
    expect(contentScriptSource).toContain("element.style.setProperty('display', display, 'important')")
  })

  it('treats narrow desktop core pages as the portrait userscript surface without enabling m-site takeover', () => {
    withUserscriptRuntime(() => {
      withViewportWidth(402, () => {
        expect(isMobileUserscriptRuntimePage('https://m.bilibili.com/?page=Home')).toBe(false)
        expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(true)
        expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/search?keyword=test')).toBe(true)
        expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/video/BV123')).toBe(true)
        expect(isDesktopPortraitUserscriptRuntimePage('https://www.bilibili.com/read/cv123')).toBe(false)
      })
    })

    withUserscriptRuntime(() => {
      withViewportWidth(900, () => {
        expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(false)
      })
    })
  })

  it('keeps Bewly page URLs on the desktop Bilibili surface', () => {
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://m.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://www.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
  })

  it('normalizes bilibili URLs to the desktop surface host', () => {
    expect(normalizeBilibiliUrlForCurrentSurface('https://www.bilibili.com/video/BV123', 'https://m.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123?t=8&p=2', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123?t=8&p=2')
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
    expect(topBarSearchSource).toContain('showMobileLoginPanel.value = true')
    expect(topBarSearchSource).toContain('class="mobile-login-panel"')
    expect(topBarSearchSource).toContain(':src="BILIBILI_LOGIN_URL"')
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
  })

  it('keeps mobile video detail player controls usable on touch screens', () => {
    expect(contentScriptSource).toContain('installMobileVideoDetailNativePlayerControls')
    expect(contentScriptSource).toContain('showMobileVideoDetailNativePlayerControls')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_BACK_BUTTON_ATTR')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailBackButton')
    expect(contentScriptSource).toContain('ensureMobileVideoDetailBackButton(toolbar)')
    expect(contentScriptSource).toContain('removeMobileVideoDetailBackButton')
    expect(contentScriptSource).toContain('navigateMobileVideoDetailBack')
    expect(contentScriptSource).toContain("location.assign('https://www.bilibili.com/?page=Home')")
    expect(contentScriptSource).toContain('getMobileVideoDetailEventPoint')
    expect(contentScriptSource).toContain('isMobileVideoDetailEventInsideElement')
    expect(contentScriptSource).toContain('MOBILE_VIDEO_DETAIL_PLAYER_CONTROLS_VISIBLE_ATTR')
    expect(contentScriptSource).toContain('capture: true')
    expect(contentScriptSource).toContain('new Set([playerWrapper, playerContainer]).forEach(bindRevealEvents)')
    expect(contentScriptSource).toContain("target.addEventListener('click', revealControls")
    expect(contentScriptSource).toContain("target.addEventListener('mousedown', revealControls")
    expect(contentScriptSource).toContain("target.addEventListener('mousemove', revealControls")
    expect(contentScriptSource).toContain("target.addEventListener('pointerdown', revealControls")
    expect(contentScriptSource).toContain("target.addEventListener('pointermove'")
    expect(contentScriptSource).toContain("target.addEventListener('touchstart', revealControls")
    expect(contentScriptSource).toContain("document.addEventListener('click', revealControlsFromDocument")
    expect(contentScriptSource).toContain("document.addEventListener('pointerdown', revealControlsFromDocument")
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-player-controls-visible="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-player-card="true"] :is(#bilibili-player')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-top')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-fixed-height')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('--bewly-mobile-player-flow-offset')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.left-container.scroll-sticky')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('position: static !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain(':is(#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer)[data-bewly-mobile-player-card="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('position: fixed !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('top: var(--bewly-mobile-player-fixed-top) !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('padding: var(--bewly-mobile-player-flow-offset)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('z-index: 2147482500 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-video-back="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('order: -10 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('flex: 0 0 46px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: 100% !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('z-index: 20 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-control-wrap')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-control-entity')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-control-bottom')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 46px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('margin: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('justify-content: space-between !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-control-bottom-right')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-ctrl-eplist')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.bpx-player-ctrl-full')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('@media (max-width: 380px)')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('opacity: 1 !important')
  })

  it('keeps the mobile video detail author card compact under the sticky player', () => {
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('[data-bewly-mobile-author-card="true"][data-bewly-mobile-author-normalized="true"]')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 56px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('min-height: 56px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('max-height: 56px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('grid-template-columns: 40px minmax(0, 1fr) auto !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: 40px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('left: 52px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('right: 126px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('width: 118px !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 30px !important')
  })

  it('hides the mobile video detail tag area so the intro follows the author card', () => {
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('.video-tag-container')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('display: none !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('height: 0 !important')
    expect(MOBILE_VIDEO_DETAIL_CSS).toContain('margin: 0 !important')
  })
})
