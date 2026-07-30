import { assertEquals } from "@std/assert";

import { fileDisplayTitle, fileOpenPresentation } from "../src/ui/file-presentation.ts";

Deno.test("file display titles remove extensions and remain inside the detail card", () => {
  assertEquals(fileDisplayTitle("short.png"), "short");
  assertEquals(
    fileDisplayTitle("abcdefghijklmnopqrstuvwxyz0123456789.txt"),
    "abcdefghijklmnopqrstuvwxyz0123456…",
  );
  assertEquals(fileDisplayTitle(".env"), ".env");
});

Deno.test("images and videos open in the immersive in-app viewer", () => {
  assertEquals(fileOpenPresentation("image"), "immersive-image");
  assertEquals(fileOpenPresentation("video"), "immersive-video");
  assertEquals(fileOpenPresentation("audio"), "details");
  assertEquals(fileOpenPresentation("document"), "details");
  assertEquals(fileOpenPresentation("archive"), "details");
  assertEquals(fileOpenPresentation("code"), "details");
  assertEquals(fileOpenPresentation("package"), "details");
  assertEquals(fileOpenPresentation("other"), "details");
});
