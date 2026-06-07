import { decodeHtmlEntities } from '~/utils/htmlDecode'

export type NormalizedMomentKind = 'video' | 'article' | 'live'

export interface NormalizedMomentAuthor {
  name: string
  face: string
  jump_url: string
  mid?: number
}

export interface NormalizedMomentItem {
  kind: NormalizedMomentKind
  type: NormalizedMomentKind
  sourceType?: number
  id: string
  title: string
  author: string
  authorFace: string
  authorJumpUrl: string
  pubTime: string
  pubTimestamp?: number
  cover: string
  link: string
  rid?: number
  aid?: number
  bvid?: string
  roomid?: number
  viewStr?: string
  danmakuStr?: string
  likeStr?: string
  isCollaborative: boolean
  authors?: NormalizedMomentAuthor[]
}

export interface CollaborativeVideoEntry {
  item: any
  moment?: NormalizedMomentItem
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? decodeHtmlEntities(value).trim() : fallback
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return value

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed))
      return parsed
  }

  return undefined
}

function normalizeUrl(value: unknown): string {
  const url = text(value)
  if (!url)
    return ''
  if (url.startsWith('//'))
    return `https:${url}`
  return url
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = text(value)
    if (normalized)
      return normalized
  }
  return ''
}

function firstUrl(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeUrl(value)
    if (normalized)
      return normalized
  }
  return ''
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const normalized = numberValue(value)
    if (typeof normalized === 'number')
      return normalized
  }
  return undefined
}

function getMajor(item: any) {
  return item?.modules?.module_dynamic?.major ?? item?.major ?? {}
}

function getArchive(item: any) {
  return getMajor(item)?.archive ?? item?.archive ?? {}
}

function getOpus(item: any) {
  const major = getMajor(item)
  return major?.opus ?? major?.article ?? item?.opus ?? item?.article ?? {}
}

function getAuthor(item: any) {
  return item?.author ?? item?.modules?.module_author ?? item?.module_author ?? {}
}

export function extractBvid(item: any): string | null {
  const archive = getArchive(item)
  const jumpUrl = firstString(item?.jump_url, archive?.jump_url, item?.link)
  const bvMatch = jumpUrl.match(/\/(BV[0-9A-Za-z]+)/)
  if (bvMatch?.[1])
    return bvMatch[1]

  const directBvid = firstString(item?.bvid, archive?.bvid, item?.modules?.module_dynamic?.major?.archive?.bvid)
  return directBvid || null
}

export function extractRoomId(item: any): number | undefined {
  const direct = firstNumber(item?.roomid, item?.room_id, item?.roomId)
  if (typeof direct === 'number')
    return direct

  const link = firstString(item?.link, item?.jump_url, item?.url)
  const match = link.match(/live\.bilibili\.com\/(?:blanc\/)?(\d+)/)
  return match?.[1] ? numberValue(match[1]) : undefined
}

export function normalizeAuthor(author: any): NormalizedMomentAuthor {
  const mid = numberValue(author?.mid ?? author?.uid)
  return {
    name: firstString(author?.name, author?.uname, '未知UP主'),
    face: firstUrl(author?.face, author?.authorFace, author?.uface),
    jump_url: firstUrl(author?.jump_url, author?.authorUrl, mid ? `https://space.bilibili.com/${mid}` : ''),
    mid,
  }
}

export function collectAuthors(item: any): NormalizedMomentAuthor[] {
  if (Array.isArray(item?.authors) && item.authors.length > 0)
    return item.authors.map(normalizeAuthor)

  const archive = getArchive(item)
  const coopInfo = archive?.coop_info
  if (Array.isArray(coopInfo) && coopInfo.length > 0)
    return coopInfo.map(normalizeAuthor)

  const author = getAuthor(item)
  if (author && Object.keys(author).length > 0)
    return [normalizeAuthor(author)]

  return []
}

function authorKey(author: NormalizedMomentAuthor): string {
  return author.jump_url || `${author.mid || ''}:${author.name}`
}

export function mergeAuthors(targetItem: any, incomingItem: any) {
  const incomingAuthors = collectAuthors(incomingItem)
  if (incomingAuthors.length === 0)
    return

  const targetAuthors = Array.isArray(targetItem.authors)
    ? targetItem.authors.map(normalizeAuthor)
    : collectAuthors(targetItem)

  incomingAuthors.forEach((author) => {
    const key = authorKey(author)
    const exists = targetAuthors.some(existing => authorKey(existing) === key)
    if (!exists)
      targetAuthors.push(author)
  })

  if (targetAuthors.length > 1)
    targetItem.authors = targetAuthors
}

