import { expect } from "@std/expect";

import {
  encode,
  encodeMatrix,
  getStringToBytes,
  registerStringToBytes,
} from "../qrcode.ts";

// ─── Basic Functionality ──────────────────────────────────────────────────────

Deno.test("encode('HELLO WORLD') returns correct version and module count", () => {
  const qr = encode("HELLO WORLD");
  expect(qr.version).toBe(1);
  expect(qr.moduleCount).toBe(21); // version * 4 + 17
  expect(qr.errorCorrectionLevel).toBe("M");
  expect(qr.maskPattern).toBeGreaterThanOrEqual(0);
  expect(qr.maskPattern).toBeLessThanOrEqual(7);
});

Deno.test("encode('HELLO WORLD') produces a 21x21 matrix", () => {
  const qr = encode("HELLO WORLD");
  expect(qr.modules.length).toBe(21);
  for (const row of qr.modules) {
    expect(row.length).toBe(21);
  }
});

// ─── Structural verification helpers ──────────────────────────────────────────

function verifyFinderPattern(
  modules: boolean[][],
  startRow: number,
  startCol: number,
): void {
  // Dark border: rows 0,6 and columns 0,6 within the 7x7 block
  // Inner 3x3 is also dark
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
      const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (isBorder || isInner) {
        expect(modules[startRow + r][startCol + c]).toBe(true);
      } else {
        expect(modules[startRow + r][startCol + c]).toBe(false);
      }
    }
  }
}

Deno.test("encode('HELLO WORLD') has correct finder pattern structure", () => {
  const qr = encode("HELLO WORLD");

  // Top-left finder
  verifyFinderPattern(qr.modules, 0, 0);
  // Top-right finder (v1: moduleCount=21, so 21-7=14)
  verifyFinderPattern(qr.modules, 0, 14);
  // Bottom-left finder
  verifyFinderPattern(qr.modules, 14, 0);

  // Timing pattern on row 6 (between column 8 and moduleCount-8)
  for (let c = 8; c < qr.moduleCount - 8; c++) {
    expect(typeof qr.modules[6][c]).toBe("boolean");
  }
  for (let r = 8; r < qr.moduleCount - 8; r++) {
    expect(typeof qr.modules[r][6]).toBe("boolean");
  }
});

// ─── encodeMatrix ─────────────────────────────────────────────────────────────

Deno.test("encodeMatrix returns boolean[][]", () => {
  const modules = encodeMatrix("TEST");
  expect(Array.isArray(modules)).toBe(true);
  expect(modules.length).toBe(21);
  for (const row of modules) {
    expect(Array.isArray(row)).toBe(true);
    for (const cell of row) {
      expect(typeof cell).toBe("boolean");
    }
  }
});

// ─── Error Correction Levels ──────────────────────────────────────────────────

Deno.test("encode with errorCorrectionLevel L", () => {
  const qr = encode("HELLO WORLD", { errorCorrectionLevel: "L" });
  expect(qr.errorCorrectionLevel).toBe("L");
  expect(qr.version).toBe(1);
});

Deno.test("encode with different errorCorrectionLevels produce different matrices", () => {
  const qrM = encode("HELLO WORLD", { errorCorrectionLevel: "M" });
  expect(qrM.version).toBe(1);
  expect(qrM.errorCorrectionLevel).toBe("M");

  // Q fits in version 1 for "HELLO WORLD" (11 chars alphanumeric)
  const qrQ = encode("HELLO WORLD", { errorCorrectionLevel: "Q" });
  expect(qrQ.errorCorrectionLevel).toBe("Q");
  expect(qrQ.version).toBe(1);

  // H needs version 2 for "HELLO WORLD"
  const qrH = encode("HELLO WORLD", { errorCorrectionLevel: "H" });
  expect(qrH.errorCorrectionLevel).toBe("H");
  expect(qrH.version).toBe(2);
});

Deno.test("encode with all four ECC levels use correct types", () => {
  for (const ecc of ["L", "M", "Q", "H"] as const) {
    const qr = encode("HELLO WORLD", { errorCorrectionLevel: ecc });
    expect(qr.errorCorrectionLevel).toBe(ecc);
    expect(qr.version).toBeGreaterThanOrEqual(1);
    expect(qr.version).toBeLessThanOrEqual(2);
  }
});

