export type DevScenarioId = 'home' | 'settings' | 'portrait-home' | 'portrait-settings'

export interface DevScenario {
  id: DevScenarioId
  label: string
  targetUrl: string
  openSettings: boolean
  recommendedViewport?: {
    width: number
    height: number
  }
}

export const DEV_SCENARIOS: readonly DevScenario[] = [
  {
    id: 'home',
    label: '桌面首页',
    targetUrl: 'https://www.bilibili.com/?page=Home',
    openSettings: false,
  },
  {
    id: 'settings',
    label: '桌面设置',
    targetUrl: 'https://www.bilibili.com/?page=Home',
    openSettings: true,
  },
  {
    id: 'portrait-home',
    label: '竖屏首页',
    targetUrl: 'https://www.bilibili.com/?page=Home',
    openSettings: false,
    recommendedViewport: { width: 402, height: 844 },
  },
  {
    id: 'portrait-settings',
    label: '竖屏设置',
    targetUrl: 'https://www.bilibili.com/?page=Home',
    openSettings: true,
    recommendedViewport: { width: 402, height: 844 },
  },
]

export function getDevScenario(url: string = window.location.href): DevScenario {
  const requestedId = new URL(url).searchParams.get('scenario')
  return DEV_SCENARIOS.find(scenario => scenario.id === requestedId) ?? DEV_SCENARIOS[0]
}

export function getDevRuntimeUrl(scenario: DevScenario, localUrl: string = window.location.href): string {
  const runtimeUrl = new URL(scenario.targetUrl)
  const localSearchParams = new URL(localUrl).searchParams

  for (const [key, value] of localSearchParams) {
    if (key !== 'scenario' && key !== 'toolbar')
      runtimeUrl.searchParams.set(key, value)
  }

  return runtimeUrl.toString()
}
