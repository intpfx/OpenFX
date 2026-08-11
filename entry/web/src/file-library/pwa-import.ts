const SHARED_CACHE = "openfx-shared-import-v1";
const SHARED_MANIFEST = "/__openfx-shared__/manifest";

type LaunchParams = {
  files?: Array<{ getFile(): Promise<File> }>;
};

type LaunchQueue = {
  setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
};

export function installFileLaunchConsumer(
  consumer: (files: File[]) => void | Promise<void>,
): boolean {
  const launchQueue =
    (globalThis as typeof globalThis & { launchQueue?: LaunchQueue }).launchQueue;
  if (!launchQueue) return false;
  launchQueue.setConsumer(async (params) => {
    const files = await Promise.all(
      (params.files ?? []).map((handle) => handle.getFile()),
    );
    if (files.length > 0) await consumer(files);
  });
  return true;
}

export async function registerOpenFxServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function consumeSharedImport(search: string): Promise<File[]> {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "share" || !("caches" in globalThis)) return [];

  const cache = await caches.open(SHARED_CACHE);
  const manifestResponse = await cache.match(SHARED_MANIFEST);
  if (!manifestResponse) return [];
  const manifest = await manifestResponse.json() as Array<{
    key: string;
    name: string;
    type: string;
    lastModified: number;
  }>;
  const files: File[] = [];
  for (const entry of manifest) {
    const response = await cache.match(entry.key);
    if (!response) continue;
    files.push(
      new File([await response.blob()], entry.name, {
        type: entry.type,
        lastModified: entry.lastModified,
      }),
    );
    await cache.delete(entry.key);
  }
  await cache.delete(SHARED_MANIFEST);
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
  return files;
}
