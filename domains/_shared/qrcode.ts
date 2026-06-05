/**
 * QR Code Generator — Pure Functional TypeScript Implementation
 * =============================================================
 *
 * Source: Refactored from `Source.PAPIElement.$QrcodeEngine` in
 *         /Users/siaovon/Documents/Projects/core/serve.js (lines 2809–4974)
 *
 * Original: class-based JavaScript with closure-pattern internal state.
 * This refactor: pure functional TypeScript — no class, no `this`, no mutable
 * external state. All encoding logic preserved: versions 1–40, error correction
 * levels L/M/Q/H, all encoding modes (numeric/alphanumeric/byte/kanji), all 8
 * mask patterns, Reed–Solomon error correction, position/probe/timing/alignment
 * patterns, and format/version info.
 *
 * No runtime dependencies — works in browser, Deno, Node, and any ES2020+ environment.
 *
 * Refactored: 2026-06-05
 * Maintainer: Hermes Agent
 */

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type EncodingMode = 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji';

export interface QROptions {
  /** QR version 1–40. Auto-detected if omitted or < 1. */
  version?: number;
  /** Error correction level: L (low, ~7%), M (medium, ~15%), Q (quartile, ~25%), H (high, ~30%). Default 'M'. */
  errorCorrectionLevel?: ErrorCorrectionLevel;
  /** Explicit encoding mode. Auto-detected from data content if omitted. */
  mode?: EncodingMode;
}

/**
 * Result of encoding a string into a QR Code matrix.
 */
export interface QRCode {
  /** QR version (1–40) that was used. */
  version: number;
  /** Error correction level used. */
  errorCorrectionLevel: ErrorCorrectionLevel;
  /** The mask pattern index (0–7) that was chosen. */
  maskPattern: number;
  /** Total number of modules per side (version × 4 + 17). */
  moduleCount: number;
  /**
   * The QR code matrix. `modules[row][col]` is `true` for dark (black) modules
   * and `false` for light (white) modules.
   */
  modules: boolean[][];
  /**
   * Get the module value at a given row and column.
   * @throws if out of bounds.
   */
  getModule(row: number, col: number): boolean;
  /**
   * Get the total number of modules per side.
   */
  getModuleCount(): number;
  /**
   * Get a flat boolean array of all modules (row-major order).
   * `true` = dark (black), `false` = light (white).
   */
  getModules(): boolean[];
}

// ─── Internal Constants ───────────────────────────────────────────────────────

const PAD0 = 0xec;
const PAD1 = 0x11;

const QRErrorCorrectionLevel: Record<ErrorCorrectionLevel, number> = {
  L: 1,
  M: 0,
  Q: 3,
  H: 2,
};

const QRMode = {
  MODE_NUMBER: 1 << 0,
  MODE_ALPHA_NUM: 1 << 1,
  MODE_8BIT_BYTE: 1 << 2,
  MODE_KANJI: 1 << 3,
} as const;

const QRMaskPattern = {
  PATTERN000: 0,
  PATTERN001: 1,
  PATTERN010: 2,
  PATTERN011: 3,
  PATTERN100: 4,
  PATTERN101: 5,
  PATTERN110: 6,
  PATTERN111: 7,
} as const;

// ─── QRMath: Galois Field GF(256) arithmetic ──────────────────────────────────

const EXP_TABLE = new Array<number>(256);
const LOG_TABLE = new Array<number>(256);

// Precompute exp and log tables.
for (let i = 0; i < 8; i += 1) {
  EXP_TABLE[i] = 1 << i;
}
for (let i = 8; i < 256; i += 1) {
  EXP_TABLE[i] =
    EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i += 1) {
  LOG_TABLE[EXP_TABLE[i]] = i;
}

function glog(n: number): number {
  if (n < 1) throw 'glog(' + n + ')';
  return LOG_TABLE[n];
}

function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP_TABLE[n];
}

// ─── QR Polynomial (Reed–Solomon) ─────────────────────────────────────────────

interface QRPolynomial {
  getAt(index: number): number;
  getLength(): number;
  multiply(e: QRPolynomial): QRPolynomial;
  mod(e: QRPolynomial): QRPolynomial;
}

function qrPolynomial(num: number[], shift: number): QRPolynomial {
  if (typeof num.length === 'undefined') throw num.length + '/' + shift;

  // Strip leading zeros and apply shift.
  let offset = 0;
  while (offset < num.length && num[offset] === 0) offset += 1;
  const _num = new Array<number>(num.length - offset + shift);
  for (let i = 0; i < num.length - offset; i += 1) {
    _num[i] = num[i + offset];
  }

  return {
    getAt(index: number): number {
      return _num[index];
    },
    getLength(): number {
      return _num.length;
    },
    multiply(e: QRPolynomial): QRPolynomial {
      const num = new Array<number>(
        _num.length + e.getLength() - 1,
      );
      for (let i = 0; i < _num.length; i += 1) {
        for (let j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= gexp(glog(_num[i]) + glog(e.getAt(j)));
        }
      }
      return qrPolynomial(num, 0);
    },
    mod(e: QRPolynomial): QRPolynomial {
      if (_num.length - e.getLength() < 0) {
        // Return a copy of this polynomial.
        return qrPolynomial([..._num], 0);
      }
      const ratio = glog(_num[0]) - glog(e.getAt(0));
      const num = [..._num];
      for (let i = 0; i < e.getLength(); i += 1) {
        num[i] ^= gexp(glog(e.getAt(i)) + ratio);
      }
      return qrPolynomial(num, 0).mod(e);
    },
  };
}

// ─── QR Bit Buffer ────────────────────────────────────────────────────────────

interface QRBitBuffer {
  getBuffer(): number[];
  getAt(index: number): boolean;
  put(num: number, length: number): void;
  putBit(bit: boolean): void;
  getLengthInBits(): number;
}

