import '~/styles'
import 'uno.css'

import { createApp } from 'vue'

import { useDark } from '~/composables/useDark'
import { BEWLY_MOUNTED, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { localSettings, settings } from '~/logic'
import { setupApp } from '~/logic/common-setup'
import RESET_BEWLY_CSS from '~/styles/reset.css?raw'
import { injectMobileNativeHeaderCSS, installMobileNoNewTabGuard, isMobileUserscriptRuntimePage, isUserscriptRuntime, MOBILE_USERSCRIPT_SHADOW_CSS, MOBILE_VIDEO_DETAIL_CSS, setMobileNativeContentHidden, shouldHideMobileNativeContentForPage, shouldUseMobileVideoDetailLayout } from '~/userscript/mobile'
import { sanitizeInlineSvg } from '~/userscript/svg-sanitizer'
import { applyBewlyWidescreen, exitBewlyWidescreen } from '~/utils/bewlyWidescreen'
import { cleanupBilibiliScripts } from '~/utils/bilibiliScriptCleanup'
import { captureOriginalBilibiliTopBar, ensureOriginalBilibiliTopBarAppended, setupLoginButtonClickHandlers } from '~/utils/bilibiliTopBar'
import { initFavoriteDialogEnhancement } from '~/utils/favoriteDialog'
import { runWhenIdle } from '~/utils/lazyLoad'
import { getLocalWallpaper, hasLocalWallpaper, isLocalWallpaperUrl } from '~/utils/localWallpaper'
import { compareVersions, injectCSS, isElectron, isHomePage, isInIframe, isNotificationPage, isVideoOrBangumiPage } from '~/utils/main'
import { applyAutoPlayByVideoType, applyDefaultDanmakuState, defaultMode, handleVideoPageNavigation, isCollectionVideo, isPlayerDisplayModeReady, isVideoPage, startAutoExitFullscreenMonitoring, startAutoPlayUserChangeMonitoring, webFullscreen, widescreen } from '~/utils/player'
import { initRandomPlay, resetRandomPlayInitialization } from '~/utils/randomPlay'
import { setupShortcutHandlers } from '~/utils/shortcuts'
import { SVG_ICONS } from '~/utils/svgIcons'
import { openLinkInBackground } from '~/utils/tabs'
import { initVerticalVideoZoom, resetVerticalVideoZoom } from '~/utils/verticalVideoZoom'

import { version } from '../../package.json'
import { initAudioInterceptor, setupSettingsWatcher } from './audioInterceptor'
import { setupIframePhotoViewerDetector } from './features/iframePhotoViewerDetector'
import App from './views/App.vue'
import { initVolumeNormalizationControl } from './volumeNormalizationControl'

const isFirefox: boolean = /Firefox/i.test(navigator.userAgent)
const isElectronEnv = isElectron()

const currentUrl = document.URL
const isMobileUserscriptPage = !isInIframe() && isUserscriptRuntime() && isMobileUserscriptRuntimePage(currentUrl)
const shouldHideMobileNativeContent = isMobileUserscriptPage && shouldHideMobileNativeContentForPage(currentUrl)
let mobileVideoDetailStyleEl: HTMLStyleElement | undefined
let mobileVideoDetailNavigationGuardInstalled = false
let mobileVideoDetailStructureObserver: MutationObserver | undefined
let mobileVideoDetailStructureTimer: ReturnType<typeof setTimeout> | undefined
let mobileVideoDetailStructureRetryCount = 0

type BewlyScriptWindow = Window & {
  __BEWLYSCRIPT_STYLE_CSS__?: string
}

function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

function syncMobileVideoDetailLayout(url: string = location.href): void {
  const shouldApply = isUserscriptRuntime() && shouldUseMobileVideoDetailLayout(url)

  if (!shouldApply) {
    document.documentElement.removeAttribute('data-bewly-mobile-video-detail')
    document.documentElement.removeAttribute('data-bewly-mobile-video-detail-frame')
    stopMobileVideoDetailStructureEnhancement()
    return
  }

  document.documentElement.setAttribute('data-bewly-mobile-video-detail', 'true')
  if (isInIframe())
    document.documentElement.setAttribute('data-bewly-mobile-video-detail-frame', 'true')
  else
    document.documentElement.removeAttribute('data-bewly-mobile-video-detail-frame')
  if (!mobileVideoDetailStyleEl?.isConnected)
    mobileVideoDetailStyleEl = injectCSS(MOBILE_VIDEO_DETAIL_CSS)

  installMobileVideoDetailNavigationGuard()
  startMobileVideoDetailStructureEnhancement()
}

function stopMobileVideoDetailStructureEnhancement(): void {
  mobileVideoDetailStructureObserver?.disconnect()
  mobileVideoDetailStructureObserver = undefined
  mobileVideoDetailStructureRetryCount = 0
  if (mobileVideoDetailStructureTimer) {
    clearTimeout(mobileVideoDetailStructureTimer)
    mobileVideoDetailStructureTimer = undefined
  }
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
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement)
      return element
  }

  return undefined
}

