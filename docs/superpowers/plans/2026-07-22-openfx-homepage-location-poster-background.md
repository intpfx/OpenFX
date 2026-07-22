# OpenFX Homepage Location Poster Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the OpenFX project-browser homepage while generating a
low-interference Map Poster background from the visitor's real device location through a
focused, compact permission capsule.

**Architecture:** Close the existing Source Field work as a tested baseline, then add a
pure homepage location policy module, extend the existing Map Poster render service with
reverse place lookup, and isolate browser/React lifecycle work in a dedicated
`HomepageLocationPoster` component. `App.tsx` only composes the component and exposes
the three existing homepage regions to the component's focus mode; the existing
`/api/map-poster/render` route remains the only HTTP boundary.

**Tech Stack:** TypeScript, React 19, VitePlus, Nitro/H3, Deno tests, browser
Geolocation and Permissions APIs, OpenStreetMap Overpass data, Nominatim reverse lookup,
SVG Blob object URLs, existing CSS/GSAP motion policy.

## Global Constraints

- Execute in `/Users/siaovon/Documents/OpenFX/.worktrees/openfx-source-field-homepage`
  on branch `codex/openfx-source-field-homepage`.
- Preserve the OpenFX logo, three-column desktop project browser, search, `13 / 13`,
  MESSAGE, build version, all 13 cards, and one-click detail entry.
- Keep Map Poster as an independent project card and detail-panel entry.
- Use `navigator.geolocation`; do not infer location from IP address, locale, timezone,
  or language.
- Use one-shot `getCurrentPosition`; never call `watchPosition`, request background
  location, or start a retry loop.
- Accept a device position only when `accuracy <= 25_000` metres; never display raw
  coordinates.
- Reuse `POST /api/map-poster/render`; add no HTTP route and no client runtime
  dependency.
- Use `japanese_ink`, `distanceMeters: 6_000`, `width: 1_600`, and `height: 1_000` for
  homepage backgrounds.
- Do not persist coordinates, resolved city, SVG, or permission choice in localStorage,
  sessionStorage, IndexedDB, cookies, URLs, analytics, server caches, databases, or
  audit records.
- Before a real location succeeds, use the current neutral grid background; never
  present Tokyo or another preset as the visitor's location.
- The first permission gate is a `58px` desktop capsule with a `44px` minimum action.
  The ready state is a `42px` capsule.
- Only `needs-permission` and `requesting` blur and inert the homepage. Returning users
  with permission already granted render non-modally.
- Under `prefers-reduced-motion: reduce`, remove poster crossfades, capsule movement,
  and waiting pulses.
- Human-facing product copy remains Simplified Chinese.
- Preserve unrelated dirty worktree changes. Stage explicit paths for every commit.

## File Map

- Create `entry/web/src/homepage/location-poster.ts`: pure types, constants, state
  policy, accuracy validation, Geolocation error mapping, and render-request
  construction.
- Create `entry/web/tests/homepage-location-poster.test.ts`: pure policy tests.
- Create `entry/web/src/homepage/HomepageLocationPoster.tsx`: browser
  permission/location controller, SVG object URL lifecycle, focus management, and
  presentational capsule/background view.
- Create `entry/web/tests/homepage-location-poster-view.test.tsx`: server-rendered
  semantic markup tests for permission, ready, failure, and suspended states.
- Modify `entry/web/server/map-poster.ts`: reverse place lookup for direct coordinates
  without explicit display labels and additive `place` response metadata.
- Modify `entry/web/tests/map-poster.test.ts`: reverse lookup, label priority, fallback,
  and explicit-label tests.
- Modify `entry/web/src/App.tsx`: compose the location-poster component and apply
  focus-mode `inert`/`aria-hidden` to the existing homepage regions.
- Modify `entry/web/src/styles.css`: background, blur veil, compact capsules, responsive
  layout, safe area, visible focus, and reduced-motion rules.
- Modify `entry/web/README.md`: homepage location-background contract and
  privacy/runtime behavior.
- Modify `domains/map-poster/README.md`: direct-coordinate reverse-label behavior used
  by the homepage.

---

### Task 1: Close the Existing Source Field Baseline

**Files:**

- Modify/commit existing: `deno.json`
- Modify/commit existing: `entry/web/deno.json`
- Modify/commit existing: `entry/web/README.md`
- Modify/commit existing: `entry/web/content/homepage-projects.json`
- Modify/commit existing: `entry/web/homepage-projects.ts`
- Modify/commit existing: `entry/web/src/App.tsx`
- Modify/commit existing: `entry/web/src/styles.css`
- Create/commit existing: `entry/web/src/homepage/ProjectCard.tsx`
- Create/commit existing: `entry/web/src/homepage/experience.ts`
- Modify/commit existing: `entry/web/tests/homepage-projects.test.ts`
- Create/commit existing: `entry/web/tests/homepage-experience.test.ts`
- Create/commit existing: `entry/web/public/homepage-previews/how-much.webp`
- Create/commit existing: `entry/web/public/homepage-previews/gasmap.webp`
- Create/commit existing: `entry/web/public/homepage-previews/finlyzer.webp`

**Interfaces:**

- Consumes: the already implemented Source Field changes in the dedicated worktree.
- Produces: a clean, committed homepage baseline containing semantic `ProjectCard`,
  preview schema/assets, motion policy, focus restoration, and the four approved runtime
  previews.

- [ ] **Step 1: Confirm the dirty set is exactly the approved Source Field work**

Run:

```bash
git status --short
git diff --check
```

Expected: only the explicit files/directories listed above are dirty, while the
committed design specification and this plan are not mixed into the feature commit.

- [ ] **Step 2: Run the focused web tests**

Run:

```bash
deno task --config entry/web/deno.json test
```

Expected: all `entry/web/tests` tests pass, including 13-card coverage, the four exact
preview IDs/assets, search text, motion policy, and View Transition policy.

- [ ] **Step 3: Run the deterministic production build**

Run:

```bash
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
deno task --config entry/web/deno.json build
```

Expected: build exits `0`, emits the Nitro/Vite output, and does not report missing
preview files or TypeScript errors.

- [ ] **Step 4: Run the repository gate**

