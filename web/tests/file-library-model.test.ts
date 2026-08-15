import { expect } from "@std/expect";

import {
  decodeLivpArchive,
  detectLivpContainer,
  encodeLivpArchive,
} from "../../domains/_shared/livp-codec.ts";

import {
  applyLibraryItemDetails,
  classifyFile,
  deriveLibraryWatchState,
  filterLibraryItems,
  getLibraryItemVisualRef,
  type LibraryItem,
  linkSidecarSubtitles,
  normalizeLibraryAlbums,
  normalizeLibraryItemName,
  pairLivePhotoFiles,
  parseLibraryIndex,
  parseLibraryMediaMetadata,
  searchLibraryItems,
} from "../src/file-library/model.ts";
import {
  DEFAULT_LIBRARY_APPS,
  withDefaultLibraryApps,
} from "../src/file-library/default-apps.ts";
import {
  extractMotionPhotoVideo,
  readMotionPhotoOffset,
  xmpIndicatesMotionPhoto,
} from "../src/file-library/motion-photo.ts";
import { getLibraryAppTileColor } from "../src/file-library/app-tile.ts";
import {
  isMediaPlayerFileActionMessage,
  makeMediaPlayerFileDetailsMessage,
  makeMediaPlayerUrl,
} from "../src/file-library/media-player-url.ts";
import { parseJpegPhotoMetadata } from "../src/file-library/photo-metadata.ts";
import { analyzePhotoFile } from "../src/file-library/photo-analysis.ts";
import {
  buildThumbnailCandidateTimestamps,
  selectBestThumbnailFrame,
} from "../src/file-library/video-thumbnail.ts";

Deno.test("file library classifies previewable and downloadable formats", () => {
  expect(classifyFile(new File([], "photo.heic"))).toBe("image");
  expect(classifyFile(new File([], "movie.mkv"))).toBe("video");
  expect(classifyFile(new File([], "recording.flac"))).toBe("audio");
  expect(classifyFile(new File([], "manual.pdf"))).toBe("pdf");
  expect(classifyFile(new File([], "notes.md"))).toBe("text");
  expect(classifyFile(new File([], "archive.7z"))).toBe("file");
});

Deno.test("file details rename the index and download reference without rewriting bytes", () => {
  const item = {
    id: "photo",
    kind: "image",
    name: "before.png",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    size: 4,
    source: {
      path: "/openfx-file-library/items/photo/source",
      name: "before.png",
      type: "image/png",
      size: 4,
      lastModified: 0,
    },
    albums: ["旧相册"],
  } satisfies LibraryItem;

  const updated = applyLibraryItemDetails(item, {
    name: "  after.png  ",
    albums: ["东京", "东京", "  海报 "],
  }, "2026-08-13T01:00:00.000Z");

  expect(updated).toMatchObject({
    name: "after.png",
    source: {
      path: item.source.path,
      name: "after.png",
      type: item.source.type,
    },
    albums: ["东京", "海报"],
    updatedAt: "2026-08-13T01:00:00.000Z",
  });
  expect(normalizeLibraryItemName("poster.png")).toBe("poster.png");
  expect(normalizeLibraryAlbums([" 东京 ", "", "东京", "海报"])).toEqual([
    "东京",
    "海报",
  ]);
  expect(() => normalizeLibraryItemName("   ")).toThrow("文件名不能为空");
  expect(() => normalizeLibraryItemName("bad/name.png")).toThrow(
    "文件名不能包含斜杠或控制字符",
  );
});

Deno.test("same-name image and MOV import as one Live Photo pair", () => {
  const image = new File([], "IMG_2026.HEIC", { type: "image/heic" });
  const motion = new File([], "IMG_2026.MOV", { type: "video/quicktime" });
  const note = new File([], "IMG_2026.txt", { type: "text/plain" });

  const result = pairLivePhotoFiles([image, note, motion]);

  expect(result.pairs).toEqual([{ image, motion }]);
  expect(result.remaining).toEqual([note]);
});

