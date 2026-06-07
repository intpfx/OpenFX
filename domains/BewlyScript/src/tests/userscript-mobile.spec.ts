import { describe, expect, it } from 'vitest'

import { classifyMobileBilibiliPage, getBewlyUserscriptHomeUrl, isMobileBilibiliHomePage, isMobileBilibiliPage, prepareMobileUserscriptDefaults } from '../userscript/mobile'

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

  it('sets conservative touch defaults', () => {
    const settings: Record<string, unknown> = {}

    prepareMobileUserscriptDefaults(settings)

    expect(settings.touchScreenOptimization).toBe(true)
    expect(settings.dockPosition).toBe('bottom')
    expect(settings.autoHideDock).toBe(false)
    expect(settings.halfHideDock).toBe(false)
    expect(settings.videoPageTopBarConfig).toBe('alwaysHide')
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

  it('detects mobile home without broadening desktop homepage matching', () => {
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/')).toBe(true)
    expect(isMobileBilibiliHomePage('https://m.bilibili.com/video/BV123')).toBe(false)
  })

  it('keeps Bewly page URLs on the current Bilibili surface', () => {
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://m.bilibili.com/video/BV123')).toBe('https://m.bilibili.com/?page=Favorites')
    expect(getBewlyUserscriptHomeUrl('Favorites', 'https://www.bilibili.com/video/BV123')).toBe('https://www.bilibili.com/?page=Favorites')
  })
})