function qrBitBuffer(): QRBitBuffer {
  const _buffer: number[] = [];
  let _length = 0;

  return {
    getBuffer(): number[] {
      return _buffer;
    },
    getAt(index: number): boolean {
      const bufIndex = Math.floor(index / 8);
      return ((_buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
    },
    put(num: number, length: number): void {
      for (let i = 0; i < length; i += 1) {
        this.putBit(((num >>> (length - i - 1)) & 1) === 1);
      }
    },
    getLengthInBits(): number {
      return _length;
    },
    putBit(bit: boolean): void {
      const bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }
      if (bit) {
        _buffer[bufIndex] |= 0x80 >>> _length % 8;
      }
      _length += 1;
    },
  };
}

// ─── QR Util: BCH, Mask Functions, Pattern Positions, etc. ────────────────────

const PATTERN_POSITION_TABLE: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

// G15 = x^10 + x^8 + x^5 + x^4 + x^2 + x^1 + x^0
const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
// G18 = x^12 + x^11 + x^10 + x^9 + x^8 + x^5 + x^2 + x^0
const G18 =
  (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

function getBCHDigit(data: number): number {
  let digit = 0;
  while (data !== 0) {
    digit += 1;
    data >>>= 1;
  }
  return digit;
}

/** Compute BCH code for format info (15 bits). */
function getBCHTypeInfo(data: number): number {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
    d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
  }
  return ((data << 10) | d) ^ G15_MASK;
}

/** Compute BCH code for version info (18 bits). */
function getBCHTypeNumber(data: number): number {
  let d = data << 12;
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
    d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18));
  }
  return (data << 12) | d;
}

/** Get alignment pattern positions for the given version (1-indexed). */
function getPatternPosition(typeNumber: number): number[] {
  return PATTERN_POSITION_TABLE[typeNumber - 1];
}

/**
 * Return a mask function for the given mask pattern (0–7).
 * The function takes (row, col) and returns true if the module should be inverted.
 */
function getMaskFunction(maskPattern: number): (i: number, j: number) => boolean {
  switch (maskPattern) {
    case QRMaskPattern.PATTERN000:
      return (i, j) => (i + j) % 2 === 0;
    case QRMaskPattern.PATTERN001:
      return (i, _j) => i % 2 === 0;
    case QRMaskPattern.PATTERN010:
      return (_i, j) => j % 3 === 0;
    case QRMaskPattern.PATTERN011:
      return (i, j) => (i + j) % 3 === 0;
    case QRMaskPattern.PATTERN100:
      return (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case QRMaskPattern.PATTERN101:
      return (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0;
    case QRMaskPattern.PATTERN110:
      return (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case QRMaskPattern.PATTERN111:
      return (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default:
      throw 'bad maskPattern:' + maskPattern;
  }
}

/**
 * Generate a generator polynomial for Reed–Solomon error correction
 * with the given number of error correction codewords.
 */
function getErrorCorrectPolynomial(errorCorrectLength: number): QRPolynomial {
  let a = qrPolynomial([1], 0);
  for (let i = 0; i < errorCorrectLength; i += 1) {
    a = a.multiply(qrPolynomial([1, gexp(i)], 0));
  }
  return a;
}

/** Get the number of bits used for the character count for a given mode and version. */
function getLengthInBits(mode: number, type: number): number {
  if (1 <= type && type < 10) {
    switch (mode) {
      case QRMode.MODE_NUMBER:
        return 10;
      case QRMode.MODE_ALPHA_NUM:
        return 9;
      case QRMode.MODE_8BIT_BYTE:
        return 8;
      case QRMode.MODE_KANJI:
        return 8;
      default:
        throw 'mode:' + mode;
    }
  } else if (type < 27) {
    switch (mode) {
      case QRMode.MODE_NUMBER:
        return 12;
      case QRMode.MODE_ALPHA_NUM:
        return 11;
      case QRMode.MODE_8BIT_BYTE:
        return 16;
      case QRMode.MODE_KANJI:
        return 10;
      default:
        throw 'mode:' + mode;
    }
  } else if (type < 41) {
    switch (mode) {
      case QRMode.MODE_NUMBER:
        return 14;
      case QRMode.MODE_ALPHA_NUM:
        return 13;
      case QRMode.MODE_8BIT_BYTE:
        return 16;
      case QRMode.MODE_KANJI:
        return 12;
      default:
        throw 'mode:' + mode;
    }
  } else {
    throw 'type:' + type;
  }
}

/**
 * Compute the penalty (lost point) score for a QR code matrix.
 * Lower is better. Used to select the best mask pattern.
 */
function getLostPoint(modules: boolean[][], moduleCount: number): number {
  let lostPoint = 0;

  // LEVEL1: Adjacent modules in row/column in same color
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      let sameCount = 0;
      const dark = modules[row][col];

      for (let r = -1; r <= 1; r += 1) {
        if (row + r < 0 || moduleCount <= row + r) continue;
        for (let c = -1; c <= 1; c += 1) {
          if (col + c < 0 || moduleCount <= col + c) continue;
          if (r === 0 && c === 0) continue;
          if (dark === modules[row + r][col + c]) {
            sameCount += 1;
          }
        }
      }

      if (sameCount > 5) {
        lostPoint += 3 + sameCount - 5;
      }
    }
  }

  // LEVEL2: 2×2 blocks of same color
  for (let row = 0; row < moduleCount - 1; row += 1) {
    for (let col = 0; col < moduleCount - 1; col += 1) {
      let count = 0;
      if (modules[row][col]) count += 1;
      if (modules[row + 1][col]) count += 1;
      if (modules[row][col + 1]) count += 1;
      if (modules[row + 1][col + 1]) count += 1;
      if (count === 0 || count === 4) {
        lostPoint += 3;
      }
    }
  }

  // LEVEL3: Pattern 1011101 (or 00001011101) in rows and columns
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount - 6; col += 1) {
      if (
        modules[row][col] &&
        !modules[row][col + 1] &&
        modules[row][col + 2] &&
        modules[row][col + 3] &&
        modules[row][col + 4] &&
        !modules[row][col + 5] &&
        modules[row][col + 6]
      ) {
        lostPoint += 40;
      }
    }
  }
  for (let col = 0; col < moduleCount; col += 1) {
    for (let row = 0; row < moduleCount - 6; row += 1) {
      if (
        modules[row][col] &&
        !modules[row + 1][col] &&
        modules[row + 2][col] &&
        modules[row + 3][col] &&
        modules[row + 4][col] &&
        !modules[row + 5][col] &&
        modules[row + 6][col]
      ) {
        lostPoint += 40;
      }
    }
  }

  // LEVEL4: Proportion of dark modules
  let darkCount = 0;
  for (let col = 0; col < moduleCount; col += 1) {
    for (let row = 0; row < moduleCount; row += 1) {
      if (modules[row][col]) {
        darkCount += 1;
      }
    }
  }
  const ratio = Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
  lostPoint += ratio * 10;

  return lostPoint;
}

