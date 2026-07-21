import type { DesktopLaunchMode } from "./types.ts";

export type CoreMotion = "animated" | "static";

export interface CoreMotionPolicy {
  mode: CoreMotion;
  reduceMotion: boolean;
  controlAvailable: boolean;
  status: string;
}

export const PERRY_ANIMATED_CORE_AVAILABLE = false;
export const PERRY_VISIBLE_MAIN_WINDOW_AVAILABLE = false;

export interface PerryWindowPolicy {
  mode: DesktopLaunchMode;
  controlAvailable: boolean;
  status: string;
}

export const derivePerryWindowPolicy = (
  requestedMode: DesktopLaunchMode,
  visibleMainWindowAvailable: boolean,
): PerryWindowPolicy =>
  visibleMainWindowAvailable
    ? {
      mode: requestedMode,
      controlAvailable: true,
      status: requestedMode === "menuBarOnly" ? "菜单栏后台" : "常规窗口",
    }
    : {
      mode: "menuBarOnly",
      controlAvailable: false,
      status: "菜单栏后台（Perry 稳定模式）",
    };

export const deriveCoreMotionPolicy = (
  requestedReduceMotion: boolean,
  animatedCoreAvailable: boolean,
): CoreMotionPolicy =>
  animatedCoreAvailable
    ? {
      mode: requestedReduceMotion ? "static" : "animated",
      reduceMotion: requestedReduceMotion,
      controlAvailable: true,
      status: requestedReduceMotion ? "静态核心" : "动态核心",
    }
    : {
      mode: "static",
      reduceMotion: true,
      controlAvailable: false,
      status: "静态核心（Perry 稳定模式）",
    };