function findMobileVideoDetailAuthorCard(): HTMLElement | undefined {
  const existingCard = document.querySelector('[data-bewly-mobile-author-card="true"]')
  if (existingCard instanceof HTMLElement && existingCard.isConnected)
    return existingCard

  const selectors = [
    '.right-container .up-info-container',
    '.right-container .up-info',
    '.right-container .upinfo',
    '.right-container .up-panel-container',
    '.video-right-container .up-info-container',
    '.video-right-container .up-info',
    '.video-right-container .upinfo',
    '.video-right-container .up-panel-container',
    '.right-container-inner .up-info-container',
    '.right-container-inner .up-info',
    '.right-container-inner .upinfo',
    '.right-container-inner .up-panel-container',
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement && element.querySelector('a[href*="space.bilibili.com"]'))
      return element
  }

  return undefined
}

function addUniqueElement(list: HTMLElement[], element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement))
    return
  if (list.some(item => item === element || item.contains(element)))
    return
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (element.contains(list[index]))
      list.splice(index, 1)
  }
  list.push(element)
}

function findMobileVideoDetailAuthorAvatar(authorCard: HTMLElement): HTMLElement | undefined {
  const existingAvatar = authorCard.querySelector(':scope > [data-bewly-mobile-author-avatar="true"]')
  if (existingAvatar instanceof HTMLElement)
    return existingAvatar

  const spaceLinks = Array.from(authorCard.querySelectorAll<HTMLAnchorElement>('a[href*="space.bilibili.com"]'))
  const avatarLink = spaceLinks.find(link => link.querySelector('img, picture, .bili-avatar, .avatar, .face, .up-avatar, .up-info-avatar, .up-cover, .staff-avatar'))
  if (avatarLink)
    return avatarLink

  const avatar = authorCard.querySelector('.up-avatar, .up-info-avatar, .avatar, .bili-avatar, .face, .up-cover, .staff-avatar, img')
  if (!(avatar instanceof HTMLElement))
    return undefined

  const parentLink = avatar.closest('a[href*="space.bilibili.com"]')
  return parentLink instanceof HTMLElement ? parentLink : avatar
}