// ─── QR RS Block ──────────────────────────────────────────────────────────────

interface RSBlock {
  totalCount: number;
  dataCount: number;
}

/**
 * RS_BLOCK_TABLE: 2D array indexed as `[version-1][eccIndex]`.
 * Each entry is a flat array of [count, totalCount, dataCount, ...] triples
 * for one or more groups within a version × ECC level combination.
 *
 * ECC index order: L=0, M=1, Q=2, H=3.
 * Map from numeric ECC value (L=1, M=0, Q=3, H=2) to index.
 */
const ECC_NUM_TO_INDEX: Record<number, number> = { 1: 0, 0: 1, 3: 2, 2: 3 };

const RS_BLOCK_ENTRIES: number[][] = [
  // ── Version 1 ──
  /* L */ [1, 26, 19],
  /* M */ [1, 26, 16],
  /* Q */ [1, 26, 13],
  /* H */ [1, 26, 9],
  // ── Version 2 ──
  /* L */ [1, 44, 34],
  /* M */ [1, 44, 28],
  /* Q */ [1, 44, 22],
  /* H */ [1, 44, 16],
  // ── Version 3 ──
  /* L */ [1, 70, 55],
  /* M */ [1, 70, 44],
  /* Q */ [2, 35, 17],
  /* H */ [2, 35, 13],
  // ── Version 4 ──
  /* L */ [1, 100, 80],
  /* M */ [2, 50, 32],
  /* Q */ [2, 50, 24],
  /* H */ [4, 25, 9],
  // ── Version 5 ──
  /* L */ [1, 134, 108],
  /* M */ [2, 67, 43],
  /* Q */ [2, 33, 15, 2, 34, 16],
  /* H */ [2, 33, 11, 2, 34, 12],
  // ── Version 6 ──
  /* L */ [2, 86, 68],
  /* M */ [4, 43, 27],
  /* Q */ [4, 43, 19],
  /* H */ [4, 43, 15],
  // ── Version 7 ──
  /* L */ [2, 98, 78],
  /* M */ [4, 49, 31],
  /* Q */ [2, 32, 14, 4, 33, 15],
  /* H */ [4, 39, 13, 1, 40, 14],
  // ── Version 8 ──
  /* L */ [2, 121, 97],
  /* M */ [2, 60, 38, 2, 61, 39],
  /* Q */ [4, 40, 18, 2, 41, 19],
  /* H */ [4, 40, 14, 2, 41, 15],
  // ── Version 9 ──
  /* L */ [2, 146, 116],
  /* M */ [3, 58, 36, 2, 59, 37],
  /* Q */ [4, 36, 16, 4, 37, 17],
  /* H */ [4, 36, 12, 4, 37, 13],
  // ── Version 10 ──
  /* L */ [2, 86, 68, 2, 87, 69],
  /* M */ [4, 69, 43, 1, 70, 44],
  /* Q */ [6, 43, 19, 2, 44, 20],
  /* H */ [6, 43, 15, 2, 44, 16],
  // ── Version 11 ──
  /* L */ [4, 101, 81],
  /* M */ [1, 80, 50, 4, 81, 51],
  /* Q */ [4, 50, 22, 4, 51, 23],
  /* H */ [3, 36, 12, 8, 37, 13],
  // ── Version 12 ──
  /* L */ [2, 116, 92, 2, 117, 93],
  /* M */ [6, 58, 36, 2, 59, 37],
  /* Q */ [4, 46, 20, 6, 47, 21],
  /* H */ [7, 42, 14, 4, 43, 15],
  // ── Version 13 ──
  /* L */ [4, 133, 107],
  /* M */ [8, 59, 37, 1, 60, 38],
  /* Q */ [8, 44, 20, 4, 45, 21],
  /* H */ [12, 33, 11, 4, 34, 12],
  // ── Version 14 ──
  /* L */ [3, 145, 115, 1, 146, 116],
  /* M */ [4, 64, 40, 5, 65, 41],
  /* Q */ [11, 36, 16, 5, 37, 17],
  /* H */ [11, 36, 12, 5, 37, 13],
  // ── Version 15 ──
  /* L */ [5, 109, 87, 1, 110, 88],
  /* M */ [5, 65, 41, 5, 66, 42],
  /* Q */ [5, 54, 24, 7, 55, 25],
  /* H */ [11, 36, 12, 7, 37, 13],
  // ── Version 16 ──
  /* L */ [5, 122, 98, 1, 123, 99],
  /* M */ [7, 73, 45, 3, 74, 46],
  /* Q */ [15, 43, 19, 2, 44, 20],
  /* H */ [3, 45, 15, 13, 46, 16],
  // ── Version 17 ──
  /* L */ [1, 135, 107, 5, 136, 108],
  /* M */ [10, 74, 46, 1, 75, 47],
  /* Q */ [1, 50, 22, 15, 51, 23],
  /* H */ [2, 42, 14, 17, 43, 15],
  // ── Version 18 ──
  /* L */ [5, 150, 120, 1, 151, 121],
  /* M */ [9, 69, 43, 4, 70, 44],
  /* Q */ [17, 50, 22, 1, 51, 23],
  /* H */ [2, 42, 14, 19, 43, 15],
  // ── Version 19 ──
  /* L */ [3, 141, 113, 4, 142, 114],
  /* M */ [3, 70, 44, 11, 71, 45],
  /* Q */ [17, 47, 21, 4, 48, 22],
  /* H */ [9, 39, 13, 16, 40, 14],
  // ── Version 20 ──
  /* L */ [3, 135, 107, 5, 136, 108],
  /* M */ [3, 67, 41, 13, 68, 42],
  /* Q */ [15, 54, 24, 5, 55, 25],
  /* H */ [15, 43, 15, 10, 44, 16],
  // ── Version 21 ──
  /* L */ [4, 144, 116, 4, 145, 117],
  /* M */ [17, 68, 42],
  /* Q */ [17, 50, 22, 6, 51, 23],
  /* H */ [19, 46, 16, 6, 47, 17],
  // ── Version 22 ──
  /* L */ [2, 139, 111, 7, 140, 112],
  /* M */ [17, 74, 46],
  /* Q */ [7, 54, 24, 16, 55, 25],
  /* H */ [34, 37, 13],
  // ── Version 23 ──
  /* L */ [4, 151, 121, 5, 152, 122],
  /* M */ [4, 75, 47, 14, 76, 48],
  /* Q */ [11, 54, 24, 14, 55, 25],
  /* H */ [16, 45, 15, 14, 46, 16],
  // ── Version 24 ──
  /* L */ [6, 147, 117, 4, 148, 118],
  /* M */ [6, 73, 45, 14, 74, 46],
  /* Q */ [11, 54, 24, 16, 55, 25],
  /* H */ [30, 46, 16, 2, 47, 17],
  // ── Version 25 ──
  /* L */ [8, 132, 106, 4, 133, 107],
  /* M */ [8, 75, 47, 13, 76, 48],
  /* Q */ [7, 54, 24, 22, 55, 25],
  /* H */ [22, 45, 15, 13, 46, 16],
  // ── Version 26 ──
  /* L */ [10, 142, 114, 2, 143, 115],
  /* M */ [19, 74, 46, 4, 75, 47],
  /* Q */ [28, 50, 22, 6, 51, 23],
  /* H */ [33, 46, 16, 4, 47, 17],
  // ── Version 27 ──
  /* L */ [8, 152, 122, 4, 153, 123],
  /* M */ [22, 73, 45, 3, 74, 46],
  /* Q */ [8, 53, 23, 26, 54, 24],
  /* H */ [12, 45, 15, 28, 46, 16],
  // ── Version 28 ──
  /* L */ [3, 147, 117, 10, 148, 118],
  /* M */ [3, 73, 45, 23, 74, 46],
  /* Q */ [4, 54, 24, 31, 55, 25],
  /* H */ [11, 45, 15, 31, 46, 16],
  // ── Version 29 ──
  /* L */ [7, 146, 116, 7, 147, 117],
  /* M */ [21, 73, 45, 7, 74, 46],
  /* Q */ [1, 53, 23, 37, 54, 24],
  /* H */ [19, 45, 15, 26, 46, 16],
  // ── Version 30 ──
  /* L */ [5, 145, 115, 10, 146, 116],
  /* M */ [19, 75, 47, 10, 76, 48],
  /* Q */ [15, 54, 24, 25, 55, 25],
  /* H */ [23, 45, 15, 25, 46, 16],
  // ── Version 31 ──
  /* L */ [13, 145, 115, 3, 146, 116],
  /* M */ [2, 74, 46, 29, 75, 47],
  /* Q */ [42, 54, 24, 1, 55, 25],
  /* H */ [23, 45, 15, 28, 46, 16],
  // ── Version 32 ──
  /* L */ [17, 145, 115],
  /* M */ [10, 74, 46, 23, 75, 47],
  /* Q */ [10, 54, 24, 35, 55, 25],
  /* H */ [19, 45, 15, 35, 46, 16],
  // ── Version 33 ──
  /* L */ [17, 145, 115, 1, 146, 116],
  /* M */ [14, 74, 46, 21, 75, 47],
  /* Q */ [29, 54, 24, 19, 55, 25],
  /* H */ [11, 45, 15, 46, 46, 16],
  // ── Version 34 ──
  /* L */ [13, 145, 115, 6, 146, 116],
  /* M */ [14, 74, 46, 23, 75, 47],
  /* Q */ [44, 54, 24, 7, 55, 25],
  /* H */ [59, 46, 16, 1, 47, 17],
  // ── Version 35 ──
  /* L */ [12, 151, 121, 7, 152, 122],
  /* M */ [12, 75, 47, 26, 76, 48],
  /* Q */ [39, 54, 24, 14, 55, 25],
  /* H */ [22, 45, 15, 41, 46, 16],
  // ── Version 36 ──
  /* L */ [6, 151, 121, 14, 152, 122],
  /* M */ [6, 75, 47, 34, 76, 48],
  /* Q */ [46, 54, 24, 10, 55, 25],
  /* H */ [2, 45, 15, 64, 46, 16],
  // ── Version 37 ──
  /* L */ [17, 152, 122, 4, 153, 123],
  /* M */ [29, 74, 46, 14, 75, 47],
  /* Q */ [49, 54, 24, 10, 55, 25],
  /* H */ [24, 45, 15, 46, 46, 16],
  // ── Version 38 ──
  /* L */ [4, 152, 122, 18, 153, 123],
  /* M */ [13, 74, 46, 32, 75, 47],
  /* Q */ [48, 54, 24, 14, 55, 25],
  /* H */ [42, 45, 15, 32, 46, 16],
  // ── Version 39 ──
  /* L */ [20, 147, 117, 4, 148, 118],
  /* M */ [40, 75, 47, 7, 76, 48],
  /* Q */ [43, 54, 24, 22, 55, 25],
  /* H */ [10, 45, 15, 67, 46, 16],
  // ── Version 40 ──
  /* L */ [19, 148, 118, 6, 149, 119],
  /* M */ [18, 75, 47, 31, 76, 48],
  /* Q */ [34, 54, 24, 34, 55, 25],
  /* H */ [20, 45, 15, 61, 46, 16],
];