export function updateMomentCollaborative(moment: NormalizedMomentItem, item: any) {
  const authors = collectAuthors(item)
  if (authors.length <= 1)
    return

  moment.isCollaborative = true
  moment.authors = authors
  moment.author = authors.map(author => author.name).join(' / ')
}

export function mergeCollaborativeVideos(
  items: any[],
  collaborativeVideoMap: Map<string, CollaborativeVideoEntry>,
): any[] {
  const newItems: any[] = []

  items.forEach((item) => {
    const bvid = extractBvid(item)
    if (!bvid) {
      newItems.push(item)
      return
    }

    const existingEntry = collaborativeVideoMap.get(bvid)
    if (!existingEntry) {
      const storedItem = { ...item }
      collaborativeVideoMap.set(bvid, { item: storedItem })
      newItems.push(storedItem)
      return
    }

    mergeAuthors(existingEntry.item, item)
    if (existingEntry.moment)
      updateMomentCollaborative(existingEntry.moment, existingEntry.item)
  })

  return newItems
}

export function getNavMomentKind(item: any): NormalizedMomentKind {
  const sourceType = numberValue(item?.type)
  return sourceType === 64 ? 'article' : 'video'
}

export function normalizeNavMomentItem(item: any, fallbackKind: NormalizedMomentKind = 'video'): NormalizedMomentItem | undefined {
  const archive = getArchive(item)
  const opus = getOpus(item)
  const sourceType = numberValue(item?.type)
  const kind = sourceType === 64 ? 'article' : fallbackKind
  const authors = collectAuthors(item)
  const primaryAuthor = authors[0] ?? normalizeAuthor(getAuthor(item))
  const bvid = extractBvid(item) ?? undefined
  const aid = firstNumber(item?.aid, item?.rid, archive?.aid)
  const rid = firstNumber(item?.rid, item?.rid_str, archive?.aid, opus?.id)
  const id = firstString(item?.id_str, item?.id, bvid, rid?.toString(), aid?.toString())
    || `${kind}:${firstString(item?.title, archive?.title, opus?.title)}`

  const cover = firstUrl(
    item?.cover,
    archive?.cover,
    opus?.cover,
    opus?.pics?.[0]?.url,
    opus?.pics?.[0]?.src,
    opus?.pictures?.[0]?.img_src,
  )
  const link = firstUrl(
    item?.jump_url,
    item?.link,
    archive?.jump_url,
    opus?.jump_url,
    bvid ? `https://www.bilibili.com/video/${bvid}` : '',
  )

  const title = firstString(
    item?.title,
    archive?.title,
    opus?.title,
    item?.desc,
    item?.modules?.module_dynamic?.desc?.text,
    kind === 'article' ? '未命名专栏' : '未命名视频',
  )

  return {
    kind,
    type: kind,
    sourceType,
    id,
    title,
    author: authors.length > 1 ? authors.map(author => author.name).join(' / ') : primaryAuthor.name,
    authorFace: primaryAuthor.face,
    authorJumpUrl: primaryAuthor.jump_url,
    pubTime: firstString(item?.pub_time, item?.modules?.module_author?.pub_time),
    pubTimestamp: firstNumber(item?.pub_ts, item?.modules?.module_author?.pub_ts),
    cover,
    link,
    rid,
    aid,
    bvid,
    viewStr: firstString(item?.stat?.play, archive?.stat?.play),
    danmakuStr: firstString(item?.stat?.danmaku, archive?.stat?.danmaku),
    likeStr: firstString(item?.stat?.like, archive?.stat?.like, archive?.stat?.like_str),
    isCollaborative: authors.length > 1,
    authors: authors.length > 1 ? authors : undefined,
  }
}

export function normalizeLiveMomentItem(item: any): NormalizedMomentItem | undefined {
  const roomid = extractRoomId(item)
  const link = firstUrl(
    item?.link,
    item?.jump_url,
    item?.url,
    roomid ? `https://live.bilibili.com/${roomid}` : '',
  )
  const id = firstString(item?.id, item?.id_str, roomid?.toString(), link, item?.title)

  return {
    kind: 'live',
    type: 'live',
    id,
    title: firstString(item?.title, item?.room_name, '未命名直播间'),
    author: firstString(item?.uname, item?.name, item?.author?.name, '未知主播'),
    authorFace: firstUrl(item?.face, item?.uface, item?.author?.face),
    authorJumpUrl: firstUrl(item?.author?.jump_url, item?.uid ? `https://space.bilibili.com/${item.uid}` : ''),
    pubTime: '',
    cover: firstUrl(item?.pic, item?.room_cover, item?.cover),
    link,
    roomid,
    viewStr: firstString(item?.text_small, item?.watched_show?.text_small),
    isCollaborative: false,
  }
}
