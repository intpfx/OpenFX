<script lang="ts" setup>
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_common')">
      <SettingsItem :title="$t('settings.touch_screen_optimization')" :desc="$t('settings.touch_screen_optimization_desc')" right-width="auto">
        <Radio v-model="settings.touchScreenOptimization" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_horizontal_scrolling')" :desc="$t('settings.enable_horizontal_scrolling_desc')" right-width="auto">
        <Radio v-model="settings.enableHorizontalScrolling" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_link_opening_behavior')">
      <SettingsItem right-width="auto">
        <template #title>
          <div v-html="$t('settings.close_drawer_without_pressing_esc_again')" />
        </template>
        <Radio v-model="settings.closeDrawerWithoutPressingEscAgain" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_ad_blocking')">
      <SettingsItem :title="$t('settings.block_ads')" right-width="auto">
        <Radio v-model="settings.blockAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')" right-width="auto">
        <Radio v-model="settings.blockTopSearchPageAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.clean_url_argument')" :desc="$t('settings.clean_url_argument_desc')" right-width="auto">
        <Radio v-model="settings.cleanUrlArgument" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_clean_share_link')">
      <SettingsItem :title="$t('settings.enable_clean_share_link')" :desc="$t('settings.enable_clean_share_link_desc')" right-width="auto">
        <Radio v-model="settings.enableCleanShareLink" />
      </SettingsItem>
      <template v-if="settings.enableCleanShareLink">
        <SettingsItem :title="$t('settings.clean_share_link_include_title')" :desc="$t('settings.clean_share_link_include_title_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkIncludeTitle" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.clean_share_link_remove_tracking_params')" :desc="$t('settings.clean_share_link_remove_tracking_params_desc')" right-width="auto">
          <Radio v-model="settings.cleanShareLinkRemoveTrackingParams" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
</style>