/**
 * Parse a RS_BLOCK_ENTRIES entry (array of numbers) into a list of RSBlock objects.
 * Entry format: [count1, total1, data1, count2, total2, data2, ...]
 */
function parseRSBlockEntry(entry: number[]): RSBlock[] {
  const list: RSBlock[] = [];
  const len = entry.length / 3;
  for (let i = 0; i < len; i += 1) {
    const count = entry[i * 3 + 0];
    const totalCount = entry[i * 3 + 1];
    const dataCount = entry[i * 3 + 2];
    for (let j = 0; j < count; j += 1) {
      list.push({ totalCount, dataCount });
    }
  }
  return list;
}

/** Get the RS blocks for a given version (1–40) and numeric ECC level. */
function getRSBlocks(typeNumber: number, errorCorrectionLevel: number): RSBlock[] {
  const vIdx = typeNumber - 1;
  const eIdx = ECC_NUM_TO_INDEX[errorCorrectionLevel];
  if (eIdx === undefined) throw 'bad errorCorrectionLevel:' + errorCorrectionLevel;
  const entry = RS_BLOCK_ENTRIES[vIdx * 4 + eIdx];
  if (!entry) throw 'bad rs block @ typeNumber:' + typeNumber + '/errorCorrectionLevel:' + errorCorrectionLevel;
  return parseRSBlockEntry(entry);
}

