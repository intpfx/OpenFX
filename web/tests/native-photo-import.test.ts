import { expect } from "@std/expect";

import { createNativePhotoImporter } from "../src/file-library/native-photo-import.ts";

Deno.test("native Photos importer detects the macOS bridge capability", async () => {
  const importer = createNativePhotoImporter((input, init) => {
    expect(String(input)).toBe("/__openfx_native__/capabilities");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Promise.resolve(Response.json({
      protocol: "openfx-native-photos-v1",
      platform: "macos",
      sessionToken: "native-session-1",
    }));
  });

  expect(await importer.isAvailable()).toBe(true);
});

Deno.test("native Photos importer returns the original still and paired video as Files", async () => {
  const importer = createNativePhotoImporter((input, init) => {
    const url = String(input);
    if (url === "/__openfx_native__/capabilities") {
      return Promise.resolve(Response.json({
        protocol: "openfx-native-photos-v1",
        platform: "macos",
        sessionToken: "native-session-1",
      }));
    }
    if (url === "/__openfx_native__/live-photo") {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("x-openfx-native-session")).toBe(
        "native-session-1",
      );
      return Promise.resolve(Response.json({
        resources: [
          {
            url: "/__openfx_native__/resources/import-1/still",
            name: "IMG_7732.HEIC",
            type: "image/heic",
          },
          {
            url: "/__openfx_native__/resources/import-1/motion",
            name: "IMG_7732.mov",
            type: "video/quicktime",
          },
        ],
      }));
    }
    if (url.endsWith("/still")) {
      expect(new Headers(init?.headers).get("x-openfx-native-session")).toBe(
        "native-session-1",
      );
      return Promise.resolve(
        new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "image/heic" },
        }),
      );
    }
    if (url.endsWith("/motion")) {
      expect(new Headers(init?.headers).get("x-openfx-native-session")).toBe(
        "native-session-1",
      );
      return Promise.resolve(
        new Response(new Uint8Array([3, 4, 5]), {
          headers: { "content-type": "video/quicktime" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });

  expect(await importer.isAvailable()).toBe(true);
  const files = await importer.pick();

  expect(files?.map((file) => [file.name, file.type, file.size])).toEqual([
    ["IMG_7732.HEIC", "image/heic", 2],
    ["IMG_7732.mov", "video/quicktime", 3],
  ]);
});

Deno.test("native Photos importer preserves the native picker error message", async () => {
  const importer = createNativePhotoImporter((input) => {
    if (String(input) === "/__openfx_native__/capabilities") {
      return Promise.resolve(Response.json({
        protocol: "openfx-native-photos-v1",
        platform: "macos",
        sessionToken: "native-session-1",
      }));
    }
    return Promise.resolve(Response.json({
      error: "photos_picker_failed",
      message: "无法打开 Photos 选择器",
    }, { status: 500 }));
  });

  expect(await importer.isAvailable()).toBe(true);
  await expect(importer.pick()).rejects.toThrow("无法打开 Photos 选择器");
});
