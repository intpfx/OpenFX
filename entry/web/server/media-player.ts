import { useStorage } from "nitropack/runtime";

import {
  isMediaPlayerReadMethod,
  type MediaPlayerShell,
  resolveMediaPlayerShell,
} from "./media-player-route.ts";

async function loadMediaPlayerShell(shell: MediaPlayerShell) {
  const html = await useStorage<string>("assets:media-player").getItem(shell);
  if (typeof html === "string") return html;
  throw new Error(`Unable to locate media-player shell: ${shell}`);
}

export async function renderMediaPlayerDocument(path: string): Promise<Response> {
  const shell = resolveMediaPlayerShell(path);
  if (!shell) return new Response("Not Found", { status: 404 });

  return new Response(await loadMediaPlayerShell(shell), {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function handleMediaPlayerRequest(
  method: string,
  path: string,
): Promise<Response> {
  if (!isMediaPlayerReadMethod(method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const response = await renderMediaPlayerDocument(path);
  return method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