function normalizeMobileVideoDetailAuthorCard(authorCard: HTMLElement): void {
  const avatar = findMobileVideoDetailAuthorAvatar(authorCard)
  const existingInfoWrap = authorCard.querySelector(':scope > [data-bewly-mobile-author-info="true"]')
  const existingActionsWrap = authorCard.querySelector(':scope > [data-bewly-mobile-author-actions="true"]')
  const infoWrap = existingInfoWrap instanceof HTMLElement ? existingInfoWrap : document.createElement('div')
  const actionsWrap = existingActionsWrap instanceof HTMLElement ? existingActionsWrap : document.createElement('div')
  infoWrap.setAttribute('data-bewly-mobile-author-info', 'true')
  actionsWrap.setAttribute('data-bewly-mobile-author-actions', 'true')

  const infoNodes: HTMLElement[] = []
  const authorNameLink = Array.from(authorCard.querySelectorAll<HTMLAnchorElement>('a[href*="space.bilibili.com"]')).find((link) => {
    if (link === avatar || link.contains(avatar ?? null))
      return false
    return Boolean(link.textContent?.trim())
  })
  if (authorNameLink instanceof HTMLElement) {
    authorNameLink.setAttribute('data-bewly-mobile-author-name', 'true')
    authorCard.setAttribute('data-bewly-mobile-author-display-name', authorNameLink.textContent?.trim() ?? '')
  }

  const infoContainerSelectors = [
    '.up-detail',
    '.up-info-text',
    '.staff-info',
    '.video-staffs-info',
    '.up-info--left',
    '.up-info-right',
  ]
  for (const selector of infoContainerSelectors) {
    const element = authorCard.querySelector(selector)
    if (element instanceof HTMLElement && element !== avatar && element !== infoWrap && element !== actionsWrap && !element.contains(avatar ?? null))
      addUniqueElement(infoNodes, element)
  }

  if (infoNodes.length === 0) {
    const spaceLinks = Array.from(authorCard.querySelectorAll<HTMLAnchorElement>('a[href*="space.bilibili.com"]'))
    spaceLinks.forEach((link) => {
      if (link !== avatar && link !== infoWrap && link !== actionsWrap && !link.contains(avatar ?? null))
        addUniqueElement(infoNodes, link)
    })

    const descriptionSelectors = [
      '.up-description',
      '.up-info-desc',
      '.up-detail-bottom',
      '.desc',
      '.info-desc',
      '.official',
    ]
    descriptionSelectors.forEach((selector) => {
      authorCard.querySelectorAll(selector).forEach(element => addUniqueElement(infoNodes, element))
    })
  }
  else if (authorNameLink instanceof HTMLElement) {
    addUniqueElement(infoNodes, authorNameLink)
  }

  const actionNodes: HTMLElement[] = []
  const actionSelectors = [
    '.upinfo-btn-panel',
    '.follow-btn',
    '.follow-button',
    '.btn-follow',
    '.not-follow',
    '.new-charge-btn',
  ]
  actionSelectors.forEach((selector) => {
    authorCard.querySelectorAll(selector).forEach((element) => {
      if (element !== infoWrap && element !== actionsWrap)
        addUniqueElement(actionNodes, element)
    })
  })
  authorCard.querySelectorAll('button').forEach(button => addUniqueElement(actionNodes, button))

  const descriptionNodes: HTMLElement[] = []
  Array.from(authorCard.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
      return
    const description = document.createElement('span')
    description.setAttribute('data-bewly-mobile-author-description', 'true')
    description.textContent = node.textContent.trim()
    descriptionNodes.push(description)
    node.remove()
  })

  if (avatar instanceof HTMLElement) {
    avatar.setAttribute('data-bewly-mobile-author-avatar', 'true')
    authorCard.appendChild(avatar)
  }

  infoNodes.forEach((node) => {
    if (!actionsWrap.contains(node) && node !== avatar)
      infoWrap.appendChild(node)
  })
  descriptionNodes.forEach(node => infoWrap.appendChild(node))
  actionNodes.forEach((node) => {
    if (!infoWrap.contains(node) && node !== avatar)
      actionsWrap.appendChild(node)
  })

  Array.from(authorCard.children).forEach((child) => {
    if (!(child instanceof HTMLElement))
      return
    if (child === avatar || child === infoWrap || child === actionsWrap)
      return
    if (child.matches('script, style, template')) {
      child.setAttribute('data-bewly-mobile-author-residual', 'true')
      return
    }

    const hasUsefulContent = Boolean(child.textContent?.trim() || child.querySelector('img, picture, svg, a, button, [role="button"]'))
    if (hasUsefulContent) {
      child.setAttribute('data-bewly-mobile-author-extra', 'true')
      infoWrap.appendChild(child)
      return
    }

    child.setAttribute('data-bewly-mobile-author-residual', 'true')
  })

  authorCard.appendChild(infoWrap)
  authorCard.appendChild(actionsWrap)
  authorCard.setAttribute('data-bewly-mobile-author-normalized', 'true')
}

function findMobileVideoDetailPlayer(): HTMLElement | undefined {
  const player = document.querySelector('#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer')
  if (!(player instanceof HTMLElement))
    return undefined

  const wrapper = player.closest('#playerWrap, .player-wrap')
  return wrapper instanceof HTMLElement ? wrapper : player
}

