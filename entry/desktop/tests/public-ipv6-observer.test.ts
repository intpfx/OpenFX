import { assertEquals } from "@std/assert";

import {
  createObservedSystemCollector,
  createPublicIpv6Observer,
  PUBLIC_IPV6_OBSERVATION_ENDPOINTS,
} from "../src/native/public-ipv6-observer.ts";

Deno.test("public IPv6 observer chooses the externally reachable local address", async () => {
  const requests: unknown[] = [];
  const observer = createPublicIpv6Observer((request) => {
    requests.push(request);
    return Promise.resolve({
      status: 200,
      body: { ip: request.hostname === "api6.ipify.org" ? "240e::2" : "240e::2" },
    });
  });

  assertEquals(
    await observer.observe(["240e::1", "240e::2", "fe80::1"]),
    {
      publicIpv6: "240e::2",
      observedIpv6: ["240e::2"],
      mismatch: false,
      observationErrors: [],
    },
  );
  assertEquals(requests, [...PUBLIC_IPV6_OBSERVATION_ENDPOINTS]);
});

Deno.test("public IPv6 observer reports mismatch and never selects an unobserved address", async () => {
  const observer = createPublicIpv6Observer((request) =>
    request.hostname === "api6.ipify.org"
      ? Promise.resolve({ status: 200, body: { ip: "240e::99" } })
      : Promise.reject(new Error("observation unavailable"))
  );

  assertEquals(await observer.observe(["240e::1", "240e::2"]), {
    publicIpv6: null,
    observedIpv6: ["240e::99"],
    mismatch: true,
    observationErrors: ["api64.ipify.org: observation unavailable"],
  });
});

Deno.test("public IPv6 observer reuses one external observation during the minute window", async () => {
  let now = 10_000;
  let requests = 0;
  const observer = createPublicIpv6Observer(
    () => {
      requests += 1;
      return Promise.resolve({ status: 200, body: { ip: "240e::2" } });
    },
    { now: () => now, refreshIntervalMs: 60_000 },
  );

  assertEquals((await observer.observe(["240e::2"])).publicIpv6, "240e::2");
  assertEquals(requests, 2);

  now += 5_000;
  assertEquals((await observer.observe(["240e::1"])).publicIpv6, null);
  assertEquals(requests, 2);

  now += 55_000;
  assertEquals((await observer.observe(["240e::2"])).publicIpv6, "240e::2");
  assertEquals(requests, 4);
});

Deno.test("concurrent public IPv6 observations share one in-flight refresh", async () => {
  let requests = 0;
  const pending = Promise.withResolvers<{
    status: number;
    body: { ip: string };
  }>();
  const observer = createPublicIpv6Observer(
    () => {
      requests += 1;
      return pending.promise;
    },
    { now: () => 10_000, refreshIntervalMs: 60_000 },
  );

  const matching = observer.observe(["240e::2"]);
  const mismatching = observer.observe(["240e::1"]);
  await Promise.resolve();
  assertEquals(requests, 2);

  pending.resolve({ status: 200, body: { ip: "240e::2" } });
  assertEquals((await matching).publicIpv6, "240e::2");
  assertEquals((await mismatching).publicIpv6, null);
  assertEquals(requests, 2);
});

Deno.test("observed collector merges reachability into the real system state", async () => {
  const collector = createObservedSystemCollector({
    collect: () =>
      Promise.resolve({
        overview: {
          collectedAt: 1,
          cpuUsagePercent: 1,
          memoryUsedBytes: 1,
          memoryTotalBytes: 2,
          diskUsedBytes: 1,
          diskTotalBytes: 2,
          networkRxBytes: 1,
          networkTxBytes: 2,
          batteryPercent: null,
          processCount: 0,
          topProcesses: [],
        },
        processes: [],
        network: {
          publicIpv6: "240e::1",
          ipv6Addresses: ["240e::1", "240e::2"],
          collectedAt: 1,
        },
      }),
  }, {
    observe: () =>
      Promise.resolve({
        publicIpv6: "240e::2",
        observedIpv6: ["240e::2"],
        mismatch: false,
        observationErrors: [],
      }),
  });

  assertEquals((await collector.collect()).network, {
    publicIpv6: "240e::2",
    ipv6Addresses: ["240e::1", "240e::2"],
    collectedAt: 1,
    observedIpv6: ["240e::2"],
    mismatch: false,
    observationErrors: [],
  });
});
