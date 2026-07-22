export const MAX_CITY_ACCURACY_METERS = 25_000;

export type HomepageLocationPermission = PermissionState | "unsupported";

export type HomepageLocationPosterState =
  | "checking"
  | "needs-permission"
  | "requesting"
  | "rendering"
  | "ready"
  | "dismissed"
  | "denied"
  | "unavailable"
  | "error";

export type HomepageLocationFailure =
  | "denied"
  | "unavailable"
  | "timeout"
  | "low-accuracy"
  | "render-failed";

export type HomepagePosterRenderRequest = {
  latitude: number;
  longitude: number;
  theme: "japanese_ink";
  distanceMeters: 6_000;
  width: 1_600;
  height: 1_000;
};

export function resolveInitialLocationPosterState(
  permission: HomepageLocationPermission,
): HomepageLocationPosterState {
  if (permission === "granted") return "rendering";
  if (permission === "denied") return "denied";
  return "needs-permission";
}

export function shouldFocusLocationPoster(
  state: HomepageLocationPosterState,
): boolean {
  return state === "needs-permission" || state === "requesting";
}

export function isCityLevelPosition(position: { accuracy: number }): boolean {
  return Number.isFinite(position.accuracy) && position.accuracy >= 0 &&
    position.accuracy <= MAX_CITY_ACCURACY_METERS;
}

export function getGeolocationFailure(code: number): HomepageLocationFailure {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function createHomepagePosterRenderRequest(input: {
  latitude: number;
  longitude: number;
}): HomepagePosterRenderRequest {
  if (
    !Number.isFinite(input.latitude) || input.latitude < -85.05112878 ||
    input.latitude > 85.05112878
  ) {
    throw new RangeError("invalid_latitude");
  }

  if (
    !Number.isFinite(input.longitude) || input.longitude < -180 ||
    input.longitude > 180
  ) {
    throw new RangeError("invalid_longitude");
  }

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    theme: "japanese_ink",
    distanceMeters: 6_000,
    width: 1_600,
    height: 1_000,
  };
}

export function replaceHomepagePosterObjectUrl(
  currentUrl: string | null,
  nextUrl: string | null,
  revoke: (url: string) => void,
): string | null {
  if (currentUrl && currentUrl !== nextUrl) revoke(currentUrl);
  return nextUrl;
}

export type HomepageLocationRequest = {
  generation: number;
  signal: AbortSignal;
};

export function createHomepageLocationRequestGuard() {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    begin(): HomepageLocationRequest {
      generation += 1;
      controller?.abort();
      controller = new AbortController();
      return { generation, signal: controller.signal };
    },
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    isCurrent(request: HomepageLocationRequest) {
      return request.generation === generation &&
        controller?.signal === request.signal && !request.signal.aborted;
    },
  };
}