// ─── Data Encoders ────────────────────────────────────────────────────────────

interface QRData {
  getMode(): number;
  getLength(): number;
  write(buffer: QRBitBuffer): void;
}

/** Convert a digit string to a number. */
function strToNum(s: string): number {
  let num = 0;
  for (let i = 0; i < s.length; i += 1) {
    num = num * 10 + charToNum(s.charAt(i));
  }
  return num;
}

function charToNum(c: string): number {
  if ('0' <= c && c <= '9') {
    return c.charCodeAt(0) - '0'.charCodeAt(0);
  }
  throw 'illegal char :' + c;
}

/** Numeric mode encoder. */
function qrNumber(data: string): QRData {
  const _mode = QRMode.MODE_NUMBER;
  const _data = data;
  return {
    getMode(): number {
      return _mode;
    },
    getLength(): number {
      return _data.length;
    },
    write(buffer: QRBitBuffer): void {
      let i = 0;
      while (i + 2 < _data.length) {
        buffer.put(strToNum(_data.substring(i, i + 3)), 10);
        i += 3;
      }
      if (i < _data.length) {
        if (_data.length - i === 1) {
          buffer.put(strToNum(_data.substring(i, i + 1)), 4);
        } else if (_data.length - i === 2) {
          buffer.put(strToNum(_data.substring(i, i + 2)), 7);
        }
      }
    },
  };
}

/** Alphanumeric mode encoder. */
function qrAlphaNum(data: string): QRData {
  const _mode = QRMode.MODE_ALPHA_NUM;
  const _data = data;

  function getCode(c: string): number {
    if ('0' <= c && c <= '9') {
      return c.charCodeAt(0) - '0'.charCodeAt(0);
    } else if ('A' <= c && c <= 'Z') {
      return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
    } else {
      switch (c) {
        case ' ':
          return 36;
        case '$':
          return 37;
        case '%':
          return 38;
        case '*':
          return 39;
        case '+':
          return 40;
        case '-':
          return 41;
        case '.':
          return 42;
        case '/':
          return 43;
        case ':':
          return 44;
        default:
          throw 'illegal char :' + c;
      }
    }
  }

  return {
    getMode(): number {
      return _mode;
    },
    getLength(): number {
      return _data.length;
    },
    write(buffer: QRBitBuffer): void {
      let i = 0;
      while (i + 1 < _data.length) {
        buffer.put(getCode(_data.charAt(i)) * 45 + getCode(_data.charAt(i + 1)), 11);
        i += 2;
      }
      if (i < _data.length) {
        buffer.put(getCode(_data.charAt(i)), 6);
      }
    },
  };
}

/** 8-bit byte mode encoder (UTF-8). */
function qr8BitByte(data: string): QRData {
  const _mode = QRMode.MODE_8BIT_BYTE;
  const _bytes = stringToBytesUTF8(data);
  return {
    getMode(): number {
      return _mode;
    },
    getLength(): number {
      return _bytes.length;
    },
    write(buffer: QRBitBuffer): void {
      for (let i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    },
  };
}

/** Kanji mode encoder (Shift-JIS via SJIS). */
function qrKanji(data: string): QRData {
  const _mode = QRMode.MODE_KANJI;
  const stringToBytes = stringToBytesFuncs['SJIS'];
  if (!stringToBytes) {
    throw 'sjis not supported.';
  }
  // Self-test for SJIS support.
  const test = stringToBytes('\u53cb');
  if (test.length !== 2 || ((test[0] << 8) | test[1]) !== 0x9746) {
    throw 'sjis not supported.';
  }
  const _bytes = stringToBytes(data);
  return {
    getMode(): number {
      return _mode;
    },
    getLength(): number {
      return ~~(_bytes.length / 2);
    },
    write(buffer: QRBitBuffer): void {
      let i = 0;
      while (i + 1 < _bytes.length) {
        let c = ((0xff & _bytes[i]) << 8) | (0xff & _bytes[i + 1]);
        if (0x8140 <= c && c <= 0x9ffc) {
          c -= 0x8140;
        } else if (0xe040 <= c && c <= 0xebbf) {
          c -= 0xc140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }
        c = ((c >>> 8) & 0xff) * 0xc0 + (c & 0xff);
        buffer.put(c, 13);
        i += 2;
      }
      if (i < _bytes.length) {
        throw 'illegal char at ' + (i + 1);
      }
    },
  };
}

// ─── String to Bytes Functions ───────────────────────────────────────────────

function toUTF8Array(str: string): number[] {
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) {
      utf8.push(charcode);
    } else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f),
      );
    } else {
      // surrogate pair
      i++;
      charcode =
        0x10000 +
        (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f),
      );
    }
  }
  return utf8;
}

function stringToBytesUTF8(s: string): number[] {
  return toUTF8Array(s);
}

function stringToBytesDefault(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    bytes.push(c & 0xff);
  }
  return bytes;
}

interface StringToBytesMap {
  [key: string]: (s: string) => number[];
}

const stringToBytesFuncs: StringToBytesMap = {
  'UTF-8': stringToBytesUTF8,
  default: stringToBytesDefault,
};



// ─── Core Data Creation ───────────────────────────────────────────────────────

/**
 * Create the interleaved data + error correction codewords.
 */
