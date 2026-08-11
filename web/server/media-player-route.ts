export type MediaPlayerShell = "index.html";

export function resolveMediaPlayerShell(path: string): MediaPlayerShell | null {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  return normalized === "" || normalized === "openfx-file" ? "index.html" : null;
}

export function isMediaPlayerReadMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}
