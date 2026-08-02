import assert from "node:assert/strict";
import {
  createSceneContentViewModel,
  createSceneRouteHash,
  getScenePlace,
  getSceneService,
  parseSceneRouteHash,
  SCENE_GEOGRAPHY,
  SCENE_PLACES,
} from "../source/community-map-model.js";

Deno.test("community map places use WGS84 coordinates instead of raster percentages", () => {
  const ids = new Set();

  for (const item of SCENE_PLACES) {
    assert.equal(ids.has(item.id), false, `duplicate place id: ${item.id}`);
    ids.add(item.id);
    assert.equal("position" in item, false);
    assert.ok(
      item.coordinate.longitude >= 104.3889 &&
        item.coordinate.longitude <= 104.4445,
    );
    assert.ok(
      item.coordinate.latitude >= 31.6213 &&
        item.coordinate.latitude <= 31.6688,
    );
    assert.equal(item.coordinate.precision, "conceptual-content-anchor");
    assert.ok(item.artTarget.polygon.length >= 4);
    const xs = item.artTarget.polygon.map(([x]) => x);
    const ys = item.artTarget.polygon.map(([, y]) => y);
    assert.ok(
      item.artTarget.polygon.every(([x, y]) =>
        x >= 0 && x <= 1 && y >= 0 && y <= 1
      ),
    );
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 0.1);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 0.1);
    assert.ok(
      item.artTarget.labelPosition.x >= Math.min(...xs) &&
        item.artTarget.labelPosition.x <= Math.max(...xs),
    );
    assert.ok(
      item.artTarget.labelPosition.y >= Math.min(...ys) &&
        item.artTarget.labelPosition.y <= Math.max(...ys),
    );
    assert.ok(item.services.length > 0);
    const serviceIds = new Set();
    for (const service of item.services) {
      assert.equal(
        serviceIds.has(service.id),
        false,
        `duplicate service id: ${service.id}`,
      );
      serviceIds.add(service.id);
      assert.ok(service.legacyPath.length > 0);
      assert.ok(
        service.legacyPath.every((target) => target.endsWith("_entrance")),
      );
      assert.ok(service.pageSelector.endsWith("-page"));
    }
  }
});

Deno.test("community map place lookup returns the configured place", () => {
  assert.equal(getScenePlace("public-square")?.name, "民意广场");
  assert.equal(getScenePlace("missing-place"), null);
});

Deno.test("community map service lookup stays scoped to its place", () => {
  assert.equal(
    getSceneService("service-center", "community-news")?.pageSelector,
    "list-page",
  );
  assert.equal(getSceneService("public-square", "community-news"), null);
  assert.equal(getSceneService("missing-place", "community-news"), null);
});

Deno.test("service-center content uses one reusable abstract-only view model", () => {
  const content = createSceneContentViewModel(
    "service-center",
    "community-intro",
  );

  assert.equal(content?.placeName, "社区服务中心");
  assert.equal(content?.serviceName, "走进社区");
  assert.equal(content?.sequence, "01");
  assert.equal(content?.eyebrow, "COMMUNITY ARCHIVE · 社区档案");
  assert.equal(content?.mediaPolicy, "abstract-only");
  assert.equal(content?.navigation.length, 3);
  assert.deepEqual(
    content?.navigation.map(({ id, active }) => ({ id, active })),
    [
      { id: "community-intro", active: true },
      { id: "community-news", active: false },
      { id: "community-example", active: false },
    ],
  );
  assert.equal(
    createSceneContentViewModel("service-center", "missing-service"),
    null,
  );
});

Deno.test("all seven places expose art-led content models for every service", () => {
  let serviceCount = 0;

  for (const place of SCENE_PLACES) {
    for (const service of place.services) {
      serviceCount += 1;
      const content = createSceneContentViewModel(place.id, service.id);
      assert.equal(content?.placeId, place.id);
      assert.equal(content?.serviceId, service.id);
      assert.equal(content?.artId, place.id);
      assert.equal(content?.mediaPolicy, "abstract-only");
      assert.equal(content?.navigation.length, place.services.length);
      assert.ok(content?.eyebrow.includes("·"));
      assert.ok(content?.contentTitle.length > 0);
      assert.ok(content?.lead.length > 0);
      assert.ok(content?.note.length > 0);
      assert.ok(content?.emptyTitle.length > 0);
    }
  }

  assert.equal(serviceCount, 15);
});

Deno.test("geographic calibration exposes distinct anchors and WGS84 center", () => {
  assert.equal(SCENE_GEOGRAPHY.coordinateSystem, "WGS84");
  assert.ok(SCENE_GEOGRAPHY.center.latitude > 31);
  assert.ok(SCENE_GEOGRAPHY.center.longitude > 104);
  assert.equal(
    new Set(SCENE_GEOGRAPHY.anchors.map(({ id }) => id)).size,
    SCENE_GEOGRAPHY.anchors.length,
  );
  for (const anchor of SCENE_GEOGRAPHY.anchors) {
    assert.equal("position" in anchor, false);
    assert.ok(
      anchor.coordinate.longitude >= 104.3889 &&
        anchor.coordinate.longitude <= 104.4445,
    );
    assert.ok(
      anchor.coordinate.latitude >= 31.6213 &&
        anchor.coordinate.latitude <= 31.6688,
    );
  }
});

Deno.test("scene route hashes validate place and service ids", () => {
  const hash = createSceneRouteHash("service-center", "community-news");
  assert.equal(hash, "#place=service-center&service=community-news");
  assert.deepEqual(parseSceneRouteHash(hash), {
    placeId: "service-center",
    serviceId: "community-news",
  });
  assert.deepEqual(
    parseSceneRouteHash("#place=service-center&service=missing"),
    { placeId: "service-center", serviceId: null },
  );
  assert.equal(parseSceneRouteHash("#place=missing"), null);
});
