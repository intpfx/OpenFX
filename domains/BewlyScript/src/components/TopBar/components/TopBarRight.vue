<script setup lang="ts">
import { useWindowFocus } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import ALink from '~/components/ALink.vue'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { BILIBILI_LOGIN_URL, isMobileUserscriptRuntimePage, openBilibiliLoginPage, shouldEnableHoverInteractions } from '~/userscript/mobile'
import { getUserID, removeHttpFromUrl } from '~/utils/main'
import { isComponentVisible, shouldShowBadge, shouldShowDotBadge, shouldShowNumberBadge } from '~/utils/topBarBadge'

import { useTopBarInteraction } from '../composables/useTopBarInteraction'
import { MESSAGE_URL } from '../constants/urls'
import MorePop from './pops/MorePop.vue'
import NotificationsPop from './pops/NotificationsPop.vue'
import UploadPop from './pops/UploadPop.vue'
import UserPanelPop from './pops/UserPanelPop.vue'

defineProps<{}>()

const emit = defineEmits(['notificationsClick'])

const topBarStore = useTopBarStore()
// 使用 store 中的必要状态
const {
  isLogin,
  userInfo,
  unReadMessage,
  unReadDm,
  drawerVisible,
  popupVisible,
  unReadMessageCount,
  hasBCoinToReceive,
} = storeToRefs(topBarStore)

const { getUnreadMessageCount, checkBCoinReceiveStatus } = topBarStore

// 将 DOM 引用移到组件内部
const avatarImg = ref<HTMLElement | null>(null)
const avatarShadow = ref<HTMLElement | null>(null)

const { handleClickTopBarItem, setupTopBarItemHoverEvent, setupTopBarItemTransformer, forceWhiteIcon } = useTopBarInteraction()

const mid = getUserID() || ''

const upload = isComponentVisible('upload') ? setupTopBarItemHoverEvent('upload') : ref()
const notifications = isComponentVisible('notifications') ? setupTopBarItemHoverEvent('notifications') : ref()
const more = setupTopBarItemHoverEvent('more')
const avatar = setupTopBarItemHoverEvent('userPanel')

function handleLoginClick(event: MouseEvent) {
  if (event.defaultPrevented)
    return

  if (isLogin.value)
    return

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    event.preventDefault()

  if (event.defaultPrevented || !event.button) {
    event.preventDefault()
    openBilibiliLoginPage()
  }
}

function handleAuxiliaryLoginClick(event: MouseEvent) {
  if (event.button === 1) {
    event.preventDefault()
    openBilibiliLoginPage()
  }
}

// 将transformer初始化移到onMounted中
// 声明组件ref
const avatarPopRef = ref()
const notificationsPopRef = ref()
const uploadPopRef = ref()
const morePopRef = ref()

// 在组件挂载后初始化transformer，传入ref对象
onMounted(() => {
  nextTick(() => {
    setupTopBarItemTransformer('userPanel', avatarPopRef)
    if (isComponentVisible('notifications'))
      setupTopBarItemTransformer('notifications', notificationsPopRef)
    if (isComponentVisible('upload'))
      setupTopBarItemTransformer('upload', uploadPopRef)
    setupTopBarItemTransformer('more', morePopRef)
  })
})

// 只有当notifications组件可见时才监听相关属性
if (isComponentVisible('notifications')) {
  watch(
    () => popupVisible.value?.notifications ?? false,
    (newVal, oldVal) => {
      if (newVal === undefined || oldVal === undefined)
        return

      if (oldVal !== undefined && MESSAGE_URL.test(location.href))
        return

      if (newVal === oldVal)
        return

      if (!newVal)
        getUnreadMessageCount()
    },
    { immediate: true },
  )

  watch(
    () => drawerVisible.value?.notifications ?? false,
    (newVal, oldVal) => {
      if (newVal === oldVal)
        return

      if (!newVal)
        getUnreadMessageCount()
    },
  )
}

const focused = useWindowFocus()
watch(() => focused.value, (newVal, _) => {
  if (newVal && isLogin.value) {
    getUnreadMessageCount()
    checkBCoinReceiveStatus()
  }
})

const hoverInteractionsEnabled = computed(() => {
  return shouldEnableHoverInteractions(settings.value.touchScreenOptimization)
})
const isMobileUserscriptPage = computed(() => isMobileUserscriptRuntimePage())

// 修改通知点击处理
function handleNotificationsClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
  emit('notificationsClick', item)
}

function handleAvatarClick(event: MouseEvent) {
  handleClickTopBarItem(event, 'userPanel')
}

