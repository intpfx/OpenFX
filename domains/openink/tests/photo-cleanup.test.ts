import { expect } from "@std/expect";

import { cleanPhotoToMask } from "../src/photo-cleanup.ts";

Deno.test("photo cleanup removes uneven paper while preserving dark ink", () => {
  const width = 9;
  const height = 9;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const paper = 205 + x * 5;
      const value = x === 4 && y >= 1 && y <= 7 ? 18 : paper;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }

  const mask = cleanPhotoToMask(
    { width, height, pixels },
    {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 8, y: 0 },
      bottomRight: { x: 8, y: 8 },
      bottomLeft: { x: 0, y: 8 },
    },
    { width, height },
    {
      threshold: 0.32,
      denoise: 0,
      backgroundRemoval: 1,
      thickness: 0,
    },
  );

  expect(mask.coverage[4 * width + 4]).toBeGreaterThan(220);
  expect(mask.coverage[4 * width + 1]).toBeLessThan(20);
  expect(mask.coverage[4 * width + 7]).toBeLessThan(20);
});

Deno.test("photo cleanup removes isolated specks without erasing connected ink", () => {
  const width = 15;
  const height = 15;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const setInk = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    pixels[offset] = 12;
    pixels[offset + 1] = 12;
    pixels[offset + 2] = 12;
  };
  setInk(2, 2);
  setInk(7, 6);
  setInk(7, 7);
  setInk(7, 8);

  const mask = cleanPhotoToMask(
    { width, height, pixels },
    {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 14, y: 0 },
      bottomRight: { x: 14, y: 14 },
      bottomLeft: { x: 0, y: 14 },
    },
    { width, height },
    {
      threshold: 0.42,
      denoise: 1,
      backgroundRemoval: 0,
      thickness: 0,
    },
  );

  expect(mask.coverage[2 * width + 2]).toBe(0);
  expect(mask.coverage[7 * width + 7]).toBeGreaterThan(220);
});
