import type { RuntimeLocationHrefProvider } from '~/runtime/location'

import { createScenarioFetch } from './fixtures'
import type { DevScenario } from './scenarios'
import { getDevRuntimeUrl } from './scenarios'

interface BewlyDevGlobal {
  __BEWLYSCRIPT__?: boolean
  __BEWLYSCRIPT_FETCH__?: typeof fetch
  __BEWLYSCRIPT_PRESERVE_FETCH_ADAPTER__?: boolean
  __BEWLYSCRIPT_RUNTIME_LOCATION_HREF__?: RuntimeLocationHrefProvider
}

export function installDevRuntime(scenario: DevScenario): void {
  const runtimeGlobal = globalThis as BewlyDevGlobal
  runtimeGlobal.__BEWLYSCRIPT__ = true
  runtimeGlobal.__BEWLYSCRIPT_FETCH__ = createScenarioFetch(scenario)
  runtimeGlobal.__BEWLYSCRIPT_PRESERVE_FETCH_ADAPTER__ = true
  runtimeGlobal.__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__ = () => getDevRuntimeUrl(scenario)

  document.documentElement.setAttribute('data-bewly-dev-scenario', scenario.id)
  document.documentElement.setAttribute('data-bewly-dev-runtime-url', getDevRuntimeUrl(scenario))
}