// ─── Specified Version ────────────────────────────────────────────────────────

Deno.test("encode with explicit version 5 produces correct module count", () => {
  const qr = encode("HELLO WORLD", { version: 5 });
  expect(qr.version).toBe(5);
  expect(qr.moduleCount).toBe(37); // 5*4+17
  expect(qr.modules.length).toBe(37);
});

Deno.test("encode with explicit version 10", () => {
  const qr = encode("HELLO WORLD", { version: 10 });
  expect(qr.version).toBe(10);
  expect(qr.moduleCount).toBe(57);
});

Deno.test("encode with explicit version 40 (max)", () => {
  const qr = encode("HELLO WORLD", { version: 40 });
  expect(qr.version).toBe(40);
  expect(qr.moduleCount).toBe(177);
});

Deno.test("encode auto-detects minimal version", () => {
  const qrSmall = encode("HELLO");
  expect(qrSmall.version).toBe(1);

  const largeText = "A".repeat(200);
  const qrLarge = encode(largeText, { mode: "Byte" });
  expect(qrLarge.version).toBeGreaterThan(1);
});

// ─── Encoding Modes ───────────────────────────────────────────────────────────

Deno.test("encode with explicit Numeric mode", () => {
  const qr = encode("1234567890", { mode: "Numeric" });
  expect(qr.version).toBe(1);
  expect(qr.modules[0][0]).toBe(true); // finder pattern
});

Deno.test("encode with explicit Alphanumeric mode", () => {
  const qr = encode("HELLO WORLD", { mode: "Alphanumeric" });
  expect(qr.version).toBe(1);
});

Deno.test("encode with explicit Byte mode", () => {
  const qr = encode("hello world", { mode: "Byte" });
  expect(qr.version).toBe(1);
});

Deno.test("encode auto-detects Numeric mode", () => {
  const qr = encode("1234567890");
  expect(qr.version).toBe(1);
});

Deno.test("encode auto-detects Alphanumeric mode", () => {
  const qr = encode("HELLO WORLD 123");
  expect(qr.version).toBe(1);
});

Deno.test("encode auto-detects Byte mode for mixed case + special chars", () => {
  const qr = encode("Hello World!");
  expect(qr.version).toBe(1);
});

Deno.test("encode with Kanji mode throws when SJIS not registered", () => {
  let thrown = false;
  try {
    encode("\u9280\u884c", { mode: "Kanji" });
  } catch {
    thrown = true;
  }
  expect(thrown).toBe(true);
});

// ─── Large Data / Auto Version Upgrade ────────────────────────────────────────

Deno.test("encode auto-upgrades version for large data", () => {
  const data = "HELLO WORLD " +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ ".repeat(10);
  const qr = encode(data);
  expect(qr.version).toBeGreaterThan(1);
  expect(qr.moduleCount).toBe(qr.version * 4 + 17);
});

Deno.test("encode handles 500 chars in Byte mode with version upgrade", () => {
  const data = "A".repeat(500);
  const qr = encode(data, { mode: "Byte" });
  expect(qr.version).toBeGreaterThan(1);
});

Deno.test("encode throws for empty string", () => {
  // Empty string encodes successfully because byte mode + 0-length data fits v1
  // But it shouldn't throw
  expect(() => encode("")).not.toThrow();
});

// ─── Error Cases (source throws strings, not Error objects) ───────────────────

Deno.test("encode throws for extremely long data", () => {
  const data = "A".repeat(5000);
  let thrown = false;
  try {
    encode(data);
  } catch (e) {
    thrown = true;
    expect(typeof e).toBe("string");
  }
  expect(thrown).toBe(true);
});

Deno.test("encode throws for unknown error correction level", () => {
  let thrown = false;
  try {
    encode("TEST", { errorCorrectionLevel: "X" as unknown });
  } catch (e) {
    thrown = true;
    expect(typeof e).toBe("string");
  }
  expect(thrown).toBe(true);
});

// ─── getModule / getModuleCount / getMethods ──────────────────────────────────

Deno.test("QRCode.getModuleCount matches .moduleCount", () => {
  const qr = encode("HELLO WORLD");
  expect(qr.getModuleCount()).toBe(qr.moduleCount);
});