function createBytes(buffer: QRBitBuffer, rsBlocks: RSBlock[]): number[] {
  let offset = 0;
  let maxDcCount = 0;
  let maxEcCount = 0;

  const dcdata: number[][] = new Array(rsBlocks.length);
  const ecdata: number[][] = new Array(rsBlocks.length);

  for (let r = 0; r < rsBlocks.length; r += 1) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;

    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);

    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i += 1) {
      dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
    }
    offset += dcCount;

    const rsPoly = getErrorCorrectPolynomial(ecCount);
    const rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);

    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i += 1) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
    }
  }

  let totalCodeCount = 0;
  for (let i = 0; i < rsBlocks.length; i += 1) {
    totalCodeCount += rsBlocks[i].totalCount;
  }

  const data = new Array(totalCodeCount);
  let index = 0;

  // Interleave data codewords
  for (let i = 0; i < maxDcCount; i += 1) {
    for (let r = 0; r < rsBlocks.length; r += 1) {
      if (i < dcdata[r].length) {
        data[index] = dcdata[r][i];
        index += 1;
      }
    }
  }

  // Interleave error correction codewords
  for (let i = 0; i < maxEcCount; i += 1) {
    for (let r = 0; r < rsBlocks.length; r += 1) {
      if (i < ecdata[r].length) {
        data[index] = ecdata[r][i];
        index += 1;
      }
    }
  }

  return data;
}

/**
 * Create the full encoded data stream with padding.
 */
function createData(
  typeNumber: number,
  errorCorrectionLevel: number,
  dataList: QRData[],
): number[] {
  const rsBlocks = getRSBlocks(typeNumber, errorCorrectionLevel);
  const buffer = qrBitBuffer();

  for (let i = 0; i < dataList.length; i += 1) {
    const data = dataList[i];
    buffer.put(data.getMode(), 4);
    buffer.put(data.getLength(), getLengthInBits(data.getMode(), typeNumber));
    data.write(buffer);
  }

  let totalDataCount = 0;
  for (let i = 0; i < rsBlocks.length; i += 1) {
    totalDataCount += rsBlocks[i].dataCount;
  }

  if (buffer.getLengthInBits() > totalDataCount * 8) {
    throw (
      'code length overflow. (' +
      buffer.getLengthInBits() +
      '>' +
      totalDataCount * 8 +
      ')'
    );
  }

  // Terminator
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
    buffer.put(0, 4);
  }

  // Pad to byte boundary
  while (buffer.getLengthInBits() % 8 !== 0) {
    buffer.putBit(false);
  }

  // Pad with alternating bytes
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(PAD0, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(PAD1, 8);
  }

  return createBytes(buffer, rsBlocks);
}

// ─── Matrix Construction Functions ────────────────────────────────────────────

/**
 * Create an empty module matrix (all null) of the given size.
 */
function createModuleMatrix(moduleCount: number): (boolean | null)[][] {
  const modules: (boolean | null)[][] = new Array(moduleCount);
  for (let row = 0; row < moduleCount; row += 1) {
    modules[row] = new Array(moduleCount);
    for (let col = 0; col < moduleCount; col += 1) {
      modules[row][col] = null;
    }
  }
  return modules;
}

/**
 * Setup the position probe pattern (finder pattern) at the given top-left corner.
 */
function setupPositionProbePattern(
  modules: (boolean | null)[][],
  moduleCount: number,
  row: number,
  col: number,
): void {
  for (let r = -1; r <= 7; r += 1) {
    if (row + r <= -1 || moduleCount <= row + r) continue;
    for (let c = -1; c <= 7; c += 1) {
      if (col + c <= -1 || moduleCount <= col + c) continue;
      if (
        (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
        (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
        (2 <= r && r <= 4 && 2 <= c && c <= 4)
      ) {
        modules[row + r][col + c] = true;
      } else {
        modules[row + r][col + c] = false;
      }
    }
  }
}

/**
 * Setup the timing pattern (alternating dark/light modules).
 */
function setupTimingPattern(
  modules: (boolean | null)[][],
  moduleCount: number,
): void {
  for (let r = 8; r < moduleCount - 8; r += 1) {
    if (modules[r][6] != null) continue;
    modules[r][6] = r % 2 === 0;
  }
  for (let c = 8; c < moduleCount - 8; c += 1) {
    if (modules[6][c] != null) continue;
    modules[6][c] = c % 2 === 0;
  }
}

/**
 * Setup the alignment patterns for the given version.
 */
function setupPositionAdjustPattern(
  modules: (boolean | null)[][],
  moduleCount: number,
  typeNumber: number,
): void {
  const pos = getPatternPosition(typeNumber);
  for (let i = 0; i < pos.length; i += 1) {
    for (let j = 0; j < pos.length; j += 1) {
      const row = pos[i];
      const col = pos[j];
      if (modules[row][col] != null) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          if (
            r === -2 ||
            r === 2 ||
            c === -2 ||
            c === 2 ||
            (r === 0 && c === 0)
          ) {
            modules[row + r][col + c] = true;
          } else {
            modules[row + r][col + c] = false;
          }
        }
      }
    }
  }
}

/**
 * Setup the version info (type number) for versions >= 7.
 */
