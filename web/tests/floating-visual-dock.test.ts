import { expect } from "@std/expect";

import {
  constrainFloatingDockPosition,
  moveFloatingDockFromPointer,
  resolveTimedVisualState,
} from "../src/floating-visuals/floating-visual-dock.ts";
import {
  BLOUB_VISUAL_STATES,
  NEBULA_ORB_VISUAL_STATES,
} from "../src/floating-visuals/visual-plugin-catalog.ts";
import { BotEngine } from "../src/floating-visuals/bloub/vendor/engine.ts";
import { renderOrb } from "../src/floating-visuals/nebula-orb/vendor/orb-engine.ts";

Deno.test("floating visual dock drag stays inside the viewport", () => {
  const bounds = { width: 560, height: 264 };
  const viewport = { width: 1280, height: 720 };

  expect(
    moveFloatingDockFromPointer(
      { x: 700, y: 420 },
      { x: 720, y: 440 },
      { x: 1_420, y: 900 },
      bounds,
      viewport,
    ),
  ).toEqual({ x: 708, y: 444 });

  expect(
    constrainFloatingDockPosition(
      { x: -500, y: -200 },
      bounds,
      viewport,
    ),
  ).toEqual({ x: 12, y: 12 });
});

Deno.test("floating visual dock follows an offset visual viewport", () => {
  const bounds = { width: 200, height: 100 };
  const viewport = {
    width: 390,
    height: 500,
    offsetLeft: 120,
    offsetTop: 70,
  };

  expect(
    constrainFloatingDockPosition({ x: 0, y: 0 }, bounds, viewport),
  ).toEqual({ x: 132, y: 82 });
  expect(
    constrainFloatingDockPosition({ x: 900, y: 900 }, bounds, viewport),
  ).toEqual({ x: 298, y: 458 });
});

Deno.test("timed visual states visit every entry and wrap", () => {
  const states = [
    { id: "one", durationMs: 1_000 },
    { id: "two", durationMs: 2_000 },
    { id: "three", durationMs: 500 },
  ] as const;

  expect(resolveTimedVisualState(states, 0)).toMatchObject({
    id: "one",
    index: 0,
    elapsedMs: 0,
  });
  expect(resolveTimedVisualState(states, 1_250)).toMatchObject({
    id: "two",
    index: 1,
    elapsedMs: 250,
  });
  expect(resolveTimedVisualState(states, 3_100)).toMatchObject({
    id: "three",
    index: 2,
    elapsedMs: 100,
  });
  expect(resolveTimedVisualState(states, 3_500)).toMatchObject({
    id: "one",
    index: 0,
    elapsedMs: 0,
  });
});

Deno.test("floating visual plugins preserve every upstream state in source order", () => {
  expect(BLOUB_VISUAL_STATES.map((state) => state.id)).toEqual([
    "idle",
    "thinking",
    "wink",
    "wide",
    "alert",
    "notify",
    "exclaim",
    "sleep",
    "egg",
    "hexagon",
    "play",
    "orbit",
    "swirl",
    "burst",
    "comet",
  ]);
  expect(NEBULA_ORB_VISUAL_STATES.map((state) => state.id)).toEqual([
    "working",
    "sweep",
    "shake",
    "listening",
    "network",
    "spin",
    "breathing",
    "twinkle",
    "pulse",
    "tide",
    "aurora",
    "spiral",
  ]);

  expect(
    BLOUB_VISUAL_STATES.reduce((total, state) => total + state.durationMs, 0),
  ).toBe(32_500);
  expect(
    NEBULA_ORB_VISUAL_STATES.reduce(
      (total, state) => total + state.durationMs,
      0,
    ),
  ).toBe(48_000);
});

Deno.test("the Bloub engine samples every catalog and transition state", () => {
  const engine = new BotEngine(100, "idle");
  let clock = 0;

  BLOUB_VISUAL_STATES.forEach((state, index) => {
    if (index > 0) engine.setState(state.id, clock);
    const frame = engine.sample(clock + Math.min(0.8, state.durationMs / 2_000));

    expect(frame.bodyPath.startsWith("M")).toBe(true);
    expect(Number.isFinite(frame.bodyAlpha)).toBe(true);
    expect(frame.eyes.every((eye) => eye.d.length > 0)).toBe(true);
    clock += state.durationMs / 1_000;
  });
});

Deno.test("the Nebula-Orb renderer draws every catalog state", () => {
  let clearCount = 0;
  let arcCount = 0;
  const drawStyles = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
  };
  const context = {
    clearRect() {
      clearCount += 1;
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {
      arcCount += 1;
    },
    fill() {},
    set fillStyle(value: string) {
      drawStyles.fillStyle = value;
    },
    set strokeStyle(value: string) {
      drawStyles.strokeStyle = value;
    },
    set lineWidth(value: number) {
      drawStyles.lineWidth = value;
    },
  } as unknown as CanvasRenderingContext2D;

  NEBULA_ORB_VISUAL_STATES.forEach((state, index) => {
    renderOrb(
      context,
      128,
      index * 0.5,
      state.id,
      3,
      "245,245,247",
      0.6,
      "sphere",
      "AI",
      1,
      5,
      1,
      -0.45,
      0,
      0.34,
    );
  });

  expect(clearCount).toBe(NEBULA_ORB_VISUAL_STATES.length);
  expect(arcCount).toBeGreaterThan(0);
  expect(drawStyles.fillStyle).toContain("rgba(245,245,247");
});
