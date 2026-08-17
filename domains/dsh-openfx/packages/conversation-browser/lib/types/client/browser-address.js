const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i;
const HOST_WITH_PORT = /^(?:[^/?#:\s]+|\[[^\]]+\]):\d+(?:[/?#]|$)/;
/**
 * Normalize an address for the sandboxed browser frame.
 * @param value - user-entered address.
 * @returns an absolute HTTP(S) URL or a precise rejection reason.
 */
export function normalizeBrowserAddress(value) {
    const input = value.trim();
    if (input === '')
        return { ok: false, reason: 'empty' };
    const candidate = input.startsWith('//')
        ? `https:${input}`
        : LOOPBACK.test(input)
            ? `http://${input}`
            : HOST_WITH_PORT.test(input)
                ? `https://${input}`
                : SCHEME.test(input)
                    ? input
                    : `https://${input}`;
    let url;
    try {
        url = new URL(candidate);
    }
    catch {
        return { ok: false, reason: 'invalid' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'unsupported' };
    }
    if (url.username !== '' || url.password !== '') {
        return { ok: false, reason: 'credentials' };
    }
    return { ok: true, url: url.href };
}
