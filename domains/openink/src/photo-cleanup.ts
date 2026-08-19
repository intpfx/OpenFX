export type Point = Readonly<{ x: number; y: number }>;

export type PhotoQuad = Readonly<{
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}>;

export type PhotoPixels = Readonly<{
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}>;

export type PhotoCleanupSettings = Readonly<{
  threshold: number;
  denoise: number;
  backgroundRemoval: number;
  thickness: number;
}>;

export type InkMask = Readonly<{
  width: number;
  height: number;
  coverage: Uint8Array;
}>;

type OutputSize = Readonly<{ width: number; height: number }>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function squareToQuad(quad: PhotoQuad, u: number, v: number): Point {
  const x0 = quad.topLeft.x;
  const y0 = quad.topLeft.y;
  const x1 = quad.topRight.x;
  const y1 = quad.topRight.y;
  const x2 = quad.bottomRight.x;
  const y2 = quad.bottomRight.y;
  const x3 = quad.bottomLeft.x;
  const y3 = quad.bottomLeft.y;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const perspectiveX = Math.abs(denominator) < 1e-9
    ? 0
    : (dx3 * dy2 - dx2 * dy3) / denominator;
  const perspectiveY = Math.abs(denominator) < 1e-9
    ? 0
    : (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = x1 - x0 + perspectiveX * x1;
  const b = x3 - x0 + perspectiveY * x3;
  const d = y1 - y0 + perspectiveX * y1;
  const e = y3 - y0 + perspectiveY * y3;
  const scale = perspectiveX * u + perspectiveY * v + 1;
  return {
    x: (a * u + b * v + x0) / scale,
    y: (d * u + e * v + y0) / scale,
  };
}

function pixelLuminance(image: PhotoPixels, x: number, y: number): number {
  const clampedX = clamp(x, 0, image.width - 1);
  const clampedY = clamp(y, 0, image.height - 1);
  const offset = (clampedY * image.width + clampedX) * 4;
  const alpha = image.pixels[offset + 3] / 255;
  const luminance = image.pixels[offset] * 0.2126 +
    image.pixels[offset + 1] * 0.7152 + image.pixels[offset + 2] * 0.0722;
  return luminance * alpha + 255 * (1 - alpha);
}

function sampleLuminance(image: PhotoPixels, point: Point): number {
  const left = Math.floor(point.x);
  const top = Math.floor(point.y);
  const right = Math.min(image.width - 1, left + 1);
  const bottom = Math.min(image.height - 1, top + 1);
  const horizontal = clamp(point.x - left, 0, 1);
  const vertical = clamp(point.y - top, 0, 1);
  const topValue = pixelLuminance(image, left, top) * (1 - horizontal) +
    pixelLuminance(image, right, top) * horizontal;
  const bottomValue = pixelLuminance(image, left, bottom) * (1 - horizontal) +
    pixelLuminance(image, right, bottom) * horizontal;
  return topValue * (1 - vertical) + bottomValue * vertical;
}

function localBackground(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const integralWidth = width + 1;
  const integral = new Float64Array(integralWidth * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += values[y * width + x];
      integral[(y + 1) * integralWidth + x + 1] = integral[y * integralWidth + x + 1] +
        row;
    }
  }
  const result = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const top = Math.max(0, y - radius);
      const right = Math.min(width - 1, x + radius);
      const bottom = Math.min(height - 1, y + radius);
      const sum = integral[(bottom + 1) * integralWidth + right + 1] -
        integral[top * integralWidth + right + 1] -
        integral[(bottom + 1) * integralWidth + left] +
        integral[top * integralWidth + left];
      result[y * width + x] = sum / ((right - left + 1) * (bottom - top + 1));
    }
  }
  return result;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function removeSmallComponents(
  coverage: Uint8Array,
  width: number,
  height: number,
  denoise: number,
): void {
  const minimumArea = Math.max(1, Math.round(clamp(denoise, 0, 1) * 3));
  if (minimumArea <= 1) return;
  const visited = new Uint8Array(coverage.length);
  for (let origin = 0; origin < coverage.length; origin += 1) {
    if (visited[origin] || coverage[origin] < 128) continue;
    const component: number[] = [];
    const pending = [origin];
    visited[origin] = 1;
    while (pending.length > 0) {
      const current = pending.pop() as number;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (visited[next] || coverage[next] < 128) continue;
          visited[next] = 1;
          pending.push(next);
        }
      }
    }
    if (component.length < minimumArea) {
      for (const index of component) coverage[index] = 0;
    }
  }
}

export function cleanPhotoToMask(
  image: PhotoPixels,
  quad: PhotoQuad,
  output: OutputSize,
  settings: PhotoCleanupSettings,
): InkMask {
  if (
    image.width < 1 || image.height < 1 ||
    image.pixels.length !== image.width * image.height * 4 ||
    output.width < 1 || output.height < 1
  ) {
    throw new Error("OpenInk 照片像素无效");
  }
  const luminance = new Float32Array(output.width * output.height);
  for (let y = 0; y < output.height; y += 1) {
    const v = output.height === 1 ? 0 : y / (output.height - 1);
    for (let x = 0; x < output.width; x += 1) {
      const u = output.width === 1 ? 0 : x / (output.width - 1);
      luminance[y * output.width + x] = sampleLuminance(
        image,
        squareToQuad(quad, u, v),
      );
    }
  }
  const radius = Math.max(1, Math.round(Math.min(output.width, output.height) / 6));
  const background = localBackground(luminance, output.width, output.height, radius);
  const coverage = new Uint8Array(luminance.length);
  const removal = clamp(settings.backgroundRemoval, 0, 1);
  const threshold = clamp(settings.threshold, 0.02, 0.98);
  for (let index = 0; index < luminance.length; index += 1) {
    const globalDarkness = 1 - luminance[index] / 255;
    const localDarkness = Math.max(
      0,
      (background[index] - luminance[index]) / Math.max(32, background[index]),
    );
    const darkness = globalDarkness * (1 - removal) + localDarkness * removal;
    coverage[index] = Math.round(
      smoothstep(threshold - 0.08, threshold + 0.08, darkness) * 255,
    );
  }
  removeSmallComponents(coverage, output.width, output.height, settings.denoise);
  return { width: output.width, height: output.height, coverage };
}