function setupTypeNumber(
  modules: (boolean | null)[][],
  moduleCount: number,
  typeNumber: number,
  test: boolean,
): void {
  const bits = getBCHTypeNumber(typeNumber);
  for (let i = 0; i < 18; i += 1) {
    const mod = !test && ((bits >> i) & 1) === 1;
    modules[Math.floor(i / 3)][(i % 3) + moduleCount - 8 - 3] = mod;
  }
  for (let i = 0; i < 18; i += 1) {
    const mod = !test && ((bits >> i) & 1) === 1;
    modules[(i % 3) + moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
  }
}

/**
 * Setup the format info (type info) near the finder patterns.
 */
function setupTypeInfo(
  modules: (boolean | null)[][],
  moduleCount: number,
  errorCorrectionLevel: number,
  maskPattern: number,
  test: boolean,
): void {
  const data = (errorCorrectionLevel << 3) | maskPattern;
  const bits = getBCHTypeInfo(data);
  for (let i = 0; i < 15; i += 1) {
    const mod = !test && ((bits >> i) & 1) === 1;
    if (i < 6) {
      modules[i][8] = mod;
    } else if (i < 8) {
      modules[i + 1][8] = mod;
    } else {
      modules[moduleCount - 15 + i][8] = mod;
    }
  }
  for (let i = 0; i < 15; i += 1) {
    const mod = !test && ((bits >> i) & 1) === 1;
    if (i < 8) {
      modules[8][moduleCount - i - 1] = mod;
    } else if (i < 9) {
      modules[8][15 - i - 1 + 1] = mod;
    } else {
      modules[8][15 - i - 1] = mod;
    }
  }
  modules[moduleCount - 8][8] = !test;
}

/**
 * Map the encoded data bytes onto the QR code matrix, applying the mask.
 */
function mapData(
  modules: (boolean | null)[][],
  moduleCount: number,
  data: number[],
  maskPattern: number,
): void {
  let inc = -1;
  let row = moduleCount - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  const maskFunc = getMaskFunction(maskPattern);

  for (let col = moduleCount - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    while (true) {
      for (let c = 0; c < 2; c += 1) {
        if (modules[row][col - c] == null) {
          let dark = false;
          if (byteIndex < data.length) {
            dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
          }
          if (maskFunc(row, col - c)) {
            dark = !dark;
          }
          modules[row][col - c] = dark;
          bitIndex -= 1;
          if (bitIndex === -1) {
            byteIndex += 1;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || moduleCount <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
}

/**
 * Convert the (boolean | null) matrix to a final boolean[][] matrix.
 * Null values are set to false (light).
 */
function finalizeModules(
  modules: (boolean | null)[][],
  moduleCount: number,
): boolean[][] {
  const result: boolean[][] = new Array(moduleCount);
  for (let row = 0; row < moduleCount; row += 1) {
    result[row] = new Array(moduleCount);
    for (let col = 0; col < moduleCount; col += 1) {
      result[row][col] = modules[row][col] === true;
    }
  }
  return result;
}

/**
 * Build the full QR code matrix for the given parameters.
 * Returns the module matrix (null values allowed during construction).
 */
function makeImpl(
  typeNumber: number,
  errorCorrectionLevel: number,
  dataCache: number[],
  dataList: QRData[],
  test: boolean,
  maskPattern: number,
): boolean[][] {
  const moduleCount = typeNumber * 4 + 17;
  const modules = createModuleMatrix(moduleCount);

  // Position probe patterns (finder patterns)
  setupPositionProbePattern(modules, moduleCount, 0, 0);
  setupPositionProbePattern(modules, moduleCount, moduleCount - 7, 0);
  setupPositionProbePattern(modules, moduleCount, 0, moduleCount - 7);

  // Alignment patterns
  setupPositionAdjustPattern(modules, moduleCount, typeNumber);

  // Timing patterns
  setupTimingPattern(modules, moduleCount);

  // Format info
  setupTypeInfo(modules, moduleCount, errorCorrectionLevel, maskPattern, test);

  // Version info (for versions >= 7)
  if (typeNumber >= 7) {
    setupTypeNumber(modules, moduleCount, typeNumber, test);
  }

  // Map data
  const data = dataCache.length > 0 ? dataCache : createData(typeNumber, errorCorrectionLevel, dataList);
  mapData(modules, moduleCount, data, maskPattern);

  return finalizeModules(modules, moduleCount);
}

/**
 * Try all 8 mask patterns and return the index of the best one (lowest penalty).
 */
function getBestMaskPattern(
  typeNumber: number,
  errorCorrectionLevel: number,
  dataList: QRData[],
  dataCache: number[],
): number {
  let minLostPoint = Infinity;
  let pattern = 0;

  for (let i = 0; i < 8; i += 1) {
    const modules = makeImpl(typeNumber, errorCorrectionLevel, dataCache, dataList, true, i);
    const moduleCount = typeNumber * 4 + 17;
    const lostPoint = getLostPoint(modules, moduleCount);
    if (i === 0 || minLostPoint > lostPoint) {
      minLostPoint = lostPoint;
      pattern = i;
    }
  }

  return pattern;
}

// ─── Mode Detection ───────────────────────────────────────────────────────────

/**
 * Detect the best encoding mode for the given data string.
 */
function detectMode(data: string): EncodingMode {
  // If all characters are digits (0-9), use Numeric mode.
  if (/^[0-9]+$/.test(data)) return 'Numeric';
  // If all characters are alphanumeric (0-9, A-Z, space, $%*+-./:), use Alphanumeric mode.
  if (/^[0-9A-Z $%*+\-./:]+$/.test(data)) return 'Alphanumeric';
  // Default to Byte mode.
  return 'Byte';
}

/**
 * Create the appropriate QRData encoder for the given data and mode.
 */
function createQRData(data: string, mode: EncodingMode): QRData {
  switch (mode) {
    case 'Numeric':
      return qrNumber(data);
    case 'Alphanumeric':
      return qrAlphaNum(data);
    case 'Byte':
      return qr8BitByte(data);
    case 'Kanji':
      return qrKanji(data);
    default:
      throw 'mode:' + mode;
  }
}

/**
 * Auto-detect the minimum version that can hold the given data.
 */
function autodetectTypeNumber(
  dataList: QRData[],
  errorCorrectionLevel: number,
): number {
  for (let typeNumber = 1; typeNumber < 40; typeNumber += 1) {
    const rsBlocks = getRSBlocks(typeNumber, errorCorrectionLevel);
    const buffer = qrBitBuffer();

    for (let i = 0; i < dataList.length; i += 1) {
      const data = dataList[i];
      buffer.put(data.getMode(), 4);
      buffer.put(data.getLength(), getLengthInBits(data.getMode(), typeNumber));
      data.write(buffer);
    }

    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i += 1) {
      totalDataCount += rsBlocks[i].dataCount;
    }

    if (buffer.getLengthInBits() <= totalDataCount * 8) {
      return typeNumber;
    }
  }

  throw 'Data too long for any QR version (max 40).';
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: QROptions = {
  errorCorrectionLevel: 'M',
};

/**
 * Encode a string into a QR Code.
 *
 * @param data - The string to encode.
 * @param options - Optional parameters (version, errorCorrectionLevel, mode).
 * @returns A QRCode object containing the module matrix.
 *
 * @example
 * ```typescript
 * const qr = encode('Hello, World!');
 * console.log(qr.getModuleCount()); // 21 (version 1)
 * console.log(qr.getModule(0, 0)); // true (dark)
 * ```
 */
export function encode(data: string, options?: QROptions): QRCode {
  const opts: QROptions = { ...DEFAULT_OPTIONS, ...options };

  // Resolve the error correction level.
  const ecLevel = opts.errorCorrectionLevel ?? 'M';
  const ecLevelNum = QRErrorCorrectionLevel[ecLevel];
  if (ecLevelNum === undefined) {
    throw 'Unknown error correction level: ' + ecLevel;
  }

  // Detect mode if not specified.
  const mode = opts.mode ?? detectMode(data);

  // Create the data encoder.
  const qrData = createQRData(data, mode);
  const dataList = [qrData];

  // Determine version.
  let typeNumber = opts.version ?? 0;
  if (typeNumber < 1) {
    typeNumber = autodetectTypeNumber(dataList, ecLevelNum);
  }

  // Build data cache.
  const dataCache = createData(typeNumber, ecLevelNum, dataList);

  // Find the best mask pattern.
  const maskPattern = getBestMaskPattern(typeNumber, ecLevelNum, dataList, dataCache);

  // Build the final matrix.
  const modules = makeImpl(typeNumber, ecLevelNum, dataCache, dataList, false, maskPattern);
  const moduleCount = typeNumber * 4 + 17;

  // Create the result object.
  const result: QRCode = {
    version: typeNumber,
    errorCorrectionLevel: ecLevel,
    maskPattern,
    moduleCount,
    modules,
    getModule(row: number, col: number): boolean {
      if (row < 0 || moduleCount <= row || col < 0 || moduleCount <= col) {
        throw row + ',' + col;
      }
      return modules[row][col];
    },
    getModuleCount(): number {
      return moduleCount;
    },
    getModules(): boolean[] {
      const flat: boolean[] = new Array(moduleCount * moduleCount);
      for (let row = 0; row < moduleCount; row += 1) {
        for (let col = 0; col < moduleCount; col += 1) {
          flat[row * moduleCount + col] = modules[row][col];
        }
      }
      return flat;
    },
  };

  return result;
}

/**
 * Convenience function: encode a string into a QR code and return the module
 * matrix directly.
 *
 * @deprecated Use `encode()` instead and access `.modules`.
 */
export function encodeMatrix(data: string, options?: QROptions): boolean[][] {
  return encode(data, options).modules;
}

/**
 * Register a custom string-to-bytes function for a named encoding.
 * Used primarily for Kanji/SJIS support.
 */
export function registerStringToBytes(
  name: string,
  fn: (s: string) => number[],
): void {
  stringToBytesFuncs[name] = fn;
}

/**
 * Get the registered string-to-bytes function for a named encoding.
 */
export function getStringToBytes(name: string): ((s: string) => number[]) | undefined {
  return stringToBytesFuncs[name];
}

/**
 * Create a string-to-bytes function from a base64-encoded unicode mapping table.
 * Used for SJIS support in Kanji mode.
 *
 * @param unicodeData - Base64 encoded byte array of [16bit Unicode, 16bit Bytes] pairs.
 * @param numChars - Expected number of character mappings.
 * @returns A function that converts a JS string to a byte array.
 */
export function createStringToBytes(
  unicodeData: string,
  numChars: number,
): (s: string) => number[] {
  // Base64 decoder.
  function base64DecodeInputStream(str: string): { read: () => number } {
    let _pos = 0;
    let _buffer = 0;
    let _buflen = 0;

    function decode(c: number): number {
      if (0x41 <= c && c <= 0x5a) return c - 0x41;
      if (0x61 <= c && c <= 0x7a) return c - 0x61 + 26;
      if (0x30 <= c && c <= 0x39) return c - 0x30 + 52;
      if (c === 0x2b) return 62;
      if (c === 0x2f) return 63;
      throw 'c:' + c;
    }

    return {
      read(): number {
        while (_buflen < 8) {
          if (_pos >= str.length) {
            if (_buflen === 0) return -1;
            throw 'unexpected end of file./' + _buflen;
          }
          const c = str.charAt(_pos);
          _pos += 1;
          if (c === '=') {
            _buflen = 0;
            return -1;
          }
          if (c.match(/^\s$/)) continue;
          _buffer = (_buffer << 6) | decode(c.charCodeAt(0));
          _buflen += 6;
        }
        const n = (_buffer >>> (_buflen - 8)) & 0xff;
        _buflen -= 8;
        return n;
      },
    };
  }

  // Build unicode map.
  const bin = base64DecodeInputStream(unicodeData);
  function readByte(): number {
    const b = bin.read();
    if (b === -1) throw 'eof';
    return b;
  }

  const unicodeMap: Record<string, number> = {};
  let count = 0;
  while (true) {
    const b0 = bin.read();
    if (b0 === -1) break;
    const b1 = readByte();
    const b2 = readByte();
    const b3 = readByte();
    const k = String.fromCharCode((b0 << 8) | b1);
    const v = (b2 << 8) | b3;
    unicodeMap[k] = v;
    count += 1;
  }

  if (count !== numChars) {
    throw count + ' != ' + numChars;
  }

  const unknownChar = '?'.charCodeAt(0);

  return function (s: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c < 128) {
        bytes.push(c);
      } else {
        const b = unicodeMap[s.charAt(i)];
        if (typeof b === 'number') {
          if ((b & 0xff) === b) {
            bytes.push(b);
          } else {
            bytes.push(b >>> 8);
            bytes.push(b & 0xff);
          }
        } else {
          bytes.push(unknownChar);
        }
      }
    }
    return bytes;
  };
}

// ─── Expose SJIS support registration helper ──────────────────────────────────

/**
 * Register a SJIS string-to-bytes function (for Kanji mode).
 * The function should return Shift-JIS encoded bytes for a given JS string.
 */
export function registerSJIS(fn: (s: string) => number[]): void {
  registerStringToBytes('SJIS', fn);
}
