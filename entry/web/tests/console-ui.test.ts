import { expect } from "@std/expect";

import {
  type CoreRendererScheduler,
  type CoreRenderTarget,
  detectWebGLSupport,
  startCoreRenderer,
} from "../src/console/core-renderer.ts";
import {
  CONSOLE_CLIENT_POLICY,
  CONSOLE_ENDPOINTS,
  CONSOLE_MODULES,
  corePresentation,
  relayUpdateMessage,
  selectCoreRenderer,
} from "../src/console/model.ts";
import {
  copyPairingValue,
  derivePairingGuide,
  formatPairingCountdown,
  subscribePairingCountdown,
} from "../src/console/pairing-guide.ts";

type FakeCanvas = HTMLCanvasElement & {
  dispatchContextLost: () => void;
  listenerCount: () => number;
};

const createFakeCanvas = (): FakeCanvas => {
  const listeners = new Set<EventListener>();
  return {
    addEventListener: (_name: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === "function") listeners.add(listener);
    },
    dispatchContextLost: () => {
      const event = { preventDefault: () => {} } as Event;
      for (const listener of listeners) listener(event);
    },
    getBoundingClientRect: () => ({ width: 640, height: 360 } as DOMRect),
    listenerCount: () => listeners.size,
    removeEventListener: (
      _name: string,
      listener: EventListenerOrEventListenerObject,
    ) => {
      if (typeof listener === "function") listeners.delete(listener);
    },
  } as unknown as FakeCanvas;
};

Deno.test("console exposes the exact operator module order", () => {
  expect(CONSOLE_MODULES.map((item) => item.label)).toEqual([
    "核心总览",
    "Mac 主机",
    "远程接入",
    "Agent",
    "访问规则",
    "数据库",
    "审计",
    "设置",
  ]);
});

Deno.test("console chooses a static core for every required fallback", () => {
  const capable = {
    reducedMotion: false,
    lowPower: false,
    narrowViewport: false,
    webglAvailable: true,
    rendererFailed: false,
  };

  expect(selectCoreRenderer(capable)).toBe("webgl");
  for (
    const override of [
      { reducedMotion: true },
      { lowPower: true },
      { narrowViewport: true },
      { webglAvailable: false },
      { rendererFailed: true },
    ]
  ) {
    expect(selectCoreRenderer({ ...capable, ...override })).toBe("static");
  }
});

Deno.test("console detects WebGL support and releases its probe context", () => {
  let released = 0;
  expect(detectWebGLSupport(() => ({
    getContext: (name) =>
      name === "webgl"
        ? {
          getExtension: () => ({ loseContext: () => released += 1 }),
        }
        : null,
  }))).toBe(true);
  expect(released).toBe(1);
  expect(detectWebGLSupport(() => ({ getContext: () => null }))).toBe(false);
  expect(detectWebGLSupport(() => ({
    getContext: () => {
      throw new Error("blocked");
    },
  }))).toBe(false);
});

Deno.test("WebGL core reports renderer initialization failure", () => {
  const canvas = createFakeCanvas();
  let failures = 0;
  const cleanup = startCoreRenderer(canvas, {
    pulseSeconds: 4.8,
    onFailure: () => failures += 1,
    createRenderer: () => null,
  });

  expect(failures).toBe(1);
  expect(canvas.listenerCount()).toBe(0);
  cleanup();
});

