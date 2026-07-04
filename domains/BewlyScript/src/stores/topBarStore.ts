import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { useToast } from 'vue-toastification'

import {
  ACCOUNT_URL,
  BANGUMI_PLAY_URL,
  CHANNEL_PAGE_URL,
  CREATOR_PLATFORM_URL,
  MOMENTS_URL,
  READ_HOME_URL,
  READ_PREVIEW_URL,
  SEARCH_PAGE_URL,
  VIDEO_LIST_URL,
} from '~/components/TopBar/constants/urls'
import { updateInterval } from '~/components/TopBar/notify'
import type { PrivilegeInfo, UnReadDm, UnReadMessage, UserInfo } from '~/components/TopBar/types'
import { settings } from '~/logic'
import api from '~/utils/api'
import { getCSRF, getUserID, isHomePage } from '~/utils/main'

export const useTopBarStore = defineStore('topBar', () => {
  const toast = useToast()
  const isLogin = ref<boolean>(false)
  const userInfo = reactive<UserInfo>(createEmptyUserInfo())

  const unReadMessage = reactive<UnReadMessage>({} as UnReadMessage)
  const unReadDm = reactive<UnReadDm>({} as UnReadDm)

  const MESSAGE_KEYS_TO_COUNT: Array<keyof UnReadMessage> = ['reply', 'at', 'chat', 'sys_msg']

  function getLikeUnreadCount(): number {
    const likeCount = typeof unReadMessage.like === 'number' ? unReadMessage.like : 0
    const recvLike = (unReadMessage as UnReadMessage & { recv_like?: number }).recv_like
    const recvLikeCount = typeof recvLike === 'number' ? recvLike : 0

    return Math.max(likeCount, recvLikeCount)
  }

  const unReadMessageCount = computed((): number => {
    let result = 0

    // 统计顶栏默认展示的消息类型
    MESSAGE_KEYS_TO_COUNT.forEach((key) => {
      const value = unReadMessage[key]
      if (typeof value === 'number')
        result += value
    })

    // 可选地将点赞提醒计入顶栏通知角标
    if (settings.value.showLikeNotificationReminder)
      result += getLikeUnreadCount()

    // 计算 unReadDm 中的未读消息
    if (typeof unReadDm.follow_unread === 'number')
      result += unReadDm.follow_unread
    if (typeof unReadDm.unfollow_unread === 'number')
      result += unReadDm.unfollow_unread

    return result
  })

  // B币领取状态
  const privilegeInfo = reactive<PrivilegeInfo>({} as PrivilegeInfo)
  const hasBCoinToReceive = ref<boolean>(false)
  const bCoinAlreadyReceived = ref<boolean>(false) // 记录B币是否已经领取

  // 大会员经验领取状态
  const vipExpAlreadyReceived = ref<boolean>(false) // 记录大会员经验是否已经领取

  const LOGIN_STATE_REFRESH_DELAYS_MS = [900, 1800, 3200, 5200, 8500, 13000]
  const USER_AVATAR_REFRESH_DELAYS_MS = [250, 1200, 3200, 7000]
  let loginStateRefreshTimers: Array<ReturnType<typeof setTimeout>> = []
  let userAvatarRefreshTimers: Array<ReturnType<typeof setTimeout>> = []

  // UI State
  const drawerVisible = reactive({
    notifications: false,
  })
  const notificationsDrawerUrl = ref<string>('https://message.bilibili.com/')
  const popupVisible = reactive({
    channels: false,
    userPanel: false,
    notifications: false,
    upload: false,
    more: false,
  })

  // TopBar visibility state
  const topBarVisible = ref<boolean>(true)
  const searchKeyword = ref<string>('')

  // 从 useTopBarReactive 整合的计算属性
  const isSearchPage = computed((): boolean => {
    return SEARCH_PAGE_URL.test(location.href)
  })

  const isTopBarFixed = computed((): boolean => {
    if (
      isHomePage()
      || VIDEO_LIST_URL.test(location.href)
      || BANGUMI_PLAY_URL.test(location.href)
      || MOMENTS_URL.test(location.href)
      || CHANNEL_PAGE_URL.test(location.href)
      || READ_HOME_URL.test(location.href)
      || ACCOUNT_URL.test(location.href)
    ) {
      return true
    }

    return false
  })

  const showTopBar = computed((): boolean => {
    if (
      CREATOR_PLATFORM_URL.test(location.href)
      || READ_PREVIEW_URL.test(location.href)
    ) {
      return false
    }

    if (settings.value.showTopBar)
      return true
    return false
  })

  // User Methods
  function createEmptyUserInfo(): UserInfo {
    return {
      face: '',
      level_info: {
        current_level: 0,
        current_min: 0,
        current_exp: 0,
        next_exp: 0,
      },
      mid: 0,
      money: 0,
      uname: '',
      vip: {
        status: 0,
        due_date: 0,
      },
      wallet: {
        mid: 0,
        bcoin_balance: 0,
        coupon_balance: 0,
      },
      wbi_img: {
        img_url: '',
        sub_url: '',
      },
      is_senior_member: false,
    }
  }

  function resetUserInfo() {
    Object.assign(userInfo, createEmptyUserInfo())
  }

  function resetLoginDependentState() {
    isLogin.value = false
    clearUserAvatarRefreshTimers()
    resetUserInfo()
    bCoinAlreadyReceived.value = false
    hasBCoinToReceive.value = false
    vipExpAlreadyReceived.value = false
  }

  function isLoggedInNavData(data: Partial<UserInfo> | undefined): data is UserInfo {
    if (!data)
      return false

    return data.isLogin !== false && Number(data.mid) > 0
  }

  function isDefaultAvatarUrl(face: string | undefined): boolean {
    if (!face)
      return true

    return /(?:^|\/)(?:noface|default[_-]?avatar)\.(?:jpg|jpeg|png|webp|gif)(?:$|[?#@])/i.test(face)
  }

  function getCurrentUserMid(): string {
    const mid = Number(userInfo.mid || getUserID())
    return Number.isFinite(mid) && mid > 0 ? String(mid) : ''
  }

  async function hydrateUserAvatarFromSpaceInfo(force = false) {
    const mid = getCurrentUserMid()
    if (!mid || (!force && !isDefaultAvatarUrl(userInfo.face)))
      return

    try {
      const res = await api.user.getSpaceInfo({ mid })
      const face = typeof res?.data?.face === 'string' ? res.data.face : ''
      if (face && !isDefaultAvatarUrl(face))
        userInfo.face = face
      if (!userInfo.uname && typeof res?.data?.name === 'string')
        userInfo.uname = res.data.name
    }
    catch {
      // Keep the nav payload; avatar refresh is best-effort.
    }
  }

  function clearUserAvatarRefreshTimers() {
    userAvatarRefreshTimers.forEach(timer => clearTimeout(timer))
    userAvatarRefreshTimers = []
  }

  function scheduleUserAvatarRefresh() {
    clearUserAvatarRefreshTimers()

    USER_AVATAR_REFRESH_DELAYS_MS.forEach((delay) => {
      const timer = setTimeout(() => {
        userAvatarRefreshTimers = userAvatarRefreshTimers.filter(activeTimer => activeTimer !== timer)
        if (isLogin.value)
          void hydrateUserAvatarFromSpaceInfo(true)
      }, delay)
      userAvatarRefreshTimers.push(timer)
    })
  }

  function refreshUserAvatar() {
    if (!isLogin.value)
      return

    void hydrateUserAvatarFromSpaceInfo(true)
    scheduleUserAvatarRefresh()
  }

  async function getUserInfo(retryCount = 0) {
    const maxRetries = 2 // 最多重试2次
    const retryDelay = (retryCount + 1) * 1000 // 递增延迟: 1s, 2s

    try {
      const res = await api.user.getUserInfo()

      if (res.code === 0 && isLoggedInNavData(res.data)) {
        const wasLoggedIn = isLogin.value
        const previousMid = userInfo.mid

        isLogin.value = true
        Object.assign(userInfo, createEmptyUserInfo(), res.data)
        await hydrateUserAvatarFromSpaceInfo(true)
        scheduleUserAvatarRefresh()

        // 如果是新登录或者切换了账号，重置B币领取状态
        if (!wasLoggedIn || previousMid !== userInfo.mid) {
          bCoinAlreadyReceived.value = false
          hasBCoinToReceive.value = false
          vipExpAlreadyReceived.value = false
        }
      }
      else if (res.code === -101 || res.code === 0) {
        // /x/web-interface/nav 在未登录时也可能返回 code 0，但 data.isLogin=false/mid=0。
        resetLoginDependentState()
      }
      else {
        // 其他错误码
        // 对于非未登录的错误，如果还有重试机会，则重试
        if (retryCount < maxRetries) {
          setTimeout(() => {
            getUserInfo(retryCount + 1)
          }, retryDelay)
          return
        }

        resetLoginDependentState()
      }
    }
    catch {
      // 如果还有重试机会，则重试
      if (retryCount < maxRetries) {
        setTimeout(() => {
          getUserInfo(retryCount + 1)
        }, retryDelay)
        return
      }

      // 重试次数用尽，标记为未登录
      resetLoginDependentState()
    }
  }

  // Notification Methods
  async function getUnreadMessageCount() {
    if (!isLogin.value)
      return

    try {
      let res = await api.notification.getUnreadMsg()
      if (res.code === 0) {
        Object.assign(unReadMessage, res.data)
      }

      res = await api.notification.getUnreadDm()
      if (res.code === 0) {
        Object.assign(unReadDm, res.data)
      }
    }
    catch (error) {
      console.error(error)
    }
  }

  // B币领取状态检查
  async function checkBCoinReceiveStatus() {
    if (!isLogin.value || userInfo.vip?.status !== 1 || !settings.value.showBCoinReceiveReminder)
      return

    // 如果已经记录为已领取，则不再请求
    if (bCoinAlreadyReceived.value) {
      return
    }

    try {
      const res = await api.user.getPrivilegeInfo()
      if (res.code === 0) {
        Object.assign(privilegeInfo, res.data)
        if (privilegeInfo.vip_type < 2) {
          return
        }
        // 检查B币兑换状态 (type: 1)
        const bCoinItem = privilegeInfo.list?.find(item => item.type === 1)
        if (bCoinItem) {
          if (bCoinItem.state === 1) {
            // 如果已经领取，记录状态并设置为false
            bCoinAlreadyReceived.value = true
            hasBCoinToReceive.value = false
          }
          else {
            // 如果有权限领取且未领取
            hasBCoinToReceive.value = bCoinItem.state === 0 && bCoinItem.next_receive_days > 0

            // 如果开启了自动领取，则自动领取B币
            if (hasBCoinToReceive.value && settings.value.autoReceiveBCoinCoupon) {
              await autoReceiveBCoin()
            }
          }
        }
        else {
          hasBCoinToReceive.value = false
        }
      }
    }
    catch (error) {
      console.error('Failed to check B-coin receive status:', error)
      hasBCoinToReceive.value = false
    }
  }

  // 自动领取B币
  async function autoReceiveBCoin() {
    if (!isLogin.value || !hasBCoinToReceive.value) {
      return
    }

    try {
      const res = await api.user.exchangeCoupon({
        type: '1',
        csrf: getCSRF(),
      })

      if (res.code === 0) {
        // 领取成功，更新状态
        bCoinAlreadyReceived.value = true
        hasBCoinToReceive.value = false
        toast.success('B币券自动领取成功')
      }
      else {
        toast.error(`B币券自动领取失败: ${res.message}`)
      }
    }
    catch {
      toast.error('B币券自动领取失败，请稍后重试')
    }
  }

  // 自动领取大会员经验
  async function autoReceiveVipExp() {
    if (!isLogin.value || userInfo.vip?.status !== 1 || !settings.value.autoReceiveVipExp) {
      return
    }

    // 如果已经记录为已领取，则不再请求
    if (vipExpAlreadyReceived.value) {
      return
    }

    try {
      const res = await api.user.receiveVipExp({
        csrf: getCSRF(),
      })

      if (res.code === 0) {
        // 领取成功，更新状态并显示消息
        vipExpAlreadyReceived.value = true
        toast.success('大会员经验自动领取成功', { timeout: 1500 })
      }
      else if (res.code === 69198) {
        // 经验已领取，静默更新状态
        vipExpAlreadyReceived.value = true
      }
      // 其他错误码不处理，下次继续尝试
    }
    catch {
      // 请求失败不处理，下次继续尝试
    }
  }

  function handleNotificationsItemClick(item: { name: string, url: string, unreadCount: number, icon: string }) {
    if (settings.value.openNotificationsPageAsDrawer) {
      drawerVisible.notifications = true
      notificationsDrawerUrl.value = item.url
    }
  }

  function closeAllPopups(exceptionKey?: string) {
    Object.keys(popupVisible).forEach((key) => {
      if (key !== exceptionKey)
        popupVisible[key as keyof typeof popupVisible] = false
    })
  }

  let updateTimer: ReturnType<typeof setInterval> | null = null

  async function initData() {
    await getUserInfo()

    // 只有在登录状态下才调用这些需要登录的API
    if (isLogin.value) {
      checkBCoinReceiveStatus()
      autoReceiveVipExp()
      getUnreadMessageCount()
    }
  }

  function startUpdateTimer() {
    if (updateTimer) {
      clearInterval(updateTimer)
      updateTimer = null
    }
    updateTimer = setInterval(() => {
      if (isLogin.value) {
        getUnreadMessageCount()
        checkBCoinReceiveStatus()
        autoReceiveVipExp()
      }
    }, updateInterval)
  }
  function stopUpdateTimer() {
    if (updateTimer) {
      clearInterval(updateTimer)
      updateTimer = null
    }
  }

  function clearLoginStateRefreshTimers() {
    loginStateRefreshTimers.forEach(timer => clearTimeout(timer))
    loginStateRefreshTimers = []
  }

  async function refreshLoginStateAfterLoginAttempt() {
    await getUserInfo()

    if (!isLogin.value)
      return

    startUpdateTimer()
    checkBCoinReceiveStatus()
    autoReceiveVipExp()
    getUnreadMessageCount()
    clearLoginStateRefreshTimers()
  }

  function scheduleLoginStateRefresh() {
    clearLoginStateRefreshTimers()

    LOGIN_STATE_REFRESH_DELAYS_MS.forEach((delay) => {
      const timer = setTimeout(() => {
        loginStateRefreshTimers = loginStateRefreshTimers.filter(activeTimer => activeTimer !== timer)
        void refreshLoginStateAfterLoginAttempt()
      }, delay)
      loginStateRefreshTimers.push(timer)
    })
  }

  function cleanup() {
    clearLoginStateRefreshTimers()
    clearUserAvatarRefreshTimers()
    stopUpdateTimer()
    resetUserInfo()

    Object.keys(unReadMessage).forEach((key) => {
      unReadMessage[key as keyof UnReadMessage] = 0
    })
    Object.keys(unReadDm).forEach((key) => {
      unReadDm[key as keyof UnReadDm] = 0
    })

    closeAllPopups()
    drawerVisible.notifications = false
    isLogin.value = false
    hasBCoinToReceive.value = false
    bCoinAlreadyReceived.value = false
    vipExpAlreadyReceived.value = false
  }

  // 添加鼠标状态跟踪
  const isMouseOverPopup = reactive<Record<string, boolean>>({})

  // 设置鼠标是否在弹窗上
  function setMouseOverPopup(key: string, value: boolean) {
    isMouseOverPopup[key] = value
  }

  // 获取鼠标是否在弹窗上
  function getMouseOverPopup(key: string) {
    return isMouseOverPopup[key] || false
  }

  // 设置TopBar可见状态
  function setTopBarVisible(visible: boolean) {
    topBarVisible.value = visible
  }

  return {
    isLogin,
    userInfo,
    unReadMessage,
    unReadDm,
    unReadMessageCount,
    drawerVisible,
    notificationsDrawerUrl,
    popupVisible,

    isSearchPage,
    isTopBarFixed,
    showTopBar,

    getUserInfo,
    getUnreadMessageCount,
    handleNotificationsItemClick,
    closeAllPopups,
    initData,
    cleanup,
    refreshUserAvatar,
    scheduleLoginStateRefresh,
    isMouseOverPopup,
    setMouseOverPopup,
    getMouseOverPopup,
    startUpdateTimer,
    stopUpdateTimer,
    checkBCoinReceiveStatus,
    autoReceiveBCoin,
    autoReceiveVipExp,

    privilegeInfo,
    hasBCoinToReceive,
    bCoinAlreadyReceived,

    topBarVisible,
    searchKeyword,
    setTopBarVisible,
  }
})
