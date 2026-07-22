import {
  createHomepageLocationRequestGuard,
  createHomepagePosterRenderRequest,
  getGeolocationFailure,
  type HomepageLocationFailure,
  type HomepageLocationPermission,
  type HomepageLocationPosterState,
  type HomepageLocationRequest,
  isCityLevelPosition,
  resolveInitialLocationPosterState,
} from "./location-poster.ts";

export type HomepagePosterPlace = {
  city: string;
  country: string;
};

type HomepagePosterResponse = {
  ok: true;
  svg: string;
  place?: HomepagePosterPlace;
};

type PosterResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type HomepageLocationPosterControllerDependencies = {
  isSecureContext: () => boolean;
  hasGeolocation: () => boolean;
  readPermission: () => Promise<HomepageLocationPermission>;
  requestPosition: () => Promise<GeolocationPosition>;
  fetchPoster: (
    request: ReturnType<typeof createHomepagePosterRenderRequest>,
    signal: AbortSignal,
  ) => Promise<PosterResponse>;
  createObjectUrl: (svg: string) => string;
  revokeObjectUrl: (url: string) => void;
  onState: (state: HomepageLocationPosterState) => void;
  onFailure: (failure: HomepageLocationFailure | null) => void;
  onPosterUrl: (url: string | null) => void;
  onPlace: (place: HomepagePosterPlace | null) => void;
};

function isPosterResponse(value: unknown): value is HomepagePosterResponse {
  return Boolean(value) && typeof value === "object" &&
    (value as { ok?: unknown }).ok === true &&
    typeof (value as { svg?: unknown }).svg === "string";
}

export function createHomepageLocationPosterController(
  dependencies: HomepageLocationPosterControllerDependencies,
) {
  const requestGuard = createHomepageLocationRequestGuard();
  let posterUrl: string | null = null;

  const isCurrent = (request: HomepageLocationRequest) =>
    requestGuard.isCurrent(request);

  const replacePosterUrl = (nextUrl: string | null, emit = true) => {
    if (posterUrl && posterUrl !== nextUrl) dependencies.revokeObjectUrl(posterUrl);
    posterUrl = nextUrl;
    if (emit) dependencies.onPosterUrl(nextUrl);
  };

  const clearPoster = (emit = true) => {
    replacePosterUrl(null, emit);
    if (emit) dependencies.onPlace(null);
  };

  const reportUnavailable = (request: HomepageLocationRequest) => {
    if (!isCurrent(request)) return;
    clearPoster();
    dependencies.onFailure("unavailable");
    dependencies.onState("unavailable");
  };

  const locateAndRender = async (
    permission: HomepageLocationPermission,
    request: HomepageLocationRequest,
  ) => {
    if (!isCurrent(request)) return;
    dependencies.onFailure(null);
    dependencies.onState(permission === "granted" ? "rendering" : "requesting");

    let position: GeolocationPosition;
    try {
      position = await dependencies.requestPosition();
    } catch (error) {
      if (!isCurrent(request)) return;
      const code = typeof error === "object" && error && "code" in error
        ? Number((error as { code: unknown }).code)
        : 2;
      const failure = getGeolocationFailure(code);
      clearPoster();
      dependencies.onFailure(failure);
      dependencies.onState(failure === "denied" ? "denied" : "error");
      return;
    }

    if (!isCurrent(request)) return;
    if (!isCityLevelPosition({ accuracy: position.coords.accuracy })) {
      clearPoster();
      dependencies.onFailure("low-accuracy");
      dependencies.onState("error");
      return;
    }

    if (!isCurrent(request)) return;
    dependencies.onState("rendering");

    try {
      const response = await dependencies.fetchPoster(
        createHomepagePosterRenderRequest({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
        request.signal,
      );
      if (!isCurrent(request)) return;
      const result = await response.json();
      if (!isCurrent(request)) return;
      if (!response.ok || !isPosterResponse(result)) {
        throw new Error("map_render_failed");
      }

      if (!isCurrent(request)) return;
      const nextUrl = dependencies.createObjectUrl(result.svg);
      if (!isCurrent(request)) {
        dependencies.revokeObjectUrl(nextUrl);
        return;
      }

      replacePosterUrl(nextUrl);
      dependencies.onPlace(result.place ?? null);
      dependencies.onState("ready");
    } catch {
      if (!isCurrent(request)) return;
      clearPoster();
      dependencies.onFailure("render-failed");
      dependencies.onState("error");
    }
  };

  const startRequest = async (initial: boolean) => {
    const request = requestGuard.begin();
    if (!dependencies.isSecureContext() || !dependencies.hasGeolocation()) {
      reportUnavailable(request);
      return;
    }

    const permission = await dependencies.readPermission();
    if (!isCurrent(request)) return;
    if (initial) {
      dependencies.onState(resolveInitialLocationPosterState(permission));
      if (permission !== "granted") {
        if (permission === "denied") {
          clearPoster();
          dependencies.onFailure("denied");
        }
        return;
      }
    }
    if (permission === "denied") {
      clearPoster();
      dependencies.onFailure("denied");
      dependencies.onState("denied");
      return;
    }

    await locateAndRender(permission, request);
  };

  return {
    initialize() {
      return startRequest(true);
    },
    start() {
      return startRequest(false);
    },
    dismiss() {
      requestGuard.invalidate();
      clearPoster();
      dependencies.onFailure(null);
      dependencies.onState("dismissed");
    },
    dispose() {
      requestGuard.invalidate();
      clearPoster(false);
    },
  };
}