function hideMobileVideoDetailPrePlayerSiblings(playerWrapper: HTMLElement): void {
  const innerPlayer = playerWrapper.querySelector('.bpx-player-container, #bilibili-player, #bilibiliPlayer')
  let current = innerPlayer instanceof HTMLElement ? innerPlayer : playerWrapper

  while (current && current !== playerWrapper) {
    let sibling = current.previousElementSibling
    while (sibling) {
      if (sibling instanceof HTMLElement)
        sibling.setAttribute('data-bewly-mobile-pre-player-hidden', 'true')
      sibling = sibling.previousElementSibling
    }
    const parent = current.parentElement
    if (!(parent instanceof HTMLElement))
      break
    current = parent
  }
}

function hideMobileVideoDetailPlayerTopPromotions(playerWrapper: HTMLElement): void {
  const videoArea = playerWrapper.querySelector('video, .bpx-player-video-area, .bpx-player-video-wrap, .bilibili-player-video-area, .bilibili-player-video-wrap')
  if (!(videoArea instanceof HTMLElement))
    return

  const videoRect = videoArea.getBoundingClientRect()
  const wrapperRect = playerWrapper.getBoundingClientRect()
  if (videoRect.width < 80 || videoRect.height < 40)
    return

  const topPromoOffset = Math.max(0, videoRect.top - wrapperRect.top)
  if (topPromoOffset > 24) {
    const maxCropOffset = Math.max(110, Math.min(Math.ceil(wrapperRect.height * 0.52), 240))
    playerWrapper.setAttribute('data-bewly-mobile-player-crop-top', 'true')
    playerWrapper.style.setProperty('--bewly-mobile-player-crop-offset', `${Math.min(Math.ceil(topPromoOffset), maxCropOffset)}px`)
  }

  const candidates = Array.from(playerWrapper.querySelectorAll<HTMLElement>('*'))
  candidates.forEach((candidate) => {
    if (candidate === videoArea || candidate.contains(videoArea) || videoArea.contains(candidate))
      return

    const rect = candidate.getBoundingClientRect()
    const isAboveVideo = rect.bottom <= videoRect.top + 8
    const isInsidePlayer = rect.top >= wrapperRect.top - 8 && rect.left < wrapperRect.right && rect.right > wrapperRect.left
    const isVisibleBlock = rect.width >= 80 && rect.height >= 16
    if (isAboveVideo && isInsidePlayer && isVisibleBlock)
      candidate.setAttribute('data-bewly-mobile-pre-player-hidden', 'true')
  })
}

function hideMobileVideoDetailGlobalPrePlayerBlocks(playerWrapper: HTMLElement): void {
  const playerRect = playerWrapper.getBoundingClientRect()
  if (playerRect.width < 120 || playerRect.height < 80)
    return

  const candidates = Array.from(document.body?.querySelectorAll<HTMLElement>('*') ?? [])
  candidates.forEach((candidate) => {
    if (candidate === playerWrapper || candidate.contains(playerWrapper) || playerWrapper.contains(candidate))
      return
    if (candidate.closest('[data-bewly-mobile-author-card="true"]'))
      return

    const rect = candidate.getBoundingClientRect()
    const overlapsPlayerColumn = rect.left < playerRect.right - 24 && rect.right > playerRect.left + 24
    const isAbovePlayer = rect.bottom <= playerRect.top + 8
    const isVisibleBlock = rect.width >= 120 && rect.height >= 24
    if (overlapsPlayerColumn && isAbovePlayer && isVisibleBlock)
      candidate.setAttribute('data-bewly-mobile-pre-player-hidden', 'true')
  })
}

function isMobileVideoDetailProtectedModule(element: HTMLElement): boolean {
  return Boolean(element.matches('#playerWrap, .player-wrap, #bilibili-player, #bilibiliPlayer, .bpx-player-container, [data-bewly-mobile-author-card="true"], #arc_toolbar_report, .video-toolbar-container, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment, .video-info-container, #viewbox_report, .media-info, .media-info-container, .desc-info, .basic-desc-info, .video-desc-container, .video-desc, .desc-v2, #v_desc, .tag-area, #v_tag, .video-tag-container'))
}