Deno.test("HEIC photo analysis creates a JPEG preview without changing the original", async () => {
  const source = new File([new Uint8Array([0, 1, 2])], "IMG_2026.HEIC", {
    type: "image/heic",
  });
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
    type: "image/jpeg",
  });

  const result = await analyzePhotoFile(source, (input) => {
    expect(input).toBe(source);
    return Promise.resolve(jpeg);
  });

  expect(result.preview).toBe(jpeg);
  expect(result.preview?.type).toBe("image/jpeg");
  expect(source.name).toBe("IMG_2026.HEIC");
  expect(source.type).toBe("image/heic");
});

Deno.test("v4 HEIC Live Photos retain their original still and queue a compatible preview", () => {
  const archive = {
    path: "/openfx-file-library/items/live/source",
    name: "IMG_2026.livp",
    type: "application/zip",
    size: 30,
    lastModified: 0,
  };
  const heic = {
    path: "/openfx-file-library/items/live/image",
    name: "IMG_2026.heic",
    type: "image/heic",
    size: 10,
    lastModified: 0,
  };
  const motion = {
    path: "/openfx-file-library/items/live/motion",
    name: "IMG_2026.mov",
    type: "video/quicktime",
    size: 20,
    lastModified: 0,
  };

  const migrated = parseLibraryIndex({
    version: 4,
    items: [{
      id: "live",
      kind: "live-photo",
      name: "IMG_2026.livp",
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
      size: 30,
      source: archive,
      preview: heic,
      motion,
      processing: { status: "completed", stage: "motion-photo", attempts: 1 },
    }],
  });

  expect(migrated.version).toBe(8);
  expect(migrated.items[0]?.still).toEqual(heic);
  expect(migrated.items[0]?.processing).toMatchObject({ status: "pending" });
});

Deno.test("file search covers names, kinds, MIME types, and URLs", () => {
  const base = {
    id: "one",
    name: "OpenFX notes",
    kind: "text",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    size: 12,
    source: {
      path: "/one",
      name: "OpenFX notes.txt",
      type: "text/plain",
      size: 12,
      lastModified: 0,
    },
  } satisfies LibraryItem;
  const link = {
    ...base,
    id: "two",
    name: "OPFS Tools",
    kind: "link",
    url: "https://github.com/hughfenghen/opfs-tools",
  } satisfies LibraryItem;

  expect(searchLibraryItems([base, link], "github")).toEqual([link]);
  expect(searchLibraryItems([base, link], "text/plain")).toEqual([base, link]);
  expect(searchLibraryItems([base, link], "missing")).toEqual([]);
});

Deno.test("file search covers analyzed music title, artist, and album", () => {
  const song = {
    id: "song",
    name: "track-01.flac",
    kind: "audio",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    size: 12,
    source: {
      path: "/song",
      name: "track-01.flac",
      type: "audio/flac",
      size: 12,
      lastModified: 0,
    },
    audio: {
      title: "夜航星",
      artist: "不才",
      album: "我的三体",
    },
  } satisfies LibraryItem;

  expect(searchLibraryItems([song], "夜航星")).toEqual([song]);
  expect(searchLibraryItems([song], "不才")).toEqual([song]);
  expect(searchLibraryItems([song], "我的三体")).toEqual([song]);
});

Deno.test("default Apps are merged without entering the OPFS item index", () => {
  const merged = withDefaultLibraryApps([]);

  expect(merged).toEqual(DEFAULT_LIBRARY_APPS);
  expect(merged).toHaveLength(13);
  expect(searchLibraryItems(merged, "OpenStreetMap").map((item) => item.name))
    .toContain("Map Poster");
  expect(searchLibraryItems(merged, "App")).toHaveLength(13);
});

Deno.test("App fallback colors are stable opaque HSL colors", () => {
  const first = getLibraryAppTileColor("e-agent-framework");
  expect(first).toBe(getLibraryAppTileColor("e-agent-framework"));
  expect(first).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  expect(first).not.toBe(getLibraryAppTileColor("bewlyscript"));
});

