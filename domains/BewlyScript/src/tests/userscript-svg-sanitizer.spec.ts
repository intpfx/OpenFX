import { describe, expect, it } from 'vitest'

import { hasExternalExtensionUrl, sanitizeInlineSvg } from '../userscript/svg-sanitizer'

describe('userscript svg sanitizer', () => {
  it('removes external extension font styles embedded in svg symbols', () => {
    const svg = '<svg><symbol id="channel-competition"><defs><style>@font-face{font-family:element-icons;src:url(chrome-extension://moombeodfomdpjnpocobemoiaemednkg/fonts/element-icons.woff) format("woff"),url("chrome-extension://moombeodfomdpjnpocobemoiaemednkg/fonts/element-icons.ttf ") format("truetype")}</style></defs><path fill="currentColor"/></symbol></svg>'

    const sanitized = sanitizeInlineSvg(svg)

    expect(sanitized).toContain('<symbol id="channel-competition">')
    expect(sanitized).toContain('<path fill="currentColor"/>')
    expect(sanitized).not.toContain('@font-face')
    expect(sanitized).not.toContain('element-icons.woff')
    expect(hasExternalExtensionUrl(sanitized)).toBe(false)
  })

  it('neutralizes remaining external extension font urls', () => {
    const css = 'src:url(chrome-extension://extension-id/fonts/element-icons.woff) format("woff")'

    expect(sanitizeInlineSvg(css)).toBe('src:url("") format("woff")')
  })
})
