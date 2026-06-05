/**
 * Serve wanone bak.mp4 background video via route.
 *
 * The 19MB video is too large for Deno Deploy's serveStatic: "inline"
 * bundling. It lives outside the publicAssets directory and is served
 * by this dedicated route at /wanone/vi/bak.mp4 to match the original
 * relative path used in index.html.
 */
import { defineEventHandler } from "h3";

const videoUrl = new URL(
  "../../../../domains/wanone/assets/bak.mp4",
  import.meta.url,
);

export default defineEventHandler(async () => {
  const data = await Deno.readFile(videoUrl);
  return new Response(data, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
});
