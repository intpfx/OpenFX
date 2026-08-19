import type { InkMask } from "./photo-cleanup.ts";

export type InkSdf = Readonly<{
  width: number;
  height: number;
  distance: Float32Array;
}>;

type SdfRenderSettings = Readonly<{
  thickness: number;
  softness: number;
}>;

const FAR_DISTANCE_SQUARED = 1_000_000_000_000;

function transformLine(input: Float64Array, output: Float64Array): void {
  const length = input.length;
  const locations = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  let last = 0;
  locations[0] = 0;
  boundaries[0] = Number.NEGATIVE_INFINITY;
  boundaries[1] = Number.POSITIVE_INFINITY;
  for (let position = 1; position < length; position += 1) {
    let intersection = 0;
    while (true) {
      const previous = locations[last];
      intersection = (
        input[position] + position * position -
        (input[previous] + previous * previous)
      ) / (2 * position - 2 * previous);
      if (intersection > boundaries[last] || last === 0) break;
      last -= 1;
    }
    last += 1;
    locations[last] = position;
    boundaries[last] = intersection;
    boundaries[last + 1] = Number.POSITIVE_INFINITY;
  }
  last = 0;
  for (let position = 0; position < length; position += 1) {
    while (boundaries[last + 1] < position) last += 1;
    const delta = position - locations[last];
    output[position] = delta * delta + input[locations[last]];
  }
}

function distanceTransform(
  features: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const rows = new Float64Array(width * height);
  const result = new Float64Array(width * height);
  const horizontalInput = new Float64Array(width);
  const horizontalOutput = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      horizontalInput[x] = features[y * width + x] ? 0 : FAR_DISTANCE_SQUARED;
    }
    transformLine(horizontalInput, horizontalOutput);
    rows.set(horizontalOutput, y * width);
  }
  const verticalInput = new Float64Array(height);
  const verticalOutput = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      verticalInput[y] = rows[y * width + x];
    }
    transformLine(verticalInput, verticalOutput);
    for (let y = 0; y < height; y += 1) {
      result[y * width + x] = verticalOutput[y];
    }
  }
  return result;
}

export function createInkSdf(mask: InkMask): InkSdf {
  if (
    mask.width < 1 || mask.height < 1 ||
    mask.coverage.length !== mask.width * mask.height
  ) {
    throw new Error("OpenInk 墨迹蒙版无效");
  }
  const inside = new Uint8Array(mask.coverage.length);
  const outside = new Uint8Array(mask.coverage.length);
  for (let index = 0; index < mask.coverage.length; index += 1) {
    if (mask.coverage[index] >= 128) inside[index] = 1;
    else outside[index] = 1;
  }
  const distanceToInside = distanceTransform(inside, mask.width, mask.height);
  const distanceToOutside = distanceTransform(outside, mask.width, mask.height);
  const distance = new Float32Array(mask.coverage.length);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = Math.sqrt(distanceToInside[index]) -
      Math.sqrt(distanceToOutside[index]);
  }
  return { width: mask.width, height: mask.height, distance };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return progress * progress * (3 - 2 * progress);
}

export function renderInkSdf(
  sdf: InkSdf,
  settings: SdfRenderSettings,
): InkMask {
  const coverage = new Uint8Array(sdf.distance.length);
  const softness = Math.max(0, settings.softness);
  for (let index = 0; index < sdf.distance.length; index += 1) {
    if (softness === 0) {
      coverage[index] = sdf.distance[index] <= settings.thickness ? 255 : 0;
    } else {
      coverage[index] = Math.round(
        (1 - smoothstep(
          settings.thickness - softness,
          settings.thickness + softness,
          sdf.distance[index],
        )) * 255,
      );
    }
  }
  return { width: sdf.width, height: sdf.height, coverage };
}
