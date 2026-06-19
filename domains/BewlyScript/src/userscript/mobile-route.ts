import { AppPage } from '~/enums/appEnums'

import { DESKTOP_BILIBILI_HOST, MOBILE_BILIBILI_HOST } from './mobile'

export type MobileRouteKind = 'home' | 'bewly-page' | 'video' | 'search' | 'space' | 'moments' | 'unsupported'

export interface MobileRoute {
  kind: MobileRouteKind
  url: string
  page?: AppPage
  bvid?: string
  mid?: string
  keyword?: string
}

function getSupportedPage(value: string | null): AppPage | undefined {
  if (!value)
    return undefined

  return Object.values(AppPage).includes(value as AppPage) ? value as AppPage : undefined
}

function parseRouteUrl(url: string): URL | undefined {
  try {
    return new URL(url)
  }
  catch {
    return undefined
  }
}

function isSupportedBilibiliSurface(url: URL): boolean {
  return url.protocol === 'https:'
    && (url.hostname === MOBILE_BILIBILI_HOST || url.hostname === DESKTOP_BILIBILI_HOST)
}

export function parseMobileRoute(url: string = location.href): MobileRoute {
  const parsed = parseRouteUrl(url)
  if (!parsed) {
    return { kind: 'unsupported', url }
  }

  const page = getSupportedPage(parsed.searchParams.get('page'))
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/'

  if (!isSupportedBilibiliSurface(parsed)) {
    return { kind: 'unsupported', url: parsed.toString() }
  }

  if (pathname === '/' || pathname === '/index.html') {
    return page
      ? { kind: 'bewly-page', url: parsed.toString(), page }
      : { kind: 'home', url: parsed.toString(), page: AppPage.Home }
  }

  const videoMatch = pathname.match(/^\/video\/([^/?#]+)/)
  if (videoMatch) {
    return {
      kind: 'video',
      url: parsed.toString(),
      page: AppPage.VideoDetail,
      bvid: decodeURIComponent(videoMatch[1]),
    }
  }

  if (pathname.startsWith('/search')) {
    return {
      kind: 'search',
      url: parsed.toString(),
      page: AppPage.SearchResults,
      keyword: parsed.searchParams.get('keyword') ?? parsed.searchParams.get('key') ?? '',
    }
  }

  const spaceMatch = pathname.match(/^\/space\/([^/?#]+)/)
  if (spaceMatch) {
    return {
      kind: 'space',
      url: parsed.toString(),
      page: AppPage.Space,
      mid: decodeURIComponent(spaceMatch[1]),
    }
  }

  if (pathname.startsWith('/dynamic') || pathname.startsWith('/opus/')) {
    return { kind: 'moments', url: parsed.toString(), page: AppPage.Moments }
  }

  return { kind: 'unsupported', url: parsed.toString() }
}

export function isCoreMobileRoute(url: string = location.href): boolean {
  const route = parseMobileRoute(url)
  return route.kind !== 'unsupported'
}

export function getMobileRouteAppPage(url: string = location.href): AppPage | undefined {
  return parseMobileRoute(url).page
}

export function isMobileVideoRoute(url: string = location.href): boolean {
  return parseMobileRoute(url).kind === 'video'
}
