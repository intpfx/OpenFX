import { cancelFrame, Canvas, type Canvas as PerryCanvas, onFrame } from "perry/ui";

import {
  CORE_FRAME_INTERVAL_MS,
  type CoreFrame,
  type CoreNodeState,
  createCoreFrame,
  shouldRenderCoreFrame,
} from "./core-frame.ts";

export interface CoreCanvasTarget {
  setFillColor(r: number, g: number, b: number, a: number): void;
  setStrokeColor(r: number, g: number, b: number, a: number): void;
  setLineWidth(width: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

export interface CoreCanvasMetrics {
  state: CoreNodeState;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  reduceMotion: boolean;
}

export interface CoreCanvasRenderer {
  canvas: PerryCanvas;
  start(): void;
  update(metrics: CoreCanvasMetrics): void;
  setReduceMotion(reduceMotion: boolean): void;
  setWindowVisible(visible: boolean): void;
  stop(): void;
}

export interface CoreCanvasRendererOptions {
  width: number;
  height: number;
  initialMetrics: CoreCanvasMetrics;
  initialWindowVisible?: boolean;
  now?: () => number;
  canvas?: PerryCanvas;
  frameDriver?: CoreFrameDriver;
}

export interface CoreFrameDriver {
  request(callback: (timestampMs: number, deltaMs: number) => void): number;
  cancel(id: number): void;
}

export const createCoreCanvasRenderer = (
  options: CoreCanvasRendererOptions,
): CoreCanvasRenderer => {
  const canvas = options.canvas ?? Canvas(options.width, options.height);
  const now = options.now ?? Date.now;
  let metrics = { ...options.initialMetrics };
  let pendingFrame: number | null = null;
  let nextFrameAtMs = CORE_FRAME_INTERVAL_MS;
  let staticFrameDrawn = false;
  let windowVisible = options.initialWindowVisible ?? true;
  let stopped = false;

  const draw = (timestampMs: number): void => {
    const frameModel = createCoreFrame({
      width: options.width,
      height: options.height,
      timestampMs,
      state: metrics.state,
      cpuUsagePercent: metrics.cpuUsagePercent,
      memoryUsagePercent: metrics.memoryUsagePercent,
      reduceMotion: metrics.reduceMotion,
    });
    paintCoreFrame(canvas, frameModel);
    staticFrameDrawn = metrics.reduceMotion;
  };

  const schedule = (): void => {
    if (
      stopped || !windowVisible || pendingFrame !== null ||
      (metrics.reduceMotion && staticFrameDrawn)
    ) return;
    pendingFrame = options.frameDriver
      ? options.frameDriver.request(frame)
      : onFrame(frame);
  };

  const frame = (timestampMs: number, _deltaMs: number): void => {
    pendingFrame = null;
    if (
      shouldRenderCoreFrame({
        nowMs: timestampMs,
        lastFrameAtMs: nextFrameAtMs - CORE_FRAME_INTERVAL_MS,
        reduceMotion: metrics.reduceMotion,
        staticFrameDrawn,
        windowVisible,
      })
    ) {
      draw(timestampMs);
      const elapsedIntervals = Math.floor(
        Math.max(0, timestampMs - nextFrameAtMs) / CORE_FRAME_INTERVAL_MS,
      ) + 1;
      nextFrameAtMs += elapsedIntervals * CORE_FRAME_INTERVAL_MS;
    }
    schedule();
  };

  const cancelPending = (): void => {
    if (pendingFrame === null) return;
    if (options.frameDriver) options.frameDriver.cancel(pendingFrame);
    else cancelFrame(pendingFrame);
    pendingFrame = null;
  };

  return {
    canvas,
    start() {
      stopped = false;
      if (!windowVisible) return;
      if (metrics.reduceMotion) draw(now());
      else {
        draw(0);
        nextFrameAtMs = CORE_FRAME_INTERVAL_MS;
        schedule();
      }
    },
    update(nextMetrics) {
      metrics = {
        state: nextMetrics.state,
        cpuUsagePercent: nextMetrics.cpuUsagePercent,
        memoryUsagePercent: nextMetrics.memoryUsagePercent,
        reduceMotion: nextMetrics.reduceMotion,
      };
      if (metrics.reduceMotion) {
        cancelPending();
        if (windowVisible && !staticFrameDrawn) draw(now());
      } else schedule();
    },
    setReduceMotion(reduceMotion) {
      if (metrics.reduceMotion === reduceMotion) return;
      metrics = {
        state: metrics.state,
        cpuUsagePercent: metrics.cpuUsagePercent,
        memoryUsagePercent: metrics.memoryUsagePercent,
        reduceMotion,
      };
      staticFrameDrawn = false;
      cancelPending();
      if (reduceMotion && windowVisible) draw(now());
      else schedule();
    },
    setWindowVisible(visible) {
      if (windowVisible === visible) return;
      windowVisible = visible;
      if (!visible) {
        cancelPending();
        return;
      }
      if (metrics.reduceMotion && !staticFrameDrawn) draw(now());
      else schedule();
    },
    stop() {
      stopped = true;
      cancelPending();
    },
  };
};

export const paintCoreFrame = (
  canvas: PerryCanvas,
  frame: CoreFrame,
): void => {
  const accent = colorChannels(frame.accentColor);
  canvas.clearRect(0, 0, frame.width, frame.height);
  canvas.setFillColor(0.015, 0.035, 0.065, 0.92);
  canvas.fillRect(0, 0, frame.width, frame.height);

  canvas.setLineWidth(1);
  for (const connection of frame.connections) {
    canvas.setStrokeColor(
      accent.r,
      accent.g,
      accent.b,
      connection.alpha,
    );
    canvas.beginPath();
    canvas.moveTo(connection.fromX, connection.fromY);
    canvas.lineTo(connection.toX, connection.toY);
    canvas.stroke();
  }

  for (const ring of frame.rings) {
    canvas.setStrokeColor(accent.r, accent.g, accent.b, ring.alpha);
    canvas.setLineWidth(ring.lineWidth);
    circlePath(canvas, ring.centerX, ring.centerY, ring.radius);
    canvas.stroke();
  }

  canvas.setFillColor(accent.r, accent.g, accent.b, frame.pulse.alpha);
  circlePath(
    canvas,
    frame.pulse.centerX,
    frame.pulse.centerY,
    frame.pulse.radius,
  );
  canvas.fill();

  for (const node of frame.orbitNodes) {
    canvas.setFillColor(accent.r, accent.g, accent.b, node.alpha);
    circlePath(canvas, node.x, node.y, node.radius);
    canvas.fill();
  }
};

const circlePath = (
  canvas: PerryCanvas,
  centerX: number,
  centerY: number,
  radius: number,
): void => {
  const segments = 48;
  canvas.beginPath();
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (index === 0) canvas.moveTo(x, y);
    else canvas.lineTo(x, y);
  }
  canvas.closePath();
};

const colorChannels = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16) / 255,
  g: Number.parseInt(hex.slice(3, 5), 16) / 255,
  b: Number.parseInt(hex.slice(5, 7), 16) / 255,
});
