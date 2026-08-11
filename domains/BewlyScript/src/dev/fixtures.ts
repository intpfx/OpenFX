import type { DevScenario } from './scenarios'

function createSvgDataUrl(label: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="28" fill="${color}"/><circle cx="520" cy="72" r="88" fill="rgba(255,255,255,.12)"/><text x="36" y="300" fill="white" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="34" font-weight="700">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function createRecommendationItems() {
  const colors = ['#fb7299', '#6c75e8', '#00aeec', '#4fbd83', '#e0a43a']

  return Array.from({ length: 30 }, (_, index) => {
    const number = index + 1
    const paddedNumber = String(number).padStart(2, '0')
    return {
      id: 100_000 + number,
      bvid: `BV1DEVSCENE${paddedNumber}`,
      cid: 200_000 + number,
      title: `Scenario Lab 示例视频 ${paddedNumber}`,
      desc: '用于 BewlyScript 本地开发的固定数据，不会访问真实 B 站接口。',
      pic: createSvgDataUrl(`BEWLY ${paddedNumber}`, colors[index % colors.length]),
      duration: 180 + index * 17,
      goto: 'av',
      uri: `https://www.bilibili.com/video/BV1DEVSCENE${paddedNumber}`,
      pubdate: 1_725_000_000 - index * 3600,
      owner: {
        mid: 9000 + number,
        name: `本地场景 UP ${paddedNumber}`,
        face: createSvgDataUrl(`UP ${paddedNumber}`, colors[(index + 2) % colors.length]),
      },
      stat: {
        view: 120_000 + index * 12_345,
        danmaku: 860 + index * 23,
        like: 8_600 + index * 311,
      },
      rcmd_reason: index % 3 === 0 ? { content: '本地场景' } : undefined,
      is_followed: index % 5 === 0,
      track_id: `scenario-${paddedNumber}`,
    }
  })
}

function createJsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-bewlyscript-scenario': 'true',
    },
  })
}

export function createScenarioFetch(scenario: DevScenario): typeof fetch {
  const recommendationItems = createRecommendationItems()

  return async (input) => {
    const requestUrl = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      scenario.targetUrl,
    )

    if (requestUrl.pathname === '/x/web-interface/nav') {
      return createJsonResponse({
        code: 0,
        data: {
          isLogin: false,
          mid: 0,
          uname: 'Scenario Lab',
          face: '',
          wbi_img: {
            img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
            sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
          },
        },
      })
    }

    if (requestUrl.pathname === '/x/web-interface/wbi/index/top/feed/rcmd') {
      return createJsonResponse({
        code: 0,
        message: '0',
        data: {
          item: recommendationItems,
          business_card: null,
          floor_info: null,
          user_feature: null,
        },
      })
    }

    return createJsonResponse({ code: 0, message: '0', data: {} })
  }
}