function closeMobileUserPanelDrawer() {
  if (popupVisible.value)
    popupVisible.value.userPanel = false
}

// 判断分割线是否应该显示
const shouldShowDivider = computed(() => {
  // 分割线左边的组件：creatorCenter
  const leftSideVisible = isComponentVisible('creatorCenter')

  // 分割线右边的组件：upload、notifications
  const rightSideVisible = isComponentVisible('upload')
    || isComponentVisible('notifications')

  // 只有当左右两边都至少有一边显示时才显示分割线
  return leftSideVisible && rightSideVisible
})
</script>

<template>
  <div
    class="right-side"
    flex="inline xl:1 justify-end items-center"
  >
    <div
      class="others"
      flex="~ items-center gap-1" h-46px px-5px
      text="$bew-text-1"
    >
      <div
        v-if="!isLogin"
        class="right-side-item mobile-login-avatar"
        :class="{ 'hover-enabled': hoverInteractionsEnabled }"
        important-w-auto
      >
        <a
          :href="BILIBILI_LOGIN_URL"
          class="login"
          :title="$t('topbar.sign_in')"
          @click="handleLoginClick"
          @auxclick="handleAuxiliaryLoginClick"
        >
          <div i-solar:user-circle-bold-duotone class="text-xl mr-2" />
          <span>{{ $t('topbar.sign_in') }}</span>
        </a>
      </div>
      <template v-if="isLogin">
        <div class="hidden lg:flex" gap-1>
          <!-- Creative center -->
          <div
            v-if="isComponentVisible('creatorCenter')"
            class="right-side-item"
            :class="{ 'hover-enabled': hoverInteractionsEnabled }"
          >
            <a
              :class="{ 'white-icon': forceWhiteIcon }"
              href="https://member.bilibili.com/platform/home"
              target="_blank"
              :title="$t('topbar.creative_center')"
            >
              <div i-mingcute:bulb-line />
            </a>
          </div>
        </div>

        <!-- More -->
        <div
          ref="more"
          class="right-side-item lg:!hidden flex"
          :class="{ active: popupVisible?.more, 'hover-enabled': hoverInteractionsEnabled }"
          @click="(event: MouseEvent) => handleClickTopBarItem(event, 'more')"
        >
          <a
            :class="{ 'white-icon': forceWhiteIcon }"
            title="More"
          >
            <div i-mingcute:menu-line />
          </a>

          <Transition name="slide-in">
            <MorePop
              v-show="popupVisible?.more"
              ref="morePopRef"
              class="bew-popover"
              @click.stop="() => {}"
            />
          </Transition>
        </div>

        <div class="hidden lg:flex" gap-1 items-center>
          <!-- Divider -->
          <div
            v-if="shouldShowDivider"
            :class="{ 'white-icon': forceWhiteIcon }"
            w-2px h-16px bg="$bew-border-color" mx-1
            rounded-4px
          />

          <!-- Upload -->
          <div
            v-if="isComponentVisible('upload')"
            ref="upload"
            class="right-side-item"
            :class="{ active: popupVisible?.upload, 'hover-enabled': hoverInteractionsEnabled }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'upload')"
          >
            <a
              class="upload"
              :class="{ 'white-icon': forceWhiteIcon }"
              style="backdrop-filter: var(--bew-filter-glass-1);"
              href="https://member.bilibili.com/platform/upload/video/frame"
              target="_blank"
              :title="$t('topbar.upload')"
            >
              <div i-mingcute:upload-line flex-shrink-0 />
            </a>

            <Transition name="slide-in">
              <UploadPop
                v-if="popupVisible?.upload"
                ref="uploadPopRef"
                class="bew-popover"
                @click.stop="() => {}"
              />
            </Transition>
          </div>

          <!-- Notifications -->
          <div
            v-if="isComponentVisible('notifications')"
            ref="notifications"
            class="right-side-item"
            :class="{ active: popupVisible?.notifications, 'hover-enabled': hoverInteractionsEnabled }"
            @click="(event: MouseEvent) => handleClickTopBarItem(event, 'notifications')"
          >
            <template v-if="unReadMessageCount > 0 && shouldShowBadge('notifications')">
              <div
                v-if="shouldShowNumberBadge('notifications')"
                class="unread-num-dot"
              >
                {{ unReadMessageCount > 99 ? '99+' : unReadMessageCount }}
              </div>
              <div
                v-else-if="shouldShowDotBadge('notifications')"
                class="unread-dot"
              />
            </template>

            <ALink
              :href="settings.openNotificationsPageAsDrawer ? undefined : 'https://message.bilibili.com'"
              :class="{ 'white-icon': forceWhiteIcon }"
              :title="$t('topbar.notifications')"
              type="topBar"
              :custom-click-event="settings.openNotificationsPageAsDrawer"
              @click="drawerVisible && (drawerVisible.notifications = true)"
            >
              <div i-tabler:bell />
            </ALink>

            <Transition name="slide-in">
              <NotificationsPop
                v-if="popupVisible?.notifications"
                ref="notificationsPopRef"
                class="bew-popover"
                :un-read-message="unReadMessage"
                :un-read-dm="unReadDm"
                @click.stop="() => {}"
                @item-click="handleNotificationsClick"
              />
            </Transition>
          </div>
        </div>
      </template>

      <!-- Avatar -->

      <div
        v-if="isLogin"
        ref="avatar"
        :class="{ hover: popupVisible?.userPanel && hoverInteractionsEnabled, 'hover-enabled': hoverInteractionsEnabled }"
        class="avatar right-side-item"
        @click="(event: MouseEvent) => handleClickTopBarItem(event, 'userPanel')"
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && settings.showBCoinReceiveReminder"
          class="unread-dot avatar-dot"
          :class="{ hover: popupVisible?.userPanel && hoverInteractionsEnabled }"
          style="z-index: 10; right: 6px; top: 6px;"
        />

        <ALink
          ref="avatarImg"
          :href="isMobileUserscriptPage ? undefined : `https://space.bilibili.com/${mid}`"
          type="topBar"
          class="avatar-img"
          :class="{ hover: popupVisible?.userPanel && hoverInteractionsEnabled }"
          :style="{
            backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
          }"
          :custom-click-event="isMobileUserscriptPage"
          @click="handleAvatarClick"
        />
        <div
          ref="avatarShadow"
          class="avatar-shadow"
          :class="{ hover: popupVisible?.userPanel && hoverInteractionsEnabled }"
          :style="{
            backgroundImage: `url(${userInfo.face ? removeHttpFromUrl(userInfo.face) : ''})`,
          }"
        />
        <svg
          v-if="userInfo.vip?.status === 1"
          class="vip-img"
          :class="{ hover: popupVisible?.userPanel && hoverInteractionsEnabled }"
          :style="{ opacity: popupVisible?.userPanel ? 1 : 0 }"
          bg="[url(https://i0.hdslb.com/bfs/seed/jinkela/short/user-avatar/big-vip.svg)] contain no-repeat"
          w="28%" h="28%" z-1
          pos="absolute bottom-18px right-11px" duration-300
        />

        <Transition name="fade">
          <div
            v-if="popupVisible?.userPanel && isMobileUserscriptPage"
            class="mobile-user-panel-mask"
            @click.stop="closeMobileUserPanelDrawer"
          />
        </Transition>

        <Transition :name="isMobileUserscriptPage ? 'mobile-user-panel' : 'slide-in'">
          <UserPanelPop
            v-if="popupVisible?.userPanel"
            ref="avatarPopRef"
            :user-info="userInfo"
            after:h="!0"
            class="bew-popover"
            pos="!left-auto !right-0" transform="!translate-x-0"
            @click.stop="() => {}"
          />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../styles/index.scss";