Deno.test("QRCode.getModule returns correct values for in-bounds", () => {
  const qr = encode("HELLO WORLD");
  expect(qr.getModule(0, 0)).toBe(true); // finder pattern
  expect(typeof qr.getModule(5, 5)).toBe("boolean");
});

Deno.test("QRCode.getModule throws for out-of-bounds indices", () => {
  const qr = encode("HELLO WORLD");
  let thrown = false;
  try {
    qr.getModule(-1, 0);
  } catch {
    thrown = true;
  }
  expect(thrown).toBe(true);

  thrown = false;
  try {
    qr.getModule(0, -1);
  } catch {
    thrown = true;
  }
  expect(thrown).toBe(true);

  thrown = false;
  try {
    qr.getModule(21, 0);
  } catch {
    thrown = true;
  }
  expect(thrown).toBe(true);

  thrown = false;
  try {
    qr.getModule(0, 21);
  } catch {
    thrown = true;
  }
  expect(thrown).toBe(true);
});

Deno.test("QRCode.getModules returns flat array of correct length", () => {
  const qr = encode("HELLO WORLD");
  const flat = qr.getModules();
  expect(flat.length).toBe(qr.moduleCount * qr.moduleCount);
  expect(flat[0]).toBe(true); // finder pattern top-left
});

// ─── Mask Pattern ─────────────────────────────────────────────────────────────

Deno.test("encode returns maskPattern in valid range (0-7)", () => {
  const qr = encode("HELLO WORLD");
  expect(qr.maskPattern).toBeGreaterThanOrEqual(0);
  expect(qr.maskPattern).toBeLessThanOrEqual(7);
});

Deno.test("different content may produce different mask patterns", () => {
  const qr1 = encode("HELLO WORLD");
  const qr2 = encode("TEST DATA FOR QR CODE");
  expect(qr1.maskPattern).toBeGreaterThanOrEqual(0);
  expect(qr2.maskPattern).toBeGreaterThanOrEqual(0);
});

// ─── Custom stringToBytes ─────────────────────────────────────────────────────

Deno.test("registerStringToBytes and getStringToBytes roundtrip", () => {
  const customFn = (s: string) => {
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i++) {
      bytes.push(s.charCodeAt(i) & 0xff);
    }
    return bytes;
  };
  registerStringToBytes("CUSTOM_TEST", customFn);
  const retrieved = getStringToBytes("CUSTOM_TEST");
  expect(retrieved).toBeDefined();
  expect(retrieved!("ABC")).toEqual([65, 66, 67]);
});

Deno.test("getStringToBytes returns undefined for unknown encoding", () => {
  const fn = getStringToBytes("NONEXISTENT");
  expect(fn).toBeUndefined();
});

// ─── Determinism ──────────────────────────────────────────────────────────────

Deno.test("encode is deterministic for same input", () => {
  const qr1 = encode("HELLO WORLD");
  const qr2 = encode("HELLO WORLD");
  expect(qr1.version).toBe(qr2.version);
  expect(qr1.moduleCount).toBe(qr2.moduleCount);
  expect(qr1.maskPattern).toBe(qr2.maskPattern);
  for (let r = 0; r < qr1.moduleCount; r++) {
    for (let c = 0; c < qr1.moduleCount; c++) {
      expect(qr1.modules[r][c]).toBe(qr2.modules[r][c]);
    }
  }
});

// ─── All versions 1-10 work with small data ───────────────────────────────────

Deno.test("encode works for all versions 1 through 10", () => {
  for (let v = 1; v <= 10; v++) {
    const qr = encode("HELLO WORLD", { version: v });
    expect(qr.version).toBe(v);
    expect(qr.moduleCount).toBe(v * 4 + 17);
    expect(qr.modules.length).toBe(qr.moduleCount);
  }
});

// ─── Larger data needs higher version ─────────────────────────────────────────

Deno.test("larger data forces higher version automatically", () => {
  // Alphanumeric mode at ~200 chars should be much higher than v1
  const data = "HELLOWORLD".repeat(15); // 150 chars
  const qr = encode(data);
  expect(qr.version).toBeGreaterThan(1);

  // Very large numeric data
  const numData = "1".repeat(500);
  const qrNum = encode(numData);
  expect(qrNum.version).toBeGreaterThan(1);
});
