type GmXhrDetails = {
  method?: string
  url: string
  headers?: Record<string, string>
  data?: BodyInit | null
  anonymous?: boolean
  responseType?: string
  onload: (response: GmXhrResponse) => void
  onerror: (error: unknown) => void
  ontimeout: (error: unknown) => void
}

type GmXhrResponse = {
  status: number
  statusText?: string
  response?: unknown
  responseText?: string
  responseHeaders?: string
  finalUrl?: string
}

type GmApi = {
  xmlHttpRequest?: (details: GmXhrDetails) => unknown
}

function getNamespacedGm(): GmApi | undefined {
  return (globalThis as { GM?: GmApi }).GM
}

function getLegacyGmXhr(): ((details: GmXhrDetails) => unknown) | undefined {
  return (globalThis as { GM_xmlhttpRequest?: (details: GmXhrDetails) => unknown })
    .GM_xmlhttpRequest
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalized: Record<string, string> = {}
  const source = new Headers(headers)

  source.forEach((value, key) => {
    normalized[key] = value
  })

  return normalized
}

function parseResponseHeaders(rawHeaders: string | undefined): Headers {
  const headers = new Headers()
  if (!rawHeaders)
    return headers

  for (const line of rawHeaders.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator <= 0)
      continue

    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }

  return headers
}

function normalizeBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (body instanceof URLSearchParams)
    return body.toString()

  return body
}

function sanitizeFetchHeaders(headers: HeadersInit | undefined): Headers {
  const sanitized = new Headers(headers)
  sanitized.delete("cookie")
  sanitized.delete("host")
  sanitized.delete("origin")
  sanitized.delete("referer")
  sanitized.delete("user-agent")
  return sanitized
}

async function fallbackFetch(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: sanitizeFetchHeaders(init.headers),
  })
}

export async function userscriptFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const gmXhr = getNamespacedGm()?.xmlHttpRequest ?? getLegacyGmXhr()
  if (!gmXhr)
    return await fallbackFetch(url, init)

  return await new Promise<Response>((resolve, reject) => {
    gmXhr({
      method: init.method ?? "GET",
      url,
      headers: normalizeHeaders(init.headers),
      data: normalizeBody(init.body),
      anonymous: init.credentials === "omit",
      responseType: "text",
      onload(response) {
        const body = typeof response.response === "string"
          ? response.response
          : response.responseText ?? ""

        resolve(new Response(body, {
          status: response.status || 200,
          statusText: response.statusText ?? "OK",
          headers: parseResponseHeaders(response.responseHeaders),
        }))
      },
      onerror: reject,
      ontimeout: reject,
    })
  })
}

export function installUserscriptFetch(): void {
  ;(globalThis as { __BEWLYSCRIPT_FETCH__?: typeof userscriptFetch })
    .__BEWLYSCRIPT_FETCH__ = userscriptFetch
}
