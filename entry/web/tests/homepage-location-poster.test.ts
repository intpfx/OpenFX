import { expect } from "@std/expect";

import {
  createHomepageLocationRequestGuard,
  createHomepagePosterRenderRequest,
  getGeolocationFailure,
  isCityLevelPosition,
  replaceHomepagePosterObjectUrl,
  resolveInitialLocationPosterState,
  shouldFocusLocationPoster,
} from "../src/homepage/location-poster.ts";

Deno.test("homepage location permission selects the correct initial state", () => {
  expect(resolveInitialLocationPosterState("prompt")).toBe("needs-permission");
  expect(resolveInitialLocationPosterState("unsupported")).toBe(
    "needs-permission",
  );
  expect(resolveInitialLocationPosterState("granted")).toBe("rendering");
  expect(resolveInitialLocationPosterState("denied")).toBe("denied");
});

Deno.test("only permission-gate states focus and blur the homepage", () => {
  expect(shouldFocusLocationPoster("needs-permission")).toBe(true);
  expect(shouldFocusLocationPoster("requesting")).toBe(true);
  expect(shouldFocusLocationPoster("rendering")).toBe(false);
  expect(shouldFocusLocationPoster("ready")).toBe(false);
  expect(shouldFocusLocationPoster("error")).toBe(false);
});

Deno.test("homepage location accepts city-level accuracy at the boundary", () => {
  expect(isCityLevelPosition({ accuracy: 0 })).toBe(true);
  expect(isCityLevelPosition({ accuracy: 25_000 })).toBe(true);
  expect(isCityLevelPosition({ accuracy: 25_000.1 })).toBe(false);
  expect(isCityLevelPosition({ accuracy: Number.NaN })).toBe(false);
  expect(isCityLevelPosition({ accuracy: -1 })).toBe(false);
});

Deno.test("geolocation error codes map to stable failure names", () => {
  expect(getGeolocationFailure(1)).toBe("denied");
  expect(getGeolocationFailure(2)).toBe("unavailable");
  expect(getGeolocationFailure(3)).toBe("timeout");
  expect(getGeolocationFailure(99)).toBe("unavailable");
});

Deno.test("homepage poster request contains only the approved render fields", () => {
  expect(createHomepagePosterRenderRequest({
    latitude: 31.2304,
    longitude: 121.4737,
  })).toEqual({
    latitude: 31.2304,
    longitude: 121.4737,
    theme: "japanese_ink",
    distanceMeters: 6_000,
    width: 1_600,
    height: 1_000,
  });
});

Deno.test("homepage poster request rejects invalid coordinates", () => {
  expect(() => createHomepagePosterRenderRequest({ latitude: 91, longitude: 0 }))
    .toThrow(RangeError);
  expect(() => createHomepagePosterRenderRequest({ latitude: 0, longitude: 181 }))
    .toThrow(RangeError);
});

Deno.test("homepage poster object URLs are revoked when replaced or cleared", () => {
  const revoked: string[] = [];
  const next = replaceHomepagePosterObjectUrl(
    "blob:old",
    "blob:new",
    (url) => revoked.push(url),
  );

  expect(next).toBe("blob:new");
  expect(replaceHomepagePosterObjectUrl(next, null, (url) => revoked.push(url)))
    .toBeNull();
  expect(revoked).toEqual(["blob:old", "blob:new"]);
});

Deno.test("homepage location requests invalidate stale permission, position, and render work", async () => {
  const guard = createHomepageLocationRequestGuard();
  const commits: string[] = [];
  let resolvePermission = () => {};
  const delayedPermission = new Promise<void>((resolve) => {
    resolvePermission = resolve;
  });
  let resolvePosition = () => {};
  const delayedPosition = new Promise<void>((resolve) => {
    resolvePosition = resolve;
  });

  const first = guard.begin();
  expect(guard.isCurrent(first)).toBe(true);
  const stalePermissionFlow = delayedPermission.then(() => {
    if (guard.isCurrent(first)) commits.push("stale permission");
  });

  const second = guard.begin();
  expect(first.signal.aborted).toBe(true);
  expect(guard.isCurrent(first)).toBe(false);
  expect(guard.isCurrent(second)).toBe(true);
  const stalePositionFlow = delayedPosition.then(() => {
    if (guard.isCurrent(first)) commits.push("stale position");
  });

  resolvePermission();
  resolvePosition();
  await Promise.all([stalePermissionFlow, stalePositionFlow]);
  expect(commits).toEqual([]);

  guard.invalidate();
  expect(second.signal.aborted).toBe(true);
  expect(guard.isCurrent(second)).toBe(false);
});
