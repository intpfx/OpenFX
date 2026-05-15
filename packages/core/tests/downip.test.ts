import { assertEquals } from "jsr:@std/assert";

import {
  buildIpv6ReportPayload,
  computeUpdateUrl,
  isGlobalUnicastIpv6,
  isProbablyIpv6,
  isValidEndpointKey,
  normalizeIpv6,
  parsePortOrNull,
  pickPreferredIpv6,
  validateDownipSyncConfig,
} from "../src/mod.ts";

Deno.test("normalizeIpv6 strips zone index and lowercases", () => {
  assertEquals(normalizeIpv6("FE80::1%Eth0"), "fe80::1");
});

Deno.test("isGlobalUnicastIpv6 detects public ipv6", () => {
  assertEquals(isGlobalUnicastIpv6("2408:8207:78c8:2110::10"), true);
  assertEquals(isGlobalUnicastIpv6("fd00::1"), false);
});

Deno.test("isProbablyIpv6 performs relaxed validation", () => {
  assertEquals(isProbablyIpv6("2408:8207:78c8:2110::10"), true);
  assertEquals(isProbablyIpv6("example.com"), false);
});

Deno.test("pickPreferredIpv6 prefers global over unique local", () => {
  assertEquals(
    pickPreferredIpv6(["fd00::1", "2408:8207:78c8:2110::10"]),
    "2408:8207:78c8:2110::10",
  );
});

Deno.test("isValidEndpointKey rejects reserved update key", () => {
  assertEquals(isValidEndpointKey("home"), true);
  assertEquals(isValidEndpointKey("update"), false);
});

Deno.test("parsePortOrNull validates ranges", () => {
  assertEquals(parsePortOrNull("3000"), 3000);
  assertEquals(parsePortOrNull("70000"), null);
});

Deno.test("computeUpdateUrl appends update endpoint", () => {
  assertEquals(
    computeUpdateUrl("https://example.com/downip"),
    "https://example.com/downip/update",
  );
});

Deno.test("buildIpv6ReportPayload shapes request body", () => {
  assertEquals(buildIpv6ReportPayload("home", "2408:8207:78c8:2110::10", 3000), {
    home: {
      ipv6: "2408:8207:78c8:2110::10",
      port: 3000,
    },
  });
});

Deno.test("validateDownipSyncConfig returns null for valid config", () => {
  assertEquals(
    validateDownipSyncConfig({
      serverBaseUrl: "https://example.com",
      endpointKey: "home",
      endpointPort: 3000,
      ipv6: "2408:8207:78c8:2110::10",
    }),
    null,
  );
});
