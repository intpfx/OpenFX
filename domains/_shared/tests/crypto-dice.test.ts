import { expect } from "@std/expect";

import { encrypt, decrypt, randomGenes, randomPoints } from "../crypto-dice.ts";

// CHARS set from crypto-dice.ts — all valid characters
const CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-={}[]|\\:;\"'<>,.?/~`";

/** Build a string of given length using only CHARS characters, avoiding repeats that would cause ambiguity in multi-round tests */
function randomText(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS[(i * 7 + 13) % CHARS.length];
  }
  return result;
}

// ─── Roundtrip Tests (all chars within CHARS) ─────────────────────────────────

Deno.test("encrypt / decrypt roundtrip with default points", () => {
  const original = randomText(8);
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip with custom points", () => {
  const original = randomText(6);
  const points = [2, 5, 1, 3];
  const cipher = encrypt(original, points);
  const decoded = decrypt(cipher, points);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip with single point (digit=1)", () => {
  // piDigit(1) returns 1 → no length expansion
  const original = "HelloWorld42";
  const cipher = encrypt(original, [1]);
  const decoded = decrypt(cipher, [1]);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip with many points (only CHARS chars)", () => {
  const original = "abcdefghijABCDEFGHIJ0123456789";
  const points = [3, 6, 9, 1, 4, 2];
  const cipher = encrypt(original, points);
  const decoded = decrypt(cipher, points);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip for empty string", () => {
  const original = "";
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip for single CHARS character", () => {
  const original = "A";
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip with all CHARS special characters", () => {
  const original = "!@#$%^&*()_+-={}[]|;':\",./<>?~`";
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip with mixed CHARS characters", () => {
  const original = "abc123XYZ!@#def456";
  const points = [4, 2, 9];
  const cipher = encrypt(original, points);
  const decoded = decrypt(cipher, points);
  expect(decoded).toBe(original);
});

Deno.test("encrypt with different points produces different output", () => {
  const original = randomText(6);
  const cipher1 = encrypt(original, [1, 4, 2, 9]);
  const cipher2 = encrypt(original, [5, 3, 7]);
  expect(cipher1).not.toBe(cipher2);
  expect(decrypt(cipher1, [1, 4, 2, 9])).toBe(original);
  expect(decrypt(cipher2, [5, 3, 7])).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip for long string (CHARS only)", () => {
  const original = randomText(200);
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("encrypt / decrypt roundtrip for 500 char string", () => {
  const original = randomText(500);
  const cipher = encrypt(original);
  const decoded = decrypt(cipher);
  expect(decoded).toBe(original);
});

Deno.test("decrypt fails with wrong points", () => {
  const original = randomText(6);
  const cipher = encrypt(original, [3, 7, 1]);
  const decoded = decrypt(cipher, [1, 4, 2, 9]); // wrong points
  expect(decoded).not.toBe(original);
});

// ─── Deterministic output ─────────────────────────────────────────────────────

Deno.test("encrypt produces same output for same input and same points", () => {
  const original = randomText(8);
  const a = encrypt(original, [2, 5]);
  const b = encrypt(original, [2, 5]);
  expect(a).toBe(b);
});

// ─── randomGenes ──────────────────────────────────────────────────────────────

Deno.test("randomGenes returns correct count", () => {
  const genes = randomGenes(5);
  expect(genes.length).toBe(5);
});

Deno.test("randomGenes returns strings with valid length range (4-8)", () => {
  for (let i = 0; i < 50; i++) {
    const genes = randomGenes(10);
    for (const gene of genes) {
      expect(gene.length).toBeGreaterThanOrEqual(4);
      expect(gene.length).toBeLessThanOrEqual(8);
    }
  }
});

Deno.test("randomGenes returns strings containing only valid CHARS characters", () => {
  for (let i = 0; i < 20; i++) {
    const genes = randomGenes(5);
    for (const gene of genes) {
      for (const ch of gene) {
        expect(CHARS.includes(ch)).toBe(true);
      }
    }
  }
});

// ─── randomPoints ─────────────────────────────────────────────────────────────

Deno.test("randomPoints returns non-empty array with no duplicates", () => {
  for (let i = 0; i < 50; i++) {
    const points = randomPoints();
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points.length).toBeLessThanOrEqual(5);
    const unique = new Set(points);
    expect(unique.size).toBe(points.length);
  }
});

Deno.test("randomPoints returns only positive numbers", () => {
  for (let i = 0; i < 20; i++) {
    const points = randomPoints();
    for (const p of points) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(5);
    }
  }
});