Deno.test("file library routes OPFS video into the minimal media player", () => {
  const url = makeMediaPlayerUrl({
    path: "/openfx-file-library/items/one/source",
    name: "clip.mov",
    type: "video/quicktime",
  }, {
    itemId: "one",
    resumePositionSec: 12.5,
    subtitles: [{
      path: "/openfx-file-library/items/two/source",
      name: "clip.zh.srt",
      type: "text/plain",
      size: 12,
      lastModified: 0,
    }],
  });

  const parsed = new URL(url, "https://openfx.local");
  expect(parsed.pathname).toBe("/media-player/");
  expect(parsed.searchParams.get("item")).toBe("one");
  expect(parsed.searchParams.get("resume")).toBe("12.5");
  expect(JSON.parse(parsed.searchParams.get("subtitles") ?? "[]")).toHaveLength(1);
});

Deno.test("file library accepts only scoped media-player file actions", () => {
  expect(isMediaPlayerFileActionMessage({
    type: "openfx:media-player:file-action",
    itemId: "one",
    action: "download",
  })).toBe(true);
  expect(isMediaPlayerFileActionMessage({
    type: "openfx:media-player:file-action",
    itemId: "one",
    action: "overwrite",
  })).toBe(false);
  expect(isMediaPlayerFileActionMessage({
    type: "openfx:media-player:progress",
    itemId: "one",
    action: "download",
  })).toBe(false);
});

Deno.test("file library syncs renamed video details without rebuilding its URL", () => {
  expect(makeMediaPlayerFileDetailsMessage("one", "renamed.mov")).toEqual({
    type: "openfx:media-player:file-details",
    itemId: "one",
    name: "renamed.mov",
  });
});

Deno.test("v1 indexes migrate media metadata and sidecar subtitle relationships", () => {
  const video = {
    id: "video",
    name: "Example.Show.S02E03.1080p.mkv",
    kind: "video",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    size: 100,
    source: {
      path: "/video",
      name: "Example.Show.S02E03.1080p.mkv",
      type: "video/x-matroska",
      size: 100,
      lastModified: 0,
    },
  } satisfies LibraryItem;
  const subtitle = {
    ...video,
    id: "subtitle",
    kind: "text",
    name: "Example.Show.S02E03.1080p.zh.srt",
    source: {
      path: "/subtitle",
      name: "Example.Show.S02E03.1080p.zh.srt",
      type: "text/plain",
      size: 10,
      lastModified: 0,
    },
  } satisfies LibraryItem;

  const migrated = parseLibraryIndex({ version: 1, items: [video, subtitle] });
  expect(migrated.version).toBe(8);
  expect(migrated.items[0].media).toMatchObject({
    kind: "show",
    title: "Example Show",
    seasonNumber: 2,
    episodeNumber: 3,
  });
  expect(
    parseLibraryIndex({
      version: 2,
      items: [{ ...video, id: "photo", kind: "image", media: undefined }],
    }).items[0].processing,
  ).toEqual({ status: "pending", stage: "metadata", attempts: 0 });
  expect(linkSidecarSubtitles([video, subtitle])[0].subtitles).toEqual([
    subtitle.source,
  ]);
});

Deno.test("legacy audio items queue metadata analysis and prefer stored album artwork", () => {
  const source = {
    path: "/openfx-file-library/items/song/source",
    name: "song.mp3",
    type: "audio/mpeg",
    size: 100,
    lastModified: 0,
  };
  const cover = {
    path: "/openfx-file-library/items/song/cover",
    name: "song.cover.jpg",
    type: "image/jpeg",
    size: 20,
    lastModified: 0,
  };
  const migrated = parseLibraryIndex({
    version: 5,
    items: [{
      id: "song",
      name: "song.mp3",
      kind: "audio",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      size: 100,
      source,
    }],
  });

  expect(migrated.version).toBe(8);
  expect(migrated.items[0].audioProcessing).toEqual({
    status: "pending",
    attempts: 0,
  });
  expect(getLibraryItemVisualRef(migrated.items[0])).toBeUndefined();
  expect(getLibraryItemVisualRef({
    ...migrated.items[0],
    preview: cover,
    audio: { title: "Song", artist: "Artist", album: "Album" },
    audioProcessing: { status: "completed", attempts: 1 },
  })).toEqual(cover);
});

