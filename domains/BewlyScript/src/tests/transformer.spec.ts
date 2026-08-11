import { describe, expect, it } from 'vitest'

import { createTransformer } from '~/utils/transformer'

describe('createTransformer', () => {
  it('allows a template ref to be unavailable during the initial render', () => {
    expect(() => createTransformer(undefined, { x: 0, y: 0 })).not.toThrow()
  })
})