Deno.test("WebGL core owns resize, frame, context loss, and cleanup lifecycle", () => {
  const canvas = createFakeCanvas();
  const callbacks = new Map<number, FrameRequestCallback>();
  const canceled: number[] = [];
  let nextFrame = 1;
  let stoppedObserving = 0;
  const scheduler: CoreRendererScheduler = {
    requestFrame: (callback) => {
      const handle = nextFrame++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle) => canceled.push(handle),
    observeResize: (_target, callback) => {
      callback();
      return () => stoppedObserving += 1;
    },
    pixelRatio: () => 1.5,
  };
  const resized: number[][] = [];
  const rendered: number[] = [];
  let disposed = 0;
  let failures = 0;
  const renderer: CoreRenderTarget = {
    resize: (...values) => resized.push(values),
    render: (timestamp) => rendered.push(timestamp),
    dispose: () => disposed += 1,
  };
  const cleanup = startCoreRenderer(canvas, {
    pulseSeconds: 4.8,
    onFailure: () => failures += 1,
    createRenderer: (_target, pulseSeconds) => {
      expect(pulseSeconds).toBe(4.8);
      return renderer;
    },
    scheduler,
  });

  expect(resized).toEqual([[640, 360, 1.5], [640, 360, 1.5]]);
  expect(canvas.listenerCount()).toBe(1);
  callbacks.get(1)?.(160);
  expect(rendered).toEqual([160]);
  expect(callbacks.has(2)).toBe(true);

  canvas.dispatchContextLost();
  expect(failures).toBe(1);
  expect(canceled).toEqual([2]);
  expect(stoppedObserving).toBe(1);
  expect(disposed).toBe(1);
  expect(canvas.listenerCount()).toBe(0);
  cleanup();
  expect(disposed).toBe(1);
});

Deno.test("WebGL core falls back when a render frame fails", () => {
  const canvas = createFakeCanvas();
  let callback: FrameRequestCallback | undefined;
  let disposed = 0;
  let failures = 0;
  const scheduler: CoreRendererScheduler = {
    requestFrame: (next) => {
      callback = next;
      return 11;
    },
    cancelFrame: () => {},
    observeResize: () => () => {},
    pixelRatio: () => 1,
  };
  startCoreRenderer(canvas, {
    pulseSeconds: 4.8,
    onFailure: () => failures += 1,
    createRenderer: () => ({
      resize: () => {},
      render: () => {
        throw new Error("context failed");
      },
      dispose: () => disposed += 1,
    }),
    scheduler,
  });

  callback?.(16);
  expect(failures).toBe(1);
  expect(disposed).toBe(1);
  expect(canvas.listenerCount()).toBe(0);
});

Deno.test("node state drives one restrained cyan core presentation", () => {
  expect(corePresentation("online")).toEqual({
    label: "在线",
    tone: "online",
    pulseSeconds: 4.8,
  });
  expect(corePresentation("degraded")).toMatchObject({
    label: "连接异常",
    tone: "degraded",
  });
  expect(corePresentation("offline")).toMatchObject({
    label: "离线",
    tone: "offline",
  });
});

Deno.test("console client uses cookie sessions and forbids secret persistence", () => {
  expect(CONSOLE_CLIENT_POLICY).toEqual({
    credentials: "same-origin",
    persistAdministratorCredential: false,
    persistNodeCredential: false,
  });
});

Deno.test("console exposes fixed pairing and revocation operations", () => {
  expect(CONSOLE_ENDPOINTS).toMatchObject({
    pairings: "/api/console/pairings",
    node: "/api/console/node",
  });
});

Deno.test("relay effect reports approval instead of claiming immediate change", () => {
  expect(relayUpdateMessage({ approvalRequired: true }, true)).toBe(
    "启用请求等待审批",
  );
  expect(relayUpdateMessage({ approvalRequired: false }, false)).toBe(
    "远程接入已停用",
  );
});

Deno.test("pairing guide exposes only the current HTTPS origin to Perry", () => {
  expect(derivePairingGuide({
    currentUrl: "https://console.openfx.example/?tab=mac",
    availability: "unknown",
    pairing: null,
    now: 1_000,
  })).toMatchObject({
    serverUrl: "https://console.openfx.example",
    canGenerate: true,
    generateDisabled: false,
    transportMessage: null,
    serverCopyLabel: "复制 OpenFX HTTPS 服务端地址",
    showInstructions: true,
    steps: [
      "检测公网 IPv6",
      "输入 HTTPS 地址与 8 位配对码",
      "写入 macOS Keychain",
    ],
  });

  for (
    const currentUrl of [
      "http://console.openfx.example/",
      "http://localhost:8000/",
      "http://127.0.0.1:8000/",
      null,
    ]
  ) {
    expect(derivePairingGuide({
      currentUrl,
      availability: "unknown",
      pairing: null,
      now: 1_000,
    })).toMatchObject({
      serverUrl: null,
      canGenerate: false,
      generateDisabled: true,
      transportMessage: "请通过 HTTPS 控制台打开",
    });
  }
});