Deno.test("older audio items requeue once so embedded lyrics can be discovered", () => {
  const source = {
    path: "/openfx-file-library/items/song/source",
    name: "song.mp3",
    type: "audio/mpeg",
    size: 100,
    lastModified: 0,
  };
  const migrated = parseLibraryIndex({
    version: 7,
    items: [{
      id: "song",
      name: "song.mp3",
      kind: "audio",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      size: 100,
      source,
      audio: { title: "Song", artist: "Artist" },
      audioProcessing: { status: "completed", attempts: 1 },
    }],
  });

  expect(migrated.version).toBe(8);
  expect(migrated.items[0].audioProcessing).toEqual({
    status: "pending",
    attempts: 1,
  });
});

Deno.test("media smart views and playback state stay independent from file storage", () => {
  expect(parseLibraryMediaMetadata("A.Movie.2024.2160p.mkv")).toMatchObject({
    kind: "movie",
    title: "A Movie",
    year: 2024,
  });
  expect(deriveLibraryWatchState({ positionSec: 12, durationSec: 100 })).toBe(
    "in-progress",
  );
  expect(deriveLibraryWatchState({ positionSec: 95, durationSec: 100 })).toBe(
    "watched",
  );
  expect(deriveLibraryWatchState({ positionSec: 2, durationSec: 4 })).toBe(
    "in-progress",
  );

  const item = parseLibraryIndex({
    version: 2,
    items: [{
      id: "movie",
      name: "A.Movie.2024.mkv",
      kind: "video",
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      size: 100,
      source: {
        path: "/movie",
        name: "A.Movie.2024.mkv",
        type: "video/x-matroska",
        size: 100,
        lastModified: 0,
      },
    }],
  }).items[0];
  expect(filterLibraryItems([item], "movies")).toEqual([item]);
  expect(filterLibraryItems([item], "shows")).toEqual([]);
});

Deno.test("video thumbnail selection avoids opening and closing black frames", () => {
  expect(buildThumbnailCandidateTimestamps(100)).toEqual([8, 12, 20, 30]);
  expect(
    selectBestThumbnailFrame([
      {
        timestampSec: 8,
        meanLuma: 2,
        standardDeviation: 1,
        edgeScore: 1,
        darkPixelRatio: 0.98,
        score: -100,
        accepted: false,
      },
      {
        timestampSec: 20,
        meanLuma: 120,
        standardDeviation: 44,
        edgeScore: 18,
        darkPixelRatio: 0.1,
        score: 80,
        accepted: true,
      },
    ])?.timestampSec,
  ).toBe(20);
});

Deno.test("Motion Photo XMP offset extracts the appended MP4 tail", async () => {
  const video = new Uint8Array(9_000);
  video.set(new TextEncoder().encode("\0\0\0\u0018ftypisom"), 0);
  const xmp = [
    '<x:xmpmeta GCamera:MotionPhoto="1" ',
    `GCamera:MicroVideoOffset="${video.byteLength}">`,
    "</x:xmpmeta>",
  ].join("");
  const image = new Uint8Array(1_024);
  image.set(new TextEncoder().encode(xmp));
  const source = new File([image, video], "motion.jpg", { type: "image/jpeg" });

  expect(xmpIndicatesMotionPhoto(xmp)).toBe(true);
  expect(readMotionPhotoOffset(xmp)).toBe(video.byteLength);
  const extracted = await extractMotionPhotoVideo(source);
  expect(extracted?.type).toBe("video/mp4");
  expect(extracted?.size).toBe(video.byteLength);
});

Deno.test("photo smart views derive favorites, Live Photos, places, and date order", () => {
  const photo = (id: string, overrides: Partial<LibraryItem> = {}): LibraryItem => ({
    id,
    name: `${id}.jpg`,
    kind: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    size: 1,
    source: {
      path: `/${id}`,
      name: `${id}.jpg`,
      type: "image/jpeg",
      size: 1,
      lastModified: 0,
    },
    ...overrides,
  });
  const early = photo("early", {
    favorite: true,
    photo: { capturedAt: "2024-01-01T00:00:00" },
  });
  const late = photo("late", {
    kind: "live-photo",
    photo: {
      capturedAt: "2025-01-01T00:00:00",
      latitude: 31.23,
      longitude: 121.47,
    },
  });

  expect(filterLibraryItems([early, late], "photos")).toEqual([late, early]);
  expect(filterLibraryItems([early, late], "live-photos")).toEqual([late]);
  expect(filterLibraryItems([early, late], "favorites")).toEqual([early]);
  expect(filterLibraryItems([early, late], "places")).toEqual([late]);
  expect(searchLibraryItems([early, late], "31.23")).toEqual([late]);
});

