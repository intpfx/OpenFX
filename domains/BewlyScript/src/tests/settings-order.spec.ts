import { describe, expect, it } from 'vitest'

import { moveItem, moveItemByIndex } from '~/utils/reorder'

describe('reorder helpers', () => {
  it('moves a keyed item up or down inside the same list', () => {
    const list = ['Home', 'SearchResults', 'VideoDetail']

    expect(moveItem(list, 'SearchResults', -1)).toEqual(['SearchResults', 'Home', 'VideoDetail'])
    expect(moveItem(list, 'SearchResults', 1)).toEqual(['Home', 'VideoDetail', 'SearchResults'])
  })

  it('keeps the list unchanged when movement is out of bounds', () => {
    const list = ['Home', 'SearchResults']

    expect(moveItemByIndex(list, 0, -1)).toEqual(list)
    expect(moveItemByIndex(list, 1, 1)).toEqual(list)
    expect(moveItem(list, 'Missing', 1)).toEqual(list)
  })
})