.mobile-user-panel-mask {
  position: fixed;
  inset: 0;
  z-index: 10020;
  background: rgba(0, 0, 0, 0.42);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 700px) {
  .right-side {
    flex: 0 0 auto;
  }

  .others {
    height: 44px;
    gap: 0;
    padding-inline: 0;
  }

  .others > :not(.avatar):not(.mobile-login-avatar) {
    display: none !important;
  }

  .mobile-login-avatar {
    width: 44px !important;
    height: 44px;
    justify-content: center;
  }

  .mobile-login-avatar .login {
    width: 44px !important;
    height: 44px !important;
    padding-inline: 0 !important;
    justify-content: center;
    color: var(--bew-text-1) !important;
    background: transparent !important;
    filter: none !important;
    box-shadow: none !important;
  }

  .mobile-login-avatar .login span {
    display: none;
  }

  .mobile-login-avatar .login > div {
    margin-right: 0 !important;
  }

  .mobile-login-avatar.hover-enabled .login:hover,
  .mobile-login-avatar .login:active {
    color: var(--bew-theme-color) !important;
    background: transparent !important;
  }

  .avatar.right-side-item {
    width: 44px;
    height: 44px;
  }

  .avatar-img,
  .avatar-shadow {
    width: 36px;
    height: 36px;
  }
}
</style>
