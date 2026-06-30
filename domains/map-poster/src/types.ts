export interface Coord {
  lat: number;
  lon: number;
}

export interface Theme {
  name: string;
  description: string;
  bg: string;
  text: string;
  gradientColor: string;
  water: string;
  parks: string;
  roadMotorway: string;
  roadPrimary: string;
  roadSecondary: string;
  roadTertiary: string;
  roadResidential: string;
  roadDefault: string;
}

export type RoadType =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "unclassified"
  | "other";

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags: Record<string, string>;
}

export interface OsmRelation {
  type: "relation";
  id: number;
  members: { type: string; ref: number; role: string }[];
  tags: Record<string, string>;
}

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export interface OverpassResponse {
  version: number;
  elements: OsmElement[];
}

export interface GeoFeature {
  /** Path data in lon/lat coordinates; renderer projects it into poster space. */
  d: string;
  /** Feature bounding box placeholder for future geometry indexing. */
  bbox: [number, number, number, number];
  /** Tags from the OSM element */
  tags: Record<string, string>;
}

export interface OverpassData {
  nodes: Map<number, OsmNode>;
  features: GeoFeature[];
}

export interface PosterConfig {
  city: string;
  country: string;
  displayCity?: string;
  displayCountry?: string;
  theme: Theme;
  latitude?: number;
  longitude?: number;
  distance: number;
  width: number;
  height: number;
  format: "svg" | "png";
}

export interface FetchResult {
  roads: GeoFeature[];
  water: GeoFeature[];
  parks: GeoFeature[];
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}
