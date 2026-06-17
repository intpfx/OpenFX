import { describe, expect, it } from 'vitest'

import { buildUserscriptMetadata, USERSCRIPT_CONNECTS, USERSCRIPT_GRANTS, USERSCRIPT_MATCHES } from '../userscript/metadata'

describe('userscript metadata', () => {
  it('covers desktop and mobile Bilibili pages', () => {
    expect(USERSCRIPT_MATCHES).toContain('https://www.bilibili.com/*')
    expect(USERSCRIPT_MATCHES).toContain('https://m.bilibili.com/*')
    expect(USERSCRIPT_MATCHES).toContain('https://space.bilibili.com/*')
    expect(USERSCRIPT_MATCHES).toContain('https://search.bilibili.com/*')
  })

  it('requests Userscripts and Tampermonkey compatible grants', () => {
    expect(USERSCRIPT_GRANTS).toContain('GM.xmlHttpRequest')
    expect(USERSCRIPT_GRANTS).toContain('GM_xmlhttpRequest')
    expect(USERSCRIPT_GRANTS).toContain('GM.openInTab')
  })

  it('allows Bilibili API and media connections', () => {
    expect(USERSCRIPT_CONNECTS).toContain('*.bilibili.com')
    expect(USERSCRIPT_CONNECTS).toContain('*.hdslb.com')
    expect(USERSCRIPT_CONNECTS).toContain('api.bilibili.com')
  })

  it('emits a complete metadata block', () => {
    const metadata = buildUserscriptMetadata('0.0.1')

    expect(metadata).toContain('// ==UserScript==')
    expect(metadata).toContain('// @name         BewlyScript')
    expect(metadata).toContain('// @inject-into  content')
    expect(metadata).toContain('// @version      0.0.1-userscript.1')
    expect(metadata).toContain('// ==/UserScript==')
  })
})