Run:

```bash
deno task check
git diff --check
```

Expected: formatting, lint, Deno-only guard, web/domain/desktop tests, and whitespace
checks all pass.

- [ ] **Step 5: Commit only the Source Field baseline**

```bash
git add deno.json \
  entry/web/deno.json \
  entry/web/README.md \
  entry/web/content/homepage-projects.json \
  entry/web/homepage-projects.ts \
  entry/web/src/App.tsx \
  entry/web/src/styles.css \
  entry/web/src/homepage/ProjectCard.tsx \
  entry/web/src/homepage/experience.ts \
  entry/web/tests/homepage-projects.test.ts \
  entry/web/tests/homepage-experience.test.ts \
  entry/web/public/homepage-previews/how-much.webp \
  entry/web/public/homepage-previews/gasmap.webp \
  entry/web/public/homepage-previews/finlyzer.webp
git diff --cached --check
git commit -m "feat(web): add source field homepage previews"
```

Expected: one Source Field commit; `git status --short` is clean before starting Task 2.

---

### Task 2: Add the Pure Homepage Location Policy

**Files:**

- Create: `entry/web/src/homepage/location-poster.ts`
- Create: `entry/web/tests/homepage-location-poster.test.ts`

**Interfaces:**

- Consumes: browser-compatible TypeScript only; no DOM, network, React, or storage
  access.
- Produces:
  - `HomepageLocationPermission`
  - `HomepageLocationPosterState`
  - `HomepageLocationFailure`
  - `HomepagePosterRenderRequest`
  - `resolveInitialLocationPosterState(permission)`
  - `shouldFocusLocationPoster(state)`
  - `isCityLevelPosition({ accuracy })`
  - `getGeolocationFailure(code)`
  - `createHomepagePosterRenderRequest({ latitude, longitude })`
  - `replaceHomepagePosterObjectUrl(current, next, revoke)`

- [ ] **Step 1: Write the failing pure-policy tests**

Create `entry/web/tests/homepage-location-poster.test.ts`:

```ts
import { expect } from "@std/expect";

import {
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

Deno.test("homepage poster object URLs are revoked when replaced", () => {
  const revoked: string[] = [];
  const next = replaceHomepagePosterObjectUrl(
    "blob:old",
    "blob:new",
    (url) => revoked.push(url),
  );

  expect(next).toBe("blob:new");
  expect(revoked).toEqual(["blob:old"]);
});
```

- [ ] **Step 2: Run the new test and verify the import fails**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-location-poster.test.ts
```

Expected: FAIL because `entry/web/src/homepage/location-poster.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create `entry/web/src/homepage/location-poster.ts`:

```ts
export const MAX_CITY_ACCURACY_METERS = 25_000;

export type HomepageLocationPermission = PermissionState | "unsupported";

export type HomepageLocationPosterState =
  | "checking"
  | "needs-permission"
  | "requesting"
  | "rendering"
  | "ready"
  | "dismissed"
  | "denied"
  | "unavailable"
  | "error";

export type HomepageLocationFailure =
  | "denied"
  | "unavailable"
  | "timeout"
  | "low-accuracy"
  | "render-failed";

export type HomepagePosterRenderRequest = {
  latitude: number;
  longitude: number;
  theme: "japanese_ink";
  distanceMeters: 6_000;
  width: 1_600;
  height: 1_000;
};

export function resolveInitialLocationPosterState(
  permission: HomepageLocationPermission,
): HomepageLocationPosterState {
  if (permission === "granted") return "rendering";
  if (permission === "denied") return "denied";
  return "needs-permission";
}

export function shouldFocusLocationPoster(
  state: HomepageLocationPosterState,
): boolean {
  return state === "needs-permission" || state === "requesting";
}

export function isCityLevelPosition(position: { accuracy: number }): boolean {
  return Number.isFinite(position.accuracy) && position.accuracy >= 0 &&
    position.accuracy <= MAX_CITY_ACCURACY_METERS;
}

export function getGeolocationFailure(code: number): HomepageLocationFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function createHomepagePosterRenderRequest(input: {
  latitude: number;
  longitude: number;
}): HomepagePosterRenderRequest {
  if (
    !Number.isFinite(input.latitude) || input.latitude < -85.05112878 ||
    input.latitude > 85.05112878
  ) {
    throw new RangeError("invalid_latitude");
  }

  if (
    !Number.isFinite(input.longitude) || input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new RangeError("invalid_longitude");
  }

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    theme: "japanese_ink",
    distanceMeters: 6_000,
    width: 1_600,
    height: 1_000,
  };
}

export function replaceHomepagePosterObjectUrl(
  currentUrl: string | null,
  nextUrl: string | null,
  revoke: (url: string) => void,
): string | null {
  if (currentUrl && currentUrl !== nextUrl) revoke(currentUrl);
  return nextUrl;
}
```

- [ ] **Step 4: Run the focused tests and formatting**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-location-poster.test.ts
deno fmt --check entry/web/src/homepage/location-poster.ts \
  entry/web/tests/homepage-location-poster.test.ts
```

Expected: all seven tests PASS and both files are formatted.

- [ ] **Step 5: Commit the policy module**

```bash
git add entry/web/src/homepage/location-poster.ts \
  entry/web/tests/homepage-location-poster.test.ts
