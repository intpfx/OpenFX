export interface MobileVideoFramePlayerSnapshot {
  currentTime: number
  danmakuHidden: boolean
  duration: number
  paused: boolean
  playbackRate: number
}

export interface MobileVideoFramePlayerViewState {
  danmakuActive: boolean
  danmakuLabel: string
  playButtonAriaLabel: string
  progressValue: string
  selectedRate: string
  timeText: string
}

export function formatMobileVideoDetailFrameTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'

  const rounded = Math.floor(seconds)
  const minutes = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export function createMobileVideoDetailFramePlayerViewState(snapshot: MobileVideoFramePlayerSnapshot): MobileVideoFramePlayerViewState {
  const duration = Number.isFinite(snapshot.duration) && snapshot.duration > 0 ? snapshot.duration : 0
  const currentTime = Number.isFinite(snapshot.currentTime) && snapshot.currentTime > 0 ? snapshot.currentTime : 0
  const playbackRate = Number.isFinite(snapshot.playbackRate) && snapshot.playbackRate > 0 ? snapshot.playbackRate : 1

  return {
    danmakuActive: !snapshot.danmakuHidden,
    danmakuLabel: snapshot.danmakuHidden ? '打开弹幕' : '关闭弹幕',
    playButtonAriaLabel: snapshot.paused ? '播放' : '暂停',
    progressValue: duration > 0 ? String(Math.round((currentTime / duration) * 1000)) : '0',
    selectedRate: String(playbackRate),
    timeText: `${formatMobileVideoDetailFrameTime(currentTime)} / ${formatMobileVideoDetailFrameTime(duration)}`,
  }
}