function containsMobileVideoDetailProtectedContent(element: HTMLElement): boolean {
  return Boolean(element.querySelector('video, #bilibili-player, #bilibiliPlayer, .bpx-player-container, [data-bewly-mobile-author-card="true"], #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment'))
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

function findMobileVideoDetailAuthorReference(mainColumn: HTMLElement): ChildNode | null {
  const toolbar = mainColumn.querySelector('#arc_toolbar_report, .video-toolbar-container')
  if (toolbar?.parentElement === mainColumn)
    return toolbar

  const reference = mainColumn.querySelector('.desc-info, .basic-desc-info, .video-desc-container, .video-desc, .desc-v2, #v_desc, .tag-area, #v_tag, .video-tag-container')
  if (reference?.parentElement === mainColumn)
    return reference

  return mainColumn.firstChild
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
      if (!text || !['>', '\u203a', '\u2304', '\u2305', '\u2228', 'v', '展开', '更多'].includes(text))
        return

      candidate.setAttribute('data-bewly-mobile-tag-more', 'true')
      candidate.textContent = ''
    })
  })
}

function markMobileVideoDetailCommentComposers(root: HTMLElement): void {
  const commentRoots = Array.from(root.querySelectorAll<HTMLElement>('#comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment'))
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
  element.setAttribute('data-bewly-mobile-comment-composer', 'true')
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
  return /评论千万条|发一条|友善发言|这里是评论区|不是无人区|登录后发表评论|创造热评|快去创造|热评|妙评|神评|锐评|评论两句|评论走一走|妙评何时|打动人心的入场券/.test(text)
}

function containsMobileVideoDetailCommentList(element: HTMLElement): boolean {
  return Boolean(element.querySelector('.comment-item, .reply-item, .bili-comment-item, .comment-list, .reply-list, .bili-comment-list'))
}

type MobileVideoDetailQueryableRoot = HTMLElement | ShadowRoot

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

function findMobileVideoDetailCommentRoot(): HTMLElement | undefined {
  const selectors = [
    'bili-comments',
    '#comment-module',
    '#comment-body',
    '#commentapp',
    '.commentapp',
    '.comment-container',
    '.bili-comment-container',
    '.bb-comment',
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element instanceof HTMLElement)
      return element
  }

  return undefined
}

function findMobileVideoDetailCommentEditor(): HTMLElement | undefined {
  const roots = document.body ? collectMobileVideoDetailQueryableRoots(document.body) : []
  const selectors = [
    'textarea',
    'input[placeholder*="评论"]',
    'input[placeholder*="发一条"]',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '[placeholder*="评论"]',
    '[aria-label*="评论"]',
  ].join(',')

  for (const root of roots) {
    const editor = root.querySelector<HTMLElement>(selectors)
    if (editor instanceof HTMLElement)
      return editor
  }

  return undefined
}

function openMobileVideoDetailCommentEditor(): boolean {
  const commentRoot = findMobileVideoDetailCommentRoot()
  const editor = findMobileVideoDetailCommentEditor()

  if (editor) {
    const boundary = editor.closest('[data-bewly-mobile-comment-composer="true"]')
    if (boundary instanceof HTMLElement) {
      boundary.removeAttribute('data-bewly-mobile-comment-composer')
      boundary.style.removeProperty('display')
      boundary.setAttribute('data-bewly-mobile-comment-composer-open', 'true')
    }

    commentRoot?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      editor.click()
      editor.focus()
    }, 220)
    return true
  }

  commentRoot?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return Boolean(commentRoot)
}

function getMobileVideoDetailCommentLabel(): string {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('bili-comments, #comment-module, #comment-body, #commentapp, .commentapp, .comment-container, .bili-comment-container, .bb-comment, h2, h3, div, span'))
  for (const candidate of candidates) {
    const text = candidate.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (text.length > 32)
      continue

    const match = text.match(/^评论\s*([0-9.]+[万千]?|[0-9]+)?/)
    if (match)
      return match[1] ? `评论 ${match[1]}` : '评论'
  }

  return '写评论'
}

function ensureMobileVideoDetailToolbarCommentEntry(toolbar: HTMLElement): void {
  let entry = toolbar.querySelector<HTMLElement>('[data-bewly-mobile-toolbar-comment-entry="true"]')
  if (!entry) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('data-bewly-mobile-toolbar-comment-entry', 'true')
    button.setAttribute('aria-label', '写评论')

    const label = document.createElement('span')
    label.setAttribute('data-bewly-mobile-toolbar-comment-label', 'true')
    button.appendChild(label)

    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openMobileVideoDetailCommentEditor()
    })

    entry = button
  }

  const label = entry.querySelector<HTMLElement>('[data-bewly-mobile-toolbar-comment-label="true"]') ?? entry
  label.textContent = getMobileVideoDetailCommentLabel()

  if (entry.parentElement !== toolbar || toolbar.firstElementChild !== entry)
    toolbar.insertBefore(entry, toolbar.firstChild)
}

