import { describe, expect, it } from 'vitest'

import {
  classifyMobileBilibiliPage,
  getBewlyUserscriptHomeUrl,
  injectMobileNativeHeaderCSS,
  isBilibiliVideoDetailPage,
  isMobileBilibiliHomePage,
  isMobileBilibiliPage,
  isMobileUserscriptRuntimePage,
  normalizeBilibiliUrlForCurrentSurface,
  removeMobileNativeHeaderCSS,
  shouldEnableHoverInteractions,
  shouldHideMobileNativeContentForPage,
  shouldPreferTouchMode,
  shouldUseMobileVideoDetailLayout,
} from '../userscript/mobile'

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
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/search?keyword=test')).toBe('search')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/space/123')).toBe('space')
    expect(classifyMobileBilibiliPage('https://m.bilibili.com/opus/123')).toBe('moments')
    expect(classifyMobileBilibiliPage('https://www.bilibili.com/')).toBe('other')
  })

  it('marks mobile native CSS with the current page kind', () => {
    const style = injectMobileNativeHeaderCSS('https://m.bilibili.com/video/BV123')

    expect(style?.textContent).toContain('[data-bewly-mobile-page-kind="home"]')
    expect(document.documentElement.getAttribute('data-bewly-mobile')).toBe('true')
    expect(document.documentElement.getAttribute('data-bewly-mobile-page-kind')).toBe('video')

    removeMobileNativeHeaderCSS(style)
  })

  it('detects mobile home without broadening desktop homepage matching', () => {
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/')).toBe(true)
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/video/BV123')).toBe(false)
  })

  it('only hides host content for mobile home takeover pages', () => {
    expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/')).toBe(true)
    expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/?page=Home')).toBe(true)
    expect(shouldHideMobileNativeContentForPage('https://m.bilibili.com/video/BV123')).toBe(false)
    expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/video/BV123')).toBe(false)
    expect(shouldHideMobileNativeContentForPage('https://www.bilibili.com/bangumi/play/ep123')).toBe(false)
  })

  it('identifies Bilibili video detail pages across mobile and desktop hosts', () => {
    expect(isBilibiliVideoDetailPage('https://m.bilibili.com/video/BV123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://www.bilibili.com/video/BV123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://www.bilibili.com/bangumi/play/ep123')).toBe(true)
    expect(isBilibiliVideoDetailPage('https://m.bilibili.com/search?keyword=test')).toBe(false)
    expect(isBilibiliVideoDetailPage('https://example.com/video/BV123')).toBe(false)
  })

  it('uses the mobile video detail layout only for mobile or narrow video surfaces', () => {
    withViewportWidth(402, () => {
      expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/video/BV123')).toBe(true)
      expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(true)
    })

    withViewportWidth(900, () => {
      expect(shouldUseMobileVideoDetailLayout('https://www.bilibili.com/video/BV123')).toBe(false)
      expect(shouldUseMobileVideoDetailLayout('https://m.bilibili.com/search?keyword=test')).toBe(false)
    })
  })

  it('treats narrow desktop Bilibili pages as the mobile userscript surface', () => {
    withViewportWidth(402, () => {
      expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(true)
    })

    withViewportWidth(900, () => {
      expect(isMobileUserscriptRuntimePage('https://www.bilibili.com/?page=Home')).toBe(false)
    })
  })

  it('keeps Bewly page URLs on the current Bilibili surface', () => {
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://m.bilibili.com/video/BV123')).toBe('https://m.bilibili.com/?page=Favorites')
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://www.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
  })

  it('normalizes bilibili URLs to the current surface host', () => {
    expect(normalizeBilibiliUrlForCurrentSurface('https://www.bilibili.com/video/BV123', 'https://m.bilibili.com/')).toBe('https://m.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123')
    expect(normalizeBilibiliUrlForCurrentSurface('https://m.bilibili.com/video/BV123?t=8&p=2', 'https://www.bilibili.com/')).toBe('https://www.bilibili.com/video/BV123?t=8&p=2')
  })

  it('normalizes protocol-relative and relative URLs before mobile drawer routing', () => {
    expect(normalizeBilibiliUrlForCurrentSurface('//account.bilibili.com/account/record?type=exp', 'https://m.bilibili.com/')).toBe('https://account.bilibili.com/account/record?type=exp')
    expect(normalizeBilibiliUrlForCurrentSurface('/video/BV123', 'https://m.bilibili.com/')).toBe('https://m.bilibili.com/video/BV123')
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
})
