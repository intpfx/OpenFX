import { describe, expect, it } from 'vitest'

import allSearchPageSource from '../contentScripts/views/SearchResults/pages/AllSearchPage.vue?raw'

describe('search results security', () => {
  it('renders remote media_ft titles as text instead of raw html', () => {
    const mediaFtTitleBlock = allSearchPageSource.match(/<div class="media-ft-highlight-title"[\s\S]*?<\/div>/)?.[0] ?? ''

    expect(mediaFtTitleBlock).toContain('{{ removeHighlight(item.title) }}')
    expect(mediaFtTitleBlock).not.toContain('v-html')
    expect(allSearchPageSource).not.toContain('v-html="item.title"')
  })
})
