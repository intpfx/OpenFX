import { assert, assertEquals, assertGreater } from "@std/assert";

import {
  CORE_FRAME_INTERVAL_MS,
  CORE_STATE_COLORS,
  createCoreFrame,
  shouldRenderCoreFrame,
} from "../src/ui/core-frame.ts";
import {
  type CoreCanvasTarget,
  createCoreCanvasRenderer,
  paintCoreFrame,
} from "../src/ui/core-canvas.ts";

Deno.test("core frame is deterministic for the same inputs", () => {
  const input = {
    width: 560,
    height: 576,
    timestampMs: 1_250,
    state: "online" as const,
    cpuUsagePercent: 42,
    memoryUsagePercent: 68,
    reduceMotion: false,
  };

  assertEquals(createCoreFrame(input), createCoreFrame(input));
});

Deno.test("core frame geometry remains inside the requested canvas", () => {
  const width = 560;
  const height = 576;
  const frame = createCoreFrame({
    width,
    height,
    timestampMs: 8_750,
    state: "degraded",
    cpuUsagePercent: 87,
    memoryUsagePercent: 91,
    reduceMotion: false,
  });

  for (const ring of frame.rings) {
    assert(ring.radius > 0);
    assert(ring.centerX - ring.radius >= 0);
    assert(ring.centerY - ring.radius >= 0);
    assert(ring.centerX + ring.radius <= width);
    assert(ring.centerY + ring.radius <= height);
  }
  for (const node of frame.orbitNodes) {
    assert(node.x - node.radius >= 0);
    assert(node.y - node.radius >= 0);
    assert(node.x + node.radius <= width);
    assert(node.y + node.radius <= height);
  }
  for (const line of frame.connections) {
    assert(line.fromX >= 0 && line.fromX <= width);
    assert(line.fromY >= 0 && line.fromY <= height);
    assert(line.toX >= 0 && line.toX <= width);
    assert(line.toY >= 0 && line.toY <= height);
  }
  assert(frame.pulse.radius > 0);
  assert(frame.pulse.centerX - frame.pulse.radius >= 0);
  assert(frame.pulse.centerY - frame.pulse.radius >= 0);
  assert(frame.pulse.centerX + frame.pulse.radius <= width);
  assert(frame.pulse.centerY + frame.pulse.radius <= height);
});

Deno.test("core frame exposes the locked color for every node state", () => {
  const expected = {
    startup: "#38BDF8",
    unpaired: "#FBBF24",
    online: "#2DD4BF",
    degraded: "#FB923C",
    fault: "#F87171",
  } as const;

  assertEquals(CORE_STATE_COLORS, expected);
  for (const state of Object.keys(expected) as Array<keyof typeof expected>) {
    const frame = createCoreFrame({
      width: 560,
      height: 576,
      timestampMs: 500,
      state,
      cpuUsagePercent: 50,
      memoryUsagePercent: 50,
      reduceMotion: true,
    });
    assertEquals(frame.accentColor, expected[state]);
  }
});

Deno.test("core state palette has one implementation source", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/ui/core-frame.ts", import.meta.url),
  );
  for (const color of Object.values(CORE_STATE_COLORS)) {
    assertEquals(
      source.split(color).length - 1,
      1,
      `${color} must be declared only once`,
    );
  }
});

Deno.test("CPU usage increases core pulse amplitude", () => {
  const common = {
    width: 560,
    height: 576,
    timestampMs: 375,
    state: "online" as const,
    memoryUsagePercent: 50,
    reduceMotion: false,
  };

  const idle = createCoreFrame({ ...common, cpuUsagePercent: 0 });
  const busy = createCoreFrame({ ...common, cpuUsagePercent: 100 });

  assertGreater(busy.pulse.amplitude, idle.pulse.amplitude);
  assertGreater(busy.pulse.radius, idle.pulse.radius);
});