Deno.test("interrupted photo jobs become recoverable when a v3 index is reopened", () => {
  const item = {
    id: "photo",
    name: "photo.jpg",
    kind: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    size: 1,
    source: {
      path: "/photo",
      name: "photo.jpg",
      type: "image/jpeg",
      size: 1,
      lastModified: 0,
    },
    processing: { status: "running", stage: "metadata", attempts: 1 },
  } satisfies LibraryItem;
  const parsed = parseLibraryIndex({ version: 3, items: [item] });
  expect(parsed.items[0].processing).toEqual({
    status: "pending",
    stage: "metadata",
    attempts: 1,
  });
});

Deno.test("JPEG parser reads dimensions, orientation, and capture time without pixel decode", () => {
  const tiff = new Uint8Array(76);
  const tiffView = new DataView(tiff.buffer);
  tiff.set(new TextEncoder().encode("II"), 0);
  tiffView.setUint16(2, 42, true);
  tiffView.setUint32(4, 8, true);
  tiffView.setUint16(8, 2, true);
  tiffView.setUint16(10, 0x0112, true);
  tiffView.setUint16(12, 3, true);
  tiffView.setUint32(14, 1, true);
  tiffView.setUint16(18, 6, true);
  tiffView.setUint16(22, 0x8769, true);
  tiffView.setUint16(24, 4, true);
  tiffView.setUint32(26, 1, true);
  tiffView.setUint32(30, 38, true);
  tiffView.setUint32(34, 0, true);
  tiffView.setUint16(38, 1, true);
  tiffView.setUint16(40, 0x9003, true);
  tiffView.setUint16(42, 2, true);
  tiffView.setUint32(44, 20, true);
  tiffView.setUint32(48, 56, true);
  tiffView.setUint32(52, 0, true);
  tiff.set(new TextEncoder().encode("2026:08:10 12:34:56\0"), 56);

  const exif = new Uint8Array(6 + tiff.byteLength);
  exif.set(new TextEncoder().encode("Exif\0\0"));
  exif.set(tiff, 6);
  const app1 = new Uint8Array(4 + exif.byteLength);
  app1.set([0xff, 0xe1]);
  new DataView(app1.buffer).setUint16(2, exif.byteLength + 2, false);
  app1.set(exif, 4);
  const sof = new Uint8Array([
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    0x04,
    0x00,
    0x06,
    0x00,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
  ]);
  const jpeg = new Uint8Array(2 + app1.byteLength + sof.byteLength + 2);
  jpeg.set([0xff, 0xd8]);
  jpeg.set(app1, 2);
  jpeg.set(sof, 2 + app1.byteLength);
  jpeg.set([0xff, 0xd9], jpeg.byteLength - 2);

  expect(parseJpegPhotoMetadata(jpeg)).toMatchObject({
    width: 1536,
    height: 1024,
    orientation: 6,
    capturedAt: "2026-08-10T12:34:56",
  });
});

Deno.test("canonical ZIP LIVP round-trips and remains distinct from legacy binary", async () => {
  const image = new Uint8Array([1, 2, 3, 4]);
  const video = new Uint8Array([5, 6, 7, 8, 9]);
  const archive = encodeLivpArchive(image, video, {
    version: "2",
    timestamp: "2026-08-10T00:00:00.000Z",
    stillImageTime: 0,
    imageFormat: "jpg",
    videoFormat: "mov",
  });

  expect(detectLivpContainer(archive)).toBe("zip");
  const decoded = await decodeLivpArchive(archive);
  expect(decoded.image).toEqual(image);
  expect(decoded.video).toEqual(video);
  expect(decoded.imageMimeType).toBe("image/jpeg");
  expect(decoded.videoMimeType).toBe("video/quicktime");
});