git diff --cached --check
git commit -m "feat(web): add homepage location poster policy"
```

---

### Task 3: Add Direct-Coordinate Reverse Place Resolution

**Files:**

- Modify: `entry/web/server/map-poster.ts`
- Modify: `entry/web/tests/map-poster.test.ts`

**Interfaces:**

- Consumes: existing `createMapPoster(input, deps)` and direct `latitude`/`longitude`
  rendering.
- Produces:
  - `MapPosterResolvedPlace = { city: string; country: string }`
  - additive `MapPosterRenderResult.place?: MapPosterResolvedPlace`
  - injectable `deps.reverseGeocode(center)` for deterministic tests
  - default Nominatim reverse lookup for direct coordinates without both display labels

- [ ] **Step 1: Add a reusable empty map fixture and failing reverse-place tests**

Add near the top of `entry/web/tests/map-poster.test.ts`:

```ts
function emptyMapData(center: { lat: number; lon: number }) {
  return {
    roads: [],
    water: [],
    parks: [],
    bbox: {
      minLon: center.lon - 0.01,
      minLat: center.lat - 0.01,
      maxLon: center.lon + 0.01,
      maxLat: center.lat + 0.01,
    },
  };
}
```

Append these tests:

```ts
Deno.test("map poster resolves display labels for direct homepage coordinates", async () => {
  let renderedLabels:
    | { displayCity?: string; displayCountry?: string }
    | undefined;

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      theme: "japanese_ink",
      width: 1600,
      height: 1000,
      distanceMeters: 6000,
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => Promise.resolve({ city: "Shanghai", country: "China" }),
      render: (_data, _center, _theme, _width, _height, labels) => {
        renderedLabels = labels;
        return "<svg/>";
      },
    },
  );

  expect(renderedLabels?.displayCity).toBe("Shanghai");
  expect(renderedLabels?.displayCountry).toBe("China");
  expect(result.place).toEqual({ city: "Shanghai", country: "China" });
});

Deno.test("map poster reverse lookup uses Nominatim city priority and fixed headers", async () => {
  let requestedUrl = "";
  let requestedUserAgent = "";

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      theme: "japanese_ink",
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      fetcher: (input, init) => {
        requestedUrl = String(input);
        requestedUserAgent = new Headers(init?.headers).get("user-agent") ?? "";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              address: {
                city: "Shanghai",
                municipality: "Shanghai Municipality",
                country: "China",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      },
      render: () => "<svg/>",
    },
  );

  const url = new URL(requestedUrl);
  expect(url.pathname).toBe("/reverse");
  expect(url.searchParams.get("format")).toBe("jsonv2");
  expect(url.searchParams.get("zoom")).toBe("10");
  expect(requestedUserAgent).toContain("OpenFX-MapPoster-Web");
  expect(result.place).toEqual({ city: "Shanghai", country: "China" });
});

Deno.test("map poster keeps real coordinates when reverse lookup fails", async () => {
  let renderedLabels:
    | { displayCity?: string; displayCountry?: string }
    | undefined;

  const result = await createMapPoster(
    { latitude: 31.2304, longitude: 121.4737 },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => Promise.reject(new Error("reverse unavailable")),
      render: (_data, _center, _theme, _width, _height, labels) => {
        renderedLabels = labels;
        return "<svg/>";
      },
    },
  );

  expect(result.center).toEqual({ lat: 31.2304, lon: 121.4737 });
  expect(result.place).toBeUndefined();
  expect(renderedLabels?.displayCity).toBe("LOCAL AREA");
  expect(renderedLabels?.displayCountry).toBe("OPENSTREETMAP");
});

Deno.test("map poster preserves explicit display labels without reverse lookup", async () => {
  let reverseCalls = 0;

  const result = await createMapPoster(
    {
      latitude: 31.2304,
      longitude: 121.4737,
      displayCity: "My Shanghai",
      displayCountry: "China",
    },
    {
      fetchData: (center) => Promise.resolve(emptyMapData(center)),
      reverseGeocode: () => {
        reverseCalls += 1;
        return Promise.resolve({ city: "Shanghai", country: "China" });
      },
      render: () => "<svg/>",
    },
  );

  expect(reverseCalls).toBe(0);
  expect(result.place).toBeUndefined();
});
```

In the existing `map poster can render from a map-picked coordinate without geocoding`
test, inject the reverse dependency so the test continues to prove that neither forward
nor reverse geocoding is used by that focused fixture:

```ts
reverseGeocode: () => Promise.resolve(undefined),
```

- [ ] **Step 2: Run the Map Poster tests and verify the new interface fails**

Run:

```bash
deno test --allow-env entry/web/tests/map-poster.test.ts
```

Expected: FAIL because `reverseGeocode` and `result.place` are not defined.

- [ ] **Step 3: Add reverse lookup types and helpers**

In `entry/web/server/map-poster.ts`, add beside `NOMINATIM_URL`:

```ts
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const REVERSE_CITY_KEYS = [
  "city",
  "town",
  "municipality",
  "village",
  "county",
] as const;