Deno.test("memory usage increases orbit node density", () => {
  const common = {
    width: 560,
    height: 576,
    timestampMs: 600,
    state: "online" as const,
    cpuUsagePercent: 50,
    reduceMotion: false,
  };

  const sparse = createCoreFrame({ ...common, memoryUsagePercent: 0 });
  const dense = createCoreFrame({ ...common, memoryUsagePercent: 100 });

  assertGreater(dense.orbitNodes.length, sparse.orbitNodes.length);
  assertEquals(sparse.orbitNodes.length, 4);
  assertEquals(dense.orbitNodes.length, 16);
});

Deno.test("render decision caps animation at 24 FPS and static mode at one frame", () => {
  assertEquals(CORE_FRAME_INTERVAL_MS, 1_000 / 24);
  assertEquals(
    shouldRenderCoreFrame({
      nowMs: CORE_FRAME_INTERVAL_MS - 0.01,
      lastFrameAtMs: 0,
      reduceMotion: false,
      staticFrameDrawn: false,
      windowVisible: true,
    }),
    false,
  );
  assertEquals(
    shouldRenderCoreFrame({
      nowMs: CORE_FRAME_INTERVAL_MS,
      lastFrameAtMs: 0,
      reduceMotion: false,
      staticFrameDrawn: false,
      windowVisible: true,
    }),
    true,
  );
  assertEquals(
    shouldRenderCoreFrame({
      nowMs: 10_000,
      lastFrameAtMs: 0,
      reduceMotion: true,
      staticFrameDrawn: false,
      windowVisible: true,
    }),
    true,
  );
  assertEquals(
    shouldRenderCoreFrame({
      nowMs: 20_000,
      lastFrameAtMs: 0,
      reduceMotion: true,
      staticFrameDrawn: true,
      windowVisible: true,
    }),
    false,
  );
  assertEquals(
    shouldRenderCoreFrame({
      nowMs: 20_000,
      lastFrameAtMs: 0,
      reduceMotion: false,
      staticFrameDrawn: false,
      windowVisible: false,
    }),
    false,
  );
});

Deno.test("core painter clears and renders the pure frame without native arc", () => {
  const calls: string[] = [];
  const canvas: CoreCanvasTarget = {
    setFillColor: () => calls.push("fill-color"),
    setStrokeColor: () => calls.push("stroke-color"),
    setLineWidth: () => calls.push("line-width"),
    fillRect: () => calls.push("fill-rect"),
    clearRect: () => calls.push("clear"),
    beginPath: () => calls.push("begin"),
    moveTo: () => calls.push("move"),
    lineTo: () => calls.push("line"),
    closePath: () => calls.push("close"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
  };
  const frame = createCoreFrame({
    width: 560,
    height: 576,
    timestampMs: 1_000,
    state: "online",
    cpuUsagePercent: 50,
    memoryUsagePercent: 50,
    reduceMotion: false,
  });

  paintCoreFrame(canvas as unknown as import("perry/ui").Canvas, frame);

  assertEquals(calls[0], "clear");
  assertEquals(calls.includes("fill-rect"), true);
  assertEquals(
    calls.filter((call) => call === "stroke").length,
    frame.rings.length + frame.connections.length,
  );
  assertEquals(
    calls.filter((call) => call === "fill").length,
    frame.orbitNodes.length + 1,
  );
  assertGreater(calls.filter((call) => call === "line").length, 48);
});

Deno.test("core painter applies each connection alpha", () => {
  const strokeAlphas: number[] = [];
  const canvas = {
    ...createRecordingCanvas(),
    setStrokeColor(_r: number, _g: number, _b: number, alpha: number) {
      strokeAlphas.push(alpha);
    },
  };
  const frame = createCoreFrame({
    width: 560,
    height: 576,
    timestampMs: 500,
    state: "online",
    cpuUsagePercent: 50,
    memoryUsagePercent: 50,
    reduceMotion: false,
  });

  paintCoreFrame(canvas as unknown as import("perry/ui").Canvas, frame);

  for (const connection of frame.connections) {
    assert(
      strokeAlphas.includes(connection.alpha),
      `missing connection alpha ${connection.alpha}`,
    );
  }
});

Deno.test("renderer keeps exactly one pending Perry frame across repeated updates", () => {
  let paintCount = 0;
  const canvas = {
    ...createRecordingCanvas(),
    clearRect() {
      paintCount += 1;
    },
  };
  const callbacks: Array<(timestampMs: number, deltaMs: number) => void> = [];
  let requestCount = 0;
  const renderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialMetrics: {
      state: "startup",
      cpuUsagePercent: 0,
      memoryUsagePercent: 0,
      reduceMotion: false,
    },
    now: () => 1_000_000,
    canvas: canvas as unknown as import("perry/ui").Canvas,
    frameDriver: {
      request(callback) {
        requestCount += 1;
        callbacks.push(callback);
        return requestCount;
      },
      cancel() {
        callbacks.pop();
      },
    },
  });

  renderer.start();
  renderer.update({
    state: "unpaired",
    cpuUsagePercent: 20,
    memoryUsagePercent: 30,
    reduceMotion: false,
  });
  renderer.setWindowVisible(true);
  assertEquals(requestCount, 1);
  assertEquals(paintCount, 1);

  callbacks[0]!(0, 0);
  assertEquals(requestCount, 2);
  assertEquals(paintCount, 1);
});

