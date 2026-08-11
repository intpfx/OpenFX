import {
  createMapPoster as createMapPosterDomain,
  type MapPosterDependencies,
  type MapPosterRenderRequest,
} from "../../domains/map-poster/src/web-service.ts";
import {
  defaultNominatimService,
  defaultReverseGeocodeService,
} from "./map-poster-reverse-geocoding.ts";

export {
  type MapPosterDependencies,
  MapPosterInputError,
  type MapPosterRenderRequest,
  type MapPosterRenderResult,
  type MapPosterResolvedPlace,
} from "../../domains/map-poster/src/web-service.ts";

export function createMapPoster(
  input: MapPosterRenderRequest,
  dependencies: MapPosterDependencies = {},
) {
  return createMapPosterDomain(input, {
    ...dependencies,
    geocode: dependencies.geocode ?? defaultNominatimService.search,
    reverseGeocode: dependencies.reverseGeocode ??
      defaultReverseGeocodeService.lookup,
  });
}
