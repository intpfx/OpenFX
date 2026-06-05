/**
 * Serve wanone bak.mp4 background video.
 *
 * The 19MB video is too large for Deno Deploy's serveStatic: "inline"
 * bundling. It's kept inline here in the route directory and served
 * via Deno.readFile at /wanone/vi/bak.mp4 to match the original
 * relative path used in index.html.
 */
import { defineEventHandler } from "h3";

const videoUrl = new URL("./bak.mp4.data", import.meta.url);

export default defineEventHandler(async () => {
  const data = await Deno.readFile(videoUrl);
  return new Response(data, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
});