Deno.test("renderer stays idle while hidden and resumes exactly one render path", () => {
  let staticPaintCount = 0;
  const staticRenderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialMetrics: {
      state: "online",
      cpuUsagePercent: 25,
      memoryUsagePercent: 35,
      reduceMotion: true,
    },
    now: () => 1_000,
    canvas: {
      ...createRecordingCanvas(),
      clearRect() {
        staticPaintCount += 1;
      },
    } as unknown as import("perry/ui").Canvas,
  });

  staticRenderer.start();
  assertEquals(staticPaintCount, 1);
  staticRenderer.setWindowVisible(false);
  staticRenderer.update({
    state: "degraded",
    cpuUsagePercent: 70,
    memoryUsagePercent: 80,
    reduceMotion: true,
  });
  assertEquals(staticPaintCount, 1, "hidden metrics must not paint synchronously");
  staticRenderer.setWindowVisible(false);
  staticRenderer.setWindowVisible(true);
  staticRenderer.setWindowVisible(true);
  assertEquals(staticPaintCount, 2, "reopen must paint one static frame");

  let animatedPaintCount = 0;
  let nextFrameId = 0;
  const pendingFrames = new Set<number>();
  const animatedRenderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialMetrics: {
      state: "online",
      cpuUsagePercent: 25,
      memoryUsagePercent: 35,
      reduceMotion: false,
    },
    canvas: {
      ...createRecordingCanvas(),
      clearRect() {
        animatedPaintCount += 1;
      },
    } as unknown as import("perry/ui").Canvas,
    frameDriver: {
      request() {
        nextFrameId += 1;
        pendingFrames.add(nextFrameId);
        return nextFrameId;
      },
      cancel(id) {
        pendingFrames.delete(id);
      },
    },
  });

  animatedRenderer.start();
  assertEquals(animatedPaintCount, 1);
  assertEquals(pendingFrames.size, 1);
  animatedRenderer.setWindowVisible(false);
  assertEquals(pendingFrames.size, 0);
  animatedRenderer.update({
    state: "degraded",
    cpuUsagePercent: 70,
    memoryUsagePercent: 80,
    reduceMotion: false,
  });
  assertEquals(animatedPaintCount, 1);
  assertEquals(pendingFrames.size, 0);
  animatedRenderer.setWindowVisible(true);
  animatedRenderer.setWindowVisible(true);
  assertEquals(animatedPaintCount, 1);
  assertEquals(pendingFrames.size, 1, "reopen must schedule one animation loop");
});

