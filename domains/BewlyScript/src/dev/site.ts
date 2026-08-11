type LiveSiteGlobal = typeof globalThis & {
  __BEWLYSCRIPT__?: boolean
  __BEWLYSCRIPT_DEV_LIGHT_DOM__?: boolean
}

const runtimeGlobal = globalThis as LiveSiteGlobal

runtimeGlobal.__BEWLYSCRIPT__ = true
runtimeGlobal.__BEWLYSCRIPT_DEV_LIGHT_DOM__ = true

void import('../contentScripts')
