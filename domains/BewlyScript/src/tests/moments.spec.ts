import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppPage } from '~/enums/appEnums'
import { useMainStore } from '~/stores/mainStore'
import {
  mergeCollaborativeVideos,
  normalizeLiveMomentItem,
  normalizeNavMomentItem,
} from '~/utils/moments'

describe('moments helpers', () => {
  it('normalizes video nav items for VideoCard data', () => {
    const item = {
      type: 8,
      title: 'A &amp; B',
      jump_url: 'https://www.bilibili.com/video/BV1abc123456',
      cover: '//i0.hdslb.com/video.jpg',
      rid: 123,
      pub_time: '刚刚',
      author: {
        name: 'UP主',
        face: '//i0.hdslb.com/face.jpg',
        jump_url: 'https://space.bilibili.com/1',
      },
    }

    const normalized = normalizeNavMomentItem(item)

    expect(normalized?.kind).toBe('video')
    expect(normalized?.title).toBe('A & B')
    expect(normalized?.bvid).toBe('BV1abc123456')
    expect(normalized?.aid).toBe(123)
    expect(normalized?.cover).toBe('https://i0.hdslb.com/video.jpg')
    expect(normalized?.author).toBe('UP主')
  })

  it('keeps article nav items as read-only article moments', () => {
    const item = {
      type: 64,
      title: '专栏标题',
      jump_url: 'https://www.bilibili.com/read/cv123',
      cover: 'https://i0.hdslb.com/article.jpg',
      author: { name: '作者' },
    }

    const normalized = normalizeNavMomentItem(item, 'article')

    expect(normalized?.kind).toBe('article')
    expect(normalized?.link).toBe('https://www.bilibili.com/read/cv123')
    expect(normalized?.title).toBe('专栏标题')
  })

  it('merges collaborative videos across pages by bvid', () => {
    const collaborativeVideoMap = new Map()
    const firstItem = {
      type: 8,
      title: '联合投稿',
      jump_url: 'https://www.bilibili.com/video/BV1collab123',
      author: { name: '作者A', jump_url: 'https://space.bilibili.com/1' },
    }
    const secondItem = {
      type: 8,
      title: '联合投稿',
      jump_url: 'https://www.bilibili.com/video/BV1collab123',
      author: { name: '作者B', jump_url: 'https://space.bilibili.com/2' },
    }

    const firstPageItems = mergeCollaborativeVideos([firstItem], collaborativeVideoMap)
    const moment = normalizeNavMomentItem(firstPageItems[0])!
    collaborativeVideoMap.get('BV1collab123')!.moment = moment

    const secondPageItems = mergeCollaborativeVideos([secondItem], collaborativeVideoMap)

    expect(secondPageItems).toHaveLength(0)
    expect(moment.isCollaborative).toBe(true)
    expect(moment.author).toBe('作者A / 作者B')
    expect(moment.authors?.map(author => author.name)).toEqual(['作者A', '作者B'])
  })

  it('normalizes live moments and extracts room id for live preview', () => {
    const normalized = normalizeLiveMomentItem({
      title: '直播间',
      uname: '主播',
      face: 'https://i0.hdslb.com/face.jpg',
      pic: 'https://i0.hdslb.com/live.jpg',
      link: 'https://live.bilibili.com/12345',
      text_small: '1.2万人看过',
    })

    expect(normalized?.kind).toBe('live')
    expect(normalized?.roomid).toBe(12345)
    expect(normalized?.viewStr).toBe('1.2万人看过')
  })
})

describe('moments dock entry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('opens Moments as a BewlyScript optimized page', () => {
    const mainStore = useMainStore()
    const momentsDockItem = mainStore.getDockItemByPage(AppPage.Moments)

    expect(momentsDockItem?.hasBewlyPage).toBe(true)
    expect(momentsDockItem?.url).toBe('https://t.bilibili.com')
  })
})
