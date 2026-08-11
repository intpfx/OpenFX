export type RuntimeLocationHrefProvider = () => string

interface BewlyRuntimeGlobal {
  __BEWLYSCRIPT_RUNTIME_LOCATION_HREF__?: RuntimeLocationHrefProvider
}

export function getRuntimeLocationHref(): string {
  const provider = (globalThis as BewlyRuntimeGlobal).__BEWLYSCRIPT_RUNTIME_LOCATION_HREF__
  if (provider) {
    const href = provider()
    if (href)
      return href
  }

  if (typeof location !== 'undefined')
    return location.href

  return 'about:blank'
}
