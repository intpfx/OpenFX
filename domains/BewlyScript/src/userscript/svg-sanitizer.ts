const EXTERNAL_EXTENSION_URL_RE = /chrome-extension:\/\/[^"')\s]+/gi
const EXTERNAL_FONT_STYLE_RE = /<style\b[^>]*>(?:(?!<\/style>)[\s\S])*?(?:chrome-extension:\/\/|element-icons\.(?:woff2?|ttf))(?:(?!<\/style>)[\s\S])*?<\/style>/gi
const EXTERNAL_FONT_URL_RE = /url\((["']?)(?:(?:chrome-extension:\/\/|[^"')]*element-icons\.(?:woff2?|ttf))[^"')]*)\1\)/gi

export function sanitizeInlineSvg(svg: string): string {
  return svg
    .replace(EXTERNAL_FONT_STYLE_RE, '')
    .replace(EXTERNAL_FONT_URL_RE, 'url("")')
}

export function hasExternalExtensionUrl(value: string): boolean {
  EXTERNAL_EXTENSION_URL_RE.lastIndex = 0
  return EXTERNAL_EXTENSION_URL_RE.test(value)
}
