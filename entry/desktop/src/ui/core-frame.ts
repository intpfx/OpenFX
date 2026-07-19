export type CoreNodeState =
  | "startup"
  | "unpaired"
  | "online"
  | "degraded"
  | "fault";

export const CORE_FRAME_INTERVAL_MS = 1_000 / 24;

export const CORE_STATE_COLORS: Readonly<Record<CoreNodeState, string>> = Object.freeze(
  {
    startup: "#38BDF8",
    unpaired: "#FBBF24",
    online: "#2DD4BF",
    degraded: "#FB923C",
    fault: "#F87171",
  },
);

export interface CoreFrameInput {
  width: number;
  height: number;
  timestampMs: number;
  state: CoreNodeState;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  reduceMotion: boolean;
}

export interface CoreRing {
  centerX: number;
  centerY: number;
  radius: number;
  alpha: number;
  lineWidth: number;
}

export interface CoreOrbitNode {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

export interface CoreConnection {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  alpha: number;
}

export interface CorePulse {
  centerX: number;
  centerY: number;
  radius: number;
  amplitude: number;
  alpha: number;
}

export interface CoreFrame {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  accentColor: string;
  rings: CoreRing[];
  orbitNodes: CoreOrbitNode[];
  connections: CoreConnection[];
  pulse: CorePulse;
}

export interface CoreRenderDecisionInput {
  nowMs: number;
  lastFrameAtMs: number;
  reduceMotion: boolean;
  staticFrameDrawn: boolean;
  windowVisible: boolean;
}

export const createCoreFrame = (input: CoreFrameInput): CoreFrame => {
  const width = positive(input.width);
  const height = positive(input.height);
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.max(1, Math.min(width, height) / 2 - 8);
  const cpu = clampPercent(input.cpuUsagePercent) / 100;
  const memory = clampPercent(input.memoryUsagePercent) / 100;
  const motionPhase = input.reduceMotion
    ? Math.PI / 6
    : (input.timestampMs / 1_000) * Math.PI * 2;

  const rings = [0.27, 0.46, 0.66, 0.86].map((scale, index) => ({
    centerX,
    centerY,
    radius: outerRadius * scale,
    alpha: 0.16 + index * 0.07,
    lineWidth: index === 1 ? 2 : 1,
  }));

  const orbitCount = 4 + Math.round(memory * 12);
  const orbitRadius = outerRadius * 0.75;
  const nodeRadius = Math.max(0.5, Math.min(4, outerRadius * 0.03));
  const orbitNodes: CoreOrbitNode[] = [];
  const connections: CoreConnection[] = [];
  for (let index = 0; index < orbitCount; index += 1) {
    const angle = motionPhase * 0.16 + (index / orbitCount) * Math.PI * 2;
    const node = {
      x: centerX + Math.cos(angle) * orbitRadius,
      y: centerY + Math.sin(angle) * orbitRadius,
      radius: nodeRadius,
      alpha: 0.48 + (index % 3) * 0.16,
    };
    orbitNodes.push(node);
    connections.push({
      fromX: node.x,
      fromY: node.y,
      toX: centerX,
      toY: centerY,
      alpha: 0.09 + (index % 4) * 0.025,
    });
  }

  const amplitude = outerRadius * (0.025 + cpu * 0.09);
  const wave = input.reduceMotion ? 0.5 : 0.5 + Math.sin(motionPhase) * 0.5;
  const pulse = {
    centerX,
    centerY,
    radius: outerRadius * 0.28 + amplitude * wave,
    amplitude,
    alpha: 0.35 + cpu * 0.45,
  };

  return {
    width,
    height,
    centerX,
    centerY,
    accentColor: coreStateColor(input.state),
    rings,
    orbitNodes,
    connections,
    pulse,
  };
};

export const shouldRenderCoreFrame = (
  input: CoreRenderDecisionInput,
): boolean => {
  if (!input.windowVisible) return false;
  if (input.reduceMotion) return !input.staticFrameDrawn;
  if (input.lastFrameAtMs < 0) return true;
  return input.nowMs - input.lastFrameAtMs >= CORE_FRAME_INTERVAL_MS;
};

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

const positive = (value: number): number =>
  Math.max(1, Number.isFinite(value) ? value : 1);

const coreStateColor = (state: CoreNodeState): string => {
  switch (state) {
    case "startup":
      return "#38BDF8";
    case "unpaired":
      return "#FBBF24";
    case "online":
      return "#2DD4BF";
    case "degraded":
      return "#FB923C";
    case "fault":
      return "#F87171";
  }
};
