import { TABS_MESSAGE } from '~/background/messageListeners/tabs'
import { isUserscriptRuntime, openMobileUrlInCurrentPage } from '~/userscript/mobile'
import { sendMessage } from '~/utils/messaging'

function shouldForceCurrentTabNavigation(): boolean {
  return isUserscriptRuntime()
    && location.protocol === 'https:'
    && location.hostname === 'm.bilibili.com'
}

export async function openLinkInBackground(url: string) {
  if (shouldForceCurrentTabNavigation()) {
    openMobileUrlInCurrentPage(url)
    return
  }

  try {
    await sendMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, {
      contentScriptQuery: TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND,
      url,
    })
  }
  catch (error) {
    console.error('Failed to open link in background:', error)
  }
}