Deno.test("pairing guide never labels an HTTP origin as an HTTPS server address", () => {
  expect(derivePairingGuide({
    currentUrl: "http://localhost:8000/",
    availability: "unknown",
    pairing: null,
    now: 1_000,
  })).toMatchObject({
    serverUrl: null,
    canGenerate: false,
    generateDisabled: true,
    transportMessage: "请通过 HTTPS 控制台打开",
  });
});

Deno.test("pairing countdown is deterministic and clamps every expired value to zero", () => {
  expect(formatPairingCountdown(121_000, 1_000)).toEqual({
    remainingSeconds: 120,
    label: "02:00",
    expired: false,
  });
  expect(formatPairingCountdown(61_001, 1_001)).toMatchObject({ label: "01:00" });
  expect(formatPairingCountdown(1_000, 1_000)).toEqual({
    remainingSeconds: 0,
    label: "00:00",
    expired: true,
  });
  expect(formatPairingCountdown(500, 1_000)).toMatchObject({
    remainingSeconds: 0,
    label: "00:00",
    expired: true,
  });
});

Deno.test("pairing countdown subscription clears its timer once and never leaks", () => {
  const ticks: Array<() => void> = [];
  const cleared: number[] = [];
  let now = 1_000;
  const snapshots: string[] = [];
  const unsubscribe = subscribePairingCountdown(
    2_500,
    (countdown) => snapshots.push(countdown.label),
    {
      now: () => now,
      setInterval: (callback) => {
        ticks.push(callback);
        return 17;
      },
      clearInterval: (handle) => cleared.push(handle),
    },
  );

  expect(snapshots).toEqual(["00:02"]);
  expect(ticks.length).toBe(1);
  now = 2_500;
  ticks[0]?.();
  expect(snapshots).toEqual(["00:02", "00:00"]);
  expect(cleared).toEqual([17]);
  unsubscribe();
  expect(cleared).toEqual([17]);
});

Deno.test("pairing guide rendering keeps online rotation code and instructions visible", () => {
  expect(derivePairingGuide({
    currentUrl: "https://console.openfx.example/",
    availability: "online",
    pairing: { code: "ABC2EFGH", expiresAt: 601_000 },
    now: 1_000,
  })).toMatchObject({
    connected: true,
    stateLabel: "节点已连接",
    code: "ABC2EFGH",
    countdown: { label: "10:00", expired: false },
    showInstructions: true,
  });
  expect(derivePairingGuide({
    currentUrl: "https://console.openfx.example/",
    availability: "offline",
    pairing: { code: "ABC2EFGH", expiresAt: 601_000 },
    now: 1_000,
  })).toMatchObject({
    connected: false,
    stateLabel: "等待 Mac 节点",
    code: "ABC2EFGH",
    showInstructions: true,
  });
  expect(derivePairingGuide({
    currentUrl: "https://console.openfx.example/",
    availability: "online",
    pairing: null,
    now: 1_000,
  })).toMatchObject({
    connected: true,
    code: null,
    showInstructions: false,
  });
});

Deno.test("pairing copy helper reports success and a Chinese recoverable failure", async () => {
  const copied: string[] = [];
  expect(
    await copyPairingValue("https://console.openfx.example", (value) => {
      copied.push(value);
      return Promise.resolve();
    }),
  ).toBe("已复制服务端地址");
  expect(copied).toEqual(["https://console.openfx.example"]);
  expect(
    await copyPairingValue(
      "ABC2EFGH",
      () => Promise.reject(new Error("clipboard denied")),
    ),
  ).toBe("复制失败，请手动选择文本");
});
