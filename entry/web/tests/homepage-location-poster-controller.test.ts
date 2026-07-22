import { expect } from "@std/expect";

import {
  createHomepageLocationPosterController,
} from "../src/homepage/location-poster-controller.ts";
import type {
  HomepageLocationFailure,
  HomepageLocationPosterState,
} from "../src/homepage/location-poster.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function position(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: { latitude, longitude, accuracy: 12 },
  } as GeolocationPosition;
}

function response(svg: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({ ok: true, svg, place: { city: "Shanghai", country: "China" } }),
  };
}

function createHarness(overrides: Partial<
  Parameters<
    typeof createHomepageLocationPosterController
  >[0]
> = {}) {
  const states: HomepageLocationPosterState[] = [];
  const failures: (HomepageLocationFailure | null)[] = [];
  const posterUrls: (string | null)[] = [];
  const places: unknown[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const controller = createHomepageLocationPosterController({
    isSecureContext: () => true,
    hasGeolocation: () => true,
    readPermission: () => Promise.resolve("granted"),
    requestPosition: () => Promise.resolve(position(31.2304, 121.4737)),
    fetchPoster: () => Promise.resolve(response("<svg/>")),
    createObjectUrl: (svg) => {
      const url = `blob:${svg}`;
      created.push(url);
      return url;
    },
    revokeObjectUrl: (url) => revoked.push(url),
    onState: (state) => states.push(state),
    onFailure: (failure) => failures.push(failure),
    onPosterUrl: (url) => posterUrls.push(url),
    onPlace: (place) => places.push(place),
    ...overrides,
  });
  return { controller, states, failures, posterUrls, places, created, revoked };
}

Deno.test("dismissed delayed geolocation never sends coordinates to the poster endpoint", async () => {
  const delayedPosition = deferred<GeolocationPosition>();
  const requests: unknown[] = [];
  const harness = createHarness({
    requestPosition: () => delayedPosition.promise,
    fetchPoster: (request) => {
      requests.push(request);
      return Promise.resolve(response("<svg/>"));
    },
  });

  const start = harness.controller.start();
  await Promise.resolve();
  harness.controller.dismiss();
  delayedPosition.resolve(position(31.2304, 121.4737));
  await start;

  expect(requests).toEqual([]);
  expect(harness.states.at(-1)).toBe("dismissed");
});

Deno.test("initial permission prompt stops at the consent gate without requesting device location", async () => {
  let positionCalls = 0;
  const harness = createHarness({
    readPermission: () => Promise.resolve("prompt"),
    requestPosition: () => {
      positionCalls += 1;
      return Promise.resolve(position(31.2304, 121.4737));
    },
  });

  await harness.controller.initialize();

  expect(positionCalls).toBe(0);
  expect(harness.states.at(-1)).toBe("needs-permission");
});

Deno.test("dispose aborts an active fetch and blocks object URL and state commits", async () => {
  const delayedFetch = deferred<ReturnType<typeof response>>();
  let signal: AbortSignal | undefined;
  const harness = createHarness({
    fetchPoster: (_request, requestSignal) => {
      signal = requestSignal;
      return delayedFetch.promise;
    },
  });

  const start = harness.controller.start();
  await Promise.resolve();
  await Promise.resolve();
  harness.controller.dispose();
  expect(signal?.aborted).toBe(true);
  delayedFetch.resolve(response("<svg/>"));
  await start;

  expect(harness.created).toEqual([]);
  expect(harness.posterUrls).toEqual([]);
  expect(harness.states).not.toContain("ready");
});

Deno.test("only the newest retry may commit after an older response body resolves", async () => {
  const firstJson = deferred<unknown>();
  const fetches: { request: { latitude: number }; signal: AbortSignal }[] = [];
  let positionCall = 0;
  const harness = createHarness({
    requestPosition: () =>
      Promise.resolve(position(
        positionCall++ === 0 ? 31.2304 : 39.9042,
        121.4737,
      )),
    fetchPoster: (request, signal) => {
      fetches.push({ request, signal });
      if (fetches.length === 1) {
        return Promise.resolve({ ok: true, json: () => firstJson.promise });
      }
      return Promise.resolve(response("<svg:new/>"));
    },
  });

  const first = harness.controller.start();
  await Promise.resolve();
  await Promise.resolve();
  const second = harness.controller.start();
  await second;
  firstJson.resolve({ ok: true, svg: "<svg:old/>" });
  await first;

  expect(fetches.map(({ request }) => request.latitude)).toEqual([31.2304, 39.9042]);
  expect(fetches[0].signal.aborted).toBe(true);
  expect(harness.created).toEqual(["blob:<svg:new/>"]);
  expect(harness.posterUrls).toEqual(["blob:<svg:new/>"]);
  expect(harness.states.filter((state) => state === "ready")).toHaveLength(1);
});

Deno.test("StrictMode cleanup then setup invalidates the first delayed permission generation", async () => {
  const firstPermission = deferred<PermissionState>();
  const secondPermission = deferred<PermissionState>();
  let permissionCall = 0;
  let positionCalls = 0;
  const harness = createHarness({
    readPermission: () =>
      permissionCall++ === 0 ? firstPermission.promise : secondPermission.promise,
    requestPosition: () => {
      positionCalls += 1;
      return Promise.resolve(position(31.2304, 121.4737));
    },
  });

  const first = harness.controller.initialize();
  harness.controller.dispose();
  const second = harness.controller.initialize();
  firstPermission.resolve("granted");
  await Promise.resolve();
  expect(positionCalls).toBe(0);
  secondPermission.resolve("granted");
  await Promise.all([first, second]);

  expect(positionCalls).toBe(1);
  expect(harness.states.filter((state) => state === "ready")).toHaveLength(1);
});
