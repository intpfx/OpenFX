export interface MobileVideoUrlInfo {
  bvid: string
  page: number
  cid?: number
}

export interface MobilePlayableUrl {
  url: string
  quality?: number
  description?: string
}

export interface MobileDanmakuItem {
  time: number
  mode: number
  size: number
  color: number
  text: string
}

export function parseMobileVideoUrl(url: string = location.href): MobileVideoUrlInfo | undefined {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/video\/([^/?#]+)/)
    if (!match)
      return undefined

    const page = Number.parseInt(parsed.searchParams.get('p') || '1', 10)
    const cid = Number.parseInt(parsed.searchParams.get('cid') || '', 10)

    return {
      bvid: decodeURIComponent(match[1]),
      page: Number.isFinite(page) && page > 0 ? page : 1,
      cid: Number.isFinite(cid) && cid > 0 ? cid : undefined,
    }
  }
  catch {
    return undefined
  }
}

function getBackupUrl(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return value.find((item): item is string => typeof item === 'string' && item.length > 0)
  return undefined
}

export function selectPlayableVideoUrl(playUrlResponse: any): MobilePlayableUrl | undefined {
  const data = playUrlResponse?.data ?? playUrlResponse
  const durl = Array.isArray(data?.durl) ? data.durl : []
  const first = durl.find((item: any) => typeof item?.url === 'string' && item.url)
    ?? durl.find((item: any) => getBackupUrl(item?.backup_url))
  const url = first?.url ?? getBackupUrl(first?.backup_url)
  if (!url)
    return undefined

  const matchedFormat = Array.isArray(data?.support_formats)
    ? data.support_formats.find((item: any) => Number(item?.quality) === Number(data?.quality))
    : undefined

  return {
    url,
    quality: Number.isFinite(Number(data?.quality)) ? Number(data.quality) : undefined,
    description: matchedFormat?.new_description || matchedFormat?.display_desc || data?.format,
  }
}

export function parseDanmakuXml(xml: string): MobileDanmakuItem[] {
  if (!xml.trim())
    return []

  const parser = new DOMParser()
  const document = parser.parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror'))
    return []

  return Array.from(document.querySelectorAll('d')).map((node) => {
    const params = (node.getAttribute('p') ?? '').split(',')
    return {
      time: Number.parseFloat(params[0] ?? '0') || 0,
      mode: Number.parseInt(params[1] ?? '1', 10) || 1,
      size: Number.parseInt(params[2] ?? '25', 10) || 25,
      color: Number.parseInt(params[3] ?? '16777215', 10) || 16777215,
      text: node.textContent ?? '',
    }
  }).filter(item => item.text)
}