function markMobileVideoDetailToolbarHiddenActions(toolbar: HTMLElement): void {
  toolbar.setAttribute('data-bewly-mobile-action-bar', 'true')

  const candidates = Array.from(toolbar.querySelectorAll<HTMLElement>('a, button, [role="button"], .video-toolbar-left-item, .video-toolbar-right-item, .toolbar-left-item-wrap, [class*="share"], [class*="Share"], [class*="more"], [class*="More"]'))
  candidates.forEach((candidate) => {
    if (candidate.hasAttribute('data-bewly-mobile-toolbar-comment-entry'))
      return

    const signature = [
      candidate.textContent,
      candidate.getAttribute('aria-label'),
      candidate.getAttribute('title'),
      candidate.className,
    ].join(' ')

    if (/分享|转发|更多|share|more|ellipsis|menu/i.test(signature))
      candidate.setAttribute('data-bewly-mobile-toolbar-action-hidden', 'true')
  })
}

function enhanceMobileVideoDetailStructure(): boolean {
  if (!shouldUseMobileVideoDetailLayout())
    return false

  const mainColumn = findMobileVideoDetailMainColumn()
  if (!mainColumn)
    return false

  const player = findMobileVideoDetailPlayer()
  if (player) {
    player.setAttribute('data-bewly-mobile-player-card', 'true')
    hideMobileVideoDetailPrePlayerSiblings(player)
    requestAnimationFrame(() => {
      hideMobileVideoDetailPlayerTopPromotions(player)
      hideMobileVideoDetailGlobalPrePlayerBlocks(player)
    })
    if (player.parentElement !== mainColumn || mainColumn.firstElementChild !== player)
      mainColumn.insertBefore(player, mainColumn.firstElementChild)
  }

  const authorCard = findMobileVideoDetailAuthorCard()
  if (authorCard) {
    authorCard.setAttribute('data-bewly-mobile-author-card', 'true')
    normalizeMobileVideoDetailAuthorCard(authorCard)
    const reference = findMobileVideoDetailAuthorReference(mainColumn)
    if (authorCard.parentElement !== mainColumn || authorCard.nextSibling !== reference)
      mainColumn.insertBefore(authorCard, reference)
  }

  const toolbar = findMobileVideoDetailToolbar()
  if (toolbar) {
    ensureMobileVideoDetailToolbarCommentEntry(toolbar)
    markMobileVideoDetailToolbarHiddenActions(toolbar)
  }

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
    markMobileVideoDetailCommentComposers(document.body)
    markMobileVideoDetailStandaloneCommentComposers(document.body)
    markMobileVideoDetailKnownCommentComposerClasses(document.body)
    markMobileVideoDetailSeededCommentComposers(document.body)
    markMobileVideoDetailVisualCommentComposerShells(document.body)
    collectMobileVideoDetailQueryableRoots(document.body).forEach((queryRoot) => {
      if (queryRoot === document.body)
        return

      markMobileVideoDetailKnownCommentComposerClasses(queryRoot)
      markMobileVideoDetailStandaloneCommentComposers(queryRoot)
      markMobileVideoDetailSeededCommentComposers(queryRoot)
      markMobileVideoDetailVisualCommentComposerShells(queryRoot)
    })
  }

  return Boolean(player && authorCard)
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
    if (urlString && shouldUseMobileVideoDetailLayout()) {
      navigateMobileDetailInFrame(urlString)
      return window
    }

    return originalOpen(url, target, features)
  }) as typeof window.open

  const handleClick = (event: MouseEvent) => {
    if (!shouldUseMobileVideoDetailLayout())
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
        const videoCardLinkOpenMode = settings.value.videoCardLinkOpenMode

        if (videoCardLinkOpenMode === 'background') {
        // 后台打开标签页
          openLinkInBackground(href)
        }
        else {
        // 默认新标签页打开
          window.open(href, '_blank')
        }
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
      const isInputElement
      = tagName === 'input'
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
