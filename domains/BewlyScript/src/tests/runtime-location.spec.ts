import { afterEach, describe, expect, it } from 'vitest'

import { getRuntimeLocationHref } from '~/runtime/location'
import { isHomePage } from '~/utils/main'

interface RuntimeLocationGlobal {
  __BEWLYSCRIPT_RUNTIME_LOCATION_HREF__?: () => string
}

const runtimeGlobal = globalThis as RuntimeLocationGlobal
const originalProvider = runtimeGlobal.__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__

afterEach(() => {
  if (originalProvider)
    runtimeGlobal.__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__ = originalProvider
  else
    delete runtimeGlobal.__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__
})

describe('runtime location', () => {
  it('uses an explicit runtime URL without changing the browser location', () => {
    runtimeGlobal.__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__ = () => 'https://www.bilibili.com/?page=Home'

    expect(getRuntimeLocationHref()).toBe('https://www.bilibili.com/?page=Home')
    expect(isHomePage()).toBe(true)
    expect(window.location.hostname).not.toBe('www.bilibili.com')
  })
})
