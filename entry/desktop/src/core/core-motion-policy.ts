export type CoreMotion = "animated" | "static";

export interface CoreMotionPolicy {
  mode: CoreMotion;
  reduceMotion: boolean;
  controlAvailable: boolean;
  status: string;
}

export const PERRY_ANIMATED_CORE_AVAILABLE = false;

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
