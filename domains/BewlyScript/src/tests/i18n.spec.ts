import { describe, expect, it } from 'vitest'

import { t } from '~/utils/i18n'

describe('i18n helper', () => {
  it('reads nested locale keys from the local Chinese table', () => {
    expect(t('common.login')).toBe('登录')
    expect(t('settings.group_dock')).toBe('Dock 栏')
  })

  it('interpolates named placeholders and preserves fallback text', () => {
    expect(t('video_card.follow_user_confirm.message', { name: '测试UP' })).toContain('测试UP')
    expect(t('iframe_drawer.esc_hint', '点击抽屉外部区域，然后按 ESC 关闭')).toBe('点击抽屉外部区域，然后按 ESC 关闭')
  })
})