export type MapPosterResolvedPlace = {
  city: string;
  country: string;
};
```

Add `place?: MapPosterResolvedPlace` to `MapPosterRenderResult`.

Add these helpers before `createMapPoster`:

```ts
function readAddressText(address: Record<string, unknown>, key: string) {
  const value = address[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveReverseAddress(value: unknown): MapPosterResolvedPlace | undefined {
  if (!value || typeof value !== "object") return undefined;

  const addressValue = (value as { address?: unknown }).address;
  if (!addressValue || typeof addressValue !== "object") return undefined;

  const address = addressValue as Record<string, unknown>;
  const city = REVERSE_CITY_KEYS
    .map((key) => readAddressText(address, key))
    .find(Boolean) ?? "";
  const country = readAddressText(address, "country");

  if (!city || !country) return undefined;
  return { city, country };
}

async function reverseGeocodePlace(
  center: Coord,
  fetcher: FetchLike = fetch,
): Promise<MapPosterResolvedPlace | undefined> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(center.lat));
  url.searchParams.set("lon", String(center.lon));
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetcher(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "OpenFX-MapPoster-Web/0.1 (github.com/intpfx)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return undefined;
    return resolveReverseAddress(await response.json());
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Resolve labels concurrently with map data**

Extend the `deps` type in `createMapPoster` with:

```ts
reverseGeocode?: (center: Coord) => Promise<MapPosterResolvedPlace | undefined>;
```

Replace the center/data/render section with:

```ts
const center = options.directCenter ?? await geocode(options.city, options.country);
const shouldResolvePlace = Boolean(
  options.directCenter && !options.displayCity && !options.displayCountry,
);
const reverseGeocode = deps.reverseGeocode ??
  ((point: Coord) => reverseGeocodePlace(point, deps.fetcher));
const placePromise = shouldResolvePlace
  ? reverseGeocode(center).catch(() => undefined)
  : Promise.resolve(undefined);
const [rawData, place] = await Promise.all([
  fetchData(center, options.distanceMeters),
  placePromise,
]);
const data = limitMapData(rawData);
const displayCity = options.displayCity ??
  (options.directCenter ? place?.city ?? "LOCAL AREA" : undefined);
const displayCountry = options.displayCountry ??
  (options.directCenter ? place?.country ?? "OPENSTREETMAP" : undefined);
const svg = render(
  data,
  center,
  options.theme as Theme,
  options.width,
  options.height,
  {
    city: options.city,
    country: options.country,
    displayCity,
    displayCountry,
    distanceMeters: options.distanceMeters,
  },
);
```

Add `place` to the returned result object:

```ts
return {
  ok: true,
  svg,
  filename: `openfx-map-poster-${slugify(options.city)}-${options.theme.name}.svg`,
  width: options.width,
  height: options.height,
  theme: options.theme.name,
  city: options.city,
  country: options.country,
  center,
  place,
  stats: {
    roads: data.roads.length,
    water: data.water.length,
    parks: data.parks.length,
    distanceMeters: options.distanceMeters,
  },
};
```

- [ ] **Step 5: Run Map Poster and full web tests**

Run:

```bash
deno test --allow-env entry/web/tests/map-poster.test.ts
deno task --config entry/web/deno.json test
```

Expected: all Map Poster tests and all web tests PASS without network access.

- [ ] **Step 6: Commit the server behavior**

```bash
git add entry/web/server/map-poster.ts entry/web/tests/map-poster.test.ts
git diff --cached --check
git commit -m "feat(map-poster): resolve direct coordinate labels"
```

---

### Task 4: Build the Location Poster Component and Semantic View

**Files:**

- Create: `entry/web/src/homepage/HomepageLocationPoster.tsx`
- Create: `entry/web/tests/homepage-location-poster-view.test.tsx`

**Interfaces:**

- Consumes: Task 2 policy exports and Task 3's additive `{ place?: { city; country } }`
  response.
- Produces:
  - `HomepageLocationPoster` controller component
  - `HomepageLocationPosterView` pure presentational component
  - props `{ fallbackFocusRef, suspended, onFocusModeChange }`

- [ ] **Step 1: Write failing semantic view tests**

Create `entry/web/tests/homepage-location-poster-view.test.tsx`:

```tsx
import { expect } from "@std/expect";
import { renderToStaticMarkup } from "react-dom/server";

import { HomepageLocationPosterView } from "../src/homepage/HomepageLocationPoster.tsx";

const noop = () => {};

Deno.test("location poster permission view is an accessible focused dialog", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={null}
      posterUrl={null}
      state="needs-permission"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain("用你所在的城市生成首页背景");
  expect(html).toContain("允许定位并生成");
  expect(html).toContain("暂不使用");
});

Deno.test("location poster ready view exposes a compact city status", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="ready"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("背景 · Shanghai");
  expect(html).toContain("Map Poster");
  expect(html).toContain("重新定位");
  expect(html).toContain('src="blob:openfx-poster"');
});

Deno.test("location poster failure never invents a city label", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure="low-accuracy"
      place={null}
      posterUrl={null}
      state="error"
      suspended={false}
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain("定位精度不足");
  expect(html).toContain("重试");
  expect(html).not.toContain("Shanghai");
});

Deno.test("location poster suspension hides controls but preserves the background", () => {
  const html = renderToStaticMarkup(
    <HomepageLocationPosterView
      failure={null}
      place={{ city: "Shanghai", country: "China" }}
      posterUrl="blob:openfx-poster"
      state="ready"
      suspended
      onAllow={noop}
      onDismiss={noop}
      onRetry={noop}
    />,
  );

  expect(html).toContain('src="blob:openfx-poster"');
  expect(html).not.toContain("重新定位");
});
```

- [ ] **Step 2: Run the view test and verify the component is missing**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-location-poster-view.test.tsx
```

Expected: FAIL because `HomepageLocationPoster.tsx` does not exist.

- [ ] **Step 3: Create the view types, copy, and semantic markup**

Create `entry/web/src/homepage/HomepageLocationPoster.tsx` with these imports and view
definitions:

```tsx
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import {
  createHomepagePosterRenderRequest,
  getGeolocationFailure,
  type HomepageLocationFailure,
  type HomepageLocationPermission,
  type HomepageLocationPosterState,
  isCityLevelPosition,
  replaceHomepagePosterObjectUrl,
  resolveInitialLocationPosterState,
  shouldFocusLocationPoster,
} from "./location-poster.ts";

export type HomepagePosterPlace = {
  city: string;
  country: string;
};

type HomepagePosterResponse = {
  ok: true;
  svg: string;
  place?: HomepagePosterPlace;
};

type HomepageLocationPosterViewProps = {
  state: HomepageLocationPosterState;
  failure: HomepageLocationFailure | null;
  posterUrl: string | null;
  place: HomepagePosterPlace | null;
  suspended: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  onRetry: () => void;
};

function getFailureTitle(failure: HomepageLocationFailure | null) {
  if (failure === "denied") return "定位权限未开启";
  if (failure === "timeout") return "定位请求超时";
  if (failure === "low-accuracy") return "定位精度不足";
  if (failure === "render-failed") return "城市背景生成失败";
  return "定位暂不可用";
}

export function HomepageLocationPosterView(
  props: HomepageLocationPosterViewProps,
) {
  const isPermissionGate = shouldFocusLocationPoster(props.state);
  const cityLabel = props.place?.city
    ? `背景 · ${props.place.city}`
    : "背景 · 已按当前位置生成";

  return (
    <div className="homepage-location-poster">
      <div
        aria-hidden="true"
        className="homepage-poster-background"
        data-ready={props.posterUrl ? "true" : "false"}
      >
        {props.posterUrl ? <img alt="" decoding="async" src={props.posterUrl} /> : null}
      </div>

      {props.suspended ? null : isPermissionGate
        ? (
          <section
            aria-labelledby="homepageLocationTitle"
            aria-modal="true"
            className="homepage-location-capsule homepage-location-gate"
            role="dialog"
          >
            <div className="homepage-location-copy">
              <small>Map Poster</small>
              <strong id="homepageLocationTitle">
                {props.state === "requesting"
                  ? "在浏览器提示中允许位置访问"
                  : "用你所在的城市生成首页背景"}
              </strong>
              <span>
                {props.state === "requesting"
                  ? "关闭或拒绝不会阻塞首页。"
                  : "设备定位仅用于生成城市海报，不保存原始位置。"}
              </span>
            </div>
            <button
              className="homepage-location-dismiss"
              type="button"
              onClick={props.onDismiss}
            >
              暂不使用
            </button>
            <button
              className="homepage-location-primary"
              data-location-primary="true"
              disabled={props.state === "requesting"}
              type="button"
              onClick={props.onAllow}
            >
              {props.state === "requesting" ? "等待授权" : "允许定位并生成"}
            </button>
          </section>
        )
        : props.state === "ready"
        ? (
          <section
            aria-label="城市背景状态"
            className="homepage-location-capsule homepage-location-status"
          >
            <strong>{cityLabel}</strong>
            <span>Map Poster</span>
            <button type="button" onClick={props.onRetry}>重新定位</button>
          </section>
        )
        : props.state === "rendering"
        ? (
          <p className="homepage-location-capsule homepage-location-progress">
            正在生成城市背景
          </p>
        )
        : props.state === "denied" || props.state === "unavailable" ||
            props.state === "error"
        ? (
          <section
            aria-label="城市背景不可用"
            className="homepage-location-capsule homepage-location-status is-error"
          >
            <strong>{getFailureTitle(props.failure)}</strong>
            <button type="button" onClick={props.onRetry}>重试</button>
            <button type="button" onClick={props.onDismiss}>关闭</button>
          </section>
        )
        : null}

      <span aria-live="polite" className="sr-only" role="status">
        {props.state === "requesting"
          ? "等待浏览器定位授权"
          : props.state === "rendering"
          ? "正在生成城市背景"
          : props.state === "ready"
          ? cityLabel
          : props.state === "error" || props.state === "denied" ||
              props.state === "unavailable"
          ? getFailureTitle(props.failure)
          : ""}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run the semantic tests and verify they pass**

Run:

```bash
deno test --allow-env entry/web/tests/homepage-location-poster-view.test.tsx
```

Expected: all four semantic view tests PASS.

- [ ] **Step 5: Add the browser controller and object URL lifecycle**

Append below the view in `HomepageLocationPoster.tsx`:

```tsx
async function readLocationPermission(): Promise<HomepageLocationPermission> {
  if (!navigator.permissions?.query) return "unsupported";

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function requestDevicePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 300_000,
    });
  });
}

export function HomepageLocationPoster(props: {
  fallbackFocusRef: RefObject<HTMLButtonElement | null>;
  suspended: boolean;
  onFocusModeChange: (active: boolean) => void;
}) {
  const [state, setState] = useState<HomepageLocationPosterState>("checking");
  const [failure, setFailure] = useState<HomepageLocationFailure | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [place, setPlace] = useState<HomepagePosterPlace | null>(null);
  const posterUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasFocusedRef = useRef(false);

  const replacePosterUrl = useCallback((nextUrl: string | null) => {
    posterUrlRef.current = replaceHomepagePosterObjectUrl(
      posterUrlRef.current,
      nextUrl,
      URL.revokeObjectURL,
    );
    setPosterUrl(nextUrl);
  }, []);

  const locateAndRender = useCallback(async (
    permission: HomepageLocationPermission,
  ) => {
    setFailure(null);
    setState(permission === "granted" ? "rendering" : "requesting");

    let position: GeolocationPosition;
    try {
      position = await requestDevicePosition();
    } catch (error) {
      if (!mountedRef.current) return;
      const code = typeof error === "object" && error && "code" in error
        ? Number((error as { code: unknown }).code)
        : 2;
      const nextFailure = getGeolocationFailure(code);
      setFailure(nextFailure);
      setState(nextFailure === "denied" ? "denied" : "error");
      return;
    }

    if (!mountedRef.current) return;
    if (!isCityLevelPosition({ accuracy: position.coords.accuracy })) {
      setFailure("low-accuracy");
      setState("error");
      return;
    }

    setState("rendering");

    try {
      const response = await fetch("/api/map-poster/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createHomepagePosterRenderRequest({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })),
      });
      const result = await response.json() as Partial<HomepagePosterResponse>;
      if (!response.ok || result.ok !== true || typeof result.svg !== "string") {
        throw new Error("map_render_failed");
      }

      const nextUrl = URL.createObjectURL(
        new Blob([result.svg], { type: "image/svg+xml" }),
      );
      if (!mountedRef.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }

      replacePosterUrl(nextUrl);
      setPlace(result.place ?? null);
      setState("ready");
    } catch {
      if (!mountedRef.current) return;
      setFailure("render-failed");
      setState("error");
    }
  }, [replacePosterUrl]);

  const startLocationRequest = useCallback(async () => {
    if (!globalThis.isSecureContext || !navigator.geolocation) {
      setFailure("unavailable");
      setState("unavailable");
      return;
    }
    const permission = await readLocationPermission();
    if (permission === "denied") {
      setFailure("denied");
      setState("denied");
      return;
    }
    await locateAndRender(permission);
  }, [locateAndRender]);

  useEffect(() => {
    mountedRef.current = true;

    void (async () => {
      if (!globalThis.isSecureContext || !navigator.geolocation) {
        if (!mountedRef.current) return;
        setFailure("unavailable");
        setState("unavailable");
        return;
      }

      const permission = await readLocationPermission();
      if (!mountedRef.current) return;
      const initialState = resolveInitialLocationPosterState(permission);
      setState(initialState);
      if (permission === "granted") {
        await locateAndRender(permission);
      } else if (permission === "denied") {
        setFailure("denied");
      }
    })();

    return () => {
      mountedRef.current = false;
      posterUrlRef.current = replaceHomepagePosterObjectUrl(
        posterUrlRef.current,
        null,
        URL.revokeObjectURL,
      );
    };
  }, [locateAndRender]);

  const focusMode = shouldFocusLocationPoster(state);

  useEffect(() => {
    props.onFocusModeChange(focusMode);
    let frameId = 0;

    if (focusMode && !wasFocusedRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      frameId = requestAnimationFrame(() => primaryButtonRef.current?.focus());
    } else if (!focusMode && wasFocusedRef.current) {
      frameId = requestAnimationFrame(() => {
        const previous = previousFocusRef.current;
        const target = previous?.isConnected
          ? previous
          : props.fallbackFocusRef.current;
        target?.focus();
        previousFocusRef.current = null;
      });
    }

    wasFocusedRef.current = focusMode;
    return () => cancelAnimationFrame(frameId);
  }, [focusMode, props.fallbackFocusRef, props.onFocusModeChange]);

  useEffect(() => {
    return () => props.onFocusModeChange(false);
  }, [props.onFocusModeChange]);

  function dismiss() {
    setFailure(null);
    setState("dismissed");
  }

  return (
    <div
      className="homepage-location-controller"
      onKeyDown={(event) => {
        if (event.key === "Escape" && focusMode) {
          event.preventDefault();
          dismiss();
        }
      }}
      ref={(node) => {
        primaryButtonRef.current = node?.querySelector<HTMLButtonElement>(
          "[data-location-primary='true']",
        ) ?? null;
      }}
    >
      <HomepageLocationPosterView
        failure={failure}
        place={place}
        posterUrl={posterUrl}
        state={state}
        suspended={props.suspended}
        onAllow={() => void startLocationRequest()}
        onDismiss={dismiss}
        onRetry={() => void startLocationRequest()}
      />
    </div>
  );
}
```

- [ ] **Step 6: Run component tests and deterministic build**

Run:

```bash
deno test --allow-env \
  entry/web/tests/homepage-location-poster.test.ts \
  entry/web/tests/homepage-location-poster-view.test.tsx
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
deno task --config entry/web/deno.json build
```

Expected: policy/view tests PASS and TypeScript/React production build exits `0`.

- [ ] **Step 7: Commit the isolated component**

```bash
git add entry/web/src/homepage/HomepageLocationPoster.tsx \
  entry/web/tests/homepage-location-poster-view.test.tsx
git diff --cached --check
git commit -m "feat(web): add location poster permission capsule"
```

---

### Task 5: Integrate the Background, Focus Mode, and Responsive Capsule

**Files:**

- Modify: `entry/web/src/App.tsx`
- Modify: `entry/web/src/styles.css`

**Interfaces:**

- Consumes: `HomepageLocationPoster` from Task 4.
- Produces: homepage composition with real background, blur/inert focus mode,
  independent panel suspension, desktop/mobile capsules, and reduced-motion behavior.

- [ ] **Step 1: Compose the component in `Homepage`**

Add the import in `entry/web/src/App.tsx`:

```ts
import { HomepageLocationPoster } from "./homepage/HomepageLocationPoster.tsx";
```

Add state beside the existing homepage state:

```ts
const [locationFocusActive, setLocationFocusActive] = useState(false);
```

Extend `BrandWord` props and its outer element:

```tsx
function BrandWord(props: {
  interactionDisabled: boolean;
  lockWidthPx: number | null;
  onOpenData: (trigger: HTMLButtonElement) => void;
}) {
  const style = props.lockWidthPx === null ? undefined : ({
    "--brand-lock-width": `${props.lockWidthPx}px`,
  } as CSSProperties);

  return (
    <div
      aria-hidden={props.interactionDisabled ? true : undefined}
      className="brand-zone"
      inert={props.interactionDisabled ? true : undefined}
    >
      <div className="brand-shell">
        <button
          aria-label="打开数据面板"
          className="brand-word"
          data-brand="OpenFX"
          id="brandWord"
          style={style}
          type="button"
          onClick={(event) => props.onOpenData(event.currentTarget)}
        >
          <span className="brand-text" id="brandText" />
        </button>
      </div>
    </div>
  );
}
```

At the start of the homepage JSX, render the location component and focus-state data
attribute:

```tsx
<div
  className="page homepage-page"
  data-location-focus={locationFocusActive ? "true" : "false"}
>
  <HomepageLocationPoster
    fallbackFocusRef={brandWordRef}
    suspended={isPanelOpen}
    onFocusModeChange={setLocationFocusActive}
  />
  <BrandWord
    interactionDisabled={locationFocusActive}
    lockWidthPx={brandLockWidth}
    onOpenData={(trigger) => openProjectPanel("openfx-data", trigger)}
  />
```

Add focus-mode accessibility attributes to the existing `projects-zone` and
`control-cluster` elements:

```tsx
<div
  aria-hidden={locationFocusActive ? true : undefined}
  className={`projects-zone${isPanelOpen ? " panel-active" : ""}`}
  inert={locationFocusActive ? true : undefined}
>
```

```tsx
<div
  aria-hidden={locationFocusActive ? true : undefined}
  className="control-cluster"
  inert={locationFocusActive ? true : undefined}
>
```

- [ ] **Step 2: Add the background and desktop capsule CSS**

Add after `.homepage-page` in `entry/web/src/styles.css`:

```css
.homepage-page {
  isolation: isolate;
}

.homepage-page > .brand-zone,
.homepage-page > .projects-zone,
.homepage-page > .control-cluster {
  position: relative;
  z-index: 2;
  transition: filter 0.32s ease, opacity 0.32s ease;
}

.homepage-page[data-location-focus="true"] > .brand-zone,
.homepage-page[data-location-focus="true"] > .projects-zone,
.homepage-page[data-location-focus="true"] > .control-cluster {
  filter: blur(6px);
  opacity: 0.46;
}

.homepage-location-poster {
  display: contents;
}

.homepage-location-controller {
  display: contents;
}

.homepage-poster-background {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.homepage-poster-background::before,
.homepage-poster-background::after {
  position: absolute;
  inset: 0;
  content: "";
}

.homepage-poster-background::before {
  z-index: 2;
  background: oklch(0.985 0.002 250 / 0.76);
}

.homepage-poster-background::after {
  z-index: 3;
  background-image:
    linear-gradient(oklch(0.88 0.005 260 / 0.24) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.88 0.005 260 / 0.24) 1px, transparent 1px);
  background-position: -1px -1px;
  background-size: 80px 80px;
}

.homepage-poster-background img {
  position: absolute;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(0.12) contrast(0.94);
  opacity: 0;
  transition: opacity 0.48s ease;
}

.homepage-poster-background[data-ready="true"] img {
  opacity: 0.34;
}

.homepage-location-capsule {
  position: fixed;
  z-index: 80;
  left: 50%;
  display: flex;
  align-items: center;
  border: 1px solid oklch(0.55 0.2 250 / 0.42);
  border-radius: 999px;
  background: oklch(0.99 0.003 250 / 0.97);
  box-shadow:
    0 18px 60px oklch(0.25 0.06 250 / 0.24),
    0 0 0 5px oklch(0.55 0.2 250 / 0.09);
  backdrop-filter: blur(18px);
  transform: translateX(-50%);
}

.homepage-location-gate {
  bottom: max(1.35rem, env(safe-area-inset-bottom));
  width: min(760px, calc(100vw - 68px));
  min-height: 58px;
  gap: 0.6rem;
  padding: 7px 8px 7px 20px;
}

.homepage-location-copy {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 2px 10px;
}

.homepage-location-copy small {
  color: var(--accent);
  font-family: ui-monospace, "SFMono-Regular", monospace;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.homepage-location-copy strong,
.homepage-location-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.homepage-location-copy strong {
  font-size: 0.86rem;
}

.homepage-location-copy span {
  grid-column: 1 / -1;
  color: var(--text-secondary);
  font-size: 0.64rem;
}

.homepage-location-primary,
.homepage-location-dismiss,
.homepage-location-status button {
  flex: 0 0 auto;
  min-height: 44px;
  border-radius: 999px;
  cursor: pointer;
}

.homepage-location-primary {
  min-width: 150px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: white;
  padding-inline: 1rem;
  font-size: 0.7rem;
  font-weight: 700;
}

.homepage-location-primary:disabled {
  background: transparent;
  color: var(--accent);
  cursor: wait;
}

.homepage-location-dismiss {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  padding-inline: 0.55rem;
  font-size: 0.66rem;
}

.homepage-location-primary:focus-visible,
.homepage-location-dismiss:focus-visible,
.homepage-location-status button:focus-visible {
  outline: 2px solid oklch(0.55 0.2 250 / 0.5);
  outline-offset: 2px;
}

.homepage-location-status,
.homepage-location-progress {
  bottom: max(1.4rem, env(safe-area-inset-bottom));
  min-height: 42px;
  gap: 0.55rem;
  margin: 0;
  padding: 6px 8px 6px 14px;
  color: var(--text-secondary);
  font-family: ui-monospace, "SFMono-Regular", monospace;
  font-size: 0.62rem;
}

.homepage-location-status strong {
  color: var(--accent);
}

.homepage-location-status button {
  min-height: 28px;
  border: 1px solid var(--border);
  background: oklch(1 0 0 / 0.7);
  color: var(--text-secondary);
  padding-inline: 0.65rem;
  font: inherit;
}

.homepage-location-status.is-error strong {
  color: var(--text-primary);
}
```

- [ ] **Step 3: Add narrow-layout and reduced-motion rules**

Add inside the existing narrow/mobile media query:

```css
.homepage-location-gate {
  bottom: max(0.875rem, env(safe-area-inset-bottom));
  width: calc(100vw - 28px);
  gap: 0.35rem;
  padding-left: 0.95rem;
}

.homepage-location-copy {
  display: block;
}

.homepage-location-copy small,
.homepage-location-copy span {
  display: none;
}

.homepage-location-copy strong {
  display: block;
  font-size: 0.72rem;
}

.homepage-location-primary {
  min-width: 8.25rem;
  padding-inline: 0.7rem;
}

.homepage-location-dismiss {
  min-width: 44px;
  overflow: hidden;
  padding-inline: 0.4rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.homepage-location-status,
.homepage-location-progress {
  bottom: calc(max(0.72rem, env(safe-area-inset-bottom)) + 3.5rem);
  max-width: calc(100vw - 2rem);
}
```

Add to the existing `@media (prefers-reduced-motion: reduce)` block:

```css
.homepage-page > .brand-zone,
.homepage-page > .projects-zone,
.homepage-page > .control-cluster,
.homepage-poster-background img,
.homepage-location-capsule {
  transition: none !important;
  animation: none !important;
}
```

- [ ] **Step 4: Run tests and build after integration**

Run:

```bash
deno task --config entry/web/deno.json test
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
deno task --config entry/web/deno.json build
```

Expected: all web tests PASS and the production build exits `0` without JSX, `inert`,
CSS, or type errors.

- [ ] **Step 5: Commit the homepage integration**

```bash
git add entry/web/src/App.tsx entry/web/src/styles.css
git diff --cached --check
git commit -m "feat(web): integrate device location poster background"
```

---

### Task 6: Document the Runtime, Privacy, and Maintenance Contract

**Files:**

- Modify: `entry/web/README.md`
- Modify: `domains/map-poster/README.md`

**Interfaces:**

- Consumes: Tasks 2-5 final behavior.
- Produces: public maintenance documentation matching the actual permission, privacy,
  API, fallback, and responsive behavior.

- [ ] **Step 1: Add the homepage location-background section**

Append under the homepage sections in `entry/web/README.md`:

```md
### 首页设备定位海报背景

首页在浏览器需要定位授权时显示底部聚焦胶囊。胶囊之外的品牌、项目浏览器和底部命令区会暂时
模糊并设置为 `inert`；允许、暂不使用、拒绝、超时或失败后立即恢复。授权胶囊桌面高度为
58px，主操作不小于 44px；成功后收束为 42px 城市状态胶囊。Map Poster 项目卡片仍是独立
生成器入口。

定位必须来自 `navigator.geolocation`，不允许使用 IP、语言或时区推断。只有精度不超过 25
公里的设备结果才会发送到现有 `POST /api/map-poster/render`。首页固定使用
`japanese_ink`、6000 米范围和 1600×1000 SVG；服务端以坐标为地图中心，并用 Nominatim
反向解析城市标题。反向解析失败仍按真实坐标生成地图，但不显示未经确认的城市名。

经纬度、城市名、SVG 和授权选择只存在于当前请求/页面内存，不写入浏览器存储、URL、cookie、
日志、分析、服务端缓存或数据库。未授权和失败状态继续使用现有中性网格背景，不得用东京或其他
预设城市冒充访问者位置。

窄屏把状态胶囊排列在项目命令条上方；`prefers-reduced-motion: reduce`
会关闭背景淡入、胶囊 位移和等待脉冲。
```

- [ ] **Step 2: Document Map Poster reverse-label behavior**

Add to the Web entry/data flow in `domains/map-poster/README.md`:

```md
首页背景复用 `POST /api/map-poster/render` 的直接坐标输入。请求同时提供经纬度但没有
`displayCity` / `displayCountry` 时，服务端会通过固定的 Nominatim reverse endpoint
解析城市 和国家标题；优先使用
city、town、municipality、village、county。反向解析失败不会改变地图
中心，渲染器使用中性标题，响应也不会伪造城市名。该流程不持久化坐标或解析结果。
```

- [ ] **Step 3: Format and review the documentation diff**

Run:

```bash
deno fmt entry/web/README.md domains/map-poster/README.md
deno fmt --check entry/web/README.md domains/map-poster/README.md
git diff --check
```

Expected: both files are formatted and contain no whitespace errors.

- [ ] **Step 4: Commit documentation**

```bash
git add entry/web/README.md domains/map-poster/README.md
git diff --cached --check
git commit -m "docs(web): document location poster background"
```

---

### Task 7: Full Automated and In-App Browser Acceptance

**Files:**

- Verify: all files from Tasks 1-6
- No new file unless a failure requires a scoped correction in the owning task.

**Interfaces:**

- Consumes: the complete Source Field plus location-poster implementation.
- Produces: automated green gates and browser evidence at the three approved viewport
  sizes.

- [ ] **Step 1: Run focused Map Poster and homepage tests**

Run:

```bash
deno test --allow-env entry/web/tests/map-poster.test.ts
deno test --allow-env \
  entry/web/tests/homepage-location-poster.test.ts \
  entry/web/tests/homepage-location-poster-view.test.tsx
deno task --config entry/web/deno.json test
```

Expected: all tests PASS; no test performs real Nominatim or Overpass network access.

- [ ] **Step 2: Run deterministic build and repository gate**

Run:

```bash
VITE_OPENFX_BUILD_TIME=2026-06-30T00:00:00Z \
VITE_OPENFX_BUILD_HASH=local00 \
deno task --config entry/web/deno.json build
deno task check
git diff --check
if rg -n "localStorage|sessionStorage|indexedDB|document\\.cookie" \
  entry/web/src/homepage/location-poster.ts \
  entry/web/src/homepage/HomepageLocationPoster.tsx; then
  exit 1
fi
```

Expected: all commands exit `0`.

- [ ] **Step 3: Start the built local server**

Run:

```bash
deno run --unstable-kv -A entry/web/.output/server/index.ts
```

Expected: server listens on `http://localhost:8000/`. Keep this process running during
browser acceptance.

- [ ] **Step 4: Verify the first-visit permission gate in the Codex in-app browser**

Open `http://localhost:8000/` in a fresh permission state and verify at 1440×900:

- `13 / 13` remains present behind the focus layer.
- The focused control is a bottom-centred 58px capsule, at most 760px wide.
- The primary action and “暂不使用” are keyboard reachable with visible focus.
- All focusable elements outside the capsule count as zero while the gate is active.
- The background is the existing neutral grid before permission succeeds.
- Clicking “暂不使用” restores the exact scroll position and focuses the previous
  control or OpenFX logo.

- [ ] **Step 5: Verify real-device allow and ready states**

Reload into the gate, click “允许定位并生成”, and approve the browser's native location
prompt:

- The web page never draws a fake permission popup.
- The capsule stays in place while its copy changes to “在浏览器提示中允许位置访问”.
- After the device position returns, blur and `inert` are removed before the map render
  finishes.
- The final poster matches the device's actual city and the 42px status capsule shows
  the same resolved city.
- No latitude or longitude appears in visible text or the page URL; the source guard
  from Step 2 confirms the location component contains no browser-persistence access.
- Search `map` still reports `02 / 13`; opening the Map Poster card still enters its
  independent full generator.

- [ ] **Step 6: Verify responsive, failure, and reduced-motion behavior**

At 1024×768 and 390×844 verify:

- No horizontal scrolling or safe-area collision.
- The permission capsule remains compact; primary and dismiss actions are at least 44px
  high.
- The ready/error capsule sits above, rather than over, the existing search/MESSAGE
  command bar.
- Existing Source Field preview cards remain readable and fully opaque on narrow
  layouts.
- Denied permission restores the homepage and displays a non-modal retry state.
- The 25,000-metre accuracy boundary, timeout, unavailable, render-failed, and
  reverse-label fallback paths are covered by automated tests and never invent a city.
- With reduced motion enabled, there is no poster crossfade, capsule movement, waiting
  pulse, card entrance, scroll opacity fade, preview wipe, or View Transition.

- [ ] **Step 7: Confirm the final branch state**

Run:

```bash
git status --short
git log --oneline --decorate -7
```

Expected: working tree is clean and the branch contains separate commits for Source
Field baseline, pure location policy, Map Poster reverse labels, capsule component,
homepage integration, and docs. Do not create an empty verification commit.

## Final Acceptance Checklist

- [ ] The homepage remains a 13-card project browser, not a landing-page Hero.
- [ ] Four Source Field cards keep their approved real previews and budgets.
- [ ] Location comes only from a user-visible browser Geolocation flow.
- [ ] The first permission state makes the compact capsule the sole interactive focus.
- [ ] Ready and returning-granted states do not blur or block the homepage.
- [ ] The generated SVG uses real coordinates and a confirmed reverse-resolved city when
      available.
- [ ] Raw coordinates and derived location assets are never persisted.
- [ ] Map Poster remains an independent card/panel workflow.
- [ ] Desktop, tablet, mobile, reduced-motion, denial, timeout, low-accuracy, and render
      failure are verified.
- [ ] Focused tests, full web tests, deterministic build, `deno task check`, and
      `git diff --check` pass.
