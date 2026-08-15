export const OPENFX_NATIVE_PHOTOS_PROTOCOL = "openfx-native-photos-v1";

export type NativePhotoImporter = Readonly<{
  isAvailable: (signal?: AbortSignal) => Promise<boolean>;
  pick: (signal?: AbortSignal) => Promise<readonly File[] | null>;
}>;

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type NativePhotoResource = Readonly<{
  url: string;
  name: string;
  type: string;
  lastModified?: number;
}>;

function isNativePhotoResource(value: unknown): value is NativePhotoResource {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.url === "string" &&
    candidate.url.startsWith("/__openfx_native__/resources/") &&
    typeof candidate.name === "string" && candidate.name.trim().length > 0 &&
    typeof candidate.type === "string" &&
    (candidate.lastModified === undefined ||
      typeof candidate.lastModified === "number");
}

async function nativeError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.message === "string" && payload.message.trim()) {
      return new Error(payload.message.trim());
    }
  } catch {
    // Native failures may still be plain responses; retain the stable fallback.
  }
  return new Error(fallback);
}

export function createNativePhotoImporter(
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
): NativePhotoImporter {
  let sessionToken = "";
  return {
    async isAvailable(signal = new AbortController().signal): Promise<boolean> {
      try {
        const response = await fetcher("/__openfx_native__/capabilities", {
          signal,
        });
        if (!response.ok) return false;
        const payload = await response.json() as Record<string, unknown>;
        const available = payload.protocol === OPENFX_NATIVE_PHOTOS_PROTOCOL &&
          payload.platform === "macos" &&
          typeof payload.sessionToken === "string" &&
          payload.sessionToken.length >= 16;
        sessionToken = available ? payload.sessionToken as string : "";
        return available;
      } catch {
        sessionToken = "";
        return false;
      }
    },
    async pick(
      signal = new AbortController().signal,
    ): Promise<readonly File[] | null> {
      if (!sessionToken) throw new Error("当前环境无法直接访问 Photos");
      const headers = { "x-openfx-native-session": sessionToken };
      const response = await fetcher("/__openfx_native__/live-photo", {
        headers,
        method: "POST",
        signal,
      });
      if (response.status === 204) return null;
      if (!response.ok) {
        throw await nativeError(response, "无法从 Photos 读取实况照片");
      }

      const payload = await response.json() as Record<string, unknown>;
      if (
        !Array.isArray(payload.resources) ||
        payload.resources.length !== 2 ||
        !payload.resources.every(isNativePhotoResource)
      ) {
        throw new Error("Photos 返回的实况照片资源不完整");
      }

      const files: File[] = [];
      for (const resource of payload.resources) {
        const resourceResponse = await fetcher(resource.url, {
          headers,
          signal,
        });
        if (!resourceResponse.ok) {
          throw new Error(`无法读取 Photos 资源：${resource.name}`);
        }
        files.push(
          new File([await resourceResponse.blob()], resource.name, {
            type: resource.type ||
              resourceResponse.headers.get("content-type") ||
              "application/octet-stream",
            lastModified: resource.lastModified ?? Date.now(),
          }),
        );
      }
      return files;
    },
  };
}
