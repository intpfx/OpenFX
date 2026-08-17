import { expect } from "@std/expect";

import type { LibraryItem, StoredFileRef } from "../src/file-library/model.ts";
import {
  describePrivateMeshThumbnail,
  fitPrivateMeshThumbnailDimensions,
  getPrivateMeshThumbnailSource,
} from "../src/file-library/private-mesh-thumbnail.ts";

const SOURCE: StoredFileRef = {
  path: "/photos/source.heic",
  name: "source.heic",
  type: "image/heic",
  size: 4096,
  lastModified: 1_723_683_600_000,
};

const PREVIEW: StoredFileRef = {
  path: "/photos/preview.jpg",
  name: "preview.jpg",
  type: "image/jpeg",
  size: 2048,
  lastModified: 1_723_683_600_100,
};

function item(
  kind: LibraryItem["kind"],
  patch: Partial<LibraryItem> = {},
): LibraryItem {
  return {
    id: `${kind}-1`,
    kind,
    name: SOURCE.name,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    size: SOURCE.size,
    source: SOURCE,
    ...patch,
  };
}

Deno.test("private mesh thumbnail selects only a browser-safe derived visual", () => {
  expect(getPrivateMeshThumbnailSource(item("image", { preview: PREVIEW })))
    .toBe(PREVIEW);
  expect(getPrivateMeshThumbnailSource(item("video", { preview: PREVIEW })))
    .toBe(PREVIEW);
  expect(
    getPrivateMeshThumbnailSource(item("image", {
      source: { ...SOURCE, type: "image/png", name: "source.png" },
    }))?.type,
  ).toBe("image/png");
  expect(
    getPrivateMeshThumbnailSource(item("image", {
      source: { ...SOURCE, type: "", name: "camera.jpg" },
    }))?.name,
  ).toBe("camera.jpg");
  expect(getPrivateMeshThumbnailSource(item("image"))).toBeNull();
  expect(getPrivateMeshThumbnailSource(item("video"))).toBeNull();
  expect(getPrivateMeshThumbnailSource(item("audio", { preview: PREVIEW })))
    .toBeNull();
});

Deno.test("private mesh thumbnail descriptor changes with its visual source", () => {
  expect(describePrivateMeshThumbnail(item("image", { preview: PREVIEW })))
    .toEqual({
      version: 1,
      revision: "2048:1723683600100",
    });
  expect(describePrivateMeshThumbnail(item("image"))).toBeUndefined();
});

Deno.test("private mesh thumbnail dimensions preserve aspect ratio within 320px", () => {
  expect(fitPrivateMeshThumbnailDimensions(4032, 3024)).toEqual({
    width: 320,
    height: 240,
  });
  expect(fitPrivateMeshThumbnailDimensions(600, 1200)).toEqual({
    width: 160,
    height: 320,
  });
  expect(() => fitPrivateMeshThumbnailDimensions(0, 1200)).toThrow();
});
