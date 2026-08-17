/** Reasons an address cannot be opened by the embedded browser. */
export type BrowserAddressFailure = 'empty' | 'invalid' | 'credentials' | 'unsupported'

/** Result of normalizing user-entered browser text. */
export type BrowserAddressResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: BrowserAddressFailure }

const SCHEME = /^[a-z][a-z\d+.-]*:/i
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i
const HOST_WITH_PORT = /^(?:[^/?#:\s]+|\[[^\]]+\]):\d+(?:[/?#]|$)/

/**
 * Normalize an address for the sandboxed browser frame.
 * @param value - user-entered address.
 * @returns an absolute HTTP(S) URL or a precise rejection reason.
 */
export function normalizeBrowserAddress(value: string): BrowserAddressResult {
  const input = value.trim()
  if (input === '') return { ok: false, reason: 'empty' }

  const candidate = input.startsWith('//')
    ? `https:${input}`
    : LOOPBACK.test(input)
      ? `http://${input}`
      : HOST_WITH_PORT.test(input)
        ? `https://${input}`
        : SCHEME.test(input)
          ? input
          : `https://${input}`

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported' }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'credentials' }
  }
  return { ok: true, url: url.href }
}