Deno.test("static renderer repaints only for node-state changes and reopening", () => {
  let paintCount = 0;
  let frameRequests = 0;
  const renderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialMetrics: {
      state: "online",
      cpuUsagePercent: 25,
      memoryUsagePercent: 35,
      reduceMotion: true,
    },
    now: () => 1_000,
    canvas: {
      ...createRecordingCanvas(),
      clearRect() {
        paintCount += 1;
      },
    } as unknown as import("perry/ui").Canvas,
    frameDriver: {
      request() {
        frameRequests += 1;
        return frameRequests;
      },
      cancel() {},
    },
  });

  renderer.start();
  for (let index = 0; index < 1_000; index += 1) {
    renderer.update({
      state: "online",
      cpuUsagePercent: index % 100,
      memoryUsagePercent: (index * 3) % 100,
      reduceMotion: true,
    });
  }
  assertEquals(paintCount, 1, "telemetry-only updates must not repaint static core");
  assertEquals(frameRequests, 0, "static core must never request an onFrame callback");

  renderer.update({
    state: "degraded",
    cpuUsagePercent: 80,
    memoryUsagePercent: 90,
    reduceMotion: true,
  });
  assertEquals(paintCount, 2, "a node-state change must repaint static core once");

  renderer.setWindowVisible(false);
  renderer.update({
    state: "fault",
    cpuUsagePercent: 90,
    memoryUsagePercent: 95,
    reduceMotion: true,
  });
  assertEquals(paintCount, 2, "hidden static core must not paint");
  renderer.setWindowVisible(true);
  assertEquals(paintCount, 3, "reopening must repaint static core once");
  assertEquals(frameRequests, 0);
});

Deno.test("menu-bar-only renderer paints zero frames until native visibility", () => {
  let paintCount = 0;
  let requestCount = 0;
  const renderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialWindowVisible: false,
    initialMetrics: {
      state: "online",
      cpuUsagePercent: 25,
      memoryUsagePercent: 35,
      reduceMotion: false,
    },
    canvas: {
      ...createRecordingCanvas(),
      clearRect() {
        paintCount += 1;
      },
    } as unknown as import("perry/ui").Canvas,
    frameDriver: {
      request() {
        requestCount += 1;
        return requestCount;
      },
      cancel() {},
    },
  });

  renderer.start();
  assertEquals(paintCount, 0);
  assertEquals(requestCount, 0);
  renderer.update({
    state: "unpaired",
    cpuUsagePercent: 40,
    memoryUsagePercent: 50,
    reduceMotion: false,
  });
  assertEquals(paintCount, 0);
  assertEquals(requestCount, 0);

  renderer.setWindowVisible(true);
  assertEquals(paintCount, 0);
  assertEquals(requestCount, 1);
});

Deno.test("renderer carries frame remainder to average 24 FPS on a 60 Hz clock", () => {
  let paintCount = 0;
  const queue: Array<(timestampMs: number, deltaMs: number) => void> = [];
  let nextId = 0;
  const renderer = createCoreCanvasRenderer({
    width: 560,
    height: 576,
    initialMetrics: {
      state: "online",
      cpuUsagePercent: 50,
      memoryUsagePercent: 50,
      reduceMotion: false,
    },
    canvas: {
      ...createRecordingCanvas(),
      clearRect() {
        paintCount += 1;
      },
    } as unknown as import("perry/ui").Canvas,
    frameDriver: {
      request(callback) {
        queue.push(callback);
        nextId += 1;
        return nextId;
      },
      cancel() {
        queue.shift();
      },
    },
  });

  renderer.start();
  for (let index = 0; index < 120; index += 1) {
    assertEquals(queue.length, 1, "renderer must retain one pending callback");
    queue.shift()!(index * (1_000 / 60), 1_000 / 60);
  }

  assertEquals(paintCount, 48);
  assertEquals(queue.length, 1);
});

const createRecordingCanvas = (): CoreCanvasTarget => ({
  setFillColor() {},
  setStrokeColor() {},
  setLineWidth() {},
  fillRect() {},
  clearRect() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {},
  stroke() {},
});
