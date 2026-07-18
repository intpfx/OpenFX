import { assertEquals } from "@std/assert";

import { createDesktopLifecycleController } from "../src/core/lifecycle-controller.ts";

Deno.test("closing and showing the single main window never stops background services", async () => {
  const transitions: string[] = [];
  const lifecycle = createDesktopLifecycleController({
    startServices() {
      transitions.push("services:start");
      return Promise.resolve();
    },
    stopServices() {
      transitions.push("services:stop");
      return Promise.resolve();
    },
  });

  await lifecycle.start();
  lifecycle.mainWindowClosed();
  assertEquals(lifecycle.snapshot(), {
    services: "running",
    mainWindow: "hidden",
  });

  lifecycle.mainWindowShown();
  assertEquals(lifecycle.snapshot(), {
    services: "running",
    mainWindow: "visible",
  });
  assertEquals(transitions, ["services:start"]);

  await lifecycle.terminate();
  assertEquals(lifecycle.snapshot().services, "stopped");
  assertEquals(transitions, ["services:start", "services:stop"]);
});

Deno.test("lifecycle starts services once even when the main window is reopened repeatedly", async () => {
  let starts = 0;
  const lifecycle = createDesktopLifecycleController({
    startServices() {
      starts += 1;
      return Promise.resolve();
    },
    stopServices: () => Promise.resolve(),
  });

  await lifecycle.start();
  lifecycle.mainWindowClosed();
  lifecycle.mainWindowShown();
  lifecycle.mainWindowClosed();
  lifecycle.mainWindowShown();
  await lifecycle.start();

  assertEquals(starts, 1);
  assertEquals(lifecycle.snapshot(), {
    services: "running",
    mainWindow: "visible",
  });
});
