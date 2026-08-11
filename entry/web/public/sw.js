const SHARED_CACHE = "openfx-shared-import-v1";
const SHARED_MANIFEST = "/__openfx-shared__/manifest";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin || url.pathname !== "/share-target" ||
    event.request.method !== "POST"
  ) return;
  event.respondWith(receiveSharedFiles(event.request));
});

async function receiveSharedFiles(request) {
  const form = await request.formData();
  const received = form.getAll("files").filter((value) => value instanceof File);
  const cache = await caches.open(SHARED_CACHE);
  const manifest = [];

  for (const [index, shared] of received.entries()) {
    const key = `/__openfx-shared__/${Date.now()}-${index}`;
    await cache.put(
      key,
      new Response(shared, {
        headers: { "Content-Type": shared.type || "application/octet-stream" },
      }),
    );
    manifest.push({
      key,
      name: shared.name || `共享文件-${index + 1}`,
      type: shared.type || "application/octet-stream",
      lastModified: shared.lastModified || Date.now(),
    });
  }

  await cache.put(
    SHARED_MANIFEST,
    new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  return Response.redirect(new URL("/?source=share", self.location.origin), 303);
}
