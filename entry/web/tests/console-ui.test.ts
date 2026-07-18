import { expect } from "@std/expect";

import {
  CONSOLE_CLIENT_POLICY,
  CONSOLE_ENDPOINTS,
  CONSOLE_MODULES,
  corePresentation,
  relayUpdateMessage,
  selectCoreRenderer,
} from "../src/console/model.ts";

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
    canvasAvailable: true,
    rendererFailed: false,
  };

  expect(selectCoreRenderer(capable)).toBe("canvas");
  for (
    const override of [
      { reducedMotion: true },
      { lowPower: true },
      { narrowViewport: true },
      { canvasAvailable: false },
      { rendererFailed: true },
    ]
  ) {
    expect(selectCoreRenderer({ ...capable, ...override })).toBe("static");
  }
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
