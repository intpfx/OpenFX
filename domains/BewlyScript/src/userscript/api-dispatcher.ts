import { API_COLLECTION } from "~/background/messageListeners/api"
import { TABS_MESSAGE } from "~/background/messageListeners/tabs"
import { apiListenerFactory } from "~/background/utils"

type RuntimeMessage<T = any> = {
  type?: string
  data?: T
}

type OpenInTabOptions = {
  active?: boolean
}

type GmApi = {
  openInTab?: (url: string, options?: boolean | OpenInTabOptions) => unknown
}

const fullApi = Object.assign({}, ...API_COLLECTION)
const handleApiMessage = apiListenerFactory(fullApi)

function normalizeUrl(url: string | undefined): string {
  if (!url)
    return ""

  return url.startsWith("//") ? `https:${url}` : url
}

function openInBackground(url: string | undefined): unknown {
  const normalizedUrl = normalizeUrl(url)
  if (!normalizedUrl)
    return undefined

  const gm = (globalThis as { GM?: GmApi }).GM
  if (gm?.openInTab)
    return gm.openInTab(normalizedUrl, { active: false })

  return window.open(normalizedUrl, "_blank")
}

export async function dispatchRuntimeMessage(message: RuntimeMessage): Promise<unknown> {
  if (message.type === TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND) {
    return openInBackground((message.data as { url?: string } | undefined)?.url)
  }

  const data = message.data as { contentScriptQuery?: string } | undefined
  if (data?.contentScriptQuery) {
    return await handleApiMessage(data)
  }

  console.warn("[BewlyScript] Unhandled runtime message:", message)
  return undefined
}
