import type { TimedVisualState } from "./floating-visual-dock.ts";

type LabeledTimedVisualState<Id extends string> =
  & TimedVisualState<Id>
  & Readonly<{
    label: string;
  }>;

export const BLOUB_VISUAL_STATES = [
  { id: "idle", label: "待机", durationMs: 2_400 },
  { id: "thinking", label: "思考", durationMs: 2_600 },
  { id: "wink", label: "眨眼", durationMs: 1_600 },
  { id: "wide", label: "睁大", durationMs: 1_800 },
  { id: "alert", label: "警觉", durationMs: 2_400 },
  { id: "notify", label: "通知", durationMs: 2_200 },
  { id: "exclaim", label: "感叹", durationMs: 2_000 },
  { id: "sleep", label: "睡眠", durationMs: 2_400 },
  { id: "egg", label: "蛋形", durationMs: 1_800 },
  { id: "hexagon", label: "六边形", durationMs: 1_600 },
  { id: "play", label: "播放", durationMs: 2_000 },
  { id: "orbit", label: "轨道", durationMs: 3_400 },
  { id: "swirl", label: "涡旋", durationMs: 1_300 },
  { id: "burst", label: "爆发", durationMs: 2_600 },
  { id: "comet", label: "彗星", durationMs: 2_400 },
] as const satisfies readonly LabeledTimedVisualState<string>[];

export const NEBULA_ORB_VISUAL_STATES = [
  { id: "working", label: "运算", durationMs: 4_000 },
  { id: "sweep", label: "扫描", durationMs: 4_000 },
  { id: "shake", label: "震荡", durationMs: 4_000 },
  { id: "listening", label: "聆听", durationMs: 4_000 },
  { id: "network", label: "网络", durationMs: 4_000 },
  { id: "spin", label: "旋转", durationMs: 4_000 },
  { id: "breathing", label: "呼吸", durationMs: 4_000 },
  { id: "twinkle", label: "闪烁", durationMs: 4_000 },
  { id: "pulse", label: "脉冲", durationMs: 4_000 },
  { id: "tide", label: "潮汐", durationMs: 4_000 },
  { id: "aurora", label: "极光", durationMs: 4_000 },
  { id: "spiral", label: "螺旋", durationMs: 4_000 },
] as const satisfies readonly LabeledTimedVisualState<string>[];

export type BloubVisualStateId = (typeof BLOUB_VISUAL_STATES)[number]["id"];
export type NebulaOrbVisualStateId = (typeof NEBULA_ORB_VISUAL_STATES)[number]["id"];
